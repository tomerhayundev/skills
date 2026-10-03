import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export function finding(code, severity, label, message, evidence = {}) {
  if (!SEVERITIES.includes(severity)) throw new Error(`bad severity ${severity}`);
  if (label !== 'D' && label !== 'H') throw new Error(`bad label ${label}`);
  return { code, severity, label, message, evidence };
}

export function sortFindings(list) {
  return [...list].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function findingsMarkdown(title, findings, notes = []) {
  const lines = [`# ${title}`, ''];
  for (const n of notes) lines.push(`- ${n}`);
  if (notes.length) lines.push('');
  if (!findings.length) lines.push('No findings.');
  for (const f of sortFindings(findings)) {
    lines.push(`- **${f.severity}** \`${f.code}\` (${f.label === 'D' ? 'deterministic' : 'heuristic'}): ${f.message}`);
    const urls = f.evidence?.urls || [];
    for (const u of urls.slice(0, 10)) lines.push(`  - ${u}`);
    if (urls.length > 10) lines.push(`  - and ${urls.length - 10} more`);
  }
  return lines.join('\n') + '\n';
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) { args[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
    else args[key] = true;
  }
  return args;
}

export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  let entry = path.resolve(process.argv[1]);
  try { entry = fs.realpathSync(entry); } catch { /* keep the resolved path */ }
  return pathToFileURL(entry).href === metaUrl;
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
