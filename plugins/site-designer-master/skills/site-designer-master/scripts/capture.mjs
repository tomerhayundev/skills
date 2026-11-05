#!/usr/bin/env node
// Makes the library's pictures: the first screen of a site at 1440x900, saved as a 640x400 card picture and a
// 1280x800 large picture, plus the first screen at a true phone width (390x844), all WebP, encoded by the browser
// itself (no image tools needed). Before each picture, cookie banners and pop-ups are hidden; a picture still
// mostly covered is refused. A live site's design is read as exact values (palette, type, spacing) on the way.
//   node capture.mjs <shelf.json> --pack=<pack dir> [--shard=0/3] [--force] [--only=<id>,<id>] [--recheck]
// A live site's phone picture and measured design go to <pack>/captured.jsonl; --merge writes them into the shelf.
// An entry whose site does not answer gets no picture, and an entry without a picture is never shown.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, isMain, readJson } from './lib/cli.mjs';
import { screenshot, dumpProbe, EMIT_JS } from './lib/chrome.mjs';
import { decodePng } from './lib/png.mjs';
import { openBrowser } from './lib/cdp.mjs';

export const CARD = { width: 640, height: 400 };
export const LARGE = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };
// After the pop-ups are hidden, a picture whose screen is still more than this share covered by a fixed layer is refused.
export const COVERED_MAX = 0.34;
const CLEAN = fs.readFileSync(new URL('./lib/page-clean.js', import.meta.url), 'utf8');
const READ = fs.readFileSync(new URL('./lib/design-read.js', import.meta.url), 'utf8');

// Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X).
export function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  throw new Error('Not a WebP file');
}

// Share of the picture taken by its most common colour (coarsely grouped). A loading screen, a black canvas
// the headless browser could not draw, or a plain error page is nearly one colour.
export function dominantShare(png) {
  const { width, height, data } = decodePng(png);
  const counts = new Map();
  let n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const k = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
      counts.set(k, (counts.get(k) || 0) + 1);
      n++;
    }
  }
  return Math.max(...counts.values()) / n;
}
// The colours a picture really shows, most first: each a block of near colours, named by its most frequent exact
// colour, with its share of the picture. The first is the background the eye sees.
export function shownColours(png, { min = 0.04, max = 5 } = {}) {
  const { width, height, data } = decodePng(png);
  const blocks = new Map();
  let n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const k = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
      const exact = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const b = blocks.get(k) || { n: 0, exact: new Map() };
      b.n++; b.exact.set(exact, (b.exact.get(exact) || 0) + 1);
      blocks.set(k, b);
      n++;
    }
  }
  return [...blocks.values()].sort((a, b) => b.n - a.n).filter((b) => b.n / n >= min).slice(0, max).map((b) => {
    const top = [...b.exact.entries()].sort((x, y) => y[1] - x[1])[0][0];
    return { hex: `#${top.toString(16).padStart(6, '0')}`, share: Math.round((b.n / n) * 1000) / 1000 };
  });
}

// Minimal designs (a name on white, one colour field) reach about 0.98; loaders and blocked pages sit above.
// What slips under (a loader with a percentage) is caught by the curation pass: hidden in the shelf file.
export const BLANK_SHARE = 0.985;

// A 64-bit average-hash of the picture: 8x8 blocks of brightness against their mean. Two captures of the same
// page differ by a few bits; a redesigned page differs by many. The monthly check compares these.
export function averageHash(png) {
  const { width, height, data } = decodePng(png);
  const cells = new Array(64).fill(0), counts = new Array(64).fill(0);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const c = Math.min(7, Math.floor((y / height) * 8)) * 8 + Math.min(7, Math.floor((x / width) * 8));
      cells[c] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      counts[c]++;
    }
  }
  const avg = cells.map((v, k) => v / counts[k]);
  const mean = avg.reduce((a, b) => a + b, 0) / 64;
  let bits = 0n;
  avg.forEach((v, k) => { if (v > mean) bits |= 1n << BigInt(k); });
  return bits.toString(16).padStart(16, '0');
}
export function hashDistance(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOT_ALLOWED = (url) => new Error(`no picture: ${url} leads to this machine or its network, so it is not opened`);
async function reachable(url, timeoutMs) {
  if (!/^https?:/i.test(url)) return;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA } }).catch((e) => ({ ok: false, status: e.name }));
  if (!res.ok) throw new Error(`no picture: ${url} answered ${res.status}`);
}

