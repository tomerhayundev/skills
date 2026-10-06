import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { svgColors, svgSize, snapToDeclared, readLogo, decodeImage } from './sample-logo.mjs';
import { findChrome } from './lib/chrome.mjs';
import { encodePng } from './lib/png.mjs';
import { deltaOk } from './lib/color.mjs';
import { sha256File } from './lib/cli.mjs';
import { makeImage, fillCircle } from './fixtures/draw.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));
const TWO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120"><rect x="10" y="10" width="100" height="100" fill="#1E40AF"/><rect x="110" y="10" width="100" height="100" style="fill:#10b981"/></svg>';

test('svgColors reads fills, strokes and stops, expanding short hex', () => {
  const svg = '<svg><path fill="#abc"/><circle stroke="#C9A24B"/><stop stop-color="#c9a24b"/><g style="fill: #112233"/><path fill="url(#g)"/></svg>';
  assert.deepEqual(svgColors(svg), [{ hex: '#C9A24B', uses: 2 }, { hex: '#AABBCC', uses: 1 }, { hex: '#112233', uses: 1 }]);
});

test('svgSize prefers width and height, falls back to the viewBox', () => {
  assert.deepEqual(svgSize(TWO), { width: 220, height: 120 });
  assert.deepEqual(svgSize('<svg width="300px" height="150" viewBox="0 0 200 100">'), { width: 300, height: 150 });
  assert.deepEqual(svgSize('<svg width="100%" viewBox="0 0 64 32">'), { width: 64, height: 32 });
  assert.equal(svgSize('<svg>'), null);
});

test('snapToDeclared moves a sampled colour onto the file colour it came from', () => {
  const out = snapToDeclared([{ hex: '#1F41AE', share: 0.6 }, { hex: '#10B880', share: 0.4 }], [{ hex: '#1E40AF', uses: 1 }, { hex: '#10B981', uses: 1 }]);
  assert.deepEqual(out.map((o) => o.hex), ['#1E40AF', '#10B981']);
});

test('readLogo on a transparent two-colour SVG', { skip }, () => {
  const f = path.join(tmp(), 'two.svg');
  fs.writeFileSync(f, TWO);
  const r = readLogo(f);
  assert.equal(r.background.kind, 'transparent');
  assert.deepEqual(r.inks.map((i) => i.hex).sort(), ['#10B981', '#1E40AF']);
  assert.equal(r.naturalWidth, 220);
  assert.equal(r.shape.parts, 1);
  assert.ok(r.minSize.screenPx >= 24);
});

test('readLogo on a PNG with a white ground does not take white as a colour', { skip }, () => {
  const img = makeImage(240, 240, [255, 255, 255, 255]);
  fillCircle(img, 120, 120, 80, [230, 120, 30, 255]);
  const f = path.join(tmp(), 'orange.png');
  fs.writeFileSync(f, encodePng(img.width, img.height, img.data));
  const r = readLogo(f);
  assert.equal(r.background.kind, 'solid');
  assert.equal(r.inks.length, 1);
  assert.ok(deltaOk(r.inks[0].hex, '#E6781E') < 0.02);
});

// A raster that is slow to decode: the browser decodes it off the page's thread, which virtual time does not
// wait for, so a page that awaited img.decode() was dumped before it reported (CI failed this way).
test('decodeImage reads a raster that is slow to decode, pixel for pixel', { skip }, () => {
  const n = 1200;
  const data = new Uint8Array(crypto.randomBytes(n * n * 4));
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const f = path.join(tmp(), 'noise.png');
  fs.writeFileSync(f, encodePng(n, n, data));
  const d = decodeImage(f, { maxSide: n });
  assert.deepEqual([d.img.width, d.img.height], [n, n]);
  for (const p of [0, 1, n * n >> 1, n * n - 1]) assert.deepEqual([...d.img.data.subarray(p * 4, p * 4 + 4)], [...data.subarray(p * 4, p * 4 + 4)]);
});

test('the CLI copies the logo unchanged and writes logo-read.json', { skip }, () => {
  const dir = tmp();
  const f = path.join(dir, 'two.svg');
  fs.writeFileSync(f, TWO);
  execFileSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-logo.mjs'), f, '--brand-dir', path.join(dir, 'brand')]);
  assert.equal(sha256File(path.join(dir, 'brand', 'logo', 'original.svg')), sha256File(f));
  assert.ok(fs.existsSync(path.join(dir, 'brand', 'logo-read.json')));
});

test('a symbol with a wordmark gets a minimum size that keeps it 24 px tall', { skip }, () => {
  const f = path.join(tmp(), 'lockup.svg');
  fs.writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><rect x="10" y="20" width="80" height="80" fill="#2E5BFF"/><rect x="140" y="50" width="170" height="20" fill="#0F172A"/></svg>');
  const r = readLogo(f);
  assert.equal(r.shape.parts, 2);
  assert.ok(r.minSize.screenPx >= 64, String(r.minSize.screenPx));
});
