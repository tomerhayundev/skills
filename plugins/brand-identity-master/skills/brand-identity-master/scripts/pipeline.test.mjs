import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './lib/chrome.mjs';
import { readJson, SKILL_DIR } from './lib/cli.mjs';
import { loadData, validateBrand } from './lib/brand.mjs';
import { writeSampleBrand } from './fixtures/sample-brand.mjs';
import { makeVariants } from './make-variants.mjs';
import { writeTokens } from './tokens.mjs';
import { render } from './render.mjs';
import { checkBoard } from './board-check.mjs';
import { checkFacts } from './facts-check.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const data = loadData();
const HERE = path.dirname(fileURLToPath(import.meta.url));

function brandDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));
  writeSampleBrand(dir);
  makeVariants(path.join(dir, 'brand.json'));
  writeTokens(path.join(dir, 'brand.json'), data);
  return dir;
}

function renderAndCheck(dir, page, name, css) {
  const html = path.join(dir, `${name}.html`);
  fs.copyFileSync(page, html);
  if (css) fs.copyFileSync(css, path.join(dir, 'base.css'));
  const r = render(html, { width: name === 'direction' ? 1200 : 1600, retina: false });
  const metrics = readJson(r.metricsFile);
  const brand = readJson(path.join(dir, 'brand.json'));
  return [...checkBoard(metrics, brand, { fonts: data.fonts }), ...checkFacts(metrics.texts, brand, data)];
}

test('the sample brand is valid after make-variants', { skip }, () => {
  const dir = brandDir();
  assert.deepEqual(validateBrand(readJson(path.join(dir, 'brand.json')), { brandDir: dir, data }).errors, []);
});

const FX = path.join(HERE, 'fixtures');
for (const [page, name, css] of [[path.join(FX, 'sample-cards.html'), 'board', path.join(FX, 'fixture.css')], [path.join(FX, 'sample-editorial.html'), 'editorial', path.join(FX, 'fixture.css')], [path.join(FX, 'sample-mockups.html'), 'mockups', path.join(FX, 'fixture.css')], [path.join(SKILL_DIR, 'assets', 'board', 'direction.html'), 'direction', null]]) {
  test(`${name} renders with the sample brand and passes both checks`, { skip }, () => {
    const dir = brandDir();
    const findings = renderAndCheck(dir, page, name, css);
    assert.deepEqual(findings.filter((f) => f.level === 'fail'), []);
  });
}

test('the planted-defect board fails every planted check', { skip }, () => {
  const dir = brandDir();
  fs.writeFileSync(path.join(dir, 'logo', 'other.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="80"/></svg>');
  const codes = new Set(renderAndCheck(dir, path.join(HERE, 'fixtures', 'defects.html'), 'defects', path.join(HERE, 'fixtures', 'fixture.css')).filter((f) => f.level === 'fail').map((f) => f.code));
  for (const c of ['LOGO_DISTORTED', 'LOGO_CHANGED', 'SWATCH_MISMATCH', 'CONTRAST', 'OVERLAP', 'TEXT_TOO_SMALL', 'CLIPPED', 'OFF_PAGE', 'FACT_NUMBER', 'FACT_SINCE', 'CLICHE', 'EMOJI', 'UNSOURCED', 'EXAMPLE_UNMARKED']) assert.ok(codes.has(c), `missing ${c}; got ${[...codes].join(', ')}`);
});
