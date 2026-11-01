import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { SKILL_DIR } from './lib/cli.mjs';
import { buildSite } from './build.mjs';
import { startServer } from './serve.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
const site = tmp();
const data = tmp();
let srv;

before(async () => {
  buildSite(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), site);
  srv = await startServer({ root: site, dataDir: data, port: 0 });
});
after(() => srv.close());

const lines = () => {
  const f = path.join(data, 'submissions.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const post = (p, body, headers = {}) => fetch(srv.url + p, { method: 'POST', body, redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', referer: `${srv.url}/contact/`, ...headers } });

test('a directory path serves its index page', async () => {
  const r = await fetch(`${srv.url}/about/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /<h1>About<\/h1>/);
});

test('an unknown path gets the 404 page with status 404', async () => {
  const r = await fetch(`${srv.url}/nope/`);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /This page does not exist/);
});

test('a path that climbs out of the site is refused', async () => {
  const r = await fetch(`${srv.url}/..%2F..%2Fsecret.txt`);
  assert.equal(r.status, 404);
});

test('a form post is stored as one line and sends the visitor back with sent=', async () => {
  const before = lines().length;
  const r = await post('/forms/contact', 'email=a%40example.org&note=hi');
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /\/contact\/\?sent=contact$/);
  const all = lines();
  assert.equal(all.length, before + 1);
  assert.equal(all.at(-1).form, 'contact');
  assert.deepEqual(all.at(-1).fields, { email: 'a@example.org', note: 'hi' });
  assert.ok(all.at(-1).at);
});

test('two posts store two lines', async () => {
  const n = lines().length;
  await post('/forms/contact', 'email=b%40example.org');
  await post('/forms/contact', 'email=b%40example.org');
  assert.equal(lines().length, n + 2);
});

test('a body over 64 KB gets 413 and is not stored', async () => {
  const n = lines().length;
  const r = await post('/forms/contact', `note=${'x'.repeat(70 * 1024)}`);
  assert.equal(r.status, 413);
  assert.equal(lines().length, n);
  const ok = await fetch(`${srv.url}/`);
  assert.equal(ok.status, 200);
});

test('a form name with path characters is refused', async () => {
  const r = await post('/forms/..%2Fx', 'a=1');
  assert.equal(r.status, 400);
});

test('files are served with their content types', async () => {
  const types = { '/base.css': /text\/css/, '/site.js': /javascript/, '/assets/room.svg': /image\/svg\+xml/ };
  for (const [p, re] of Object.entries(types)) assert.match((await fetch(srv.url + p)).headers.get('content-type'), re, p);
});

test('handlers can be added for later parts of the skill', async () => {
  const { handlers } = await import('./serve.mjs');
  assert.equal(typeof handlers, 'object');
});

const raw = (method, p, headers, body = '') => new Promise((resolve, reject) => {
  const u = new URL(srv.url);
  const req = http.request({ host: u.hostname, port: u.port, path: p, method, headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(body);
});

test('a request for another host name is refused (DNS rebinding)', async () => {
  assert.equal(await raw('GET', '/', { host: 'evil.example:80' }), 403);
});

test('a post from another origin is refused (cross-site form)', async () => {
  const n = lines().length;
  const u = new URL(srv.url);
  assert.equal(await raw('POST', '/forms/contact', { host: u.host, origin: 'http://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, 'a=1'), 403);
  assert.equal(lines().length, n);
});

test('a post from the site itself and localhost names still work', async () => {
  const u = new URL(srv.url);
  assert.equal(await raw('POST', '/forms/contact', { host: u.host, origin: srv.url, 'content-type': 'application/x-www-form-urlencoded' }, 'a=1'), 303);
  assert.equal(await raw('GET', '/', { host: `localhost:${u.port}` }), 200);
});

test('the tweak panel saves valid token changes and refuses broken ones', async () => {
  const src = tmp();
  fs.cpSync(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), src, { recursive: true });
  const root = tmp();
  buildSite(src, root, { dev: true });
  const dev = await startServer({ root, dataDir: tmp(), srcDir: src, port: 0 });
  try {
    const tokensFile = path.join(src, 'tokens.json');
    const before = fs.readFileSync(tokensFile, 'utf8');
    const send = (body) => fetch(`${dev.url}/_tweaks`, { method: 'POST', headers: { 'content-type': 'application/json', origin: dev.url }, body: JSON.stringify(body) });
    const bad = await send({ tokens: { type: { ratio: 1.1 } } });
    assert.equal(bad.status, 422);
    assert.match((await bad.json()).errors.join(), /type ratio 1\.1 below 1\.25 for persuade/);
    assert.equal(fs.readFileSync(tokensFile, 'utf8'), before);
    const good = await send({ tokens: { color: { accent: '#1f4e79' } } });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { ok: true });
    const saved = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
    assert.equal(saved.color.accent, '#1f4e79');
    assert.equal(saved.color.ink, JSON.parse(before).color.ink);
    assert.match(fs.readFileSync(path.join(root, 'tokens.css'), 'utf8'), /--color-accent: #1f4e79/);
    const got = await (await fetch(`${dev.url}/_tweaks`)).json();
    assert.equal(got.tokens.color.accent, '#1f4e79');
  } finally { await dev.close(); }
});

test('without a source folder there is no tweak route', async () => {
  const r = await fetch(`${srv.url}/_tweaks`, { method: 'POST', headers: { 'content-type': 'application/json', origin: srv.url }, body: '{}' });
  assert.equal(r.status, 404);
});

test('a scale change is saved with every step recomputed inside the floors', async () => {
  const src = tmp();
  fs.cpSync(path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src'), src, { recursive: true });
  const root = tmp();
  buildSite(src, root, { dev: true });
  const dev = await startServer({ root, dataDir: tmp(), srcDir: src, port: 0 });
  try {
    const got = await (await fetch(`${dev.url}/_tweaks`)).json();
    assert.equal(got.floors.TEXT_MIN_PX, 13);
    const r = await fetch(`${dev.url}/_tweaks`, { method: 'POST', headers: { 'content-type': 'application/json', origin: dev.url }, body: JSON.stringify({ tokens: { type: { ratio: 1.615, steps: { body: 18 } } } }) });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    const saved = JSON.parse(fs.readFileSync(path.join(src, 'tokens.json'), 'utf8')).type;
    assert.equal(saved.ratio, 1.615);
    assert.equal(saved.steps.small, 13);
    assert.ok(saved.steps.display <= 96);
  } finally { await dev.close(); }
});
