import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFacts } from './facts-check.mjs';
import { loadData } from './lib/brand.mjs';
import { sampleBrand } from './fixtures/sample-brand.mjs';

const data = loadData();
const brand = sampleBrand();
const t = (text, over = {}) => ({ text, system: false, misuse: false, example: false, ...over });
const fails = (texts) => checkFacts(texts, brand, data).filter((f) => f.level === 'fail').map((f) => f.code);

test('labels, the brand name, colour and font names, mood words and sourced copy pass', () => {
  assert.deepEqual(fails([t('Clear space'), t('AURELLE'), t('Aurelle Gold'), t('Gloock'), t('warm metal'), t('A small house for slow weekends.'), t('Business card'), t('Quiet luxury')]), []);
});

test('system values pass: codes, rgb, sizes, weights, ratios, scale steps', () => {
  assert.deepEqual(fails([t('#C9A24B', { system: true }), t('RGB 201, 162, 75', { system: true }), t('44 / 52 px', { system: true }), t('Instrument Sans 400, 700', { system: true }), t('7.78:1', { system: true }), t('950', { system: true }), t('Minimum size 48 px on screen, 12 mm in print.', { system: true })]), []);
});

const cases = [
  ['an invented price', 'From 340 a night', 'FACT_NUMBER'],
  ['a currency', 'Rooms from \u20AC340', 'FACT_CURRENCY'],
  ['a founding claim', 'Est. 1987', 'FACT_SINCE'],
  ['a year', 'Open since 2014', 'FACT_YEAR'],
  ['an email', 'stay@aurelle.example', 'FACT_EMAIL'],
  ['a phone number', '+33 1 23 45 67 89', 'FACT_PHONE'],
  ['a rating', '\u2605\u2605\u2605\u2605\u2605', 'FACT_RATING'],
  ['a sentence nobody said', 'Twelve rooms, one garden, no hurry at all.', 'UNSOURCED'],
  ['a cliche', 'Elevate your stay', 'CLICHE'],
  ['an emoji', 'Welcome \u2728', 'EMOJI'],
];
for (const [name, text, code] of cases) {
  test(`fails ${name} (${code})`, () => assert.ok(fails([t(text)]).includes(code), JSON.stringify(checkFacts([t(text)], brand, data))));
}

test('a founding claim hidden in system text still fails', () => {
  assert.ok(fails([t('Est. 1987', { system: true })]).includes('FACT_SINCE'));
});

test('example lines must be marked as examples', () => {
  assert.ok(fails([t('Your room is ready when you are.')]).includes('EXAMPLE_UNMARKED'));
  assert.deepEqual(fails([t('Your room is ready when you are.', { example: true }), t('Unbeatable deals, book now!', { example: true })]), []);
});

test('a number the site states may appear when it is in copy', () => {
  const b = sampleBrand();
  b.copy.push({ text: 'Baking since 2014', source: 'url', url: 'https://aurelle.example.test/about' });
  assert.deepEqual(checkFacts([t('Baking since 2014')], b, data).filter((f) => f.level === 'fail'), []);
});

test('a cliche inside a marked dont-say example is allowed, and only there', () => {
  const b = sampleBrand();
  b.voice.dontSay[1] = 'The next-gen platform for everything';
  assert.deepEqual(checkFacts([t('The next-gen platform for everything', { example: true })], b, data).filter((f) => f.level === 'fail'), []);
  assert.ok(checkFacts([t('The next-gen platform for everything')], b, data).some((f) => f.code === 'CLICHE'));
});

test('a designer note may explain the system in its own words, but never state a business fact', () => {
  assert.deepEqual(fails([t('The ring comes from the seal: one line, never broken.', { note: true })]), []);
  assert.ok(fails([t('Baking for the neighbourhood since 2014.', { note: true })]).includes('FACT_SINCE'));
  assert.ok(fails([t('A favourite of the street in 2019.', { note: true })]).includes('FACT_YEAR'));
  assert.ok(fails([t('Write to hello@aurelle.example to book.', { note: true })]).includes('FACT_EMAIL'));
  assert.ok(fails([t('A seamless, warm welcome.', { note: true })]).includes('CLICHE'));
});
