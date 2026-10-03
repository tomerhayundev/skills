import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crawlSite, writeCrawl, normalizeUrl, isNoindex, loadSitemaps, analyze } from './crawl.mjs';

let server; let O;
const words = 'Solid wood tables made by hand in a small workshop with oil finishes and joinery that lasts for generations of family dinners and long conversations around the table every single evening of the year';
const page = (title, body = '', head = '', lang = 'en') => `<!doctype html><html lang="${lang}"><head><title>${title}</title><meta name="description" content="${title} description">${head}</head><body><h1>${title}</h1><p>${words}</p>${body}</body></html>`;

const ROUTES = () => ({
  '/robots.txt': [200, 'text/plain', `User-agent: *\nDisallow: /private/\nSitemap: ${O}/sitemap.xml\n`],
  '/sitemap.xml': [200, 'application/xml', `<?xml version="1.0"?><urlset>${['/', '/services', '/guides/oak-vs-walnut', '/guides/walnut-vs-oak', '/orphan', '/gone', '/old', '/products', '/app', '/en/about', '/he/about'].map(p => `<url><loc>${O}${p}</loc></url>`).join('')}</urlset>`],
  '/': [200, 'text/html', page('Home', '<a href="/products">Products</a><a href="/services">Services</a><a href="/guides/oak-vs-walnut">Oak vs walnut</a><a href="/guides/walnut-vs-oak">Walnut vs oak</a><a href="/old">Catalog</a><a href="/app">Configurator</a><a href="/missing">Missing</a><a href="/en/about">About</a><a href="/he/about">אודות</a>')],
  '/products': [200, 'text/html', page('Products', '<a href="/products/oak">Oak</a><a href="/products/walnut">Walnut</a>')],
  '/products/oak': [200, 'text/html', page('Oak table')],
  '/products/walnut': [200, 'text/html', page('Walnut table', '', `<link rel="canonical" href="${O}/products/oak">`)],
  '/services': [200, 'text/html', page('Custom design service', '', '<meta name="robots" content="noindex">')],
  '/guides/oak-vs-walnut': [200, 'text/html', page('Oak vs Walnut tables compared')],
  '/guides/walnut-vs-oak': [200, 'text/html', page('Walnut vs Oak tables compared')],
  '/orphan': [200, 'text/html', page('How to care for a wood table')],
  '/app': [200, 'text/html', '<!doctype html><html><head><title>Configurator</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>'],
  '/old': [301, null, null, '/old2'],
  '/old2': [301, null, null, '/old3'],
  '/old3': [301, null, null, '/products'],
  '/en/about': [200, 'text/html', page('About us', '', `<link rel="alternate" hreflang="en" href="${O}/en/about"><link rel="alternate" hreflang="he" href="${O}/he/about">`)],
  '/he/about': [200, 'text/html', page('אודות', '', `<link rel="alternate" hreflang="he" href="${O}/he/about">`, 'he')],
});

before(async () => {
  server = http.createServer((req, res) => {
    const r = ROUTES()[req.url];
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<title>Not found</title>'); }
    const [status, type, body, location] = r;
    if (location) { res.writeHead(status, { location }); return res.end(); }
    res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  O = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const has = (res, code, urlPart) => res.findings.some(f => f.code === code && (!urlPart || (f.evidence.urls || []).some(u => u.includes(urlPart))));

test('finds the planted indexing defects', async () => {
  const res = await crawlSite({ start: O + '/', max: 50, delayMs: 0 });
  assert.equal(res.robots.policy, 'parse');
  assert.ok(res.meta.pagesCrawled >= 14, `crawled ${res.meta.pagesCrawled}`);
  assert.ok(has(res, 'SITEMAP_URL_NOINDEX', '/services'));
  assert.ok(has(res, 'SITEMAP_URL_NOT_200', '/gone'));
  assert.ok(has(res, 'SITEMAP_URL_REDIRECTS', '/old'));
  assert.ok(has(res, 'REDIRECT_CHAIN', '/old'));
  assert.equal(res.findings.find(f => f.code === 'REDIRECT_CHAIN').evidence.hops.length, 3);
  assert.ok(res.findings.some(f => f.code === 'BROKEN_INTERNAL_LINK' && f.evidence.target.endsWith('/missing')));
  assert.ok(has(res, 'CANONICAL_POINTS_ELSEWHERE', '/products/walnut'));
  assert.ok(has(res, 'ORPHAN_PAGE', '/orphan'));
  assert.ok(!res.findings.some(f => f.code === 'ORPHAN_PAGE' && f.evidence.urls[0].endsWith('/products')));
  assert.ok(has(res, 'HREFLANG_NO_RETURN', '/en/about'));
  assert.ok(has(res, 'CONTENT_NEEDS_JS', '/app'));
  assert.ok(has(res, 'DUPLICATE_INTENT_CANDIDATE', '/guides/'));
  assert.ok(!has(res, 'TITLE_MISSING'));
  assert.ok(!has(res, 'TITLE_DUPLICATE'));
});

test('writes crawl.json, pages.csv and findings.md', async () => {
  const res = await crawlSite({ start: O + '/', max: 50, delayMs: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
  writeCrawl(dir, res);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8'));
  assert.equal(json.pages.length, res.pages.length);
  const csv = fs.readFileSync(path.join(dir, 'pages.csv'), 'utf8').split('\n');
  assert.equal(csv[0], 'url,status,finalUrl,redirects,inSitemap,noindex,canonical,title,titleLength,h1Count,words,inlinks,bytes');
  assert.match(fs.readFileSync(path.join(dir, 'findings.md'), 'utf8'), /^# Crawl findings/);
});

test('respects the page cap and says so', async () => {
  const res = await crawlSite({ start: O + '/', max: 3, delayMs: 0 });
  assert.equal(res.meta.pagesCrawled, 3);
  assert.equal(res.meta.capped, true);
});

test('normalizeUrl drops the hash and default ports', () => {
  assert.equal(normalizeUrl('https://a.test:443/x#y'), 'https://a.test/x');
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief: the interfaces of fetch.mjs and robots.mjs, hostile input, and every finding code.
// ---------------------------------------------------------------------------------------------

// A throwaway site. routes(origin) returns { '/path': [status, type, body, location, headers] | (req, res) => void }.
async function withSite(routes, fn) {
  const hits = [];
  let table = {};
  const srv = http.createServer((req, res) => {
    hits.push(req.url);
    const r = table[req.url];
    if (typeof r === 'function') return r(req, res);
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<title>Not found</title>'); }
    const [status, type, body, location, headers] = r;
    if (location) { res.writeHead(status, { location, ...headers }); return res.end(); }
    res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, ...headers });
    return res.end(body);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  table = routes(origin);
  try { return await fn(origin, hits); } finally { await new Promise(r => { srv.close(r); srv.closeAllConnections?.(); }); }
}
const sitemapXml = (o, paths) => `<?xml version="1.0"?><urlset>${paths.map(p => `<url><loc>${o}${p}</loc></url>`).join('')}</urlset>`;
const links = paths => paths.map(p => `<a href="${p}">${p}</a>`).join('');
const crawl = (o, extra = {}) => crawlSite({ start: o + '/', max: 60, delayMs: 0, ...extra });
const codesOf = res => res.findings.map(f => f.code);
const stub = map => ({ get: async url => ({ url, finalUrl: url, status: 404, headers: {}, chain: [], body: '', buffer: null, bytes: 0, truncated: false, timeMs: 1, error: null, ...(typeof map === 'function' ? map(url) : map[url]) }) });

// One site with a planted defect for every finding code that the brief's site does not cover.
const DEFECTS = o => ({
  '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /blocked/\n'],
  '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/blocked/a', '/hdr', '/sm-canon', '/reset', '/dup-a', '/dup-b'])],
  '/': [200, 'text/html', page('Home', links(['/blocked/b', '/short', '/loop', '/canon-multi', '/canon-404', '/noindex-canon', '/bare', '/two-h1', '/jsonld', '/hl-bad', '/hl-noself', '/hl-he', '/private-link']))],
  '/blocked/a': [200, 'text/html', page('Blocked A')],
  '/blocked/b': [200, 'text/html', page('Blocked B', '', '<meta name="robots" content="noindex">')],
  '/hdr': [200, 'text/html', page('Header noindex'), null, { 'x-robots-tag': 'googlebot: noindex' }],
  '/sm-canon': [200, 'text/html', page('Sitemap canonical', '', `<link rel="canonical" href="${o}/dup-a">`)],
  '/reset': (req, res) => req.socket.destroy(),
  '/dup-a': [200, 'text/html', page('Shared title')],
  '/dup-b': [200, 'text/html', page('Shared title')],
  '/short': [301, null, null, '/dup-b'],
  '/loop': [302, null, null, '/loop2'],
  '/loop2': [302, null, null, '/loop'],
  '/canon-multi': [200, 'text/html', page('Two canonicals', '', `<link rel="canonical" href="${o}/dup-a"><link rel="canonical" href="${o}/dup-b">`)],
  '/canon-404': [200, 'text/html', page('Canonical to nowhere', '', `<link rel="canonical" href="${o}/canon-gone">`)],
  '/noindex-canon': [200, 'text/html', page('Noindex and canonical', '', `<meta name="robots" content="noindex"><link rel="canonical" href="${o}/dup-a">`)],
  '/bare': [200, 'text/html', `<!doctype html><html><head></head><body><p>${words}</p><img src="/a.png"><meta name="robots" content="noarchive"></body></html>`],
  '/two-h1': [200, 'text/html', page('Two heading page', '<h1>Second heading</h1>')],
  '/jsonld': [200, 'text/html', page('Structured data page', '<script type="application/ld+json">{"a": }</script><script type="application/ld+json">{"@type":"Thing",}</script>')],
  '/hl-bad': [200, 'text/html', page('Language page', '', `<link rel="alternate" hreflang="en_US" href="${o}/hl-bad"><link rel="alternate" hreflang="iw" href="${o}/hl-he"><link rel="alternate" hreflang="fr" href="${o}/hl-gone">`)],
  '/hl-noself': [200, 'text/html', page('Language page without itself', '', `<link rel="alternate" hreflang="de" href="${o}/hl-he">`)],
  '/hl-he': [200, 'text/html', page('Hebrew language page')],
  '/private-link': [302, null, null, 'http://10.255.255.1/private'],
});

test('every other indexing finding fires on its planted defect (and only there)', async () => {
  // /blocked/ is disallowed in robots.txt: its noindex can only be read when the crawl ignores robots.txt (an owner's audit).
  const res = await withSite(DEFECTS, o => crawl(o, { ignoreRobots: true }));
  assert.equal(res.robots.policy, 'parse');
  assert.ok(has(res, 'ROBOTS_NO_SITEMAP_LINE'));
  const expect = [
    ['SITEMAP_URL_BLOCKED', '/blocked/a'], ['SITEMAP_URL_NOINDEX', '/hdr'], ['SITEMAP_URL_NOT_CANONICAL', '/sm-canon'], ['SITEMAP_URL_ERROR', '/reset'],
    ['NOINDEX_BLOCKED', '/blocked/b'], ['NOINDEX_PAGE', '/blocked/b'], ['REDIRECT_LOOP', '/loop'],
    ['CANONICAL_MULTIPLE', '/canon-multi'], ['CANONICAL_TARGET_NOT_200', '/canon-404'], ['NOINDEX_WITH_CANONICAL', '/noindex-canon'],
    ['TITLE_MISSING', '/bare'], ['DESCRIPTION_MISSING', '/bare'], ['H1_MISSING', '/bare'], ['LANG_MISSING', '/bare'], ['IMG_ALT_MISSING', '/bare'], ['ROBOTS_META_OUTSIDE_HEAD', '/bare'],
    ['H1_MULTIPLE', '/two-h1'], ['JSONLD_PARSE_ERROR', '/jsonld'], ['JSONLD_NOT_STRICT', '/jsonld'],
    ['HREFLANG_BAD_CODE', '/hl-bad'], ['HREFLANG_IW', '/hl-bad'], ['HREFLANG_TARGET_NOT_200', '/hl-bad'], ['HREFLANG_NO_RETURN', '/hl-bad'], ['HREFLANG_NO_SELF', '/hl-noself'],
    ['TITLE_DUPLICATE', '/dup-a'], ['TITLE_DUPLICATE', '/dup-b'], ['DESCRIPTION_DUPLICATE', '/dup-a'],
  ];
  for (const [code, part] of expect) assert.ok(has(res, code, part), `${code} for ${part}`);
  // Broken and redirected links name their target; the evidence urls are the pages that carry the link.
  assert.ok(res.findings.some(f => f.code === 'LINK_TO_REDIRECT' && f.evidence.target.endsWith('/short') && f.evidence.urls.length === 1 && f.evidence.urls[0].endsWith('/')));
  // A redirect loop is a loop, not a broken link; a sitemap URL that is a loop is reported once.
  assert.ok(!res.findings.some(f => f.code === 'BROKEN_INTERNAL_LINK' && f.evidence.target.endsWith('/loop')));
  assert.ok(!res.findings.some(f => f.code === 'SITEMAP_URL_ERROR' && f.evidence.urls.some(u => u.endsWith('/loop'))));
  // The self-referencing hreflang page is not told it lacks itself; a clean page raises nothing.
  assert.ok(!has(res, 'HREFLANG_NO_SELF', '/hl-bad'));
  assert.ok(!has(res, 'HREFLANG_NO_SELF', '/hl-he'));
  assert.ok(!has(res, 'TITLE_MISSING', '/two-h1'));
  // Evidence carries what a reader needs: the hops, the duplicates and the other end of a hreflang pair.
  assert.deepEqual(res.findings.find(f => f.code === 'TITLE_DUPLICATE' && f.evidence.urls.some(u => u.endsWith('/dup-a'))).evidence.urls.map(u => u.replace(/^.*(?=\/dup)/, '')).sort(), ['/dup-a', '/dup-b']);
  assert.equal(res.findings.find(f => f.code === 'REDIRECT_LOOP').severity, 'high');
  assert.ok(res.findings.every(f => ['critical', 'high', 'medium', 'low', 'info'].includes(f.severity) && (f.label === 'D' || f.label === 'H') && f.message && f.evidence));
});

test('a redirect and the page it leads to are one page: no duplicate title, and a link through the redirect is a link to the page', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a', '/b'])],
    '/': [200, 'text/html', page('Home', links(['/a-old', '/b', '/b-old']))],
    '/a': [200, 'text/html', page('Page A')],
    '/a-old': [301, null, null, '/a'],
    '/b': [200, 'text/html', page('Page B')],
    '/b-old': [301, null, null, '/b'],
  }), o => crawl(o));
  assert.ok(!codesOf(res).includes('TITLE_DUPLICATE'), JSON.stringify(res.findings.filter(f => f.code === 'TITLE_DUPLICATE')));
  assert.ok(!codesOf(res).includes('DESCRIPTION_DUPLICATE'));
  assert.equal(res.findings.filter(f => f.code === 'LINK_TO_REDIRECT').length, 2);
  // /a is linked only through /a-old: it is not an orphan. The redirect records count only links to themselves.
  assert.ok(!res.findings.some(f => f.code === 'ORPHAN_PAGE'), JSON.stringify(res.findings.filter(f => f.code === 'ORPHAN_PAGE')));
  const inl = name => res.pages.find(p => p.url.endsWith(name)).inlinks;
  assert.deepEqual([inl('/a'), inl('/a-old'), inl('/b'), inl('/b-old')], [1, 1, 1, 1]);
  // The same HTML is judged once.
  assert.equal(res.findings.filter(f => f.code === 'H1_MULTIPLE' || f.code === 'TITLE_MISSING').length, 0);
});

test('no sitemap, no robots.txt: NO_SITEMAP and ROBOTS_MISSING, and an HTML page at /sitemap.xml is not a sitemap', async () => {
  const none = await withSite(() => ({ '/': [200, 'text/html', page('Home')] }), o => crawl(o));
  assert.equal(none.robots.policy, 'allow-all');
  assert.ok(codesOf(none).includes('NO_SITEMAP'));
  assert.ok(codesOf(none).includes('ROBOTS_MISSING'));
  assert.ok(none.pages.every(p => p.googlebotAllowed === true));
  const html = await withSite(() => ({ '/': [200, 'text/html', page('Home')], '/sitemap.xml': [200, 'text/html', page('Fallback')] }), o => crawl(o));
  assert.ok(codesOf(html).includes('NO_SITEMAP'));
  assert.ok(html.sitemap.errors.some(e => e.error === 'not-a-sitemap'));
});

// robots.txt, read by lib/robots.mjs policyForFetch (Google: 5 redirects, 5xx is "disallow all", our own refusals are "not checked").
test('robots.txt this tool cannot read is "not checked": with --ignore-robots the crawl goes on and googlebotAllowed is null, and the finding says so', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [302, null, null, 'http://169.254.169.254/robots.txt'],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/blocked/a'])],
    '/': [200, 'text/html', page('Home')],
    '/blocked/a': [200, 'text/html', page('A')],
  }), o => crawl(o, { ignoreRobots: true }));
  assert.equal(res.robots.policy, 'not-checked');
  assert.equal(res.robots.error, 'blocked-private-address');
  const f = res.findings.find(x => x.code === 'ROBOTS_NOT_CHECKED');
  assert.ok(f, JSON.stringify(codesOf(res)));
  assert.equal(f.severity, 'high');
  assert.equal(f.label, 'D');
  assert.match(f.message, /blocked-private-address/);
  assert.match(f.message, /googlebotAllowed is null for every URL/);
  assert.match(f.message, /limit of this check, not a finding about the site/);
  assert.ok(res.pages.length >= 2 && res.pages.every(p => p.googlebotAllowed === null));
  assert.ok(!codesOf(res).some(c => c === 'ROBOTS_UNAVAILABLE' || c === 'SITEMAP_URL_BLOCKED' || c === 'ROBOTS_MISSING'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
  try {
    writeCrawl(dir, res);
    const md = fs.readFileSync(path.join(dir, 'findings.md'), 'utf8');
    assert.match(md, /ROBOTS_NOT_CHECKED/);
    assert.match(md, /not-checked/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('robots.txt that returns 503 is one ROBOTS_UNAVAILABLE finding, not one "blocked" finding per URL', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [503, 'text/plain', 'down'],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home', links(['/b']))],
    '/a': [200, 'text/html', page('A')],
    '/b': [200, 'text/html', page('B', '', '<meta name="robots" content="noindex">')],
  }), o => crawl(o, { ignoreRobots: true }));
  assert.equal(res.robots.policy, 'disallow-all');
  assert.equal(res.findings.filter(f => f.code === 'ROBOTS_UNAVAILABLE').length, 1);
  assert.equal(res.findings.find(f => f.code === 'ROBOTS_UNAVAILABLE').severity, 'critical');
  assert.ok(!codesOf(res).includes('SITEMAP_URL_BLOCKED'));
  assert.ok(!codesOf(res).includes('NOINDEX_BLOCKED'));
  assert.ok(res.pages.every(p => p.googlebotAllowed === false));
});

