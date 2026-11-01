import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome, dumpDom, screenshot, readProbe, EMIT_JS } from './chrome.mjs';
import { pngSize } from './png.mjs';

const CHROME = findChrome();
const skip = !CHROME && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

test('findChrome returns an existing path or null', () => {
  assert.ok(CHROME === null || fs.existsSync(CHROME));
});

test('dumpDom runs the page script and readProbe returns what it emitted', { skip }, () => {
  const f = path.join(tmp(), 'p.html');
  fs.writeFileSync(f, `<!doctype html><body><script>${EMIT_JS}(async()=>{await new Promise(r=>setTimeout(r,50));__emit({ok:true,w:innerWidth,lt:'<b>'})})();</script>`);
  assert.deepEqual(readProbe(dumpDom(f, { width: 800, height: 600 })), { ok: true, w: 800, lt: '<b>' });
});

test('screenshot writes a PNG of the asked size and scale', { skip }, () => {
  const dir = tmp();
  const f = path.join(dir, 's.html');
  fs.writeFileSync(f, '<!doctype html><body style="margin:0;background:#C9A24B">');
  const out = screenshot(f, path.join(dir, 's.png'), { width: 600, height: 400, scale: 2 });
  assert.deepEqual(pngSize(fs.readFileSync(out)), { width: 1200, height: 800 });
});

test('framed pages see exactly the width asked, even below the browser minimum', { skip }, async () => {
  const { probeAtWidth, screenshotAtWidth } = await import('./chrome.mjs');
  const { decodePng } = await import('./png.mjs');
  const dir = tmp();
  const f = path.join(dir, 'p.html');
  fs.writeFileSync(f, `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#ff0000}@media (max-width:400px){body{background:#00ff00}}</style><body><p>x</p><script>__emit({iw:innerWidth,mq:matchMedia('(max-width: 400px)').matches})</script>`);
  assert.deepEqual(probeAtWidth(f, { width: 375, height: 700 }), { iw: 375, mq: true });
  assert.deepEqual(probeAtWidth(f, { width: 1024, height: 700 }), { iw: 1024, mq: false });
  const out = path.join(dir, 's.png');
  screenshotAtWidth(f, out, { width: 375, height: 300 });
  const img = decodePng(fs.readFileSync(out));
  assert.deepEqual([img.width, img.height], [375, 300]);
  assert.deepEqual([...img.data.subarray(0, 3)], [0, 255, 0]);
  const x = (300 - 1) * 375 * 4 + (375 - 1) * 4;
  assert.deepEqual([...img.data.subarray(x, x + 3)], [0, 255, 0], 'the far corner is the page, not blank');
});
