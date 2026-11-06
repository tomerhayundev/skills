#!/usr/bin/env node
// The meter: proves a built site in a real browser. It copies the site to a temporary folder, injects a probe
// (and the vendored accessibility engine) into every page, opens each page in headless Chrome or Edge at each
// width, and scores what the page really renders against assets/rules.json.
//   node meter.mjs <site> [--brief=brief.json] [--widths=375,1440] [--json]
// Exits 1 when any rule at severity "fail" fires. Warnings print but do not fail; defend each in one line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR, parseArgs, isMain, readJson } from './lib/cli.mjs';
import { probeAtWidth, findChrome } from './lib/chrome.mjs';
import { qualityRules, cssRules } from './meter/rules-quality.mjs';
import { slopRules } from './meter/rules-slop.mjs';
import { contentRules } from './meter/rules-content.mjs';
import { sceneRules } from './meter/rules-scene.mjs';

const PROBE = fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'meter', 'probe.js'), 'utf8');
const PROBE_SLOP = fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'meter', 'probe-slop.js'), 'utf8');
const AXE = path.join(SKILL_DIR, 'assets', 'vendor', 'axe.min.js');
export const RULE_MODULES = [qualityRules, slopRules, contentRules, sceneRules];
// Extra runs at the widest width, each a fresh page load: { name, head: html at the top of <head>, flags: browser switches }.
export const PASSES = [
  // Scroll-triggered reveals never fire: whatever is still invisible would stay invisible when a script fails.
  { name: 'stubio', head: '<script>window.IntersectionObserver=function(){return{observe:function(){},unobserve:function(){},disconnect:function(){},takeRecords:function(){return[]}}};</script>' },
  { name: 'motion', flags: ['--force-prefers-reduced-motion'] },
  // A page with a 3D scene, opened by a browser without WebGL: the poster must show.
  { name: 'nowebgl', flags: ['--disable-webgl', '--disable-3d-apis'], when: (html) => /\sdata-scene="/.test(html) },
];

function htmlFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p, base);
    return e.name.endsWith('.html') ? [path.relative(base, p).replace(/\\/g, '/')] : [];
  });
}
const pagePath = (rel) => (rel === 'index.html' ? '/' : rel === '404.html' ? '/404' : `/${rel.replace(/index\.html$/, '')}`);

// A page read from files can be painted once before its render-blocking stylesheets arrive, which a served page
// never shows; the clock below notes the first frame drawn with them, and the probe counts layout shifts from then on.
const STYLE_CLOCK = "<script>window.__sdmStyles=0;document.addEventListener('load',function(e){var t=e.target;if(t&&t.tagName==='LINK'&&/stylesheet/i.test(t.rel)&&t.closest('head')&&(!t.media||/^(all|screen)$/i.test(t.media)))requestAnimationFrame(function(){requestAnimationFrame(function(){window.__sdmStyles=performance.now()})})},true)</script>";

function inject(html, opts, head = '') {
  const tags = `<script>window.__SDM_OPTS=${JSON.stringify(opts)};</script>${opts.axe ? `<script src="${pathToFileURL(AXE).href}"></script>` : ''}<script>${PROBE_SLOP}</script><script>${PROBE}</script>`;
  html = html.replace(/<head([^>]*)>/i, `<head$1>${STYLE_CLOCK}${head}`);
  const i = html.lastIndexOf('</body>');
  return i < 0 ? html + tags : html.slice(0, i) + tags + html.slice(i);
}

