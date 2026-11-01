import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';
import { parseFontCss, coversScript, fetchFamilies, cssUrl } from './fonts.mjs';

const fx = (n) => fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'fixtures', n), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

// A fetch that answers the stylesheet request with a saved response and every font file with a few bytes.
const fakeFetch = (cssByFamily) => async (url) => {
  const u = String(url);
  if (u.includes('/css2?')) {
    const fam = decodeURIComponent(/family=([^:&]+)/.exec(u)[1]).replace(/\+/g, ' ');
    return new Response(cssByFamily[fam] ?? '', { status: cssByFamily[fam] ? 200 : 400 });
  }
  return new Response(new Uint8Array([119, 79, 70, 50]), { status: 200 });
};

test('a stylesheet response parses into faces with their subsets', () => {
  const faces = parseFontCss(fx('fonts-css-hebrew.txt'));
  assert.equal(faces.length, 12);
  const f = faces.find((x) => x.subset === 'hebrew' && x.weight === '400');
  assert.equal(f.family, 'Rubik');
  assert.equal(f.style, 'normal');
  assert.match(f.url, /^https:\/\/fonts\.gstatic\.com\/.+\.woff2$/);
  assert.match(f.unicodeRange, /U\+0590-05FF/);
  assert.deepEqual([...new Set(faces.map((x) => x.subset))].sort(), ['arabic', 'cyrillic', 'cyrillic-ext', 'hebrew', 'latin', 'latin-ext']);
});

test('script coverage comes from the subsets', () => {
  assert.equal(coversScript(parseFontCss(fx('fonts-css-hebrew.txt')), 'hebrew'), true);
  assert.equal(coversScript(parseFontCss(fx('fonts-css-latin.txt')), 'hebrew'), false);
  assert.equal(coversScript(parseFontCss(fx('fonts-css-latin.txt')), 'latin'), true);
});

test('the request asks for the named family and only its weights', () => {
  assert.equal(cssUrl({ name: 'Rubik', weights: [700, 400] }), 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;700&display=swap');
  assert.equal(cssUrl({ name: 'Open Name', weights: [400] }), 'https://fonts.googleapis.com/css2?family=Open+Name:wght@400&display=swap');
});

test('a Hebrew site keeps only the hebrew and latin files and points at local copies', async () => {
  const out = tmp();
  const res = await fetchFamilies([{ name: 'Rubik', weights: [400, 700], scripts: ['hebrew', 'latin'] }], out, { fetch: fakeFetch({ Rubik: fx('fonts-css-hebrew.txt') }) });
  assert.deepEqual(res.missing, []);
  assert.equal(res.files.length, 6);
  for (const f of res.files) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(res.files.every((f) => /^assets\/fonts\/rubik-(400|700)-normal-(hebrew|latin|latin-ext)\.woff2$/.test(f)), res.files.join());
  assert.doesNotMatch(res.css, /gstatic/);
  assert.match(res.css, /url\(assets\/fonts\/rubik-400-normal-hebrew\.woff2\) format\('woff2'\)/);
  assert.match(res.css, /font-display: swap/);
  assert.equal(fs.readFileSync(path.join(out, 'fonts.css'), 'utf8'), res.css);
});

test('a family without Hebrew glyphs is reported as missing for a Hebrew site', async () => {
  const res = await fetchFamilies([{ name: 'Fraunces', weights: [400], scripts: ['hebrew', 'latin'] }], tmp(), { fetch: fakeFetch({ Fraunces: fx('fonts-css-latin.txt') }) });
  assert.deepEqual(res.missing, [{ family: 'Fraunces', script: 'hebrew' }]);
});

test('a family the font service does not know is reported, not thrown', async () => {
  const res = await fetchFamilies([{ name: 'No Such Face', weights: [400], scripts: ['latin'] }], tmp(), { fetch: fakeFetch({}) });
  assert.deepEqual(res.missing, [{ family: 'No Such Face', script: 'latin' }]);
});

test('the real font service answers', { skip: process.env.SITE_OFFLINE === '1' && 'offline' }, async () => {
  const out = tmp();
  const res = await fetchFamilies([{ name: 'Rubik', weights: [400], scripts: ['hebrew'] }], out);
  assert.deepEqual(res.missing, []);
  const first = fs.readFileSync(path.join(out, res.files[0]));
  assert.equal(first.subarray(0, 4).toString('latin1'), 'wOF2');
});
