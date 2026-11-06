// Drives a headless Chromium (Chrome or Edge) through command-line flags only: no npm packages.
// Every run gets its own temporary profile, so the owner's open browser is never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cropPng } from './png.mjs';

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
  if (process.env.SITE_CHROME && isFile(process.env.SITE_CHROME)) return process.env.SITE_CHROME;
  return candidates().find(isFile) || null;
}

function run(args, { timeoutMs = 90000 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome or Edge was found. Install one, or set SITE_CHROME to its path.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-chrome-'));
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

// A local file, or a live address as it is (the library capture opens real sites).
const url = (file) => (/^(https?|file):/i.test(file) ? file : pathToFileURL(path.resolve(file)).href);

function rawDump(file, width, height, budgetMs, timeoutMs, flags = []) {
  return run([`--window-size=${width},${height}`, `--virtual-time-budget=${budgetMs}`, ...flags, '--dump-dom', url(file)], { timeoutMs }).stdout;
}

// In --dump-dom mode the window counts a frame (scrollbar and toolbar space) that --screenshot does not,
// so the page sees a smaller viewport than asked. Measure that frame once per process and add it back.
let frame = null;
function calibrate() {
  if (frame) return frame;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-calibrate-'));
  const f = path.join(dir, 'calibrate.html');
  fs.writeFileSync(f, `<!doctype html><body><script>${EMIT_JS}__emit({w:innerWidth,h:innerHeight})</script>`, { flag: 'wx', mode: 0o600 });
  try {
    const m = readProbe(rawDump(f, 1000, 1000, 1000));
    frame = { dw: 1000 - m.w, dh: 1000 - m.h };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return frame;
}

// flags: extra browser switches for one run, such as --force-prefers-reduced-motion.
export function dumpDom(file, { width = 1600, height = 1200, budgetMs = 10000, timeoutMs, flags = [] } = {}) {
  const { dw, dh } = calibrate();
  return rawDump(file, width + dw, height + dh, budgetMs, timeoutMs, flags);
}

export function screenshot(file, out, { width, height, scale = 1, transparent = false, budgetMs = 10000, timeoutMs, flags = [] } = {}) {
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.rmSync(target);
  const args = [`--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, `--virtual-time-budget=${budgetMs}`, ...flags, `--screenshot=${target}`];
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

// Headless Chrome never makes a window narrower than about 500px, so a page asked for at 375 is really laid out
// at 500. To see the width asked for, the page is rendered inside an iframe of exactly that size (srcdoc, so it
// keeps this folder as its base and can hand its report to the host page), and phone screenshots are cropped.
export const MIN_WINDOW = 500;

function hostFor(file, width, height, scrollY = 0) {
  const html = fs.readFileSync(file, 'utf8');
  const scroll = scrollY ? `<script>addEventListener('load',function(){scrollTo(0,${Number(scrollY)})});</script>` : '';
  // SDM_ONE_FRAME: a 3D scene draws one frame and no loop; on this virtual clock a drawing loop never lets the page finish.
  const forward = `<script>window.SDM_ONE_FRAME=2;window.__emit=function(o){parent.__emit(o)};</script><style>html{scrollbar-width:none;scroll-behavior:auto!important}</style>${scroll}`;
  const inner = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${forward}`) : forward + html;
  const srcdoc = inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const host = path.join(path.dirname(file), `__sdm_host_${process.pid}_${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(host, `<!doctype html><html><head><meta charset="utf-8"><script>${EMIT_JS}</script><style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}iframe{display:block;border:0}</style></head><body><iframe width="${width}" height="${height}" srcdoc="${srcdoc}"></iframe></body></html>`);
  return host;
}

export function probeAtWidth(file, { width, height = 900, budgetMs = 10000, flags = [] } = {}) {
  const host = hostFor(file, width, height);
  try { return dumpProbe(host, { width: Math.max(width, MIN_WINDOW), height, budgetMs, flags }); } finally { fs.rmSync(host, { force: true }); }
}

export function screenshotAtWidth(file, out, { width, height, budgetMs = 10000, scrollY = 0 } = {}) {
  const host = hostFor(file, width, height, scrollY);
  try {
    const shot = screenshot(host, out, { width: Math.max(width, MIN_WINDOW), height, budgetMs });
    if (width < MIN_WINDOW) fs.writeFileSync(shot, cropPng(fs.readFileSync(shot), width, height));
    return shot;
  } finally { fs.rmSync(host, { force: true }); }
}
