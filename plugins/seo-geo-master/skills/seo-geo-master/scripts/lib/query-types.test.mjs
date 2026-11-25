import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUERY_TYPES, typesOf, queryTypes, topPageByQuery } from './query-types.mjs';

test('English queries are tagged by their words', () => {
  assert.deepEqual(typesOf('how to oil an oak table'), ['question']);
  assert.deepEqual(typesOf('Is oak better than walnut'), ['question', 'comparison'], 'case does not matter');
  assert.deepEqual(typesOf('oak vs walnut'), ['comparison']);
  assert.deepEqual(typesOf('oak table price'), ['pricing']);
  assert.deepEqual(typesOf('how much does an oak table cost'), ['question', 'pricing']);
  assert.deepEqual(typesOf('table wobbles fix'), ['problem']);
  assert.deepEqual(typesOf('recommend a table for a small flat'), ['prompt']);
  assert.deepEqual(typesOf('solid oak dining table with bench for six people'), ['long']);
  assert.deepEqual(typesOf('oak table'), []);
  assert.deepEqual(typesOf(''), []);
});

test('English words inside other words are not tagged', () => {
  assert.deepEqual(typesOf('whoever table'), [], '"who" at the start of a longer word');
  assert.deepEqual(typesOf('costume table'), [], '"cost" inside costume');
  assert.deepEqual(typesOf('prefix table'), [], '"fix" inside prefix');
  assert.deepEqual(typesOf('listing table'), [], '"list" at the start of listing');
});

test('Hebrew queries are tagged, with one attached prefix where a word can take one', () => {
  assert.deepEqual(typesOf('מה זה עץ אלון'), ['question']);
  assert.deepEqual(typesOf('איך לשמן שולחן'), ['question']);
  assert.deepEqual(typesOf('האם אלון עדיף על אגוז'), ['question', 'comparison']);
  assert.deepEqual(typesOf('אלון לעומת אגוז'), ['comparison']);
  assert.deepEqual(typesOf('ההבדל בין אלון לאגוז'), ['comparison'], 'ה + הבדל');
  assert.deepEqual(typesOf('שולחן אלון במחיר'), ['pricing'], 'ב + מחיר');
  assert.deepEqual(typesOf('שולחן אלון כמה עולה'), ['pricing']);
  assert.deepEqual(typesOf('שולחן מתנדנד לתקן'), ['problem']);
  assert.deepEqual(typesOf('המגירה לא עובדת'), ['problem']);
  assert.deepEqual(typesOf('תמליץ על שולחן לסלון קטן'), ['prompt']);
});

test('Hebrew words that only start like a question word are not questions', () => {
  assert.deepEqual(typesOf('מים לשולחן'), [], 'מי is not מים');
  assert.deepEqual(typesOf('מהיר שולחן'), [], 'מה is not מהיר');
  assert.deepEqual(typesOf('מחירות'), [], 'not a price word');
  assert.deepEqual(typesOf('צור קשר נגריה'), [], 'a contact query is not a prompt');
});

test('every pattern stays inside what RE2 (Search Console) accepts', () => {
  for (const t of QUERY_TYPES) {
    assert.doesNotMatch(t.regex, /\(\?[=!<]/, `${t.id}: no lookarounds`);
    assert.doesNotMatch(t.regex, /\\[1-9]/, `${t.id}: no backreferences`);
    assert.doesNotMatch(t.regex, /\\b[^|]*[֐-׿]|[֐-׿][^|]*\\b/, `${t.id}: no \\b next to a Hebrew word`);
    assert.doesNotThrow(() => new RegExp(t.regex, 'i'));
  }
});

test('queryTypes totals each type and lists the questions worth answering', () => {
  const rows = [
    { query: 'how to oil oak', impressions: 900, clicks: 9, position: 5 },
    { query: 'what is oak', impressions: 400, clicks: 40, position: 3 },
    { query: 'is oak hard', impressions: 5, clicks: 0, position: 4 },
    { query: 'why oak', impressions: 500, clicks: 0, position: 35 },
    { query: 'oak table price', impressions: 300, clicks: 6, position: 6 },
    { query: 'oak table', impressions: 2000, clicks: 100, position: 2 },
  ];
  const r = queryTypes(rows, { floor: 50, medianOf: p => (p < 5.5 && p >= 3.5 ? 0.05 : null) });
  assert.deepEqual(r.total, { queries: 6, impressions: 4105, clicks: 155 });
  const q = r.types.find(t => t.id === 'question');
  assert.deepEqual([q.queries, q.impressions, q.clicks], [4, 1805, 49]);
  assert.deepEqual(r.questions.map(x => x.query), ['how to oil oak', 'what is oak'], 'under the floor and past position 20 are left out');
  assert.equal(r.questions[0].belowCurve, true, '1% against a 5% median');
  assert.equal(r.questions[1].belowCurve, null, 'no median for its bucket');
});

test('topPageByQuery adds rows for the same page and keeps the page with the most impressions', () => {
  const top = topPageByQuery([
    { query: 'how to oil oak', page: '/care', impressions: 300 },
    { query: 'how to oil oak', page: '/blog', impressions: 500 },
    { query: 'how to oil oak', page: '/care', impressions: 300 },
  ]);
  assert.equal(top.get('how to oil oak'), '/care');
});
