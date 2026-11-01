import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordSite, isRepeat, historyFile } from './history.mjs';

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-')), 'history.json');
const past = { family: 'quiet-editorial', fonts: ['Face A', 'Face B'], palette: ['#1d1b18', '#2b5d4f'], hero: 'full-bleed-photo', layout: 'ledger' };

test('a missing history file counts as empty', () => {
  assert.deepEqual(isRepeat(file(), past), { repeat: false, matches: [] });
});

test('the same family, fonts and hero is a repeat', () => {
  const f = file();
  recordSite(f, { ...past, at: '2026-11-01' });
  const r = isRepeat(f, { ...past, palette: ['#000000'], layout: 'grid' });
  assert.equal(r.repeat, true);
  assert.deepEqual(r.matches.sort(), ['family', 'fonts', 'hero']);
});

test('four of five fields matching is a repeat; three is not', () => {
  const f = file();
  recordSite(f, past);
  assert.equal(isRepeat(f, { ...past, hero: 'type-only' }).repeat, true);
  assert.equal(isRepeat(f, { ...past, hero: 'type-only', layout: 'grid' }).repeat, false);
});

test('fonts and palette compare without order or case', () => {
  const f = file();
  recordSite(f, past);
  const r = isRepeat(f, { ...past, fonts: ['face b', 'FACE A'], palette: ['#2B5D4F', '#1D1B18'], hero: 'x', layout: 'y' });
  assert.deepEqual(r.matches.sort(), ['family', 'fonts', 'palette']);
});

test('the history lives in the user folder unless SITE_HISTORY says otherwise', () => {
  const saved = process.env.SITE_HISTORY;
  delete process.env.SITE_HISTORY;
  assert.equal(historyFile(), path.join(os.homedir(), '.site-designer-master', 'history.json'));
  process.env.SITE_HISTORY = '/tmp/x.json';
  assert.equal(historyFile(), '/tmp/x.json');
  if (saved === undefined) delete process.env.SITE_HISTORY; else process.env.SITE_HISTORY = saved;
});
