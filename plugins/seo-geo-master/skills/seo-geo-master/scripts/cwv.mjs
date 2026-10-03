#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isLocalHost } from './lib/fetch.mjs';
import { parseArgs, isMain, writeJson, writeText } from './lib/report.mjs';

const HELP = `Usage: node cwv.mjs <url> [--strategy mobile|desktop] [--runs 3] [--out seo/cwv]

Lab data: PageSpeed Insights API v5, median of --runs (1 to 10, default 3; works without a key at low
volume, and uses PSI_API_KEY when it is set). INP has no lab value: TBT (total blocking time) is shown
as a stand-in and is never called INP.

Field data (what real users get, and what Google uses): the CrUX API for the URL and for its origin, only
when CRUX_API_KEY is set. Without that key the report says field data was not fetched and points to
Search Console > Core Web Vitals. The keys are read from these environment variables only; they are not
printed and not written to the reports.

Thresholds at the 75th percentile: LCP 2.5 s, INP 200 ms, CLS 0.1.
Writes cwv.json and cwv.md to --out (default seo/cwv). Exit 0 when some data came back (the report says
what is missing), 1 for a usage error, 2 when nothing could be fetched or the report could not be written.
PageSpeed Insights tests from Google's servers, so it cannot reach localhost.
In Git Bash an --out that starts with / is rewritten into a Windows path: run with MSYS_NO_PATHCONV=1 in
front, or write the path without the leading slash.`;

const CLI_OPTIONS = ['strategy', 'runs', 'out', 'help'];

export const THRESHOLDS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const PSI_TIMEOUT_MS = 120000; // a Lighthouse run can take a minute
const CRUX_TIMEOUT_MS = 30000;
const MAX_RUNS = 10;
const REFUSED = new Set([400, 403, 429]); // a refusal (bad request, key or quota) is not repeated by the next run
const MIN_SECRET = 6; // a Google API key is 39 characters; replacing a shorter string would only mangle ordinary words
const MAX_MESSAGE = 200; // characters of an API's own message that are passed on

const SKIPPED = 'Field data not fetched: set CRUX_API_KEY to read real-user data from the CrUX API, or read Search Console > Core Web Vitals.';
const LAB_NOTE = 'INP has no lab value (it needs real users); tbt, total blocking time, is a lab stand-in for it, not INP.';

// The caller's own mistakes (a bad URL, a bad flag). The CLI reports these and exits 1; anything else that
// is thrown is a bug and keeps its stack trace. It is a TypeError for callers that already catch that.
export class InputError extends TypeError {
  constructor(message) { super(message); this.name = 'InputError'; }
}

// A finite number, from a number or a numeric string; anything else (blank, text, boolean, object) is null.
const asNumber = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

export function rate(metric, v) {
  if (!Object.hasOwn(THRESHOLDS, metric)) throw new TypeError(`unknown metric "${String(metric)}" (expected lcp, inp or cls)`);
  const n = asNumber(v);
  if (n === null) return 'unknown';
  const [good, poor] = THRESHOLDS[metric];
  return n <= good ? 'good' : n <= poor ? 'needs improvement' : 'poor';
}

