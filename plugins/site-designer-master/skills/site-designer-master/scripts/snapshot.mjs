#!/usr/bin/env node
// Saves pages of a live local app (the picker, a dev server, a site to redesign) exactly as they render after
// their scripts run, with their styles and pictures, as a folder the meter and the critic pack can check.
//   node snapshot.mjs <base url> <path>[,<path>...] --out=<folder>   (paths with or without the leading slash)
// The first path becomes index.html; each other path becomes <name>/index.html (name from its #hash or path).
// Scripts are removed from the saved copy: it is a picture of the rendered page, not the app.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain } from './lib/cli.mjs';
import { dumpDom } from './lib/chrome.mjs';

const nameOf = (p, i) => (i === 0 ? '' : (p.split('#')[1] || p.replace(/[?#].*$/, '')).replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-') || `page-${i}`);

// True only for a path inside the folder: a prefix test alone lets "snap-evil" pass for "snap".
export function insideFolder(folder, target) {
  const root = path.resolve(folder);
  const t = path.resolve(target);
  return t !== root && t.startsWith(root + path.sep);
}

async function fetchTo(base, urlPath, out, seen) {
  const clean = urlPath.split(/[?#]/)[0];
  if (seen.has(clean)) return;
  seen.add(clean);
  const res = await fetch(base + clean).catch(() => null);
  if (!res || !res.ok) return;
  const target = path.resolve(out, decodeURIComponent(clean).replace(/^\/+/, ''));
  if (!insideFolder(out, target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (/\.css$/i.test(clean)) {
    // Styles pull in their own files (fonts, backgrounds); each becomes a relative address next to the copy.
    const dir = path.posix.dirname(clean);
    let css = await res.text();
    const refs = [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]).filter((u) => !/^(data:|https?:|#)/.test(u));
    for (const u of refs) await fetchTo(base, u.startsWith('/') ? u : path.posix.join(dir, u), out, seen);
    css = css.replace(/url\((['"]?)(\/[^'")]+)\1\)/g, (m, q, u) => `url(${q}${path.posix.relative(dir, u.split(/[?#]/)[0])}${q})`);
    fs.writeFileSync(target, css);
  } else fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

export async function snapshot(base, paths, out, { width = 1440, height = 900, budgetMs = 8000 } = {}) {
  base = base.replace(/\/+$/, '');
  const origin = new URL(base).origin;
  const seen = new Set();
  const pages = [];
  // Git Bash on Windows rewrites an argument that starts with a slash into a folder ("C:/Program Files/Git/…"):
  // the browser would get a broken address and save its own blank tab. Paths may be given without the slash.
  const bad = paths.find((p) => /^[A-Za-z]:[\\/]/.test(p));
  if (bad) throw new Error(`"${bad}" is a folder, not a page address: the shell rewrote it. Give the paths without the leading slash, as in _picker/#sites.`);
  paths = paths.map((p) => (p.startsWith('/') ? p : `/${p}`));
  for (const [i, p] of paths.entries()) {
    let html = dumpDom(base + p, { width, height, budgetMs });
    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
    const name = nameOf(p, i);
    const depth = name ? 1 : 0;
    const refs = new Set();
    // The saved copy is a still picture: a frame is left empty (what sits under it shows), never a live page nested
    // inside the meter's own frame, which reads as a layout shift a visitor never sees.
    html = html.replace(/<iframe\b([^>]*?)\ssrc="([^"]*)"/gi, (m, before, u) => `<iframe${before} src="about:blank" data-src="${u.startsWith(origin) ? u.slice(origin.length) : u}"`);
    html = html.replace(/\b(href|src|poster)="([^"]+)"/g, (m, attr, u) => {
      let local = u.startsWith(origin) ? u.slice(origin.length) : u;
      if (!local.startsWith('/') || local.startsWith('//')) return m;
      // Another page (a link, or a demo page set in a frame) is not part of this snapshot: it points at the live
      // app, so a frame shows what a visitor sees instead of a missing file.
      const isPage = /\.html?([?#]|$)/.test(local) || (attr === 'href' && !/\.\w{2,5}([?#]|$)/.test(local.split('#')[0]));
      if (isPage) return `${attr}="${origin}${local}"`;
      refs.add(local);
      return `${attr}="${'../'.repeat(depth)}${local.split(/[?#]/)[0].replace(/^\/+/, '')}"`;
    });
    for (const r of refs) await fetchTo(base, r, out, seen);
    const file = name ? path.join(name, 'index.html') : 'index.html';
    fs.mkdirSync(path.join(out, name || '.'), { recursive: true });
    fs.writeFileSync(path.join(out, file), html);
    pages.push(file.replace(/\\/g, '/'));
  }
  return { pages };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const [base, list] = args._;
  if (!base || !list || !args.out) {
    console.error('usage: node snapshot.mjs <base url> <path>[,<path>...] --out=<folder>');
    process.exit(2);
  }
  const r = await snapshot(base, String(list).split(','), path.resolve(args.out));
  console.log(`saved ${r.pages.length} pages into ${args.out}`);
}