test('robots.txt: five redirects are followed, the sixth is one too many (treated as not found)', async () => {
  const chain = hops => o => {
    const t = { '/': [200, 'text/html', page('Home')], '/final.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /nothing\nSitemap: /sitemap.xml\n'], '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/'])] };
    t['/robots.txt'] = [301, null, null, hops === 1 ? '/final.txt' : '/h1'];
    for (let i = 1; i < hops; i++) t[`/h${i}`] = [301, null, null, i === hops - 1 ? '/final.txt' : `/h${i + 1}`];
    return t;
  };
  const five = await withSite(chain(5), o => crawl(o));
  assert.equal(five.robots.policy, 'parse');
  assert.equal(five.robots.error, null);
  assert.equal(five.robots.sitemaps.length, 1);
  const six = await withSite(chain(6), o => crawl(o));
  assert.equal(six.robots.policy, 'allow-all');
  assert.equal(six.robots.error, 'too-many-redirects');
  assert.ok(codesOf(six).includes('ROBOTS_MISSING'));
  assert.ok(!codesOf(six).includes('ROBOTS_UNAVAILABLE'));
  // A fetcher that was handed in follows more hops than Google would: the crawler applies the limit itself.
  const injected = await crawlSite({ start: 'https://a.test/', max: 1, delayMs: 0, fetcher: stub(u => (u.endsWith('/robots.txt') ? { status: 200, chain: new Array(6).fill({ url: u, status: 301, location: u }), body: 'User-agent: *\nDisallow: /\n', headers: { 'content-type': 'text/plain' } } : { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home') })) });
  assert.equal(injected.robots.policy, 'allow-all');
  assert.equal(injected.pages[0].googlebotAllowed, true);
});

test('a robots.txt that is an HTML page is flagged and is not a missing Sitemap line', async () => {
  const res = await withSite(o => ({ '/robots.txt': [200, 'text/html', '<!doctype html><html><body>App</body></html>'], '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/'])], '/': [200, 'text/html', page('Home')] }), o => crawl(o));
  assert.ok(codesOf(res).includes('ROBOTS_IS_HTML'));
  assert.equal(res.findings.find(f => f.code === 'ROBOTS_IS_HTML').severity, 'medium');
  assert.ok(!codesOf(res).includes('ROBOTS_NO_SITEMAP_LINE'));
  const rules = await withSite(o => ({ '/robots.txt': [200, 'text/html', 'User-agent: *\nDisallow: /x\n'], '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/'])], '/': [200, 'text/html', page('Home')] }), o => crawl(o));
  assert.equal(rules.findings.find(f => f.code === 'ROBOTS_IS_HTML').severity, 'low');
});

test('a robots.txt with an unreadable Sitemap line does not stop the crawl', async () => {
  const res = await withSite(o => ({ '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow:\nSitemap: http://\nSitemap: file:///etc/passwd\n'], '/': [200, 'text/html', page('Home')] }), o => crawl(o));
  assert.equal(res.pages.length, 1);
  assert.ok(codesOf(res).includes('NO_SITEMAP'));
});

// What the fetcher cannot do is not what the site did.
test('a URL this tool refuses to fetch is reported once as not checked, never as a broken link or a sitemap error', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nAllow: /\n'],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/private-link'])],
    '/': [200, 'text/html', page('Home', links(['/private-link']))],
    '/private-link': [302, null, null, 'http://10.255.255.1/private'],
  }), o => crawl(o));
  const p = res.pages.find(x => x.url.endsWith('/private-link'));
  assert.equal(p.error, 'blocked-private-address');
  assert.ok(!codesOf(res).includes('BROKEN_INTERNAL_LINK'));
  assert.ok(!codesOf(res).includes('SITEMAP_URL_ERROR'));
  const f = res.findings.find(x => x.code === 'URL_NOT_CHECKED');
  assert.ok(f, JSON.stringify(codesOf(res)));
  assert.equal(f.severity, 'info');
  assert.ok(f.evidence.urls.some(u => u.endsWith('/private-link')));
  assert.match(f.message, /blocked-private-address/);
});

test('links that leave the site are never followed, not even to a name for the same machine', async () => {
  const res = await withSite(o => {
    const other = o.replace('127.0.0.1', 'localhost');
    return {
      '/robots.txt': [404, 'text/plain', ''],
      '/sitemap.xml': [200, 'application/xml', `<urlset><url><loc>${o}/</loc></url><url><loc>${other}/in-sitemap-elsewhere</loc></url></urlset>`],
      '/': [200, 'text/html', page('Home', `<a href="${other}/offsite">x</a><a href="https://example.org/">y</a><a href="//cdn.example.net/z">z</a><a href="mailto:a@b.test">m</a><a href="/inside">i</a>`, `<link rel="alternate" hreflang="fr" href="${other}/fr"><link rel="canonical" href="${o}/">`)],
      '/inside': [200, 'text/html', page('Inside')],
    };
  }, async (o, hits) => {
    const r = await crawl(o);
    assert.deepEqual(hits.filter(h => /offsite|elsewhere|\/fr/.test(h)), []);
    return r;
  });
  assert.deepEqual(res.pages.map(p => new URL(p.url).pathname).sort(), ['/', '/inside']);
  const home = res.pages.find(p => new URL(p.url).pathname === '/');
  assert.ok(home.facts.links.some(l => !l.internal), 'external links stay in the facts, they are just not crawled');
});