const median = a => {
  const s = a.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// --- Keys never leave this file in a message -------------------------------------------------------
// A key goes to Google in the query string. What comes back (an API's error text, a network error that
// names the URL) can repeat it, so every message is cleaned before it is kept: the key itself, and any
// "key=" value, are replaced by [key].

const cleanKey = k => (typeof k === 'string' && k.trim() ? k.trim() : undefined);

function redact(text, key) {
  let s = String(text ?? '');
  if (typeof key === 'string' && key.length >= MIN_SECRET) for (const form of new Set([key, encodeURIComponent(key)])) s = s.split(form).join('[key]');
  return s
    .replace(/([?&;]key=)[^&\s"'<>)]*/gi, '$1[key]')
    .replace(/(x-goog-api-key["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, '$1[key]');
}

// One line, redacted, and short.
function say(text, key, max = MAX_MESSAGE) {
  const s = redact(text, key).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

// One request to a Google API. Returns { res, body } (body is null when the answer is not JSON) or
// { failure } with a message that is safe to show.
async function call(service, fetchImpl, url, init, timeoutMs, key) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { failure: `${service} did not answer within ${Math.round(timeoutMs / 1000)} s` };
    const why = e?.cause?.code || e?.cause?.message;
    return { failure: `${service} request failed: ${say(`${e?.message || e}${why ? ` (${why})` : ''}`, key)}` };
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON: said by the caller */ }
  return { res, body };
}

const httpError = (service, res, body, key) => {
  const detail = typeof body?.error?.message === 'string' ? body.error.message : '';
  return `${service} HTTP ${res.status}${detail ? `: ${say(detail, key)}` : ''}`;
};

// --- Lab data: PageSpeed Insights ------------------------------------------------------------------

export async function psiRun(url, strategy, key, fetchImpl = globalThis.fetch) {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) q.set('key', key);
  const r = await call('PageSpeed Insights', fetchImpl, `${PSI_ENDPOINT}?${q}`, {}, PSI_TIMEOUT_MS, key);
  if (r.failure) return { error: r.failure };
  if (!r.res.ok) return { error: httpError('PageSpeed Insights', r.res, r.body, key), status: r.res.status };
  const lh = r.body?.lighthouseResult;
  if (!lh || typeof lh !== 'object') return { error: 'PageSpeed Insights answered without a lighthouseResult (the answer was empty or not JSON)' };
  if (lh.runtimeError) {
    const e = lh.runtimeError;
    const code = typeof e === 'object' && (typeof e.code === 'string' || typeof e.code === 'number') ? e.code : null;
    const message = typeof e === 'object' ? e.message : e;
    return { error: `Lighthouse could not test the page${code !== null ? ` (${say(code, key)})` : ''}${typeof message === 'string' && message ? `: ${say(message, key)}` : ''}` };
  }
  const audits = lh.audits && typeof lh.audits === 'object' ? lh.audits : {};
  const out = {
    lcp: asNumber(audits['largest-contentful-paint']?.numericValue),
    cls: asNumber(audits['cumulative-layout-shift']?.numericValue),
    tbt: asNumber(audits['total-blocking-time']?.numericValue),
    score: asNumber(lh.categories?.performance?.score),
  };
  if (Object.values(out).every(v => v === null)) return { error: 'PageSpeed Insights answered with no metrics for this page' };
  return out;
}

// --- Field data: the Chrome UX Report --------------------------------------------------------------

export async function cruxQuery(body, key, fetchImpl = globalThis.fetch) {
  const r = await call('CrUX', fetchImpl, `${CRUX_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }, CRUX_TIMEOUT_MS, key);
  if (r.failure) return { error: r.failure };
  if (r.res.status === 404) return { noData: true }; // CrUX has too little real-user data for this URL or origin
  if (!r.res.ok) return { error: httpError('CrUX', r.res, r.body, key), status: r.res.status };
  if (r.body === null || typeof r.body !== 'object') return { error: 'CrUX answer could not be read (it was empty or not JSON)' };
  const m = r.body.record?.metrics && typeof r.body.record.metrics === 'object' ? r.body.record.metrics : {};
  const p75 = k => asNumber(m[k]?.percentiles?.p75); // CLS arrives as a string such as "0.12"
  const out = { lcp: p75('largest_contentful_paint'), inp: p75('interaction_to_next_paint'), cls: p75('cumulative_layout_shift') };
  // INP is often the one missing (low-traffic origins); a record with none of the three is no data.
  return Object.values(out).every(v => v === null) ? { noData: true } : out;
}

// --- The run ---------------------------------------------------------------------------------------

function checkUrl(url) {
  const shown = JSON.stringify(String(url ?? '').trim().slice(0, 100));
  let u;
  try { u = new URL(String(url ?? '').trim()); } catch { throw new InputError(`not an http(s) URL: ${shown} (write it in full, such as https://example.com/page)`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new InputError(`not an http(s) URL: ${shown}`);
  if (u.username || u.password) throw new InputError('the URL has a username or password in it; PageSpeed Insights would send them to Google. Remove them (test a page that needs no login)');
  if (isLocalHost(u.hostname)) throw new InputError(`${u.hostname} is on this machine: PageSpeed Insights tests from Google's servers and cannot reach localhost. Test a deployed or preview URL, or run Lighthouse in Chrome DevTools`);
  return u;
}

// Keys: when the option is left out they come from PSI_API_KEY and CRUX_API_KEY; an option that is
// passed (even as undefined) is used as it is, so a caller can say "no key".
export async function runCwv(opts = {}) {
  const u = checkUrl(opts.url);
  const url = u.href;
  const strategy = opts.strategy === undefined ? 'mobile' : opts.strategy;
  const runs = opts.runs === undefined ? 3 : opts.runs;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (strategy !== 'mobile' && strategy !== 'desktop') throw new InputError(`strategy must be mobile or desktop (got ${JSON.stringify(strategy)})`);
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) throw new InputError(`runs must be a whole number from 1 to ${MAX_RUNS} (got ${JSON.stringify(runs)})`);
  const psiKey = cleanKey('psiKey' in opts ? opts.psiKey : process.env.PSI_API_KEY);
  const cruxKey = cleanKey('cruxKey' in opts ? opts.cruxKey : process.env.CRUX_API_KEY);

  const tries = [];
  for (let i = 0; i < runs; i++) {
    const t = await psiRun(url, strategy, psiKey, fetchImpl);
    tries.push(t);
    if (t.error && REFUSED.has(t.status)) break; // do not hammer an API that just refused
  }
  const ok = tries.filter(t => !t.error);
  const errors = [...new Set(tries.filter(t => t.error).map(t => t.error))];
  const lab = ok.length
    ? {
      runs: ok.length, requested: runs,
      lcp: median(ok.map(t => t.lcp)), cls: median(ok.map(t => t.cls)), tbt: median(ok.map(t => t.tbt)), score: median(ok.map(t => t.score)),
      ...(errors.length ? { errors } : {}),
      note: LAB_NOTE,
    }
    : { runs: 0, requested: runs, error: errors[0] || 'no runs', note: LAB_NOTE };

  let field = { skipped: SKIPPED };
  if (cruxKey) {
    const formFactor = strategy === 'desktop' ? 'DESKTOP' : 'PHONE';
    const [byUrl, byOrigin] = await Promise.all([
      cruxQuery({ url, formFactor }, cruxKey, fetchImpl),
      cruxQuery({ origin: u.origin, formFactor }, cruxKey, fetchImpl),
    ]);
    field = { formFactor, url: byUrl, origin: byOrigin };
  }
  const rateAll = m => (m && !m.error && !m.noData ? { lcp: rate('lcp', m.lcp), inp: rate('inp', m.inp), cls: rate('cls', m.cls) } : null);
  return {
    url, strategy, lab, field,
    ratings: {
      lab: lab.runs ? { lcp: rate('lcp', lab.lcp), cls: rate('cls', lab.cls) } : null,
      fieldUrl: rateAll(field.url),
      fieldOrigin: rateAll(field.origin),
    },
  };
}

// --- The summary -----------------------------------------------------------------------------------

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmtMs = v => (num(v) === null ? null : `${Math.round(v)} ms`);
const fmtCls = v => (num(v) === null ? null : String(Number(v.toFixed(3))));
const withRating = (shown, rating) => (shown === null ? null : `${shown} (${rating || 'unknown'})`);
const sentence = s => (/[.!?]$/.test(s) ? s : `${s}.`);

export function cwvMarkdown(r) {
  const L = [`# Core Web Vitals: ${r.url} (${r.strategy})`, ''];
  L.push('Thresholds at the 75th percentile (good at or below): LCP 2.5 s, INP 200 ms, CLS 0.1.', '');
  const lab = r.lab || {};
  const rl = r.ratings?.lab || {};
  if (lab.runs) {
    const used = lab.requested && lab.runs !== lab.requested ? `${lab.runs} of ${lab.requested} runs` : `${lab.runs} run${lab.runs === 1 ? '' : 's'}`;
    L.push(`Lab data (PageSpeed Insights, a simulated ${r.strategy} load; median of ${used}):`, '', '| Metric | Value |', '| --- | --- |');
    L.push(
      `| LCP | ${withRating(fmtMs(lab.lcp), rl.lcp) ?? 'not measured'} |`,
      `| INP | no lab value: it needs real users (see the field data) |`,
      `| CLS | ${withRating(fmtCls(lab.cls), rl.cls) ?? 'not measured'} |`,
      `| TBT | ${fmtMs(lab.tbt) ?? 'not measured'} (a lab stand-in for INP, not INP) |`,
      `| Performance score | ${num(lab.score) === null ? 'not measured' : `${Math.round(lab.score * 100)} / 100`} |`,
    );
    if (Array.isArray(lab.errors) && lab.errors.length) L.push('', `${lab.requested - lab.runs} run${lab.requested - lab.runs === 1 ? '' : 's'} did not give a result: ${lab.errors.map(sentence).join(' ')}`);
  } else {
    L.push(`Lab data unavailable: ${sentence(String(lab.error || 'no runs'))}`);
  }
  L.push('');

  const field = r.field || {};
  if (field.skipped) {
    L.push(field.skipped, '', 'Without field data this report cannot say whether the page passes Core Web Vitals for real users.');
  } else {
    L.push(`Field data (what real Chrome ${field.formFactor === 'DESKTOP' ? 'desktop' : 'phone'} users get, 75th percentile over the last 28 days; this is the data Google uses):`, '');
    const parts = [['URL', field.url, r.ratings?.fieldUrl], ['origin', field.origin, r.ratings?.fieldOrigin]];
    for (const [name, m, rt] of parts) {
      if (!m) L.push(`- Field (${name}): not fetched.`);
      else if (m.noData) L.push(`- Field (${name}): not enough real-user data in CrUX.`);
      else if (m.error) L.push(`- Field (${name}): ${sentence(String(m.error))}`);
      else {
        const lcp = withRating(fmtMs(m.lcp), rt?.lcp);
        const inp = withRating(fmtMs(m.inp), rt?.inp);
        const cls = withRating(fmtCls(m.cls), rt?.cls);
        L.push(`- Field (${name}): LCP ${lcp ?? 'not reported'}, INP ${inp ?? 'not reported'}, CLS ${cls ?? 'not reported'}.`);
      }
    }
    if (parts.every(([, m]) => m && m.noData)) L.push('', 'Search Console > Core Web Vitals groups similar URLs and may have enough real-user data for the group.');
  }
  L.push('', 'Lab data is one simulated load: use it to find causes. Field data decides whether the page passes; when the two disagree, trust the field data.');
  return L.join('\n') + '\n';
}

// --- Command line ----------------------------------------------------------------------------------

// Git Bash turns an argument such as /tmp/out into C:/Program Files/Git/tmp/out before node starts.
const REWRITTEN_BY_GIT_BASH = /^[A-Za-z]:[\\/](?:Program Files(?: \(x86\))?[\\/]Git|msys(?:32|64)|cygwin(?:64)?)(?:[\\/]|$)/i;
const GIT_BASH_HINT = 'Run the command with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash';

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const fail = (message, code = 1) => { console.error(message); process.exit(code); };
  if (args.help) { console.log(HELP); process.exit(0); }
  const unknown = Object.keys(args).filter(k => k !== '_' && !CLI_OPTIONS.includes(k));
  if (unknown.length) fail(`Unknown option --${unknown[0]}. Options: ${CLI_OPTIONS.map(o => `--${o}`).join(', ')}. Run with --help for usage.`);
  if (!args._.length) { console.log(HELP); process.exit(1); }
  if (args._.length > 1) fail(`Give one URL, not ${args._.length}. Run with --help for usage.`);

  const value = (name, what) => {
    const v = args[name];
    if (v === undefined) return null;
    if (typeof v !== 'string' || !v.trim()) fail(`--${name} needs ${what}`);
    return v.trim();
  };
  const strategy = (value('strategy', 'mobile or desktop') ?? 'mobile').toLowerCase();
  if (strategy !== 'mobile' && strategy !== 'desktop') fail(`--strategy needs mobile or desktop, not "${args.strategy}"`);
  const runsRaw = value('runs', `a whole number from 1 to ${MAX_RUNS}`);
  const runs = runsRaw === null ? 3 : /^\d{1,3}$/.test(runsRaw) ? Number(runsRaw) : NaN;
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) fail(`--runs needs a whole number from 1 to ${MAX_RUNS}, not "${runsRaw}"`);
  const out = value('out', 'a folder') ?? 'seo/cwv';
  // A folder that is not there and that sits in Git's own folders is not one the user chose: Git Bash rewrote /tmp/x.
  if (REWRITTEN_BY_GIT_BASH.test(out) && !fs.existsSync(out)) fail(`--out "${out}" looks like a path that Git Bash rewrote (an argument that starts with / becomes one like it). ${GIT_BASH_HINT}.`);

  let r;
  try {
    r = await runCwv({ url: args._[0], strategy, runs, psiKey: process.env.PSI_API_KEY, cruxKey: process.env.CRUX_API_KEY });
  } catch (e) {
    if (e instanceof InputError) fail(e.message);
    throw e;
  }
  const json = path.join(out, 'cwv.json');
  const md = path.join(out, 'cwv.md');
  try {
    writeJson(json, r);
    writeText(md, cwvMarkdown(r));
  } catch (e) {
    fail(`Could not write the report to ${out}: ${say(e && e.message, undefined, 150)}`, 2);
  }
  // Something came back when the lab runs worked or a CrUX query returned numbers. No data for a URL
  // (CrUX 404) or no key is not a failure; a request that failed is.
  const answered = m => m && !m.error && !m.noData;
  if (!r.lab.runs && !answered(r.field.url) && !answered(r.field.origin)) {
    const why = r.lab.error || 'no answer';
    fail(`No Core Web Vitals data could be fetched: ${sentence(why)} The report says what failed: ${md}`, 2);
  }
  const failed = [!r.lab.runs && 'the lab runs', r.field.url?.error && 'the CrUX query for the URL', r.field.origin?.error && 'the CrUX query for the origin'].filter(Boolean);
  console.log(`${failed.length ? `Partial result (${failed.join(' and ')} failed). ` : ''}Wrote ${md}`);
}
