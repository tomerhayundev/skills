// robots.txt per RFC 9309, with Google's documented behaviour:
// groups for the same agent merge, a named group beats '*' entirely, agent match is exact and
// case-insensitive, the longest matching pattern wins and allow wins ties, '*' and '$' work,
// Sitemap and unknown lines never end a group, only the first 500 KiB counts.
const MAX_BYTES = 500 * 1024;

const KEY_ALIASES = {
  'user-agent': 'user-agent', useragent: 'user-agent', 'user agent': 'user-agent',
  allow: 'allow',
  disallow: 'disallow', dissallow: 'disallow', dissalow: 'disallow', disalow: 'disallow', diasllow: 'disallow', disallaw: 'disallow',
  sitemap: 'sitemap', 'site-map': 'sitemap',
  'content-signal': 'content-signal',
};

function agentToken(value) {
  const v = value.trim();
  if (v === '*') return '*';
  const m = v.match(/^[A-Za-z_-]+/);
  return (m ? m[0] : v).toLowerCase();
}

function parseSignals(value) {
  const out = {};
  for (const part of value.split(',')) {
    const [k, v] = part.split('=').map(s => (s || '').trim().toLowerCase());
    if (k && v) out[k] = v;
  }
  return out;
}

export function parseRobots(input) {
  let text = String(input ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) text = Buffer.from(text, 'utf8').subarray(0, MAX_BYTES).toString('utf8');
  text = text.replace(/^\uFEFF/, '');
  const cloudflareManaged = /BEGIN Cloudflare Managed/i.test(text);
  const groups = [];
  const sitemaps = [];
  const contentSignals = [];
  let current = null;
  let lastWasAgent = false;
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) return;
    const key = KEY_ALIASES[m[1].trim().toLowerCase()];
    if (!key) return;
    const value = m[2].trim();
    const lineNo = i + 1;
    if (key === 'sitemap') { if (value) sitemaps.push(value); return; }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [], line: lineNo }; groups.push(current); }
      current.agents.push(agentToken(value));
      lastWasAgent = true;
      return;
    }
    if (key === 'content-signal') {
      contentSignals.push({ agents: current ? [...current.agents] : ['*'], values: parseSignals(value), line: lineNo });
      return;
    }
    if (!current) return;
    lastWasAgent = false;
    if (value === '') return;
    const rule = { type: key, pattern: value, line: lineNo };
    compileRule(rule);
    current.rules.push(rule);
  });
  return { groups, sitemaps, contentSignals, cloudflareManaged };
}

export function normalizeForMatch(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    out += code > 0x7e || code <= 0x20 ? encodeURIComponent(ch) : ch;
  }
  return out.replace(/%[0-9a-f]{2}/gi, m => m.toUpperCase());
}

// Each rule's normalized pattern and length are computed once, at parse time, and kept in a
// WeakMap so the public rule object stays exactly { type, pattern, line }. Rules built by hand
// or cloned (not passed through parseRobots) are compiled on first use.
const compiled = new WeakMap();

function compileRule(rule) {
  let c = compiled.get(rule);
  if (!c) {
    const norm = normalizeForMatch(rule.pattern);
    c = { norm, len: norm.length };
    compiled.set(rule, c);
  }
  return c;
}

// Google's linear wildcard matcher (google/robotstxt, robots.cc, Matches). Patterns are untrusted
// input, so a regex built from them could backtrack for hours ('/*a*a*a*a*ab'). Here
// positions[0..count) holds the ascending path offsets that the pattern prefix seen so far can
// reach. '*' widens the set to every offset from the smallest one to the end of the path, a
// final '$' requires the end of the path to be in the set, and any other character keeps only
// the offsets whose next path character equals it. Cost is O(pattern length * path length).
function matchesPattern(pattern, path, positions) {
  const pathLen = path.length;
  let count = 1;
  positions[0] = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '$' && i === pattern.length - 1) return positions[count - 1] === pathLen;
    if (ch === '*') {
      count = pathLen - positions[0] + 1;
      for (let j = 1; j < count; j++) positions[j] = positions[j - 1] + 1;
    } else {
      let kept = 0;
      for (let j = 0; j < count; j++) {
        const p = positions[j];
        if (p < pathLen && path[p] === ch) positions[kept++] = p + 1;
      }
      count = kept;
      if (count === 0) return false;
    }
  }
  return true;
}

