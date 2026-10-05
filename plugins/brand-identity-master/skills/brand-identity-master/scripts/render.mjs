#!/usr/bin/env node
// Renders a board page to PNG at its own measured height, keeps every version, and writes what the checks read.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, writeJson, nextVersion, SKILL_DIR } from './lib/cli.mjs';
import { dumpProbe, screenshot } from './lib/chrome.mjs';

const PROBE = path.join(SKILL_DIR, 'assets', 'board', 'probe.js');

export function injectProbe(html, probe) {
  const tag = `<script data-probe-skip>\n${probe}\n</script>\n`;
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}

export function measure(htmlFile, width, height = 1000) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const tmp = path.join(path.dirname(path.resolve(htmlFile)), `.probe-${path.basename(htmlFile)}`);
  fs.writeFileSync(tmp, injectProbe(html, fs.readFileSync(PROBE, 'utf8')));
  try {
    const m = dumpProbe(tmp, { width, height });
    if (!m.ok) throw new Error(`The page failed while being measured: ${m.error}`);
    return m;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export function render(htmlFile, { width = 1600, out, retina = true } = {}) {
  const first = measure(htmlFile, width);
  const height = Math.ceil(first.doc.height);
  const metrics = measure(htmlFile, width, height);
  if (Math.abs(metrics.doc.height - height) > 2) {
    throw new Error(`The page height changes with the window height (${height} px became ${metrics.doc.height} px): replace vh units and full-window heights with fixed sizes.`);
  }
  const base = out || htmlFile.replace(/\.html?$/i, '.png');
  const png = nextVersion(base);
  screenshot(htmlFile, png, { width, height });
  fs.copyFileSync(png, base);
  let png2 = null;
  if (retina) {
    png2 = png.replace(/\.png$/i, '@2x.png');
    screenshot(htmlFile, png2, { width, height, scale: 2 });
    fs.copyFileSync(png2, base.replace(/\.png$/i, '@2x.png'));
  }
  const metricsFile = base.replace(/\.png$/i, '.metrics.json');
  writeJson(metricsFile, { ...metrics, file: path.resolve(htmlFile), width, height, png: path.resolve(png) });
  return { png, png2, height, metricsFile };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) { console.log('Usage: node render.mjs brand/board.html [--width 1600] [--out brand/board.png] [--no-retina]'); process.exit(file ? 0 : 1); }
  const r = render(file, { width: Number(args.width) || 1600, out: typeof args.out === 'string' ? args.out : undefined, retina: !args['no-retina'] });
  console.log(`Rendered ${r.png}${r.png2 ? ` and ${r.png2}` : ''} at ${r.height} px tall; measurements in ${r.metricsFile}`);
}
