// The meter sees 3D scenes: one that draws nothing or fails, a poster that does not show when it must, more than
// one scene on a page, a canvas that screen readers would land on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { buildSite } from './build.mjs';
import { measure, score } from './meter.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const RULES = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
const FIX = path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const POSTER = '<img src="/assets/room.svg" alt="" width="1200" height="800">';

const OWN = {
  // Clears to one colour: a scene that draws nothing anyone could see.
  flat: "SDMStage.scene('flat', {}, function (ctx) { var q = ctx.quad('void main(){ outColor = vec4(0.5, 0.5, 0.5, 1.0); }'); return { render: function () { q.draw(); }, resize: function (w, h, d, cw, ch) { q.resize(cw, ch); } }; });",
  broken: "SDMStage.scene('broken', {}, function () { throw new Error('planted'); });",
};

function site(body, { css = '' } = {}) {
  const src = tmp();
  fs.cpSync(FIX, src, { recursive: true });
  fs.rmSync(path.join(src, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(src, 'pages'));
  fs.mkdirSync(path.join(src, 'scenes'));
  for (const [n, js] of Object.entries(OWN)) fs.writeFileSync(path.join(src, 'scenes', `${n}.js`), js);
  fs.writeFileSync(path.join(src, 'pages', 'index.html'), `<section><h1>Scene</h1><p>Words in HTML, the scene beside them.</p>${body}</section>`);
  const s = readJson(path.join(src, 'site.json'));
  s.pages = [{ path: '/', file: 'index.html', title: 'Scene', description: 'Scene', nav: false }];
  fs.writeFileSync(path.join(src, 'site.json'), JSON.stringify(s));
  if (css) fs.writeFileSync(path.join(src, 'site.css'), css);
  const out = tmp();
  const r = buildSite(src, out);
  assert.deepEqual(r.errors, []);
  return score(measure(out, { widths: [1440] }), RULES);
}
const ids = (list) => list.map((f) => f.id);

test('a scene from the kit with its poster passes every pass, the no-WebGL one included', { skip }, () => {
  const r = site(`<div data-scene="points" style="aspect-ratio:3/2">${POSTER}</div>`);
  const scene = [...r.fails, ...r.warns].filter((f) => /^SCENE_|^CANVAS_/.test(f.id));
  assert.deepEqual(scene, []);
});

test('a scene that draws one flat colour fails', { skip }, () => {
  assert.ok(ids(site(`<div data-scene="flat" style="aspect-ratio:3/2">${POSTER}</div>`).fails).includes('SCENE_BLANK'));
});

test('a scene that breaks fails, even though its poster came back', { skip }, () => {
  assert.ok(ids(site(`<div data-scene="broken" style="aspect-ratio:3/2">${POSTER}</div>`).fails).includes('SCENE_BLANK'));
});

test('a poster hidden by the site\'s own styles fails the reduced-motion and no-WebGL passes', { skip }, () => {
  const r = site(`<div data-scene="points" style="aspect-ratio:3/2">${POSTER}</div>`, { css: '[data-scene] > img { visibility: hidden; }' });
  const f = r.fails.filter((x) => x.id === 'SCENE_FALLBACK');
  assert.ok(f.length >= 1, JSON.stringify(r.fails));
});

test('two scenes on one page are flagged: one 3D idea per page', { skip }, () => {
  const r = site(`<div data-scene="points" style="aspect-ratio:3/2">${POSTER}</div><div data-scene="points" style="aspect-ratio:3/2">${POSTER}</div>`);
  assert.ok(ids(r.warns).includes('SCENE_COUNT'));
});

test('a canvas outside the stage that screen readers would reach fails', { skip }, () => {
  assert.ok(ids(site('<canvas width="300" height="150"></canvas>').fails).includes('CANVAS_ARIA'));
});
