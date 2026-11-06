#!/usr/bin/env node
// Draws the poster of every 3D scene from the scene itself: the site is built to a temporary folder, each page
// with a scene is opened with the stage in still mode (one frame at a fixed time, over the poster), and the
// scene's box is saved as WebP at the path its poster <img> names, inside the source's assets folder. The poster
// then always matches the scene: it is what shows first, with reduced motion, without WebGL and on paper.
// A ripple scene is skipped: its poster is the photograph itself.
//   node poster.mjs <src> [--width=1440] [--at=2]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs, isMain } from './lib/cli.mjs';
import { buildSite } from './build.mjs';
import { openBrowser } from './lib/cdp.mjs';
import { findChrome } from './lib/chrome.mjs';
import { insideFolder } from './snapshot.mjs';

const KEEP = new Set(['ripple']);

function pagesWithScenes(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'three' ? [] : pagesWithScenes(p, base);
    return e.name.endsWith('.html') && /\sdata-scene="/.test(fs.readFileSync(p, 'utf8')) ? [p] : [];
  });
}

export async function makePosters(srcDir, { width = 1440, height = 1000, at = 2 } = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-poster-'));
  const written = [];
  const errors = [];
  const assets = path.join(srcDir, 'assets');
  // The build reports the posters that do not exist yet; everything else it reports still counts.
  const built = buildSite(srcDir, out);
  for (const e of built.errors) if (!/does not resolve/.test(e)) errors.push(`build: ${e}`);
  const browser = await openBrowser({ local: true });
  try {
    for (const file of pagesWithScenes(out)) {
      const still = file.replace(/\.html$/, '.__sdm_still.html');
      fs.writeFileSync(still, fs.readFileSync(file, 'utf8').replace(/<script src="([^"]*three\/stage\.js)" defer><\/script>/, `<script>window.SDM_STILL=${Number(at)}</script><script src="$1" defer></script>`));
      const page = await browser.open(pathToFileURL(still).href, { width, height, settleMs: 300 });
      try {
        const scenes = JSON.parse(await page.eval(`new Promise(function (done) {
          var els = [].slice.call(document.querySelectorAll('[data-scene]')), n = 0;
          (function poll() {
            var busy = els.some(function (e) { return !e.__sdm || e.__sdm.state === 'waiting' || e.__sdm.state === 'loading'; });
            if (busy && n++ < 150) return setTimeout(poll, 100);
            setTimeout(function () { done(JSON.stringify(els.map(function (e) { var i = e.querySelector('img'); return { name: e.getAttribute('data-scene'), state: e.__sdm && e.__sdm.state, src: i && i.src }; }))); }, 300);
          })();
        })`, { timeoutMs: 30000 }));
        for (const [i, sc] of scenes.entries()) {
          if (KEEP.has(sc.name)) continue;
          const where = path.relative(out, file).replace(/\\/g, '/');
          if (sc.state !== 'still') { errors.push(`${where}: scene ${sc.name} did not draw (${sc.state || 'no stage'})`); continue; }
          let rel = null;
          try { rel = path.relative(out, fileURLToPath(sc.src.split(/[?#]/)[0])); } catch { /* not a file of the site */ }
          const target = rel && path.join(srcDir, rel);
          if (!target || !insideFolder(assets, target)) { errors.push(`${where}: the poster of scene ${sc.name} must be a file in the site's assets folder`); continue; }
          // In view, then the scene's box in page coordinates.
          const box = JSON.parse(await page.eval(`(function () { var e = document.querySelectorAll('[data-scene]')[${i}]; e.scrollIntoView({ block: 'start' });
            var r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }); })()`));
          await page.eval('new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); })');
          const shot = await page.shot({ clip: box, format: 'webp', quality: 82 });
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, shot);
          written.push(path.relative(srcDir, target).replace(/\\/g, '/'));
        }
      } finally { await page.close(); fs.rmSync(still, { force: true }); }
    }
  } finally {
    await browser.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
  return { written, errors };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) {
    console.error('usage: node poster.mjs <src> [--width=1440] [--at=2]');
    process.exit(2);
  }
  if (!findChrome()) {
    console.log('No Chrome or Edge was found, so the posters cannot be drawn. Install one, or set SITE_CHROME to its path.');
    process.exit(2);
  }
  const res = await makePosters(path.resolve(args._[0]), { width: Number(args.width) || 1440, at: args.at !== undefined ? Number(args.at) : 2 });
  for (const w of res.written) console.log(`poster: ${w}`);
  for (const e of res.errors) console.log(`fail: ${e}`);
  process.exit(res.errors.length ? 1 : 0);
}
