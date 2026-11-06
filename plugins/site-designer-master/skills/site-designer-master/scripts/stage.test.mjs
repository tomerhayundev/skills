// The 3D stage (assets/site-kit/three/stage.js) in a real headless browser: it starts scenes after the page is
// readable, keeps the poster when it should, stops drawing off screen and reads the brand colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';
import { pathToFileURL } from 'node:url';
import { findChrome, dumpProbe, EMIT_JS } from './lib/chrome.mjs';
import { openBrowser } from './lib/cdp.mjs';
import { boxGlb } from './fixtures/make-glb.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const KIT = path.join(SKILL_DIR, 'assets', 'site-kit', 'three');

const SCENES = {
  // A raw shader through the stage's quad helper: a gradient between two token colours.
  'test-quad': `SDMStage.scene('test-quad', {}, function (ctx) {
    var q = ctx.quad('uniform vec3 uA; uniform vec3 uB; void main(){ vec2 p = gl_FragCoord.xy / uRes; outColor = vec4(mix(uA, uB, p.x), 1.0); }',
      { uA: ctx.rgb('accent'), uB: ctx.rgb('ground') });
    return { render: function (f) { q.draw({ uTime: f.t }); }, resize: function (w, h) { q.resize(w, h); } };
  });`,
  // A lit three.js object.
  'test-three': `SDMStage.scene('test-three', { three: true }, function (ctx) {
    var T = ctx.THREE, r = new T.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: true });
    var s = new T.Scene(), cam = new T.PerspectiveCamera(35, 1, 0.1, 50); cam.position.set(0, 0, 6);
    s.add(new T.HemisphereLight('#ffffff', '#444444', 2));
    var m = new T.Mesh(new T.SphereGeometry(1.4, 48, 24), new T.MeshStandardMaterial({ color: ctx.color('accent'), roughness: 0.4 })); s.add(m);
    return { render: function (f) { m.rotation.y = f.t; r.render(s, cam); },
      resize: function (w, h, dpr) { r.setPixelRatio(dpr); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } };
  });`,
  'test-throw': `SDMStage.scene('test-throw', {}, function () { throw new Error('planted'); });`,
};

