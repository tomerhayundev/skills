import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { validateTokens } from './tokens.mjs';
import { fetchFamilies, scriptsForLang } from './fonts.mjs';
import { buildSite } from './build.mjs';
import { startServer } from './serve.mjs';
import { measure, score, report } from './meter.mjs';
import { criticPack } from './critic-pack.mjs';
import { recordSite, isRepeat } from './history.mjs';
import { walkList } from './walk-list.mjs';

const FIX = path.join(SKILL_DIR, '..', '..', 'eval', 'fixtures', 's1-food-he');
const skip = (!fs.existsSync(FIX) && 'the eval fixtures are not shipped') || (!findChrome() && 'no Chrome or Edge on this machine');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const RULES = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));

test('a Hebrew bakery site goes from source to a checked, working local site', { skip, timeout: 600000 }, async () => {
  const src = tmp();
  fs.cpSync(path.join(FIX, 'src'), src, { recursive: true });
  const brief = readJson(path.join(FIX, 'brief.json'));
  const tokens = readJson(path.join(src, 'tokens.json'));
  const site = readJson(path.join(src, 'site.json'));
  assert.deepEqual(validateTokens(tokens, RULES).errors, []);

  if (process.env.SITE_OFFLINE !== '1') {
    const need = scriptsForLang(site.lang);
    const fonts = await fetchFamilies(tokens.type.families.map((f) => ({ name: f.name, weights: f.weights, scripts: need })), src);
    assert.deepEqual(fonts.missing, []);
  }

  const out = tmp();
  assert.deepEqual(buildSite(src, out).errors, []);

  const data = tmp();
  const srv = await startServer({ root: out, dataDir: data, port: 0 });
  try {
    for (const p of ['/', '/menu/', '/about/', '/contact/']) assert.equal((await fetch(srv.url + p)).status, 200, p);
    const sent = await fetch(`${srv.url}/forms/order`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: srv.url, referer: `${srv.url}/contact/` }, body: 'name=Dana&phone=0500000000&order=challah' });
    assert.equal(sent.status, 303);
    assert.equal(fs.readFileSync(path.join(data, 'submissions.jsonl'), 'utf8').trim().split('\n').length, 1);
  } finally { await srv.close(); }

  const res = score(measure(out, { brief }), RULES);
  const text = report(res);
  assert.deepEqual(res.fails, [], text);

  const pack = tmp();
  const cp = criticPack(out, { brief, meterReport: text, out: pack });
  assert.ok(cp.files.includes('first-375.png') && cp.files.includes('page-menu-1440.png'));

  const hist = path.join(tmp(), 'history.json');
  const entry = { family: 'ledger-type', fonts: tokens.type.families.map((f) => f.name), palette: [tokens.color.ground, tokens.color.accent], hero: 'type-only', layout: 'ledger' };
  recordSite(hist, entry);
  assert.equal(isRepeat(hist, entry).repeat, true);

  assert.match(walkList(out, { url: 'http://127.0.0.1:4321' }), /Form "order" on \/contact\//);
});

test('the worst-case data build of the same site still passes the meter', { skip, timeout: 600000 }, () => {
  const src = tmp();
  fs.cpSync(path.join(FIX, 'src'), src, { recursive: true });
  const brief = readJson(path.join(FIX, 'brief.json'));
  const worst = readJson(path.join(FIX, 'worst-case.json'));
  const out = tmp();
  assert.deepEqual(buildSite(src, out, { data: worst }).errors, []);
  const res = score(measure(out, { brief: { ...brief, prices: [...brief.prices, '1,000,000'] }, widths: [320, 375, 1440] }), RULES);
  assert.deepEqual(res.fails, [], report(res));
});
