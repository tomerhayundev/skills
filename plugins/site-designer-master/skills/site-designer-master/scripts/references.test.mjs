import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';

const refDir = path.join(SKILL_DIR, 'references');
const all = () => fs.readdirSync(refDir).map((f) => fs.readFileSync(path.join(refDir, f), 'utf8')).join('\n');

test('every meter rule is explained in at least one reference', () => {
  const text = all();
  const missing = Object.keys(readJson(path.join(SKILL_DIR, 'assets', 'rules.json')).rules).filter((id) => !text.includes(id));
  assert.deepEqual(missing, []);
});

test('every relative link between references resolves', () => {
  for (const f of fs.readdirSync(refDir)) {
    const t = fs.readFileSync(path.join(refDir, f), 'utf8');
    for (const m of t.matchAll(/\]\(([\w-]+\.md)\)/g)) assert.ok(fs.existsSync(path.join(refDir, m[1])), `${f} -> ${m[1]}`);
  }
});

test('the verify reference carries the hands-on rules', () => {
  const v = fs.readFileSync(path.join(refDir, 'verify.md'), 'utf8');
  for (const s of ['Confirming the code is not confirming the site', 'Any ✗ makes the verdict **Broken**', 'Not verified yet', 'frames over time', 'real Chrome', 'walk-list.mjs']) assert.ok(v.includes(s), s);
});

test('no reference recommends a named font or colour as a default', () => {
  const t = all();
  const { list } = readJson(path.join(SKILL_DIR, 'assets', 'slop-catalogue.json')).overusedFonts;
  for (const f of list) assert.equal(new RegExp(`\buse ${f}\b`, 'i').test(t), false, f);
});
