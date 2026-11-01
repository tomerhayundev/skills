#!/usr/bin/env node
// What the fresh-eyes critic looks at, made the same way every round, into one folder:
//   first-375.png, first-1440.png   the first screen at phone and desktop width (the 5-second test)
//   page-<name>-375.png / -1440.png every page in full at both widths
//   index.md                        the critic's brief (assets/critic-prompt.md), the site brief and the meter report
//   node critic-pack.mjs <site> --brief=brief.json [--meter=meter.txt] [--out=out/_critic]
// The critic sees only this folder: never the code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR, parseArgs, isMain, readJson, writeText } from './lib/cli.mjs';
import { probeAtWidth, screenshotAtWidth } from './lib/chrome.mjs';
import { decodePng, encodePng } from './lib/png.mjs';

const MAX_HEIGHT = 12000;
const WIDTHS = [375, 1440];

function pages(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('_') ? [] : pages(p, base);
    return e.name === 'index.html' ? [path.relative(base, p).replace(/\\/g, '/')] : [];
  });
}
const nameOf = (rel) => (rel === 'index.html' ? 'home' : rel.replace(/\/index\.html$/, '').replace(/[^\w-]+/g, '-'));

function pageHeight(file, width) {
  const probe = file.replace(/\.html$/, `.__h${width}.html`);
  const html = fs.readFileSync(file, 'utf8');
  const tag = `<script>addEventListener('load',function(){setTimeout(function(){__emit({h:document.documentElement.scrollHeight})},300)})</script>`;
  const i = html.lastIndexOf('</body>');
  fs.writeFileSync(probe, i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i));
  try { return Math.min(MAX_HEIGHT, probeAtWidth(probe, { width, height: 900 }).h); } finally { fs.rmSync(probe, { force: true }); }
}

// The whole page as a visitor scrolls it: one screen at a time, stitched, so units like 100vh keep their
// real size (rendering the page at its full height would stretch a full-screen hero to the whole page).
export function fullPageShot(file, out, { width, viewport = 900 } = {}) {
  const total = pageHeight(file, width);
  const parts = [];
  for (let y = 0; y < total; y += viewport) {
    const sy = Math.max(0, Math.min(y, total - viewport));
    const tmpOut = `${out}.${y}.png`;
    screenshotAtWidth(file, tmpOut, { width, height: Math.min(viewport, total), scrollY: sy });
    const img = decodePng(fs.readFileSync(tmpOut));
    fs.rmSync(tmpOut, { force: true });
    const from = y - sy, rows = Math.min(viewport, total - y);
    parts.push(img.data.subarray(from * img.width * 4, (from + rows) * img.width * 4));
  }
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { data.set(p, off); off += p.length; }
  fs.writeFileSync(out, encodePng(width, total, data));
  return out;
}

function briefMd(brief) {
  return Object.entries(brief || {}).map(([k, v]) => `- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
}

export function criticPack(siteDir, { brief = {}, meterReport = '', out }) {
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-critic-'));
  const files = [];
  try {
    fs.cpSync(siteDir, work, { recursive: true });
    const list = pages(work);
    for (const rel of list) {
      const file = path.join(work, rel);
      for (const width of WIDTHS) {
        if (rel === 'index.html') {
          screenshotAtWidth(file, path.join(out, `first-${width}.png`), { width, height: width < 768 ? 812 : 900 });
          files.push(`first-${width}.png`);
        }
        const name = `page-${nameOf(rel)}-${width}.png`;
        fullPageShot(file, path.join(out, name), { width });
        files.push(name);
      }
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  const prompt = fs.readFileSync(path.join(SKILL_DIR, 'assets', 'critic-prompt.md'), 'utf8');
  const md = `${prompt}\n## The brief\n\n${briefMd(brief)}\n\n## The meter's report\n\n\`\`\`\n${meterReport || '(not run)'}\n\`\`\`\n\n## Screenshots\n\n${files.map((f) => `- ${f}`).join('\n')}\n`;
  writeText(path.join(out, 'index.md'), md);
  files.push('index.md');
  return { files };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0] || !args.brief) {
    console.error('usage: node critic-pack.mjs <site> --brief=brief.json [--meter=meter.txt] [--out=out/_critic]');
    process.exit(2);
  }
  const out = path.resolve(args.out || path.join('out', '_critic'));
  const res = criticPack(path.resolve(args._[0]), { brief: readJson(args.brief), meterReport: args.meter ? fs.readFileSync(args.meter, 'utf8') : '', out });
  console.log(`wrote ${res.files.length} files into ${out}; give the critic only this folder`);
}