test('a page that redirects off the site is recorded but not read, and its links are not followed', async () => {
  const fetcher = stub(u => {
    if (u.endsWith('/robots.txt')) return { status: 404 };
    if (u === 'https://a.test/') return { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home', '<a href="/leave">leave</a>') };
    if (u === 'https://a.test/leave') return { finalUrl: 'https://other.test/landing', chain: [{ url: u, status: 302, location: 'https://other.test/landing' }], status: 200, headers: { 'content-type': 'text/html' }, body: '<html><head><title>Elsewhere</title></head><body><a href="https://other.test/next">next</a></body></html>' };
    return { status: 404 };
  });
  const seen = [];
  const res = await crawlSite({ start: 'https://a.test/', max: 10, delayMs: 0, fetcher: { get: u => { seen.push(u); return fetcher.get(u); } } });
  const leave = res.pages.find(p => p.url === 'https://a.test/leave');
  assert.equal(leave.finalUrl, 'https://other.test/landing');
  assert.equal(leave.facts, undefined);
  assert.ok(!seen.some(u => u.includes('/next')));
  assert.ok(!res.pages.some(p => p.url.includes('other.test')));
});

// Memory and time stay bounded on hostile or faceted sites.
test('a faceted site cannot grow the queue without limit, and a huge page is trimmed in memory, and both are said', async () => {
  const many = Array.from({ length: 6000 }, (_, i) => `/p?f=${i}`);
  const body = links(many) + '<img src="/i.png">'.repeat(3000) + `<p>${'word '.repeat(30000)}</p>`;
  const res = await withSite(() => ({ '/robots.txt': [404, 'text/plain', ''], '/': [200, 'text/html', page('Home', body)] }), o => crawl(o, { max: 5 }));
  assert.equal(res.meta.pagesCrawled, 5);
  assert.equal(res.meta.capped, true);
  assert.equal(res.meta.queueCapped, true);
  assert.equal(res.meta.queued, 100);
  const lim = res.findings.find(f => f.code === 'CRAWL_LIMIT' && f.evidence.limit === 'queue');
  assert.ok(lim, JSON.stringify(codesOf(res)));
  assert.equal(lim.severity, 'info');
  const home = res.pages.find(p => p.url.endsWith('/') && p.facts);
  assert.equal(home.facts.links.length, 5000);
  assert.equal(home.facts.linksTruncated, true);
  assert.equal(home.facts.images.length, 1000);
  assert.equal(home.facts.imagesTotal, 3000);
  assert.equal(home.facts.imagesMissingAlt, 3000);
  assert.ok(res.findings.some(f => f.code === 'IMG_ALT_MISSING' && /3000 images/.test(f.message)));
  assert.equal(home.facts.text.length, 20000);
  assert.equal(home.facts.textTruncated, true); // a later check must not call a value past the cut "missing"
  assert.ok(home.facts.wordCount >= 30000);
});

test('crawl.json carries starSignal for every page, also for a page that is trimmed in memory', async () => {
  // The only sign of stars on /huge is an image alt that comes after the 1000 images a crawl keeps.
  const huge = '<img src="/i.png">'.repeat(1500) + '<img src="/s.png" alt="Five stars">' + `<p>${'word '.repeat(30000)}</p>`;
  const res = await withSite(() => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('Home', links(['/plain', '/aria', '/glyphs', '/huge']))],
    '/plain': [200, 'text/html', page('Plain', '<p>Great table.</p>')],
    '/aria': [200, 'text/html', page('Aria', '<span role="img" aria-label="Rated 4.8 out of 5"></span>')],
    '/glyphs': [200, 'text/html', page('Glyphs', '<p>\u2605\u2605\u2605\u2605\u2606</p>')],
    '/huge': [200, 'text/html', page('Huge', huge)],
  }), o => crawl(o));
  const want = { '/': false, '/plain': false, '/aria': true, '/glyphs': true, '/huge': true };
  const signals = pages => Object.fromEntries(pages.filter(p => p.facts).map(p => [new URL(p.url).pathname, p.facts.starSignal]));
  assert.deepEqual(signals(res.pages), want);
  const hugeFacts = res.pages.find(p => p.url.endsWith('/huge')).facts;
  assert.equal(hugeFacts.images.length, 1000);
  assert.ok(!hugeFacts.images.some(i => /stars/.test(i.alt)), 'the alt was trimmed away; the flag is what is left');
  assert.equal(hugeFacts.textTruncated, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
  try {
    writeCrawl(dir, res);
    assert.deepEqual(signals(JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')).pages), want);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a hostile sitemap is read in linear time, with no stack overflow and bounded memory', { timeout: 30000 }, async () => {
  // 60,000 openers and no closer: a lazy regex rescans to the end for each one.
  const t0 = performance.now();
  const noClosers = await loadSitemaps(stub({ 'https://a.test/s.xml': { status: 200, body: '<urlset>' + '<loc>'.repeat(60000) } }), ['https://a.test/s.xml']);
  assert.deepEqual(noClosers.pageUrls, []);
  const spaces = await loadSitemaps(stub({ 'https://a.test/s.xml': { status: 200, body: '<urlset><loc>' + ' '.repeat(2e6) + '</loc><loc>https://a.test/ok</loc></urlset>' } }), ['https://a.test/s.xml']);
  assert.deepEqual(spaces.pageUrls, ['https://a.test/ok']);
  assert.ok(performance.now() - t0 < 3000, `took ${Math.round(performance.now() - t0)} ms`);
  // 150,000 child sitemaps in one index: only `limit` are fetched, and spreading them into push() would overflow the stack.
  let fetched = 0;
  const index = '<sitemapindex>' + Array.from({ length: 150000 }, (_, i) => `<sitemap><loc>https://a.test/s${i}.xml</loc></sitemap>`).join('') + '</sitemapindex>';
  const idx = await loadSitemaps({ get: async url => { fetched++; return { url, finalUrl: url, status: 200, body: url.endsWith('/index.xml') ? index : '<urlset><loc>https://a.test/x</loc></urlset>', headers: {}, chain: [], error: null }; } }, ['https://a.test/index.xml'], 50);
  assert.equal(fetched, 50);
  assert.equal(idx.pageUrls.length, 1);
  // More page URLs than the cap: the list stops there and says so.
  const big = '<urlset>' + Array.from({ length: 1200 }, (_, i) => `<url><loc>https://a.test/p${i}</loc></url>`).join('') + '</urlset>';
  const capped = await loadSitemaps(stub({ 'https://a.test/s.xml': { status: 200, body: big } }), ['https://a.test/s.xml'], 50, 1000);
  assert.equal(capped.pageUrls.length, 1000);
  assert.equal(capped.capped, true);
});

test('sitemaps: gzip files are read, a gzip bomb is not, entities and CDATA are decoded, a truncated read is reported', async () => {
  const xml = '<urlset><url><loc>https://a.test/a?x=1&amp;y=2</loc></url><url><loc><![CDATA[https://a.test/b?x=1&y=2]]></loc></url><url><LOC> /c </LOC></url></urlset>';
  const gz = zlib.gzipSync(xml);
  const ok = await loadSitemaps(stub({ 'https://a.test/s.xml.gz': { status: 200, buffer: gz, body: gz.toString('latin1'), headers: { 'content-type': 'application/gzip' } } }), ['https://a.test/s.xml.gz']);
  assert.deepEqual(ok.pageUrls.sort(), ['https://a.test/a?x=1&y=2', 'https://a.test/b?x=1&y=2', 'https://a.test/c']);
  const bomb = zlib.gzipSync(Buffer.alloc(60 * 1024 * 1024));
  assert.ok(bomb.length < 1024 * 1024);
  const bad = await loadSitemaps(stub({ 'https://a.test/b.xml.gz': { status: 200, buffer: bomb, body: '' } }), ['https://a.test/b.xml.gz']);
  assert.deepEqual(bad.pageUrls, []);
  assert.ok(bad.errors.some(e => e.error === 'gunzip-failed'));
  const cut = await loadSitemaps(stub({ 'https://a.test/s.xml': { status: 200, body: '<urlset><loc>https://a.test/a</loc><loc>https://a.te', truncated: true } }), ['https://a.test/s.xml']);
  assert.deepEqual(cut.pageUrls, ['https://a.test/a']);
  assert.deepEqual(cut.truncated, ['https://a.test/s.xml']);
  const res = await crawlSite({ start: 'https://a.test/', max: 1, delayMs: 0, fetcher: stub(u => (u.endsWith('/sitemap.xml') ? { status: 200, body: '<urlset><loc>https://a.test/a</loc><loc>https://a.te', truncated: true } : u === 'https://a.test/' ? { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home') } : {})) });
  assert.ok(res.findings.some(f => f.code === 'CRAWL_LIMIT' && f.evidence.limit === 'sitemap'));
});

test('duplicate-intent comparison is capped at 2,000 pages and says so; pairs are capped too', { timeout: 20000 }, () => {
  const mk = (i, title) => ({
    url: `https://a.test/p${i}`, inSitemap: false, status: 200, finalUrl: `https://a.test/p${i}`, chain: [], error: null, bytes: 1000, googlebotAllowed: true,
    facts: { lang: 'en', title, titleCount: 1, metaDescription: `d${i}`, descriptionCount: 1, metaRobots: [], robotsMetaOutsideHead: false, canonical: null, canonicals: [], hreflang: [], headings: { h1: [title], h2: [], h3: [] }, links: [], images: [], jsonld: [], wordCount: 300, appShell: false, offsets: { title: 10, canonical: null, metaRobots: null, firstJsonld: null }, bytes: { total: 1000, scripts: 0, inlineBase64: 0 } },
  });
  const run = pages => analyze({ pages, robotsInfo: { url: 'https://a.test/robots.txt', status: 200, policy: 'parse', sitemaps: [] }, sitemapInfo: { pageUrls: [], read: [], errors: [] }, capped: false, startUrl: 'https://a.test/' });
  // Titles of five words that share nothing, except two close pairs: one inside the first 2,000 pages, one past them.
  const five = i => `zq${i}a zq${i}b zq${i}c zq${i}d zq${i}e`;
  const pages = Array.from({ length: 2100 }, (_, i) => mk(i, five(i)));
  pages[1] = mk(1, `${five(0)} zq0f`);
  pages[2099] = mk(2099, `${five(2098)} zq2098f`);
  const t0 = performance.now();
  const f = run(pages);
  assert.ok(performance.now() - t0 < 5000);
  const pairs = f.filter(x => x.code === 'DUPLICATE_INTENT_CANDIDATE');
  assert.equal(pairs.length, 1, 'only the pair inside the first 2,000 pages');
  assert.deepEqual(pairs[0].evidence.urls, ['https://a.test/p0', 'https://a.test/p1']);
  const lim = f.find(x => x.code === 'CRAWL_LIMIT' && x.evidence.limit === 'duplicate-intent');
  assert.ok(lim);
  assert.match(lim.message, /first 2000 of 2100/);
  // 400 near-identical pages would be 79,800 pairs: the number of pair findings is capped.
  const base = 'oak walnut maple cherry birch pine teak elm ash';
  const same = Array.from({ length: 400 }, (_, i) => mk(i, `${base} t${i}`));
  const g = run(same);
  const n = g.filter(x => x.code === 'DUPLICATE_INTENT_CANDIDATE').length;
  assert.equal(n, 200);
  assert.ok(g.some(x => x.code === 'CRAWL_LIMIT' && x.evidence.limit === 'duplicate-intent-pairs'));
});

test('2 MB: a page over the limit, a title that starts after it, and a page too big to read in full', { timeout: 30000 }, async () => {
  const pad = n => `<!--${'x'.repeat(n)}-->`;
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('Home', links(['/late', '/huge']))],
    '/late': [200, 'text/html', `<!doctype html><html lang="en"><head>${pad(2.1 * 1024 * 1024)}<title>Late title</title><meta name="description" content="d"></head><body><h1>Late title</h1><p>${words}</p></body></html>`],
    '/huge': [200, 'text/html', `<!doctype html><html lang="en"><head><title>Huge</title><meta name="description" content="d2"></head><body><h1>Huge</h1><p>${words}</p>${'<p>padding words here</p>'.repeat(260000)}</body></html>`],
  }), o => crawl(o));
  const late = res.findings.filter(f => f.evidence.urls?.some(u => u.endsWith('/late')));
  assert.ok(late.some(f => f.code === 'HTML_OVER_2MB'));
  const key = late.find(f => f.code === 'KEY_TAGS_AFTER_2MB');
  assert.ok(key && /title/.test(key.message));
  const huge = res.pages.find(p => p.url.endsWith('/huge'));
  assert.equal(huge.truncated, true);
  const hf = res.findings.find(f => f.code === 'HTML_OVER_2MB' && f.evidence.urls.some(u => u.endsWith('/huge')));
  assert.match(hf.message, /more than/);
  assert.ok(!res.findings.some(f => (f.code === 'HTML_OVER_2MB' || f.code === 'KEY_TAGS_AFTER_2MB') && f.evidence.urls.some(u => new URL(u).pathname === '/')));
});

test('isNoindex reads the meta tag and the X-Robots-Tag header, for Google only', () => {
  const p = (metaRobots = [], xRobots = '') => ({ facts: { metaRobots }, xRobots });
  assert.equal(isNoindex(p(['noindex'])), true);
  assert.equal(isNoindex(p(['none'])), true);
  assert.equal(isNoindex(p(['index', 'follow'])), false);
  assert.equal(isNoindex(p(['noarchive'])), false);
  assert.equal(isNoindex({ xRobots: 'noindex' }), true);
  assert.equal(isNoindex({ xRobots: 'noindex, nofollow' }), true);
  assert.equal(isNoindex({ xRobots: 'googlebot: noindex' }), true);
  assert.equal(isNoindex({ xRobots: 'GoogleBot: NoIndex' }), true);
  assert.equal(isNoindex({ xRobots: 'bingbot: noindex' }), false);
  assert.equal(isNoindex({ xRobots: 'bingbot: nofollow, noindex' }), false, 'noindex after "bingbot:" is bingbot\'s');
  assert.equal(isNoindex({ xRobots: 'bingbot: noindex, googlebot: nofollow' }), false);
  assert.equal(isNoindex({ xRobots: 'bingbot: nofollow, googlebot: noindex' }), true);
  assert.equal(isNoindex({ xRobots: 'unavailable_after: Fri, 25 Jun 2100 15:00:00 PST' }), false);
  assert.equal(isNoindex({ xRobots: '' }), false);
  assert.equal(isNoindex({}), false);
});

test('pages.csv cannot run a formula when a spreadsheet opens it', async () => {
  const res = await withSite(() => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('=HYPERLINK("http://evil.test","click")', links(['/p', '/q', '/r']))],
    '/p': [200, 'text/html', page('+1+1')],
    '/q': [200, 'text/html', page('@SUM(1)')],
    '/r': [200, 'text/html', page('-2+3, fine')],
  }), o => crawl(o));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
  try {
    writeCrawl(dir, res);
    const csv = fs.readFileSync(path.join(dir, 'pages.csv'), 'utf8');
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.test"",""click"")"`), csv);
    assert.ok(csv.includes(",'+1+1,"));
    assert.ok(csv.includes(",'@SUM(1),"));
    assert.ok(csv.includes(`,"'-2+3, fine",`));
    // The JSON keeps the page text, trimmed to 20,000 characters.
    const big = { ...res, pages: res.pages.map((p, i) => (i === 0 ? { ...p, facts: { ...p.facts, text: 'w '.repeat(30000) } } : p)) };
    writeCrawl(dir, big);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')).pages[0].facts;
    assert.equal(saved.text.length, 20000);
    assert.equal(saved.textTruncated, true);
    // A page whose text fits carries no flag.
    writeCrawl(dir, res);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')).pages.find(p => p.facts).facts.textTruncated, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bad input is a TypeError, not an endless crawl', async () => {
  for (const max of [NaN, 0, -1, 1.5, '5', Infinity]) {
    await assert.rejects(crawlSite({ start: O + '/', max, delayMs: 0 }), err => err instanceof TypeError && /max/.test(err.message), String(max));
  }
  await assert.rejects(crawlSite({ start: 'not a url', delayMs: 0 }), err => err instanceof TypeError && /not a site URL/.test(err.message));
  await assert.rejects(crawlSite({ start: 'ftp://a.test/', delayMs: 0 }), err => err instanceof TypeError && /http/.test(err.message));
  const odd = await crawlSite({ start: O + '/', max: 2, delayMs: 0, concurrency: NaN });
  assert.equal(odd.pages.length, 2);
});

test('the CLI writes the three files, exits 0 with findings, and 1 with a plain message on bad input', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cli-'));
  try {
    const ok = await run([O + '/', '--max', '20', '--delay', '0', '--out', dir]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /^Crawled \d+ pages, \d+ findings\. Wrote /);
    for (const f of ['crawl.json', 'pages.csv', 'findings.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    const help = await run(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /^Usage: node crawl\.mjs/);
    assert.match(help.stdout, /obeys robots.txt by default/);
    assert.match(help.stdout, /--ignore-robots/);
    assert.equal((await run([])).code, 1);
    for (const args of [['--max', 'abc'], ['--max', '0'], ['--max'], ['--delay', '-1'], ['--concurrency', '0'], ['--out'], ['--sitemap']]) {
      const r = await run([O + '/', ...args]);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.stderr, /--(max|delay|concurrency|out|sitemap)/);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
    }
    const bad = await run(['example.com', '--out', dir]);
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /not a site URL/);
    assert.doesNotMatch(bad.stderr, /\n\s+at /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// Fix 1: the crawler obeys robots.txt for its own requests (its own group, else *), --ignore-robots is for owners.
// ---------------------------------------------------------------------------------------------

const PRIVATE_SITE = o => ({
  '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
  '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/private/a', '/ok'])],
  '/': [200, 'text/html', page('Home', links(['/private/b', '/ok']))],
  '/ok': [200, 'text/html', page('Fine page')],
  '/private/a': [200, 'text/html', page('Private A')],
  '/private/b': [200, 'text/html', page('Private B', '', '<meta name="robots" content="noindex">')],
});

test('Disallow: /private/ is not fetched by default, and is fetched with ignoreRobots: true', async () => {
  const obeyed = await withSite(PRIVATE_SITE, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.deepEqual(obeyed.hits.filter(h => h.startsWith('/private')), [], 'the server saw no request under /private/');
  assert.ok(obeyed.hits.includes('/robots.txt') && obeyed.hits.includes('/ok'));
  const a = obeyed.res.pages.find(p => p.url.endsWith('/private/a'));
  assert.equal(a.status, null);
  assert.equal(a.skipped, 'robots');
  assert.equal(a.facts, undefined);
  assert.equal(a.googlebotAllowed, false, 'googlebotAllowed stays what Googlebot would do');
  assert.equal(obeyed.res.meta.robots, 'obeyed');
  assert.equal(obeyed.res.meta.skipped, 2);
  assert.equal(obeyed.res.meta.pagesCrawled, 2, 'only pages that were requested count as crawled');
  // A skipped URL is not a broken link, not a sitemap error, not a 404; the sitemap rule match still reports it.
  assert.ok(!codesOf(obeyed.res).includes('BROKEN_INTERNAL_LINK'), JSON.stringify(obeyed.res.findings.filter(f => f.code === 'BROKEN_INTERNAL_LINK')));
  assert.ok(!codesOf(obeyed.res).some(c => c === 'SITEMAP_URL_NOT_200' || c === 'SITEMAP_URL_ERROR' || c === 'REDIRECT_LOOP'));
  assert.ok(has(obeyed.res, 'SITEMAP_URL_BLOCKED', '/private/a'));
  const info = obeyed.res.findings.find(f => f.code === 'ROBOTS_SKIPPED');
  assert.ok(info, JSON.stringify(codesOf(obeyed.res)));
  assert.equal(info.severity, 'info');
  assert.equal(info.label, 'D');
  assert.match(info.message, /2 URLs were not fetched/);
  assert.match(info.message, /--ignore-robots/);
  assert.match(info.message, /noindex/);
  assert.deepEqual(info.evidence.urls.map(u => new URL(u).pathname).sort(), ['/private/a', '/private/b']);
  // The noindex on a blocked page is exactly what an owner would re-run for.
  assert.ok(!codesOf(obeyed.res).includes('NOINDEX_PAGE') && !codesOf(obeyed.res).includes('NOINDEX_BLOCKED'));

  const ignored = await withSite(PRIVATE_SITE, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/private/a') && ignored.hits.includes('/private/b'));
  assert.equal(ignored.res.meta.robots, 'ignored');
  assert.equal(ignored.res.meta.skipped, 0);
  assert.equal(ignored.res.pages.find(p => p.url.endsWith('/private/a')).status, 200);
  assert.ok(!codesOf(ignored.res).includes('ROBOTS_SKIPPED'));
  assert.ok(has(ignored.res, 'SITEMAP_URL_BLOCKED', '/private/a'));
  assert.ok(has(ignored.res, 'NOINDEX_BLOCKED', '/private/b'), 'with robots.txt ignored the noindex on a blocked page is found');
});

test('skipped URLs do not count toward the page cap, and a blocked tail is not "capped"', async () => {
  const res = await withSite(() => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /p/\n'],
    '/': [200, 'text/html', page('Home', links(['/p/1', '/p/2', '/p/3', '/p/4', '/p/5', '/ok']))],
    '/ok': [200, 'text/html', page('Fine page')],
  }), o => crawl(o, { max: 2 }));
  assert.equal(res.meta.pagesCrawled, 2);
  assert.equal(res.meta.skipped, 5);
  assert.equal(res.meta.capped, false);
});

test('a named group for the crawler replaces the * group, and the Googlebot group does not apply to it', async () => {
  const run = robots => withSite(o => ({
    '/robots.txt': [200, 'text/plain', robots],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/mine/x', '/g/x', '/star/x'])],
    '/': [200, 'text/html', page('Home')],
    '/mine/x': [200, 'text/html', page('Mine')],
    '/g/x': [200, 'text/html', page('For Google')],
    '/star/x': [200, 'text/html', page('Star')],
  }), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  const named = await run('User-agent: seo-geo-master\nDisallow: /mine/\n\nUser-agent: Googlebot\nDisallow: /g/\n\nUser-agent: *\nDisallow: /star/\n');
  assert.deepEqual(named.hits.filter(h => h.startsWith('/mine')), [], 'its own group blocks /mine/');
  assert.ok(named.hits.includes('/star/x'), 'it has a group of its own, so the * group is not read');
  assert.ok(named.hits.includes('/g/x'), 'the Googlebot group is not its group');
  // What Googlebot would do is still reported, from rule matching alone.
  assert.equal(named.res.pages.find(p => p.url.endsWith('/g/x')).googlebotAllowed, false);
  assert.ok(has(named.res, 'SITEMAP_URL_BLOCKED', '/g/x'));
  assert.ok(!has(named.res, 'SITEMAP_URL_BLOCKED', '/mine/x'), 'Googlebot may fetch /mine/');
  // With no group of its own the * group applies.
  const star = await run('User-agent: *\nDisallow: /star/\n');
  assert.deepEqual(star.hits.filter(h => h.startsWith('/star')), []);
  assert.ok(star.hits.includes('/mine/x'));
});

test('robots.txt that cannot be read: the crawl fetches nothing but robots.txt, and the message names --ignore-robots', async () => {
  const site = o => ({
    '/robots.txt': [503, 'text/plain', 'down', null, { 'retry-after': '0' }],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home', links(['/a']))],
    '/a': [200, 'text/html', page('A')],
  });
  const obeyed = await withSite(site, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.equal(obeyed.res.robots.policy, 'disallow-all');
  assert.deepEqual([...new Set(obeyed.hits)], ['/robots.txt'], 'nothing else was requested, not even the sitemap');
  assert.ok(obeyed.res.pages.every(p => p.skipped === 'robots' && p.status === null));
  assert.ok(codesOf(obeyed.res).includes('ROBOTS_UNAVAILABLE'));
  const info = obeyed.res.findings.find(f => f.code === 'ROBOTS_SKIPPED');
  assert.ok(info, JSON.stringify(codesOf(obeyed.res)));
  assert.match(info.message, /--ignore-robots/);
  assert.match(info.message, /could not be read/);
  assert.ok(!codesOf(obeyed.res).includes('NO_SITEMAP'), 'a sitemap that was not fetched is not a missing sitemap');
  assert.ok(!codesOf(obeyed.res).includes('BROKEN_INTERNAL_LINK'));
  const ignored = await withSite(site, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/a') && ignored.hits.includes('/sitemap.xml'));
  assert.ok(!codesOf(ignored.res).includes('ROBOTS_SKIPPED'));
});

test('robots.txt this tool refuses to read (not-checked): nothing is fetched by default and the finding names --ignore-robots', async () => {
  const site = o => ({
    '/robots.txt': [302, null, null, 'http://169.254.169.254/robots.txt'],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/'])],
    '/': [200, 'text/html', page('Home')],
  });
  const obeyed = await withSite(site, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.equal(obeyed.res.robots.policy, 'not-checked');
  assert.deepEqual([...new Set(obeyed.hits)], ['/robots.txt']);
  assert.ok(obeyed.res.pages.every(p => p.skipped === 'robots' && p.googlebotAllowed === null));
  assert.match(obeyed.res.findings.find(f => f.code === 'ROBOTS_NOT_CHECKED').message, /--ignore-robots/);
  assert.ok(codesOf(obeyed.res).includes('ROBOTS_SKIPPED'));
});

test('a sitemap that robots.txt disallows is not fetched, and its URLs are unknown rather than missing', async () => {
  const site = o => ({
    '/robots.txt': [200, 'text/plain', `User-agent: *\nDisallow: /maps/\nSitemap: ${o}/maps/sitemap.xml\n`],
    '/maps/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home')],
  });
  const obeyed = await withSite(site, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.ok(!obeyed.hits.includes('/maps/sitemap.xml'));
  assert.deepEqual(obeyed.res.sitemap.skipped.map(u => new URL(u).pathname), ['/maps/sitemap.xml']);
  assert.ok(!codesOf(obeyed.res).includes('NO_SITEMAP'));
  const info = obeyed.res.findings.find(f => f.code === 'ROBOTS_SKIPPED');
  assert.ok(info && info.evidence.urls.some(u => u.endsWith('/maps/sitemap.xml')));
  const ignored = await withSite(site, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/maps/sitemap.xml'));
  assert.equal(ignored.res.sitemap.pageUrls.length, 2);
});

test('googlebotAllowed is null for every URL when robots.txt was not checked, false when it is unavailable', async () => {
  const stubFor = robots => stub(u => (u.endsWith('/robots.txt') ? robots : u.endsWith('/sitemap.xml') ? { status: 404 } : { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home') }));
  const notChecked = await crawlSite({ start: 'https://a.test/', max: 5, delayMs: 0, ignoreRobots: true, fetcher: stubFor({ error: 'blocked-private-address', status: null }) });
  assert.equal(notChecked.robots.policy, 'not-checked');
  assert.ok(notChecked.pages.length && notChecked.pages.every(p => p.googlebotAllowed === null));
  const down = await crawlSite({ start: 'https://a.test/', max: 5, delayMs: 0, ignoreRobots: true, fetcher: stubFor({ status: 500 }) });
  assert.ok(down.pages.every(p => p.googlebotAllowed === false));
});

test('writeCrawl says in findings.md whether robots.txt was obeyed or ignored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-'));
  try {
    for (const [extra, word, json] of [[{}, /obeyed robots\.txt/, 'obeyed'], [{ ignoreRobots: true }, /ignored robots\.txt/, 'ignored']]) {
      const res = await withSite(PRIVATE_SITE, o => crawl(o, extra));
      writeCrawl(dir, res);
      assert.match(fs.readFileSync(path.join(dir, 'findings.md'), 'utf8'), word);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')).meta.robots, json);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: --ignore-robots (before or after the URL) is accepted, --help names it, an unknown flag is a usage error', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const run = args => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cli-'));
  const metaRobots = () => JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')).meta.robots;
  try {
    assert.equal((await run([O + '/', '--max', '5', '--delay', '0', '--out', dir])).code, 0);
    assert.equal(metaRobots(), 'obeyed');
    const after = await run([O + '/', '--ignore-robots', '--max', '5', '--delay', '0', '--out', dir]);
    assert.equal(after.code, 0, after.stderr);
    assert.equal(metaRobots(), 'ignored');
    fs.rmSync(path.join(dir, 'crawl.json'));
    // The argument parser would read the URL after a bare flag as the flag's value.
    const before = await run(['--ignore-robots', O + '/', '--max', '5', '--delay', '0', '--out', dir]);
    assert.equal(before.code, 0, before.stderr);
    assert.equal(metaRobots(), 'ignored');
    const help = await run(['--help']);
    assert.match(help.stdout, /--ignore-robots/);
    assert.match(help.stdout, /your own site|you own/i);
    for (const args of [['--bogus'], ['--max', '5', '--ignroe-robots'], ['--ignore-robots=maybe']]) {
      const r = await run([O + '/', ...args, '--out', dir]);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.stderr, /(Unknown option|--ignore-robots)/);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// Fix 1, findings: canonical chains, redirecting sitemap URLs, rate limits, orphans on partial crawls, parse failures.
// ---------------------------------------------------------------------------------------------

// A page record for analyze(), with every field the checks read.
const rec = (url, over = {}) => ({
  url, inSitemap: false, status: 200, finalUrl: url, chain: [], error: null, bytes: 1000, googlebotAllowed: true, contentType: 'text/html', xRobots: '',
  facts: {
    lang: 'en', title: `Title of ${url}`, titleCount: 1, metaDescription: `Description of ${url}`, descriptionCount: 1, metaRobots: [], robotsMetaOutsideHead: false, canonical: null, canonicals: [], hreflang: [],
    headings: { h1: [`Heading of ${url}`], h2: [], h3: [] }, links: [], images: [], jsonld: [], wordCount: 300, appShell: false,
    offsets: { title: 10, canonical: null, metaRobots: null, firstJsonld: null }, bytes: { total: 1000, scripts: 0, inlineBase64: 0 },
  },
  ...over,
});
const withFacts = (r, facts) => ({ ...r, facts: { ...r.facts, ...facts } });
const ROBOTS_OK = { url: 'https://a.test/robots.txt', status: 200, policy: 'parse', sitemaps: ['https://a.test/sitemap.xml'], obeyed: true };
const analyzeRecords = (pages, extra = {}) => analyze({ pages, robotsInfo: ROBOTS_OK, sitemapInfo: { pageUrls: pages.filter(p => p.inSitemap).map(p => p.url), read: ['https://a.test/sitemap.xml'], errors: [] }, capped: false, startUrl: 'https://a.test/', ...extra });

test('a canonical chain (A to B, B to C) is CANONICAL_CHAIN, and a canonical to a self-canonical page is not', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('Home', links(['/a', '/b', '/c', '/d']))],
    '/a': [200, 'text/html', page('Page A', '', `<link rel="canonical" href="${o}/b">`)],
    '/b': [200, 'text/html', page('Page B', '', `<link rel="canonical" href="${o}/c">`)],
    '/c': [200, 'text/html', page('Page C', '', `<link rel="canonical" href="${o}/c">`)],
    '/d': [200, 'text/html', page('Page D', '', `<link rel="canonical" href="${o}/c">`)],
  }), o => crawl(o));
  const chains = res.findings.filter(f => f.code === 'CANONICAL_CHAIN');
  assert.equal(chains.length, 1, JSON.stringify(chains));
  assert.equal(chains[0].severity, 'medium');
  assert.equal(chains[0].label, 'D');
  assert.ok(chains[0].evidence.urls[0].endsWith('/a'));
  assert.ok(chains[0].evidence.canonical.endsWith('/b') && chains[0].evidence.then.endsWith('/c'));
  assert.match(chains[0].message, /\/b/);
  assert.match(chains[0].message, /\/c/);
  // The existing canonical findings are unchanged: /a, /b and /d all point elsewhere.
  assert.deepEqual(res.findings.filter(f => f.code === 'CANONICAL_POINTS_ELSEWHERE').map(f => new URL(f.evidence.urls[0]).pathname).sort(), ['/a', '/b', '/d']);
});

test('H1_MISSING is info', async () => {
  const f = analyzeRecords([withFacts(rec('https://a.test/'), { headings: { h1: [], h2: [], h3: [] } })]).find(x => x.code === 'H1_MISSING');
  assert.ok(f);
  assert.equal(f.severity, 'info');
});

test('a redirect record stands for its final URL only when that URL has no record and was reached: no "redirects to itself"', () => {
  const page1 = withFacts(rec('https://a.test/p', { inSitemap: false }), { canonical: 'https://a.test/target' });
  // /old redirected to /target (200), and /target itself was never requested (the page cap).
  const old = rec('https://a.test/old', { finalUrl: 'https://a.test/target', chain: [{ url: 'https://a.test/old', status: 301, location: 'https://a.test/target' }] });
  const f = analyzeRecords([page1, old]);
  assert.ok(!f.some(x => x.code === 'CANONICAL_TARGET_NOT_200'), JSON.stringify(f.filter(x => x.code === 'CANONICAL_TARGET_NOT_200')));
  assert.ok(f.some(x => x.code === 'CANONICAL_POINTS_ELSEWHERE'));
  // The same holds for a hreflang target.
  const hl = withFacts(rec('https://a.test/en'), { hreflang: [{ lang: 'en', href: 'https://a.test/en' }, { lang: 'fr', href: 'https://a.test/target' }] });
  const g = analyzeRecords([hl, old]);
  assert.ok(!g.some(x => x.code === 'HREFLANG_TARGET_NOT_200'), JSON.stringify(g.filter(x => x.code === 'HREFLANG_TARGET_NOT_200')));
  // A redirect that never reached anything (a loop, a failed hop) is not the page at its final URL.
  const loop = rec('https://a.test/loop', { status: null, finalUrl: 'https://a.test/loop2', error: 'redirect-loop', facts: undefined, chain: [{ url: 'https://a.test/loop', status: 302, location: 'https://a.test/loop2' }] });
  const h = analyzeRecords([withFacts(rec('https://a.test/q'), { canonical: 'https://a.test/loop2' }), loop]);
  assert.ok(!h.some(x => x.code === 'CANONICAL_TARGET_NOT_200'));
  // A URL that does have its own record keeps it: a canonical to a page that really redirects is still reported.
  const real = rec('https://a.test/target2', { finalUrl: 'https://a.test/end', chain: [{ url: 'https://a.test/target2', status: 301, location: 'https://a.test/end' }] });
  const i = analyzeRecords([withFacts(rec('https://a.test/r'), { canonical: 'https://a.test/target2' }), real, rec('https://a.test/end')]);
  assert.ok(i.some(x => x.code === 'CANONICAL_TARGET_NOT_200' && /after redirects|redirects to/.test(x.message)));
});

test('a sitemap URL that redirects to a 404 is SITEMAP_URL_NOT_200 (high), not "list the final URL"; only redirect-to-200 is SITEMAP_URL_REDIRECTS', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/moved', '/moved-ok', '/moved-err'])],
    '/': [200, 'text/html', page('Home')],
    '/moved': [301, null, null, '/gone'],
    '/moved-ok': [301, null, null, '/fine'],
    '/moved-err': [302, null, null, '/boom'],
    '/boom': [410, 'text/html', 'gone'],
    '/fine': [200, 'text/html', page('Fine page')],
  }), o => crawl(o));
  const f = res.findings.find(x => x.code === 'SITEMAP_URL_NOT_200' && x.evidence.urls[0].endsWith('/moved'));
  assert.ok(f, JSON.stringify(codesOf(res)));
  assert.equal(f.severity, 'high');
  assert.match(f.message, /redirects to .*\/gone/);
  assert.match(f.message, /404/);
  assert.ok(res.findings.some(x => x.code === 'SITEMAP_URL_NOT_200' && x.evidence.urls[0].endsWith('/moved-err') && /410/.test(x.message)));
  assert.ok(!res.findings.some(x => x.code === 'SITEMAP_URL_REDIRECTS' && new URL(x.evidence.urls[0]).pathname === '/moved'), 'no advice to list a 404 instead');
  assert.ok(!res.findings.some(x => x.code === 'SITEMAP_URL_REDIRECTS' && x.evidence.urls[0].endsWith('/moved-err')));
  const ok = res.findings.find(x => x.code === 'SITEMAP_URL_REDIRECTS' && x.evidence.urls[0].endsWith('/moved-ok'));
  assert.ok(ok);
  assert.match(ok.message, /\/fine/);
});

test('429 and 503 after the fetcher\'s retry are RATE_LIMITED once, never broken links, sitemap errors or orphans', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/limited', '/busy', '/ok'])],
    '/': [200, 'text/html', page('Home', links(['/limited', '/busy', '/ok', '/missing']))],
    '/ok': [200, 'text/html', page('Fine page')],
    '/limited': [429, 'text/html', 'slow down', null, { 'retry-after': '0' }],
    '/busy': [503, 'text/html', 'busy', null, { 'retry-after': '0' }],
  }), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  const r = res.res;
  assert.equal(r.findings.filter(f => f.code === 'RATE_LIMITED').length, 1, JSON.stringify(codesOf(r)));
  const f = r.findings.find(x => x.code === 'RATE_LIMITED');
  assert.equal(f.severity, 'medium');
  assert.equal(f.label, 'D');
  assert.match(f.message, /2 URLs/);
  assert.match(f.message, /--delay/);
  assert.match(f.message, /--concurrency/);
  assert.deepEqual(f.evidence.urls.map(u => new URL(u).pathname).sort(), ['/busy', '/limited']);
  assert.equal(r.pages.find(p => p.url.endsWith('/limited')).status, 429, 'the status is recorded');
  assert.equal(res.hits.filter(h => h === '/limited').length, 2, 'the fetcher retried once');
  assert.ok(!r.findings.some(x => x.code === 'BROKEN_INTERNAL_LINK' && /limited|busy/.test(x.evidence.target)), 'not a broken link');
  assert.ok(!r.findings.some(x => x.code === 'SITEMAP_URL_NOT_200' && /limited|busy/.test(x.evidence.urls[0])), 'not a bad sitemap URL');
  assert.ok(!r.findings.some(x => x.code === 'ORPHAN_PAGE'));
  // A real 404 is still a broken link.
  assert.ok(r.findings.some(x => x.code === 'BROKEN_INTERNAL_LINK' && x.evidence.target.endsWith('/missing')));
});

