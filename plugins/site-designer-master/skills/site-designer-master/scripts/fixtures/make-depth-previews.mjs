#!/usr/bin/env node
// Draws a 640x400 preview of every 3D demo from the kit itself, into assets/library/previews/depth/. Run after a
// recipe changes. The ripple demo's photograph (demos/depth-photo.webp) is a fixed picture of our own.
//   node scripts/fixtures/make-depth-previews.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR } from '../lib/cli.mjs';
import { openBrowser } from '../lib/cdp.mjs';

const LIB = path.join(SKILL_DIR, 'assets', 'library');
const OUT = path.join(LIB, 'previews', 'depth');
const IDS = ['points', 'ripple'];

// The demo page as the picker serves it: demos/ beside three/ (the kit), with the stage drawing one still frame.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-depth-'));
fs.mkdirSync(path.join(dir, 'demos'));
fs.cpSync(path.join(SKILL_DIR, 'assets', 'site-kit', 'three'), path.join(dir, 'three'), { recursive: true });
const html = fs.readFileSync(path.join(LIB, 'demos', 'depth.html'), 'utf8').replace('<script src="../three/stage.js"', '<script>window.SDM_STILL=3</script><script src="../three/stage.js"');
fs.writeFileSync(path.join(dir, 'demos', 'depth.html'), html);
fs.mkdirSync(OUT, { recursive: true });

const browser = await openBrowser({ local: true });
async function still(id, width, height, format = 'webp', quality = 82) {
  const page = await browser.open(`${pathToFileURL(path.join(dir, 'demos', 'depth.html')).href}?d=${id}`, { width, height, settleMs: 300 });
  try {
    const state = await page.eval(`new Promise(function (done) { var n = 0; (function poll() { var s = document.getElementById('scene').__sdm;
      if ((!s || s.state === 'waiting' || s.state === 'loading') && n++ < 150) return setTimeout(poll, 100); setTimeout(function () { done(s && s.state); }, 300); })(); })`, { timeoutMs: 30000 });
    if (state !== 'still') throw new Error(`${id} did not draw (${state})`);
    return await page.shot({ format, quality });
  } finally { await page.close(); }
}
try {
  fs.copyFileSync(path.join(LIB, 'demos', 'depth-photo.webp'), path.join(dir, 'demos', 'depth-photo.webp'));
  for (const id of IDS) {
    fs.writeFileSync(path.join(OUT, `depth-${id}.webp`), await still(id, 640, 400));
    console.log(`depth-${id}.webp`);
  }
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
