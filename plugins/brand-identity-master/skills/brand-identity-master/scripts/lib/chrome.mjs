// Drives a headless Chromium (Chrome or Edge) through command-line flags only: no npm packages.
// Every run gets its own temporary profile, so the owner's open browser is never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function candidates() {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [
      path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(r, 'Chromium', 'Application', 'chrome.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  }
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].flatMap((n) => dirs.map((d) => path.join(d, n)));
}

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export function findChrome() {
  if (process.env.BRAND_CHROME && isFile(process.env.BRAND_CHROME)) return process.env.BRAND_CHROME;
  return candidates().find(isFile) || null;
}

function run(args, { timeoutMs = 90000 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome or Edge was found. Install one, or set BRAND_CHROME to its path.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-chrome-'));
  try {
    const res = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
      '--allow-file-access-from-files', '--disable-extensions', `--user-data-dir=${profile}`, ...args,
    ], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    if (res.error) throw res.error;
    return res;
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temp profile is harmless */ }
  }
}

const url = (file) => pathToFileURL(path.resolve(file)).href;

function rawDump(file, width, height, budgetMs, timeoutMs) {
  return run([`--window-size=${width},${height}`, `--virtual-time-budget=${budgetMs}`, '--dump-dom', url(file)], { timeoutMs }).stdout;
}

// In --dump-dom mode the window counts a frame (scrollbar and toolbar space) that --screenshot does not,
// so the page sees a smaller viewport than asked. Measure that frame once per process and add it back.
let frame = null;
function calibrate() {
  if (frame) return frame;
  const f = path.join(os.tmpdir(), `bim-calibrate-${process.pid}.html`);
  fs.writeFileSync(f, `<!doctype html><body><script>${EMIT_JS}__emit({w:innerWidth,h:innerHeight})</script>`);
  try {
    const m = readProbe(rawDump(f, 1000, 1000, 1000));
    frame = { dw: 1000 - m.w, dh: 1000 - m.h };
  } finally { fs.rmSync(f, { force: true }); }
  return frame;
}

export function dumpDom(file, { width = 1600, height = 1200, budgetMs = 10000, timeoutMs } = {}) {
  const { dw, dh } = calibrate();
  return rawDump(file, width + dw, height + dh, budgetMs, timeoutMs);
}

export function screenshot(file, out, { width, height, scale = 1, transparent = false, budgetMs = 10000, timeoutMs } = {}) {
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.rmSync(target);
  const args = [`--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, `--virtual-time-budget=${budgetMs}`, `--screenshot=${target}`];
  if (transparent) args.push('--default-background-color=00000000');
  run([...args, url(file)], { timeoutMs });
  if (!fs.existsSync(target)) throw new Error(`The browser did not write ${target}`);
  return target;
}

export const EMIT_JS = "window.__emit=function(o){var s=document.createElement('script');s.type='application/json';s.id='__probe_out';s.textContent=JSON.stringify(o).replace(/</g,String.fromCharCode(92)+'u003c');document.body.appendChild(s);};";

export function readProbe(dom) {
  const m = /<script[^>]*id="__probe_out"[^>]*>([\s\S]*?)<\/script>/.exec(dom || '');
  if (!m) throw new Error('The page did not report its measurements (probe output missing).');
  return JSON.parse(m[1]);
}

// Runs a page that emits through __emit and returns what it emitted. A busy machine can end a run before the
// page reports; one retry with a longer time budget covers that.
export function dumpProbe(file, opts = {}) {
  try {
    return readProbe(dumpDom(file, opts));
  } catch (err) {
    if (!/probe output missing/.test(String(err && err.message))) throw err;
    return readProbe(dumpDom(file, { ...opts, budgetMs: (opts.budgetMs || 10000) * 3, timeoutMs: 180000 }));
  }
}