function toPath(urlOrPath) {
  if (urlOrPath.startsWith('/')) return urlOrPath;
  const u = new URL(urlOrPath);
  return u.pathname + u.search;
}

export function isAllowed(robots, tokens, urlOrPath) {
  // Same cut that agentToken applies to group agents, so a query for 'AI2Bot' looks for 'ai', like Google.
  const list = (Array.isArray(tokens) ? tokens : [tokens]).map(agentToken);
  const path = normalizeForMatch(toPath(urlOrPath));
  if (path === '/robots.txt') return { allowed: true, rule: null, group: 'implicit' };
  let rules = null;
  let group = 'none';
  for (const t of list) {
    const named = robots.groups.filter(g => g.agents.includes(t));
    if (named.length) { rules = named.flatMap(g => g.rules); group = t; break; }
  }
  if (!rules) {
    const star = robots.groups.filter(g => g.agents.includes('*'));
    if (star.length) { rules = star.flatMap(g => g.rules); group = '*'; }
  }
  if (!rules) return { allowed: true, rule: null, group };
  let best = null;
  const positions = new Int32Array(path.length + 1);
  for (const r of rules) {
    const { norm, len } = compileRule(r);
    if (!matchesPattern(norm, path, positions)) continue;
    if (!best || len > best.len || (len === best.len && r.type === 'allow' && best.rule.type === 'disallow')) best = { len, rule: r };
  }
  if (!best) return { allowed: true, rule: null, group };
  return { allowed: best.rule.type === 'allow', rule: best.rule, group };
}

// Callers resolve redirects first, so a 3xx that reaches this function means the hop limit ran
// out, which Google treats like a 404. Anything that is not an HTTP status (0, NaN, undefined,
// 1xx, a failed fetch) is never read as "everything is crawlable".
export function statusPolicy(status) {
  if (!Number.isInteger(status) || status < 200 || status > 599) return 'disallow-all';
  if (status < 300) return 'parse';
  if (status === 429 || status >= 500) return 'disallow-all';
  return 'allow-all';
}

export const ALLOW_ALL = parseRobots('');
export const DISALLOW_ALL = parseRobots('user-agent: *\ndisallow: /\n');

// Google follows up to 5 redirects for robots.txt and then treats the file as not found.
export const ROBOTS_MAX_REDIRECTS = 5;

// The redirects never led to a robots.txt: crawlers read that as "no robots.txt".
const REDIRECT_FAILURES = new Set(['redirect-loop', 'too-many-redirects', 'invalid-redirect']);

// The fetcher refused or could not read the answer. That says something about this tool, not about
// the site, so nothing is concluded.
export const NOT_CHECKED_REASONS = {
  'blocked-private-address': 'the URL, or a redirect on the way, points to a private or internal address that this tool will not connect to',
  'invalid-url': 'the URL is not valid',
  'unsupported-protocol': 'the URL, or a redirect on the way, is not http or https',
  'unsupported-content-encoding': 'the server compressed its answer in a way this tool cannot read',
};

// What a robots.txt fetch result (see lib/fetch.mjs) means for crawlers: 'parse' (read the body),
// 'allow-all', 'disallow-all' (fail closed: a network failure, 429 or 5xx pauses crawling) or
// 'not-checked' (this tool could not look, so no verdict about the site).
export function policyForFetch(res) {
  const error = res && res.error;
  if (!error) return statusPolicy(res ? res.status : undefined);
  if (REDIRECT_FAILURES.has(error)) return 'allow-all';
  if (Object.hasOwn(NOT_CHECKED_REASONS, error)) return 'not-checked';
  return 'disallow-all';
}

// An HTML page is not a robots.txt: single-page apps often answer every URL, /robots.txt included,
// with their index page.
const HTML_START = /^<(?:!doctype|html|head|body)(?![a-z0-9])/i;
export function looksLikeHtml(contentType, body) {
  if (/html/i.test(contentType || '')) return true;
  return HTML_START.test(String(body ?? '').replace(/^[\s\uFEFF]+/, ''));
}