export function measure(siteDir, { widths, brief = null, axeWidths = [375, 1440], height = 900 } = {}) {
  const rules = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
  widths = widths || rules.widths;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-meter-'));
  try {
    fs.cpSync(siteDir, work, { recursive: true });
    const pages = [];
    for (const rel of htmlFiles(work)) {
      const file = path.join(work, rel);
      let html = fs.readFileSync(file, 'utf8');
      // The 404 page keeps root links for the server; on disk they must point at the copy.
      if (rel === '404.html') html = html.replace(/\b(href|src)="\/(?!\/)/g, '$1="./');
      for (const width of widths) {
        const runs = [{ pass: 'main', opts: { width, axe: axeWidths.includes(width), pass: 'main' } }];
        if (width === Math.max(...widths)) for (const p of PASSES.filter((q) => !q.when || q.when(html))) runs.push({ pass: p.name, opts: { width, axe: false, pass: p.name }, head: p.head, flags: p.flags });
        for (const run of runs) {
          const probeFile = path.join(path.dirname(file), `__sdm_${run.pass}_${width}.html`);
          fs.writeFileSync(probeFile, inject(html, run.opts, run.head));
          const facts = probeAtWidth(probeFile, { width, height, budgetMs: 15000, flags: run.flags || [] });
          fs.rmSync(probeFile);
          pages.push({ path: pagePath(rel), width, pass: run.pass, facts });
        }
      }
    }
    const css = fs.readdirSync(work).filter((f) => f.endsWith('.css') && !['fonts.css', 'tokens.css'].includes(f)).map((f) => ({ name: f, css: fs.readFileSync(path.join(work, f), 'utf8') }));
    // Styles written inside pages count too: style blocks and style attributes.
    for (const rel of htmlFiles(work).filter((r) => !r.includes('__sdm_'))) {
      const html = fs.readFileSync(path.join(work, rel), 'utf8');
      const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n')
        + [...html.matchAll(/\sstyle="([^"]*)"/gi)].map((x, i) => `\n[style-attr-${i}]{${x[1]}}`).join('');
      if (inline.trim()) css.push({ name: rel, css: inline, page: pagePath(rel) });
    }
    return { pages, css, brief };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export function score(measurement, rules) {
  const fails = [];
  const warns = [];
  const push = (f) => {
    const r = rules.rules[f.id];
    if (!r) throw new Error(`rule ${f.id} is not in rules.json`);
    (r.severity === 'fail' ? fails : warns).push(f);
  };
  for (const pg of measurement.pages) {
    for (const mod of RULE_MODULES) {
      for (const f of mod(pg.facts, { width: pg.width, pass: pg.pass || 'main', t: rules.thresholds, brief: measurement.brief || null, page: pg.path })) push({ ...f, page: pg.path, width: pg.width });
    }
  }
  for (const f of cssRules(measurement.css || [])) push({ ...f, page: f.page || 'css', width: null });
  return { fails, warns };
}

export function report({ fails, warns }) {
  const lines = [];
  const group = (list, label) => {
    const by = new Map();
    for (const f of list) {
      const k = `${f.id}|${f.page}|${f.detail}`;
      const e = by.get(k) || { ...f, widths: [] };
      if (f.width) e.widths.push(f.width);
      by.set(k, e);
    }
    for (const e of by.values()) lines.push(`${label} ${e.id.padEnd(22)} ${e.page.padEnd(14)} ${e.widths.length ? `@${e.widths.join(',')}` : ''} ${e.detail}${e.selector ? `  [${e.selector}]` : ''}`);
  };
  group(fails, 'FAIL');
  group(warns, 'warn');
  lines.push(`${fails.length} failures, ${warns.length} warnings`);
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) {
    console.error('usage: node meter.mjs <site> [--brief=brief.json] [--widths=375,1440] [--json]');
    process.exit(2);
  }
  if (!findChrome()) {
    console.log('No Chrome or Edge was found, so the site cannot be checked. Install one, or set SITE_CHROME to its path.');
    process.exit(2);
  }
  const rules = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
  const brief = args.brief ? readJson(args.brief) : null;
  const widths = args.widths ? String(args.widths).split(',').map(Number) : undefined;
  const res = score(measure(path.resolve(args._[0]), { widths, brief }), rules);
  console.log(args.json ? JSON.stringify(res, null, 2) : report(res));
  process.exit(res.fails.length ? 1 : 0);
}
