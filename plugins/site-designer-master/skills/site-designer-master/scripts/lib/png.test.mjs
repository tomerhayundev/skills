import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { encodePng, pngSize } from './png.mjs';

test('encodePng writes a valid PNG whose size reads back', () => {
  const rgba = new Uint8Array(3 * 2 * 4).fill(255);
  const buf = encodePng(3, 2, rgba);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(pngSize(buf), { width: 3, height: 2 });
  const idat = buf.indexOf('IDAT');
  const len = buf.readUInt32BE(idat - 4);
  const raw = zlib.inflateSync(buf.subarray(idat + 4, idat + 4 + len));
  assert.equal(raw.length, (3 * 4 + 1) * 2);
});

test('decodePng reads back what encodePng wrote, and cropPng keeps the left part', async () => {
  const { decodePng, cropPng } = await import('./png.mjs');
  const w = 4, h = 2, px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([i * 10, 255 - i * 10, 7, 255], i * 4);
  const img = decodePng(encodePng(w, h, px));
  assert.equal(img.width, 4);
  assert.deepEqual([...img.data.subarray(4, 8)], [10, 245, 7, 255]);
  const cut = decodePng(cropPng(encodePng(w, h, px), 2, 2));
  assert.deepEqual([cut.width, cut.height], [2, 2]);
  assert.deepEqual([...cut.data.subarray(8, 12)], [40, 215, 7, 255]);
});
