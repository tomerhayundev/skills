import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { capturePreview, captureSite, readSiteDesign, webpSize, recordCapture, mergeCaptures } from './capture.mjs';
import { openBrowser } from './lib/cdp.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const page = pathToFileURL(path.join(SKILL_DIR, 'scripts', 'fixtures', 'capture', 'page.html')).href;

test('a page becomes a 640x400 card picture and a 1280x800 large picture, both WebP', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const r = await capturePreview(page, out, 'demo');
  assert.deepEqual([r.preview, r.large], ['demo.webp', 'demo-large.webp']);
  assert.ok(r.share > 0 && r.share < 0.985);
  const thumb = fs.readFileSync(path.join(out, 'demo.webp'));
  assert.equal(thumb.toString('ascii', 0, 4), 'RIFF');
  assert.equal(thumb.toString('ascii', 8, 12), 'WEBP');
  assert.deepEqual(webpSize(thumb), { width: 640, height: 400 });
  assert.deepEqual(webpSize(fs.readFileSync(path.join(out, 'demo-large.webp'))), { width: 1280, height: 800 });
  assert.ok(thumb.length < 80 * 1024, `${thumb.length} bytes`);
});

test('a page that does not load gives no picture and says why', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  await assert.rejects(capturePreview('http://127.0.0.1:9/', out, 'dead', { timeoutMs: 20000 }), /no picture/);
  assert.equal(fs.existsSync(path.join(out, 'dead.webp')), false);
});

test('a blank or loading screen is refused, and our own sheets can opt out of that check', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const blank = pathToFileURL(path.join(SKILL_DIR, 'scripts', 'fixtures', 'capture', 'blank.html')).href;
  await assert.rejects(capturePreview(blank, out, 'blank'), /no picture: .*blank or still loading/);
  assert.equal(fs.existsSync(path.join(out, 'blank.webp')), false);
  const ok = await capturePreview(blank, out, 'sheet', { checkBlank: false });
  assert.equal(ok.preview, 'sheet.webp');
});

test('a recheck removes pictures that turn out blank, and keeps good ones', { skip }, async () => {
  const { recheckPack } = await import('./capture.mjs');
  const pack = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const blank = pathToFileURL(path.join(SKILL_DIR, 'scripts', 'fixtures', 'capture', 'blank.html')).href;
  await capturePreview(blank, path.join(pack, 'sites'), 'b1', { checkBlank: false });
  await capturePreview(page, path.join(pack, 'sites'), 'g1');
  const shelf = { entries: [{ id: 'b1', preview: 'sites/b1.webp', large: 'sites/b1-large.webp' }, { id: 'g1', preview: 'sites/g1.webp', large: 'sites/g1-large.webp' }] };
  const removed = recheckPack(shelf, pack);
  assert.deepEqual(removed, ['b1']);
  assert.equal(fs.existsSync(path.join(pack, 'sites', 'b1.webp')), false);
  assert.equal(fs.existsSync(path.join(pack, 'sites', 'b1-large.webp')), false);
  assert.equal(fs.existsSync(path.join(pack, 'sites', 'g1.webp')), true);
});

test('each capture records a picture fingerprint that changes when the page changes', { skip }, async () => {
  const { hashDistance } = await import('./capture.mjs');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const a = await capturePreview(page, out, 'a');
  const b = await capturePreview(page, out, 'b');
  const blank = pathToFileURL(path.join(SKILL_DIR, 'scripts', 'fixtures', 'capture', 'blank.html')).href;
  const c = await capturePreview(blank, out, 'c', { checkBlank: false });
  assert.match(a.hash, /^[0-9a-f]{16}$/);
  assert.ok(hashDistance(a.hash, b.hash) <= 2);
  assert.ok(hashDistance(a.hash, c.hash) > 10);
});

async function magentaShare(webp) {
  const b = await openBrowser();
  try {
    const p = await b.open('about:blank', { width: 400, height: 300, settleMs: 0 });
    return await p.eval(`new Promise((done) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200) n++; done(n / (d.length / 4)); }; im.src = 'data:image/webp;base64,${webp.toString('base64')}'; })`);
  } finally { await b.close(); }
}

const fixture = (f) => pathToFileURL(path.join(SKILL_DIR, 'scripts', 'fixtures', 'capture', f)).href;

