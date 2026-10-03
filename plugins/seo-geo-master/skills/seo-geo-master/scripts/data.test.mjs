import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './lib/data.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

test('crawlers.json lists search and training bots with sources', () => {
  const { verified, crawlers } = loadData('crawlers');
  assert.match(verified, ISO);
  const names = crawlers.map(c => c.token);
  for (const t of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'Claude-SearchBot', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'Meta-WebIndexer', 'Meta-ExternalAgent', 'CCBot']) assert.ok(names.includes(t), t);
  for (const c of crawlers) {
    assert.ok(['search', 'training', 'user', 'agent'].includes(c.purpose), c.token);
    assert.ok(['yes', 'may-not', 'no'].includes(c.honorsRobots), c.token);
    assert.equal(typeof c.neededForCitation, 'boolean', c.token);
    assert.match(c.source, /^https:\/\//, c.token);
    assert.ok(Array.isArray(c.alsoMatches), c.token);
  }
  assert.deepEqual(crawlers.find(c => c.token === 'Applebot').alsoMatches, ['Googlebot']);
});

// A real calendar date in YYYY-MM-DD form (2026-02-31 is not one).
const isDate = v => typeof v === 'string' && ISO.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

test('updates.json is a dated timeline: valid dates, an end on or after its start, at most one entry without an end', () => {
  const { verified, updates } = loadData('updates');
  assert.ok(isDate(verified), 'verified');
  assert.ok(updates.length >= 8);
  for (const u of updates) {
    assert.equal(typeof u.name, 'string', JSON.stringify(u));
    assert.ok(isDate(u.start), `${u.name}: start ${u.start}`);
    assert.ok(u.end === null || isDate(u.end), `${u.name}: end ${u.end}`);
    if (u.end !== null) assert.ok(u.start <= u.end, `${u.name}: ends before it starts`);
  }
  // The file's shape, not today's rollout: an update with no end is the one still rolling out, and when it
  // gets its end date there is none, so zero or one entry may have end: null.
  assert.ok(updates.filter(u => u.end === null).length <= 1, 'more than one update is marked as still rolling out');
  assert.equal(new Set(updates.map(u => u.name)).size, updates.length, 'update names are unique');
});

test('the date check used on updates.json refuses impossible and loosely written dates', () => {
  assert.equal(isDate('2026-02-31'), false);
  assert.equal(isDate('2026-9-24'), false);
  assert.equal(isDate('2026-09-24'), true);
});

test('schema-status.json marks FAQPage and HowTo retired and Product active', () => {
  const { types } = loadData('schema-status');
  assert.equal(types.FAQPage.richResult, 'retired');
  assert.equal(types.FAQPage.since, '2026-05-07');
  assert.equal(types.HowTo.richResult, 'retired');
  assert.equal(types.Product.richResult, 'active');
  assert.deepEqual(types.Product.required, [['name'], ['offers', 'review', 'aggregateRating']]);
  assert.equal(types.Restaurant.inherits, 'LocalBusiness');
});

test('data-breaks.json has the impressions logging error and the results-per-page change', () => {
  const { breaks } = loadData('data-breaks');
  const ids = breaks.map(b => b.id);
  assert.ok(ids.includes('gsc-impressions-logging-error'));
  assert.ok(ids.includes('results-per-page-change'));
  const e = breaks.find(b => b.id === 'gsc-impressions-logging-error');
  assert.equal(e.start, '2025-05-13');
  assert.equal(e.end, '2026-04-27');
  assert.deepEqual(e.notAffected, ['clicks']);
});

// A line is flagged when the pattern matches (case-insensitive) and the unless pattern does not.
const flagged = (c, line) => new RegExp(c.pattern, 'i').test(line) && !(c.unless && new RegExp(c.unless, 'i').test(line));

