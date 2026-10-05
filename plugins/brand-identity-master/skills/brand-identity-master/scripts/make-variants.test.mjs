import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recolorSvg, matte, makeVariants, variantColours } from './make-variants.mjs';
import { readLogo } from './sample-logo.mjs';
import { findChrome } from './lib/chrome.mjs';
import { deltaOk } from './lib/color.mjs';
import { readJson } from './lib/cli.mjs';
import { detectBackground } from './lib/pixels.mjs';
import { writeSampleBrand, sampleBrand } from './fixtures/sample-brand.mjs';
import { makeImage, fillCircle } from './fixtures/draw.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';

test('recolorSvg replaces colours but keeps none, url() and currentColor', () => {
  const svg = '<svg viewBox="0 0 2 2"><path fill="#C9A24B" stroke="none"/><g style="fill:#123456;stroke:currentColor"/><rect fill="url(#g)"/></svg>';
  const out = recolorSvg(svg, '#F4EFE6');
  for (const s of ['fill="#F4EFE6"', 'stroke="none"', 'fill:#F4EFE6', 'stroke:currentColor', 'fill="url(#g)"']) assert.ok(out.includes(s), s);
  assert.match(recolorSvg('<svg viewBox="0 0 2 2"><path d="M0 0h2v2z"/></svg>', '#F4EFE6'), /<svg fill="#F4EFE6"/);
});

test('matte keeps ink and drops a white ground', () => {
  const img = makeImage(40, 40, [255, 255, 255, 255]);
  fillCircle(img, 20, 20, 10, [230, 120, 30, 255]);
  const m = matte(img, detectBackground(img));
  assert.equal(m[(20 * 40 + 20) * 4 + 3], 255);
  assert.equal(m[(2 * 40 + 2) * 4 + 3], 0);
});

test('variant colours come from the palette', () => {
  const c = variantColours(sampleBrand());
  assert.deepEqual([c.monoDark, c.monoLight, c.reversed], ['#15120E', '#F4EFE6', '#15120E']);
  assert.match(c.tint, /^#[0-9A-F]{6}$/);
});

test('makeVariants writes one-colour PNG versions and records them in brand.json', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));
  writeSampleBrand(dir);
  makeVariants(path.join(dir, 'brand.json'));
  const brand = readJson(path.join(dir, 'brand.json'));
  for (const v of ['monoDark', 'monoLight', 'reversed', 'tint']) {
    assert.equal(brand.logo.versions[v].path, `logo/${v}.png`);
    assert.ok(fs.existsSync(path.join(dir, 'logo', `${v}.svg`)));
  }
  const r = readLogo(path.join(dir, 'logo', 'monoLight.png'));
  assert.equal(r.background.kind, 'transparent');
  assert.equal(r.inks.length, 1);
  assert.ok(deltaOk(r.inks[0].hex, '#F4EFE6') < 0.02, r.inks[0].hex);
});
