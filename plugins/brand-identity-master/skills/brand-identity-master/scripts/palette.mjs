#!/usr/bin/env node
// Proposes colour roles from logo-read.json. The model names each colour and may change the split.
import { parseArgs, isMain, readJson, writeJson } from './lib/cli.mjs';
import { buildPalette } from './lib/palette.mjs';

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) {
    console.log('Usage: node palette.mjs brand/logo-read.json [--ground light|dark] [--site-colors "#A1B2C3,#D4E5F6"] [--out brand/palette.json]');
    process.exit(file ? 0 : 1);
  }
  const read = readJson(file);
  const siteColors = typeof args['site-colors'] === 'string' ? args['site-colors'].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const ground = args.ground === 'dark' ? 'dark' : 'light';
  const pal = buildPalette(read.inks, { siteColors, ground });
  const out = args.out || 'brand/palette.json';
  writeJson(out, pal);
  console.log(`Palette written to ${out} (ground: ${ground})`);
  for (const [name, r] of Object.entries(pal.roles)) console.log(`  ${name.padEnd(13)} ${r.hex}  text ${r.on}  ${r.contrast}:1  ${r.source}${r.share != null ? `  share ${r.share}` : ''}`);
  if (pal.support) {
    console.log('Support foils (deep / soft):');
    for (const f of pal.support.foils) console.log(`  ${f.relation.padEnd(9)} hue ${String(f.hue).padStart(3)}  ${f.deep} / ${f.soft}`);
    console.log(`Support neutrals: ${pal.support.neutrals.map((n) => `${n.hint} ${n.hex}`).join(', ')}`);
  }
  for (const n of pal.notes) console.log(`Note: ${n}`);
  console.log('Next: give every role a descriptive name in brand.json (e.g. "Antique Brass").');
}
