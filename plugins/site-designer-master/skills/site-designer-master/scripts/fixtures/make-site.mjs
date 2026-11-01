import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR, readJson } from '../lib/cli.mjs';
import { buildSite } from '../build.mjs';

const FIX = path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

// A built site with one page per planted defect; css goes into site.css.
export function makeSite(pages, { css = '', lang = 'en', dir = 'ltr' } = {}) {
  const src = tmp();
  fs.cpSync(FIX, src, { recursive: true });
  fs.rmSync(path.join(src, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(src, 'pages'));
  const list = Object.entries(pages).map(([name, html]) => {
    fs.writeFileSync(path.join(src, 'pages', `${name}.html`), html);
    return { path: name === 'index' ? '/' : `/${name}/`, file: `${name}.html`, title: name, description: name, nav: false };
  });
  const site = readJson(path.join(src, 'site.json'));
  Object.assign(site, { lang, dir, pages: list });
  fs.writeFileSync(path.join(src, 'site.json'), JSON.stringify(site));
  if (css) fs.writeFileSync(path.join(src, 'site.css'), css);
  const out = tmp();
  const r = buildSite(src, out);
  assert.deepEqual(r.errors, []);
  return out;
}

