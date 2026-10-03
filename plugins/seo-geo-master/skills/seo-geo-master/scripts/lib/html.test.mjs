import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { extract, parseJsonLd, decodeEntities, parseAttrs, hostKey } from './html.mjs';

const BASE = 'https://www.shop.test/products/oak';

const PAGE = `<!doctype html>
<html lang="he" dir="rtl"><head>
<meta charset="utf-8">
<title>שולחן אלון &amp; ספסל | Shop</title>
<meta name="description" content="Solid oak table">
<meta name="robots" content="index, follow">
<meta name="viewport" content="width=device-width">
<link rel="canonical" href="/products/oak">
<link rel="alternate" hreflang="en" href="https://www.shop.test/en/products/oak">
<link rel="alternate" hreflang="he" href="https://www.shop.test/products/oak">
<meta property="og:image" content="/img/oak.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Oak table"}</script>
<script>var big = "${'x'.repeat(100)}";</script>
</head><body>
<!-- <a href="/commented-out">hidden</a> -->
<svg><title>icon title</title></svg>
<h1>שולחן <em>אלון</em></h1><h2>Care</h2><h3>Oil</h3>
<p>Made by hand in our workshop. Price 59.</p>
<a href="/products/walnut#reviews">Walnut table</a>
<a href="https://shop.test/about" rel="nofollow">About</a>
<a href="https://other.test/x">Partner</a>
<a href="/gallery"><img src="/img/g.jpg" alt="Gallery"></a>
<a href="mailto:a@b.test">Mail</a>
<img src="/img/a.jpg" alt="">
<img src="/img/b.jpg" width="10" height="20" loading="lazy">
<img src="data:image/png;base64,AAAA" alt="dot">
<style>.x{color:red}</style>
<noscript>Enable JS please</noscript>
</body></html>`;

test('extracts head tags, resolves URLs and decodes entities', () => {
  const f = extract(PAGE, BASE);
  assert.equal(f.lang, 'he');
  assert.equal(f.dir, 'rtl');
  assert.equal(f.title, 'שולחן אלון & ספסל | Shop');
  assert.equal(f.titleCount, 1);
  assert.equal(f.metaDescription, 'Solid oak table');
  assert.deepEqual(f.metaRobots, ['index', 'follow']);
  assert.equal(f.robotsMetaOutsideHead, false);
  assert.equal(f.canonical, 'https://www.shop.test/products/oak');
  assert.deepEqual(f.hreflang, [{ lang: 'en', href: 'https://www.shop.test/en/products/oak' }, { lang: 'he', href: 'https://www.shop.test/products/oak' }]);
  assert.equal(f.ogImage, 'https://www.shop.test/img/oak.jpg');
});

test('headings, links and images', () => {
  const f = extract(PAGE, BASE);
  assert.deepEqual(f.headings, { h1: ['שולחן אלון'], h2: ['Care'], h3: ['Oil'] });
  assert.deepEqual(f.links.map(l => [l.href, l.text, l.internal, l.nofollow]), [
    ['https://www.shop.test/products/walnut', 'Walnut table', true, false],
    ['https://shop.test/about', 'About', true, true],
    ['https://other.test/x', 'Partner', false, false],
    ['https://www.shop.test/gallery', 'Gallery', true, false],
  ]);
  assert.equal(f.images.length, 4);
  assert.equal(f.images[1].alt, '');
  assert.equal(f.images[2].alt, null);
  assert.equal(f.images[2].loading, 'lazy');
});