// The browser draws the screenshot onto a canvas and hands back WebP. The PNG goes in as a data address so the
// canvas is never treated as foreign content.
function toWebp(png, dir, sizes) {
  const page = path.join(dir, 'encode.html');
  const sizesJs = JSON.stringify(sizes);
  fs.writeFileSync(page, `<!doctype html><body><script>${EMIT_JS}var img=new Image();img.onload=function(){var out={};${sizesJs}.forEach(function(s){var c=document.createElement('canvas');c.width=s.width;c.height=s.height;var g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,0,0,s.width,s.height);out[s.width]=c.toDataURL('image/webp',s.quality)});__emit(out)};img.src='data:image/png;base64,${png.toString('base64')}';</script>`);
  return dumpProbe(page, { width: 800, height: 600, budgetMs: 10000 });
}

// Checks pictures already in the pack (WebP, decoded by the browser) and deletes any that are blank, so an
// entry captured before the blank check existed is never shown. Returns the ids removed.
export function recheckPack(shelf, packDir) {
  const removed = [];
  const list = shelf.entries.filter((e) => !e.demo && fs.existsSync(path.join(packDir, e.preview)));
  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-recheck-'));
    try {
      const imgs = batch.map((e) => `data:image/webp;base64,${fs.readFileSync(path.join(packDir, e.preview)).toString('base64')}`);
      const page = path.join(work, 'check.html');
      fs.writeFileSync(page, `<!doctype html><body><script>${EMIT_JS}var src=${JSON.stringify(imgs)},out=[],left=src.length;src.forEach(function(s,i){var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=160;c.height=100;var g=c.getContext('2d');g.drawImage(im,0,0,160,100);var d=g.getImageData(0,0,160,100).data,m={},n=0,best=0;for(var p=0;p<d.length;p+=4){var k=(d[p]>>4)*256+(d[p+1]>>4)*16+(d[p+2]>>4);m[k]=(m[k]||0)+1;n++;if(m[k]>best)best=m[k]}out[i]=best/n;if(!--left)__emit(out)};im.onerror=function(){out[i]=1;if(!--left)__emit(out)};im.src=s});</script>`);
      const shares = dumpProbe(page, { width: 400, height: 300, budgetMs: 10000 });
      batch.forEach((e, k) => {
        if (shares[k] > BLANK_SHARE) {
          removed.push(e.id);
          for (const f of [e.preview, e.large].filter(Boolean)) fs.rmSync(path.join(packDir, f), { force: true });
        }
      });
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }
  return removed;
}

