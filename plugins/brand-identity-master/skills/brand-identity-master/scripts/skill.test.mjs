import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';

const skillMd = () => fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const DIRS = readJson(path.join(SKILL_DIR, 'data', 'directions.json')).directions;
const REFS = ['logo-read', 'brand-read', 'brand-file', 'board', 'mockups', 'patterns', 'copy', 'checks', 'rtl'];
const ready = REFS.every((r) => fs.existsSync(path.join(SKILL_DIR, 'references', `${r}.md`))) && DIRS.every((d) => fs.existsSync(path.join(SKILL_DIR, d.file)));

test('SKILL.md version matches plugin.json', () => {
  const pj = path.join(SKILL_DIR, '..', '..', '.claude-plugin', 'plugin.json');
  const v = readJson(pj).version;
  assert.match(skillMd(), new RegExp(`This is version ${v.replace(/\./g, '\\.')} of the skill\\.`));
});

test('SKILL.md is lean and its description starts with "Use when"', () => {
  const t = skillMd();
  assert.ok(t.split('\n').length <= 250, `${t.split('\n').length} lines`);
  assert.match(t, /^---\nname: brand-identity-master\ndescription: Use when /);
});

test('every link in SKILL.md resolves and every direction and reference is linked', { todo: !ready && 'references and directions come in Tasks 18 and 19' }, () => {
  const t = skillMd();
  const links = [...t.matchAll(/\]\(((?:directions|references|data|assets|scripts)\/[^)#\s]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(links.filter((l) => !fs.existsSync(path.join(SKILL_DIR, l))), []);
  for (const d of DIRS) assert.ok(links.includes(d.file), d.file);
  for (const r of REFS) assert.ok(links.includes(`references/${r}.md`), r);
});

test('no shipped text file contains an em dash', () => {
  const bad = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|json|css|html|js|mjs|svg)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('\u2014')) bad.push(path.relative(SKILL_DIR, p));
    }
  })(SKILL_DIR);
  assert.deepEqual(bad, []);
});
