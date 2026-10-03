import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseRobots, isAllowed, statusPolicy, policyForFetch, looksLikeHtml, NOT_CHECKED_REASONS, ROBOTS_MAX_REDIRECTS, normalizeForMatch, ALLOW_ALL, DISALLOW_ALL } from './robots.mjs';

const allowed = (txt, ua, p) => isAllowed(parseRobots(txt), ua, p).allowed;

test("Google's precedence examples", () => {
  assert.equal(allowed('user-agent: *\nallow: /p\ndisallow: /', 'googlebot', '/page'), true);
  assert.equal(allowed('user-agent: *\nallow: /folder\ndisallow: /folder', 'googlebot', '/folder/page'), true);
  assert.equal(allowed('user-agent: *\nallow: /page\ndisallow: /*.htm', 'googlebot', '/page.htm'), false);
  assert.equal(allowed('user-agent: *\nallow: /page\ndisallow: /*.ph', 'googlebot', '/page.php5'), true);
  assert.equal(allowed('user-agent: *\nallow: /$\ndisallow: /', 'googlebot', '/'), true);
  assert.equal(allowed('user-agent: *\nallow: /$\ndisallow: /', 'googlebot', '/page.htm'), false);
});

test('RFC 9309 grouping: consecutive user-agents share a group, rules end it, empty group allows all', () => {
  const r = parseRobots('user-agent: a\ndisallow: /c\nuser-agent: b\ndisallow: /d\nuser-agent: e\nuser-agent: f\ndisallow: /g\nuser-agent: h\n');
  assert.equal(isAllowed(r, 'a', '/c').allowed, false);
  assert.equal(isAllowed(r, 'a', '/d').allowed, true);
  assert.equal(isAllowed(r, 'b', '/d').allowed, false);
  assert.equal(isAllowed(r, 'e', '/g').allowed, false);
  assert.equal(isAllowed(r, 'f', '/g').allowed, false);
  assert.equal(isAllowed(r, 'h', '/anything').allowed, true);
});

test('groups for the same agent merge; a named group beats * completely', () => {
  const txt = 'user-agent: googlebot\ndisallow: /a\nuser-agent: *\ndisallow: /\nuser-agent: googlebot\ndisallow: /b\n';
  assert.equal(allowed(txt, 'googlebot', '/a'), false);
  assert.equal(allowed(txt, 'googlebot', '/b'), false);
  assert.equal(allowed(txt, 'googlebot', '/c'), true);
  assert.equal(allowed(txt, 'otherbot', '/c'), false);
});

test('token match is exact and case-insensitive, never a prefix', () => {
  const txt = 'User-Agent: Googlebot\nDisallow: /x\nUser-agent: *\nDisallow: /y\n';
  assert.equal(allowed(txt, 'GOOGLEBOT', '/x'), false);
  assert.equal(allowed(txt, 'Googlebot-News', '/x'), true);
  assert.equal(allowed(txt, 'Googlebot-News', '/y'), false);
  assert.equal(allowed('User-agent: Googlebot/2.1\nDisallow: /z', 'googlebot', '/z'), false);
});

test('sitemap and unknown lines do not end a group; rules before the first user-agent are ignored', () => {
  assert.equal(allowed('user-agent: a\nsitemap: https://x.test/s.xml\nfoo: bar\ndisallow: /x', 'a', '/x'), false);
  assert.equal(allowed('disallow: /\nuser-agent: *\nallow: /', 'a', '/page'), true);
  assert.deepEqual(parseRobots('Sitemap: https://x.test/a.xml\nuser-agent: *\nSitemap: https://x.test/b.xml').sitemaps, ['https://x.test/a.xml', 'https://x.test/b.xml']);
});

test('wildcards and end anchors', () => {
  const txt = 'user-agent: *\ndisallow: /*.pdf$\ndisallow: /private*/\n';
  assert.equal(allowed(txt, 'x', '/a/b.pdf'), false);
  assert.equal(allowed(txt, 'x', '/a/b.pdf?x=1'), true);
  assert.equal(allowed(txt, 'x', '/private-area/doc'), false);
  assert.equal(allowed(txt, 'x', 'https://site.test/a/b.pdf'), false);
});

test('empty disallow allows everything; comments, BOM and typos are tolerated', () => {
  assert.equal(allowed('user-agent: *\ndisallow:\n', 'x', '/'), true);
  assert.equal(allowed('\uFEFFuser-agent: * # all\ndisallow: /a # no a\n', 'x', '/a'), false);
  assert.equal(allowed('useragent: *\ndissallow: /a\n', 'x', '/a'), false);
});