test('JSON-LD, text, word count and byte accounting', () => {
  const f = extract(PAGE, BASE);
  assert.equal(f.jsonld.length, 1);
  assert.equal(f.jsonld[0].data['@type'], 'Product');
  assert.ok(f.offsets.firstJsonld > f.offsets.title);
  assert.ok(f.text.includes('Made by hand in our workshop. Price 59.'));
  assert.ok(!f.text.includes('Enable JS'));
  assert.ok(!f.text.includes('icon title'));
  assert.ok(!f.text.includes('color:red'));
  assert.ok(f.wordCount >= 15);
  assert.ok(f.bytes.scripts >= 100);
  assert.ok(f.bytes.inlineBase64 > 0);
  assert.equal(f.bytes.total, Buffer.byteLength(PAGE));
  assert.equal(f.appShell, false);
});

test('robots meta outside head, app shells and microdata', () => {
  const f = extract('<html><head><title>T</title></head><body><meta name="robots" content="noindex"><div id="app"></div><div itemscope itemtype="https://schema.org/Product"></div><script src="/app.js"></script></body></html>', 'https://a.test/');
  assert.deepEqual(f.metaRobots, ['noindex']);
  assert.equal(f.robotsMetaOutsideHead, true);
  assert.equal(f.appShell, true);
  assert.equal(f.microdata, true);
  assert.equal(f.wordCount, 0);
});

test('base href, multiple canonicals and missing head/body', () => {
  const f = extract('<head><base href="https://cdn.test/sub/"><link rel="canonical" href="a"><link rel="canonical" href="b"></head><a href="c">C</a>', 'https://a.test/x');
  assert.deepEqual(f.canonicals, ['https://cdn.test/sub/a', 'https://cdn.test/sub/b']);
  assert.equal(f.links[0].href, 'https://cdn.test/sub/c');
  const g = extract('<p>Just a fragment with words</p>', 'https://a.test/');
  assert.equal(g.wordCount, 5);
});

test('parseJsonLd is strict first, then lenient, then reports the error', () => {
  assert.deepEqual(parseJsonLd('{"a":1}'), { raw: '{"a":1}', data: { a: 1 }, error: null });
  const lenient = parseJsonLd('{"a":1, /* note */ "b":[1,2,],}');
  assert.deepEqual(lenient.data, { a: 1, b: [1, 2] });
  assert.equal(lenient.relaxed, true);
  const bad = parseJsonLd('{"a":');
  assert.equal(bad.data, null);
  assert.ok(bad.error);
});

test('helpers', () => {
  assert.equal(decodeEntities('&lt;b&gt; &#x5D0; &#1488; &quot;x&quot; &bogus;'), '<b> א א "x" &bogus;');
  assert.deepEqual(parseAttrs(' href="/a" data-x=\'1\' disabled REL=nofollow'), { href: '/a', 'data-x': '1', disabled: '', rel: 'nofollow' });
  assert.equal(hostKey('https://WWW.Shop.test/x'), 'shop.test');
});

// ---- Raw HTML is untrusted input: behaviour beyond the happy path ----

test('entity names that exist on Object.prototype are left alone', () => {
  const s = '&constructor; &toString; &__proto__; &hasOwnProperty; &valueOf;';
  assert.equal(decodeEntities(s), s);
});

test('a commented-out script does not hide the real scripts after it', () => {
  const html = '<head><!-- <script> --><script type="application/ld+json">{"@type":"Thing"}</script><script>var a=1;</script></head><p>x</p>';
  const f = extract(html, 'https://a.test/');
  assert.equal(f.jsonld.length, 1);
  assert.equal(f.jsonld[0].data['@type'], 'Thing');
  assert.equal(f.bytes.scripts, '{"@type":"Thing"}'.length + 'var a=1;'.length);
});

test('a stray comment opener inside a script does not swallow the page after it', () => {
  const html = '<body><script>var s = "<!--";</script><h1>Visible heading</h1><p>Real words here</p><!-- note --></body>';
  const f = extract(html, 'https://a.test/');
  assert.deepEqual(f.headings.h1, ['Visible heading']);
  assert.equal(f.text, 'Visible heading Real words here');
});

