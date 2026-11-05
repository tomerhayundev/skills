import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { findChrome } from './lib/chrome.mjs';
import { openBrowser } from './lib/cdp.mjs';
import { pngSize } from './lib/png.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
let srv, base;
before(async () => {
  srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><h1>Live page</h1><script>document.title = "ran " + innerWidth;</script>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

test('a live page opens at a true phone width, runs a script and is photographed at that size', { skip, timeout: 60000 }, async () => {
  const browser = await openBrowser();
  try {
    const page = await browser.open(`${base}/`, { width: 375, height: 812, mobile: true });
    // Below the 500px a headless window can be: the page itself must see 375.
    assert.equal(await page.eval('innerWidth'), 375);
    assert.equal(await page.eval('document.title'), 'ran 375');
    assert.deepEqual(await page.eval('({ h: document.querySelector("h1").textContent })'), { h: 'Live page' });
    assert.deepEqual(pngSize(await page.shot()), { width: 375, height: 812 });
    await page.close();
    const wide = await browser.open(`${base}/`, { width: 1440, height: 900 });
    assert.equal(await wide.eval('innerWidth'), 1440);
    await wide.close();
  } finally { await browser.close(); }
});

test('a script error in the page comes back as an error, not a silent undefined', { skip, timeout: 60000 }, async () => {
  const browser = await openBrowser();
  try {
    const page = await browser.open(`${base}/`, { width: 800, height: 600 });
    await assert.rejects(page.eval('no_such_thing.x'), /no_such_thing/);
  } finally { await browser.close(); }
});

test('cookie banners, sign-up pop-ups and their dark backdrops are hidden before the picture; a real header and the page stay', { skip, timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const clean = readFileSync(new URL('./lib/page-clean.js', import.meta.url), 'utf8');
  const page = `<!doctype html><body style="margin:0;overflow:hidden">
    <header id="bar" style="position:sticky;top:0;height:64px;background:#222;color:#fff">Shop menu</header>
    <section id="hero" style="height:900px;background:#cde">Big picture</section>
    <div id="scrim" style="position:fixed;inset:0;background:rgba(0,0,0,.6)"></div>
    <div id="modal" role="dialog" aria-modal="true" style="position:fixed;top:20%;left:20%;width:60%;height:50%;background:#fff">Join our newsletter</div>
    <div id="cookies" style="position:fixed;bottom:0;left:0;right:0;height:35%;background:#fff">We use cookies. Accept all</div></body>`;
  const local = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
  await new Promise((r) => local.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const p = await browser.open(`http://127.0.0.1:${local.address().port}/`, { width: 1280, height: 800 });
    const r = await p.eval(clean);
    assert.equal(r.hidden, 3, JSON.stringify(r));
    assert.ok(r.covered < 0.05, `still covered: ${r.covered}`);
    const shown = (id) => p.eval(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).display !== 'none' && getComputedStyle(document.getElementById(${JSON.stringify(id)})).visibility !== 'hidden'`);
    assert.equal(await shown('bar'), true);
    assert.equal(await shown('hero'), true);
    assert.equal(await shown('cookies'), false);
    assert.equal(await p.eval('getComputedStyle(document.body).overflow'), 'visible');
  } finally { await browser.close(); local.close(); }
});

test('the design of a live page is read as exact values: palette roles, type ramp, spacing, container and corners', { skip, timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const read = readFileSync(new URL('./lib/design-read.js', import.meta.url), 'utf8');
  const css = `body{margin:0;background:#f2efe7;color:#16211f;font:400 18px/1.6 Arial,sans-serif}
    .wrap{max-width:1200px;margin:0 auto;padding:96px 24px}
    h1{font:400 64px/1.05 Georgia,serif;letter-spacing:-0.02em;margin:0 0 24px}
    h2{font:700 32px/1.2 Arial,sans-serif;margin:48px 0 24px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
    a.btn{display:inline-block;background:#2f6f6a;color:#fff;border-radius:999px;padding:12px 24px;text-decoration:none}`;
  const page = `<!doctype html><style>${css}</style><body><div class="wrap"><h1>Sage Studio</h1><p>A studio for slow things made well, with long paragraphs of real words.</p>
    <a class="btn" href="#">Book a visit</a><h2>What we make</h2><div class="grid"><p>Bowls and cups.</p><p>Plates and jugs.</p></div></div></body>`;
  const local = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
  await new Promise((r) => local.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const p = await browser.open(`http://127.0.0.1:${local.address().port}/`, { width: 1440, height: 900 });
    const d = await p.eval(read);
    const role = (r) => d.palette.find((c) => c.role === r);
    assert.equal(role('background').hex, '#f2efe7', JSON.stringify(d.palette));
    assert.equal(role('text').hex, '#16211f');
    assert.equal(role('accent').hex, '#2f6f6a');
    const t = (r) => d.type.find((x) => x.role === r);
    assert.deepEqual({ ...t('h1') }, { role: 'h1', family: 'Georgia', size: 64, weight: 400, lineHeight: 1.05, tracking: -0.02 });
    assert.equal(t('h2').size, 32);
    assert.equal(t('body').size, 18);
    assert.equal(t('body').family, 'Arial');
    assert.equal(d.container, 1200);
    assert.ok(d.spacing.includes(24) && d.spacing.includes(96), JSON.stringify(d.spacing));
    assert.ok(d.radius.includes(999), JSON.stringify(d.radius));
  } finally { await browser.close(); local.close(); }
});

test('a page built from fixed layers, with a fixed scene behind the text, is the design and not a cover', { skip, timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const clean = readFileSync(new URL('./lib/page-clean.js', import.meta.url), 'utf8');
  const page = `<!doctype html><body style="margin:0">
    <canvas id="scene" style="position:fixed;inset:0;width:100%;height:100%;background:#203040;z-index:0"></canvas>
    <div id="stage" style="position:fixed;inset:0;z-index:1;color:#fff;font:40px Arial;padding:80px">A scroll-driven story told on a fixed stage, with its words on top.</div></body>`;
  const local = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
  await new Promise((r) => local.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const p = await browser.open(`http://127.0.0.1:${local.address().port}/`, { width: 1280, height: 800 });
    const r = await p.eval(clean);
    assert.equal(r.hidden, 0, JSON.stringify(r));
    assert.equal(r.covered, 0);
  } finally { await browser.close(); local.close(); }
});

test('when the big title is a picture, no display type is reported rather than a small label posing as one', { skip, timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const read = readFileSync(new URL('./lib/design-read.js', import.meta.url), 'utf8');
  const page = `<!doctype html><body style="margin:0;font:400 20px/1.6 Arial"><svg width="900" height="200" aria-label="The title"><rect width="900" height="200"/></svg>
    <p style="font-size:14px">A small label</p><p>Body text that runs on for a while, long enough to count as reading.</p><p>And a second paragraph of the same body text.</p></body>`;
  const local = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
  await new Promise((r) => local.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const p = await browser.open(`http://127.0.0.1:${local.address().port}/`, { width: 1280, height: 800 });
    const d = await p.eval(read);
    assert.equal(d.type.some((t) => t.role === 'display'), false, JSON.stringify(d.type));
  } finally { await browser.close(); local.close(); }
});

test('a page that never answers fails within its time limit instead of hanging the whole run', { skip, timeout: 60000 }, async () => {
  const browser = await openBrowser();
  try {
    const page = await browser.open(`${base}/`, { width: 800, height: 600 });
    const t0 = Date.now();
    await assert.rejects(page.eval('new Promise(() => {})', { timeoutMs: 1500 }), /did not answer/);
    assert.ok(Date.now() - t0 < 10000);
  } finally { await browser.close(); }
});

test('a loading screen still drawn over the page is hidden like a pop-up', { skip, timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const clean = readFileSync(new URL('./lib/page-clean.js', import.meta.url), 'utf8');
  const page = `<!doctype html><body style="margin:0;font:20px Arial"><main>${'<p>Real words of the page under the loader, filling the screen line after line.</p>'.repeat(30)}</main>
    <div class="preloader preloader--landing" style="position:fixed;inset:0;background:#2f3032;z-index:200"><div class="preloader__cell">Loading 64%</div></div></body>`;
  const local = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); });
  await new Promise((r) => local.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const p = await browser.open(`http://127.0.0.1:${local.address().port}/`, { width: 1280, height: 800 });
    const r = await p.eval(clean);
    assert.equal(r.hidden, 1, JSON.stringify(r));
    assert.equal(r.covered, 0);
  } finally { await browser.close(); local.close(); }
});

test('with an allow rule, every request the page makes is checked in the browser and refused ones are never sent', { skip, timeout: 60000 }, async () => {
  const seen = [];
  const s2 = http.createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/page' ? '<!doctype html><body><h1>Page</h1><img src="/secret.png"><iframe src="/frame"></iframe><script>fetch("/api").catch(function(){}); document.title = "ran";</script>' : 'x');
  });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${s2.address().port}`;
  const browser = await openBrowser();
  try {
    const asked = [];
    const allow = async (u) => { asked.push(u); return new URL(u).pathname === '/page'; };
    const page = await browser.open(`${at}/page`, { allow, settleMs: 800 });
    assert.equal(await page.eval('document.title'), 'ran', 'the allowed page still loads and runs');
    assert.deepEqual(seen, ['/page'], 'nothing refused ever reached the server');
    for (const p of ['/secret.png', '/frame', '/api']) assert.ok(asked.some((u) => u.endsWith(p)), `${p} was checked`);
    await assert.rejects(browser.open(`${at}/elsewhere`, { allow }), /refused|did not open/);
    assert.equal(seen.includes('/elsewhere'), false);
  } finally { await browser.close(); s2.close(); }
});

test('a frame from another site is guarded too: its own refused requests never leave', { skip, timeout: 60000 }, async () => {
  const seen = [];
  const s3 = http.createServer((req, res) => {
    seen.push(`${req.headers.host.split(':')[0]}${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html' });
    const port = s3.address().port;
    if (req.url === '/page') return res.end(`<!doctype html><body><h1>Page</h1><iframe src="http://localhost:${port}/frame"></iframe>`);
    if (req.url === '/frame') return res.end('<!doctype html><body>frame<img src="/inner.png"><script>fetch("/inner-api").catch(function(){})</script>');
    res.end('x');
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${s3.address().port}`;
  const browser = await openBrowser();
  try {
    const allow = async (u) => ['/page', '/frame'].includes(new URL(u).pathname);
    const page = await browser.open(`${at}/page`, { allow, settleMs: 1500 });
    await page.close();
    assert.ok(seen.includes('localhost/frame'), `the allowed frame loaded (${seen.join(', ')})`);
    assert.equal(seen.some((p) => p.includes('/inner')), false, `nothing refused left the frame (${seen.join(', ')})`);
  } finally { await browser.close(); s3.close(); }
});
