#!/usr/bin/env node
// Builds the whole site from its source folder into a static folder that runs locally.
//   node build.mjs <src> --out=<site> [--dev] [--data=<values.json>]
// Source: site.json (name, lang, dir, pages), tokens.json, pages/*.html (page bodies), partials/*.html
// (override the site kit), assets/** (copied), site.css and fonts.css when present.
// Every root link must reach a built page or file, or the build fails. Root links are written relative,
// so the site also opens from disk; the 404 page keeps root links because the server sends it for any path.
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, parseArgs, isMain, readJson } from './lib/cli.mjs';
import { validateTokens, tokensToCss } from './tokens.mjs';
import { systemSheet } from './system-sheet.mjs';

const KIT = path.join(SKILL_DIR, 'assets', 'site-kit');
const MARKER = '.sdm-build';
const RULES = () => readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function readPartials(srcDir) {
  const out = {};
  for (const dir of [path.join(KIT, 'partials'), path.join(srcDir, 'partials')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) out[f.slice(0, -5)] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  return out;
}

// {{> name}} partials (nested up to 5 deep), then {{key}} and {{a.b}} values. Unknown keys stay visible as an error.
export function render(template, vars, partials, errors = [], where = '') {
  let html = template;
  for (let i = 0; i < 5 && /\{\{>\s*[\w-]+\s*\}\}/.test(html); i++) {
    html = html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (m, name) => {
      if (partials[name] === undefined) { errors.push(`${where}: partial ${name} does not exist`); return ''; }
      return partials[name];
    });
  }
  return html.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
    if (v === undefined) { errors.push(`${where}: {{${key}}} has no value`); return m; }
    return String(v);
  });
}

// 3D scenes (assets/site-kit/three): each [data-scene] names a kit scene or one of the site's own (src/scenes/*.js),
// and starts with its poster: an <img> first inside it, with width and height, never lazy.
const SCENE_RE = /<([a-z][\w-]*)\b([^>]*?)\sdata-scene="([^"]*)"([^>]*)>(\s*<img\b[^>]*>)?/gi;
export function sceneErrors(html, known, where) {
  const errors = [];
  for (const m of html.matchAll(SCENE_RE)) {
    const name = m[3];
    if (!known.has(name)) errors.push(`${where}: scene ${name} is not in the kit (${[...known].sort().join(', ')}) or in src/scenes/`);
    if (name === 'object' && !/\sdata-model="[^"]+"/.test(`${m[2]} ${m[4]}`)) errors.push(`${where}: scene object shows only the business's own 3D model (data-model="/assets/<file>.glb"); without one, use its photograph and the ripple recipe`);
    const img = m[5];
    if (!img) { errors.push(`${where}: scene ${name} needs its poster, an <img> first inside it`); continue; }
    if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img)) errors.push(`${where}: the poster of scene ${name} needs width and height`);
    if (/\sloading="lazy"/i.test(img)) errors.push(`${where}: the poster of scene ${name} is lazy; it is the first picture of the scene, so it loads at once`);
  }
  return errors;
}
const hasScene = (html) => /\sdata-scene="/.test(html);
const sceneNames = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)) : []);

