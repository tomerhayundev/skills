#!/usr/bin/env node
// Fetches open-licence font families and stores them inside the site's source folder, so the built site
// runs offline and never calls a font service at view time.
//   node fonts.mjs <src>
// Reads the families from <src>/tokens.json (type.families: name, weights, role) and the language from
// <src>/site.json. Writes <src>/assets/fonts/*.woff2 and <src>/fonts.css. Exits 1 when a family lacks a
// script the site needs (a Hebrew site with a Latin-only face), naming the family and the script.
// This script holds no list of families: they come from the brand and the user's picks.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, readJson } from './lib/cli.mjs';

const API = 'https://fonts.googleapis.com/css2';
// The font service picks the file format from the browser it sees; this asks for woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SUBSETS = { latin: ['latin', 'latin-ext'], hebrew: ['hebrew'], arabic: ['arabic'], cyrillic: ['cyrillic', 'cyrillic-ext'], greek: ['greek', 'greek-ext'] };
const LANG_SCRIPTS = { he: ['hebrew', 'latin'], ar: ['arabic', 'latin'], ru: ['cyrillic', 'latin'], uk: ['cyrillic', 'latin'], el: ['greek', 'latin'] };

export const scriptsForLang = (lang) => LANG_SCRIPTS[String(lang || '').slice(0, 2)] || ['latin'];

export function cssUrl({ name, weights = [400, 700] }) {
  const w = [...new Set(weights.map(Number))].sort((a, b) => a - b).join(';');
  return `${API}?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${w}&display=swap`;
}

export function parseFontCss(css) {
  const faces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[2];
    const get = (k) => (new RegExp(`${k}\\s*:\\s*([^;]+);`).exec(body) || [])[1]?.trim();
    faces.push({
      subset: m[1],
      family: get('font-family')?.replace(/^['"]|['"]$/g, ''),
      style: get('font-style') || 'normal',
      weight: get('font-weight') || '400',
      url: (/url\(([^)]+)\)/.exec(body) || [])[1]?.replace(/^['"]|['"]$/g, ''),
      unicodeRange: get('unicode-range') || '',
    });
  }
  return faces;
}

export const coversScript = (faces, script) => faces.some((f) => (SUBSETS[script] || [script]).includes(f.subset));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function fetchFamilies(families, outDir, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const missing = [];
  const files = [];
  const blocks = [];
  for (const fam of families) {
    const res = await fetchImpl(cssUrl(fam), { headers: { 'user-agent': UA } }).catch(() => null);
    const faces = res && res.ok ? parseFontCss(await res.text()) : [];
    const scripts = fam.scripts?.length ? fam.scripts : ['latin'];
    for (const s of scripts) if (!coversScript(faces, s)) missing.push({ family: fam.name, script: s });
    const keep = new Set(scripts.flatMap((s) => SUBSETS[s] || [s]));
    for (const f of faces.filter((x) => keep.has(x.subset))) {
      const rel = `assets/fonts/${slug(fam.name)}-${f.weight}-${f.style}-${f.subset}.woff2`;
      const bin = await fetchImpl(f.url).catch(() => null);
      if (!bin || !bin.ok) { missing.push({ family: fam.name, script: f.subset }); continue; }
      fs.mkdirSync(path.join(outDir, 'assets', 'fonts'), { recursive: true });
      fs.writeFileSync(path.join(outDir, rel), Buffer.from(await bin.arrayBuffer()));
      files.push(rel);
      blocks.push(`@font-face {\n  font-family: '${f.family}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url(${rel}) format('woff2');\n  unicode-range: ${f.unicodeRange};\n}`);
    }
  }
  const css = blocks.length ? `${blocks.join('\n')}\n` : '';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
  return { css, files, missing };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const src = args._[0];
  if (!src) {
    console.error('usage: node fonts.mjs <src>');
    process.exit(2);
  }
  const site = readJson(path.join(src, 'site.json'));
  const tokens = readJson(path.join(src, 'tokens.json'));
  const need = scriptsForLang(site.lang);
  const families = (tokens.type?.families || []).map((f) => ({ name: f.name, weights: f.weights || [400, 700], scripts: [...new Set([...need, ...(f.scripts || [])])] }));
  const res = await fetchFamilies(families, src);
  for (const m of res.missing) console.log(`fail: ${m.family} has no ${m.script} glyphs`);
  console.log(`stored ${res.files.length} font files in ${path.join(src, 'assets', 'fonts')}`);
  process.exit(res.missing.length ? 1 : 0);
}