function page(scene, { tall = false, attrs = '', one = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-stage-'));
  fs.cpSync(KIT, path.join(dir, 'three'), { recursive: true });
  for (const [name, js] of Object.entries(SCENES)) fs.writeFileSync(path.join(dir, 'three', 'scenes', `${name}.js`), js);
  fs.writeFileSync(path.join(dir, 'box.glb'), boxGlb());
  fs.writeFileSync(path.join(dir, 'poster.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c96"/></svg>');
  const report = `${EMIT_JS}
  addEventListener('load', function () {
    if (location.hash === '#live') return;
    var el = document.querySelector('[data-scene]'), n = 0;
    (function poll() {
      var s = el.__sdm && el.__sdm.state;
      if ((!s || s === 'waiting' || s === 'loading') && n++ < 60) return setTimeout(poll, 100);
      var out = { state: s, canvas: !!el.querySelector('canvas'), aria: el.querySelector('canvas') && el.querySelector('canvas').getAttribute('aria-hidden'),
        posterShown: getComputedStyle(el.querySelector('img')).visibility !== 'hidden', sample: el.__sdm && el.__sdm.sample ? el.__sdm.sample() : null,
        accent: el.__sdm && el.__sdm.color ? el.__sdm.color('accent') : null };
      var a = el.__sdm ? el.__sdm.frames : 0;
      setTimeout(function () {
        out.framesGrew = (el.__sdm ? el.__sdm.frames : 0) > a;
        scrollTo(0, 4000);
        setTimeout(function () {
          var b = el.__sdm ? el.__sdm.frames : 0;
          setTimeout(function () { out.framesOffScreen = (el.__sdm ? el.__sdm.frames : 0) - b; __emit(out); }, 600);
        }, 400);
      }, 400);
    })();
  });`;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
<style>:root{--color-accent:#2f5d50;--color-ground:#f4f1ec}body{margin:0}[data-scene]{position:relative;inline-size:600px;block-size:400px}
[data-scene]>img{display:block;inline-size:100%;block-size:100%}[data-scene]>canvas{position:absolute;inset:0;inline-size:100%;block-size:100%}</style>
${one ? '<script>window.SDM_ONE_FRAME=2</script>' : ''}<script src="three/stage.js" defer></script></head><body>
<div data-scene="${scene}"${attrs}><img src="poster.svg" alt="" width="600" height="400"></div>
${tall ? '<div style="block-size:6000px"></div>' : '<div style="block-size:6000px"></div>'}
<script>${report}</script></body></html>`);
  return path.join(dir, 'index.html');
}

const run = (file, flags = []) => dumpProbe(file, { width: 800, height: 600, budgetMs: 12000, flags });

test('a shader scene starts, draws more than a flat field and hides nothing from readers', { skip }, () => {
  const r = run(page('test-quad'));
  assert.equal(r.state, 'running');
  assert.equal(r.aria, 'true');
  assert.ok(r.sample && r.sample.distinct > 2, JSON.stringify(r.sample));
  assert.equal(r.framesGrew, true);
});

test('a three.js scene loads the bundled library on demand and draws', { skip }, () => {
  const r = run(page('test-three'));
  assert.equal(r.state, 'running');
  assert.ok(r.sample && r.sample.distinct > 2, JSON.stringify(r.sample));
});

test('scene colours come from the brand tokens on the page', { skip }, () => {
  assert.equal(run(page('test-quad')).accent, '#2f5d50');
});

// The meter's runs use a virtual clock that never repeats animation frames, so the loop is watched in real time.
test('drawing runs on screen, stops while the scene is off screen, and resumes when it is back', { skip }, async () => {
  const b = await openBrowser();
  try {
    const p = await b.open(`${pathToFileURL(page('test-quad')).href}#live`, { width: 800, height: 600, settleMs: 2500 });
    const r = JSON.parse(await p.eval(`new Promise(function (done) {
      var s = document.querySelector('[data-scene]').__sdm, a = s.frames;
      setTimeout(function () {
        var onScreen = s.frames - a;
        scrollTo(0, 4000);
        setTimeout(function () { var b = s.frames; setTimeout(function () {
          var off = s.frames - b; scrollTo(0, 0);
          setTimeout(function () { var c = s.frames; setTimeout(function () { done(JSON.stringify({ state: s.state, onScreen: onScreen, off: off, back: s.frames - c })); }, 600); }, 200);
        }, 600); }, 300);
      }, 600);
    })`));
    assert.equal(r.state, 'running');
    assert.ok(r.onScreen > 5, JSON.stringify(r));
    assert.equal(r.off, 0, JSON.stringify(r));
    assert.ok(r.back > 5, `drawing resumes when the scene is back on screen: ${JSON.stringify(r)}`);
  } finally { await b.close(); }
});

test('a scene inside a frame that sits off the screen does not draw (the picker shows demos in frames)', { skip }, async () => {
  const file = page('test-quad');
  const host = path.join(path.dirname(file), 'host.html');
  fs.writeFileSync(host, '<!doctype html><body style="margin:0"><iframe id="near" src="index.html#live" width="600" height="400"></iframe><div style="block-size:5000px"></div><iframe id="far" src="index.html#live" width="600" height="400"></iframe></body>');
  const b = await openBrowser({ local: true });
  try {
    const p = await b.open(pathToFileURL(host).href, { width: 800, height: 600, settleMs: 3000 });
    const r = JSON.parse(await p.eval(`new Promise(function (done) {
      var f = function (id) { var s = document.getElementById(id).contentDocument.querySelector('[data-scene]').__sdm; return s ? s.frames : -1; };
      var a = { near: f('near'), far: f('far') };
      setTimeout(function () { done(JSON.stringify({ near: f('near') - a.near, far: f('far') - a.far })); }, 700);
    })`));
    assert.ok(r.near > 5, JSON.stringify(r));
    assert.equal(r.far, 0, JSON.stringify(r));
  } finally { await b.close(); }
});

test('with reduced motion the poster stays and nothing is drawn', { skip }, () => {
  const r = run(page('test-quad'), ['--force-prefers-reduced-motion']);
  assert.equal(r.state, 'poster');
  assert.equal(r.canvas, false);
  assert.equal(r.posterShown, true);
});

test('without WebGL the poster stays', { skip }, () => {
  const r = run(page('test-three'), ['--disable-webgl', '--disable-3d-apis']);
  assert.equal(r.state, 'poster');
  assert.equal(r.canvas, false);
  assert.equal(r.posterShown, true);
});

test('a scene that fails gives the poster back', { skip }, () => {
  const r = run(page('test-throw'));
  assert.equal(r.state, 'error');
  assert.equal(r.canvas, false);
  assert.equal(r.posterShown, true);
});

test('still mode draws one frame over the poster even with reduced motion (for making posters)', { skip }, () => {
  const file = page('test-quad');
  const html = fs.readFileSync(file, 'utf8').replace('<script src="three/stage.js"', '<script>window.SDM_STILL=1.5</script><script src="three/stage.js"');
  fs.writeFileSync(file, html);
  const r = run(file, ['--force-prefers-reduced-motion']);
  assert.equal(r.state, 'still');
  assert.equal(r.posterShown, false);
  assert.ok(r.sample.distinct > 2);
});

test('an object scene shows the own model of the business, lit, and keeps the poster until the model is there', { skip }, () => {
  const r = run(page('object', { attrs: ' data-model="box.glb"', one: true }));
  assert.equal(r.state, 'running');
  assert.ok(r.sample && r.sample.distinct > 2, JSON.stringify(r.sample));
});

test('an object scene whose model is missing gives the poster back, never an empty canvas', { skip }, () => {
  const r = run(page('object', { attrs: ' data-model="missing.glb"', one: true }));
  assert.equal(r.state, 'error');
  assert.equal(r.canvas, false);
  assert.equal(r.posterShown, true);
});