test('non-ASCII paths match their percent-encoded form (Hebrew)', () => {
  const txt = 'user-agent: *\ndisallow: /קטגוריה/\n';
  assert.equal(allowed(txt, 'x', 'https://site.test/%D7%A7%D7%98%D7%92%D7%95%D7%A8%D7%99%D7%94/item'), false);
  assert.equal(allowed(txt, 'x', 'https://site.test/%d7%a7%d7%98%d7%92%d7%95%d7%a8%d7%99%d7%94/item'), false);
  assert.equal(normalizeForMatch('/a%2fb'), '/a%2Fb');
});

test('fallback tokens: Applebot follows Googlebot when it has no group of its own', () => {
  const r = parseRobots('user-agent: googlebot\ndisallow: /g\nuser-agent: *\ndisallow: /\n');
  assert.equal(isAllowed(r, ['Applebot', 'Googlebot'], '/page').allowed, true);
  assert.equal(isAllowed(r, ['Applebot', 'Googlebot'], '/g').allowed, false);
  assert.equal(isAllowed(r, ['Applebot', 'Googlebot'], '/g').group, 'googlebot');
});

test('robots.txt itself is always allowed; result names the matched rule', () => {
  const r = parseRobots('user-agent: *\ndisallow: /\n');
  assert.equal(isAllowed(r, 'x', '/robots.txt').allowed, true);
  const res = isAllowed(r, 'x', '/a');
  assert.equal(res.allowed, false);
  assert.deepEqual(res.rule, { type: 'disallow', pattern: '/', line: 2 });
});

test('Content-Signal lines and Cloudflare managed markers', () => {
  const r = parseRobots('# BEGIN Cloudflare Managed content\nUser-Agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n# END Cloudflare Managed Content\n');
  assert.equal(r.cloudflareManaged, true);
  assert.deepEqual(r.contentSignals, [{ agents: ['*'], values: { search: 'yes', 'ai-train': 'no' }, line: 3 }]);
  assert.equal(isAllowed(r, 'x', '/a').allowed, true);
});

test('status policy follows RFC 9309 and Google', () => {
  assert.equal(statusPolicy(200), 'parse');
  assert.equal(statusPolicy(404), 'allow-all');
  assert.equal(statusPolicy(403), 'allow-all');
  assert.equal(statusPolicy(429), 'disallow-all');
  assert.equal(statusPolicy(503), 'disallow-all');
  assert.equal(isAllowed(ALLOW_ALL, 'x', '/a').allowed, true);
  assert.equal(isAllowed(DISALLOW_ALL, 'x', '/a').allowed, false);
});

test('only the first 500 KiB is parsed', () => {
  const filler = '#'.repeat(600 * 1024) + '\n';
  const txt = 'user-agent: *\ndisallow: /early\n' + filler + 'disallow: /late\n';
  assert.equal(allowed(txt, 'x', '/early'), false);
  assert.equal(allowed(txt, 'x', '/late'), true);
});

test('statusPolicy: a failed or non-HTTP fetch is never "everything is crawlable"', () => {
  // Callers resolve redirects first; a 3xx that reaches here means the hop limit ran out (Google: treated as 404).
  assert.equal(statusPolicy(301), 'allow-all');
  assert.equal(statusPolicy(404), 'allow-all');
  assert.equal(statusPolicy(429), 'disallow-all');
  assert.equal(statusPolicy(503), 'disallow-all');
  for (const bad of [0, NaN, undefined, null, 'x', 100, 199, 600, 200.5, Infinity]) {
    assert.equal(statusPolicy(bad), 'disallow-all', `statusPolicy(${String(bad)})`);
  }
});

// Matching is synchronous, so node:test's own timeout cannot interrupt a regex that backtracks
// for hours. The check therefore runs in a child process that spawnSync kills after 4 s,
// which turns a regression into a failure instead of a hung test run.
test('wildcard matching is linear: a pathological rule on a 2,000 character path stays fast', { timeout: 5000 }, () => {
  const child = `
    import { parseRobots, isAllowed } from ${JSON.stringify(new URL('./robots.mjs', import.meta.url).href)};
    const r = parseRobots('user-agent: *\\ndisallow: /*a*a*a*a*a*a*a*ab\\n');
    const path = '/' + 'a'.repeat(1999);
    const t0 = performance.now();
    const res = isAllowed(r, 'x', path);
    console.log(JSON.stringify({ length: path.length, allowed: res.allowed, ms: performance.now() - t0 }));
  `;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', child], { encoding: 'utf8', timeout: 4000 });
  assert.equal(out.error, undefined, `matcher did not finish within 4 s (${out.error && out.error.code})`);
  assert.equal(out.status, 0, out.stderr);
  const res = JSON.parse(out.stdout);
  assert.equal(res.length, 2000);
  assert.equal(res.allowed, true);
  assert.ok(res.ms < 200, `took ${res.ms.toFixed(1)} ms`);
});

