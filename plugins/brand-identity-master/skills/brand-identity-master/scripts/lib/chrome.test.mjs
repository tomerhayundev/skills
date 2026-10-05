import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome, dumpDom, screenshot, readProbe, EMIT_JS } from './chrome.mjs';
import { pngSize } from './png.mjs';

const CHROME = findChrome();
const skip = !CHROME && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));

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
