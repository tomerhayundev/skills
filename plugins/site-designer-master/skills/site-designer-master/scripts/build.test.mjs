import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR } from './lib/cli.mjs';
import { buildSite } from './build.mjs';

const FIX = path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const copySrc = () => { const d = tmp(); fs.cpSync(FIX, d, { recursive: true }); return d; };
const read = (out, p) => fs.readFileSync(path.join(out, p), 'utf8');

test('every page is built at its path, plus the 404 page and the CSS', () => {
  const out = tmp();
  const r = buildSite(FIX, out);
  assert.deepEqual(r.errors, []);
  for (const f of ['index.html', 'about/index.html', 'contact/index.html', '404.html', 'tokens.css', 'base.css', 'assets/room.svg']) assert.ok(fs.existsSync(path.join(out, f)), f);
});

test('each page carries lang, dir, one main, the skip link first, title and description', () => {
  const out = tmp();
  buildSite(FIX, out);
  const html = read(out, 'about/index.html');
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.equal(html.match(/<main\b/g).length, 1);
  assert.match(html, /<main id="main"/);
  const firstFocusable = html.match(/<body>[\s\S]*?<(a|button|input)\b[^>]*>/)[0];
  assert.match(firstFocusable, /class="skip-link"/);
  assert.match(html, /<title>About \| Test Studio<\/title>/);
  assert.match(html, /<meta name="description" content="About the studio.">/);
});

test('only the current page is marked in the nav', () => {
  const out = tmp();
  buildSite(FIX, out);
  const html = read(out, 'about/index.html');
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /<a href="\.\.\/about\/" aria-current="page">About<\/a>/);
});

test('root links become relative so the site also opens from disk', () => {
  const out = tmp();
  buildSite(FIX, out);
  const about = read(out, 'about/index.html');
  assert.match(about, /href="\.\.\/tokens\.css"/);
  assert.match(about, /<a href="\.\.\/">Back home<\/a>/);
  assert.match(read(out, 'index.html'), /src="assets\/room\.svg"/);
});

test('a link to a page that was never built stops the build', () => {
  const src = copySrc();
  const p = path.join(src, 'pages', 'index.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('href="/contact/"', 'href="/servces/"'));
  const r = buildSite(src, tmp());
  assert.ok(r.errors.includes('pages/index.html: /servces/ does not resolve to a built page'), r.errors.join('\n'));
  const cli = spawnSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'build.mjs'), src, `--out=${tmp()}`], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout + cli.stderr, /\/servces\/ does not resolve/);
});

test('anchors, phone, mail and outside links are not checked as pages', () => {
  const r = buildSite(FIX, tmp());
  assert.deepEqual(r.errors, []);
});