// The reviewer's chain: the sitemap lists the pages in reverse order and the page cap stops the crawl halfway down.
const CHAIN_SITE = o => ({
  '/robots.txt': [404, 'text/plain', ''],
  '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/p5', '/p4', '/p3', '/p2', '/p1'])],
  '/': [200, 'text/html', page('Home', links(['/p1']))],
  '/p1': [200, 'text/html', page('Chain one', links(['/p2']))],
  '/p2': [200, 'text/html', page('Chain two', links(['/p3']))],
  '/p3': [200, 'text/html', page('Chain three', links(['/p4']))],
  '/p4': [200, 'text/html', page('Chain four', links(['/p5']))],
  '/p5': [200, 'text/html', page('Chain five')],
});

test('a partial crawl does not call pages orphans: one ORPHANS_UNVERIFIED instead, and a complete crawl finds none', async () => {
  const partial = await withSite(CHAIN_SITE, o => crawl(o, { max: 3 }));
  assert.equal(partial.meta.capped, true);
  assert.ok(!partial.findings.some(f => f.code === 'ORPHAN_PAGE'), JSON.stringify(partial.findings.filter(f => f.code === 'ORPHAN_PAGE')));
  const f = partial.findings.find(x => x.code === 'ORPHANS_UNVERIFIED');
  assert.ok(f, JSON.stringify(codesOf(partial)));
  assert.equal(f.severity, 'info');
  assert.equal(f.label, 'H');
  assert.ok(f.evidence.count >= 1 && f.evidence.urls.length === f.evidence.count);
  assert.ok(f.evidence.urls.some(u => u.endsWith('/p4')), 'the page whose only inlink was not read is listed');
  assert.match(f.message, /--max/);
  const complete = await withSite(CHAIN_SITE, o => crawl(o, { max: 50 }));
  assert.equal(complete.meta.capped, false);
  assert.ok(!complete.findings.some(x => x.code === 'ORPHAN_PAGE' || x.code === 'ORPHANS_UNVERIFIED'), JSON.stringify(complete.findings.filter(x => /ORPHAN/.test(x.code))));
});

