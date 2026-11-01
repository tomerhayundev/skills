import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { findChrome } from './lib/chrome.mjs';
import { measure, score } from './meter.mjs';
import { makeSite } from './fixtures/make-site.mjs';

const skip = !findChrome() && 'no Chrome or Edge on this machine';
const RULES = readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));
const CAT = readJson(path.join(SKILL_DIR, 'assets', 'slop-catalogue.json'));
const ids = (findings, page) => new Set(findings.filter((f) => f.page === page).map((f) => f.id));
const p = (body) => `<section>${body}</section>`;

let m;
before(() => {
  if (skip) return;
  const out = makeSite({
    index: p('<h1>Bread baked at five</h1><p>Sourdough from the corner oven.</p><p><a class="button" href="/numbers/">See the menu</a></p>'),
    gradtext: p('<h1 style="background:linear-gradient(90deg,#c2410c,#1d4ed8);-webkit-background-clip:text;background-clip:text;color:transparent">Shiny words</h1><p>Text.</p>'),
    huegrad: p('<h1>Wash</h1><div style="block-size:200px;background:linear-gradient(135deg,#7c3aed,#06b6d4)"></div>'),
    glow: p('<h1>Glow</h1><a class="button" href="/" style="box-shadow:0 0 24px rgba(124,58,237,.8)">Book a table</a>'),
    nested: p('<h1>Cards</h1><div style="border:1px solid #ccc;padding:24px;border-radius:12px"><div style="border:1px solid #ccc;padding:16px;border-radius:8px"><p>Inner card.</p></div></div>'),
    tiles: p(`<h1>Features</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">${'<div><div style="inline-size:48px;block-size:48px;border-radius:12px;background:#e0e7ff"><svg width="24" height="24"></svg></div><h3>Fast</h3><p>Words.</p></div>'.repeat(3)}</div>`),
    eyebrow: p('<span style="font-size:12px;text-transform:uppercase;letter-spacing:.12em">Our story</span><h1>Since the beginning</h1><p>Text.</p>'),
    copyen: p('<h1>Elevate your mornings</h1><p>A seamless way to buy bread.</p>'),
    copyhe: p('<h1>מאפייה</h1><p>אנחנו מציעים פתרונות מתקדמים לכל לקוח.</p>'),
    drawn: p('<h1>Things to avoid</h1><div aria-hidden="true"><span>Seamless</span></div><p>Plain words about bread.</p>'),
    buttontext: p('<h1>Form</h1><form method="post" action="/forms/x"><label for="e">Email</label><input id="e" name="e" type="email" autocomplete="email"><button type="submit">Submit</button></form>'),
    numbers: p('<h1>Loved</h1><p>Join 500+ happy customers since 1998.</p><ol><li>Order</li><li>Pick up</li></ol>'),
    hidden: p('<h1>Reveal</h1><p class="reveal" style="opacity:0;transition:opacity .4s">This text waits for a scroll trigger.</p><script>new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.style.opacity=1})}).observe(document.querySelector(".reveal"))</script>'),
    quote: p('<h1>Kind words</h1><blockquote><p>Best bread I have ever had.</p></blockquote>'),
    motion: p('<h1>Spin</h1><div class="spin" style="inline-size:40px;block-size:40px;background:#999"></div><p>Text.</p><script>document.querySelector(".spin").animate([{transform:"rotate(0)"},{transform:"rotate(1turn)"}],{duration:2000,iterations:Infinity})</script>'),
  });
  m = measure(out, { widths: [1440] });
});

test('every catalogue tell has a fill rule and a matching meter rule', () => {
  for (const tell of CAT.tells) {
    assert.ok(tell.fill && tell.fill.length > 20, `${tell.id} fill`);
    assert.ok(RULES.rules[tell.id], `${tell.id} in rules.json`);
    assert.equal(RULES.rules[tell.id].category, 'slop', tell.id);
  }
  assert.match(CAT.reviewed, /^\d{4}-\d{2}-\d{2}$/);
});

test('each slop tell is caught on its page and the clean page stays clean', { skip }, () => {
  const { fails, warns } = score({ ...m, brief: { proof: [] } }, RULES);
  const all = [...fails, ...warns];
  const expect = { gradtext: 'GRADIENT_TEXT', huegrad: 'HUE_GRADIENT', glow: 'GLOW_SHADOW', nested: 'NESTED_CARDS', tiles: 'ICON_TILE_ROW', eyebrow: 'EYEBROW', copyen: 'BANNED_COPY', copyhe: 'BANNED_COPY', buttontext: 'BUTTON_TEXT', numbers: 'UNSOURCED_NUMBER', hidden: 'CONTENT_HIDDEN_AT_REST', motion: 'REDUCED_MOTION' };
  for (const [page, id] of Object.entries(expect)) assert.ok(ids(all, `/${page}/`).has(id), `${id} on /${page}/: ${[...ids(all, `/${page}/`)]}`);
  assert.ok(ids(all, '/huegrad/').has('AI_PALETTE'));
  assert.deepEqual([...ids(fails, '/')], [], JSON.stringify(fails.filter((f) => f.page === '/')));
  // Words inside a drawing hidden from assistive tech are a picture of the tell, not the page's copy.
  assert.equal(ids(all, '/drawn/').has('BANNED_COPY'), false, JSON.stringify(all.filter((f) => f.page === '/drawn/')));
});

test('a number the brief holds is allowed, and so are the footer year and small counts', { skip }, () => {
  const sourced = score({ ...m, brief: { proof: [{ label: 'customers', value: '500+' }], facts: ['Open since 1998'] } }, RULES);
  assert.equal(ids(sourced.fails, '/numbers/').has('UNSOURCED_NUMBER'), false, JSON.stringify(sourced.fails.filter((f) => f.id === 'UNSOURCED_NUMBER')));
  const none = score({ ...m, brief: { proof: [] } }, RULES).fails.filter((f) => f.id === 'UNSOURCED_NUMBER');
  assert.ok(none.every((f) => !/20\d\d$/.test(f.detail) || /1998/.test(f.detail)), 'the copyright year is never flagged');
  assert.ok(none.some((f) => /500\+/.test(f.detail)));
});

test('without a brief the number rule does not run', { skip }, () => {
  const res = score({ ...m, brief: null }, RULES);
  assert.equal(res.fails.some((f) => f.id === 'UNSOURCED_NUMBER'), false);
});

test('a quote the brief does not hold is flagged; a quote from the brief is not', { skip }, () => {
  const none = score({ ...m, brief: { proof: [] } }, RULES).fails;
  assert.ok(none.some((f) => f.id === 'UNSOURCED_QUOTE' && f.page === '/quote/'), JSON.stringify(none.filter((f) => f.page === '/quote/')));
  const held = score({ ...m, brief: { proof: [{ label: 'review', value: 'Best bread I have ever had.', source: 'a map review' }] } }, RULES).fails;
  assert.equal(held.some((f) => f.id === 'UNSOURCED_QUOTE'), false);
});
