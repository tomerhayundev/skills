import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { validateTokens, tokensToCss } from './tokens.mjs';

const fx = (n) => readJson(path.join(SKILL_DIR, 'scripts', 'fixtures', n));
const rules = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));

test('a sound tokens file passes', () => {
  const r = validateTokens(fx('tokens-ok.json'), rules);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('each broken floor is named', () => {
  const r = validateTokens(fx('tokens-bad.json'), rules);
  assert.equal(r.ok, false);
  const all = r.errors.join('\n');
  for (const re of [
    /space 13 is not a multiple of 4/,
    /type ratio 1\.1 below 1\.25 for persuade/,
    /body 15px below 16px/,
    /ink on ground 3\.2:1 below 4\.5/,
    /accent-ink on accent 2\.4:1 below 4\.5/,
    /focus on ground 1\.4:1 below 3/,
    /3 families \(max 2 plus one mono\)/,
    /z 250 not in scale 0,10,100,200,300,400,500/,
  ]) assert.match(all, re);
});

test('ratio 1.2 is fine for operate pages but not for persuade', () => {
  const t = fx('tokens-ok.json');
  t.type.ratio = 1.2;
  assert.match(validateTokens(t, rules).errors.join(), /type ratio 1\.2 below 1\.25 for persuade/);
  t.mode = 'operate';
  assert.deepEqual(validateTokens(t, rules).errors, []);
});

test('a mono family is allowed as a third', () => {
  const t = fx('tokens-ok.json');
  t.type.families.push({ role: 'mono', name: 'Test Mono', fallback: 'monospace', scripts: ['latin'] });
  assert.deepEqual(validateTokens(t, rules).errors, []);
});

test('an unknown mode is an error', () => {
  const t = fx('tokens-ok.json');
  t.mode = 'shouty';
  assert.match(validateTokens(t, rules).errors.join(), /mode shouty is not one of persuade, operate, read, experience/);
});

test('tokensToCss writes custom properties and no physical sides', () => {
  const css = tokensToCss(fx('tokens-ok.json'));
  assert.match(css, /^:root \{/);
  for (const p of ['--color-ink: #1d1b18', '--space-4: 16px', '--step-body: 18px', '--leading-body: 1.55', '--radius-2: 6px', '--z-modal: 400', "--font-display: 'Test Display', serif"]) assert.ok(css.includes(p), p);
  assert.doesNotMatch(css, /\b(left|right)\b/);
});

test('the CLI writes tokens.css and exits 1 with the errors on a bad file', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  const cli = path.join(SKILL_DIR, 'scripts', 'tokens.mjs');
  const ok = spawnSync(process.execPath, [cli, path.join(SKILL_DIR, 'scripts', 'fixtures', 'tokens-ok.json'), `--out=${out}/tokens.css`], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(fs.readFileSync(path.join(out, 'tokens.css'), 'utf8').includes('--color-ink'));
  const bad = spawnSync(process.execPath, [cli, path.join(SKILL_DIR, 'scripts', 'fixtures', 'tokens-bad.json'), `--out=${out}/bad.css`], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /space 13 is not a multiple of 4/);
  assert.equal(fs.existsSync(path.join(out, 'bad.css')), false);
});

test('scaleSteps keeps a wide or tight ratio inside the floors', async () => {
  const { scaleSteps } = await import('./tokens.mjs');
  const wide = scaleSteps(18, 1.615, rules.thresholds);
  assert.equal(wide.body, 18);
  assert.equal(wide.small, 13);
  assert.ok(wide.display <= 96 && wide.display >= wide.h1, JSON.stringify(wide));
  assert.ok(wide.h1 > wide.h2 && wide.h2 > wide.h3 && wide.h3 > wide.body);
  const base = scaleSteps(18, 1.333, rules.thresholds);
  assert.deepEqual(base, { display: 76, h1: 43, h2: 32, h3: 24, body: 18, small: 14 });
});
