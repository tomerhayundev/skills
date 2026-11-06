import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLibrary, facets, queryLibrary, recommendScore } from './library.mjs';
import { makeLibrary } from './fixtures/make-library.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

test('entries without a picture are never loaded', () => {
  const dir = makeLibrary(tmp(), { sites: 120, missing: 2, empty: 1 });
  const { entries, errors } = loadLibrary(dir);
  assert.equal(entries.filter((e) => e.shelf === 'sites').length, 120);
  assert.equal(entries.some((e) => e.id === 'site-missing-0' || e.id === 'site-empty-0'), false);
  assert.deepEqual(errors, []);
});

test('a malformed entry is reported, not shown', () => {
  const dir = makeLibrary(tmp(), { sites: 3 });
  const f = path.join(dir, 'sites.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.entries.push({ id: 'bad', shelf: 'sites' });
  fs.writeFileSync(f, JSON.stringify(j));
  const { entries, errors } = loadLibrary(dir);
  assert.equal(entries.some((e) => e.id === 'bad'), false);
  assert.match(errors.join(), /bad: missing url/);
});

test('pages come 50 at a time and the total counts only what can be shown', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const a = queryLibrary(entries, { shelf: 'sites', sort: 'newest' });
  assert.equal(a.items.length, 50);
  assert.equal(a.total, 120);
  const c = queryLibrary(entries, { shelf: 'sites', sort: 'newest', offset: 100 });
  assert.equal(c.items.length, 20);
});

test('filters combine: AND across facets, OR inside one', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const dark = queryLibrary(entries, { shelf: 'sites', filters: { colour: ['dark'] }, limit: 500 });
  assert.ok(dark.total > 0 && dark.items.every((e) => e.tags.colour === 'dark'));
  const either = queryLibrary(entries, { shelf: 'sites', filters: { colour: ['dark', 'light'] }, limit: 500 });
  assert.ok(either.total > dark.total);
  const both = queryLibrary(entries, { shelf: 'sites', filters: { colour: ['dark'], layout: ['asymmetric'] }, limit: 500 });
  assert.ok(both.items.every((e) => e.tags.colour === 'dark' && e.tags.layout === 'asymmetric'));
  assert.ok(both.total > 0);
  assert.ok(both.total < dark.total);
  const mood = queryLibrary(entries, { shelf: 'sites', filters: { mood: ['quiet'] }, limit: 500 });
  assert.ok(mood.items.every((e) => e.tags.mood.includes('quiet')));
});

test('search looks in the description, the best-use hints and the tags', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const r = queryLibrary(entries, { shelf: 'sites', q: 'ledger', limit: 500 });
  assert.ok(r.total > 0 && r.items.every((e) => JSON.stringify([e.description, e.bestUse, e.tags]).toLowerCase().includes('ledger')));
});

test('newest sorts by the date added', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const r = queryLibrary(entries, { shelf: 'sites', sort: 'newest', limit: 500 }).items;
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].added >= r[i].added);
});

test('recommended puts what fits the brief and the dials first, and never reads the industry', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const brief = { siteType: 'brochure', modes: { '/': 'persuade' }, rut: 'gradient blobs' };
  const dials = { density: 1, loudness: 2, motion: 0 };
  const top = queryLibrary(entries, { shelf: 'sites', sort: 'recommended', brief, dials }).items[0];
  assert.equal(top.tags.density, 1);
  assert.equal(top.tags.motion, 0);
  const withIndustry = recommendScore(top, { brief: { ...brief, business: 'a bakery' }, dials });
  assert.equal(withIndustry, recommendScore(top, { brief, dials }));
});

test('most picked sorts by this user\'s history', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const r = queryLibrary(entries, { shelf: 'sites', sort: 'picked', history: { 'site-7': 3, 'site-9': 1 } }).items;
  assert.deepEqual(r.slice(0, 2).map((e) => e.id), ['site-7', 'site-9']);
});

test('facet counts describe what can be shown', () => {
  const { entries } = loadLibrary(makeLibrary(tmp(), { sites: 120 }));
  const f = facets(entries.filter((e) => e.shelf === 'sites'));
  assert.equal(Object.values(f.colour).reduce((a, b) => a + b, 0), 120);
  assert.ok(f.layout && f.type && f.mood && f.family && f.density);
  assert.equal('industry' in f, false);
});

test('an entry hidden by curation is not loaded', () => {
  const dir = makeLibrary(tmp(), { sites: 3 });
  const f = path.join(dir, 'sites.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.entries[0].hidden = 'the picture is a loading screen';
  fs.writeFileSync(f, JSON.stringify(j));
  assert.equal(loadLibrary(dir).entries.some((e) => e.id === j.entries[0].id), false);
});

test('a picture shipped with the skill (previews/) counts when the pack does not have it', () => {
  const dir = makeLibrary(tmp(), { sites: 2 });
  fs.writeFileSync(path.join(dir, 'motion.json'), JSON.stringify({ shelf: 'motion', entries: [{ id: 'depth-x', shelf: 'motion', url: 'demos/depth.html?d=x', description: 'A scene.', bestUse: ['launch'], tags: { topic: 'depth' }, added: '2026-11-06', preview: 'depth/depth-x.webp' }] }));
  assert.equal(loadLibrary(dir).entries.some((e) => e.id === 'depth-x'), false);
  fs.mkdirSync(path.join(dir, 'previews', 'depth'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'previews', 'depth', 'depth-x.webp'), 'RIFF');
  assert.equal(loadLibrary(dir).entries.some((e) => e.id === 'depth-x'), true);
});

test('the real library has a Depth group: every 3D recipe with its demo and a picture shipped with the skill', () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'assets', 'library');
  const motion = JSON.parse(fs.readFileSync(path.join(dir, 'motion.json'), 'utf8')).entries.filter((e) => e.tags.topic === 'depth');
  const recipes = new Set(motion.map((e) => e.scene && e.scene.recipe));
  assert.deepEqual([...recipes].sort(), ['points', 'ripple']);
  // Nothing drawn as a stand-in for a real thing: an object scene only ever shows the business's own model.
  for (const e of motion) assert.notEqual(e.scene.recipe, 'object', e.id);
  for (const e of motion) {
    assert.ok(fs.statSync(path.join(dir, 'previews', e.preview)).size > 1000, e.preview);
    assert.match(e.demo, /^demos\/depth\.html\?d=[a-z-]+$/);
    assert.ok(e.he && e.he.description, `${e.id} he`);
  }
});
