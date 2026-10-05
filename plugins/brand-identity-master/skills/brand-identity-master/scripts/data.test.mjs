import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, SKILL_DIR } from './lib/cli.mjs';

const data = (f) => readJson(path.join(SKILL_DIR, 'data', f));
const fonts = data('fonts.json');
const dirs = data('directions.json');
const families = new Map(fonts.families.map((f) => [f.family, f]));

test('font families are unique and well formed', () => {
  assert.equal(families.size, fonts.families.length);
  for (const f of fonts.families) {
    assert.ok(f.weights.length && f.weights.every((w) => w % 100 === 0 && w >= 100 && w <= 900), f.family);
    assert.ok(f.scripts.length && f.scripts.every((s) => ['latin', 'hebrew', 'arabic', 'cyrillic'].includes(s)), f.family);
    assert.equal(f.license, 'OFL-1.1', f.family);
  }
});

test('every pairing uses known families that cover its script, and every direction has 4 latin and 1 hebrew pairing', () => {
  const ids = dirs.directions.map((d) => d.id);
  for (const p of fonts.pairings) {
    for (const r of ['display', 'text', 'label']) assert.ok(families.has(p[r]), `${p.id} ${r} ${p[r]}`);
    for (const r of ['display', 'text']) assert.ok(families.get(p[r]).scripts.includes(p.script), `${p.id} ${r} does not cover ${p.script}`);
    assert.ok(p.directions.every((d) => ids.includes(d)), p.id);
  }
  for (const id of ids) {
    const mine = fonts.pairings.filter((p) => p.directions.includes(id));
    assert.ok(mine.filter((p) => p.script === 'latin').length >= 4, `${id} latin`);
    assert.ok(mine.filter((p) => p.script === 'hebrew').length >= 1, `${id} hebrew`);
  }
});

test('bundled fonts exist with their licence, and their families are listed', () => {
  for (const b of fonts.bundled) {
    assert.ok(families.has(b.family), b.family);
    assert.ok(fs.existsSync(path.join(SKILL_DIR, 'assets', 'fonts', b.license)), b.license);
    for (const f of b.files) {
      assert.ok(fs.existsSync(path.join(SKILL_DIR, 'assets', 'fonts', f.file)), f.file);
      assert.ok(families.get(b.family).weights.includes(f.weight), `${f.file} weight`);
    }
  }
});

test('deliverables use known mockups and sectors', () => {
  const d = data('deliverables.json');
  for (const x of d.deliverables) {
    assert.ok(d.mockups.includes(x.mockup), x.id);
    assert.ok(x.sectors.every((s) => s === '*' || d.sectors.includes(s)), x.id);
  }
});

test('labels and cliches are short and unique', () => {
  const labels = data('labels.json').labels.map((l) => l.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((l) => l.split(' ').length <= 4));
  const cl = data('banned-copy.json').cliches;
  assert.equal(new Set(cl).size, cl.length);
});
