#!/usr/bin/env node
// Writes one-colour versions of the logo by masking its exact shape: the silhouette is never redrawn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, isMain, readJson, writeJson, sha256File } from './lib/cli.mjs';
import { screenshot } from './lib/chrome.mjs';
import { encodePng } from './lib/png.mjs';
import { mixOklab } from './lib/color.mjs';
import { detectBackground, labAt, dist } from './lib/pixels.mjs';
import { decodeImage, MIME } from './sample-logo.mjs';

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

export function variantColours(brand) {
  const r = brand.color.roles;
  return {
    monoDark: r.neutralDark.hex,
    monoLight: r.neutralLight.hex,
    reversed: r.primary.on,
    tint: mixOklab(r.surface.hex, r.text.hex, 0.1),
  };
}

function page(maskUri, w, h, hex) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}i{display:block;width:${w}px;height:${h}px;background:${hex};-webkit-mask:url("${maskUri}") center/100% 100% no-repeat;mask:url("${maskUri}") center/100% 100% no-repeat}</style><i></i>`;
}

export function makeVariants(brandFile) {
  const dir = path.dirname(path.resolve(brandFile));
  const brand = readJson(brandFile);
  const original = path.join(dir, brand.logo.original.path);
  const ext = path.extname(original).toLowerCase();
  const notes = [];
  const d = decodeImage(original, { maxSide: 2048 });
  const bg = detectBackground(d.img);
  let maskUri;
  if (bg.kind === 'transparent') {
    maskUri = `data:${MIME[ext]};base64,${fs.readFileSync(original).toString('base64')}`;
  } else {
    if (bg.kind === 'none') notes.push('The logo has no separable ground (it fills its frame). One-colour versions show its whole frame; offer them only if that reads well.');
    maskUri = `data:image/png;base64,${encodePng(d.img.width, d.img.height, matte(d.img, bg)).toString('base64')}`;
  }
  const w = d.vector ? 1600 : Math.max(800, Math.min(2048, d.naturalWidth));
  const h = Math.max(1, Math.round((w * d.naturalHeight) / d.naturalWidth));
  const tmp = path.join(os.tmpdir(), `bim-variant-${process.pid}-${Date.now()}.html`);
  brand.logo.versions = {};
  try {
    for (const [name, hex] of Object.entries(variantColours(brand))) {
      fs.writeFileSync(tmp, page(maskUri, w, h, hex));
      const out = path.join(dir, 'logo', `${name}.png`);
      screenshot(tmp, out, { width: w, height: h, transparent: true });
      brand.logo.versions[name] = { path: `logo/${name}.png`, sha256: sha256File(out), color: hex };
      if (d.vector) fs.writeFileSync(path.join(dir, 'logo', `${name}.svg`), recolorSvg(d.svgText, hex));
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
  for (const [name, v] of Object.entries(r.versions)) console.log(`  ${name.padEnd(9)} ${v.color}  ${v.path}`);
  for (const n of r.notes) console.log(`Note: ${n}`);
  console.log('Versions recorded in brand.json logo.versions.');
}
