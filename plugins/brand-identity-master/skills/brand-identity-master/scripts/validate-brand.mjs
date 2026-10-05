#!/usr/bin/env node
// Refuses an incomplete or inconsistent brand.json. Exit 1 when there is any error.
import path from 'node:path';
import { parseArgs, isMain, readJson } from './lib/cli.mjs';
import { validateBrand } from './lib/brand.mjs';

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) { console.log('Usage: node validate-brand.mjs brand/brand.json'); process.exit(file ? 0 : 1); }
  const r = validateBrand(readJson(file), { brandDir: path.dirname(path.resolve(file)) });
  for (const e of r.errors) console.log(`ERROR ${e.code}: ${e.message}`);
  for (const w of r.warnings) console.log(`warn  ${w.code}: ${w.message}`);
  console.log(r.errors.length ? `${r.errors.length} error(s): fix brand.json, then run this again.` : `brand.json is valid (${r.warnings.length} warning(s)).`);
  process.exit(r.errors.length ? 1 : 0);
}