test('ORPHANS_UNVERIFIED lists at most 100 URLs and says how many there are; URLs skipped by robots.txt make a crawl partial too', () => {
  const pages = [rec('https://a.test/', { inSitemap: true })];
  for (let i = 0; i < 150; i++) pages.push(rec(`https://a.test/o${i}`, { inSitemap: true }));
  const f = analyzeRecords(pages, { capped: true }).find(x => x.code === 'ORPHANS_UNVERIFIED');
  assert.equal(f.evidence.count, 150);
  assert.equal(f.evidence.urls.length, 100);
  assert.match(f.message, /150/);
  const skip = analyzeRecords([...pages.slice(0, 3), rec('https://a.test/hidden', { status: null, finalUrl: null, facts: undefined, skipped: 'robots', googlebotAllowed: false })]);
  assert.ok(!skip.some(x => x.code === 'ORPHAN_PAGE'));
  const g = skip.find(x => x.code === 'ORPHANS_UNVERIFIED');
  assert.ok(g);
  assert.match(g.message, /--ignore-robots/);
  const none = analyzeRecords(pages.slice(0, 3));
  assert.ok(none.some(x => x.code === 'ORPHAN_PAGE') && !none.some(x => x.code === 'ORPHANS_UNVERIFIED'), 'a complete crawl keeps the per-page finding');
});

