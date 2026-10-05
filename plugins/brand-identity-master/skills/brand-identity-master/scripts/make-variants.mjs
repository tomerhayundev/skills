#!/usr/bin/env node
// Writes recoloured versions of the logo from its exact pixels or paths: the shape is never redrawn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, isMain, readJson, writeJson, sha256File } from './lib/cli.mjs';
import { screenshot } from './lib/chrome.mjs';
import { encodePng } from './lib/png.mjs';
import { mixOklab, hexToRgb, hexToOklab, hexToOklch, rgbToOklab, deltaOk } from './lib/color.mjs';
import { detectBackground, labAt, dist, analyze } from './lib/pixels.mjs';
import { decodeImage } from './sample-logo.mjs';

const KEEP = /^(none|transparent|currentColor|inherit|url\()/i;

export function recolorSvg(svg, hex) {
  let out = svg
    .replace(/\b(fill|stroke|stop-color)(\s*=\s*)(["'])([^"']*)\3/gi, (m, a, eq, q, v) => (KEEP.test(v.trim()) ? m : `${a}${eq}${q}${hex}${q}`))
    .replace(/\b(fill|stroke|stop-color)(\s*:\s*)([^;"'}]+)/gi, (m, a, sep, v) => (KEEP.test(v.trim()) ? m : `${a}${sep}${hex}`));
  const head = /<svg\b[^>]*>/i.exec(out)?.[0];
  if (head && !/\sfill\s*=/.test(head)) out = out.replace(head, head.replace(/<svg\b/i, `<svg fill="${hex}"`));
  return out;
}

export function matte(img, bg) {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 4);
  for (let p = 0; p < n; p++) {
    let k = img.data[p * 4 + 3] / 255;
    if (bg.kind === 'solid') k *= Math.max(0, Math.min(1, (dist(labAt(img, p), bg.lab) - 0.02) / 0.12));
    out[p * 4 + 3] = Math.round(k * 255);
  }
  return out;
}

// For a logo of several colours, the reversed version (for dark grounds) turns its dark colours light and keeps
// its bright ones, so inner details survive. One-colour versions map every colour to one.
export function variantPlan(brand, inks) {
  const r = brand.color.roles;
  const c = variantColours(brand);
  const all = (hex) => inks.map(() => hex);
  const multi = inks.length >= 2 && inks.slice(1).some((i) => deltaOk(i.hex, inks[0].hex) >= 0.08);
  return {
    monoDark: all(c.monoDark),
    monoLight: all(c.monoLight),
    reversed: multi ? inks.map((i) => (hexToOklch(i.hex)[0] < 0.45 ? r.neutralLight.hex : i.hex)) : all(c.reversed),
    tint: all(c.tint),
  };
}

const nearestInk = (inks) => { const labs = inks.map((i) => hexToOklab(i.hex)); return (lab) => { let best = 0, bd = Infinity; labs.forEach((l, k) => { const d = dist(l, lab); if (d < bd) { bd = d; best = k; } }); return best; }; };

// Recolours a decoded raster logo pixel by pixel: each pixel takes the new colour of the ink it belongs to, and its
// alpha from the matte. Edge pixels are first separated from a solid ground so they are not read as a lighter ink.
export function recolorRaster(img, bg, inks, colours) {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 4);
  const a = matte(img, bg);
  const nearest = nearestInk(inks);
  const rgb = colours.map(hexToRgb);
  const bgRgb = bg.kind === 'solid' ? hexToRgb(bg.hex) : null;
  for (let p = 0; p < n; p++) {
    const alpha = a[p * 4 + 3];
    if (!alpha) continue;
    let px = [img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]];
    if (bgRgb) { const k = Math.max(alpha / 255, 0.15); px = px.map((v, i) => Math.max(0, Math.min(255, (v - bgRgb[i] * (1 - k)) / k))); }
    const col = rgb[nearest(rgbToOklab(px))];
    out[p * 4] = col[0]; out[p * 4 + 1] = col[1]; out[p * 4 + 2] = col[2]; out[p * 4 + 3] = alpha;
  }
  return out;
}

// The original raster with its solid ground taken out: the same pixels, unblended from the ground at the edges, so
// the logo can sit on any ground without the box of its file's own background around it.
export function clearRaster(img, bg) {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 4);
  const a = matte(img, bg);
  const bgRgb = hexToRgb(bg.hex);
  for (let p = 0; p < n; p++) {
    const alpha = a[p * 4 + 3];
    if (!alpha) continue;
    const k = Math.max(alpha / 255, 0.15);
    for (let i = 0; i < 3; i++) out[p * 4 + i] = Math.round(Math.max(0, Math.min(255, (img.data[p * 4 + i] - bgRgb[i] * (1 - k)) / k)));
    out[p * 4 + 3] = alpha;
  }
  return out;
}

// Recolours an SVG by mapping each colour it declares to the new colour of the nearest ink.
export function recolorSvgInks(svg, inks, colours) {
  const nearest = nearestInk(inks);
  let out = svg.replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi, (h) => {
    const full = h.length === 4 ? '#' + [...h.slice(1)].map((x) => x + x).join('') : h;
    return colours[nearest(hexToOklab(full))];
  });
  const head = /<svg\b[^>]*>/i.exec(out)?.[0];
  if (head && !/\sfill\s*=/.test(head)) out = out.replace(head, head.replace(/<svg\b/i, `<svg fill="${colours[nearest(hexToOklab('#000000'))]}"`));
  return out;
}

export function variantColours(brand) {
  const r = brand.color.roles;
  return {
    monoDark: r.neutralDark.hex,
    monoLight: r.neutralLight.hex,
    reversed: r.primary.on,
    tint: mixOklab(r.surface.hex, r.text.hex, 0.1),
  };
}

export function makeVariants(brandFile) {
  const dir = path.dirname(path.resolve(brandFile));
  const brand = readJson(brandFile);
  const original = path.join(dir, brand.logo.original.path);
  const notes = [];
  const d = decodeImage(original, { maxSide: 2048 });
  const bg = detectBackground(d.img);
  if (bg.kind === 'none') notes.push('The logo has no separable ground (it fills its frame). Its versions show the whole frame; offer them only if that reads well.');
  const readFile = path.join(dir, 'logo-read.json');
  const inks = (fs.existsSync(readFile) ? readJson(readFile).inks : analyze(d.img).inks).filter((i) => i.share > 0);
  if (!inks.length) throw new Error('No ink colours found in the logo: run sample-logo.mjs first.');
  const plan = variantPlan(brand, inks);
  const w = d.vector ? 1600 : d.img.width;
  const h = Math.max(1, Math.round((w * d.naturalHeight) / d.naturalWidth));
  const tmp = path.join(os.tmpdir(), `bim-variant-${process.pid}-${Date.now()}.html`);
  brand.logo.versions = {};
  try {
    for (const [name, colours] of Object.entries(plan)) {
      const out = path.join(dir, 'logo', `${name}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      if (d.vector) {
        const svg = recolorSvgInks(d.svgText, inks, colours);
        fs.writeFileSync(path.join(dir, 'logo', `${name}.svg`), svg);
        fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:${w}px;height:${h}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
        screenshot(tmp, out, { width: w, height: h, transparent: true });
      } else {
        fs.writeFileSync(out, encodePng(d.img.width, d.img.height, recolorRaster(d.img, bg, inks, colours)));
      }
      const uniq = [...new Set(colours)];
      brand.logo.versions[name] = { path: `logo/${name}.png`, sha256: sha256File(out), color: uniq[0], ...(uniq.length > 1 ? { colors: uniq } : {}) };
    }
    if (!d.vector && bg.kind === 'solid') {
      const out = path.join(dir, 'logo', 'clear.png');
      fs.writeFileSync(out, encodePng(d.img.width, d.img.height, clearRaster(d.img, bg)));
      const own = inks.map((i) => i.hex);
      brand.logo.versions.clear = { path: 'logo/clear.png', sha256: sha256File(out), color: own[0], ...(own.length > 1 ? { colors: own } : {}) };
      notes.push(`The logo file has a solid ${bg.hex} ground. logo/clear.png is the same logo with that ground taken out: use it on every other ground, never the original inside a box of ${bg.hex}.`);
    }
  } finally { fs.rmSync(tmp, { force: true }); }
  writeJson(brandFile, brand);
  return { versions: brand.logo.versions, notes };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) { console.log('Usage: node make-variants.mjs brand/brand.json'); process.exit(file ? 0 : 1); }
  const r = makeVariants(file);
  for (const [name, v] of Object.entries(r.versions)) console.log(`  ${name.padEnd(9)} ${(v.colors || [v.color]).join(' + ')}  ${v.path}`);
  for (const n of r.notes) console.log(`Note: ${n}`);
  console.log('Versions recorded in brand.json logo.versions.');
}
