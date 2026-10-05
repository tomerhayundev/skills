import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render, injectProbe } from './render.mjs';
import { findChrome } from './lib/chrome.mjs';
import { pngSize } from './lib/png.mjs';
import { readJson } from './lib/cli.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));

test('injectProbe puts the probe before the last </body>', () => {
  const out = injectProbe('<html><body><p>x</p></body></html>', 'PROBE()');
  assert.match(out, /<p>x<\/p><script data-probe-skip>\nPROBE\(\)\n<\/script>\n<\/body><\/html>$/);
});

test('render measures the page, keeps every version and writes metrics', { skip }, () => {
  const dir = tmp();
  const f = path.join(dir, 'board.html');
  fs.writeFileSync(f, '<!doctype html><html><body style="margin:0;background:#15120E;color:#F4EFE6"><div data-block="a" style="height:1234px"><p style="margin:0">Palette</p></div></body></html>');
  const a = render(f, { width: 400 });
  assert.equal(a.height, 1234);
  assert.deepEqual(pngSize(fs.readFileSync(path.join(dir, 'board-v1.png'))), { width: 400, height: 1234 });
  assert.deepEqual(pngSize(fs.readFileSync(path.join(dir, 'board-v1@2x.png'))), { width: 800, height: 2468 });
  render(f, { width: 400, retina: false });
  for (const n of ['board-v2.png', 'board.png', 'board@2x.png', 'board.metrics.json']) assert.ok(fs.existsSync(path.join(dir, n)), n);
  const m = readJson(path.join(dir, 'board.metrics.json'));
  assert.equal(m.texts[0].text, 'Palette');
  assert.equal(m.blocks[0].id, 'a');
});

test('render refuses a page whose height follows the window', { skip }, () => {
  const f = path.join(tmp(), 'vh.html');
  fs.writeFileSync(f, '<!doctype html><body style="margin:0"><div style="height:150vh"></div></body>');
  assert.throws(() => render(f, { width: 400, retina: false }), /window height/);
});