test('a start URL that redirects to a landing page does not make the landing page an orphan', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/home', '/about'])],
    '/': [301, null, null, '/home'],
    '/home': [200, 'text/html', page('Landing page', links(['/about']))],
    '/about': [200, 'text/html', page('About page')],
  }), o => crawl(o));
  assert.equal(res.meta.capped, false);
  assert.ok(!res.findings.some(f => f.code === 'ORPHAN_PAGE'), JSON.stringify(res.findings.filter(f => f.code === 'ORPHAN_PAGE')));
  // A page that really is an orphan beside it still is one.
  const withOrphan = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/home', '/lonely'])],
    '/': [301, null, null, '/home'],
    '/home': [200, 'text/html', page('Landing page')],
    '/lonely': [200, 'text/html', page('Lonely page')],
  }), o => crawl(o));
  assert.deepEqual(withOrphan.findings.filter(f => f.code === 'ORPHAN_PAGE').map(f => new URL(f.evidence.urls[0]).pathname), ['/lonely']);
});

test('a page whose HTML cannot be read is recorded as parse-failed: the crawl goes on and the page is not reported as broken', async () => {
  const bad = { toString() { throw new Error('boom'); } };
  const fetcher = stub(u => {
    if (u.endsWith('/robots.txt') || u.endsWith('/sitemap.xml')) return { status: 404 };
    if (u === 'https://a.test/') return { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home', links(['/weird', '/fine'])) };
    if (u === 'https://a.test/weird') return { status: 200, headers: { 'content-type': 'text/html' }, body: bad };
    if (u === 'https://a.test/fine') return { status: 200, headers: { 'content-type': 'text/html' }, body: page('Fine page') };
    return { status: 404 };
  });
  const res = await crawlSite({ start: 'https://a.test/', max: 10, delayMs: 0, fetcher });
  const weird = res.pages.find(p => p.url.endsWith('/weird'));
  assert.equal(weird.error, 'parse-failed');
  assert.equal(weird.status, 200);
  assert.equal(weird.facts, undefined);
  assert.ok(res.pages.find(p => p.url.endsWith('/fine')).facts, 'the other pages were still read');
  assert.ok(!res.findings.some(f => f.code === 'BROKEN_INTERNAL_LINK' || f.code === 'SITEMAP_URL_ERROR'));
  const f = res.findings.find(x => x.code === 'URL_NOT_CHECKED');
  assert.ok(f && f.evidence.urls.some(u => u.endsWith('/weird')) && /parse-failed/.test(f.message));
});

// ---------------------------------------------------------------------------------------------
// Fix 2: redirect targets obey robots.txt, a blocked crawl does not look clean, 429/503 are not only throttling.
// ---------------------------------------------------------------------------------------------

const GO_SITE = o => ({
  '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
  '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/go', '/ok'])],
  '/': [200, 'text/html', page('Home', links(['/go', '/ok']))],
  '/ok': [200, 'text/html', page('Fine page')],
  '/go': [302, null, null, '/private/secret'],
  '/private/secret': [200, 'text/html', page('Secret page', links(['/private/deeper']))],
  '/private/deeper': [200, 'text/html', page('Deeper secret')],
});

test('a redirect from an allowed URL into a disallowed path is not followed, and never advised as the URL to link to or list', async () => {
  const obeyed = await withSite(GO_SITE, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.deepEqual(obeyed.hits.filter(h => h.startsWith('/private')), [], 'the server never saw /private/secret');
  assert.ok(obeyed.hits.includes('/go'), 'the allowed URL itself was requested');
  const go = obeyed.res.pages.find(p => p.url.endsWith('/go'));
  assert.equal(go.skipped, 'robots');
  assert.equal(go.status, null);
  assert.ok(go.finalUrl.endsWith('/private/secret'), 'finalUrl is the URL that was refused');
  assert.equal(go.chain.length, 1);
  assert.equal(go.facts, undefined);
  assert.equal(obeyed.res.meta.skipped, 1);
  assert.equal(obeyed.res.meta.pagesCrawled, 3, '/go was requested, so it counts as crawled');
  const info = obeyed.res.findings.find(f => f.code === 'ROBOTS_SKIPPED');
  assert.ok(info, JSON.stringify(codesOf(obeyed.res)));
  assert.match(info.message, /1 URL was not fetched/);
  assert.match(info.message, /redirect/);
  assert.deepEqual(info.evidence.urls.map(u => new URL(u).pathname), ['/private/secret']);
  assert.deepEqual(info.evidence.redirects.map(r => [new URL(r.url).pathname, new URL(r.blocked).pathname]), [['/go', '/private/secret']]);
  // Not a broken link, a sitemap error, a loop or an orphan; the advice never points at the blocked URL.
  assert.ok(!codesOf(obeyed.res).some(c => c === 'BROKEN_INTERNAL_LINK' || c === 'SITEMAP_URL_NOT_200' || c === 'SITEMAP_URL_ERROR' || c === 'REDIRECT_LOOP'), JSON.stringify(codesOf(obeyed.res)));
  const sm = obeyed.res.findings.find(f => f.code === 'SITEMAP_URL_REDIRECTS' && f.evidence.urls[0].endsWith('/go'));
  assert.ok(sm, JSON.stringify(codesOf(obeyed.res)));
  assert.match(sm.message, /the redirect leads to a URL robots\.txt blocks/);
  assert.doesNotMatch(sm.message, /list the final URL/);
  const lk = obeyed.res.findings.find(f => f.code === 'LINK_TO_REDIRECT' && f.evidence.target.endsWith('/go'));
  assert.ok(lk, JSON.stringify(codesOf(obeyed.res)));
  assert.match(lk.message, /the redirect leads to a URL robots\.txt blocks/);
  assert.doesNotMatch(lk.message, /directly/);

  // With --ignore-robots no hook is passed: the redirect is followed, but the advice still does not point at a URL robots.txt blocks.
  const ignored = await withSite(GO_SITE, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/private/secret'));
  const g = ignored.res.pages.find(p => p.url.endsWith('/go'));
  assert.equal(g.status, 200);
  assert.ok(g.finalUrl.endsWith('/private/secret'));
  assert.ok(!codesOf(ignored.res).includes('ROBOTS_SKIPPED'));
  const sm2 = ignored.res.findings.find(f => f.code === 'SITEMAP_URL_REDIRECTS' && f.evidence.urls[0].endsWith('/go'));
  assert.match(sm2.message, /the redirect leads to a URL robots\.txt blocks/);
  assert.doesNotMatch(sm2.message, /list the final URL/);
});

test('a redirect whose target is allowed is still advised as before', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/go'])],
    '/': [200, 'text/html', page('Home', links(['/go']))],
    '/go': [301, null, null, '/fine'],
    '/fine': [200, 'text/html', page('Fine page')],
  }), o => crawl(o));
  assert.match(res.findings.find(f => f.code === 'SITEMAP_URL_REDIRECTS').message, /list the final URL .*\/fine/);
  assert.match(res.findings.find(f => f.code === 'LINK_TO_REDIRECT').message, /link to .*\/fine directly/);
  assert.ok(!codesOf(res).includes('ROBOTS_SKIPPED'));
});

test('a start URL that redirects into a disallowed path is not followed, and the crawl does not look clean', async () => {
  const site = () => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
    '/': [302, null, null, '/private/home'],
    '/private/home': [200, 'text/html', page('Private home', links(['/other']))],
    '/other': [200, 'text/html', page('Other')],
  });
  const obeyed = await withSite(site, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.deepEqual(obeyed.hits.filter(h => h !== '/robots.txt' && h !== '/' && h !== '/sitemap.xml'), [], 'nothing past the start URL was requested');
  assert.equal(obeyed.res.pages[0].skipped, 'robots');
  assert.ok(codesOf(obeyed.res).includes('ROBOTS_SKIPPED'));
  const f = obeyed.res.findings.find(x => x.code === 'SITE_BLOCKED_BY_ROBOTS');
  assert.ok(f, JSON.stringify(codesOf(obeyed.res)));
  assert.equal(f.severity, 'critical', 'the page it leads to is blocked for Googlebot too');
  assert.match(f.message, /redirects to .*\/private\/home/);
  assert.match(f.message, /--ignore-robots/);
  const ignored = await withSite(site, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/private/home') && ignored.hits.includes('/other'));
  assert.ok(!codesOf(ignored.res).includes('SITE_BLOCKED_BY_ROBOTS'));
});

