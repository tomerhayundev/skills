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