test('an empty og:image does not resolve to the page itself', () => {
  assert.equal(extract('<head><meta property="og:image" content=""></head>', 'https://a.test/p').ogImage, null);
  assert.equal(extract('<head><meta property="og:image" content="  "><meta property="og:image" content="/i.png"></head>', 'https://a.test/p').ogImage, 'https://a.test/i.png');
});

test('app shell means an empty root container, not any id that merely starts with one', () => {
  const shell = h => extract(h, 'https://a.test/').appShell;
  assert.equal(shell("<body><div id='root'> \n </div></body>"), true);
  assert.equal(shell('<body><div class="x" ID="__next"></div></body>'), true);
  assert.equal(shell('<body><div id="application"></div></body>'), false);
  assert.equal(shell('<body><div data-id="root"></div></body>'), false);
  assert.equal(shell('<body><div id="root"><p>Server rendered</p></div></body>'), false);
});

test('byte offsets are UTF-8 byte positions in the original, in any order of tags', () => {
  const ld1 = '<script type="application/ld+json">{}</script>';
  const ld2 = '<script type="application/ld+json">{"a":1}</script>';
  const html = `<p>שלום 😀</p>${ld1}é<meta name="robots" content="noindex"><title>T</title>${ld2}<link rel="canonical" href="/c">`;
  const at = needle => Buffer.byteLength(html.slice(0, html.indexOf(needle)));
  const f = extract(html, 'https://a.test/');
  assert.equal(f.offsets.firstJsonld, at(ld1));
  assert.deepEqual(f.jsonld.map(j => j.offset), [at(ld1), at(ld2)]);
  assert.equal(f.offsets.metaRobots, at('<meta name="robots"'));
  assert.equal(f.offsets.title, at('<title>'));
  assert.equal(f.offsets.canonical, at('<link rel="canonical"'));
});

test('unterminated tags, comments and scripts never throw and keep what came before', () => {
  const f = extract('<title>T</title><h1>Hi there</h1><!-- never closed <a href="/x">link<script>var a', 'https://a.test/');
  assert.equal(f.title, 'T');
  assert.deepEqual(f.headings.h1, ['Hi there']);
  assert.doesNotThrow(() => extract('<', 'https://a.test/'));
  assert.doesNotThrow(() => extract('<a href="', 'https://a.test/'));
  assert.doesNotThrow(() => extract('', 'not a url'));
});

// ---- Fix 1: quote-aware tag ends, long robots lists, more entities, prose with "<" ----

test('a ">" inside a quoted attribute value does not end the tag (meta)', () => {
  const f = extract('<head><meta name="description" content="Home > Shop > Oak"><meta content="x > y" name="robots"></head>', 'https://a.test/');
  assert.equal(f.metaDescription, 'Home > Shop > Oak');
  assert.deepEqual(f.metaRobots, ['x > y']);
  const g = extract('<head><meta content="x > y" name="description"><meta name = \'viewport\' content = \'a > b\'></head>', 'https://a.test/');
  assert.equal(g.metaDescription, 'x > y');
  assert.equal(g.viewport, 'a > b');
});

test('a ">" inside a quoted attribute value does not end the tag (img, link, a)', () => {
  const f = extract('<body><img alt="a > b" src="/i.png"><a x-show="n > 0" href="/x">Link</a><link rel="canonical" title=\'>\' href="/c"></body>', 'https://a.test/');
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].alt, 'a > b');
  assert.equal(f.images[0].src, 'https://a.test/i.png');
  assert.deepEqual(f.links.map(l => [l.href, l.text]), [['https://a.test/x', 'Link']]);
  assert.equal(f.canonical, 'https://a.test/c');
});

test('a ">" inside a quoted attribute value does not leak into text, masks or scripts', () => {
  const f = extract('<body><style data-x="a > b">.c{color:red}</style><p>Price <span title="a > b">now</span></p><script type="application/ld+json" data-note="a > b">{"@type":"Thing"}</script></body>', 'https://a.test/');
  assert.equal(f.text, 'Price now');
  assert.equal(f.jsonld.length, 1);
  assert.equal(f.jsonld[0].data['@type'], 'Thing');
  assert.equal(f.bytes.scripts, '{"@type":"Thing"}'.length);
});

