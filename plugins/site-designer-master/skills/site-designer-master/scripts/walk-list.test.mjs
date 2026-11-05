import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';
import { buildSite } from './build.mjs';
import { walkList } from './walk-list.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const built = (opts) => { const out = tmp(); buildSite(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), out, opts); return out; };

test('the list starts unverified and names every page at phone and desktop width', () => {
  const md = walkList(built(), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /^# Walk list/m);
  assert.match(md, /Verdict: Not verified yet/);
  for (const p of ['/', '/about/', '/contact/']) for (const w of [375, 1440]) assert.ok(md.includes(`? ${p} at ${w}px, top to bottom to the page end`), `${p} ${w}`);
  assert.equal(md.includes('/_review/'), false);
});

test('every form, the phone menu, the 404 page and the keyboard path are things to use', () => {
  const md = walkList(built(), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /\? Form "contact" on \/contact\/: submit real values; the success block shows; \.site-data\/submissions\.jsonl gains one line/);
  assert.match(md, /\? Phone menu at 375px: opens, Escape closes it, a link tap closes it/);
  assert.match(md, /\? 404: http:\/\/127\.0\.0\.1:4321\/no-such-page\/ shows the 404 page/);
  assert.match(md, /\? Keyboard: Tab from the top/);
  assert.match(md, /\? Every navigation link \(3\) reaches its page/);
});

test('a development build adds the tweak panel and the review page', () => {
  const md = walkList(built({ dev: true }), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /\? Tweak panel: change the accent, Save, the page reloads with it/);
  assert.match(md, /\? \/_review\/ at 375px/);
});

test('a Hebrew site asks for right-to-left checks inside inputs', () => {
  const src = tmp();
  fs.cpSync(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), src, { recursive: true });
  const sj = path.join(src, 'site.json');
  fs.writeFileSync(sj, JSON.stringify({ ...JSON.parse(fs.readFileSync(sj, 'utf8')), lang: 'he', dir: 'rtl' }));
  const out = tmp();
  buildSite(src, out);
  assert.match(walkList(out, {}), /\? Right to left: text runs right to left, email and phone inputs read left to right, panels open from the right/);
});

test('the report rules travel with the list', () => {
  const md = walkList(built(), {});
  for (const s of ['Any ✗ makes the verdict Broken', 'Any ? makes it Not verified yet', 'headless Chromium', 'real Chrome']) assert.ok(md.includes(s), s);
});

test('the walk breaks things on purpose and checks that every state says what happened and what next', () => {
  const md = walkList(built(), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /## Break it on purpose/);
  assert.match(md, /\? Stop the local server, then send "contact": the visitor is told it did not go through, nothing typed is lost, and there is a way forward/);
  assert.match(md, /\? Every action answers three questions: what just happened, can I take it back, what do I do next/);
  assert.match(md, /\? The same situation looks and reads the same on every page/);
});

test('every page gets a removal pass: each section names its one job, and what has none is cut or defended', () => {
  const md = walkList(built(), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /^## Remove$/m);
  for (const p of ['/', '/about/', '/contact/']) assert.ok(md.includes(`? ${p}: every section names its one job; what has none is cut, or the report says why it stays`), p);
  assert.match(md, /read it as a first-time visitor/);
});

test('the walk checks the end of each journey as a designed moment, not only its start', () => {
  const md = walkList(built(), { url: 'http://127.0.0.1:4321' });
  assert.match(md, /\? Form "contact" on \/contact\/: the success block is a moment, not a bare "Sent": it thanks in the site's voice and says what happens next and when/);
  assert.match(md, /\? The last section before the footer on every page ends the visit on purpose \(the primary action or a closing line\)/);
});
