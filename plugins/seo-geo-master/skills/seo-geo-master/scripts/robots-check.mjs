#!/usr/bin/env node
import path from 'node:path';
import { createFetcher, isLocalHost } from './lib/fetch.mjs';
import { parseRobots, isAllowed, policyForFetch, looksLikeHtml, ROBOTS_MAX_REDIRECTS, ALLOW_ALL, DISALLOW_ALL } from './lib/robots.mjs';
import { robotsFetchFindings } from './lib/robots-findings.mjs';
import { loadData } from './lib/data.mjs';
import { finding, findingsMarkdown, parseArgs, isMain, writeJson, writeText } from './lib/report.mjs';

const HELP = `Usage: node robots-check.mjs <site-url> [--paths /,/blog/post] [--out seo/robots]

Fetches robots.txt and says, for every search, training and user-triggered crawler in
data/crawlers.json, whether it may fetch each path, which rule decides it and what that
means. Writes robots.json and robots.md to --out. One run checks one set of paths: check pages
that should be reachable and paths that are meant to be blocked in separate runs with separate --out
folders, because a block on the second kind is the wanted result, not a finding to fix.`;

// The caller's own mistakes (a bad site, a bad path, a bad flag). The CLI reports these and exits 1;
// anything else that is thrown is a bug and keeps its stack trace. It is a TypeError for callers
// that already catch that.
export class InputError extends TypeError {
  constructor(message) { super(message); this.name = 'InputError'; }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const MAX_SIGNAL_FINDINGS = 10;

// A site is an http(s) URL. A bare host name ("example.com", "localhost:3000") is accepted and
// gets https:// (http:// for this machine and private LAN hosts, where dev servers have no TLS).
function siteUrl(site) {
  const s = String(site ?? '').trim();
  const url = HAS_SCHEME.test(s) ? s : `${isLocalHost(s.split(/[/?#]/)[0].replace(/:\d*$/, '')) ? 'http' : 'https'}://${s}`;
  let u;
  try { u = new URL(url); } catch { throw new InputError(`not a site URL: "${site}"`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new InputError(`not an http(s) site URL: "${site}"`);
  return u;
}

// A path is "/blog/post", "blog/post" or a full URL on the same origin.
function sitePath(p, origin) {
  const s = String(p ?? '').trim();
  // Git Bash on Windows turns an argument such as /blog into C:/Program Files/Git/blog before node
  // starts. A drive-letter path is never a URL path anyone asked about: refuse it, do not answer for it.
  if (/^[A-Za-z]:[\\/]/.test(s)) throw new InputError(`"${s}" looks like a Windows file path. Git Bash rewrites an argument that starts with / (such as /blog) into one: run the command with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash (blog)`);
  if (HAS_SCHEME.test(s)) {
    let u;
    try { u = new URL(s); } catch { throw new InputError(`not a URL: "${s}"`); }
    if (u.origin !== origin) throw new InputError(`"${s}" is not on ${origin}: robots.txt rules only cover their own origin`);
    return u.pathname + u.search;
  }
  return s.startsWith('/') ? s : `/${s}`;
}

// The same cut that robots.mjs applies to a group's agent: letters, '_' and '-', lower case.
const ownGroup = token => (/^[A-Za-z_-]+/.exec(token) || [token])[0].toLowerCase();

// "group googlebot" when the rules that decided come from a group that is not the crawler's own
// token (Applebot following Googlebot, or the * group); empty when the group is its own, or when
// there is no group or no robots.txt to name.
function groupNote(t, policy) {
  if (policy !== 'parse' || t.group === 'implicit') return '';
  if (t.rule === null && t.group === 'none') return '';
  return t.group === ownGroup(t.token) ? '' : `group ${t.group}`;
}

function ruleBase(t, policy) {
  if (t.rule) return `line ${t.rule.line}: ${t.rule.type} ${t.rule.pattern}`;
  if (policy === 'not-checked') return 'robots.txt not checked';
  if (policy === 'disallow-all') return 'robots.txt unavailable (treated as disallow all)';
  if (policy === 'allow-all') return 'no robots.txt (everything allowed)';
  return t.group === 'none' ? 'no group applies' : t.group === 'implicit' ? 'robots.txt itself is always fetchable' : 'no rule matches';
}

function ruleText(t, policy) {
  const g = groupNote(t, policy);
  return g ? `${ruleBase(t, policy)} (${g})` : ruleBase(t, policy);
}

// Where a training crawler's notes in data/crawlers.json say that blocking it leaves something alone.
// Only these two say so; for every other training crawler nothing is claimed about search or citations.
const NOT_AFFECTED = {
  'Google-Extended': 'Search, AI Overviews and AI Mode',
  GPTBot: 'ChatGPT search',
};
const notAffected = c => (Object.hasOwn(NOT_AFFECTED, c.token) ? NOT_AFFECTED[c.token] : null);

// honorsRobots 'no' is "generally ignores", 'may-not' (and any value that is not 'yes') "may ignore".
const ignoresText = c => (c.honorsRobots === 'no' ? 'generally ignores robots.txt' : 'may ignore robots.txt');

const OUTAGE_MEANING = 'robots.txt unavailable: Google pauses crawling; other crawlers may also stop';

// What an allowed or blocked result means for this crawler, from data/crawlers.json.
function meaningFor(c, allowed, policy) {
  if (allowed === null) return 'not checked';
  // One cause for every row; what each operator would do with an unreadable robots.txt is not known here.
  if (policy === 'disallow-all') return OUTAGE_MEANING;
  if (c.purpose === 'search') {
    // The crawler fetches, the product is what the page is fetched for: say it that way, so "Claude search results" is never the one that fetches.
    return allowed ? `this path can be fetched${c.neededForCitation ? ' and cited' : ''} for ${c.product}` : `this path cannot be fetched${c.neededForCitation ? ' or cited' : ''} for ${c.product}`;
  }
  if (c.purpose === 'training') {
    const base = allowed ? `allowed: may be used for AI training (${c.product})` : `blocked: opted out of AI training (${c.product})`;
    const x = notAffected(c);
    return x ? `${base}; does not affect ${x}` : base;
  }
  const ignores = c.honorsRobots !== 'yes';
  const base = allowed ? `${c.product}: can read this path when a user asks` : ignores ? `${c.product}: asked not to read this path` : `${c.product}: will not read this path when a user asks`;
  return ignores ? `${base}; ${ignoresText(c)}` : base;
}

const cell = s => String(s).replace(/\|/g, '\\|');

export async function checkRobots({ site, paths = ['/'], fetcher = null, crawlers = loadData('crawlers').crawlers }) {
  const { origin, hostname } = siteUrl(site);
  paths = [...new Set(paths.map(p => sitePath(p, origin)))];
  if (!paths.length) paths = ['/'];
  fetcher ??= createFetcher({ delayMs: 0, maxRedirects: ROBOTS_MAX_REDIRECTS, allowLocalOrigin: isLocalHost(hostname) ? origin : null });
  const robotsUrl = `${origin}/robots.txt`;
  const res = await fetcher.get(robotsUrl);
  const contentType = res.headers?.['content-type'] ?? null;
  const policy = policyForFetch(res);
  const isHtml = policy === 'parse' && looksLikeHtml(contentType, res.body);
  const robots = policy === 'parse' ? parseRobots(res.body) : policy === 'disallow-all' ? DISALLOW_ALL : ALLOW_ALL;
  const table = [];
  for (const c of crawlers) {
    for (const p of paths) {
      // ALLOW_ALL and DISALLOW_ALL are stand-ins: their rule and line number are not the site's.
      // With no verdict at all (not-checked) a row is neither allowed nor blocked.
      const r = policy === 'not-checked' ? { allowed: null, rule: null, group: policy } : isAllowed(robots, [c.token, ...(c.alsoMatches || [])], p);
      table.push({ token: c.token, operator: c.operator, product: c.product, purpose: c.purpose, path: p, allowed: r.allowed, rule: policy === 'parse' ? r.rule : null, group: policy === 'parse' ? r.group : policy, meaning: meaningFor(c, r.allowed, policy), honorsRobots: c.honorsRobots });
    }
  }
  const rulesRead = robots.groups.some(g => g.rules.length) || robots.sitemaps.length > 0;
  const htmlNoRules = isHtml && !rulesRead;
  const F = robotsFetchFindings({ url: robotsUrl, policy, status: res.status, error: res.error, hops: res.chain?.length, contentType, isHtml, rulesRead });
  // Without a readable robots.txt every crawler is "blocked" for one reason, which ROBOTS_UNAVAILABLE
  // already states. Per-crawler findings would cite a rule the site does not have.
  if (policy === 'parse') for (const c of crawlers) {
    const rows = table.filter(r => r.token === c.token && r.allowed === false);
    if (!rows.length) continue;
    const where = rows.map(r => r.path).join(', ');
    const g = groupNote(rows[0], policy);
    const rule = g ? `${ruleBase(rows[0], policy)}, ${g}` : ruleBase(rows[0], policy);
    const ev = { urls: [robotsUrl], token: c.token };
    if (c.token === 'Googlebot' || c.token === 'Bingbot') F.push(finding('CORE_SEARCH_BLOCKED', 'critical', 'D', `${c.token} is blocked on ${where} (${rule}): those pages cannot appear in ${c.product}`, ev));
    else if (c.purpose === 'search') F.push(finding('SEARCH_CRAWLER_BLOCKED', 'high', 'D', `${c.token} is blocked on ${where} (${rule}): pages there cannot be fetched${c.neededForCitation ? ' or cited' : ''} for ${c.product}`, ev));
    else if (c.purpose === 'training') F.push(finding('TRAINING_CRAWLER_BLOCKED', 'info', 'D', `${c.token} is blocked on ${where}: a training opt-out (${c.product})${notAffected(c) ? `; it does not affect ${notAffected(c)}` : ''}`, ev));
    else if (c.honorsRobots !== 'yes') F.push(finding('USER_FETCHER_BLOCKED', 'info', 'D', `${c.token} is blocked on ${where}, but ${c.operator} says this fetcher ${ignoresText(c)}`, ev));
    else F.push(finding('USER_FETCHER_BLOCKED', 'low', 'D', `${c.token} is blocked on ${where} (${rule}): ${c.product} will not read those pages when a user asks about them`, ev));
  }
  for (const op of new Set(crawlers.map(c => c.operator))) {
    const mine = crawlers.filter(c => c.operator === op);
    const searchBlocked = mine.some(c => c.purpose === 'search' && table.some(r => r.token === c.token && r.allowed === false));
    const trainingOpen = mine.some(c => c.purpose === 'training' && table.filter(r => r.token === c.token).every(r => r.allowed === true));
    if (searchBlocked && trainingOpen && policy === 'parse') {
      F.push(finding('SEARCH_BLOCKED_TRAINING_ALLOWED', 'high', 'D', `${op}: the search crawler is blocked while the training crawler is allowed. That is usually the reverse of what the owner wants: the site can feed training but cannot be cited in ${op}'s search`, { urls: [robotsUrl], operator: op }));
    }
  }
  if (robots.cloudflareManaged) F.push(finding('CLOUDFLARE_MANAGED', 'info', 'D', 'robots.txt contains Cloudflare managed rules. In Cloudflare AI Crawl Control use "Disallow AI Training", not "Block": since 2026-09-15 "Block" also blocks Googlebot, Bingbot and Applebot', { urls: [robotsUrl] }));
  // A Content-Signal line is often repeated once per group, so the same line is listed once and the
  // list is capped: a note says how many different lines were left out.
  const signals = [...new Set(robots.contentSignals.map(s => `Content-Signal for ${s.agents.join(', ')}: ${Object.entries(s.values).map(([k, v]) => `${k}=${v}`).join(', ')} (a stated preference, not an access rule)`))];
  for (const m of signals.slice(0, MAX_SIGNAL_FINDINGS)) F.push(finding('CONTENT_SIGNAL', 'info', 'D', m, { urls: [robotsUrl] }));
  if (signals.length > MAX_SIGNAL_FINDINGS) {
    const omitted = signals.length - MAX_SIGNAL_FINDINGS;
    F.push(finding('CONTENT_SIGNAL', 'info', 'D', `${omitted} more different Content-Signal line${omitted === 1 ? '' : 's'} not listed here (the first ${MAX_SIGNAL_FINDINGS} are shown; see robots.txt)`, { urls: [robotsUrl], omitted }));
  }
  if (policy === 'parse' && !htmlNoRules && !robots.sitemaps.length) F.push(finding('NO_SITEMAP_LINE', 'info', 'D', 'robots.txt has no Sitemap line (optional; it helps every crawler find the sitemap)', { urls: [robotsUrl] }));
  return { robotsUrl, status: res.status, contentType, error: res.error, policy, sitemaps: robots.sitemaps, contentSignals: robots.contentSignals, cloudflareManaged: robots.cloudflareManaged, table, findings: F };
}

export function robotsMarkdown(r) {
  const ignoring = [...new Set(r.table.filter(t => t.honorsRobots !== 'yes').map(t => t.token))];
  const notes = [`robots.txt: ${r.robotsUrl} (${r.error ? r.error : `HTTP ${r.status}`}, policy ${r.policy})`];
  if (ignoring.length) notes.push(`Some fetchers may ignore robots.txt (${ignoring.join(', ')}): a block for them is a request, not a guarantee.`);
  let md = findingsMarkdown('robots.txt and crawler access', r.findings, notes);
  md += '\n| Crawler | Operator | Purpose | Path | Access | Deciding rule | What it means |\n| --- | --- | --- | --- | --- | --- | --- |\n';
  for (const t of r.table) md += `| ${t.token} | ${t.operator} | ${t.purpose} | ${cell(t.path)} | ${t.allowed === null ? 'not checked' : t.allowed ? 'allowed' : 'blocked'} | ${cell(ruleText(t, r.policy))} | ${cell(t.meaning)} |\n`;
  return md;
}

const CLI_OPTIONS = ['paths', 'out', 'help'];

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const fail = (message, code = 1) => { console.error(message); process.exit(code); };
  if (args.help) { console.log(HELP); process.exit(0); }
  // A flag that is not in this list is a typo (--pahts would otherwise be dropped and only "/" checked), so it is a usage error.
  const unknown = Object.keys(args).filter(k => k !== '_' && !CLI_OPTIONS.includes(k));
  if (unknown.length) fail(`Unknown option --${unknown[0]}. Options: ${CLI_OPTIONS.map(o => `--${o}`).join(', ')}. Run with --help for usage.`);
  if (!args._[0]) { console.log(HELP); process.exit(1); }
  if (args.out !== undefined && (typeof args.out !== 'string' || !args.out.trim())) fail('--out needs a value: a folder such as --out seo/robots');
  const out = args.out ?? 'seo/robots';
  let r;
  try {
    let paths = ['/'];
    if (args.paths !== undefined) {
      // A bare "--paths" is parsed as true, "--paths=" as an empty string: neither names a path.
      paths = typeof args.paths === 'string' ? args.paths.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (!paths.length) throw new InputError('--paths needs a value: a comma-separated list such as --paths blog,blog/post (in Git Bash a leading / is rewritten into a file path: write the path without it, or run with MSYS_NO_PATHCONV=1)');
    }
    r = await checkRobots({ site: args._[0], paths });
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
  try {
    writeJson(path.join(out, 'robots.json'), r);
    writeText(path.join(out, 'robots.md'), robotsMarkdown(r));
  } catch (e) {
    fail(`Could not write the report to ${out}: ${String(e && e.message).slice(0, 150)}`, 2);
  }
  console.log(`${r.findings.length} findings. Wrote ${path.join(out, 'robots.md')}`);
}