test('a sitemap URL that redirects to a disallowed sitemap file is not followed: it is skipped, not missing', async () => {
  const site = o => ({
    '/robots.txt': [200, 'text/plain', `User-agent: *\nDisallow: /private/\nSitemap: ${o}/sitemap.xml\n`],
    '/sitemap.xml': [301, null, null, '/private/sitemap.xml'],
    '/private/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home')],
    '/a': [200, 'text/html', page('A page')],
  });
  const obeyed = await withSite(site, async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.ok(!obeyed.hits.includes('/private/sitemap.xml'), 'the disallowed sitemap file was never requested');
  assert.deepEqual(obeyed.res.sitemap.skipped.map(u => new URL(u).pathname), ['/private/sitemap.xml']);
  assert.deepEqual(obeyed.res.sitemap.errors, []);
  assert.deepEqual(obeyed.res.sitemap.pageUrls, []);
  assert.ok(!codesOf(obeyed.res).includes('NO_SITEMAP'), 'a sitemap that was not fetched is not a missing sitemap');
  const info = obeyed.res.findings.find(f => f.code === 'ROBOTS_SKIPPED');
  assert.ok(info && info.evidence.urls.some(u => u.endsWith('/private/sitemap.xml')));
  assert.equal(info.evidence.sitemaps, 1);
  const ignored = await withSite(site, async (o, hits) => ({ res: await crawl(o, { ignoreRobots: true }), hits: [...hits] }));
  assert.ok(ignored.hits.includes('/private/sitemap.xml'));
  assert.equal(ignored.res.sitemap.pageUrls.length, 2);
});

test('the crawler passes the per-hop robots hook to the fetcher, and none with --ignore-robots', async () => {
  const calls = [];
  const inner = stub(u => (u.endsWith('/robots.txt') ? { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /private/\n' } : u.endsWith('/sitemap.xml') ? { status: 404 } : { status: 200, headers: { 'content-type': 'text/html' }, body: page('Home') }));
  const spy = { get: (url, opts) => { calls.push([url, opts]); return inner.get(url); } };
  await crawlSite({ start: 'https://a.test/', max: 3, delayMs: 0, fetcher: spy });
  const sitemapAndPage = calls.filter(([u]) => !u.endsWith('/robots.txt'));
  assert.ok(sitemapAndPage.length >= 2);
  for (const [u, opts] of sitemapAndPage) assert.equal(typeof opts?.allow, 'function', u);
  const { allow } = sitemapAndPage[0][1];
  assert.equal(allow('https://a.test/private/x'), false);
  assert.equal(allow('https://a.test/public/x'), true);
  calls.length = 0;
  await crawlSite({ start: 'https://a.test/', max: 3, delayMs: 0, fetcher: spy, ignoreRobots: true });
  assert.ok(calls.length >= 2);
  for (const [u, opts] of calls) assert.equal(opts, undefined, u);
});

test('a crawl blocked by Disallow: / is SITE_BLOCKED_BY_ROBOTS (critical when Googlebot is blocked too), not a clean result', async () => {
  const site = robots => o => ({
    '/robots.txt': [200, 'text/plain', robots],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home', links(['/a']))],
    '/a': [200, 'text/html', page('A page')],
  });
  const all = await withSite(site('User-agent: *\nDisallow: /\n'), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.deepEqual([...new Set(all.hits)], ['/robots.txt'], 'nothing but robots.txt was requested');
  assert.equal(all.res.meta.pagesCrawled, 0);
  const f = all.res.findings.find(x => x.code === 'SITE_BLOCKED_BY_ROBOTS');
  assert.ok(f, JSON.stringify(codesOf(all.res)));
  assert.equal(f.severity, 'critical');
  assert.equal(f.label, 'D');
  assert.match(f.message, /whole site/);
  assert.match(f.message, /Googlebot is blocked too/);
  assert.match(f.message, /--ignore-robots/);
  assert.ok(f.evidence.urls[0].endsWith('/'));
  assert.ok(codesOf(all.res).includes('ROBOTS_SKIPPED'));
  const ignored = await withSite(site('User-agent: *\nDisallow: /\n'), o => crawl(o, { ignoreRobots: true }));
  assert.ok(!codesOf(ignored).includes('SITE_BLOCKED_BY_ROBOTS'));
  assert.equal(ignored.meta.pagesCrawled, 2);

  // Only the start page is disallowed: the message says the start page, not the whole site.
  const startOnly = await withSite(() => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
    '/private/': [200, 'text/html', page('Private start')],
  }), o => crawlSite({ start: `${o}/private/`, max: 5, delayMs: 0 }));
  const s = startOnly.findings.find(x => x.code === 'SITE_BLOCKED_BY_ROBOTS');
  assert.ok(s, JSON.stringify(codesOf(startOnly)));
  assert.equal(s.severity, 'critical');
  assert.match(s.message, /start page/);
  assert.doesNotMatch(s.message, /whole site/);

  // Only this crawler is blocked, Googlebot is not: high, and the message says so.
  const own = await withSite(site('User-agent: seo-geo-master\nDisallow: /\n\nUser-agent: *\nAllow: /\n'), o => crawl(o));
  const g = own.findings.find(x => x.code === 'SITE_BLOCKED_BY_ROBOTS');
  assert.ok(g, JSON.stringify(codesOf(own)));
  assert.equal(g.severity, 'high');
  assert.match(g.message, /Googlebot is not blocked/);
  assert.match(g.message, /--ignore-robots/);

  // A site that blocks a section only, with the start page open, is not "blocked".
  const part = await withSite(PRIVATE_SITE, o => crawl(o));
  assert.ok(!codesOf(part).includes('SITE_BLOCKED_BY_ROBOTS'));
});

test('429/503 are worded as throttling or an outage, and "after one retry" is only said when a retry happened', async () => {
  const site = retryAfter => () => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('Home', links(['/limited', '/ok', '/ok2', '/ok3']))],
    '/ok': [200, 'text/html', page('Fine page one')],
    '/ok2': [200, 'text/html', page('Fine page two')],
    '/ok3': [200, 'text/html', page('Fine page three')],
    '/limited': [429, 'text/html', 'slow down', null, { 'retry-after': retryAfter }],
  });
  const retried = await withSite(site('0'), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.equal(retried.hits.filter(h => h === '/limited').length, 2);
  const f = retried.res.findings.find(x => x.code === 'RATE_LIMITED');
  assert.match(f.message, /429\/503/);
  assert.match(f.message, /throttling or an outage/);
  assert.match(f.message, /after one retry/);
  assert.doesNotMatch(f.message, /asked to wait longer/);
  assert.match(f.message, /--delay/);
  assert.ok(!codesOf(retried.res).includes('SITE_UNAVAILABLE'), '1 of 5 pages is not most pages');
  // The server asked to wait 120 s: the fetcher does not wait, does not retry, and the finding does not claim it did.
  const waited = await withSite(site('120'), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.equal(waited.hits.filter(h => h === '/limited').length, 1, 'no retry');
  const g = waited.res.findings.find(x => x.code === 'RATE_LIMITED');
  assert.doesNotMatch(g.message, /after one retry/);
  assert.match(g.message, /the server asked to wait longer than the crawler waits/);
  assert.match(g.message, /429\/503/);
});

test('SITE_UNAVAILABLE (high) when the start URL, or at least half of the fetched pages, answered 429/503', async () => {
  const down = await withSite(() => ({ '/robots.txt': [404, 'text/plain', ''], '/': [503, 'text/html', 'down', null, { 'retry-after': '0' }] }), o => crawl(o));
  assert.equal(down.pages.length, 1);
  const f = down.findings.find(x => x.code === 'SITE_UNAVAILABLE');
  assert.ok(f, JSON.stringify(codesOf(down)));
  assert.equal(f.severity, 'high');
  assert.equal(f.label, 'D');
  assert.match(f.message, /429\/503/);
  assert.match(f.message, /down or blocking the crawler/);
  assert.match(f.message, /could be judged/);
  assert.ok(codesOf(down).includes('RATE_LIMITED'));
  const site = bad => () => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/': [200, 'text/html', page('Home', links(['/a', '/b', '/c']))],
    '/a': [200, 'text/html', page('Page a')],
    '/b': bad.includes('b') ? [503, 'text/html', 'busy', null, { 'retry-after': '0' }] : [200, 'text/html', page('Page b')],
    '/c': bad.includes('c') ? [429, 'text/html', 'slow', null, { 'retry-after': '0' }] : [200, 'text/html', page('Page c')],
  });
  const half = await withSite(site('bc'), o => crawl(o));
  const h = half.findings.find(x => x.code === 'SITE_UNAVAILABLE');
  assert.ok(h, '2 of 4 fetched pages is half');
  assert.equal(h.evidence.count, 2);
  assert.match(h.message, /most pages/);
  const some = await withSite(site('b'), o => crawl(o));
  assert.ok(!codesOf(some).includes('SITE_UNAVAILABLE'), '1 of 4 is throttling, not an outage');
  assert.ok(codesOf(some).includes('RATE_LIMITED'));
  // The start page alone is enough, even when the sitemap's pages answer: the site turned the crawler away at the door.
  const door = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/a', '/b', '/c', '/d'])],
    '/': [503, 'text/html', 'busy', null, { 'retry-after': '0' }],
    '/a': [200, 'text/html', page('Page a')], '/b': [200, 'text/html', page('Page b')], '/c': [200, 'text/html', page('Page c')], '/d': [200, 'text/html', page('Page d')],
  }), o => crawl(o));
  const d = door.findings.find(x => x.code === 'SITE_UNAVAILABLE');
  assert.ok(d, JSON.stringify(codesOf(door)));
  assert.equal(d.evidence.count, 1);
  assert.equal(d.evidence.fetched, 5);
  assert.match(d.message, /the start page/);
  assert.doesNotMatch(d.message, /most pages/);
});

test('a sitemap file that answers 429/503 is throttled or unavailable, not "no readable sitemap found"', async () => {
  const site = retryAfter => () => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [503, 'text/html', 'busy', null, { 'retry-after': retryAfter }],
    '/': [200, 'text/html', page('Home')],
  });
  const retried = await withSite(site('0'), o => crawl(o));
  assert.ok(!codesOf(retried).includes('NO_SITEMAP'), JSON.stringify(codesOf(retried)));
  const f = retried.findings.find(x => x.code === 'RATE_LIMITED');
  assert.ok(f, JSON.stringify(codesOf(retried)));
  assert.match(f.message, /sitemap/);
  assert.match(f.message, /429\/503/);
  assert.match(f.message, /after one retry/);
  assert.deepEqual(f.evidence.sitemaps.map(u => new URL(u).pathname), ['/sitemap.xml']);
  const waited = await withSite(site('120'), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.equal(waited.hits.filter(h => h === '/sitemap.xml').length, 1);
  assert.ok(!codesOf(waited.res).includes('NO_SITEMAP'));
  const g = waited.res.findings.find(x => x.code === 'RATE_LIMITED');
  assert.doesNotMatch(g.message, /after one retry/);
  assert.match(g.message, /asked to wait longer than the crawler waits/);
});

test('pages that failed or answered 5xx make a crawl partial: their children are ORPHANS_UNVERIFIED, not orphans', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/c1', '/c2'])],
    '/': [200, 'text/html', page('Home', links(['/hub500', '/hubreset']))],
    '/hub500': [500, 'text/html', 'oops'],
    '/hubreset': (req, _res) => req.socket.destroy(),
    '/c1': [200, 'text/html', page('Child one')],
    '/c2': [200, 'text/html', page('Child two')],
  }), o => crawl(o));
  assert.ok(!codesOf(res).includes('ORPHAN_PAGE'), JSON.stringify(res.findings.filter(f => f.code === 'ORPHAN_PAGE')));
  const f = res.findings.find(x => x.code === 'ORPHANS_UNVERIFIED');
  assert.ok(f, JSON.stringify(codesOf(res)));
  assert.deepEqual(f.evidence.urls.map(u => new URL(u).pathname).sort(), ['/c1', '/c2']);
  assert.match(f.message, /failed or answered HTTP 5xx/);
  // A 404 is not that: a page that really has no inlink is still an orphan beside a broken link.
  const plain = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/lonely'])],
    '/': [200, 'text/html', page('Home', links(['/gone']))],
    '/lonely': [200, 'text/html', page('Lonely page')],
  }), o => crawl(o));
  assert.deepEqual(plain.findings.filter(x => x.code === 'ORPHAN_PAGE').map(x => new URL(x.evidence.urls[0]).pathname), ['/lonely']);
  assert.ok(!codesOf(plain).includes('ORPHANS_UNVERIFIED'));
});