test('a quote opens only right after "=", so a stray quote in a value does not swallow the next tags', () => {
  const f = extract('<body><a href=/x title=say"hi>Link</a> <b class="y">z</b> <a href=/w>W</a></body>', 'https://a.test/');
  assert.deepEqual(f.links.map(l => [l.href, l.text]), [['https://a.test/x', 'Link'], ['https://a.test/w', 'W']]);
  // an unclosed quote falls back to the first ">" of that tag
  const g = extract('<a title="x href=/a>A</a><a href=/b>B</a>', 'https://a.test/');
  assert.deepEqual(g.links.map(l => l.text), ['A', 'B']);
});

test('a very long robots list does not overflow the call stack', () => {
  const f = extract('<meta name="robots" content="' + 'a,'.repeat(300_000) + 'noindex">', 'https://a.test/');
  assert.equal(f.metaRobots.length, 300_001);
  assert.equal(f.metaRobots.at(-1), 'noindex');
});

test('common named entities decode, unknown ones stay as they are', () => {
  const f = extract('<title>Foo &ndash; Bar &copy; 2026 &hellip;</title>', 'https://a.test/');
  assert.equal(f.title, 'Foo \u2013 Bar \u00a9 2026 \u2026');
  const cases = {
    '&ndash;': '\u2013', '&mdash;': '\u2014', '&hellip;': '\u2026', '&laquo;': '\u00ab', '&raquo;': '\u00bb',
    '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&middot;': '\u00b7',
    '&bull;': '\u2022', '&copy;': '\u00a9', '&reg;': '\u00ae', '&trade;': '\u2122', '&shy;': '\u00ad',
    '&times;': '\u00d7', '&euro;': '\u20ac', '&pound;': '\u00a3', '&yen;': '\u00a5', '&cent;': '\u00a2',
    '&frac12;': '\u00bd', '&sup2;': '\u00b2', '&eacute;': '\u00e9', '&Eacute;': '\u00c9',
    '&uuml;': '\u00fc', '&szlig;': '\u00df', '&larr;': '\u2190', '&rarr;': '\u2192', '&deg;': '\u00b0',
    '&AMP;': '&', '&Lt;': '<', '&NBSP;': ' ',
    // the Latin-1 run: first, last and a few in between
    '&iexcl;': '\u00a1', '&sect;': '\u00a7', '&laquo;': '\u00ab', '&middot;': '\u00b7', '&Agrave;': '\u00c0',
    '&times;': '\u00d7', '&divide;': '\u00f7', '&yuml;': '\u00ff', '&commat;': '@',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(decodeEntities(src), want, src);
  assert.equal(decodeEntities('&bogus; &Bogus12; &amp;amp; &ndash &#x2014;'), '&bogus; &Bogus12; &amp; &ndash \u2014');
  assert.equal(decodeEntities('&toString; &constructor; &__proto__;'), '&toString; &constructor; &__proto__;');
});

test('named dashes and symbols do not count as words', () => {
  const f = extract('<body><p>Oak &ndash; walnut &mdash; pine &bull; &copy; 2026 &hellip;</p></body>', 'https://a.test/');
  assert.equal(f.text, 'Oak \u2013 walnut \u2014 pine \u2022 \u00a9 2026 \u2026');
  assert.equal(f.wordCount, 4);
});

test('a "<" that cannot start a tag is text', () => {
  const f = extract('<body><p>if x < 5 and y > 3, then 2<3 and 4 > 1.</p><p>a <b>bold</b> word</p><?xml version="1.0"?><!doctype html></body>', 'https://a.test/');
  assert.equal(f.text, 'if x < 5 and y > 3, then 2<3 and 4 > 1. a bold word');
  assert.equal(extract('<h1>1 < 2 > 0</h1>', 'https://a.test/').headings.h1[0], '1 < 2 > 0');
});

// ---- starSignal: does the page point to a star rating? schema-check uses it to call a missing rating certain ----

const signal = body => extract(`<html><head><title>T</title></head><body>${body}</body></html>`, 'https://a.test/').starSignal;

test('starSignal is true for star glyphs in the text', () => {
  for (const glyphs of ['\u2605\u2605\u2605\u2605\u2606', '\u2606', '\u2b50\u2b50\u2b50']) assert.equal(signal(`<p>${glyphs} (212 reviews)</p>`), true, glyphs);
});

test('starSignal is true for a star or rating word in an aria-label, title or alt', () => {
  const cases = {
    'aria-label with a rating': '<span role="img" aria-label="Rated 4.8 out of 5"></span>',
    'alt with stars': '<img src="/s.png" alt="5 stars">',
    'title with the word rating': '<span title="rating"></span>',
    'single quotes': "<span aria-label='Customer rating: 4.8'></span>",
    'upper case and spaces around the equals sign': '<div ARIA-LABEL = "FIVE STARS"></div>',
    'the Hebrew words for rating and star': '<span aria-label="\u05d3\u05d9\u05e8\u05d5\u05d2 4.8"></span><i title="\u05db\u05d5\u05db\u05d1"></i>',
    'one among many other labels': '<a aria-label="Home"></a><a title="Cart"></a><img alt="Oak table"><i aria-label="4 stars"></i>',
  };
  for (const [name, html] of Object.entries(cases)) assert.equal(signal(html), true, name);
});

test('starSignal is false when nothing points to a rating, and for words that only contain the letters', () => {
  const cases = {
    'plain text': '<p>Great table.</p>',
    'a title that has "rating" inside another word': '<span title="Operating hours"></span>',
    'the same words as text': '<p>Operating hours: 9 to 5. Starter kit. Overrated? Restart.</p>',
    'an aria-label that has "star" at the start of another word': '<span aria-label="Starter kit"></span>',
    'an alt that has "rated" inside another word': '<img src="/a.png" alt="Overrated">',
    'a title that has "stars" at the end of another word': '<i title="Restars"></i>',
    'labels that say nothing about stars': '<a aria-label="Home" title="Go home"><img alt="Oak table"></a>',
    // Only glyphs in the text and attributes count; the number a page writes in words is judged by schema-check itself.
    'a rating written in words in the text': '<p>Rated 4.8 out of 5 stars by 212 customers</p>',
    'a star glyph inside a script, which is not page text': '<script>var s = "\u2605";</script><p>Hi</p>',
  };
  for (const [name, html] of Object.entries(cases)) assert.equal(signal(html), false, name);
});

test('starSignal is a boolean on every page, also an empty one', () => {
  assert.equal(extract('', 'https://a.test/').starSignal, false);
  assert.equal(extract('<p>x</p>', 'https://a.test/').starSignal, false);
  assert.equal(typeof extract(PAGE, BASE).starSignal, 'boolean');
  assert.equal(extract(PAGE, BASE).starSignal, false);
});

// Each hostile page is about 1 MB and must be processed in well under a second. Lazy
// "open ... [\s\S]*? ... close" patterns rescan to the end of the input for every opener that is
// never closed, which is quadratic: minutes of CPU for one hostile page. The page runs in a worker
// that is killed after a few seconds, so a regression fails this test instead of hanging the suite.
const MB = 1_000_000;
const reps = (s, n = MB) => Math.ceil(n / s.length);
const rep = (s, n = MB) => s.repeat(reps(s, n));
const LINK = '<a href="/p/1">item</a>\n';
const LINK_GT = '<a href="/p/1" title="a > b">item</a>\n';
const LD = '<script type="application/ld+json">{}</script>';
const RUNNER = `
const { workerData, parentPort } = require('node:worker_threads');
import(workerData.url).then(m => {
  const t = performance.now();
  let out = null;
  if (workerData.fn === 'parseJsonLd') m.parseJsonLd(workerData.input);
  else {
    const f = m.extract(workerData.input, 'https://a.test/');
    out = { links: f.links.length, images: f.images.length, jsonld: f.jsonld.length, metaRobots: f.metaRobots.length, wordCount: f.wordCount, h1: f.headings.h1.length, starSignal: f.starSignal };
  }
  parentPort.postMessage({ ms: performance.now() - t, out });
}).catch(e => parentPort.postMessage({ error: String(e) }));`;

function timeIt(fn, input, hardLimitMs = 4000) {
  return new Promise((resolve, reject) => {
    const w = new Worker(RUNNER, { eval: true, workerData: { url: new URL('./html.mjs', import.meta.url).href, fn, input } });
    const killer = setTimeout(() => { w.terminate(); resolve({ ms: Infinity, out: null }); }, hardLimitMs);
    w.once('message', r => { clearTimeout(killer); w.terminate(); r.error ? reject(new Error(r.error)) : resolve(r); });
    w.once('error', e => { clearTimeout(killer); reject(e); });
  });
}

const HOSTILE = {
  'comment openers': rep('<!--'),
  'script openers without closer': rep('<script '),
  'script tags without closer': rep('<script>'),
  'every raw-text opener without closer': rep('<script><style><noscript><template><textarea>'),
  'svg openers without closer': rep('<svg '),
  'bare less-than signs': '<'.repeat(MB),
  'anchor openers without closer': rep('<a href=x>'),
  'anchor openers without end': rep('<a '),
  'title openers': rep('<title>'),
  'h1 openers': rep('<h1>'),
  'h2 openers without end': rep('<h2 '),
  'meta openers without end': rep('<meta '),
  'link openers without end': rep('<link '),
  'img openers without end': rep('<img '),
  'base openers without end': rep('<base '),
  'html openers without end': rep('<html '),
  'body openers without end': rep('<body '),
  'div openers without end': rep('<div '),
  'empty app containers': rep('<div id="app"> '),
  'img openers inside one anchor': '<a href=x>' + rep('<img ') + '</a>',
  'unclosed quotes in attributes': '<a ' + rep('a="') + '>x</a>',
  'one long whitespace run in a tag': '<a x' + ' '.repeat(MB) + 'b>x</a>',
  'entity-like runs': rep('&a') + '&' + 'a'.repeat(MB),
  // Fast is not enough: these also say what the page must still produce.
  'a megabyte of real links': { input: rep(LINK), expect: { links: reps(LINK) } },
  'real links whose attributes hold ">"': { input: rep(LINK_GT), expect: { links: reps(LINK_GT) } },
  'thousands of JSON-LD scripts': { input: rep(LD), expect: { jsonld: reps(LD) } },
  'a robots meta with a megabyte of tokens': { input: '<meta name="robots" content="' + rep('a,') + '">', expect: { metaRobots: reps('a,') } },
  'attribute quotes that pair up across tags': rep('<a title="'),
  'attribute quotes that pair up, with a final ">"': rep('<a title="') + '>x</a>',
  'single-quote openers without end': rep("<a title='"),
  'one quote never closed, then many tags': '<a title="' + rep('<i>y</i>\n'),
  'one quote closed only at the very end': '<a title="' + rep('<a href=x>') + '"',
  'a megabyte of attribute values in one tag': '<a ' + rep('x="y" ') + '>z</a>',
  'a megabyte of "=" signs and quotes': '<a ' + rep('="\'=') + '>z</a>',
  // The star scan reads every label of the page once: the last one says stars, so it must be reached.
  'a megabyte of aria-label attributes, the last one about stars': { input: rep('<i aria-label="x" title=\'y\' alt="z">') + '<i aria-label="4 stars">', expect: { starSignal: true } },
  'a megabyte of data- attribute starts, then a real data-star-rating': { input: '<div ' + rep('data-') + '><div data-star-rating=4>', expect: { starSignal: true } },
};

for (const [name, input] of Object.entries(HOSTILE)) {
  test(`hostile 1 MB page stays fast: ${name}`, async () => {
    const { input: page, expect = {} } = typeof input === 'string' ? { input } : input;
    const { ms, out } = await timeIt('extract', page);
    assert.ok(ms < 1000, ms === Infinity ? `${name}: still running after 4 s` : `${name}: took ${ms.toFixed(0)} ms`);
    // fast is not enough: the page must also give the right answer
    for (const [k, v] of Object.entries(expect)) assert.equal(out[k], v, `${name}: ${k}`);
  });
}

test('hostile 1 MB JSON-LD with thousands of unclosed block comments stays fast', async () => {
  const { ms } = await timeIt('parseJsonLd', '{"a":1' + rep('/*a'));
  assert.ok(ms < 1000, ms === Infinity ? 'still running after 4 s' : `took ${ms.toFixed(0)} ms`);
});

// ---- starSignal also reads the names a page gives its elements and the attributes it labels them with ----

test('starSignal is true for a star or rating token in a class, id, itemprop, data-rating or aria-label, quoted or not', () => {
  const cases = {
    'class star-rating': '<div class="star-rating"></div>',
    'class with several names': '<div class="widget btn stars big"></div>',
    'unquoted class': '<div class=stars></div>',
    'unquoted aria-label': '<span aria-label=Rating></span>',
    'unquoted title': '<span title=rating></span>',
    'single quotes on a class': "<div class='rating-stars'></div>",
    'id with rating': '<span id="product_rating"></span>',
    'camel case class': '<div class="starRating"></div>',
    'pascal case class': '<div class="StarRating"></div>',
    'microdata rating': '<span itemprop="ratingValue">4.8</span>',
    'microdata aggregate rating': '<div itemprop="aggregateRating"></div>',
    'data-rating with a number': '<div data-rating="4.8"></div>',
    'data attribute named for stars': '<div data-star-rating=4></div>',
    'upper case attribute name': '<DIV CLASS="Star-Rating"></DIV>',
    'spaces around the equals sign': '<div class = "stars"></div>',
  };
  for (const [name, html] of Object.entries(cases)) assert.equal(signal(html), true, name);
});

test('starSignal stays false for names that only contain the letters, and for other attributes', () => {
  const cases = {
    'start and restart in a class': '<div class="start-date restart"></div>',
    'starter in an id': '<div id="starter-kit"></div>',
    'operating hours in a class': '<div class="operating-hours"></div>',
    'overrated in a class': '<div class=overrated></div>',
    'data-start': '<div data-start="5"></div>',
    'rate limit is not a rating': '<div class="rate-limit"></div>',
    'itemprop name': '<span itemprop="name">Oak</span>',
    'data-id': '<div data-id="12" data-sku="A7"></div>',
    'the word in a text node': '<p>rating stars</p>',
    'class text outside any attribute': '<p>classes: star-rating</p>',
  };
  for (const [name, html] of Object.entries(cases)) assert.equal(signal(html), false, name);
});

test('the star signal scan stays linear on a hostile page: unclosed quotes and long runs of spaces', { timeout: 20000 }, () => {
  const n = 200000;
  for (const html of [`<div class="${'x'.repeat(n)}`, '<div class=' + '"'.repeat(n), `<div class${' '.repeat(n)}x`, "<p class='a".repeat(n / 10), '<div data-' + 'a-'.repeat(n)]) {
    const t = Date.now();
    signal(html);
    assert.ok(Date.now() - t < 3000, `${html.slice(0, 20)}... took ${Date.now() - t} ms`);
  }
});
