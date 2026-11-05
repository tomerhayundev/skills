#!/usr/bin/env node
// Serves a built site on this machine only (127.0.0.1) and stores form posts.
//   node serve.mjs <site> [--port=4321] [--data=.site-data] [--src=<source folder>]
// A form posts to /forms/<name>; the fields are appended as one JSON line to <data>/submissions.jsonl
// and the visitor is sent back to the page with ?sent=<name>. Later parts of the skill (the picker,
// the tweak panel) add routes through the exported handlers map.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { SKILL_DIR, parseArgs, isMain, readJson } from './lib/cli.mjs';
import { validateTokens, scaleSteps } from './tokens.mjs';
import { buildSite } from './build.mjs';

export const MAX_BODY = 64 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

// 'METHOD /prefix' -> async (req, res, ctx) => boolean (true when handled). ctx = { root, dataDir, srcDir, body() }.
export const handlers = {};

// raw: the bytes as they came (a picture), instead of text.
export function readBody(req, limit = MAX_BODY, { raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    // Past the limit the rest is drained and dropped, so the client still gets its 413 answer.
    req.on('data', (c) => {
      size += c.length;
      if (over) return;
      if (size > limit) { over = true; chunks.length = 0; reject(Object.assign(new Error('body too large'), { status: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!over) resolve(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
}

async function serveFile(res, root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { rel = '/'; }
  const target = path.resolve(root, `.${rel}`);
  const inside = target === root || target.startsWith(root + path.sep);
  let file = inside ? target : null;
  if (file) {
    const st = await fsp.stat(file).catch(() => null);
    if (st?.isDirectory()) file = path.join(file, 'index.html');
    else if (!st) file = null;
  }
  if (file && fs.existsSync(file)) {
    return send(res, 200, await fsp.readFile(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  }
  const nf = path.join(root, '404.html');
  return send(res, 404, fs.existsSync(nf) ? await fsp.readFile(nf) : 'Not found', fs.existsSync(nf) ? TYPES['.html'] : undefined);
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
}

// The tweak panel: GET returns the source tokens; POST merges a partial change, checks it against the floors,
// saves it and rebuilds the development site. Only exists when the server knows the source folder.
async function handleTweaks(req, res, ctx) {
  const file = path.join(ctx.srcDir, 'tokens.json');
  const floors = readJson(path.join(SKILL_DIR, 'assets', 'rules.json')).thresholds;
  if (req.method === 'GET') return send(res, 200, JSON.stringify({ tokens: readJson(file), floors }), TYPES['.json']);
  let patch;
  try { patch = JSON.parse((await ctx.body()) || '{}').tokens || {}; } catch { return send(res, 400, JSON.stringify({ errors: ['the body is not JSON'] }), TYPES['.json']); }
  const next = deepMerge(readJson(file), patch);
  // A scale change from the panel sends the ratio and the body size; every other step follows from them here.
  if (patch.type?.ratio || patch.type?.steps?.body) next.type.steps = scaleSteps(next.type.steps.body, next.type.ratio, floors);
  const check = validateTokens(next, readJson(path.join(SKILL_DIR, 'assets', 'rules.json')));
  if (!check.ok) return send(res, 422, JSON.stringify({ errors: check.errors }), TYPES['.json']);
  await fsp.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  const built = buildSite(ctx.srcDir, ctx.root, { dev: true });
  if (built.errors.length) return send(res, 422, JSON.stringify({ errors: built.errors }), TYPES['.json']);
  return send(res, 200, JSON.stringify({ ok: true }), TYPES['.json']);
}

async function handleForm(req, res, ctx, name) {
  if (!/^[\w-]{1,64}$/.test(name)) return send(res, 400, 'Bad form name');
  const raw = await ctx.body();
  const type = req.headers['content-type'] || '';
  const fields = type.includes('application/json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  await fsp.appendFile(path.join(ctx.dataDir, 'submissions.jsonl'), `${JSON.stringify({ form: name, at: new Date().toISOString(), fields })}\n`);
  let back = '/';
  try { back = new URL(req.headers.referer || '/', 'http://localhost').pathname; } catch { /* keep / */ }
  return send(res, 303, '', undefined, { location: `${back}?sent=${name}` });
}

export function startServer({ root, dataDir, srcDir = null, port = 4321 } = {}) {
  root = path.resolve(root);
  dataDir = path.resolve(dataDir || path.join(root, '..', '.site-data'));
  const server = http.createServer(async (req, res) => {
    // Only this machine's own names may reach the server (a page on another site cannot rebind a name to it),
    // and nothing but the site itself may post to it.
    const port = server.address()?.port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) return send(res, 403, 'Forbidden host');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      if ((origin && !hosts.map((h) => `http://${h}`).includes(origin)) || (site && !['same-origin', 'none'].includes(site))) return send(res, 403, 'Forbidden origin');
    }
    const url = new URL(req.url, 'http://localhost');
    let bodyPromise;
    const ctx = { root, dataDir, srcDir, url, body: () => (bodyPromise ||= readBody(req)) };
    try {
      const key = Object.keys(handlers)
        .filter((k) => { const [m, p] = k.split(' '); return m === req.method && url.pathname.startsWith(p); })
        .sort((a, b) => b.length - a.length)[0];
      if (key && (await handlers[key](req, res, ctx))) return;
      if (srcDir && url.pathname === '/_tweaks' && (req.method === 'GET' || req.method === 'POST')) return await handleTweaks(req, res, ctx);
      const form = /^\/forms\/([^/]+)\/?$/.exec(url.pathname);
      if (req.method === 'POST' && form) {
        let name;
        try { name = decodeURIComponent(form[1]); } catch { name = ''; }
        return await handleForm(req, res, ctx, name);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 404, 'Not found');
      return await serveFile(res, root, url.pathname);
    } catch (err) {
      if (!res.headersSent) send(res, err.status || 500, err.status === 413 ? 'Too large' : 'Server error');
    }
  });
  return new Promise((resolve, reject) => {
    let tries = 0;
    const listen = (p) => server.listen(p, '127.0.0.1');
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port && tries < 20) { tries++; listen(port + tries); } else reject(err);
    });
    server.on('listening', () => {
      const { port: p } = server.address();
      resolve({ url: `http://127.0.0.1:${p}`, server, close: () => new Promise((r) => server.close(() => r())) });
    });
    listen(port);
  });
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) {
    console.error('usage: node serve.mjs <site> [--port=4321] [--data=.site-data] [--src=<source>]');
    process.exit(2);
  }
  const srv = await startServer({ root: args._[0], dataDir: args.data, srcDir: args.src ? path.resolve(args.src) : null, port: args.port ? Number(args.port) : 4321 });
  console.log(`Site running at ${srv.url}/ (this machine only). Press Ctrl+C to stop.`);
}
