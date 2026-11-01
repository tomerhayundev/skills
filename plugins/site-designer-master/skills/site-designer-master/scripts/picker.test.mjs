import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { SKILL_DIR } from './lib/cli.mjs';
import { startServer } from './serve.mjs';
import { registerPicker } from './picker.mjs';
import { buildSite } from './build.mjs';
import { makeLibrary } from './fixtures/make-library.mjs';

process.env.SITE_OFFLINE = '1'; // the alive check must not reach the network in tests
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const work = tmp();
const lib = makeLibrary(tmp(), { sites: 120, missing: 1 });
const brief = { business: 'a sourdough bakery', siteType: 'brochure', primaryAction: 'Order for pickup', modes: { '/': 'persuade' }, lang: 'en' };
let srv;

before(async () => {
  // Two built "directions" for the compare page.
  for (const id of ['d1', 'd2']) buildSite(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), path.join(work, 'directions', id));
  registerPicker({ work, brief, libraryDir: lib });
  srv = await startServer({ root: work, dataDir: tmp(), port: 0 });
});
after(() => srv.close());

const get = (p) => fetch(srv.url + p);
const post = (p, body) => fetch(srv.url + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: srv.url }, body: JSON.stringify(body) });

test('the app page and its files are served', async () => {
  const r = await get('/_picker/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<html/);
  assert.equal((await get('/_picker/app/app.js')).status, 200);
});

test('state starts from the brief and round-trips in full', async () => {
  const s = await (await get('/_picker/api/state')).json();
  assert.equal(s.brief.business, 'a sourdough bakery');
  assert.deepEqual(s.picks, []);
  assert.ok(s.strings.done);
  assert.ok(s.facets.colour);
  const next = { ...s, picks: [{ id: 'site-3', shelf: 'sites', liked: 'the grid' }], dials: { density: 2, loudness: 2, motion: 1 }, hates: ['gradients'] };
  assert.equal((await post('/_picker/api/state', next)).status, 200);
  const back = await (await get('/_picker/api/state')).json();
  assert.deepEqual(back.picks, next.picks);
  assert.deepEqual(back.hates, ['gradients']);
});

test('the library comes 50 at a time with filters, and every card has a picture that loads', async () => {
  const a = await (await get('/_picker/api/library?shelf=sites&sort=newest')).json();
  assert.equal(a.items.length, 50);
  assert.equal(a.total, 120);
  const b = await (await get('/_picker/api/library?shelf=sites&sort=newest&offset=100')).json();
  assert.equal(b.items.length, 20);
  const f = await (await get('/_picker/api/library?shelf=sites&f.colour=dark&f.type=sans')).json();
  assert.ok(f.total > 0 && f.items.every((e) => e.tags.colour === 'dark' && e.tags.type === 'sans'));
  assert.equal(f.items.some((e) => 'title' in e), false, 'no site names in the card data');
  // The card's words in other languages travel with it, so a Hebrew picker shows Hebrew cards.
  assert.match(a.items[0].he.description, /^תיאור /);
  assert.equal(a.items[0].he.bestUse.length, a.items[0].bestUse.length);
  // A site captured at phone width sends its phone picture too, and it loads; one without sends none.
  const withPhone = a.items.find((e) => e.phone), without = a.items.find((e) => !e.phone);
  assert.ok(withPhone && without, 'the fixture has both kinds');
  assert.equal((await get(withPhone.phone)).status, 200);
  assert.equal(without.phone, null);
  const pic = await get(a.items[0].preview);
  assert.equal(pic.status, 200);
  assert.match(pic.headers.get('content-type'), /image\/webp/);
});

test('Done with no picks takes the recommendation and says so', async () => {
  const w = tmp();
  const s2 = await startPicker(w);
  try {
    const r = await (await fetch(`${s2.url}/_picker/api/done`, { method: 'POST', headers: { 'content-type': 'application/json', origin: s2.url }, body: '{}' })).json();
    assert.equal(r.ok, true);
    const taste = JSON.parse(fs.readFileSync(path.join(w, 'taste.json'), 'utf8'));
    assert.equal(taste.chosenBy, 'recommendation');
    assert.ok(taste.picks.length >= 3);
    assert.match(fs.readFileSync(path.join(w, 'build-prompt.md'), 'utf8'), /chosen by the recommendation/);
  } finally { await s2.close(); }
});

test('Done with picks writes taste.json and the build prompt', async () => {
  const r = await (await post('/_picker/api/done', {})).json();
  assert.equal(r.ok, true);
  const taste = JSON.parse(fs.readFileSync(path.join(work, 'taste.json'), 'utf8'));
  assert.equal(taste.chosenBy, 'user');
  assert.deepEqual(taste.picks.map((p) => p.id), ['site-3']);
  assert.match(fs.readFileSync(path.join(work, 'build-prompt.md'), 'utf8'), /site-3/);
});

test('the compare page shows each built direction and records the choice', async () => {
  const html = await (await get('/_picker/compare/directions/')).text();
  assert.match(html, /d1/);
  assert.match(html, /d2/);
  assert.match(html, /\/_picker\/work\/directions\/d1\/index\.html/);
  assert.equal((await get('/_picker/work/directions/d1/index.html')).status, 200);
  assert.equal((await post('/_picker/api/choose', { step: 'directions', id: 'd2' })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'choices.json'), 'utf8')).directions.id, 'd2');
  assert.equal((await post('/_picker/api/choose', { step: 'directions', id: '../x' })).status, 400);
});