test('a live site gives a card, a large and a true phone picture, with pop-ups hidden and its design read as values', { skip, timeout: 120000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const r = await captureSite(fixture('popup.html'), out, 'sage');
  assert.deepEqual([r.preview, r.large, r.phone], ['sage.webp', 'sage-large.webp', 'sage-phone.webp']);
  assert.deepEqual(webpSize(fs.readFileSync(path.join(out, 'sage.webp'))), { width: 640, height: 400 });
  assert.deepEqual(webpSize(fs.readFileSync(path.join(out, 'sage-phone.webp'))), { width: 390, height: 844 });
  assert.equal(r.cleaned.desktop.hidden, 1);
  assert.equal(r.cleaned.phone.hidden, 1);
  // The magenta cookie banner is gone from the pictures themselves, read back pixel by pixel.
  for (const f of ['sage-large.webp', 'sage-phone.webp']) {
    const share = await magentaShare(fs.readFileSync(path.join(out, f)));
    assert.ok(share < 0.01, `${f}: magenta share ${share}`);
  }
  assert.equal(r.design.palette.find((c) => c.role === 'background').hex, '#f2efe7');
  assert.equal(r.design.type.find((t) => t.role === 'h1').size, 64);
});

test('a picture still covered by a panel after the pop-ups are hidden is refused, and says why', { skip, timeout: 120000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  await assert.rejects(captureSite(fixture('covered.html'), out, 'covered'), /no picture: .*covered/);
});

test('the background is the colour the first screen shows, and the biggest words count as the display type', { skip, timeout: 120000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const r = await captureSite(fixture('orange.html'), out, 'orange');
  assert.equal(r.design.palette.find((c) => c.role === 'background').hex, '#ff6a13', JSON.stringify(r.design.palette));
  const display = r.design.type.find((t) => t.role === 'display');
  assert.equal(display.size, 120, JSON.stringify(r.design.type));
  assert.equal(display.family, 'Impact');
});


test('results from parallel capture runs are kept as lines and merged into the shelf once, latest line winning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const shelf = path.join(dir, 'sites.json');
  fs.writeFileSync(shelf, JSON.stringify({ shelf: 'sites', entries: [{ id: 'a', preview: 'sites/a.webp' }, { id: 'b', preview: 'sites/b.webp' }] }));
  const log = path.join(dir, 'captured.jsonl');
  recordCapture(log, 'a', { phone: 'sites/a-phone.webp', design: { container: 900 } });
  recordCapture(log, 'b', { phone: 'sites/b-phone.webp', design: null });
  recordCapture(log, 'a', { phone: 'sites/a-phone.webp', design: { container: 1200 } });
  const n = mergeCaptures(shelf, log);
  assert.equal(n, 2);
  const back = JSON.parse(fs.readFileSync(shelf, 'utf8'));
  assert.equal(back.entries[0].design.container, 1200);
  assert.equal(back.entries[1].phone, 'sites/b-phone.webp');
  assert.equal('design' in back.entries[1], false);
});

test('a curtain that lifts by itself a few seconds later is waited for, not refused', { skip, timeout: 120000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const r = await captureSite(fixture('late.html'), out, 'late', { settleMs: 1000 });
  assert.equal(r.preview, 'late.webp');
});

test('a photo filling the first screen is reported as colours shown, not as the page background', { skip, timeout: 120000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const r = await captureSite(fixture('photo.html'), out, 'photo');
  assert.equal(r.design.palette.find((c) => c.role === 'background').hex, '#f4f1ea', JSON.stringify(r.design.palette));
  assert.ok(r.design.shown.length && r.design.shown[0].share > 0.3, JSON.stringify(r.design.shown));
});

test('the design alone can be read again without taking new pictures', { skip, timeout: 120000 }, async () => {
  const d = await readSiteDesign(fixture('photo.html'));
  assert.equal(d.palette.find((c) => c.role === 'background').hex, '#f4f1ea');
  assert.ok(d.shown.length);
  assert.ok(d.type.some((t) => t.role === 'display' && t.size === 120), JSON.stringify(d.type));
});


test('a screen still loading is waited for before its design is read, never read as the design', { skip, timeout: 120000 }, async () => {
  const d = await readSiteDesign(fixture('late.html'), { settleMs: 1000 });
  assert.equal(d.palette.find((c) => c.role === 'background').hex, '#f4f1ea', JSON.stringify(d.palette));
  assert.ok(d.shown[0].share < 0.985);
});
