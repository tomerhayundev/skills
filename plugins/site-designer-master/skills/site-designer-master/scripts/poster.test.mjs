import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { buildSite } from './build.mjs';
import { makePosters } from './poster.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const FIX = path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

function src(body) {
  const d = tmp();
  fs.cpSync(FIX, d, { recursive: true });
  const p = path.join(d, 'pages', 'about.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + body);
  return d;
}
const webpSize = (buf) => {
  // VP8X carries the canvas size; VP8 and VP8L carry it in their own headers.
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  const b = buf.readUInt32LE(21);
  return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
};

test('each scene gets its poster drawn from the scene itself, at the scene\'s size, and the build then passes', { skip }, async () => {
  const s = src('<div data-scene="points" style="aspect-ratio:3/2"><img src="/assets/globe-poster.webp" alt="" width="1200" height="800"></div>');
  assert.ok(buildSite(s, tmp()).errors.some((e) => /globe-poster/.test(e)), 'before: the poster is missing');
  const made = await makePosters(s, { width: 1440 });
  assert.deepEqual(made.errors, []);
  assert.deepEqual(made.written, ['assets/globe-poster.webp']);
  const buf = fs.readFileSync(path.join(s, 'assets', 'globe-poster.webp'));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const { w, h } = webpSize(buf);
  assert.ok(w > 300 && Math.abs(w / h - 1.5) < 0.05, `${w}x${h}`);
  assert.deepEqual(buildSite(s, tmp()).errors, []);
});

test('a ripple scene keeps its own picture: its poster is the photograph, never redrawn', { skip }, async () => {
  const s = src('<div data-scene="ripple"><img src="/assets/room.svg" alt="" width="1200" height="800"></div>');
  const before = fs.readFileSync(path.join(s, 'assets', 'room.svg'));
  const made = await makePosters(s, { width: 1440 });
  assert.deepEqual(made.written, []);
  assert.deepEqual(fs.readFileSync(path.join(s, 'assets', 'room.svg')), before);
});

test('a poster outside the site\'s assets folder is refused, never written', { skip }, async () => {
  const s = src('<div data-scene="points"><img src="/../../outside.webp" alt="" width="1200" height="800"></div>');
  const made = await makePosters(s, { width: 1440 });
  assert.deepEqual(made.written, []);
  assert.ok(made.errors.some((e) => /assets/.test(e)), made.errors.join('\n'));
});
