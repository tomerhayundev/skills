#!/usr/bin/env node
// Writes tokens.css from brand.json, and copies base.css and any bundled fonts next to it. Never edit tokens.css by hand.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, readJson, writeText, SKILL_DIR } from './lib/cli.mjs';
import { loadData } from './lib/brand.mjs';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const ROLES = ['display', 'text', 'label'];

export function fontsUrl(brand) {
  const byFamily = new Map();
  for (const r of ROLES) {
    const t = brand.type[r];
    if (t.source !== 'google') continue;
    const ws = byFamily.get(t.family) || new Set();
    t.weights.forEach((w) => ws.add(w));
    byFamily.set(t.family, ws);
  }
  if (!byFamily.size) return null;
  const q = [...byFamily].map(([f, ws]) => `family=${f.replace(/ /g, '+')}:wght@${[...ws].sort((a, b) => a - b).join(';')}`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function bundledFaces(brand, data) {
  const out = [];
  const seen = new Set();
  for (const r of ROLES) {
    const t = brand.type[r];
    if (t.source !== 'bundled' || seen.has(t.family)) continue;
    seen.add(t.family);
    const b = data.fonts.bundled.find((x) => x.family === t.family);
    for (const f of b?.files || []) out.push({ family: t.family, license: b.license, ...f });
  }
  return out;
}

export function tokensCss(brand, data) {
  const L = ['/* Generated from brand.json by scripts/tokens.mjs. Edit brand.json, not this file. */'];
  for (const f of bundledFaces(brand, data)) L.push(`@font-face { font-family: "${f.family}"; src: url("fonts/${f.file}") format("truetype"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`);
  L.push(':root {');
  for (const [name, r] of Object.entries(brand.color.roles)) L.push(`  --color-${kebab(name)}: ${r.hex};`, `  --color-${kebab(name)}-on: ${r.on};`);
  for (const [scale, steps] of Object.entries(brand.color.primitives || {})) for (const [s, hex] of Object.entries(steps)) L.push(`  --${kebab(scale)}-${s}: ${hex};`);
  for (const r of ROLES) L.push(`  --font-${r}: "${brand.type[r].family}", ${brand.type[r].fallback};`);
  L.push(
    `  --type-ratio: ${brand.type.scale.ratio};`,
    `  --radius: ${brand.shape.radius}px;`,
    `  --stroke: ${brand.shape.strokeWeight}px;`,
    `  --icon-stroke: ${brand.shape.iconStyle.stroke ?? brand.shape.strokeWeight};`,
    `  --icon-caps: ${brand.shape.iconStyle.caps};`,
    `  --clear-space: ${brand.logo.clearSpace};`,
    '}',
  );
  if (brand.color.dark) {
    L.push('[data-theme="dark"] {');
    for (const [name, hex] of Object.entries(brand.color.dark)) L.push(`  --color-${kebab(name)}: ${hex};`);
    L.push('}');
  }
  return L.join('\n') + '\n';
}

export function writeTokens(brandFile, data = loadData()) {
  const dir = path.dirname(path.resolve(brandFile));
  const brand = readJson(brandFile);
  writeText(path.join(dir, 'tokens.css'), tokensCss(brand, data));
  fs.copyFileSync(path.join(SKILL_DIR, 'assets', 'board', 'base.css'), path.join(dir, 'base.css'));
  const faces = bundledFaces(brand, data);
  if (faces.length) fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  for (const f of faces) {
    fs.copyFileSync(path.join(SKILL_DIR, 'assets', 'fonts', f.file), path.join(dir, 'fonts', f.file));
    fs.copyFileSync(path.join(SKILL_DIR, 'assets', 'fonts', f.license), path.join(dir, 'fonts', f.license));
  }
  return { tokens: path.join(dir, 'tokens.css'), url: fontsUrl(brand) };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) { console.log('Usage: node tokens.mjs brand/brand.json'); process.exit(file ? 0 : 1); }
  const r = writeTokens(file);
  console.log(`Wrote ${r.tokens} and copied base.css next to it.`);
  console.log(r.url ? `Put this in the board's <head>: <link rel="stylesheet" href="${r.url}">` : 'All fonts are bundled: no font link is needed.');
}
