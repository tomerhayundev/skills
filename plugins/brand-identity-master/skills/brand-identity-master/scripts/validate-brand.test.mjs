import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBrand, loadData } from './lib/brand.mjs';
import { writeSampleBrand } from './fixtures/sample-brand.mjs';

const data = loadData();
const fresh = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-')); return { dir, brand: writeSampleBrand(dir) }; };
const run = (brand, dir) => validateBrand(brand, { brandDir: dir, data });

test('the sample brand is valid', () => {
  const { dir, brand } = fresh();
  assert.deepEqual(run(brand, dir).errors, []);
});

const cases = [
  ['a missing section', (b) => { delete b.voice; }, 'E_MISSING'],
  ['an unknown direction', (b) => { b.identity.direction = 'baroque'; }, 'E_DIRECTION'],
  ['an axis out of range', (b) => { b.identity.axes.luxury = 7; }, 'E_AXES'],
  ['a conclusion without basis', (b) => { delete b.identity.basis.audience; }, 'E_BASIS'],
  ['two mood words', (b) => { b.atmosphere.mood = ['quiet', 'warm']; }, 'E_ATMOSPHERE'],
  ['a changed logo file', (b, dir) => { fs.appendFileSync(path.join(dir, 'logo', 'original.svg'), ' '); }, 'E_LOGO_CHANGED'],
  ['a missing version', (b) => { delete b.logo.versions.monoLight; }, 'E_LOGO_VERSION'],
  ['a lowercase hex', (b) => { b.color.roles.primary.hex = '#c9a24b'; }, 'E_COLOR'],
  ['an unnamed colour', (b) => { b.color.roles.primary.name = null; }, 'E_COLOR_NAME'],
  ['a wrong contrast number', (b) => { b.color.roles.primary.contrast = 9.9; }, 'E_CONTRAST_VALUE'],
  ['text that fails contrast', (b) => { Object.assign(b.color.roles.secondary, { on: '#15120E', contrast: 3.22 }); }, 'E_CONTRAST'],
  ['pure black text', (b) => { Object.assign(b.color.roles.text, { hex: '#000000', rgb: [0, 0, 0], on: '#F4EFE6', contrast: 18.68 }); }, 'E_PURE_BLACK'],
  ['a scale that does not darken', (b) => { b.color.primitives.primary[500] = '#FFFFFF'; }, 'E_SCALE'],
  ['an unknown font', (b) => { b.type.display.family = 'Comic Display'; }, 'E_FONT_UNKNOWN'],
  ['a weight the font lacks', (b) => { b.type.display.weights = [700]; }, 'E_FONT_WEIGHT'],
  ['a bundled weight that is not shipped', (b) => { b.type.text.weights = [500]; }, 'E_FONT_BUNDLED'],
  ['a Hebrew brand with a Latin-only font', (b) => { b.type.script = 'hebrew'; }, 'E_FONT_SCRIPT'],
  ['an unknown pattern recipe', (b) => { b.shape.pattern.recipe = 'confetti'; }, 'E_SHAPE'],
  ['copy from a site without its url', (b) => { delete b.copy[0].url; }, 'E_COPY_SOURCE'],
  ['an emoji', (b) => { b.atmosphere.feelsLike = 'A lamp left on \u{1F56F}'; }, 'E_EMOJI'],
];

for (const [name, mutate, code] of cases) {
  test(`refuses ${name} (${code})`, () => {
    const { dir, brand } = fresh();
    mutate(brand, dir);
    const r = run(brand, dir);
    assert.ok(r.errors.some((e) => e.code === code), JSON.stringify(r.errors));
  });
}

test('a cliche is a warning, not an error', () => {
  const { dir, brand } = fresh();
  brand.voice.dontSay[1] = 'Elevate your stay';
  const r = run(brand, dir);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.code === 'W_CLICHE'));
});

test('fonts that are not a listed pairing of the direction warn', () => {
  const { dir, brand } = fresh();
  brand.type.text = { family: 'Work Sans', weights: [400, 700], fallback: 'Arial, sans-serif', source: 'bundled', license: 'OFL-1.1' };
  const r = run(brand, dir);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.code === 'W_PAIRING'));
});