test('a missing image or an anchor to a missing page is an error', () => {
  const src = copySrc();
  const p = path.join(src, 'pages', 'about.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '<img src="/assets/none.png" alt=""><a href="/team/#x">x</a>');
  const errs = buildSite(src, tmp()).errors.join('\n');
  assert.match(errs, /\/assets\/none\.png does not resolve/);
  assert.match(errs, /\/team\/#x does not resolve/);
});

test('a Hebrew site is set right to left', () => {
  const src = copySrc();
  const sj = path.join(src, 'site.json');
  const site = JSON.parse(fs.readFileSync(sj, 'utf8'));
  Object.assign(site, { lang: 'he', dir: 'rtl' });
  fs.writeFileSync(sj, JSON.stringify(site));
  const out = tmp();
  buildSite(src, out);
  assert.match(read(out, 'index.html'), /<html lang="he" dir="rtl">/);
});

test('broken tokens stop the build', () => {
  const src = copySrc();
  const tj = path.join(src, 'tokens.json');
  const t = JSON.parse(fs.readFileSync(tj, 'utf8'));
  t.type.steps.body = 14;
  fs.writeFileSync(tj, JSON.stringify(t));
  assert.match(buildSite(src, tmp()).errors.join(), /tokens: body 14px below 16px/);
});

test('a rebuild removes pages that were dropped', () => {
  const out = tmp();
  buildSite(FIX, out);
  fs.mkdirSync(path.join(out, 'old'));
  fs.writeFileSync(path.join(out, 'old', 'index.html'), 'x');
  buildSite(FIX, out);
  assert.equal(fs.existsSync(path.join(out, 'old')), false);
});

test('a normal build has no tweak panel and no review page; a dev build has both', () => {
  const out = tmp();
  buildSite(FIX, out);
  assert.equal(fs.existsSync(path.join(out, 'tweaks.js')), false);
  assert.equal(fs.existsSync(path.join(out, '_review', 'index.html')), false);
  assert.doesNotMatch(read(out, 'index.html'), /tweaks/);
  const dev = tmp();
  const r = buildSite(FIX, dev, { dev: true });
  assert.deepEqual(r.errors, []);
  for (const f of ['tweaks.js', 'tweaks.css', '_review/index.html']) assert.ok(fs.existsSync(path.join(dev, f)), f);
  assert.match(read(dev, 'about/index.html'), /<script src="\.\.\/tweaks\.js" defer><\/script>/);
  const review = read(dev, '_review/index.html');
  for (const s of ['disabled', 'aria-busy="true"', 'aria-invalid="true"', 'data-state="empty"', 'data-state="error"', 'data-state="success"', 'skeleton']) assert.ok(review.includes(s), s);
});

test('data placeholders come from data.json and --data values override them', () => {
  const src = copySrc();
  fs.writeFileSync(path.join(src, 'data.json'), JSON.stringify({ dish: 'Rye loaf', list: '<li>One</li>' }));
  const p = path.join(src, 'pages', 'about.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '<p>{{data.dish}}</p><ul>{{data.list}}</ul>');
  const out = tmp();
  assert.deepEqual(buildSite(src, out).errors, []);
  assert.match(read(out, 'about/index.html'), /<p>Rye loaf<\/p><ul><li>One<\/li><\/ul>/);
  const worst = tmp();
  assert.deepEqual(buildSite(src, worst, { data: { dish: 'A very long name for one loaf of bread', list: '' } }).errors, []);
  assert.match(read(worst, 'about/index.html'), /<p>A very long name for one loaf of bread<\/p><ul><\/ul>/);
});

test('root urls inside site.css and fonts.css become relative', () => {
  const src = copySrc();
  fs.writeFileSync(path.join(src, 'site.css'), ".a { background: url(/assets/room.svg); }\n.b { background: url('/assets/room.svg'); }\n.c { background: url(//cdn.example/x.png); }\n");
  const out = tmp();
  buildSite(src, out);
  const css = read(out, 'site.css');
  assert.match(css, /url\(assets\/room\.svg\)/);
  assert.match(css, /url\('assets\/room\.svg'\)/);
  assert.match(css, /url\(\/\/cdn\.example\/x\.png\)/);
});

test('a dev build draws the visual system as one page: colours with roles and contrast, every size in the real faces, space, corners', () => {
  const out = tmp();
  buildSite(FIX, out);
  assert.equal(fs.existsSync(path.join(out, '_system', 'index.html')), false, 'never in the final site');
  const dev = tmp();
  assert.deepEqual(buildSite(FIX, dev, { dev: true }).errors, []);
  const sys = read(dev, '_system/index.html');
  assert.match(sys, /<h1>What every page is made from<\/h1>/);
  // Each colour: its role, its value, drawn from the site's own variable, and the contrast of text on it.
  assert.match(sys, /data-role="accent"[^>]*style="background: var\(--color-accent\);/);
  assert.match(sys, /accent<\/b> #2b5d4f/);
  assert.match(sys, /ink on ground [\d.]+:1/);
  assert.match(sys, /accent-ink on accent [\d.]+:1/);
  // Each size in its real face, with its value and the site's own words as the sample.
  for (const [step, px] of [['display', 72], ['h1', 48], ['body', 18], ['small', 14]]) assert.match(sys, new RegExp(`font-size: var\\(--step-${step}\\)[^>]*>[^<]*Test Studio[^<]*<[\\s\\S]*?${step} ${px}px`), step);
  assert.match(sys, /Test Display/);
  assert.match(sys, /Test Text/);
  for (const v of [4, 8, 16, 240]) assert.match(sys, new RegExp(`space-\\d+ ${v}px`));
  assert.match(sys, /corner 12px/);
  assert.doesNotMatch(sys, /\{\{|undefined|NaN/);
});

test('the visual system page lists motion when the tokens have it', async () => {
  const { systemSheet } = await import('./system-sheet.mjs');
  const html = systemSheet({ ...JSON.parse(read(FIX, 'tokens.json')), motion: { fast: '120ms', base: '240ms' } }, { name: 'X', pages: [] });
  assert.match(html, /motion-fast 120ms/);
  assert.match(html, /motion-base 240ms/);
});

test('every site prints cleanly: a menu or price page on paper keeps its words and contact, drops the screen chrome', () => {
  const css = fs.readFileSync(path.join(SKILL_DIR, 'assets', 'site-kit', 'base.css'), 'utf8');
  const print = (/@media print\s*\{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
  assert.ok(print, 'base.css has a print block');
  assert.match(print, /\.site-nav[^{]*\{[^}]*display:\s*none/);
  assert.match(print, /\.skip-link/);
  assert.match(print, /\.sdm-tweaks/);
  assert.match(print, /\.nav-toggle/);
  assert.match(print, /break-inside:\s*avoid/);
  assert.match(print, /color:\s*#000/);
  assert.doesNotMatch(print, /\.site-footer[^{]*\{[^}]*display:\s*none/, 'the footer keeps the contact on paper');
});

test('on a right-to-left site the system page reads left to right, and its samples keep the site\'s direction', async () => {
  const { systemSheet } = await import('./system-sheet.mjs');
  const html = systemSheet(JSON.parse(read(FIX, 'tokens.json')), { name: 'הדלת הכחולה', lang: 'he', dir: 'rtl', pages: [{ description: 'מאפייה קטנה' }] });
  assert.match(html, /<section class="review system" lang="en" dir="ltr">/);
  assert.match(html, /<p lang="he" dir="rtl" style="font-family: var\(--font-display\); font-size: var\(--step-display\)[^>]*>הדלת הכחולה</);
});

// 3D scenes: the stage, the bundled library and the scenes are copied only when a page uses one.
const withScene = (body, { own = null } = {}) => {
  const src = copySrc();
  const p = path.join(src, 'pages', 'about.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + body);
  if (own) { fs.mkdirSync(path.join(src, 'scenes')); fs.writeFileSync(path.join(src, 'scenes', `${own}.js`), `SDMStage.scene('${own}', {}, function () { return { render: function () {} }; });`); }
  return src;
};
const POSTER = '<img src="/assets/room.svg" alt="" width="1200" height="800">';

test('a page with a scene gets the stage; the kit is copied once; pages without scenes stay without', () => {
  const out = tmp();
  const r = buildSite(withScene(`<div class="scene" data-scene="points">${POSTER}</div>`), out);
  assert.deepEqual(r.errors, []);
  assert.match(read(out, 'about/index.html'), /<script src="\.\.\/three\/stage\.js" defer><\/script>\s*<\/head>/);
  assert.doesNotMatch(read(out, 'index.html'), /stage\.js/);
  for (const f of ['three/stage.js', 'three/three.min.js', 'three/three-LICENSE.txt', 'three/scenes/points.js', 'three/scenes/object.js']) assert.ok(fs.existsSync(path.join(out, f)), f);
});

test('a site without scenes carries no 3D files', () => {
  const out = tmp();
  buildSite(FIX, out);
  assert.equal(fs.existsSync(path.join(out, 'three')), false);
});

test('a scene the kit and the site do not have stops the build', () => {
  const r = buildSite(withScene(`<div data-scene="torus-knot">${POSTER}</div>`), tmp());
  assert.ok(r.errors.some((e) => /scene torus-knot/.test(e)), r.errors.join('\n'));
});

test('a scene needs its poster first inside it, sized and never lazy', () => {
  const none = buildSite(withScene('<div data-scene="points"><p>no picture</p></div>'), tmp());
  assert.ok(none.errors.some((e) => /points.*poster/.test(e)), none.errors.join('\n'));
  const lazy = buildSite(withScene('<div data-scene="points"><img src="/assets/room.svg" alt="" width="1200" height="800" loading="lazy"></div>'), tmp());
  assert.ok(lazy.errors.some((e) => /lazy/.test(e)), lazy.errors.join('\n'));
  const unsized = buildSite(withScene('<div data-scene="points"><img src="/assets/room.svg" alt=""></div>'), tmp());
  assert.ok(unsized.errors.some((e) => /width and height/.test(e)), unsized.errors.join('\n'));
});

test('the site\'s own scenes (src/scenes/*.js) are copied next to the kit\'s and can be named', () => {
  const out = tmp();
  const r = buildSite(withScene(`<div data-scene="bakery-loaf">${POSTER}</div>`, { own: 'bakery-loaf' }), out);
  assert.deepEqual(r.errors, []);
  assert.ok(fs.existsSync(path.join(out, 'three', 'scenes', 'bakery-loaf.js')));
});

test('a site\'s own scene that runs its own drawing loop stops the build: the stage owns the loop', () => {
  const src = withScene(`<div data-scene="spin">${POSTER}</div>`, { own: 'spin' });
  fs.writeFileSync(path.join(src, 'scenes', 'spin.js'), "SDMStage.scene('spin', { three: true }, function (ctx) { var r = new ctx.THREE.WebGLRenderer({ canvas: ctx.canvas }); r.setAnimationLoop(function () {}); return { render: function () {} }; });");
  const r = buildSite(src, tmp());
  assert.ok(r.errors.some((e) => /spin.*loop/.test(e)), r.errors.join('\n'));
});

test('an object scene shows only the business\'s own 3D model: without one the build stops, never a drawn stand-in', () => {
  const r = buildSite(withScene(`<div data-scene="object" data-material="clay">${POSTER}</div>`), tmp());
  assert.ok(r.errors.some((e) => /object.*own 3D model/.test(e)), r.errors.join('\n'));
  const ok = buildSite(withScene(`<div data-scene="object" data-model="/assets/room.svg">${POSTER}</div>`), tmp());
  assert.deepEqual(ok.errors, []);
});

test('the kit has no drawn shapes and no background field: only what looks right', () => {
  const kit = path.join(SKILL_DIR, 'assets', 'site-kit', 'three', 'scenes');
  assert.deepEqual(fs.readdirSync(kit).sort(), ['object.js', 'points.js', 'ripple.js']);
  assert.doesNotMatch(fs.readFileSync(path.join(kit, 'object.js'), 'utf8'), /LatheGeometry|TorusGeometry|ExtrudeGeometry/);
});

test('the phone menu grows from the header that holds its button, never from nowhere, and closes at once', () => {
  const css = fs.readFileSync(path.join(SKILL_DIR, 'assets', 'site-kit', 'base.css'), 'utf8');
  const phone = (/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
  const open = (/\.nav-open \.site-nav \{([^}]*)\}/.exec(phone) || [])[1] || '';
  assert.match(open, /transform-origin:\s*top/, 'it opens from its top edge, where the button is');
  assert.match(open, /transition:[^;]*opacity[^;]*transform/);
  assert.match(phone, /@starting-style\s*\{\s*\.nav-open \.site-nav\s*\{[^}]*opacity:\s*0[^}]*transform:/);
});
