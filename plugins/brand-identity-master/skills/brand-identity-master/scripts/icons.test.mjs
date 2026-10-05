import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, SKILL_DIR } from './lib/cli.mjs';

const dir = path.join(SKILL_DIR, 'data', 'icons');
const meta = readJson(path.join(SKILL_DIR, 'data', 'icons.json'));
const sectors = readJson(path.join(SKILL_DIR, 'data', 'deliverables.json')).sectors;

test('the icon set is large enough and every sector has at least four of its own', () => {
  assert.ok(meta.icons.length >= 60, `${meta.icons.length} icons`);
  for (const s of sectors) assert.ok(meta.icons.filter((i) => i.sectors.includes(s)).length >= 4, s);
  assert.ok(meta.icons.filter((i) => i.sectors.includes('*')).length >= 8);
});

test('every icon is a 24 px outline drawn in currentColor, with no fill', () => {
  for (const { name } of meta.icons) {
    const svg = fs.readFileSync(path.join(dir, `${name}.svg`), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, name);
    assert.match(svg, /stroke="currentColor"/, name);
    assert.match(svg, /fill="none"/, name);
  }
});
