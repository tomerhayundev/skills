import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fontsUrl, tokensCss, writeTokens } from './tokens.mjs';
import { designMd } from './design-md.mjs';
import { sampleBrand, writeSampleBrand } from './fixtures/sample-brand.mjs';
import { loadData } from './lib/brand.mjs';

const data = loadData();

test('tokens.css carries every role, its text colour, scales, fonts and shape', () => {
  const css = tokensCss(sampleBrand(), data);
  for (const v of ['--color-primary: #C9A24B;', '--color-primary-on: #15120E;', '--color-neutral-dark: #15120E;', '--primary-500:', '--font-display: "Gloock", Georgia, serif;', '--radius: 2px;', '--clear-space: 0.25;']) assert.ok(css.includes(v), v);
  assert.match(css, /@font-face \{ font-family: "Gloock"; src: url\("fonts\/Gloock-Regular\.ttf"\)/);
});

test('fontsUrl lists Google families with sorted weights, and none when all are bundled', () => {
  const b = sampleBrand();
  assert.equal(fontsUrl(b), null);
  b.type.display = { family: 'Cormorant Garamond', weights: [600, 400], fallback: 'Georgia, serif', source: 'google', license: 'OFL-1.1' };
  assert.equal(fontsUrl(b), 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&display=swap');
});

test('writeTokens writes tokens.css next to brand.json and copies base.css and bundled fonts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));
  writeSampleBrand(dir);
  writeTokens(path.join(dir, 'brand.json'), data);
  for (const f of ['tokens.css', 'base.css', 'fonts/Gloock-Regular.ttf', 'fonts/InstrumentSans-Regular.ttf', 'fonts/InstrumentSans-Bold.ttf', 'fonts/Gloock-OFL.txt']) assert.ok(fs.existsSync(path.join(dir, f)), f);
});

test('DESIGN.md names every colour with its hex and role, and has no em dash', () => {
  const md = designMd(sampleBrand(), data);
  assert.match(md, /^# Aurelle: design system/);
  assert.ok(md.includes('**Aurelle Gold (#C9A24B)**'));
  assert.ok(md.includes('Quiet luxury'));
  assert.ok(!md.includes('\u2014'));
  for (const h of ['## Visual theme', '## Colour', '## Typography', '## Shape and pattern', '## Logo', '## Voice', '## Anti-patterns']) assert.ok(md.includes(h), h);
});