test('a post from another site is refused', async () => {
  const u = new URL(srv.url);
  const status = await new Promise((resolve) => {
    const req = http.request({ host: u.hostname, port: u.port, path: '/_picker/api/done', method: 'POST', headers: { host: u.host, origin: 'http://evil.example', 'content-type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end('{}');
  });
  assert.equal(status, 403);
});

test('a Hebrew brief gets Hebrew strings and right to left', async () => {
  const w = tmp();
  const s3 = await startPicker(w, { ...brief, lang: 'he' });
  try {
    const s = await (await fetch(`${s3.url}/_picker/api/state`)).json();
    assert.equal(s.dir, 'rtl');
    assert.match(s.strings.done, /[֐-׿]/);
  } finally { await s3.close(); }
});

async function startPicker(w, b = brief) {
  // A second picker in the same process: the routes read the work folder from the request's server.
  registerPicker({ work: w, brief: b, libraryDir: lib, key: w });
  const s = await startServer({ root: w, dataDir: tmp(), port: 0 });
  s.server.pickerKey = w;
  return s;
}

test('a shown site that no longer answers is hidden from then on', async () => {
  const { markDead } = await import('./picker.mjs');
  const w = tmp();
  const s4 = await startPicker(w);
  try {
    markDead(w, 'site-5');
    const r = await (await fetch(`${s4.url}/_picker/api/library?shelf=sites&sort=newest&q=`)).json();
    assert.equal(r.total, 119);
    assert.equal(r.items.some((e) => e.id === 'site-5'), false);
  } finally { await s4.close(); }
});

test('the state counts each shelf, so empty shelves get no tab', async () => {
  const s = await (await get('/_picker/api/state')).json();
  assert.equal(s.counts.sites, 120);
  assert.equal(s.counts.sections, 0);
});

test('the compare page fills every placeholder', async () => {
  const html = await (await get('/_picker/compare/directions/')).text();
  assert.equal(/\{\{\w+\}\}/.test(html), false);
});

test('review 5: only a 404 or 410 hides a site; network errors, 5xx and timeouts do not', async () => {
  const { checkAlive } = await import('./picker.mjs');
  const w = tmp();
  const items = [{ id: 'a', url: 'https://a.example/' }, { id: 'b', url: 'https://b.example/' }, { id: 'c', url: 'https://c.example/' }, { id: 'd', url: 'https://d.example/' }];
  const answers = { 'https://a.example/': 404, 'https://b.example/': 503, 'https://c.example/': 'throw', 'https://d.example/': 410 };
  await checkAlive(w, items, async (u) => { if (answers[u] === 'throw') throw new Error('offline'); return new Response('', { status: answers[u] }); });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(w, 'dead-sites.json'), 'utf8')).sort(), ['a', 'd']);
});

test('review 6: a stale tab cannot wipe picks saved by another tab', async () => {
  const w = tmp();
  const s5 = await startPicker(w);
  const p = (body) => fetch(`${s5.url}/_picker/api/state`, { method: 'POST', headers: { 'content-type': 'application/json', origin: s5.url }, body: JSON.stringify(body) });
  try {
    const first = await (await fetch(`${s5.url}/_picker/api/state`)).json();
    const a = await p({ ...first, picks: [{ id: 'site-1', shelf: 'sites', liked: '' }] });
    assert.equal(a.status, 200);
    const stale = await p({ ...first, dials: { density: 1 } });
    assert.equal(stale.status, 409);
    const now = await (await fetch(`${s5.url}/_picker/api/state`)).json();
    assert.deepEqual(now.picks.map((x) => x.id), ['site-1']);
  } finally { await s5.close(); }
});

test('review 7: choosing the same option again is still a new choice, and a half-written file never crashes the wait', async () => {
  const { doneSignature } = await import('./picker.mjs');
  const w = tmp();
  fs.writeFileSync(path.join(w, 'choices.json'), JSON.stringify({ directions: { id: 'a', at: '2026-11-01T10:00:00.000Z' } }));
  const before = doneSignature(w, 'directions');
  fs.writeFileSync(path.join(w, 'choices.json'), JSON.stringify({ directions: { id: 'a', at: '2026-11-01T10:05:00.000Z' } }));
  assert.notEqual(doneSignature(w, 'directions'), before);
  fs.writeFileSync(path.join(w, 'choices.json'), '{"directions": {"id": "a", "at"');
  assert.equal(doneSignature(w, 'directions'), null);
});
