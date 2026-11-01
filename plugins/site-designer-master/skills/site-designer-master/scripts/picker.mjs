#!/usr/bin/env node
// The picker: the local app the skill opens first. The user marks site inspirations, sections, motion and
// icons, sets the dials and hates, and presses Done; this writes taste.json and build-prompt.md into the work
// folder. The same app shows the directions and layouts pages (Steps 2-3) and records the choice.
//   node picker.mjs --work=<dir> --brief=<brief.json> [--library=<dir>] [--port=4400] [--step=directions|layouts] [--connected=image]
// --connected=image tells the picker this session can call an image tool (the script cannot see your tools).
// It waits until the user is done, then prints the result and exits: run it in the background.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SKILL_DIR, parseArgs, isMain, readJson } from './lib/cli.mjs';
import { handlers, startServer } from './serve.mjs';
import { loadLibrary, facets, queryLibrary, FACETS } from './library.mjs';
import { buildPrompt } from './prompt.mjs';
import { historyFile } from './history.mjs';
import { ensurePack } from './pack.mjs';
import { spawn } from 'node:child_process';

const APP = path.join(SKILL_DIR, 'assets', 'picker');
const STEPS = ['directions', 'layouts'];
const RTL = /^(he|ar|fa|ur|yi)\b/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const instances = new Map();

// Image services the skill can use when the user turns them on. Found by the NAME of their key in the
// environment, never its value; the picker shows only that a key exists.
export const IMAGE_TOOLS = [
  { id: 'gemini', name: 'Gemini images', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  { id: 'openai', name: 'OpenAI images', env: ['OPENAI_API_KEY'] },
  { id: 'magnific', name: 'Magnific / Freepik', env: ['MAGNIFIC_API_KEY', 'FREEPIK_API_KEY'] },
  { id: 'flux', name: 'Flux', env: ['BFL_API_KEY'] },
  { id: 'replicate', name: 'Replicate', env: ['REPLICATE_API_TOKEN'] },
  { id: 'fal', name: 'fal', env: ['FAL_KEY'] },
  { id: 'stability', name: 'Stability', env: ['STABILITY_API_KEY'] },
  { id: 'ideogram', name: 'Ideogram', env: ['IDEOGRAM_API_KEY'] },
];
export function detectImageTools(env = process.env, connected = []) {
  const found = IMAGE_TOOLS.filter((t) => t.env.some((k) => env[k])).map((t) => ({ id: t.id, name: t.name, how: 'key', key: t.env.find((k) => env[k]) }));
  if (connected.includes('image')) found.push({ id: 'connected', name: 'connected image tool', how: 'connected' });
  return found;
}

// Sites found dead while browsing are listed in the work folder and hidden from then on; nothing is sent anywhere.
const deadFile = (work) => path.join(path.resolve(work), 'dead-sites.json');
export function markDead(work, id) {
  const f = deadFile(work);
  const list = fs.existsSync(f) ? readJson(f) : [];
  if (!list.includes(id)) list.push(id);
  fs.writeFileSync(f, `${JSON.stringify(list)}
`);
}
const deadIds = (work) => new Set(fs.existsSync(deadFile(work)) ? readJson(deadFile(work)) : []);
const checked = new Set();
// After a page of cards is sent, each live site on it is asked once whether it still exists. Only a clear "gone"
// (404 or 410) hides it: a network error, a timeout, a 5xx or a bot check says nothing about the site.
export function checkAlive(work, items, fetchImpl = globalThis.fetch) {
  return Promise.all(items.filter((e) => /^https?:/.test(e.url) && !checked.has(`${work}|${e.id}`)).map((e) => {
    checked.add(`${work}|${e.id}`);
    return fetchImpl(e.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) })
      .then((r) => { if (r.status === 404 || r.status === 410) markDead(work, e.id); })
      .catch(() => {});
  }));
}

