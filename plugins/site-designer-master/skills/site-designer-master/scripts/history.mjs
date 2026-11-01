#!/usr/bin/env node
// The no-repeat log: what each site this user got was made of, so the next one does not quietly reuse it.
// The skill's own favourite default is the new slop; this is how it notices.
//   node history.mjs check '<candidate json>'      prints { repeat, matches }
//   node history.mjs record '<entry json>'
// Default file ~/.site-designer-master/history.json; SITE_HISTORY overrides it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMain } from './lib/cli.mjs';

export const FIELDS = ['family', 'fonts', 'palette', 'hero', 'layout'];
export const historyFile = () => process.env.SITE_HISTORY || path.join(os.homedir(), '.site-designer-master', 'history.json');

const read = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).sites || []; } catch { return []; }
};
const key = (v) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()).sort().join('|') : String(v ?? '').toLowerCase());

export function recordSite(file, entry) {
  const sites = read(file);
  sites.push({ ...entry, at: entry.at || new Date().toISOString().slice(0, 10) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ sites }, null, 2)}\n`);
}

// A repeat: family, fonts and hero all match one past site, or any four of the five fields do.
export function isRepeat(file, candidate) {
  let best = [];
  for (const past of read(file)) {
    const matches = FIELDS.filter((f) => candidate[f] !== undefined && key(candidate[f]) === key(past[f]));
    const core = ['family', 'fonts', 'hero'].every((f) => matches.includes(f));
    if (core || matches.length >= 4) return { repeat: true, matches };
    if (matches.length > best.length) best = matches;
  }
  return { repeat: false, matches: best.length >= 3 ? best : [] };
}

if (isMain(import.meta.url)) {
  const [cmd, json] = process.argv.slice(2);
  if (!['check', 'record'].includes(cmd) || !json) {
    console.error("usage: node history.mjs check|record '<json>'");
    process.exit(2);
  }
  const data = JSON.parse(json);
  if (cmd === 'record') { recordSite(historyFile(), data); console.log(`recorded in ${historyFile()}`); }
  else console.log(JSON.stringify(isRepeat(historyFile(), data)));
}