test('the linear matcher agrees on wildcard and anchor edge cases', () => {
  const dis = (pattern, path) => !allowed(`user-agent: *\ndisallow: ${pattern}\n`, 'x', path);
  assert.equal(dis('/a*b', '/a/x/b'), true);
  assert.equal(dis('/a*b', '/ab'), true);
  assert.equal(dis('/a*b', '/a/x'), false);
  assert.equal(dis('/*', '/anything'), true);
  assert.equal(dis('/a**b', '/axb'), true);
  assert.equal(dis('/*$', '/anything'), true);
  assert.equal(dis('/a*$', '/abc'), true);
  assert.equal(dis('/a$', '/a'), true);
  assert.equal(dis('/a$', '/ab'), false);
  assert.equal(dis('/a$b', '/a$b'), true);
  assert.equal(dis('/*.php$', '/x.php?y=1'), false);
  assert.equal(dis('/aaa', '/aa'), false);
});

test('query tokens are cut like group agents: AI2Bot looks for "ai", as Google does', () => {
  const r = parseRobots('user-agent: AI2Bot\ndisallow: /x\nuser-agent: *\ndisallow: /y\n');
  const res = isAllowed(r, 'AI2Bot', '/x');
  assert.equal(res.allowed, false);
  assert.equal(res.group, 'ai');
  assert.equal(isAllowed(r, ['AI2Bot'], '/y').allowed, true);
  assert.equal(isAllowed(r, 'Googlebot-News', '/y').allowed, false);
});

test('Sitemap and Content-Signal lines between two User-agent lines keep both agents in one group', () => {
  const txt = 'user-agent: a\nsitemap: https://x.test/s.xml\ncontent-signal: search=yes\nuser-agent: b\ndisallow: /z\n';
  const r = parseRobots(txt);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].agents, ['a', 'b']);
  assert.equal(isAllowed(r, 'a', '/z').allowed, false);
  assert.equal(isAllowed(r, 'b', '/z').allowed, false);
  assert.deepEqual(r.sitemaps, ['https://x.test/s.xml']);
});

test('policyForFetch: a status is read by statusPolicy, a redirect failure is "not found", a tool failure is "not checked"', () => {
  assert.equal(policyForFetch({ status: 200, error: null }), 'parse');
  assert.equal(policyForFetch({ status: 404 }), 'allow-all');
  assert.equal(policyForFetch({ status: 403, error: null }), 'allow-all');
  assert.equal(policyForFetch({ status: 429 }), 'disallow-all');
  assert.equal(policyForFetch({ status: 503 }), 'disallow-all');
  for (const error of ['redirect-loop', 'too-many-redirects', 'invalid-redirect']) {
    assert.equal(policyForFetch({ status: null, error }), 'allow-all', error);
  }
  for (const error of ['blocked-private-address', 'invalid-url', 'unsupported-protocol', 'unsupported-content-encoding']) {
    assert.equal(policyForFetch({ status: null, error }), 'not-checked', error);
    assert.equal(typeof NOT_CHECKED_REASONS[error], 'string', error);
  }
  // Network failures, and a body cut off after a status was seen, fail closed.
  for (const error of ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'incomplete-body', 'request-failed']) {
    assert.equal(policyForFetch({ status: error === 'incomplete-body' ? 200 : null, error }), 'disallow-all', error);
  }
  // Nothing usable at all is never "everything is crawlable".
  for (const bad of [undefined, null, {}, { status: NaN }, { status: 0 }]) assert.equal(policyForFetch(bad), 'disallow-all', JSON.stringify(bad));
  assert.equal(ROBOTS_MAX_REDIRECTS, 5);
});

test('looksLikeHtml: an HTML content type or a body that starts with an HTML tag', () => {
  assert.equal(looksLikeHtml('text/html; charset=utf-8', 'User-agent: *'), true);
  assert.equal(looksLikeHtml('Text/HTML', ''), true);
  assert.equal(looksLikeHtml('text/plain', '<!DOCTYPE html><html></html>'), true);
  assert.equal(looksLikeHtml('text/plain', '\uFEFF \r\n\t<HTML><BODY>x</BODY></HTML>'), true);
  assert.equal(looksLikeHtml(null, '<head><title>x</title></head>'), true);
  assert.equal(looksLikeHtml('text/plain', 'User-agent: *\nDisallow: /head\n'), false);
  assert.equal(looksLikeHtml('text/plain', '<headline>\nUser-agent: *\n'), false);
  assert.equal(looksLikeHtml(undefined, undefined), false);
});