function navHtml(pages, current, marked) {
  const items = pages.filter((p) => p.nav).map((p) => {
    const cur = marked && p.path === current ? ' aria-current="page"' : '';
    return `<li><a href="${p.path}"${cur}>${esc(p.label || p.title)}</a></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

const outFileFor = (p) => (p === '/' ? 'index.html' : path.join(p.replace(/^\/|\/$/g, ''), 'index.html'));
const depthOf = (p) => p.split('/').filter(Boolean).length;
const SKIP = /^(#|tel:|mailto:|https?:|data:|\/\/|javascript:)/i;

function resolves(url, pagePaths, outDir) {
  const bare = url.split(/[?#]/)[0];
  if (bare === '' || pagePaths.has(bare) || pagePaths.has(bare.endsWith('/') ? bare : `${bare}/`)) return true;
  return fs.existsSync(path.join(outDir, decodeURIComponent(bare)));
}

function clearOut(outDir, errors) {
  if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); return true; }
  const entries = fs.readdirSync(outDir);
  if (entries.length && !entries.includes(MARKER)) {
    errors.push(`${outDir} has files that this build did not make; refusing to clear it`);
    return false;
  }
  for (const e of entries) fs.rmSync(path.join(outDir, e), { recursive: true, force: true });
  return true;
}

export function buildSite(srcDir, outDir, opts = {}) {
  const errors = [];
  const site = readJson(path.join(srcDir, 'site.json'));
  const strings = readJson(path.join(KIT, 'strings.json'));
  const t = strings[site.lang] || strings.en;
  if (!clearOut(outDir, errors)) return { pages: [], errors };

  const tokensFile = path.join(srcDir, 'tokens.json');
  let tokens = null;
  if (fs.existsSync(tokensFile)) {
    tokens = readJson(tokensFile);
    const res = validateTokens(tokens, RULES());
    for (const e of res.errors) errors.push(`tokens: ${e}`);
    fs.writeFileSync(path.join(outDir, 'tokens.css'), tokensToCss(tokens));
  } else errors.push('tokens: tokens.json is missing');

  fs.copyFileSync(path.join(KIT, 'base.css'), path.join(outDir, 'base.css'));
  fs.copyFileSync(path.join(KIT, 'site.js'), path.join(outDir, 'site.js'));
  if (fs.existsSync(path.join(srcDir, 'assets'))) fs.cpSync(path.join(srcDir, 'assets'), path.join(outDir, 'assets'), { recursive: true });
  // Both sit at the site root, so a root url() in them becomes relative: the site then also renders from disk.
  for (const f of ['site.css', 'fonts.css']) if (fs.existsSync(path.join(srcDir, f))) fs.writeFileSync(path.join(outDir, f), fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/url\((['"]?)\/(?!\/)/g, 'url($1'));
  // A development build adds the tweak panel to every page and the page of every state at /_review/.
  if (opts.dev) for (const f of ['tweaks.js', 'tweaks.css']) fs.copyFileSync(path.join(KIT, f), path.join(outDir, f));

  const partials = readPartials(srcDir);
  const layout = fs.readFileSync(path.join(KIT, 'layout.html'), 'utf8');
  const pagePaths = new Set(site.pages.map((p) => p.path));
  if (opts.dev) { pagePaths.add('/_review/'); if (tokens) pagePaths.add('/_system/'); }
  const base = {
    // Page data: src/data.json, with --data values on top (the worst-case build swaps them in). Values are inserted as written.
    lang: site.lang, dir: site.dir, name: esc(site.name), t, year: new Date().getFullYear(),
    data: { ...(fs.existsSync(path.join(srcDir, 'data.json')) ? readJson(path.join(srcDir, 'data.json')) : {}), ...(opts.data || {}) },
    fontsLink: fs.existsSync(path.join(srcDir, 'fonts.css')) ? '<link rel="stylesheet" href="/fonts.css">\n' : '',
    siteCssLink: fs.existsSync(path.join(srcDir, 'site.css')) ? '<link rel="stylesheet" href="/site.css">' : '',
    navPlain: navHtml(site.pages, null, false),
  };

  const jobs = site.pages.map((p) => ({ page: p, file: `pages/${p.file}`, body: fs.readFileSync(path.join(srcDir, 'pages', p.file), 'utf8'), out: outFileFor(p.path), rewrite: true }));
  const own404 = path.join(srcDir, 'pages', '404.html');
  if (opts.dev) jobs.push({ page: { path: '/_review/', title: 'Every state', description: 'Development page' }, file: 'site-kit review.html', body: fs.readFileSync(path.join(KIT, 'pages', 'review.html'), 'utf8'), out: outFileFor('/_review/'), rewrite: true });
  if (opts.dev && tokens) jobs.push({ page: { path: '/_system/', title: 'The visual system', description: 'Development page' }, file: 'system-sheet', body: systemSheet(tokens, site), out: outFileFor('/_system/'), rewrite: true });
  jobs.push({ page: { path: '/404', title: t.notFoundTitle, description: t.notFoundTitle }, file: fs.existsSync(own404) ? 'pages/404.html' : 'site-kit 404.html', body: fs.readFileSync(fs.existsSync(own404) ? own404 : path.join(KIT, 'pages', '404.html'), 'utf8'), out: '404.html', rewrite: false });

  // The 3D kit goes in only when a page or partial uses a scene; the site's own scenes sit beside the kit's.
  const ownScenes = path.join(srcDir, 'scenes');
  const knownScenes = new Set([...sceneNames(path.join(KIT, 'three', 'scenes')), ...sceneNames(ownScenes)]);
  if (jobs.some((j) => hasScene(j.body)) || Object.values(partials).some(hasScene)) {
    fs.cpSync(path.join(KIT, 'three'), path.join(outDir, 'three'), { recursive: true, filter: (f) => path.basename(f) !== 'VERSION' });
    for (const f of sceneNames(ownScenes)) {
      const js = fs.readFileSync(path.join(ownScenes, `${f}.js`), 'utf8');
      // The stage owns the loop: it pauses off screen, in a hidden tab and with reduced motion. A scene only draws.
      if (/\b(requestAnimationFrame|setAnimationLoop|setInterval)\s*\(/.test(js)) errors.push(`scenes/${f}.js: runs its own drawing loop; draw in render() and let the stage call it`);
      fs.writeFileSync(path.join(outDir, 'three', 'scenes', `${f}.js`), js);
    }
  }

  const built = [];
  for (const job of jobs) {
    const { page } = job;
    const vars = {
      ...base, title: esc(page.title), description: esc(page.description),
      fullTitle: esc(page.title === site.name ? site.name : `${page.title} | ${site.name}`),
      nav: navHtml(site.pages, page.path, true),
    };
    vars.content = render(job.body, vars, partials, errors, job.file);
    let html = render(layout, vars, partials, errors, job.file);
    if (opts.dev) html = html.replace('</head>', '<link rel="stylesheet" href="/tweaks.css">\n<script src="/tweaks.js" defer></script>\n</head>');
    if (hasScene(html)) {
      errors.push(...sceneErrors(html, knownScenes, job.file));
      html = html.replace('</head>', '<script src="/three/stage.js" defer></script>\n</head>');
    }
    html = html.replace(/\b(href|src)="(\/[^"]*)"/g, (m, attr, url) => {
      if (SKIP.test(url)) return m;
      if (!resolves(url, pagePaths, outDir)) errors.push(`${job.file}: ${url} does not resolve to a built page`);
      if (!job.rewrite) return m;
      const rel = '../'.repeat(depthOf(page.path)) + url.slice(1);
      return `${attr}="${rel || './'}"`;
    });
    const target = path.join(outDir, job.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html);
    built.push(job.out.replace(/\\/g, '/'));
  }
  fs.writeFileSync(path.join(outDir, MARKER), 'built by site-designer-master build.mjs\n');
  return { pages: built, errors: [...new Set(errors)] };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0] || !args.out) {
    console.error('usage: node build.mjs <src> --out=<site> [--dev] [--data=<values.json>]');
    process.exit(2);
  }
  const data = args.data ? readJson(args.data) : undefined;
  const res = buildSite(path.resolve(args._[0]), path.resolve(args.out), { dev: Boolean(args.dev), data });
  for (const e of res.errors) console.log(`fail: ${e}`);
  console.log(`built ${res.pages.length} pages into ${args.out}`);
  process.exit(res.errors.length ? 1 : 0);
}
