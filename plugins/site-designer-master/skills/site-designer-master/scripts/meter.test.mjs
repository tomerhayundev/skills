import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { buildSite } from './build.mjs';
import { measure, score } from './meter.mjs';
import { makeSite } from './fixtures/make-site.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const RULES = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
const FIX = path.join(SKILL_DIR, 'scripts', 'fixtures', 'site-src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));

const ids = (findings, page) => new Set(findings.filter((f) => !page || f.page === page).map((f) => f.id));

test('the clean fixture has no failures at any width', { skip }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
  buildSite(FIX, out);
  const res = score(measure(out), RULES);
  assert.deepEqual(res.fails, [], JSON.stringify(res.fails, null, 1));
});

test('each planted defect is caught on its page', { skip }, () => {
  const p = (body) => `<section>${body}</section>`;
  const out = makeSite({
    index: p('<h1>Fine</h1><p>A fine page.</p>'),
    overflow: p('<h1>Wide</h1><div style="inline-size:1200px">wide</div>'),
    twoh1: p('<h1>One</h1><h1>Two</h1>'),
    skip: p('<h1>Top</h1><h2>Two</h2><h4>Four</h4>'),
    small: p('<h1>Small</h1><p style="font-size:14px">Body text set too small for comfortable reading.</p>'),
    contrast: p('<h1>Grey</h1><p style="color:#999">Light grey body text on white.</p>'),
    target: p('<h1>Tiny</h1><button style="inline-size:20px;block-size:20px;padding:0;min-block-size:0">x</button>'),
    alt: p('<h1>Img</h1><img src="/assets/room.svg" width="400" height="300">'),
    hebrew: p('<h1>Hebrew</h1><p class="latin-only">שלום לכולם, זה טקסט בעברית.</p>'),
    measure: p(`<h1>Long</h1><p style="max-inline-size:none">${'word '.repeat(80)}</p>`),
    shift: p('<h1>Late</h1><p>Text that is pushed down.</p><p>More text.</p><script>setTimeout(function(){var d=document.createElement("div");d.style.blockSize="400px";document.querySelector("section").prepend(d)},50)</script>'),
  }, { css: "@font-face { font-family: 'Latin Only'; src: url(/assets/none.woff2) format('woff2'); unicode-range: U+0000-00FF; }\n.latin-only { font-family: 'Latin Only', serif; }\n.x { margin-left: 4px; }\n" });
  const res = score(measure(out, { widths: [375, 1440] }), RULES);
  const fails = res.fails;
  const expect = { shift: 'CLS', overflow: 'H_OVERFLOW', twoh1: 'H1_COUNT', skip: 'HEADING_SKIP', small: 'BODY_SIZE', contrast: 'CONTRAST', target: 'TARGET_SIZE', alt: 'IMG_ALT', hebrew: 'FONT_SCRIPT_COVERAGE' };
  for (const [page, id] of Object.entries(expect)) assert.ok(ids(fails, `/${page}/`).has(id), `${id} on /${page}/: ${JSON.stringify([...ids(fails, `/${page}/`)])}`);
  assert.ok(ids(fails, 'css').has('PHYSICAL_PROPS'));
  assert.ok(ids(res.warns, '/measure/').has('MEASURE'));
  const indexFails = [...ids(fails, '/')];
  assert.deepEqual(indexFails, [], 'the fine page stays clean');
});

test('score reads severities from rules.json', () => {
  const m = { pages: [{ path: '/', width: 375, facts: { overflow: true, h1: 1, headings: [], landmarks: { main: 1 }, lang: 'en', dir: 'ltr', text: [], contrast: [], targets: [], images: [], fonts: [], axe: [], perf: {} } }], css: [] };
  const res = score(m, RULES);
  assert.equal(res.fails[0].id, 'H_OVERFLOW');
  assert.equal(res.fails[0].page, '/');
  assert.equal(res.fails[0].width, 375);
});

test('a phone page that overflows by less than the browser minimum is still caught at 375', { skip }, () => {
  const out = makeSite({ index: '<section><h1>Narrow</h1><div style="inline-size:440px">440px wide</div></section>' });
  const res = score(measure(out, { widths: [375] }), RULES);
  assert.ok(res.fails.some((f) => f.id === 'H_OVERFLOW' && f.width === 375), JSON.stringify(res.fails));
});
