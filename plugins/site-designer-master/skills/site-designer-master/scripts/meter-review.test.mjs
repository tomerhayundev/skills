import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { measure, score } from './meter.mjs';
import { makeSite } from './fixtures/make-site.mjs';

// Pages that reproduce the final review's findings on the meter.
const skip = !findChrome() && 'no Chrome or Edge on this machine';
const RULES = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
const ids = (list, page) => new Set(list.filter((f) => f.page === page).map((f) => f.id));
const p = (body) => `<section>${body}</section>`;
let m;
before(() => {
  if (skip) return;
  const out = makeSite({
    index: p('<h1>Fine</h1><p>A fine page.</p>'),
    quote: p('<h1>Words</h1><blockquote><p>\u201cIt\u2019s the best bread in town.\u201d</p><footer>Dana</footer></blockquote>'),
    inlinecss: p('<h1>Inline</h1><style>.a{margin-left:20px}</style><p class="a" style="padding-left:4px">Text.</p>'),
    pair: p('<h1>Pair</h1><style>.b{position:absolute;left:0;right:0}</style><div style="position:relative;block-size:40px"><p class="b">Text.</p></div>'),
    oklch: p('<h1>Faint</h1><p style="color:oklch(0.9 0 0)">Very light grey text on white.</p>'),
    dim: p('<h1>Dim</h1><div style="opacity:.3"><p>Text dimmed by its parent.</p></div>'),
    onimage: p('<h1>Over</h1><div style="background:linear-gradient(#123,#456);padding:20px"><p style="color:#fff">Text over a gradient.</p></div>'),
    lost: p('<h1>Lost</h1><p class="lost">\u05e9\u05dc\u05d5\u05dd, \u05d6\u05d4 \u05d8\u05e7\u05e1\u05d8.</p>'),
  }, { css: "@font-face { font-family: 'Gone'; src: url(assets/missing.woff2) format('woff2'); }\n.lost { font-family: 'Gone', serif; }\n" });
  m = measure(out, { widths: [768] });
});

test('review 3: a real quote with curly marks and an attribution passes', { skip }, () => {
  const res = score({ ...m, brief: { proof: [{ label: 'review', value: "It's the best bread in town.", source: 'map review' }] } }, RULES);
  assert.equal(ids(res.fails, '/quote/').has('UNSOURCED_QUOTE'), false, JSON.stringify(res.fails.filter((f) => f.page === '/quote/')));
});

test('review 2: left and right inside a page are caught; a left-right pair is not', { skip }, () => {
  const res = score(m, RULES);
  assert.ok(res.fails.some((f) => f.id === 'PHYSICAL_PROPS' && f.page === '/inlinecss/'), JSON.stringify(res.fails.filter((f) => f.id === 'PHYSICAL_PROPS')));
  assert.equal(res.fails.some((f) => f.id === 'PHYSICAL_PROPS' && f.page === '/pair/'), false);
});

test('review 1: contrast is measured for any colour syntax and through opacity; unmeasurable text is reported', { skip }, () => {
  const res = score(m, RULES);
  assert.ok(ids(res.fails, '/oklch/').has('CONTRAST'), 'oklch');
  assert.ok(ids(res.fails, '/dim/').has('CONTRAST'), 'opacity');
  assert.ok(ids(res.warns, '/onimage/').has('CONTRAST_UNMEASURED'), 'over a gradient');
});

test('review 4: a face that failed to load is caught for the script it was meant to carry', { skip }, () => {
  const res = score(m, RULES);
  assert.ok(ids(res.fails, '/lost/').has('FONT_SCRIPT_COVERAGE'), JSON.stringify([...ids(res.fails, '/lost/')]));
});

test('the fine page stays clean', { skip }, () => {
  assert.deepEqual([...ids(score(m, RULES).fails, '/')], []);
});
