import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { pngSize } from './lib/png.mjs';
import { buildSite } from './build.mjs';
import { criticPack } from './critic-pack.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

test('the pack holds the first screens, every page in full at two widths, and the prompt', { skip }, () => {
  const site = tmp();
  buildSite(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), site);
  const out = tmp();
  const brief = { business: 'a small room builder', primaryAction: 'Book a visit', arrivals: ['a neighbour on a phone'] };
  const res = criticPack(site, { brief, meterReport: '0 failures, 1 warnings', out });
  for (const f of ['first-375.png', 'first-1440.png', 'page-home-375.png', 'page-home-1440.png', 'page-about-375.png', 'page-contact-1440.png', 'index.md']) assert.ok(res.files.includes(f) && fs.existsSync(path.join(out, f)), f);
  assert.equal(res.files.some((f) => /404|_review/.test(f)), false);
  assert.deepEqual(pngSize(fs.readFileSync(path.join(out, 'first-375.png'))).width, 375);
  const tall = pngSize(fs.readFileSync(path.join(out, 'page-home-375.png')));
  assert.ok(tall.height > 900, `full page is ${tall.height}px tall`);
  const md = fs.readFileSync(path.join(out, 'index.md'), 'utf8');
  for (const s of ['5-second', 'Book a visit', 'caps at 6', 'caps at 5', 'creativity at 7', 'at most 5 fixes', '0 failures, 1 warnings']) assert.ok(md.includes(s), s);
});

test('review 8: a full-screen hero stays one screen tall in the full-page picture', { skip }, async () => {
  const { fullPageShot } = await import('./critic-pack.mjs');
  const { decodePng } = await import('./lib/png.mjs');
  const dir = tmp();
  const f = path.join(dir, 'p.html');
  fs.writeFileSync(f, '<!doctype html><style>body{margin:0}.h{block-size:100vh;background:#ff0000}.g{block-size:1000px;background:#00ff00}</style><div class="h"></div><div class="g"></div>');
  const out = path.join(dir, 'full.png');
  fullPageShot(f, out, { width: 1024, viewport: 900 });
  const img = decodePng(fs.readFileSync(out));
  assert.equal(img.height, 1900);
  const px = (y) => [...img.data.subarray((y * img.width + 10) * 4, (y * img.width + 10) * 4 + 3)];
  assert.deepEqual(px(850), [255, 0, 0]);
  assert.deepEqual(px(950), [0, 255, 0]);
  assert.deepEqual(px(1890), [0, 255, 0]);
});