const SENTENCES = {
  'faq-rich-result': { bad: ['Add FAQ schema to win FAQ rich results'], ok: ['FAQ rich results ended for all sites on 2026-05-07'] },
  'howto-rich-result': { bad: ['Use HowTo markup for rich results'], ok: ['HowTo rich results were removed in 2023'] },
  'fid-metric': { bad: ['Improve FID below 100 ms'], ok: ['INP replaced FID on 2024-03-12'] },
  'keyword-density': { bad: ['Keep keyword density at 2%'], ok: ['Google has no notion of keyword density'] },
  'lsi-keywords': { bad: ['Add LSI keywords to every page'], ok: ['There is no such thing as LSI keywords'] },
  'llms-txt-lever': { bad: ['llms.txt is the key lever for AI visibility'], ok: ['Google Search ignores llms.txt'] },
  'dec-2025-eeat': {
    bad: ['E-E-A-T framework per Dec 2025 update extending to all competitive queries', 'The December 2025 update extended E-E-A-T'],
    ok: ['The claim that a December 2025 update extended E-E-A-T is false']
  },
  'google-extended-search': { bad: ['Block Google-Extended to stay out of AI Overviews'], ok: ['Google-Extended does not affect AI Overviews'] },
  'passage-length-rule': { bad: ['Write 134–167 words per passage', 'Answers should be 40-60 words'], ok: ['Google says chunking is not needed'] },
  'buy-links': { bad: ['Buy links from high DR sites'], ok: ['Paid links must carry rel=sponsored'] },
  'lcp-2s': { bad: ['LCP must be under 2.0s'], ok: ['LCP should be 2.5 s or less'] },
  'indexnow-google': { bad: ['IndexNow gets pages into Google faster'], ok: ['Google does not use IndexNow'] },
  'ai-score': { bad: ['AI visibility score: 72/100', 'GEO score of 72 out of 100'], ok: ['Report frequency, never a single AI score'] }
};

test('banned-claims.json has a note and every claim is well formed', () => {
  const { note, claims } = loadData('banned-claims');
  assert.equal(typeof note, 'string');
  assert.ok(claims.length >= 12);
  assert.equal(new Set(claims.map(c => c.id)).size, claims.length, 'claim ids are unique');
  for (const c of claims) { assert.ok(c.why, c.id); assert.equal(typeof c.pattern, 'string', c.id); }
});

test('banned-claims.json: every claim has test sentences, and every test sentence belongs to a claim', () => {
  const { claims } = loadData('banned-claims');
  for (const c of claims) assert.ok(SENTENCES[c.id], `no test sentences for claim ${c.id}`);
  for (const id of Object.keys(SENTENCES)) assert.ok(claims.some(c => c.id === id), `unknown claim id in test: ${id}`);
});

for (const [id, s] of Object.entries(SENTENCES)) {
  test(`banned-claims.json: ${id} flags a bad sentence and passes an honest one`, () => {
    const c = loadData('banned-claims').claims.find(x => x.id === id);
    assert.ok(c, `claim ${id} exists`);
    const problems = [
      ...s.bad.filter(line => !flagged(c, line)).map(line => `should flag: ${line}`),
      ...s.ok.filter(line => flagged(c, line)).map(line => `should allow: ${line}`)
    ];
    assert.deepEqual(problems, []);
  });
}

test('schema-status.json: dated retirements, existing inherits targets, notes and sources', () => {
  const { note, sources, types } = loadData('schema-status');
  assert.equal(typeof note, 'string');
  assert.ok(sources.includes('https://developers.google.com/search/blog/2025/06/simplifying-search-results'));
  assert.equal(types.Dataset.since, '2025-11-05');
  for (const [name, t] of Object.entries(types)) {
    if (t.richResult === 'retired' || t.richResult === 'dataset-search-only') assert.match(t.since, ISO, name);
    if (t.inherits) assert.ok(types[t.inherits], `${name} inherits a missing type: ${t.inherits}`);
  }
});

test('crawlers.json: Perplexity-User and Google-Agent are marked as ignoring robots.txt', () => {
  const { crawlers } = loadData('crawlers');
  for (const t of ['Perplexity-User', 'Google-Agent']) assert.equal(crawlers.find(c => c.token === t).honorsRobots, 'no', t);
});
