import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';

const d = (f) => readJson(path.join(SKILL_DIR, 'data', f));
const { directions, recipes } = d('directions.json');
const pairings = d('fonts.json').pairings;
const deliverables = d('deliverables.json').deliverables.map((x) => x.id);
const HEADS = ['## When it fits', '## Mood words', '## Avoid', '## Type', '## Colour', '## Layout', '### A ', '### B ', '### C ', '## Pattern', '## Mockups first', '## The one bold move', '## Bans', '## Checked against'];
const ticks = (t) => [...t.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);

for (const dir of directions) {
  test(`${dir.id}: headings, pairings, recipes, mockups, cross-checks`, () => {
    const t = fs.readFileSync(path.join(SKILL_DIR, dir.file), 'utf8');
    const lines = t.split('\n').length;
    assert.ok(lines >= 50 && lines <= 130, `${lines} lines`);
    assert.ok(t.startsWith(`# ${dir.name}\n`));
    let at = -1;
    for (const h of HEADS) { const i = t.indexOf(h, at + 1); assert.ok(i > at, `${h} missing or out of order`); at = i; }
    const ids = ticks(t);
    const mine = pairings.filter((p) => p.directions.includes(dir.id)).map((p) => p.id);
    assert.ok(ids.filter((i) => mine.includes(i)).length >= 3, 'names at least 3 of its pairings');
    assert.ok(ids.filter((i) => pairings.some((p) => p.id === i)).every((i) => mine.includes(i)), 'names a pairing of another direction');
    assert.ok(ids.filter((i) => recipes.includes(i)).length >= 2, 'names at least 2 recipes');
    assert.ok(ids.filter((i) => deliverables.includes(i)).length >= 4, 'names at least 4 deliverables');
    const checked = t.slice(t.indexOf('## Checked against'));
    for (const other of directions.filter((o) => o.id !== dir.id)) assert.ok(checked.includes(other.name), `not checked against ${other.name}`);
  });
}
