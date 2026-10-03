import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRobots, robotsMarkdown, InputError } from './robots-check.mjs';

let server; let origin; let mode = 'mistake'; let hops = 0;
const BODIES = {
  mistake: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: Claude-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: /sitemap.xml\n',
  core: 'User-agent: *\nDisallow: /\n',
  html: '<!doctype html><html><head><title>App</title></head><body>Hello</body></html>',
  'html-rules': 'User-agent: GPTBot\nDisallow: /\n',
  cloudflare: '# BEGIN Cloudflare Managed content\nUser-Agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n# END Cloudflare Managed Content\nUser-agent: GPTBot\nDisallow: /\n',
};
before(async () => {
  server = http.createServer((req, res) => {
    if (mode === 'loop' && (req.url === '/robots.txt' || req.url === '/loop-b')) { res.writeHead(302, { location: req.url === '/robots.txt' ? '/loop-b' : '/robots.txt' }); return res.end(); }
    if (mode === 'chain') {
      const hop = req.url === '/robots.txt' ? 0 : /^\/hop\/(\d+)$/.exec(req.url)?.[1];
      if (hop !== undefined) {
        if (Number(hop) < hops) { res.writeHead(301, { location: `/hop/${Number(hop) + 1}` }); return res.end(); }
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end(BODIES.mistake);
      }
    }
    if (req.url !== '/robots.txt') { res.writeHead(404); return res.end(); }
    if (mode === 'down') { res.writeHead(503); return res.end(); }
    if (mode === 'missing') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mode === 'html' || mode === 'html-rules' ? 'text/html; charset=utf-8' : 'text/plain' });
    res.end(BODIES[mode === 'html-as-text' ? 'html' : mode]);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const codes = r => r.findings.map(f => f.code);

test('flags search crawlers blocked while training crawlers are allowed', async () => {
  mode = 'mistake';
  const r = await checkRobots({ site: origin + '/', paths: ['/', '/products/oak'] });
  assert.equal(r.policy, 'parse');
  const blocked = r.findings.filter(f => f.code === 'SEARCH_CRAWLER_BLOCKED').map(f => f.evidence.token).sort();
  assert.deepEqual(blocked, ['Claude-SearchBot', 'OAI-SearchBot']);
  const ops = r.findings.filter(f => f.code === 'SEARCH_BLOCKED_TRAINING_ALLOWED').map(f => f.evidence.operator).sort();
  assert.deepEqual(ops, ['Anthropic', 'OpenAI']);
  assert.ok(!codes(r).includes('CORE_SEARCH_BLOCKED'));
  assert.equal(r.table.find(t => t.token === 'GPTBot' && t.path === '/').allowed, true);
  assert.equal(r.table.find(t => t.token === 'OAI-SearchBot' && t.path === '/').rule.line, 2);
  assert.ok(!codes(r).includes('NO_SITEMAP_LINE'));
  assert.match(robotsMarkdown(r), /\| OAI-SearchBot \| OpenAI \| search \| \/ \| blocked \|/);
});

test('Googlebot or Bingbot blocked is critical', async () => {
  mode = 'core';
  const r = await checkRobots({ site: origin });
  const core = r.findings.filter(f => f.code === 'CORE_SEARCH_BLOCKED').map(f => f.evidence.token).sort();
  assert.deepEqual(core, ['Bingbot', 'Googlebot']);
  assert.ok(codes(r).includes('NO_SITEMAP_LINE'));
});

test('server errors mean disallow all; 404 means allow all', async () => {
  mode = 'down';
  const down = await checkRobots({ site: origin });
  assert.equal(down.policy, 'disallow-all');
  assert.equal(down.findings.find(f => f.code === 'ROBOTS_UNAVAILABLE').severity, 'critical');
  mode = 'missing';
  const missing = await checkRobots({ site: origin });
  assert.equal(missing.policy, 'allow-all');
  assert.ok(codes(missing).includes('ROBOTS_MISSING'));
  assert.ok(!codes(missing).includes('SEARCH_CRAWLER_BLOCKED'));
});

test('Cloudflare managed rules, content signals and training opt-outs are informational', async () => {
  mode = 'cloudflare';
  const r = await checkRobots({ site: origin });
  assert.ok(codes(r).includes('CLOUDFLARE_MANAGED'));
  assert.ok(codes(r).includes('CONTENT_SIGNAL'));
  const t = r.findings.find(f => f.code === 'TRAINING_CRAWLER_BLOCKED');
  assert.equal(t.evidence.token, 'GPTBot');
  assert.equal(t.severity, 'info');
  assert.ok(!codes(r).includes('SEARCH_BLOCKED_TRAINING_ALLOWED'));
  assert.equal(t.message, `GPTBot is blocked on /: a training opt-out (OpenAI model training); it does not affect ChatGPT search`);
});

// Beyond the brief: behaviour found while reviewing the first implementation. These use a fake
// fetcher (no network, no retry wait) except where the local server is the point.
const fake = (status, body, error, headers) => ({ get: async () => ({ status, body, error, headers }) });
const SITE = 'https://example.com';

test('an unavailable robots.txt is one root-cause finding, not a rule from the site', async () => {
  for (const f of [fake(503, ''), fake(undefined, undefined, 'ENOTFOUND')]) {
    const r = await checkRobots({ site: SITE, fetcher: f });
    assert.equal(r.policy, 'disallow-all');
    assert.deepEqual(codes(r), ['ROBOTS_UNAVAILABLE']);
    assert.ok(r.table.length > 0 && r.table.every(t => t.allowed === false && t.rule === null));
    const md = robotsMarkdown(r);
    assert.match(md, /\| Googlebot \| Google \| search \| \/ \| blocked \| robots\.txt unavailable/);
    assert.doesNotMatch(md, /line \d+:/);
    // One cause for every row, not a claim about what each operator can fetch or cite.
    assert.ok(r.table.every(t => t.meaning === 'robots.txt unavailable: Google pauses crawling; other crawlers may also stop'), JSON.stringify(r.table.map(t => t.meaning)));
    assert.doesNotMatch(md, /cannot be fetched|or cited/);
  }
  const err = await checkRobots({ site: SITE, fetcher: fake(undefined, undefined, 'ENOTFOUND') });
  assert.match(err.findings[0].message, /ENOTFOUND/);
  const none = await checkRobots({ site: SITE, fetcher: fake(404, '') });
  assert.match(robotsMarkdown(none), /\| Googlebot \| Google \| search \| \/ \| allowed \| no robots\.txt/);
});

test('the site may be a bare host name, and a bad site is a clear TypeError', async () => {
  mode = 'mistake';
  const local = await checkRobots({ site: origin.replace('http://', '') });
  assert.equal(local.robotsUrl, `${origin}/robots.txt`);
  assert.equal(local.policy, 'parse');
  const bare = await checkRobots({ site: 'example.com/some/page', fetcher: fake(404, '') });
  assert.equal(bare.robotsUrl, 'https://example.com/robots.txt');
  const port = await checkRobots({ site: 'example.com:8443', fetcher: fake(404, '') });
  assert.equal(port.robotsUrl, 'https://example.com:8443/robots.txt');
  for (const bad of ['', '   ', 'http://', 'ftp://example.com', 'file:///etc/passwd']) {
    await assert.rejects(checkRobots({ site: bad, fetcher: fake(404, '') }), TypeError, bad);
  }
});

test('paths may omit the leading slash or be full URLs of the same site', async () => {
  const robots = 'User-agent: *\nDisallow: /blog\n\nSitemap: /s.xml\n';
  const r = await checkRobots({ site: SITE, paths: ['blog/post', 'https://example.com/blog?x=1', '/shop', ''], fetcher: fake(200, robots) });
  const g = r.table.filter(t => t.token === 'Googlebot').map(t => [t.path, t.allowed]);
  assert.deepEqual(g, [['/blog/post', false], ['/blog?x=1', false], ['/shop', true], ['/', true]]);
  await assert.rejects(checkRobots({ site: SITE, paths: ['https://other.example/x'], fetcher: fake(200, robots) }), TypeError);
  const empty = await checkRobots({ site: SITE, paths: [], fetcher: fake(200, robots) });
  assert.ok(empty.table.some(t => t.path === '/'));
});

test('a pipe in a robots.txt pattern does not break the markdown table', async () => {
  const r = await checkRobots({ site: SITE, paths: ['/a|b'], fetcher: fake(200, 'User-agent: Googlebot\nDisallow: /a|b\n\nSitemap: /s.xml\n') });
  const row = robotsMarkdown(r).split('\n').find(l => l.startsWith('| Googlebot |'));
  // Seven columns now (the last one is "What it means"), so the deciding rule is no longer the last cell.
  assert.ok(row.includes('| /a\\|b | blocked | line 2: disallow /a\\|b |'), row);
  assert.equal(row.replace(/\\\|/g, '').split('|').length, 9);
});

test('blocked user-triggered fetchers are reported, with the honest caveat only where it applies', async () => {
  const robots = 'User-agent: Claude-User\nDisallow: /private\n\nUser-agent: ChatGPT-User\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: /s.xml\n';
  const r = await checkRobots({ site: SITE, paths: ['/', '/private/x'], fetcher: fake(200, robots) });
  const u = r.findings.filter(f => f.code === 'USER_FETCHER_BLOCKED');
  assert.deepEqual(u.map(f => f.evidence.token).sort(), ['ChatGPT-User', 'Claude-User']);
  const claude = u.find(f => f.evidence.token === 'Claude-User');
  const chatgpt = u.find(f => f.evidence.token === 'ChatGPT-User');
  assert.doesNotMatch(claude.message, /may ignore/);
  assert.match(chatgpt.message, /may ignore robots\.txt/);
  assert.doesNotMatch(chatgpt.message, /generally/);
  assert.equal(chatgpt.severity, 'info');
  assert.equal(claude.severity, 'low');
  // honorsRobots 'no' (Perplexity-User, Google-Agent) is stronger than 'may-not' (ChatGPT-User).
  const no = await checkRobots({ site: SITE, fetcher: fake(200, 'User-agent: Perplexity-User\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: /s.xml\n') });
  const p = no.findings.find(f => f.code === 'USER_FETCHER_BLOCKED' && f.evidence.token === 'Perplexity-User');
  assert.match(p.message, /generally ignores robots\.txt/);
  assert.doesNotMatch(p.message, /may ignore/);
  assert.equal(p.severity, 'info');
});

test('the "may ignore robots.txt" note comes from the crawler data, not a fixed list', async () => {
  const note = md => md.split('\n').find(l => /may ignore robots\.txt/.test(l));
  const r = await checkRobots({ site: SITE, fetcher: fake(404, '') });
  const line = note(robotsMarkdown(r));
  for (const t of ['ChatGPT-User', 'Perplexity-User', 'Meta-ExternalFetcher', 'Google-Agent']) assert.ok(line.includes(t), t);
  assert.ok(!line.includes('Claude-User'));
  const custom = [
    { token: 'Foo-Bot', operator: 'Acme', product: 'Acme search', purpose: 'search', honorsRobots: 'yes' },
    { token: 'Foo-User', operator: 'Acme', product: 'Acme assistant', purpose: 'user', honorsRobots: 'no' },
  ];
  const c = await checkRobots({ site: SITE, crawlers: custom, fetcher: fake(404, '') });
  assert.deepEqual([...new Set(c.table.map(t => t.token))], ['Foo-Bot', 'Foo-User']);
  assert.ok(note(robotsMarkdown(c)).includes('Foo-User'));
  const none = await checkRobots({ site: SITE, crawlers: custom.slice(0, 1), fetcher: fake(404, '') });
  assert.equal(note(robotsMarkdown(none)), undefined);
});

test('a path that Git Bash on Windows rewrote into a file path is refused, not answered', async () => {
  for (const p of ['C:/Program Files/Git/blog', 'C:\\Program Files\\Git\\blog']) {
    await assert.rejects(checkRobots({ site: SITE, paths: [p], fetcher: fake(404, '') }), err => err instanceof TypeError && /MSYS_NO_PATHCONV/.test(err.message), p);
  }
});

test('robots.txt itself is always fetchable, and the table says why', async () => {
  const r = await checkRobots({ site: SITE, paths: ['/robots.txt'], fetcher: fake(200, 'User-agent: *\nDisallow: /\n\nSitemap: /s.xml\n') });
  assert.ok(r.table.every(t => t.allowed));
  assert.match(robotsMarkdown(r), /\| Googlebot \| Google \| search \| \/robots\.txt \| allowed \| robots\.txt itself is always fetchable \|/);
});

test('the CLI writes robots.json and robots.md, exits 0 with findings and 1 on bad input', async () => {
  mode = 'mistake';
  const script = fileURLToPath(new URL('./robots-check.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-check-'));
  try {
    const ok = await run([origin, '--paths', 'products/oak', '--out', dir]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /^\d+ findings\. Wrote /);
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'robots.json'), 'utf8'));
    assert.equal(json.policy, 'parse');
    assert.ok(json.findings.some(f => f.code === 'SEARCH_BLOCKED_TRAINING_ALLOWED'));
    assert.ok(json.table.every(t => t.path === '/products/oak'));
    assert.match(fs.readFileSync(path.join(dir, 'robots.md'), 'utf8'), /\| OAI-SearchBot \| OpenAI \| search \| \/products\/oak \| blocked \|/);
    const bad = await run(['ftp://example.com', '--out', dir]);
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /not an http\(s\) site URL/);
    assert.equal((await run([])).code, 1);
    assert.equal((await run(['--help'])).code, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Fix 1: review findings (redirects, HTML answers, "what it means", tool-side failures, Content-Signal, CLI).
const msg = (r, code) => r.findings.find(f => f.code === code)?.message;

test('a redirect loop, a chain past 5 hops or an invalid redirect never reaches a robots.txt: allow all, ROBOTS_MISSING', async () => {
  mode = 'loop';
  const loop = await checkRobots({ site: origin });
  mode = 'chain'; hops = 6;
  const long = await checkRobots({ site: origin });
  const invalid = await checkRobots({ site: SITE, fetcher: fake(undefined, undefined, 'invalid-redirect') });
  assert.deepEqual([loop.error, long.error, invalid.error], ['redirect-loop', 'too-many-redirects', 'invalid-redirect']);
  for (const r of [loop, long, invalid]) {
    assert.equal(r.policy, 'allow-all');
    assert.deepEqual(codes(r), ['ROBOTS_MISSING']);
    assert.match(msg(r, 'ROBOTS_MISSING'), /redirects never reached a robots\.txt/);
    assert.match(msg(r, 'ROBOTS_MISSING'), /treat it as no rules/);
    assert.ok(r.table.length > 0 && r.table.every(t => t.allowed === true && t.rule === null));
  }
});

test('five redirects are followed, like Google; the sixth is one too many', async () => {
  mode = 'chain'; hops = 5;
  const five = await checkRobots({ site: origin });
  assert.equal(five.policy, 'parse');
  assert.equal(five.error, null);
  assert.ok(codes(five).includes('SEARCH_CRAWLER_BLOCKED'));
  hops = 6;
  const six = await checkRobots({ site: origin });
  assert.equal(six.policy, 'allow-all');
  assert.equal(six.error, 'too-many-redirects');
});

test('an HTML page answering /robots.txt is not a robots.txt (content type or first bytes)', async () => {
  mode = 'html';
  const real = await checkRobots({ site: origin });
  mode = 'html-as-text';
  const plain = await checkRobots({ site: origin });
  const bom = await checkRobots({ site: SITE, fetcher: fake(200, '\uFEFF \r\n\t<!DOCTYPE html><html></html>', undefined, { 'content-type': 'text/plain' }) });
  const upper = await checkRobots({ site: SITE, fetcher: fake(200, '<HTML><BODY>x</BODY></HTML>') });
  const head = await checkRobots({ site: SITE, fetcher: fake(200, '\n<head><title>x</title></head>', undefined, {}) });
  const typeOnly = await checkRobots({ site: SITE, fetcher: fake(200, 'Hello', undefined, { 'content-type': 'Text/HTML; charset=UTF-8' }) });
  for (const r of [real, plain, bom, upper, head, typeOnly]) {
    const f = r.findings.find(x => x.code === 'ROBOTS_IS_HTML');
    assert.ok(f, JSON.stringify(codes(r)));
    assert.equal(f.severity, 'medium');
    assert.equal(f.label, 'D');
    assert.match(f.message, /returned an HTML page instead of a robots\.txt, so crawlers read it as no rules; any blocking the owner intended is not in effect/);
    assert.ok(!codes(r).includes('NO_SITEMAP_LINE'));
    assert.ok(r.table.every(t => t.allowed === true));
  }
  assert.match(real.contentType, /^text\/html/);
  assert.equal(plain.contentType, 'text/plain');
  assert.equal(typeOnly.contentType, 'Text/HTML; charset=UTF-8');
  assert.equal(bom.contentType, 'text/plain');
  assert.equal(upper.contentType, null);
});

test('real rules served with an HTML content type are shown and flagged for what they are, not as "no rules"', async () => {
  mode = 'html-rules';
  const r = await checkRobots({ site: origin });
  assert.match(r.contentType, /^text\/html/);
  const f = r.findings.find(x => x.code === 'ROBOTS_IS_HTML');
  assert.ok(f, JSON.stringify(codes(r)));
  assert.equal(f.severity, 'low');
  assert.equal(f.label, 'D');
  assert.equal(f.message, `${origin}/robots.txt is served with an HTML content type; the rules below were read and are shown, but serve it as text/plain so every crawler reads it the same way`);
  assert.doesNotMatch(f.message, /no rules|not in effect/);
  // The rules are in effect and listed: the block, the table row, and the missing Sitemap line.
  const t = r.findings.find(x => x.code === 'TRAINING_CRAWLER_BLOCKED');
  assert.equal(t.evidence.token, 'GPTBot');
  assert.equal(r.table.find(x => x.token === 'GPTBot').allowed, false);
  assert.ok(codes(r).includes('NO_SITEMAP_LINE'));
  assert.match(robotsMarkdown(r), /\| GPTBot \| OpenAI \| training \| \/ \| blocked \| line 2: disallow \/ \|/);
  // Sitemap lines alone count as read content too, and then the Sitemap line is not missing.
  const sm = await checkRobots({ site: SITE, fetcher: fake(200, 'Sitemap: https://example.com/sitemap.xml\n', undefined, { 'content-type': 'text/html' }) });
  const smf = sm.findings.find(x => x.code === 'ROBOTS_IS_HTML');
  assert.equal(smf.severity, 'low');
  assert.match(smf.message, /served with an HTML content type; the rules below were read and are shown/);
  assert.ok(!codes(sm).includes('NO_SITEMAP_LINE'));
  // An HTML page that has no rules and no sitemaps keeps the "no rules" wording (case a).
  mode = 'html';
  const page = await checkRobots({ site: origin });
  const pf = page.findings.find(x => x.code === 'ROBOTS_IS_HTML');
  assert.equal(pf.severity, 'medium');
  assert.match(pf.message, /so crawlers read it as no rules; any blocking the owner intended is not in effect/);
  assert.ok(!codes(page).includes('NO_SITEMAP_LINE'));
  // Rules found in a body that starts with HTML markup but is served as text/plain: still not "no rules",
  // and the message does not claim an HTML content type.
  const hybrid = await checkRobots({ site: SITE, fetcher: fake(200, '<html>\nUser-agent: GPTBot\nDisallow: /\n', undefined, { 'content-type': 'text/plain' }) });
  const hf = hybrid.findings.find(x => x.code === 'ROBOTS_IS_HTML');
  assert.equal(hf.severity, 'low');
  assert.match(hf.message, /starts with HTML markup/);
  assert.doesNotMatch(hf.message, /HTML content type|no rules|not in effect/);
  assert.match(hf.message, /the rules below were read and are shown, but remove the HTML markup so every crawler reads it the same way/);
  assert.doesNotMatch(hf.message, /serve it as text\/plain/);
  assert.equal(hybrid.table.find(x => x.token === 'GPTBot').allowed, false);
});

test('a normal robots.txt, or text that merely mentions html, is not flagged as HTML', async () => {
  mode = 'core';
  const r = await checkRobots({ site: origin });
  assert.equal(r.contentType, 'text/plain');
  assert.ok(!codes(r).includes('ROBOTS_IS_HTML'));
  assert.ok(codes(r).includes('NO_SITEMAP_LINE'));
  for (const body of ['# the html and head files\nUser-agent: *\nDisallow: /head\n', '<headline>\nUser-agent: *\nAllow: /\n']) {
    const x = await checkRobots({ site: SITE, fetcher: fake(200, body, undefined, { 'content-type': 'text/plain; charset=utf-8' }) });
    assert.ok(!codes(x).includes('ROBOTS_IS_HTML'), body);
  }
});

test('a blocked training crawler says it does not affect something only where the crawler data says so', async () => {
  const robots = 'User-agent: Google-Extended\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nSitemap: /s.xml\n';
  const r = await checkRobots({ site: SITE, fetcher: fake(200, robots) });
  const msg = tok => r.findings.find(f => f.code === 'TRAINING_CRAWLER_BLOCKED' && f.evidence.token === tok).message;
  assert.equal(msg('Google-Extended'), 'Google-Extended is blocked on /: a training opt-out (Gemini training and grounding); it does not affect Search, AI Overviews and AI Mode');
  assert.equal(msg('GPTBot'), 'GPTBot is blocked on /: a training opt-out (OpenAI model training); it does not affect ChatGPT search');
  assert.equal(msg('ClaudeBot'), 'ClaudeBot is blocked on /: a training opt-out (Anthropic model training)');
  assert.equal(msg('CCBot'), 'CCBot is blocked on /: a training opt-out (Common Crawl open corpus)');
  assert.ok(r.findings.filter(f => f.code === 'TRAINING_CRAWLER_BLOCKED').every(f => !/citation/i.test(f.message)));
  const row = tok => r.table.find(t => t.token === tok).meaning;
  assert.equal(row('Google-Extended'), 'blocked: opted out of AI training (Gemini training and grounding); does not affect Search, AI Overviews and AI Mode');
  assert.equal(row('ClaudeBot'), 'blocked: opted out of AI training (Anthropic model training)');
});

test('every table row says what the result means, built from the crawler data', async () => {
  const robots = 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: ChatGPT-User\nDisallow: /\n\nUser-agent: Claude-User\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: /s.xml\n';
  const r = await checkRobots({ site: SITE, fetcher: fake(200, robots) });
  const m = tok => r.table.find(t => t.token === tok).meaning;
  assert.equal(m('Googlebot'), 'this path can be fetched and cited for Google Search, AI Overviews and AI Mode');
  assert.equal(m('OAI-SearchBot'), 'this path cannot be fetched or cited for ChatGPT search');
  assert.equal(m('PerplexityBot'), 'this path can be fetched and cited for Perplexity search');
  // Training: what the opt-in or opt-out is, and "does not affect" only where crawlers.json notes say so.
  assert.equal(m('GPTBot'), 'blocked: opted out of AI training (OpenAI model training); does not affect ChatGPT search');
  assert.equal(m('ClaudeBot'), 'allowed: may be used for AI training (Anthropic model training)');
  assert.equal(m('Google-Extended'), 'allowed: may be used for AI training (Gemini training and grounding); does not affect Search, AI Overviews and AI Mode');
  assert.equal(m('CCBot'), 'allowed: may be used for AI training (Common Crawl open corpus)');
  for (const t of ['ClaudeBot', 'CCBot', 'Applebot-Extended', 'Meta-ExternalAgent']) assert.doesNotMatch(m(t), /cit|search|affect/i, t);
  assert.match(m('ChatGPT-User'), /may ignore robots\.txt/);
  assert.doesNotMatch(m('ChatGPT-User'), /generally/);
  assert.match(m('Perplexity-User'), /generally ignores robots\.txt/);
  assert.match(m('Google-Agent'), /generally ignores robots\.txt/);
  assert.doesNotMatch(m('Perplexity-User'), /may ignore/);
  assert.doesNotMatch(m('Claude-User'), /ignore/);
  assert.match(m('Claude-User'), /^Claude user-initiated fetches: will not read this path/);
  const md = robotsMarkdown(r);
  assert.match(md, /\| Crawler \| Operator \| Purpose \| Path \| Access \| Deciding rule \| What it means \|\n\| --- \| --- \| --- \| --- \| --- \| --- \| --- \|\n/);
  assert.match(md, /\| OAI-SearchBot \| OpenAI \| search \| \/ \| blocked \| line 2: disallow \/ \| this path cannot be fetched or cited for ChatGPT search \|/);
  assert.match(md, /\| Googlebot \| Google \| search \| \/ \| allowed \| line 14: allow \/ \(group \*\) \| this path can be fetched and cited for Google Search, AI Overviews and AI Mode \|/);
  // A search crawler the data does not mark as needed for citation is not said to cite.
  const custom = [{ token: 'Foo-Bot', operator: 'Acme', product: 'Acme search', purpose: 'search', honorsRobots: 'yes', neededForCitation: false }];
  const c = await checkRobots({ site: SITE, crawlers: custom, fetcher: fake(200, 'User-agent: *\nDisallow: /\n\nSitemap: /s.xml\n') });
  assert.equal(c.table[0].meaning, 'this path cannot be fetched for Acme search');
});

test('the deciding-rule column names the group when it is not the crawler own', async () => {
  const r = await checkRobots({ site: SITE, fetcher: fake(200, 'User-agent: Googlebot\nDisallow: /\n\nSitemap: /s.xml\n') });
  const row = tok => robotsMarkdown(r).split('\n').find(l => l.startsWith(`| ${tok} |`));
  assert.match(row('Applebot'), /\| blocked \| line 2: disallow \/ \(group googlebot\) \|/);
  assert.match(row('Googlebot'), /\| blocked \| line 2: disallow \/ \|/);
  assert.doesNotMatch(row('Googlebot'), /group/);
  assert.match(row('GPTBot'), /\| allowed \| no group applies \|/);
  assert.match(r.findings.find(f => f.code === 'SEARCH_CRAWLER_BLOCKED' && f.evidence.token === 'Applebot').message, /line 2: disallow \/, group googlebot/);
  const star = await checkRobots({ site: SITE, fetcher: fake(200, 'User-agent: *\nDisallow: /private\n\nSitemap: /s.xml\n') });
  const g = star.table.find(t => t.token === 'Googlebot');
  assert.equal(g.group, '*');
  assert.match(robotsMarkdown(star).split('\n').find(l => l.startsWith('| Googlebot |')), /\| allowed \| no rule matches \(group \*\) \|/);
});

test('a failure of this tool is "not checked", not a site outage', async () => {
  for (const error of ['blocked-private-address', 'invalid-url', 'unsupported-protocol', 'unsupported-content-encoding']) {
    const r = await checkRobots({ site: SITE, fetcher: fake(undefined, undefined, error) });
    assert.equal(r.policy, 'not-checked', error);
    assert.deepEqual(codes(r), ['ROBOTS_NOT_CHECKED'], error);
    const f = r.findings[0];
    assert.equal(f.severity, 'high');
    assert.equal(f.label, 'D');
    assert.ok(f.message.includes(error), f.message);
    assert.match(f.message, /nothing could be concluded/);
    assert.ok(r.table.length > 0 && r.table.every(t => t.allowed === null && t.rule === null && t.meaning === 'not checked'));
    const md = robotsMarkdown(r);
    assert.match(md, /\| Googlebot \| Google \| search \| \/ \| not checked \| .* \| not checked \|/);
    assert.doesNotMatch(md, /\| (allowed|blocked) \|/);
  }
  // A real address that this tool refuses (cloud metadata): no network is touched.
  const meta = await checkRobots({ site: 'http://169.254.169.254' });
  assert.equal(meta.policy, 'not-checked');
  assert.equal(meta.error, 'blocked-private-address');
  assert.deepEqual(codes(meta), ['ROBOTS_NOT_CHECKED']);
});

test('network failures stay a critical ROBOTS_UNAVAILABLE', async () => {
  for (const error of ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'incomplete-body']) {
    const r = await checkRobots({ site: SITE, fetcher: fake(undefined, undefined, error) });
    assert.equal(r.policy, 'disallow-all', error);
    assert.deepEqual(codes(r), ['ROBOTS_UNAVAILABLE'], error);
    assert.equal(r.findings[0].severity, 'critical');
    assert.ok(r.table.every(t => t.allowed === false));
  }
});

test('identical Content-Signal lines are listed once, and the list stops at 10 with a note', async () => {
  const dup = 'User-agent: *\nContent-Signal: search=yes, ai-train=no\nContent-Signal: search=yes, ai-train=no\nContent-Signal: search=yes, ai-train=no\nAllow: /\n\nSitemap: /s.xml\n';
  const d = await checkRobots({ site: SITE, fetcher: fake(200, dup) });
  assert.equal(d.findings.filter(f => f.code === 'CONTENT_SIGNAL').length, 1);
  const many = 'User-agent: *\n' + Array.from({ length: 14 }, (_, i) => `Content-Signal: search=yes, x${i}=yes\nContent-Signal: search=yes, x${i}=yes`).join('\n') + '\nAllow: /\n\nSitemap: /s.xml\n';
  const m = await checkRobots({ site: SITE, fetcher: fake(200, many) });
  const sig = m.findings.filter(f => f.code === 'CONTENT_SIGNAL');
  assert.equal(sig.length, 11);
  assert.equal(sig.filter(f => /^Content-Signal for/.test(f.message)).length, 10);
  const note = sig.find(f => !/^Content-Signal for/.test(f.message));
  assert.match(note.message, /4 more/);
  assert.equal(note.evidence.omitted, 4);
  assert.equal(m.contentSignals.length, 28);
  const ten = 'User-agent: *\n' + Array.from({ length: 10 }, (_, i) => `Content-Signal: x${i}=yes`).join('\n') + '\n\nSitemap: /s.xml\n';
  const t = await checkRobots({ site: SITE, fetcher: fake(200, ten) });
  assert.equal(t.findings.filter(f => f.code === 'CONTENT_SIGNAL').length, 10);
});

test('only the CLI input errors are InputErrors; --paths without a value is a usage error', async () => {
  for (const call of [() => checkRobots({ site: 'ftp://example.com', fetcher: fake(404, '') }), () => checkRobots({ site: SITE, paths: ['https://other.example/x'], fetcher: fake(404, '') }), () => checkRobots({ site: SITE, paths: ['http://'], fetcher: fake(404, '') })]) {
    await assert.rejects(call(), err => err instanceof InputError && err instanceof TypeError);
  }
  assert.ok(!(new TypeError('a bug') instanceof InputError));
  const script = fileURLToPath(new URL('./robots-check.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-check-'));
  try {
    mode = 'mistake';
    for (const args of [[origin, '--paths'], [origin, '--paths', '--out', dir], [origin, '--paths='], [origin, '--paths', ',']]) {
      const r = await run(args);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.stderr, /--paths needs a value/);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
      assert.equal(fs.existsSync(path.join(dir, 'robots.md')), false);
    }
    assert.equal((await run([origin, '--paths', 'a,b', '--out', dir])).code, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SEARCH_CRAWLER_BLOCKED names the crawler and the product it serves, never the product as if it fetched', async () => {
  mode = 'mistake';
  const r = await checkRobots({ site: origin + '/', paths: ['/'] });
  const text = tok => r.findings.find(f => f.code === 'SEARCH_CRAWLER_BLOCKED' && f.evidence.token === tok).message;
  assert.match(text('Claude-SearchBot'), /^Claude-SearchBot is blocked on \/ \(line 5: disallow \/\): pages there cannot be fetched or cited for Claude search results$/);
  assert.match(text('OAI-SearchBot'), /^OAI-SearchBot is blocked on \/ \(line 2: disallow \/\): pages there cannot be fetched or cited for ChatGPT search$/);
  for (const tok of ['Claude-SearchBot', 'OAI-SearchBot']) assert.doesNotMatch(text(tok), /search( results)? cannot fetch/, tok);
  // A search crawler that is not needed for citation is not said to cite.
  const custom = [{ token: 'Foo-Bot', operator: 'Acme', product: 'Acme search', purpose: 'search', honorsRobots: 'yes', neededForCitation: false }];
  const c = await checkRobots({ site: SITE, crawlers: custom, fetcher: fake(200, 'User-agent: *\nDisallow: /\n\nSitemap: /s.xml\n') });
  assert.match(c.findings.find(f => f.code === 'SEARCH_CRAWLER_BLOCKED').message, /pages there cannot be fetched for Acme search$/);
});

test('the CLI rejects an unknown option and names the options, and writes nothing', async () => {
  mode = 'mistake';
  const script = fileURLToPath(new URL('./robots-check.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-check-'));
  try {
    for (const args of [['--bogus'], ['--path', 'a,b'], ['--pahts', 'a'], ['--ignore-robots']]) {
      const r = await run([origin, ...args, '--out', dir]);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.stderr, new RegExp(`Unknown option ${args[0]}\\b`));
      assert.match(r.stderr, /--paths/);
      assert.match(r.stderr, /--help/);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
      assert.equal(fs.existsSync(path.join(dir, 'robots.md')), false, 'nothing is written for a mistyped option');
    }
    // A bare --out is not silently replaced by the default folder.
    const bare = await run([origin, '--out']);
    assert.equal(bare.code, 1);
    assert.match(bare.stderr, /--out needs a value/);
    // The real options still work, and --help is not an unknown option.
    assert.equal((await run([origin, '--paths', 'a', '--out', dir])).code, 0);
    assert.equal((await run(['--help'])).code, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the CLI cannot write --out: a plain message and exit 2, no stack trace', async () => {
  mode = 'mistake';
  const script = fileURLToPath(new URL('./robots-check.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-check-'));
  try {
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'not a folder');
    const r = await run([origin, '--out', path.join(blocker, 'robots')]);
    assert.equal(r.code, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /Could not write the report to /);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