test('two pages that name each other as canonical are one CANONICAL_CONFLICT, not two "points elsewhere"', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a'])],
    '/': [200, 'text/html', page('Home', links(['/a', '/b', '/c', '/d']))],
    '/a': [200, 'text/html', page('Page A', '', `<link rel="canonical" href="${o}/b">`)],
    '/b': [200, 'text/html', page('Page B', '', `<link rel="canonical" href="${o}/a">`)],
    '/c': [200, 'text/html', page('Page C', '', `<link rel="canonical" href="${o}/d">`)],
    '/d': [200, 'text/html', page('Page D', '', `<link rel="canonical" href="${o}/d">`)],
  }), o => crawl(o));
  const conflicts = res.findings.filter(f => f.code === 'CANONICAL_CONFLICT');
  assert.equal(conflicts.length, 1, JSON.stringify(conflicts));
  assert.equal(conflicts[0].severity, 'medium');
  assert.equal(conflicts[0].label, 'D');
  assert.deepEqual(conflicts[0].evidence.urls.map(u => new URL(u).pathname).sort(), ['/a', '/b']);
  assert.match(conflicts[0].message, /each other/);
  const elsewhere = res.findings.filter(f => f.code === 'CANONICAL_POINTS_ELSEWHERE').map(f => new URL(f.evidence.urls[0]).pathname);
  assert.deepEqual(elsewhere, ['/c'], 'only the one-way canonical is "points elsewhere"');
  assert.ok(has(res, 'SITEMAP_URL_NOT_CANONICAL', '/a'), 'the sitemap finding is a separate check and stays');
});

test('--help says the other origins of the same site are judged with the start origin\'s robots.txt', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const out = await new Promise(resolve => execFile(process.execPath, [script, '--help'], { timeout: 30000 }, (err, stdout) => resolve(stdout)));
  const flat = out.replace(/\s+/g, ' ');
  assert.match(flat, /www/);
  assert.match(flat, /apex/);
  assert.match(flat, /http and https/);
  assert.match(flat, /CDN/);
  assert.match(flat, /start origin's robots\.txt/);
});

test('a redirect chain that ends at a URL robots.txt refuses is a REDIRECT_CHAIN that does not advise the blocked URL', async () => {
  const res = await withSite(o => ({
    '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /private/\n'],
    '/': [200, 'text/html', page('Home', links(['/hop1']))],
    '/hop1': [301, null, null, '/hop2'],
    '/hop2': [301, null, null, '/private/end'],
    '/private/end': [200, 'text/html', page('Private end')],
  }), async (o, hits) => ({ res: await crawl(o), hits: [...hits] }));
  assert.ok(!res.hits.includes('/private/end'));
  const f = res.res.findings.find(x => x.code === 'REDIRECT_CHAIN');
  assert.ok(f, JSON.stringify(codesOf(res.res)));
  assert.match(f.message, /robots\.txt blocks/);
  assert.doesNotMatch(f.message, /straight to the final URL/);
  assert.equal(f.evidence.hops.length, 2);
});

test('the CLI says on screen when robots.txt blocks the start page, and still exits 0', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cli-'));
  try {
    const out = await withSite(() => ({ '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /\n'], '/': [200, 'text/html', page('Home')] }),
      o => new Promise(resolve => execFile(process.execPath, [script, o + '/', '--delay', '0', '--out', dir], { timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }))));
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /^Crawled 0 pages, /);
    assert.match(out.stdout, /SITE_BLOCKED_BY_ROBOTS/);
    assert.match(out.stdout, /--ignore-robots/);
    assert.match(fs.readFileSync(path.join(dir, 'findings.md'), 'utf8'), /SITE_BLOCKED_BY_ROBOTS/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// A start page that is not 200: one finding says so, orphans are not guessed, and it never doubles up with SITE_UNAVAILABLE.
// ---------------------------------------------------------------------------------------------

const SITEMAP_ONLY = (startRoute, extra = {}) => o => ({
  '/robots.txt': [404, 'text/plain', ''],
  '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a', '/b'])],
  '/': startRoute,
  '/a': [200, 'text/html', page('Page a')],
  '/b': [200, 'text/html', page('Page b')],
  ...extra,
});
const ORPHAN_CODES = ['ORPHAN_PAGE', 'ORPHANS_UNVERIFIED'];

test('START_PAGE_NOT_200: a 404, a 500 and a redirect that ends in an error are one high finding each, with no orphan guesses', async () => {
  for (const [name, route, status, extra] of [
    ['404', [404, 'text/html', '<title>Not found</title>'], 404, {}],
    ['500', [500, 'text/html', 'oops'], 500, {}],
    ['403', [403, 'text/html', 'forbidden'], 403, {}],
    ['redirect to a 404', [302, null, null, '/gone'], 404, { '/gone': [404, 'text/html', 'gone'] }],
  ]) {
    const res = await withSite(SITEMAP_ONLY(route, extra), o => crawl(o));
    const all = res.findings.filter(f => f.code === 'START_PAGE_NOT_200');
    assert.equal(all.length, 1, `${name}: ${JSON.stringify(codesOf(res))}`);
    const f = all[0];
    assert.equal(f.severity, 'high', name);
    assert.equal(f.label, 'D', name);
    assert.match(f.message, new RegExp(`HTTP ${status}`), name);
    assert.deepEqual(f.evidence.urls.map(u => new URL(u).pathname), ['/'], name);
    assert.equal(f.evidence.status, status, name);
    assert.equal(f.evidence.error ?? null, null, name);
    for (const code of ORPHAN_CODES) assert.ok(!codesOf(res).includes(code), `${name}: no ${code} when the start page failed`);
    assert.ok(!codesOf(res).includes('SITE_UNAVAILABLE'), `${name}: 404 and 500 are not an outage`);
    assert.ok(!codesOf(res).includes('SITE_BLOCKED_BY_ROBOTS'), name);
  }
});

test('START_PAGE_NOT_200: a start page that cannot be fetched at all carries the error text', async () => {
  const res = await withSite(SITEMAP_ONLY((req, _res) => req.socket.destroy()), o => crawl(o));
  const f = res.findings.find(x => x.code === 'START_PAGE_NOT_200');
  assert.ok(f, JSON.stringify(codesOf(res)));
  assert.equal(f.severity, 'high');
  const start = res.pages.find(p => p.url.endsWith('/'));
  assert.equal(start.status, null);
  assert.ok(start.error, 'the page record has an error');
  assert.ok(f.message.includes(start.error), f.message);
  assert.equal(f.evidence.status, null);
  assert.equal(f.evidence.error, start.error);
  assert.ok(!res.findings.some(x => ORPHAN_CODES.includes(x.code)));
  // Nothing is listening at all, and robots.txt is not obeyed: the start page is the thing that failed.
  const dead = await crawlSite({ start: 'http://127.0.0.1:9/', max: 5, delayMs: 0, ignoreRobots: true });
  const d = dead.findings.find(x => x.code === 'START_PAGE_NOT_200');
  assert.ok(d, JSON.stringify(codesOf(dead)));
  assert.ok(d.evidence.error);
  assert.ok(d.message.includes(d.evidence.error));
});

test('START_PAGE_NOT_200 and SITE_UNAVAILABLE are disjoint: a start page that answers 429/503 is SITE_UNAVAILABLE only', async () => {
  for (const status of [429, 503]) {
    const res = await withSite(SITEMAP_ONLY([status, 'text/html', 'busy', null, { 'retry-after': '0' }]), o => crawl(o));
    assert.ok(codesOf(res).includes('SITE_UNAVAILABLE'), `${status}: ${JSON.stringify(codesOf(res))}`);
    assert.ok(!codesOf(res).includes('START_PAGE_NOT_200'), `${status}: the outage finding already names the start page`);
    assert.ok(!res.findings.some(x => ORPHAN_CODES.includes(x.code)), `${status}: orphans are not guessed either`);
  }
  // A 404 start page next to pages that are throttled is both facts, stated once each, about different URLs.
  const both = await withSite(o => ({
    '/robots.txt': [404, 'text/plain', ''],
    '/sitemap.xml': [200, 'application/xml', sitemapXml(o, ['/', '/a', '/b', '/c'])],
    '/': [404, 'text/html', 'nothing'],
    '/a': [503, 'text/html', 'busy', null, { 'retry-after': '0' }], '/b': [503, 'text/html', 'busy', null, { 'retry-after': '0' }], '/c': [200, 'text/html', page('Page c')],
  }), o => crawl(o));
  assert.equal(both.findings.filter(x => x.code === 'START_PAGE_NOT_200').length, 1);
  const u = both.findings.find(x => x.code === 'SITE_UNAVAILABLE');
  assert.ok(u && !/the start page/.test(u.message), 'the outage finding is about the pages that were throttled, not the start page');
});

test('START_PAGE_NOT_200 is not raised for a 200 start page, a page robots.txt blocked, or a URL this tool refuses', async () => {
  const ok = await withSite(SITEMAP_ONLY([200, 'text/html', page('Home', links(['/a', '/b']))]), o => crawl(o));
  assert.ok(!codesOf(ok).includes('START_PAGE_NOT_200'));
  const blocked = await withSite(() => ({ '/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /\n'], '/': [200, 'text/html', page('Home')] }), o => crawl(o));
  assert.ok(codesOf(blocked).includes('SITE_BLOCKED_BY_ROBOTS'));
  assert.ok(!codesOf(blocked).includes('START_PAGE_NOT_200'));
  // A private address is something this tool will not fetch: URL_NOT_CHECKED says so, and that is not a site defect.
  const refused = await withSite(SITEMAP_ONLY([302, null, null, 'http://10.255.255.1/private']), o => crawl(o));
  assert.ok(codesOf(refused).includes('URL_NOT_CHECKED'));
  assert.ok(!codesOf(refused).includes('START_PAGE_NOT_200'));
});

test('analyze(): the start page that failed is judged from its own record, and the orphan checks need a readable start page', () => {
  const lonely = rec('https://a.test/lonely', { inSitemap: true });
  const start = rec('https://a.test/', { status: 404, facts: undefined });
  const codes = F => F.map(f => f.code);
  const res = codes(analyzeRecords([start, lonely]));
  assert.deepEqual(res.filter(c => c === 'START_PAGE_NOT_200'), ['START_PAGE_NOT_200']);
  assert.ok(!res.some(c => ORPHAN_CODES.includes(c)), JSON.stringify(res));
  // With a readable start page the same sitemap URL is still an orphan.
  const fine = codes(analyzeRecords([rec('https://a.test/'), lonely]));
  assert.ok(fine.includes('ORPHAN_PAGE'));
  assert.ok(!fine.includes('START_PAGE_NOT_200'));
});

test('the CLI says on screen when the start page is not 200, and still exits 0', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cli-'));
  try {
    const out = await withSite(SITEMAP_ONLY([404, 'text/html', 'nothing']),
      o => new Promise(resolve => execFile(process.execPath, [script, o + '/', '--delay', '0', '--out', dir], { timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }))));
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /START_PAGE_NOT_200/);
    assert.match(fs.readFileSync(path.join(dir, 'findings.md'), 'utf8'), /START_PAGE_NOT_200/);
    assert.match(fs.readFileSync(path.join(dir, 'pages.csv'), 'utf8'), /^http[^,]*\/,404,/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the CLI cannot write --out: a plain message and exit 2, no stack trace', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cli-'));
  try {
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'not a folder');
    const out = await withSite(SITEMAP_ONLY([200, 'text/html', page('Home')]),
      o => new Promise(resolve => execFile(process.execPath, [script, o + '/', '--max', '3', '--delay', '0', '--out', path.join(blocker, 'crawl')], { timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }))));
    assert.equal(out.code, 2, out.stdout + out.stderr);
    assert.match(out.stderr, /Could not write the report to /);
    assert.doesNotMatch(out.stderr, /\n\s+at /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--help says Crawl-delay is not read and --delay sets the pace', async () => {
  const script = fileURLToPath(new URL('./crawl.mjs', import.meta.url));
  const help = await new Promise(resolve => execFile(process.execPath, [script, '--help'], (err, stdout) => resolve(stdout)));
  assert.match(help, /Crawl-delay/);
  assert.match(help, /not read/);
  assert.match(help, /--delay/);
});
