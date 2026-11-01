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
