#!/usr/bin/env node
// Reads a logo file: its background, its ink colours with their shares, and facts about its shape.
// The browser only decodes the image; every judgement is made by tested functions in lib/pixels.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, isMain, writeJson, sha256File } from './lib/cli.mjs';
import { dumpProbe, EMIT_JS } from './lib/chrome.mjs';
import { analyze } from './lib/pixels.mjs';
import { deltaOk } from './lib/color.mjs';

export const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function svgColors(svg) {
  const uses = new Map();
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{6}|#[0-9a-f]{3})(?![0-9a-f])/gi)) {
    let h = m[1].toUpperCase();
    if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
    uses.set(h, (uses.get(h) || 0) + 1);
  }
  return [...uses].sort((a, b) => b[1] - a[1]).map(([hex, n]) => ({ hex, uses: n }));
}

export function svgSize(svg) {
  const head = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const attr = (name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(head)?.[1] ?? null;
  const num = (v) => (v && !v.includes('%') ? parseFloat(v) : NaN);
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const w = num(attr('width')), h = num(attr('height'));
  if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h };
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] };
  return null;
}

export function snapToDeclared(inks, declared) {
  if (!declared.length) return inks.map((i) => ({ ...i, declared: false }));
  const out = [];
  for (const ink of inks) {
    const near = declared.map((d) => ({ hex: d.hex, e: deltaOk(d.hex, ink.hex) })).sort((a, b) => a.e - b.e)[0];
    const snapped = near.e < 0.03;
    const hex = snapped ? near.hex : ink.hex;
    const same = out.find((o) => o.hex === hex);
    if (same) same.share = round(same.share + ink.share);
    else out.push({ hex, share: ink.share, declared: snapped });
  }
  return out;
}

// The image sits in the markup and is read in the window's load event, which waits for it; drawImage then
// decodes it on the page's own thread. Never await img.decode(): that decode runs off the page's thread, virtual
// time does not wait for it, and Chrome can dump the page before it reports (seen on CI runners).
function decodePage(dataUri, { maxSide, vector, hint }) {
  const nw = vector && hint ? String(hint.width) : 'img.naturalWidth || 512';
  const nh = vector && hint ? String(hint.height) : 'img.naturalHeight || 512';
  return `<!doctype html><meta charset="utf-8"><body><img id="logo" alt="" style="display:none" src="${dataUri}"><script>${EMIT_JS}
window.addEventListener('load', () => {
  try {
    const img = document.getElementById('logo');
    if (!img.complete || (!img.naturalWidth && !${vector})) throw new Error('the browser could not read this image');
    const nw = ${nw}, nh = ${nh};
    const k = ${vector} ? ${maxSide} / Math.max(nw, nh) : Math.min(1, ${maxSide} / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let s = '';
    for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode.apply(null, d.subarray(i, i + 8192));
    __emit({ ok: true, naturalWidth: nw, naturalHeight: nh, width: w, height: h, rgba: btoa(s) });
  } catch (e) { __emit({ ok: false, error: String(e) }); }
});
</script>`;
}

export function decodeImage(file, { maxSide = 1024 } = {}) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`Unsupported logo type "${ext}". Use SVG, PNG, JPG or WebP.`);
  const buf = fs.readFileSync(file);
  const vector = ext === '.svg';
  const svgText = vector ? buf.toString('utf8') : '';
  const hint = vector ? svgSize(svgText) : null;
  const page = path.join(os.tmpdir(), `bim-decode-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(page, decodePage(`data:${mime};base64,${buf.toString('base64')}`, { maxSide, vector, hint }));
  let out;
  try { out = dumpProbe(page, { width: 800, height: 600 }); } finally { fs.rmSync(page, { force: true }); }
  if (!out.ok) throw new Error(`Could not decode the logo: ${out.error}`);
  const img = { width: out.width, height: out.height, data: new Uint8Array(Buffer.from(out.rgba, 'base64')) };
  return { img, naturalWidth: out.naturalWidth, naturalHeight: out.naturalHeight, vector, svgText, ext };
}

export function readLogo(file, { maxSide = 1024 } = {}) {
  const d = decodeImage(file, { maxSide });
  const a = analyze(d.img);
  const declared = d.vector ? svgColors(d.svgText) : [];
  const unit = d.naturalWidth / d.img.width;
  const shape = a.shape && { ...a.shape, strokeMin: round(a.shape.strokeMinPx * unit), strokeMedian: round(a.shape.strokeMedianPx * unit) };
  const strokeMin = Math.max(shape ? shape.strokeMin : 1, 0.5);
  // A logo that carries a wordmark must stay tall enough to read: 24 px on screen, 8 mm in print.
  const aspect = d.naturalWidth / d.naturalHeight;
  const tall = shape && shape.parts === 2 ? { px: 24, mm: 8 } : { px: 0, mm: 0 };
  return {
    file: path.resolve(file),
    type: d.ext.slice(1),
    sha256: sha256File(file),
    naturalWidth: d.naturalWidth,
    naturalHeight: d.naturalHeight,
    sampledWidth: d.img.width,
    sampledHeight: d.img.height,
    background: a.background,
    inks: snapToDeclared(a.inks, declared),
    declaredColors: declared,
    shape,
    // Heuristic: the thinnest stroke stays at least 1 px on screen and 0.1 mm in print.
    minSize: {
      screenPx: Math.max(24, Math.ceil(d.naturalWidth / strokeMin), Math.ceil(tall.px * aspect)),
      printMm: Math.max(10, Math.ceil((d.naturalWidth / strokeMin) * 0.1), Math.ceil(tall.mm * aspect)),
    },
  };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) {
    console.log('Usage: node sample-logo.mjs <logo.svg|png|jpg|webp> [--brand-dir brand]');
    process.exit(file ? 0 : 1);
  }
  const dir = args['brand-dir'] || 'brand';
  const read = readLogo(file);
  const copy = path.join(dir, 'logo', `original${path.extname(file).toLowerCase()}`);
  fs.mkdirSync(path.dirname(copy), { recursive: true });
  fs.copyFileSync(file, copy);
  read.copy = path.relative(dir, copy).split(path.sep).join('/');
  writeJson(path.join(dir, 'logo-read.json'), read);
  console.log(`Logo copied to ${copy} and read into ${path.join(dir, 'logo-read.json')}`);
  console.log(`Background: ${read.background.kind}${read.background.hex ? ' ' + read.background.hex : ''}`);
  console.log(`Inks: ${read.inks.map((i) => `${i.hex} ${Math.round(i.share * 100)}%`).join(', ') || 'none found'}`);
  if (read.shape) console.log(`Shape: aspect ${read.shape.aspect}, ${read.shape.parts} part(s)${read.shape.split ? ' ' + read.shape.split : ''}, mirror ${read.shape.mirrorX}, thinnest stroke ${read.shape.strokeMin}`);
  console.log(`Minimum size (heuristic): ${read.minSize.screenPx} px wide on screen, ${read.minSize.printMm} mm in print`);
}
