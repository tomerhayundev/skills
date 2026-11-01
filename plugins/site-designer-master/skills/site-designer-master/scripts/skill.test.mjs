import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';

const skillMd = () => fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const REFS = ['brief', 'structure', 'page-jobs', 'copy', 'visual-system', 'responsive', 'states', 'forms', 'motion', 'a11y', 'performance', 'trust', 'rtl', 'slop-catalogue', 'build', 'verify', 'critic', 'picker', 'decisions'];
const SCRIPTS = ['picker.mjs', 'fonts.mjs', 'build.mjs', 'serve.mjs', 'meter.mjs', 'critic-pack.mjs', 'history.mjs', 'walk-list.mjs'];

function shipped(dir = SKILL_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ['fixtures', 'vendor'].includes(e.name) ? [] : shipped(p);
    return /\.(md|mjs|js|json|html|css)$/.test(e.name) && !e.name.endsWith('.test.mjs') ? [p] : [];
  });
}

test('SKILL.md version matches plugin.json', () => {
  const v = readJson(path.join(SKILL_DIR, '..', '..', '.claude-plugin', 'plugin.json')).version;
  assert.match(skillMd(), new RegExp(`This is version ${v.replace(/\./g, '\.')} of the skill\.`));
});

test('SKILL.md is lean and its description starts with "Use when"', () => {
  const t = skillMd();
  assert.ok(t.split('\n').length <= 250, `${t.split('\n').length} lines`);
  assert.match(t, /^---\nname: site-designer-master\ndescription: Use when /);
});

test('every link in SKILL.md resolves and every reference is linked', () => {
  const t = skillMd();
  const links = [...t.matchAll(/\]\(((?:references|assets|scripts)\/[^)#\s]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(links.filter((l) => !fs.existsSync(path.join(SKILL_DIR, l))), []);
  for (const r of REFS) assert.ok(links.includes(`references/${r}.md`), r);
});

test('every script SKILL.md runs exists', () => {
  const t = skillMd();
  for (const s of SCRIPTS) {
    assert.ok(t.includes(`scripts/${s}`), `${s} named in SKILL.md`);
    assert.ok(fs.existsSync(path.join(SKILL_DIR, 'scripts', s)), s);
  }
});

test('no em dash in any shipped text', () => {
  const bad = shipped().filter((f) => fs.readFileSync(f, 'utf8').includes('\u2014'));
  assert.deepEqual(bad.map((f) => path.relative(SKILL_DIR, f)), []);
});

// The denylist lives in the scratch eval folder of the source project and is not shipped, so this check runs only there.
const DENYLIST = path.join(SKILL_DIR, '..', '..', 'eval', 'name-denylist.txt');
test('no studied skill, gallery or brand is named in shipped text', { skip: !fs.existsSync(DENYLIST) && 'name-denylist.txt is not shipped' }, () => {
  const deny = fs.readFileSync(DENYLIST, 'utf8').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hits = [];
  for (const f of shipped()) {
    const t = fs.readFileSync(f, 'utf8').toLowerCase();
    for (const n of deny) if (t.includes(n)) hits.push(`${path.relative(SKILL_DIR, f)}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test('the vendored accessibility engine ships with its licence and checksum', () => {
  const v = fs.readFileSync(path.join(SKILL_DIR, 'assets', 'vendor', 'VERSION'), 'utf8');
  assert.match(v, /axe-core \d+\.\d+\.\d+/);
  assert.match(fs.readFileSync(path.join(SKILL_DIR, 'assets', 'vendor', 'axe-LICENSE.txt'), 'utf8'), /Mozilla Public License/);
});
