import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSchemaHtml, checkSchemaFacts, collectNodes, valueVisible, isIsoDate, specFor } from './schema-check.mjs';
import { crawlSite, writeCrawl } from './crawl.mjs';
import { extract } from './lib/html.mjs';
import { loadData } from './lib/data.mjs';

const U = 'https://shop.test/p';
const page = (jsonld, body = '<h1>Oak table</h1><p>Solid oak. Price: $59.00. Ships in two weeks.</p>', title = 'Oak table') =>
  `<html><head><title>${title}</title>${[].concat(jsonld).map(j => `<script type="application/ld+json">${typeof j === 'string' ? j : JSON.stringify(j)}</script>`).join('')}</head><body>${body}</body></html>`;
const codes = r => r.findings.map(f => f.code);

test('ratings and prices that are not on the page are flagged', () => {
  const r = checkSchemaHtml(page({ '@context': 'https://schema.org', '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '212' } }), U);
  const notVisible = r.findings.filter(f => f.code === 'VALUE_NOT_VISIBLE');
  assert.deepEqual(notVisible.map(f => [f.evidence.property, f.severity]).sort(), [['price', 'medium'], ['ratingValue', 'high'], ['reviewCount', 'high']]);
  assert.ok(codes(r).includes('PRICE_NO_CURRENCY'));
  assert.ok(!codes(r).includes('REQUIRED_MISSING'));
});

test('a price shown with decimals or currency counts as visible', () => {
  const r = checkSchemaHtml(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD' } }), U);
  assert.ok(!codes(r).includes('VALUE_NOT_VISIBLE'));
  assert.ok(!codes(r).includes('PRICE_NO_CURRENCY'));
});

test('retired rich results are informational, with the date', () => {
  const r = checkSchemaHtml(page({ '@type': 'FAQPage', mainEntity: [] }), U);
  const f = r.findings.find(x => x.code === 'RICH_RESULT_RETIRED');
  assert.equal(f.severity, 'info');
  assert.match(f.message, /2026-05-07/);
});

test('self-serving business reviews, dangling ids and bad dates', () => {
  assert.ok(codes(checkSchemaHtml(page({ '@type': 'Organization', name: 'Shop', aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: 10 } }), U)).includes('SELF_SERVING_REVIEW'));
  const graph = checkSchemaHtml(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': '#org', name: 'Shop' }, { '@type': 'WebSite', publisher: { '@id': '#org' } }, { '@type': 'WebPage', about: { '@id': '#missing' } }] }), U);
  const dangling = graph.findings.filter(f => f.code === 'DANGLING_ID');
  assert.equal(dangling.length, 1);
  assert.match(dangling[0].message, /#missing/);
  const dates = checkSchemaHtml(page({ '@type': 'Article', headline: 'x', datePublished: 1696118400, dateModified: '2026-09-01' }), U);
  assert.equal(dates.findings.filter(f => f.code === 'INVALID_DATE').length, 1);
});

test('missing JSON-LD, broken JSON-LD and required properties', () => {
  assert.ok(codes(checkSchemaHtml('<html><head><title>x</title></head><body>hi</body></html>', U)).includes('NO_JSONLD_STATIC'));
  assert.ok(codes(checkSchemaHtml(page('{"@type": "Product", "name": '), U)).includes('JSONLD_PARSE_ERROR'));
  const product = checkSchemaHtml(page({ '@type': 'Product', name: 'Oak table' }), U);
  assert.match(product.findings.find(f => f.code === 'REQUIRED_MISSING').message, /offers or review or aggregateRating/);
  const restaurant = checkSchemaHtml(page({ '@type': 'Restaurant', name: 'Cafe' }, '<p>Cafe</p>'), U);
  assert.match(restaurant.findings.find(f => f.code === 'REQUIRED_MISSING').message, /address/);
});

test('helpers', () => {
  assert.equal(valueVisible('4.8', 'rated 4.8 out of 5'), true);
  assert.equal(valueVisible('4.8', 'rated 4.85 out of 5'), false);
  assert.equal(valueVisible(1234, 'over 1,234 reviews'), true);
  assert.equal(valueVisible('Oak Table', 'the oak table is here'), true);
  assert.equal(isIsoDate('2026-10-02'), true);
  assert.equal(isIsoDate('2026-10-02T10:00:00+03:00'), true);
  assert.equal(isIsoDate('02/10/2026'), false);
  assert.equal(collectNodes({ '@graph': [{ '@type': 'A', x: { '@type': 'B' } }] }).length, 2);
  assert.equal(specFor('Restaurant', loadData('schema-status')).required[1][0], 'address');
});

// Beyond the brief's tests.

test('no JSON-LD is reported as not detected in static HTML, never as "no schema"', () => {
  const r = checkSchemaHtml('<html><head><title>x</title></head><body>hi</body></html>', U);
  const f = r.findings.find(x => x.code === 'NO_JSONLD_STATIC');
  assert.match(f.message, /not detected in static HTML; it may be injected by JavaScript/);
  assert.doesNotMatch(JSON.stringify(r.findings), /no schema/i);
  assert.equal(f.severity, 'info');
  const micro = checkSchemaHtml('<html><head><title>x</title></head><body><div itemscope itemtype="https://schema.org/Product">hi</div></body></html>', U);
  assert.ok(codes(micro).includes('MICRODATA_PRESENT'));
});

test('JSON-LD that only parses leniently is reported, and strict JSON is not', () => {
  const lenient = checkSchemaHtml(page('{"@type": "Article", "headline": "x", }'), U);
  assert.ok(codes(lenient).includes('JSONLD_NOT_STRICT'));
  assert.ok(!codes(lenient).includes('JSONLD_PARSE_ERROR'));
  assert.ok(!codes(checkSchemaHtml(page({ '@type': 'Article', headline: 'x' }), U)).includes('JSONLD_NOT_STRICT'));
});

test('a retirement date is given once, and Dataset is called what it is', () => {
  const message = type => checkSchemaHtml(page({ '@type': type }), U).findings.find(f => f.code === 'RICH_RESULT_RETIRED').message;
  assert.equal(message('FAQPage').match(/2026-05-07/g).length, 1); // the note already holds the date
  // Changed assertions (were /since 2023-09-13/ and /Dataset Search only.*2025-11-05/): no "since" next to a note that says "removed in 2023".
  assert.match(message('HowTo'), /removed in 2023 \(2023-09-13\)/);
  assert.doesNotMatch(message('HowTo'), /since/);
  assert.equal(message('HowTo').match(/2023/g).length, 2);
  assert.match(message('Dataset'), /no rich result in Google Search; it is used by Dataset Search/);
  assert.match(message('Dataset'), /2025-11-05/);
  assert.doesNotMatch(message('Dataset'), /since/);
});

test('collectNodes skips @context and reads references, arrays and a top-level list', () => {
  const nodes = collectNodes([{ '@context': { name: { '@id': 'http://schema.org/name', '@type': '@id' } }, '@type': 'A', ref: { '@id': 'x' } }, { '@type': 'B' }]);
  assert.deepEqual(nodes.map(n => n['@type'] || n['@id']), ['A', 'x', 'B']);
});

test('collectNodes is bounded in depth, node count and total size, and says when it stopped', () => {
  let deep = { '@type': 'Leaf' };
  for (let i = 0; i < 200000; i++) deep = { '@type': 'Level', next: deep };
  let limits = {};
  const a = collectNodes(deep, [], limits);
  assert.equal(limits.capped, 'depth');
  assert.ok(a.length > 0 && a.length <= 200, `${a.length}`);
  const arrays = JSON.parse('['.repeat(100000) + '{"@type":"X"}' + ']'.repeat(100000));
  limits = {};
  assert.equal(collectNodes(arrays, [], limits).length, 0);
  assert.equal(limits.capped, 'depth');

  limits = {};
  const wide = collectNodes({ '@graph': Array.from({ length: 5000 }, (_, i) => ({ '@type': 'Thing', name: `n${i}` })) }, [], limits);
  assert.equal(wide.length, 2000);
  assert.equal(limits.capped, 'nodes');

  limits = {};
  const t0 = performance.now();
  assert.equal(collectNodes({ numbers: new Array(3000000).fill(1) }, [], limits).length, 0);
  assert.equal(limits.capped, 'size');
  assert.ok(performance.now() - t0 < 2000);

  limits = {};
  collectNodes({ '@type': 'A', x: { '@type': 'B' } }, [], limits);
  assert.equal(limits.capped ?? null, null);
});

test('hostile JSON-LD is checked in bounded time and a finding says it was cut short', () => {
  const t0 = performance.now();
  const deepText = '{"@type":"Level","next":'.repeat(100000) + '1' + '}'.repeat(100000);
  const r = checkSchemaHtml(page(deepText), U);
  assert.ok(codes(r).includes('SCHEMA_LIMIT'), JSON.stringify(codes(r)));
  const wide = checkSchemaHtml(page({ '@graph': Array.from({ length: 4000 }, (_, i) => ({ '@type': 'Product', name: `Thing ${i}`, offers: { '@type': 'Offer', price: String(1000 + i), priceCurrency: 'USD' } })) }), U);
  assert.ok(codes(wide).includes('SCHEMA_LIMIT'));
  assert.ok(wide.nodes <= 2000);
  assert.ok(wide.findings.length <= 300, `${wide.findings.length}`);
  assert.ok(performance.now() - t0 < 15000);
  // Nothing in the result is a deep structure, so it serializes.
  assert.ok(JSON.stringify(r).length < 100000);
});

test('types that are not names do not reach the status table', () => {
  const status = loadData('schema-status');
  for (const t of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 5, null, undefined, {}]) assert.equal(specFor(t, status), null, String(t));
  const r = checkSchemaHtml(page([{ '@type': 'constructor', name: 'x' }, { '@type': ['__proto__', 5, null, { a: 1 }], name: 'y' }, { '@type': { a: 1 } }, { '@type': 7, '@id': { x: 1 } }]), U);
  assert.ok(!codes(r).includes('RICH_RESULT_RETIRED'));
  assert.ok(!codes(r).includes('REQUIRED_MISSING'));
});

test('schema.org prefixed types are read as the bare type', () => {
  assert.ok(codes(checkSchemaHtml(page({ '@type': 'https://schema.org/FAQPage' }), U)).includes('RICH_RESULT_RETIRED'));
  assert.ok(codes(checkSchemaHtml(page({ '@type': 'schema:Restaurant', name: 'Cafe' }, '<p>Cafe</p>'), U)).includes('REQUIRED_MISSING'));
});

test('an @id written two ways is the same id, and a reference is reported once', () => {
  const same = checkSchemaHtml(page({ '@graph': [{ '@type': 'Organization', '@id': 'https://shop.test/p#org', name: 'Shop' }, { '@type': 'WebSite', publisher: { '@id': '#org' } }] }), U);
  assert.ok(!codes(same).includes('DANGLING_ID'));
  const twice = checkSchemaHtml(page({ '@graph': [{ '@type': 'WebSite', publisher: { '@id': '#gone' }, copyrightHolder: { '@id': '#gone' } }, { '@type': 'WebPage', about: { '@id': '#gone' } }] }), U);
  assert.equal(twice.findings.filter(f => f.code === 'DANGLING_ID').length, 1);
});

test('valueVisible reads numbers as numbers: forms, separators and longer numbers', () => {
  const yes = (v, t) => assert.equal(valueVisible(v, t), true, `${JSON.stringify(v)} in "${t}"`);
  const no = (v, t) => assert.equal(valueVisible(v, t), false, `${JSON.stringify(v)} in "${t}"`);
  yes(59, 'now $59.00 only'); yes('59', 'now 59 only'); yes('59.0', 'price 59'); yes(59, 'price: 59.');
  no(59, 'now $59.99 only'); no(59, 'item 159 and 590 and 5.9'); no('4.8', 'version 4.8.1'); no('4.8', 'rated 4.85'); no('212', 'about 2,212 reviews');
  yes('4.80', 'rated 4.8 of 5'); yes('4.8', 'rated 4.80 of 5'); yes(4.8, 'rated 4.8/5'); yes('4.8', '(4.8)');
  yes(1234, 'over 1,234 reviews'); yes('1,234', 'over 1234 reviews'); yes(1234.5, 'only 1,234.50'); yes(1234.5, 'nur 1.234,50 eur');
  yes(1234, 'only 1 234'); yes(1234, "only 1'234"); yes('49,90', 'only 49,90 eur'); yes(49.9, 'only 49,90 eur'); yes(49.9, 'only 49.90');
  yes(1234567, '1,234,567 views'); yes(1234567, '1.234.567 views'); yes(1234567, '1 234 567 views');
  no(1234, 'only 1,234,567'); no(1234, 'only 12,34'); no(12, 'only 1,2');
  yes(4.8333333, 'rated 4.83 of 5'); yes(4.8333333, 'rated 4.8 of 5');
  yes(0, 'free: 0.00'); no(5, 'abc'); no('4.8', '');
  yes('Tom &amp; Jerry', 'tom & jerry box set'); yes('Oak   Table', 'the oak table'); no('Oak Table', 'the walnut table');
  yes('$59', 'now $59 only'); no('$59', 'now 59 only');
});

test('valueVisible stays linear on hostile text and hostile values', () => {
  const t0 = performance.now();
  const digits = '1'.repeat(3000000);
  assert.equal(valueVisible('11', digits), false);
  assert.equal(valueVisible('1,111', `${digits} 1,111`), true);
  const groups = '1 '.repeat(1500000);
  assert.equal(valueVisible('2', groups), false);
  const commas = '1,'.repeat(1500000);
  assert.equal(valueVisible('7', commas), false);
  assert.equal(valueVisible('9'.repeat(5000), `a ${digits}`), false);
  assert.equal(valueVisible('(a+)+$'.repeat(2000), 'a'.repeat(100000)), false);
  assert.equal(valueVisible(`${'a'.repeat(5000)}b`, `${'a'.repeat(100000)}b`), true);
  assert.ok(performance.now() - t0 < 8000, `${performance.now() - t0} ms`);
});

test('isIsoDate checks the calendar, not only the shape', () => {
  for (const v of ['2026-10-02', '2024-02-29', '2026-10-02T10:00', '2026-10-02T10:00:00', '2026-10-02T10:00:00.123Z', '2026-10-02 10:00:00+0300', '2026-12-31T23:59:59-11:30']) assert.equal(isIsoDate(v), true, v);
  for (const v of ['2026-02-30', '2026-13-01', '2026-00-10', '2025-02-29', '2026-10-32', '2026-10-02T24:00:00Z', '2026-10-02T10:60:00Z', '2026-10-02T10:00:00+25:00', '2026-10-02T', '2026-1-2', '', null, 20261002, {}, ['2026-10-02']]) assert.equal(isIsoDate(v), false, JSON.stringify(v));
  assert.equal(isIsoDate('2026-10-02'.padEnd(5000, '0')), false);
});

test('dates may be typed values, and a bad value is described without being copied whole', () => {
  const ok = checkSchemaHtml(page({ '@type': 'Article', headline: 'x', datePublished: { '@type': 'Date', '@value': '2026-10-02' } }), U);
  assert.ok(!codes(ok).includes('INVALID_DATE'));
  const huge = checkSchemaHtml(page({ '@type': 'Article', headline: 'x', datePublished: 'x'.repeat(5000), dateModified: { a: { b: { c: 1 } } }, dateCreated: 1, endDate: ['2026-10-02'], copyrightYear: 'x' }), U);
  const bad = huge.findings.filter(f => f.code === 'INVALID_DATE');
  assert.equal(bad.length, 4); // datePublished, dateModified, dateCreated, endDate (copyrightYear is not a date key)
  for (const f of bad) assert.ok(f.message.length < 300, f.message.length);
});

test('ratings: out of range, not a number, and a custom scale', () => {
  const run = rating => codes(checkSchemaHtml(page({ '@type': 'AggregateRating', itemReviewed: { '@type': 'Thing', name: 'x' }, reviewCount: 5, ...rating }, '<p>5 stars 6 and 4.5 and 8 and 0 and five</p>'), U));
  assert.ok(run({ ratingValue: 6 }).includes('RATING_OUT_OF_RANGE'));
  assert.ok(run({ ratingValue: 0 }).includes('RATING_OUT_OF_RANGE'));
  assert.ok(!run({ ratingValue: 4.5 }).includes('RATING_OUT_OF_RANGE'));
  assert.ok(!run({ ratingValue: 8, bestRating: 10 }).includes('RATING_OUT_OF_RANGE'));
  assert.ok(!run({ ratingValue: 0, worstRating: 0 }).includes('RATING_OUT_OF_RANGE'));
  const word = checkSchemaHtml(page({ '@type': 'AggregateRating', ratingValue: 'five', reviewCount: 5 }, '<p>5 stars five</p>'), U);
  const f = word.findings.find(x => x.code === 'RATING_OUT_OF_RANGE');
  assert.match(f.message, /not a number/);
  // A single review's rating is checked too.
  assert.ok(codes(checkSchemaHtml(page({ '@type': 'Review', author: 'a', reviewRating: { '@type': 'Rating', ratingValue: 9 } }, '<p>9</p>'), U)).includes('RATING_OUT_OF_RANGE'));
});

test('a price without a currency: offers, aggregate offers and price specifications', () => {
  const body = '<p>Price 10 and 20 and 30</p>';
  const n = j => codes(checkSchemaHtml(page(j, body), U)).filter(c => c === 'PRICE_NO_CURRENCY').length;
  assert.equal(n({ '@type': 'AggregateOffer', lowPrice: 10 }), 1);
  assert.equal(n({ '@type': 'UnitPriceSpecification', price: 10 }), 1);
  assert.equal(n({ '@type': 'Offer', priceSpecification: { '@type': 'PriceSpecification', price: 10, priceCurrency: 'USD' } }), 0);
  assert.equal(n({ '@type': 'Offer', price: 0 }), 1);
});

test('prices and ratings are checked against the page body; the product name may also come from the title', () => {
  const product = { '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '490', priceCurrency: 'ILS' } };
  const titleOnly = checkSchemaHtml(page(product, '<h1>Oak table</h1><p>Price 5,900.</p>', 'Oak table from 490'), U);
  assert.ok(titleOnly.findings.some(f => f.code === 'VALUE_NOT_VISIBLE' && f.evidence.property === 'price'));
  const nameInTitle = checkSchemaHtml(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD' } }, '<p>Price: $59.00</p>', 'Oak table | Shop'), U);
  assert.ok(!codes(nameInTitle).includes('VALUE_NOT_VISIBLE'));
  const wrongName = checkSchemaHtml(page({ '@type': 'Product', name: 'Walnut chair', offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD' } }), U);
  const f = wrongName.findings.find(x => x.code === 'VALUE_NOT_VISIBLE');
  assert.deepEqual([f.evidence.property, f.severity], ['name', 'low']);
});

test('text in scripts, templates and comments is not visible text', () => {
  const body = '<p>Oak table</p><script>var price = "49.00";</script><template><span>49.00</span></template><!-- 49.00 --><noscript>49.00</noscript>';
  const r = checkSchemaHtml(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49.00', priceCurrency: 'USD' } }, body), U);
  assert.ok(r.findings.some(f => f.code === 'VALUE_NOT_VISIBLE' && f.evidence.property === 'price'));
});

test('when the page text may be incomplete a missing value is unverified, not missing', () => {
  const jsonld = { '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49', priceCurrency: 'USD' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '212' } };
  const facts = extract(page(jsonld, '<h1>Oak table</h1><p>Price: $59.00, rated 4.8 stars.</p>'), U);
  const complete = checkSchemaFacts(facts, U);
  assert.deepEqual(complete.findings.filter(f => f.code === 'VALUE_NOT_VISIBLE').map(f => f.evidence.property).sort(), ['price', 'reviewCount']);
  for (const flagged of [{ ...facts, textTruncated: true }, { ...facts, appShell: true }]) {
    const r = checkSchemaFacts(flagged, U);
    assert.ok(!codes(r).includes('VALUE_NOT_VISIBLE'), JSON.stringify(codes(r)));
    const un = r.findings.filter(f => f.code === 'VALUE_UNVERIFIED');
    assert.deepEqual(un.map(f => f.evidence.property).sort(), ['price', 'reviewCount']); // the rating is in the text that was kept
    assert.deepEqual([un[0].severity, un[0].label], ['info', 'H']);
  }
  assert.match(checkSchemaFacts({ ...facts, textTruncated: true }, U).findings.find(f => f.code === 'VALUE_UNVERIFIED').message, /cut off|kept|truncat/i);
  assert.match(checkSchemaFacts({ ...facts, appShell: true }, U).findings.find(f => f.code === 'VALUE_UNVERIFIED').message, /JavaScript/);
});

test('repeated findings are listed once per page, and a flood of one kind is capped and said', () => {
  const offers = Array.from({ length: 150 }, (_, i) => ({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: String(7000 + i), priceCurrency: 'USD' } }));
  const r = checkSchemaHtml(page({ '@graph': offers }), U);
  const n = r.findings.filter(f => f.code === 'VALUE_NOT_VISIBLE').length;
  assert.equal(n, 50);
  assert.ok(codes(r).includes('SCHEMA_LIMIT'));
  const same = checkSchemaHtml(page({ '@graph': [{ '@type': 'Offer', price: 1 }, { '@type': 'Offer', price: 1 }] }), U);
  assert.equal(same.findings.filter(f => f.code === 'PRICE_NO_CURRENCY').length, 1);
});

test('items list every typed node with its rich result status', () => {
  const r = checkSchemaHtml(page([{ '@type': 'FAQPage', mainEntity: [] }, { '@type': 'Product', name: 'Oak table' }, { '@type': ['Thing', 'Restaurant'], name: 'Cafe' }, { '@id': 'x' }]), U);
  const byType = Object.fromEntries(r.items.map(i => [i.type, i]));
  assert.equal(byType.FAQPage.richResult, 'retired');
  assert.equal(byType.Product.richResult, 'active');
  assert.deepEqual(byType.Product.missing, ['offers or review or aggregateRating']);
  assert.equal(byType.Thing.richResult, 'unknown');
  assert.equal(byType.Restaurant.richResult, 'active');
  assert.equal(r.items.length, 4);
  assert.equal(r.url, U);
  assert.equal(r.nodes, 4);
});

// The command line.

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema-check.mjs');
const run = (args, opts = {}) => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 60000, ...opts }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'schema-'));

async function withServer(routes, fn) {
  const srv = http.createServer((req, res) => {
    const r = routes[req.url];
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<title>Not found</title>'); }
    res.writeHead(r[0], { 'content-type': r[1] });
    res.end(r[2]);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { await new Promise(r => { srv.close(r); srv.closeAllConnections?.(); }); }
}

test('--help prints usage and exits 0; no target is a usage error', async () => {
  const h = await run(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Usage: node schema-check\.mjs/);
  assert.match(h.stdout, /--from-crawl/);
  assert.match(h.stdout, /static HTML|raw HTML/);
  const none = await run([]);
  assert.equal(none.code, 1);
  assert.match(none.stdout, /Usage/);
  const typo = await run(['--form-crawl', 'x.json']);
  assert.equal(typo.code, 1);
  assert.match(typo.stderr, /Unknown option --form-crawl/);
});

test('a file is checked, JSON and Markdown are written, and findings do not change the exit code', async () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'p.html');
    fs.writeFileSync(file, page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49' } }));
    const out = path.join(dir, 'out');
    const r = await run([file, '--out', out]);
    assert.equal(r.code, 0, r.stderr);
    const json = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
    assert.equal(json.length, 1);
    assert.ok(json[0].findings.some(f => f.code === 'VALUE_NOT_VISIBLE'));
    const md = fs.readFileSync(path.join(out, 'schema.md'), 'utf8');
    assert.match(md, /VALUE_NOT_VISIBLE/);
    assert.match(md, /Raw HTML only/);
    assert.match(r.stdout, /findings/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a file argument that Git Bash rewrote from a /path is refused, and a missing file is said', async () => {
  const r = await run(['C:/Program Files/Git/tmp/page.html']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /MSYS_NO_PATHCONV/);
  const gone = await run([path.join(os.tmpdir(), 'no-such-schema-check-file.html')]);
  assert.equal(gone.code, 1);
  assert.match(gone.stderr, /File not found/);
  const rewritten = await run(['C:/Users/nobody-here/AppData/Local/Temp/x.html']); // what /tmp/x.html becomes in Git Bash
  assert.equal(rewritten.code, 1);
  assert.match(rewritten.stderr, /MSYS_NO_PATHCONV/);
  const host = await run(['example.com/page']);
  assert.equal(host.code, 1);
  assert.match(host.stderr, /https:\/\//);
  const scheme = await run(['ftp://example.com/p']);
  assert.equal(scheme.code, 1);
});

test('a local URL is fetched; a failed or non-HTML answer is an error with exit 2', async () => {
  const dir = tmp();
  try {
    await withServer({
      '/ok': [200, 'text/html; charset=utf-8', page({ '@type': 'FAQPage', mainEntity: [] })],
      '/gone': [404, 'text/html', '<title>x</title>'],
      '/data': [200, 'application/json', '{"a":1}'],
    }, async o => {
      const ok = await run([`${o}/ok`, '--out', dir]);
      assert.equal(ok.code, 0, ok.stderr);
      assert.match(fs.readFileSync(path.join(dir, 'schema.md'), 'utf8'), /RICH_RESULT_RETIRED/);
      const gone = await run([`${o}/gone`, '--out', dir]);
      assert.equal(gone.code, 2);
      assert.match(gone.stderr, /HTTP 404/);
      const data = await run([`${o}/data`, '--out', dir]);
      assert.equal(data.code, 2);
      assert.match(data.stderr, /not an HTML page/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--from-crawl: a value past the part of the text the crawl kept is unverified, one inside it is judged, and pages merge', async () => {
  const dir = tmp();
  const filler = `<p>${'Solid wood tables made by hand with oil finishes. '.repeat(600)}</p>`; // about 29,000 characters
  const product = (price, rating) => ({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price, priceCurrency: 'USD' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: '212' } });
  try {
    await withServer({
      '/robots.txt': [404, 'text/plain', ''],
      '/': [200, 'text/html', page([], '<a href="/long">long</a><a href="/short">short</a><a href="/short2">short2</a>', 'Home')],
      // The rating is in the first 20,000 characters; the price and the review count come after them.
      '/long': [200, 'text/html', page(product('59', '4.8'), `<h1>Oak table, rated 4.8</h1>${filler}<p>Price: $59.00 with 212 reviews</p>`)],
      '/short': [200, 'text/html', page(product('49', '4.9'), '<h1>Oak table</h1><p>Price: $59.00 rated 4.7 with 212 reviews</p>')],
      '/short2': [200, 'text/html', page(product('49', '4.9'), '<h1>Oak table</h1><p>Price: $59.00 rated 4.7 with 212 reviews</p>')],
    }, async o => {
      const res = await crawlSite({ start: `${o}/`, max: 10, delayMs: 0 });
      assert.equal(res.pages.find(p => p.url.endsWith('/long')).facts.textTruncated, true);
      writeCrawl(dir, res);
      const out = path.join(dir, 'schema');
      const r = await run(['--from-crawl', path.join(dir, 'crawl.json'), '--out', out]);
      assert.equal(r.code, 0, r.stderr);
      const json = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
      const of = suffix => json.find(x => x.url.endsWith(suffix));
      const long = of('/long').findings;
      assert.ok(!long.some(f => f.code === 'VALUE_NOT_VISIBLE'), JSON.stringify(long));
      const un = long.filter(f => f.code === 'VALUE_UNVERIFIED');
      assert.deepEqual(un.map(f => f.evidence.property).sort(), ['price', 'reviewCount']); // the rating sits in the kept text and is judged visible
      assert.deepEqual([un[0].severity, un[0].label], ['info', 'H']);
      assert.deepEqual(of('/short').findings.filter(f => f.code === 'VALUE_NOT_VISIBLE').map(f => f.evidence.property).sort(), ['price', 'ratingValue']);
      assert.ok(!of('/short').findings.some(f => f.code === 'VALUE_UNVERIFIED'));
      const md = fs.readFileSync(path.join(out, 'schema.md'), 'utf8');
      assert.equal((md.match(/VALUE_NOT_VISIBLE/g) || []).length, 2); // price and ratingValue, each once for the two short pages
      assert.ok(md.includes(`${o}/short`) && md.includes(`${o}/short2`));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--from-crawl: a truncated download is judged like a truncated text, and bad input is said', async () => {
  const dir = tmp();
  try {
    const facts = extract(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49', priceCurrency: 'USD' } }), U);
    const file = path.join(dir, 'crawl.json');
    fs.writeFileSync(file, JSON.stringify({ pages: [{ url: U, finalUrl: U, status: 200, truncated: true, facts }, { url: 'https://shop.test/x', status: 404 }] }));
    const out = path.join(dir, 'out');
    assert.equal((await run(['--from-crawl', file, '--out', out])).code, 0);
    const json = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
    assert.equal(json.length, 1);
    assert.ok(json[0].findings.some(f => f.code === 'VALUE_UNVERIFIED'));
    assert.ok(!json[0].findings.some(f => f.code === 'VALUE_NOT_VISIBLE'));

    const missing = await run(['--from-crawl', path.join(dir, 'nope.json')]);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /nope\.json/);
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
    const bad = await run(['--from-crawl', path.join(dir, 'bad.json')]);
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /not valid JSON|crawl\.json/);
    fs.writeFileSync(path.join(dir, 'empty.json'), '{"pages": 5}');
    assert.equal((await run(['--from-crawl', path.join(dir, 'empty.json')])).code, 1);
    const both = await run(['--from-crawl', file, 'page.html']);
    assert.equal(both.code, 1);
    assert.match(both.stderr, /not both|either/);
    assert.equal((await run(['--from-crawl'])).code, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Review round 1.

const productLd = (extra = {}) => ({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: 212 }, ...extra });
const shopBody = inner => `<h1>Oak table</h1><p>Price: $59.00</p>${inner}`;
const notVisible = r => r.findings.filter(f => f.code === 'VALUE_NOT_VISIBLE').map(f => [f.evidence.property, f.severity, f.label]).sort();
const unverified = r => r.findings.filter(f => f.code === 'VALUE_UNVERIFIED').map(f => f.evidence.property).sort();

test('a rating that is not in the text is high only when nothing on the page points to a rating', () => {
  // Neither the rating nor the count, no stars: certain.
  const fake = checkSchemaHtml(page(productLd(), shopBody('<p>Great table.</p>')), U);
  assert.deepEqual(notVisible(fake), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']]);
  for (const f of fake.findings.filter(x => x.code === 'VALUE_NOT_VISIBLE')) {
    assert.match(f.message, /in the static HTML/);
    assert.match(f.message, /rendered page/);
    assert.match(f.message, /JavaScript/);
  }
  // Stars drawn as an element with an aria-label, and the count as text.
  const aria = checkSchemaHtml(page(productLd(), shopBody('<span role="img" aria-label="Rated 4.8 out of 5 stars"></span> (212 reviews)')), U);
  assert.deepEqual(notVisible(aria), [['ratingValue', 'medium', 'H']]);
  assert.match(aria.findings.find(f => f.code === 'VALUE_NOT_VISIBLE').message, /in the static HTML.*rendered page/);
  // Star glyphs, and the count as text.
  for (const glyphs of ['\u2605\u2605\u2605\u2605\u2606', '\u2b50\u2b50\u2b50\u2b50\u2b50']) {
    const r = checkSchemaHtml(page(productLd(), shopBody(`<p>${glyphs} (212 reviews)</p>`)), U);
    assert.deepEqual(notVisible(r), [['ratingValue', 'medium', 'H']], glyphs);
  }
  // The count is the only number on the page.
  const countOnly = checkSchemaHtml(page(productLd(), shopBody('<p>212 reviews</p>')), U);
  assert.deepEqual(notVisible(countOnly), [['ratingValue', 'medium', 'H']]);
  // The rating is the only number on the page.
  const ratingOnly = checkSchemaHtml(page(productLd(), shopBody('<p>Rated 4.8 out of 5</p>')), U);
  assert.deepEqual(notVisible(ratingOnly), [['reviewCount', 'medium', 'H']]);
});

test('a star signal alone (aria-label, title or alt, or glyphs) makes both numbers a hypothesis; crawl facts see glyphs and image alt text', () => {
  for (const stars of ['<div class="r" aria-label="4.8 stars"></div>', '<span title="Customer rating"></span>', '<img src="/s.png" alt="Five stars">', '<p>\u2605\u2605\u2605\u2605\u2606</p>']) {
    const r = checkSchemaHtml(page(productLd(), shopBody(stars)), U);
    assert.deepEqual(notVisible(r), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']], stars);
  }
  // A label that only contains the letters "rating" inside another word is not a star signal.
  const word = checkSchemaHtml(page(productLd(), shopBody('<span title="Operating hours"></span>')), U);
  assert.deepEqual(notVisible(word), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']]);
  // A crawl keeps the text and the alt text of images only.
  const alt = checkSchemaFacts(extract(page(productLd(), shopBody('<img src="/s.png" alt="Rated 4.8 out of 5 stars">')), U), U);
  assert.deepEqual(notVisible(alt), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']]);
  const glyphs = checkSchemaFacts(extract(page(productLd(), shopBody('<p>\u2605\u2605\u2605\u2605\u2606</p>')), U), U);
  assert.deepEqual(notVisible(glyphs), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']]);
  // extract() says whether an aria-label, title or alt mentioned stars, so facts from a crawl rule it out when starSignal is false.
  const crawled = extract(page(productLd(), shopBody('<p>Great table.</p>')), U);
  assert.equal(crawled.starSignal, false);
  assert.deepEqual(notVisible(checkSchemaFacts(crawled, U)), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']]);
  const labelled = extract(page(productLd(), shopBody('<span role="img" aria-label="Rated 4.8 out of 5 stars"></span>')), U);
  assert.equal(labelled.starSignal, true);
  assert.deepEqual(notVisible(checkSchemaFacts(labelled, U)), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']]);
  // Facts without the field (a crawl.json an older crawl.mjs wrote) cannot rule out an aria-label: a hypothesis, with the reason. Only starSignal: false is certain.
  const { starSignal: _dropped, ...legacy } = crawled;
  const unknown = checkSchemaFacts(legacy, U);
  assert.deepEqual(notVisible(unknown), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']]);
  assert.match(unknown.findings.find(f => f.code === 'VALUE_NOT_VISIBLE').message, /aria-label or title/);
  assert.deepEqual(notVisible(checkSchemaFacts({ ...crawled, starSignal: false }, U)), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']]);
  assert.deepEqual(notVisible(checkSchemaFacts({ ...crawled, starSignal: true }, U)), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']]);
});

test('--from-crawl reads starSignal from crawl.json: a fake rating is high when nothing points to a rating, medium with an aria-label, and a crawl.json without the field stays a hypothesis', async () => {
  const dir = tmp();
  try {
    await withServer({
      '/robots.txt': [404, 'text/plain', ''],
      '/': [200, 'text/html', page([], '<a href="/fake">fake</a><a href="/aria">aria</a>', 'Home')],
      '/fake': [200, 'text/html', page(productLd(), shopBody('<p>Great table.</p>'))],
      '/aria': [200, 'text/html', page(productLd(), shopBody('<span role="img" aria-label="Rated 4.8 out of 5 stars"></span><p>Great table.</p>'))],
    }, async o => {
      const res = await crawlSite({ start: `${o}/`, max: 10, delayMs: 0 });
      writeCrawl(dir, res);
      const file = path.join(dir, 'crawl.json');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      const verdicts = async (crawlFile, name) => {
        const out = path.join(dir, name);
        const r = await run(['--from-crawl', crawlFile, '--out', out]);
        assert.equal(r.code, 0, r.stderr);
        const json = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
        return suffix => notVisible(json.find(x => x.url.endsWith(suffix)));
      };
      const HIGH = [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']];
      const MEDIUM = [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']];
      assert.equal(saved.pages.find(p => p.url.endsWith('/fake')).facts.starSignal, false);
      const now = await verdicts(file, 'now');
      assert.deepEqual(now('/fake'), HIGH);
      assert.deepEqual(now('/aria'), MEDIUM);
      // The same crawl as an older crawl.mjs wrote it: no field, so nothing is certain.
      for (const p of saved.pages) if (p.facts) delete p.facts.starSignal;
      const legacyFile = path.join(dir, 'legacy.json');
      fs.writeFileSync(legacyFile, JSON.stringify(saved));
      const old = await verdicts(legacyFile, 'old');
      assert.deepEqual(old('/fake'), MEDIUM);
      assert.deepEqual(old('/aria'), MEDIUM);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a count shown abbreviated (1.2K, 12K+, 1.2M, 1.2 thousand in Hebrew) within 5 percent is not a fake count', () => {
  const run = (text, count, rating = '4.8') => checkSchemaHtml(page(productLd({ aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: count } }), shopBody(`<p>${text}</p>`)), U);
  // The brief's example: the rating is there and the count is rounded.
  const same = run('4.8 (1.2K reviews)', 1243);
  assert.deepEqual(notVisible(same), [['reviewCount', 'medium', 'H']]);
  assert.match(same.findings.find(f => f.code === 'VALUE_NOT_VISIBLE').message, /1\.2k/i);
  // Nothing else on the page: the abbreviated count is what keeps the rating from being high.
  const forms = [['(1.2K reviews)', 1243], ['(12K+ reviews)', 12345], ['(1.2M reviews)', 1243000], ['(1,2K reviews)', 1243], ['(1.2 k reviews)', 1243], ['(1.2 \u05d0\u05dc\u05e3 \u05d1\u05d9\u05e7\u05d5\u05e8\u05d5\u05ea)', 1243], ['(1.2 \u05de\u05d9\u05dc\u05d9\u05d5\u05df)', 1243000]];
  for (const [text, count] of forms) assert.deepEqual(notVisible(run(text, count)), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']], text);
  // Too far from the markup, or not an abbreviation: still certain.
  for (const [text, count] of [['(1.2K reviews)', 1400], ['(12K+ reviews)', 13500], ['(1.2 km away)', 1243], ['(1.2 min)', 1243]]) assert.deepEqual(notVisible(run(text, count)), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']], text);
});

test('a price of 0 is never not visible: free in four languages or a 0 on the page is fine, otherwise it is unverified', () => {
  const withText = (text, price = 0) => checkSchemaHtml(page({ '@type': 'Product', name: 'Oak app', offers: { '@type': 'Offer', price, priceCurrency: 'USD' } }, `<h1>Oak app</h1><p>${text}</p>`), U);
  for (const text of ['Free download', 'FREE', 'Free.', 'Gratis', 'Kostenlos', 'Kostenlose Lieferung', 'Gratuit', 'Gratuite', '$0', '0.00 USD', '\u05d4\u05d5\u05e8\u05d3\u05d4 \u05d7\u05d9\u05e0\u05dd', '\u05d1\u05d7\u05d9\u05e0\u05dd', '\u05d7\u05d9\u05e0\u05dd']) {
    const r = withText(text);
    assert.deepEqual([notVisible(r), unverified(r)], [[], []], text);
  }
  for (const price of ['0', '0.00', 0]) assert.deepEqual([notVisible(withText('Free', price)), unverified(withText('Free', price))], [[], []], String(price));
  // Nothing says free: not a violation, an open question.
  for (const text of ['Contact us for a quote', 'Carefree living', 'Costs 10 USD', '\u05e6\u05d5\u05e8 \u05e7\u05e9\u05e8']) {
    const r = withText(text);
    assert.deepEqual(notVisible(r), [], text);
    assert.deepEqual(unverified(r), ['price'], text);
    const f = r.findings.find(x => x.code === 'VALUE_UNVERIFIED');
    assert.deepEqual([f.severity, f.label], ['info', 'H']);
  }
  // A price that is not 0 is still judged.
  assert.deepEqual(notVisible(withText('Free', 15)), [['price', 'medium', 'D']]);
  // lowPrice of 0 works the same way, and the other prices of that page are judged on their own.
  const low = checkSchemaHtml(page({ '@type': 'AggregateOffer', lowPrice: 0, highPrice: 20, priceCurrency: 'USD', offerCount: 3 }, '<p>Choose a plan</p>'), U);
  assert.deepEqual(unverified(low), ['lowPrice']);
  assert.deepEqual(notVisible(low), [['highPrice', 'medium', 'D']]);
});

test('a price split by markup ($59 with 99 in a sup) matches 59.99', () => {
  const r = checkSchemaHtml(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '59.99', priceCurrency: 'USD' } }, '<h1>Oak table</h1><p>Now $59<sup>99</sup> only</p>'), U);
  assert.ok(!codes(r).includes('VALUE_NOT_VISIBLE'), JSON.stringify(r.findings));
  assert.equal(valueVisible('59.99', 'now $59 99 only'), true);
  assert.equal(valueVisible(59.99, '$59\u00a099'), true);
  assert.equal(valueVisible(1.5, 'now 1 50 only'), true);
  assert.equal(valueVisible(299.99, 'now 299 99 only'), true);
  assert.equal(valueVisible(59.99, 'now $59 990 only'), false);
  assert.equal(valueVisible(59.99, 'now $59 9 only'), false);
  assert.equal(valueVisible(59.99, 'now $59 only'), false);
  assert.equal(valueVisible(59.99, 'item 1159 99'), false); // four digits are not a price integer
  assert.equal(valueVisible(1234.99, 'now 1234 99'), false);
});

test('a page with non-ASCII digits cannot be read for numbers: ratings and prices are unverified, not missing', () => {
  const arabic = '<p>\u0627\u0644\u0633\u0639\u0631 \u0665\u0669 \u0631\u064a\u0627\u0644 \u0662\u0661\u0662 \u062a\u0642\u064a\u064a\u0645\u0627\u062a</p>';
  const r = checkSchemaHtml(page(productLd({ name: 'Walnut chair' }), `<h1>Oak table</h1>${arabic}`), U);
  assert.deepEqual(unverified(r), ['price', 'ratingValue', 'reviewCount']);
  assert.deepEqual(notVisible(r), [['name', 'low', 'D']]); // a name has no digits to misread
  assert.match(r.findings.find(f => f.code === 'VALUE_UNVERIFIED').message, /digits/);
  // A value that is on the page in ASCII digits is judged as before, and an ASCII page is judged too.
  const mixed = checkSchemaHtml(page(productLd(), `<h1>Oak table</h1>${arabic}<p>Rated 4.8</p>`), U);
  assert.deepEqual(unverified(mixed), ['price', 'reviewCount']);
  const ascii = checkSchemaHtml(page(productLd(), '<h1>Oak table</h1><p>Great</p>'), U);
  assert.deepEqual(unverified(ascii), []);
  assert.ok(notVisible(ascii).length >= 3);
});

test('numbers in a list without spaces are each read: 38,40,42 and 4.8,212 are lists, 1,234 and 49,90 are not', () => {
  assert.equal(valueVisible(38, 'sizes 38,40,42'), true);
  assert.equal(valueVisible(40, 'sizes 38,40,42'), true);
  assert.equal(valueVisible(42, 'sizes 38,40,42.'), true);
  assert.equal(valueVisible('4.8', 'rated 4.8,212 reviews'), true);
  assert.equal(valueVisible(212, 'rated 4.8,212 reviews'), true);
  assert.equal(valueVisible(5, 'rated 4.8,212 reviews'), false);
  assert.equal(valueVisible(12, 'a 12,345,6 b'), true); // 12, 345 and 6
  assert.equal(valueVisible(6, 'a 12,345,6 b'), true);
  // Grouped numbers and decimal commas keep their meaning.
  assert.equal(valueVisible(234, 'over 1,234 reviews'), false);
  assert.equal(valueVisible(1234, 'over 1,234 reviews'), true);
  assert.equal(valueVisible(567, 'only 1,234,567'), false);
  assert.equal(valueVisible(90, 'only 49,90 eur'), false);
  assert.equal(valueVisible(49.9, 'only 49,90 eur'), true);
  assert.equal(valueVisible(1234.5, 'nur 1.234,50 eur'), true);
  assert.equal(valueVisible(50, 'nur 1.234,50 eur'), false);
  assert.equal(valueVisible(1234, 'only 12,34'), false);
  const r = checkSchemaHtml(page(productLd(), shopBody('<p>Rated 4.8,212 reviews</p>')), U);
  assert.deepEqual(notVisible(r), []);
  // A long list of commas is read in linear time.
  const t0 = performance.now();
  assert.equal(valueVisible(7, '1,2,'.repeat(500000)), false);
  assert.equal(valueVisible(2, '1,2,'.repeat(500000)), true);
  assert.ok(performance.now() - t0 < 4000);
});

test('DANGLING_ID: schema.org and other hosts are not checkable here; a missing same-page id says so', () => {
  const run = refs => checkSchemaHtml(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': '#org', name: 'Shop' }, { '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD', availability: { '@id': 'https://schema.org/InStock' }, itemCondition: { '@id': 'http://schema.org/NewCondition' }, seller: { '@id': 'https://www.schema.org/Foo' } }, brand: refs }] }), U);
  const dangling = r => r.findings.filter(f => f.code === 'DANGLING_ID');
  assert.equal(dangling(run({ '@id': '#org' })).length, 0);
  assert.equal(dangling(run({ '@id': 'https://other.example/#org' })).length, 0);
  assert.equal(dangling(run({ '@id': 'https://shop.test/#org' })).length, 0); // the home page defines it: another page of this site
  assert.equal(dangling(run({ '@id': 'urn:uuid:1234' })).length, 0);
  const missing = dangling(run({ '@id': '#missing' }));
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /#missing/);
  assert.match(missing[0].message, /not defined on this page/);
  assert.equal(dangling(run({ '@id': 'https://shop.test/p#missing' })).length, 1);
  assert.equal(dangling(run({ '@id': '_:b1' })).length, 1);
});

test('Product.name matches across curly quotes, dash variants and whitespace', () => {
  const run = (name, text, title = 'Shop') => checkSchemaHtml(page({ '@type': 'Product', name, offers: { '@type': 'Offer', price: 59, priceCurrency: 'USD' } }, `<p>${text} $59.00</p>`, title), U);
  const names = r => r.findings.filter(f => f.evidence.property === 'name');
  assert.equal(names(run('Men\'s "Oak" Table - Large', 'Men\u2019s \u201cOak\u201d Table \u2013 Large')).length, 0);
  assert.equal(names(run('Men\u2019s \u201cOak\u201d Table \u2013 Large', 'Men\'s "Oak" Table - Large')).length, 0);
  assert.equal(names(run(`Oak ${String.fromCharCode(0x2014)} Table`, 'oak - table')).length, 0); // an em dash, built so that the file holds none
  assert.equal(names(run('Oak \u2010 Table', 'oak \u2212 table')).length, 0);
  assert.equal(names(run('Oak   Table\u00a0Large', 'oak table  large')).length, 0);
  assert.equal(names(run('Oak Table', 'Oak\n\tTable', 'Oak table')).length, 0);
  assert.equal(names(run('Walnut Table - Large', 'Men\u2019s Oak Table \u2013 Large')).length, 1);
  assert.equal(valueVisible('Rock \u2018n\u2019 Roll', "the rock 'n' roll box"), true);
});

test('messages name the most specific known type of a multi-typed node', () => {
  const msg = (types, extra, code) => checkSchemaHtml(page({ '@type': types, ...extra }, '<p>Nothing</p>'), U).findings.find(f => f.code === code).message;
  assert.match(msg(['Thing', 'Article'], { headline: 'x', datePublished: 'soon' }, 'INVALID_DATE'), /^Article\.datePublished/);
  assert.match(msg(['Thing', 'Event'], { name: 'x', startDate: 'soon' }, 'INVALID_DATE'), /^Event\.startDate/);
  assert.match(msg(['Thing', 'AggregateRating'], { ratingValue: '4.8', reviewCount: 212 }, 'VALUE_NOT_VISIBLE'), /^AggregateRating\.ratingValue/);
  assert.match(msg(['LocalBusiness', 'Restaurant'], { name: 'Cafe', datePublished: 'x' }, 'INVALID_DATE'), /^Restaurant\./);
  assert.match(msg(['Restaurant', 'LocalBusiness'], { name: 'Cafe', datePublished: 'x' }, 'INVALID_DATE'), /^Restaurant\./);
  assert.match(msg(['Foo', 'Article'], { datePublished: 'x' }, 'INVALID_DATE'), /^Article\./);
  assert.match(msg(['Thing', 'Foo'], { datePublished: 'x' }, 'INVALID_DATE'), /^Foo\./);
  assert.match(msg(['Thing'], { datePublished: 'x' }, 'INVALID_DATE'), /^Thing\./);
});

test('wording: an empty date is empty, not two quotation marks', () => {
  const r = checkSchemaHtml(page({ '@type': 'Article', headline: 'x', datePublished: '', dateModified: '   ', dateCreated: null }), U);
  const msgs = r.findings.filter(f => f.code === 'INVALID_DATE').map(f => f.message);
  assert.equal(msgs.length, 3);
  assert.match(msgs.find(m => m.includes('datePublished')), /\(empty\)/);
  assert.ok(!msgs.some(m => m.includes('""')));
});

// Review round 1: command line and crawl.

test('a file that exists under the Git folder is checked; only a missing path is blamed on Git Bash, and --out gets the same guard', async t => {
  const gitFile = ['ReleaseNotes.html', 'mingw64/share/doc/connect/manual.html'].map(f => `C:/Program Files/Git/${f}`).find(f => process.platform === 'win32' && fs.existsSync(f));
  const dir = tmp();
  try {
    if (gitFile) {
      const ok = await run([gitFile, '--out', path.join(dir, 'git-out')]);
      assert.equal(ok.code, 0, ok.stderr);
      assert.ok(fs.existsSync(path.join(dir, 'git-out', 'schema.md')));
    } else t.diagnostic('no Git for Windows install here: the existing-file half is not run');
    const file = path.join(dir, 'p.html');
    fs.writeFileSync(file, page({ '@type': 'FAQPage', mainEntity: [] }));
    const out = await run([file, '--out', 'C:/Program Files/Git/tmp/schema-check-out-test']);
    assert.equal(out.code, 1);
    assert.match(out.stderr, /MSYS_NO_PATHCONV/);
    assert.doesNotMatch(out.stderr, /EPERM|\n\s+at /);
    const gone = await run(['C:/Program Files/Git/tmp/no-such-page.html', '--out', path.join(dir, 'x')]);
    assert.equal(gone.code, 1);
    assert.match(gone.stderr, /MSYS_NO_PATHCONV/);
    assert.ok(!fs.existsSync(path.join(dir, 'x')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--from-crawl with a crawl.json that has no textTruncated: a text of 20,000 characters or more was cut', async () => {
  const dir = tmp();
  try {
    const old = len => {
      const facts = extract(page({ '@type': 'Product', name: 'Oak table', offers: { '@type': 'Offer', price: '49', priceCurrency: 'USD' } }, `<h1>Oak table</h1><p>${'wood '.repeat(5000)}</p>`), U);
      facts.text = facts.text.slice(0, len);
      assert.equal(facts.textTruncated, undefined);
      return facts;
    };
    const file = path.join(dir, 'crawl.json');
    fs.writeFileSync(file, JSON.stringify({ pages: [{ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', status: 200, facts: old(20000) }, { url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', status: 200, facts: old(19999) }] }));
    const out = path.join(dir, 'out');
    assert.equal((await run(['--from-crawl', file, '--out', out])).code, 0);
    const json = JSON.parse(fs.readFileSync(path.join(out, 'schema.json'), 'utf8'));
    const a = json.find(x => x.url.endsWith('/a')).findings;
    const b = json.find(x => x.url.endsWith('/b')).findings;
    assert.ok(a.some(f => f.code === 'VALUE_UNVERIFIED' && f.evidence.property === 'price'), JSON.stringify(a));
    assert.ok(!a.some(f => f.code === 'VALUE_NOT_VISIBLE'));
    assert.ok(b.some(f => f.code === 'VALUE_NOT_VISIBLE' && f.evidence.property === 'price'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Review of the whole branch: names and labels that point to a rating make a missing one a hypothesis, never a certainty.

test('a rating widget named or labelled in the markup (class, id, itemprop, data-rating, an unquoted aria-label) is a hypothesis, not "no stars"', () => {
  for (const widget of [
    '<div class="star-rating"></div>',
    '<div class=stars></div>',
    '<span aria-label=Rating></span>',
    '<span id="product-rating"></span>',
    '<div class="StarRating" data-rating="4.8"></div>',
    '<span itemprop="ratingValue"></span>',
  ]) {
    const r = checkSchemaHtml(page(productLd(), shopBody(widget)), U);
    assert.deepEqual(notVisible(r), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']], widget);
    const f = r.findings.find(x => x.code === 'VALUE_NOT_VISIBLE');
    assert.match(f.message, /itemprop or data-rating/, widget);
    assert.doesNotMatch(f.message, /nothing else on the page points to a rating/, widget);
    // The same through the facts a crawl keeps.
    const crawled = checkSchemaFacts(extract(page(productLd(), shopBody(widget)), U), U);
    assert.deepEqual(notVisible(crawled), [['ratingValue', 'medium', 'H'], ['reviewCount', 'medium', 'H']], `crawl facts: ${widget}`);
  }
  // Names that only contain the letters are still no sign of a rating.
  const plain = checkSchemaHtml(page(productLd(), shopBody('<div class="operating-hours start-date"></div><span id="starter"></span>')), U);
  assert.deepEqual(notVisible(plain), [['ratingValue', 'high', 'D'], ['reviewCount', 'high', 'D']]);
});

test('--help says that "visible" means in the static text, and that text hidden by CSS still counts', async () => {
  const script = fileURLToPath(new URL('./schema-check.mjs', import.meta.url));
  const help = await new Promise(resolve => execFile(process.execPath, [script, '--help'], (err, stdout) => resolve(stdout)));
  assert.match(help, /"visible"/);
  assert.match(help, /static text/);
  assert.match(help, /hidden by CSS[^.]*still counts as visible/);
});