// What the waiting command watches: the time of the last Done or of the last choice for a step. A file caught
// half-written reads as nothing yet.
export function doneSignature(work, step) {
  try {
    if (step) { const c = readJson(path.join(work, 'choices.json'))[step]; return c && c.at ? `${c.id}@${c.at}` : null; }
    return readJson(path.join(work, 'taste.json')).doneAt || null;
  } catch { return null; }
}

const send = (res, status, body, type = TYPES['.json']) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); return true; };
const inside = (base, rel) => { const p = path.resolve(base, `.${rel.startsWith('/') ? rel : `/${rel}`}`); return p === base || p.startsWith(base + path.sep) ? p : null; };
async function file(res, base, rel) {
  let target = inside(base, decodeURIComponent(rel));
  if (target && fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!target || !fs.existsSync(target)) return send(res, 404, { error: 'not found' });
  return send(res, 200, await fsp.readFile(target), TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream');
}

function pickHistory() {
  try {
    const counts = {};
    for (const s of JSON.parse(fs.readFileSync(historyFile(), 'utf8')).sites || []) for (const id of s.picks || []) counts[id] = (counts[id] || 0) + 1;
    return counts;
  } catch { return {}; }
}

function cardOf(e) {
  const own = (p) => `/_picker/library/${p}`;
  return { id: e.id, shelf: e.shelf, url: /^https?:/.test(e.url) ? e.url : own(e.url), description: e.description, bestUse: e.bestUse, he: e.he, tags: e.tags, added: e.added, preview: `/_picker/pack/${e.preview}`, large: e.large ? `/_picker/pack/${e.large}` : null, phone: e.phone ? `/_picker/pack/${e.phone}` : null, demo: e.demo ? own(e.demo) : null };
}

export function registerPicker({ work, brief, libraryDir = path.join(SKILL_DIR, 'assets', 'library'), connected = [] }) {
  work = path.resolve(work);
  libraryDir = path.resolve(libraryDir);
  const lang = brief.lang || 'en';
  const allStrings = readJson(path.join(APP, 'strings.json'));
  const { entries } = loadLibrary(libraryDir);
  const stateFile = path.join(work, 'picker-state.json');
  const dislikeData = readJson(path.join(APP, 'dislikes.json'));
  const imageTools = detectImageTools(process.env, connected);
  // The AI tells start as avoided; the user can allow any of them.
  const readState = () => (fs.existsSync(stateFile) ? readJson(stateFile) : { brief, picks: [], dials: { density: 3, loudness: 3, motion: 1 }, hates: [], avoid: dislikeData.dislikes.filter((d) => d.ai).map((d) => d.id), notes: '', images: { own: false, ownFolder: '', free: true, generate: [], other: '' }, answers: {} });
  instances.set(work, { work, brief, libraryDir, entries, readState, stateFile, lang, strings: allStrings[lang.slice(0, 2)] || allStrings.en, dislikeData, imageTools });

  handlers['GET /_picker'] = async (req, res, ctx) => {
    const me = instances.get(path.resolve(ctx.root));
    if (!me) return false;
    const p = ctx.url.pathname;
    if (p === '/_picker' || p === '/_picker/') return file(res, APP, 'index.html');
    if (p.startsWith('/_picker/app/')) return file(res, APP, p.slice('/_picker/app'.length));
    if (p.startsWith('/_picker/pack/')) return file(res, path.join(me.libraryDir, 'pack'), p.slice('/_picker/pack'.length));
    if (p.startsWith('/_picker/library/demos/')) return file(res, path.join(me.libraryDir, 'demos'), p.slice('/_picker/library/demos'.length));
    if (p.startsWith('/_picker/work/')) return file(res, me.work, p.slice('/_picker/work'.length));
    if (p === '/_picker/api/state') {
      const shelves = Object.fromEntries(['sites', 'sections', 'motion', 'icons', 'type', 'colour'].map((sh) => [sh, facets(me.entries.filter((e) => e.shelf === sh))]));
      me.entries = loadLibrary(me.libraryDir).entries.filter((e) => !deadIds(me.work).has(e.id));
      const counts = Object.fromEntries(Object.keys(shelves).map((sh) => [sh, me.entries.filter((e) => e.shelf === sh).length]));
      return send(res, 200, { ...me.readState(), lang: me.lang, dir: RTL.test(me.lang) ? 'rtl' : 'ltr', strings: me.strings, facets: shelves.sites, shelves, counts, dislikes: me.dislikeData.dislikes, motionTopics: me.dislikeData.motionTopics, imageTools: me.imageTools });
    }
    if (p === '/_picker/api/library') {
      const q = ctx.url.searchParams;
      const filters = {};
      for (const f of FACETS) if (q.get(`f.${f}`)) filters[f] = q.get(`f.${f}`).split(',');
      const s = me.readState();
      const dead = deadIds(me.work);
      me.entries = loadLibrary(me.libraryDir).entries.filter((e) => !dead.has(e.id));
      const r = queryLibrary(me.entries, { shelf: q.get('shelf') || 'sites', sort: q.get('sort') || 'recommended', q: q.get('q') || '', filters, offset: Number(q.get('offset') || 0), brief: s.brief || me.brief, dials: s.dials, history: pickHistory() });
      if (!process.env.SITE_OFFLINE) checkAlive(me.work, r.items);
      return send(res, 200, { ...r, items: r.items.map(cardOf) });
    }
    const cmp = /^\/_picker\/compare\/(directions|layouts)\/?$/.exec(p);
    if (cmp) return send(res, 200, comparePage(me, cmp[1]), TYPES['.html']);
    return send(res, 404, { error: 'not found' });
  };

  handlers['POST /_picker'] = async (req, res, ctx) => {
    const me = instances.get(path.resolve(ctx.root));
    if (!me) return false;
    const p = ctx.url.pathname;
    let body = {};
    try { body = JSON.parse((await ctx.body()) || '{}'); } catch { return send(res, 400, { error: 'not JSON' }); }
    if (p === '/_picker/api/state') {
      // Every save carries the revision it started from; a tab that is behind gets 409 and reloads instead of
      // overwriting what another tab saved.
      const current = me.readState();
      if ((body.rev || 0) !== (current.rev || 0)) return send(res, 409, { error: 'stale', state: current });
      const keep = { brief: body.brief || me.brief, picks: body.picks || [], dials: body.dials || {}, hates: body.hates || [], avoid: body.avoid || [], notes: String(body.notes || '').slice(0, 4000), images: body.images || {}, answers: body.answers || {}, rev: (current.rev || 0) + 1 };
      await fsp.mkdir(me.work, { recursive: true });
      await fsp.writeFile(me.stateFile, `${JSON.stringify(keep, null, 2)}\n`);
      return send(res, 200, { ok: true, rev: keep.rev });
    }
    if (p === '/_picker/api/done') {
      const s = me.readState();
      let picks = s.picks;
      let chosenBy = 'user';
      if (!picks.length) {
        chosenBy = 'recommendation';
        const top = (shelf, n) => queryLibrary(me.entries, { shelf, sort: 'recommended', brief: s.brief, dials: s.dials, limit: n }).items.map((e) => ({ id: e.id, shelf, liked: '' }));
        picks = [...top('sites', 3), ...top('motion', 1), ...top('icons', 1)];
      }
      const taste = { ...s, picks, chosenBy, doneAt: new Date().toISOString() };
      await fsp.writeFile(path.join(me.work, 'taste.json'), `${JSON.stringify(taste, null, 2)}\n`);
      await fsp.writeFile(path.join(me.work, 'build-prompt.md'), buildPrompt({ brief: s.brief, taste, entries: me.entries, dislikes: me.dislikeData.dislikes, imageTools: me.imageTools }));
      return send(res, 200, { ok: true, taste: path.join(me.work, 'taste.json'), prompt: path.join(me.work, 'build-prompt.md') });
    }
    if (p === '/_picker/api/choose') {
      if (!STEPS.includes(body.step) || !/^[\w-]{1,64}$/.test(String(body.id || ''))) return send(res, 400, { error: 'bad choice' });
      const f = path.join(me.work, 'choices.json');
      const choices = fs.existsSync(f) ? readJson(f) : {};
      choices[body.step] = { id: body.id, at: new Date().toISOString() };
      await fsp.writeFile(f, `${JSON.stringify(choices, null, 2)}\n`);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  };
}

function comparePage(me, step) {
  const dir = path.join(me.work, step);
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.html'))).map((e) => e.name).sort() : [];
  const tpl = fs.readFileSync(path.join(APP, 'compare.html'), 'utf8');
  const cards = ids.map((id) => `<section class="option" data-id="${id}"><h2>${id}</h2><div class="frames"><div class="frame phone"><iframe title="${id} at 375" src="/_picker/work/${step}/${id}/index.html" width="375" height="812" loading="lazy"></iframe></div><div class="frame desk"><iframe title="${id} at 1440" src="/_picker/work/${step}/${id}/index.html" width="1440" height="900" loading="lazy"></iframe></div></div><button type="button" class="choose" data-id="${id}">${me.strings.thisOne}</button></section>`).join('\n');
  return tpl.replaceAll('{{lang}}', me.lang).replaceAll('{{dir}}', RTL.test(me.lang) ? 'rtl' : 'ltr').replaceAll('{{title}}', me.strings[step]).replaceAll('{{step}}', step).replace('{{options}}', () => cards || `<p>${me.strings.noOptions}</p>`);
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.work || !args.brief) {
    console.error('usage: node picker.mjs --work=<dir> --brief=<brief.json> [--library=<dir>] [--port=4400] [--step=directions|layouts]');
    process.exit(2);
  }
  const work = path.resolve(args.work);
  fs.mkdirSync(work, { recursive: true });
  // Pictures first: the published pack when there is one; otherwise capture them here, in the background, and
  // let cards appear as their pictures exist (a card is never shown without one).
  const libraryDir = path.resolve(args.library || path.join(SKILL_DIR, 'assets', 'library'));
  const packInfo = fs.existsSync(path.join(libraryDir, 'pack.json')) ? readJson(path.join(libraryDir, 'pack.json')) : {};
  const got = await ensurePack(packInfo, path.join(libraryDir, 'pack'));
  const havePictures = fs.existsSync(path.join(libraryDir, 'pack', 'sites')) && fs.readdirSync(path.join(libraryDir, 'pack', 'sites')).some((f) => f.endsWith('.webp'));
  if (!got.ok && !havePictures) {
    console.log(`No picture pack (${got.reason}); capturing pictures on this machine in the background.`);
    for (const shelf of ['motion', 'icons', 'sites']) {
      const f = path.join(libraryDir, `${shelf}.json`);
      if (fs.existsSync(f)) spawn(process.execPath, [path.join(SKILL_DIR, 'scripts', 'capture.mjs'), f, `--pack=${path.join(libraryDir, 'pack')}`], { stdio: 'ignore', detached: true }).unref();
    }
  }
  registerPicker({ work, brief: readJson(args.brief), libraryDir, connected: args.connected ? String(args.connected).split(',') : [] });
  const srv = await startServer({ root: work, dataDir: path.join(work, '.site-data'), port: args.port ? Number(args.port) : 4400 });
  const step = args.step && STEPS.includes(args.step) ? args.step : null;
  console.log(`Picker open at ${srv.url}${step ? `/_picker/compare/${step}/` : '/_picker/'} (this machine only). Waiting for the user.`);
  const start = doneSignature(work, step);
  const timer = setInterval(async () => {
    const v = doneSignature(work, step);
    if (v && v !== start) {
      clearInterval(timer);
      await srv.close();
      console.log(step ? `chosen ${step}: ${v.split('@')[0]}` : `done: ${path.join(work, 'taste.json')} and ${path.join(work, 'build-prompt.md')}`);
      process.exit(0);
    }
  }, 1000);
}
