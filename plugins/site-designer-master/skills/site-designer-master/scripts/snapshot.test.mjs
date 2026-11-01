import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SKILL_DIR } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { snapshot } from './snapshot.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

test('a page drawn by its script is saved as it renders, with its styles and pictures, ready for the meter', { skip }, async () => {
  // The app runs in its own process: the browser call blocks this one, so a server here could never answer.
  const child = spawn(process.execPath, [path.join(SKILL_DIR, 'scripts', 'fixtures', 'snapshot', 'server.mjs')]);
  const port = await new Promise((r) => child.stdout.once('data', (d) => r(String(d).trim())));
  const base = `http://127.0.0.1:${port}`;
  try {
    const out = tmp();
    const r = await snapshot(base, ['/app/#one', 'app/#two'], out);
    assert.deepEqual(r.pages, ['index.html', 'two/index.html']);
    const one = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(one, /<h1>Drawn #one<\/h1>/);
    assert.doesNotMatch(one, /<script/);
    assert.match(one, /href="app\/app\.css"/);
    assert.match(one, /src="app\/pic\.png"/);
    assert.equal(fs.readFileSync(path.join(out, 'app', 'pic.png'), 'utf8'), 'PNGDATA');
    assert.match(fs.readFileSync(path.join(out, 'app', 'app.css'), 'utf8'), /url\(bg\.png\)/);
    assert.equal(fs.readFileSync(path.join(out, 'app', 'bg.png'), 'utf8'), 'BGDATA');
    assert.match(fs.readFileSync(path.join(out, 'two', 'index.html'), 'utf8'), /href="\.\.\/app\/app\.css"/);
    // Another page is not an asset: a link points at the live app and nothing is saved for it.
    assert.ok(one.includes(`href="${base}/app/demo.html#spin"`), 'the link points at the live app');
    // The saved copy is a still picture: a frame is left empty (what sits under it shows), never a live page
    // nested inside the meter's own frame, which reads as a layout shift the visitor never sees.
    assert.match(one, /<iframe src="about:blank" data-src="[^"]*\/app\/demo\.html\?m=rise"/);
    assert.equal(fs.existsSync(path.join(out, 'app', 'demo.html')), false);
  } finally { child.kill(); }
});

test('a path a Windows shell turned into a folder is refused with the way out, not saved as a blank page', async () => {
  await assert.rejects(snapshot('http://127.0.0.1:9', ['C:/Program Files/Git/app/#one'], tmp()), /without the leading slash/);
});

test('an asset path can never be written outside the snapshot folder, not even into a sibling with a longer name', async () => {
  const { insideFolder } = await import('./snapshot.mjs');
  const out = path.join(tmp(), 'snap');
  assert.equal(insideFolder(out, path.join(out, 'app', 'a.css')), true);
  assert.equal(insideFolder(out, path.join(out + '-evil', 'a.css')), false);
  assert.equal(insideFolder(out, path.join(out, '..', 'x.css')), false);
});