export async function capturePreview(url, outDir, id, { timeoutMs = 60000, budgetMs = 12000, checkBlank = true, flags = [] } = {}) {
  await reachable(url, Math.min(timeoutMs, 20000));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-capture-'));
  try {
    const png = path.join(work, 'shot.png');
    const shoot = (budget) => { try { screenshot(url, png, { width: 1440, height: 900, budgetMs: budget, timeoutMs, flags }); } catch (e) { throw new Error(`no picture: ${url} did not render (${e.message})`); } };
    shoot(budgetMs);
    let share = dominantShare(fs.readFileSync(png));
    // A slow loader often finishes given more time: one retry before calling it blank.
    if (checkBlank && share > BLANK_SHARE) { shoot(budgetMs * 2); share = dominantShare(fs.readFileSync(png)); }
    if (checkBlank && share > BLANK_SHARE) throw new Error(`no picture: ${url} is blank or still loading (${Math.round(share * 100)}% one colour)`);
    const out = toWebp(fs.readFileSync(png), work, [{ ...CARD, quality: 0.8 }, { ...LARGE, quality: 0.82 }]);
    fs.mkdirSync(outDir, { recursive: true });
    const write = (name, dataUrl) => fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    write(`${id}.webp`, out[CARD.width]);
    write(`${id}-large.webp`, out[LARGE.width]);
    return { preview: `${id}.webp`, large: `${id}-large.webp`, hash: averageHash(fs.readFileSync(png)), share: Math.round(share * 1000) / 1000 };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Parallel runs (--shard) never write the shelf file at once: each result is one appended line, and --merge
// folds the lines into the shelf afterwards, the latest line for an entry winning.
export function recordCapture(logFile, id, { phone, design }) {
  fs.appendFileSync(logFile, `${JSON.stringify({ id, phone: phone || null, design: design || null })}\n`);
}
export function mergeCaptures(shelfFile, logFile) {
  if (!fs.existsSync(logFile)) return 0;
  const latest = new Map();
  for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) if (line.trim()) { const r = JSON.parse(line); latest.set(r.id, r); }
  const shelf = readJson(shelfFile);
  let n = 0;
  for (const e of shelf.entries) {
    const r = latest.get(e.id);
    if (!r) continue;
    if (r.phone) e.phone = r.phone;
    if (r.design) e.design = r.design;
    n++;
  }
  fs.writeFileSync(shelfFile, `${JSON.stringify(shelf, null, 2)}\n`);
  return n;
}

// The page's code says which colours are its background, text and accent; the picture says which colours the first
// screen shows (a full-screen photo's tones are shown colours, never the page background). Both are kept.
function withShownColours(design, png) {
  return { ...design, shown: shownColours(png) };
}

// Only the design, read again from the live desktop page (pop-ups hidden), without new pictures: for refreshing the
// measured values when the way they are read improves.
export async function readSiteDesign(url, { timeoutMs = 60000, settleMs = 2500 } = {}) {
  await reachable(url, Math.min(timeoutMs, 20000));
  const browser = await openBrowser();
  try {
    const page = await browser.open(url, { width: 1440, height: 900, loadMs: timeoutMs, settleMs });
    try {
      await page.eval(CLEAN);
      // Like the pictures: a screen still loading (one colour) is waited for, and never read as the design.
      let png = await page.shot();
      for (let i = 0; i < 2 && dominantShare(png) > BLANK_SHARE; i++) {
        await new Promise((r) => setTimeout(r, Math.max(2500, settleMs * 1.5)));
        await page.eval(CLEAN);
        png = await page.shot();
      }
      if (dominantShare(png) > BLANK_SHARE) throw new Error(`no design: ${url} is blank or still loading`);
      return withShownColours(await page.eval(READ), png);
    } finally { await page.close(); }
  } finally { await browser.close(); }
}

// A live site: desktop and phone first screens with pop-ups hidden, and the design read from the desktop page.
// egress: for a link nobody vetted (one the user brought). The browser then reaches the internet only through a gate
// that refuses this machine and its network (lib/egress-proxy.mjs), and no request leaves this process unguarded:
// the reachability check is skipped, a page that does not load says so when it is opened.
export async function captureSite(url, outDir, id, { timeoutMs = 60000, settleMs = 2500, egress } = {}) {
  if (egress) { if (!(await egress(new URL(url).hostname))) throw NOT_ALLOWED(url); }
  else await reachable(url, Math.min(timeoutMs, 20000));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-capture-'));
  const browser = await openBrowser({ egress });
  try {
    const shoot = async (opts, label) => {
      let page;
      try { page = await browser.open(url, { ...opts, loadMs: timeoutMs, settleMs }); } catch (e) { throw new Error(`no picture: ${url} did not render (${e.message})`); }
      try {
        // A refused host answers 403 through the gate; a page that ended up there is not kept.
        if (egress && browser.refused.size) { const landed = new URL(await page.eval('location.href')).hostname; if (browser.refused.has(landed)) throw NOT_ALLOWED(landed); }
        let cleaned = await page.eval(CLEAN);
        // A curtain or intro that lifts by itself is waited for (up to about five seconds) before refusing.
        for (let i = 0; i < 2 && cleaned.covered > COVERED_MAX; i++) {
          await new Promise((r) => setTimeout(r, Math.max(2500, settleMs * 1.5)));
          const again = await page.eval(CLEAN);
          cleaned = { hidden: cleaned.hidden + again.hidden, covered: again.covered };
        }
        if (cleaned.covered > COVERED_MAX) throw new Error(`no picture: ${url} is still ${Math.round(cleaned.covered * 100)}% covered by a pop-up or panel on the ${label}`);
        let png = await page.shot();
        let share = dominantShare(png);
        // A slow loader or a curtain often finishes given more time: up to about five seconds before calling it blank.
        for (let i = 0; i < 2 && share > BLANK_SHARE; i++) {
          await new Promise((r) => setTimeout(r, Math.max(2500, settleMs * 1.5)));
          await page.eval(CLEAN);
          png = await page.shot(); share = dominantShare(png);
        }
        if (share > BLANK_SHARE) throw new Error(`no picture: ${url} is blank or still loading on the ${label} (${Math.round(share * 100)}% one colour)`);
        const design = label === 'desktop' ? withShownColours(await page.eval(READ), png) : null;
        return { png, share, cleaned, design };
      } finally { await page.close(); }
    };
    const desk = await shoot({ width: 1440, height: 900 }, 'desktop');
    const phone = await shoot({ ...PHONE, mobile: true }, 'phone');
    const out = toWebp(desk.png, work, [{ ...CARD, quality: 0.8 }, { ...LARGE, quality: 0.82 }]);
    const outPhone = toWebp(phone.png, work, [{ ...PHONE, quality: 0.8 }]);
    fs.mkdirSync(outDir, { recursive: true });
    const write = (name, dataUrl) => fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    write(`${id}.webp`, out[CARD.width]);
    write(`${id}-large.webp`, out[LARGE.width]);
    write(`${id}-phone.webp`, outPhone[PHONE.width]);
    return {
      preview: `${id}.webp`, large: `${id}-large.webp`, phone: `${id}-phone.webp`, design: desk.design,
      cleaned: { desktop: desk.cleaned, phone: phone.cleaned }, hash: averageHash(desk.png), share: Math.round(desk.share * 1000) / 1000,
    };
  } finally {
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0] || !args.pack) {
    console.error('usage: node capture.mjs <shelf.json> --pack=<pack dir> [--shard=0/3] [--force] [--only=<id>,<id>]');
    process.exit(2);
  }
  const shelf = readJson(args._[0]);
  if (args.merge) {
    console.log(`merged ${mergeCaptures(args._[0], path.join(args.pack, 'captured.jsonl'))} captured entries into ${args._[0]}`);
    process.exit(0);
  }
  if (args.recheck) {
    const removed = recheckPack(shelf, args.pack);
    console.log(`removed ${removed.length} blank pictures: ${removed.join(', ')}`);
    process.exit(0);
  }
  const [k, n] = String(args.shard || '0/1').split('/').map(Number);
  // --design-only: read the measured values again for live sites that already have pictures; no pictures are taken.
  if (args['design-only']) {
    const only = args.only ? new Set(String(args.only).split(',')) : null;
    let ok = 0, failed = 0;
    for (const [i, e] of shelf.entries.entries()) {
      if (i % n !== k || (only && !only.has(e.id)) || !/^https?:/i.test(e.url)) continue;
      try { recordCapture(path.join(args.pack, 'captured.jsonl'), e.id, { design: await readSiteDesign(e.url) }); ok++; console.log(`ok ${e.id}`); }
      catch (err) { failed++; console.log(`skip ${e.id}: ${err.message}`); }
    }
    console.log(`${ok} designs read, ${failed} not`);
    process.exit(0);
  }
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  let ok = 0, failed = 0;
  for (const [i, e] of shelf.entries.entries()) {
    if (i % n !== k || (only && !only.has(e.id))) continue;
    const dir = path.join(args.pack, path.dirname(e.preview));
    if (!args.force && fs.existsSync(path.join(args.pack, e.preview))) { ok++; continue; }
    // Our own demos (motion, icon sheets) live next to the shelf file; everything else is a live site.
    const target = e.demo ? `${pathToFileURL(path.join(path.dirname(path.resolve(args._[0])), e.demo.split('?')[0])).href}${e.demo.includes('?') ? `?${e.demo.split('?')[1]}` : ''}` : e.url;
    try {
      // A live site: desktop, phone and its measured design. A motion demo's still is its end state, so it is taken
      // with reduced motion on; our own sheets skip the blank check.
      const r = e.demo || !/^https?:/i.test(target)
        ? await capturePreview(target, dir, e.id, { checkBlank: !e.demo, flags: e.shelf === 'motion' ? ['--force-prefers-reduced-motion'] : [] })
        : await captureSite(target, dir, e.id);
      if (r.phone || r.design) recordCapture(path.join(args.pack, 'captured.jsonl'), e.id, { phone: r.phone && `${path.posix.dirname(e.preview)}/${r.phone}`, design: r.design });
      const mf = path.join(args.pack, 'manifest.json');
      const manifest = fs.existsSync(mf) ? readJson(mf) : {};
      manifest[e.id] = { hash: r.hash, at: new Date().toISOString().slice(0, 10) };
      fs.writeFileSync(mf, `${JSON.stringify(manifest, null, 1)}
`);
      ok++; console.log(`ok ${e.id}`);
    } catch (err) { failed++; console.log(`skip ${e.id}: ${err.message}`); }
  }
  console.log(`${ok} with pictures, ${failed} without`);
}
