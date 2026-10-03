#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFetcher, isLocalHost } from './lib/fetch.mjs';
import { extract, decodeEntities, STAR_GLYPH, STAR_WORDS } from './lib/html.mjs';
import { loadData } from './lib/data.mjs';
import { finding, findingsMarkdown, parseArgs, isMain, writeJson, writeText } from './lib/report.mjs';

const HELP = `Usage: node schema-check.mjs <url | file.html> [--out seo/schema]
       node schema-check.mjs --from-crawl seo/crawl/crawl.json [--out seo/schema]

Checks JSON-LD in the raw HTML: parse errors, @graph and @id references, Google rich result status
(active or retired, from data/schema-status.json), required properties, dates and prices, and whether
prices, ratings, review counts and the product name in the markup are visible on the page (a rating
or price that users cannot see breaks Google's structured data guidelines).

It reads static HTML only. "Not detected in static HTML" is not "missing": JavaScript may add the
markup, so check the rendered page before calling it missing. A rating that is not in the text is
reported as certain only when nothing else on the page points to a rating (the other rating number,
star glyphs, an aria-label, title or alt that mentions stars or a rating, or a class, id, itemprop or
data-rating that is named for one, with or without quotes); review widgets often draw ratings with
JavaScript. In this check "visible" means that the number appears somewhere in the static text of the
page; text hidden by CSS (display:none, off-screen, collapsed) still counts as visible, because this
tool does not run styles. A URL is fetched once, as seo-geo-master (never Googlebot) without
asking robots.txt (crawl.mjs obeys it for a crawl). --from-crawl reads the page data a crawl saved;
it keeps the first 20,000 characters of each page's text, image alt text, and whether the page has
stars (glyphs, or a label, title, alt, class, id or itemprop that mentions stars or a rating), so a value that is not
in that part is reported as unverified, not as missing. A crawl.json written before it kept that
last fact cannot rule out stars drawn by an aria-label or title, so a missing rating there is a hypothesis.
In Git Bash a path argument that starts with / (a file or --out) is rewritten into a Windows path:
run with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash.`;

const CLI_OPTIONS = ['from-crawl', 'out', 'help'];

const DATE_KEYS = ['datePublished', 'dateModified', 'dateCreated', 'uploadDate', 'startDate', 'endDate', 'validFrom', 'validThrough', 'expires', 'priceValidUntil', 'datePosted'];
const VISIBLE_KEYS = [['ratingValue', 'high'], ['reviewCount', 'high'], ['ratingCount', 'high'], ['price', 'medium'], ['lowPrice', 'medium'], ['highPrice', 'medium']];
const RATING_KEYS = ['ratingValue', 'reviewCount', 'ratingCount'];
const RATING_NAMES = { ratingValue: 'rating', reviewCount: 'review count', ratingCount: 'rating count' };
const PRICE_KEYS = new Set(['price', 'lowPrice', 'highPrice']);
const PRICED = new Set(['Offer', 'AggregateOffer', 'PriceSpecification', 'UnitPriceSpecification']);

// JSON-LD is untrusted input. A page can nest it a hundred thousand levels deep or fill it with
// millions of nodes, so what is read is bounded, and SCHEMA_LIMIT says when something was left out.
export const MAX_DEPTH = 64; // levels of objects and lists
export const MAX_NODES = 2000; // objects with an @type or an @id, over all the blocks of a page
export const MAX_VISITS = 500000; // entries looked at, over all the blocks of a page
const MAX_PER_CODE = 50; // findings of one code listed for one page
const MAX_NUMBER_CHECKS = 200; // distinct prices, ratings and counts looked for in the page text
const MAX_NAME_CHECKS = 25; // distinct product names looked for in it
const MAX_NEEDLE = 100; // characters of a text value that are compared with the page
const MAX_RUN = 18; // digits in a number that is read from the page or from the markup
const MAX_LIST = 1000; // numbers read from one run like 38,40,42
const MAX_ABBR = 2000; // abbreviated numbers (1.2K) kept from one page text
const CRAWL_TEXT_KEPT = 20000; // characters of text crawl.mjs keeps for a page: an older crawl.json does not say when it cut

// Flattens @graph and nested nodes into the objects that have an @type or an @id (a reference such
// as { "@id": "#org" } is one). Iterative and bounded: `limits` may carry maxDepth, maxNodes and
// maxVisits, keeps the counts when it is passed again (one budget for several blocks), and gets
// `capped` ('depth', 'nodes' or 'size') when something was not read.
export function collectNodes(data, out = [], limits = {}) {
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const maxNodes = limits.maxNodes ?? MAX_NODES;
  const maxVisits = limits.maxVisits ?? MAX_VISITS;
  limits.visits ??= 0;
  limits.nodes ??= 0;
  const stack = [[data, 0]];
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (depth >= maxDepth) { limits.capped ??= 'depth'; continue; }
    if (Array.isArray(value)) {
      limits.visits += value.length;
      if (limits.visits > maxVisits) { limits.capped ??= 'size'; break; }
      for (let i = value.length - 1; i >= 0; i--) { const child = value[i]; if (child && typeof child === 'object') stack.push([child, depth + 1]); }
      continue;
    }
    const keys = Object.keys(value);
    limits.visits += keys.length + 1;
    if (limits.visits > maxVisits) { limits.capped ??= 'size'; break; }
    if (value['@type'] || value['@id']) {
      if (limits.nodes >= maxNodes) { limits.capped ??= 'nodes'; break; }
      limits.nodes++;
      out.push(value);
    }
    // @context holds term definitions, not nodes.
    for (let i = keys.length - 1; i >= 0; i--) {
      const child = keys[i] === '@context' ? null : value[keys[i]];
      if (child && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return out;
}

// The status of a type, with what it inherits. Only the table's own entries count: a type named
// "constructor" or "__proto__" in a page is not in it.
export function specFor(type, status) {
  const types = status.types;
  if (typeof type !== 'string' || !Object.hasOwn(types, type)) return null;
  const s = types[type];
  if (s.inherits && Object.hasOwn(types, s.inherits)) return { ...types[s.inherits], ...s, inheritedFrom: s.inherits };
  return s;
}

const hasValue = v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

// A JSON-LD typed value { "@type": "Date", "@value": "2026-10-02" } stands for its @value.
const unwrap = v => (v && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, '@value') ? v['@value'] : v);

// A short description of a value for a message; never the whole of a long string or a deep structure.
const show = v => {
  if (v === '') return 'empty';
  if (typeof v === 'string') return JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}...` : v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  return Array.isArray(v) ? 'a list' : 'an object';
};
const clip = (s, n = 200) => { const x = String(s); return x.length > n ? `${x.slice(0, n)}...` : x; };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):?(\d{2}))?)?$/;

// ISO 8601 date or date-time that is a real calendar date and time ("2026-02-30" and "24:00" are not).
export function isIsoDate(v) {
  if (typeof v !== 'string' || v.length > 40) return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) return false;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59))) return false;
  if (m[8] !== undefined && (Number(m[8]) > 23 || Number(m[9]) > 59)) return false;
  return true;
}

// --- Is a value on the page? ----------------------------------------------------------------
// A number is read as a number: 59 is on a page that says $59.00 or 59, and not on one that says
// $59.99 or 159; 1234 is on a page that says 1,234 or 1.234,00 or 1 234. The page text is read once
// into the set of numbers it holds (a text with n characters costs O(n), however many values are
// asked about), so neither a hostile page nor a hostile value can make this slow. No pattern is
// built from a value.

const isDigit = c => c >= 48 && c <= 57;
const isDot = c => c === 44 || c === 46; // , and .
const isSpaceCode = c => c === 32 || (c >= 9 && c <= 13) || c === 160;
const isLetter = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 0x5d0 && c <= 0x5ea); // Latin and Hebrew
const digitsEnd = (text, i) => { while (i < text.length && isDigit(text.charCodeAt(i))) i++; return i; };
const fractionAt = (text, p) => isDot(text.charCodeAt(p)) && isDigit(text.charCodeAt(p + 1));

// "0059" and "59.00" are the same number as "59": digits without leading or trailing zeros.
const canon = (int, frac) => {
  const i = int.replace(/^0+(?=\d)/, '');
  const f = frac.replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
};

// What follows a number when a page abbreviates it: 1.2K, 12K+, 1.2M, 1.2 thousand, and in Hebrew
// 1.2 elef (thousand) and million. One space may come between. The word must end there.
const HE_THOUSAND = '\u05d0\u05dc\u05e3';
const HE_MILLION = '\u05de\u05d9\u05dc\u05d9\u05d5\u05df';
const SUFFIXES = [['thousand', 1e3], ['million', 1e6], [HE_THOUSAND, 1e3], [HE_MILLION, 1e6], ['k', 1e3], ['m', 1e6]];
function abbreviationAt(text, p) {
  if (isSpaceCode(text.charCodeAt(p))) p++;
  for (const [word, factor] of SUFFIXES) {
    if (text.startsWith(word, p) && !isLetter(text.charCodeAt(p + word.length))) return [factor, p + word.length];
  }
  return null;
}

// Two or more numbers with commas and no spaces ("Sizes 38,40,42", "Rated 4.8,212 reviews") are a list
// unless the run is one number: 1,234 and 1,234,567.5 (thousands), 1.234,50 (the other way round) and
// 49,90 (a decimal comma). Records each part of a list and returns where the run ends, or -1.
const ONE_NUMBER = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+,\d+|\d+,\d{1,2})$/;
function readList(text, start, found) {
  const tokens = [];
  let p = start;
  for (;;) {
    let e = digitsEnd(text, p);
    if (text.charCodeAt(e) === 46 && isDigit(text.charCodeAt(e + 1))) e = digitsEnd(text, e + 1);
    if (e - p > 2 * MAX_RUN + 1 || (text.charCodeAt(e) === 46 && isDigit(text.charCodeAt(e + 1)))) return -1; // too long, or 4.8.1
    tokens.push([p, e]);
    p = e;
    if (text.charCodeAt(p) !== 44 || !isDigit(text.charCodeAt(p + 1)) || tokens.length >= MAX_LIST) break;
    p++;
  }
  if (tokens.length < 2 || ONE_NUMBER.test(text.slice(start, p))) return -1;
  for (const [s, e] of tokens) {
    const part = text.slice(s, e);
    const dot = part.indexOf('.');
    found.add(dot === -1 ? canon(part, '') : canon(part.slice(0, dot), part.slice(dot + 1)));
  }
  return p;
}

// The numbers a text holds, and the abbreviated ones (1.2K) with the value they stand for.
function scanNumbers(text) {
  const found = new Set();
  const abbr = [];
  let i = 0;
  while (i < text.length) {
    if (!isDigit(text.charCodeAt(i))) { i++; continue; }
    const start = i;
    const end = digitsEnd(text, i);
    i = end;
    // The 234 of "1,234" or the 99 of "59.99" belongs to a number that began earlier.
    if (start >= 2 && isDot(text.charCodeAt(start - 1)) && isDigit(text.charCodeAt(start - 2))) continue;
    if (end - start > MAX_RUN) continue;
    const head = text.slice(start, end);
    const listEnd = readList(text, start, found);
    if (listEnd !== -1) { i = listEnd; continue; }
    // As an integer or a decimal ("4.8" but not the start of "4.8.1" or the 59 of "59.99").
    let numEnd = -1;
    let value = head;
    if (fractionAt(text, end)) {
      const fracEnd = digitsEnd(text, end + 1);
      if (!fractionAt(text, fracEnd) && fracEnd - end - 1 <= MAX_RUN) {
        const frac = text.slice(end + 1, fracEnd);
        found.add(canon(head, frac));
        numEnd = fracEnd;
        value = `${head}.${frac}`;
      }
    } else {
      found.add(canon(head, ''));
      numEnd = end;
    }
    if (numEnd !== -1 && abbr.length < MAX_ABBR) {
      const a = abbreviationAt(text, numEnd);
      if (a) abbr.push({ approx: Number(value) * a[0], shown: text.slice(start, a[1]) });
    }
    // As the start of a grouped number: 1,234  1.234.567  1 234  1'234, with a decimal part after it.
    if (head.length <= 3) {
      const sep = text.charCodeAt(end);
      if (isDot(sep) || sep === 32 || sep === 39) {
        let int = head;
        let pos = end;
        for (let g = 0; g < 5 && text.charCodeAt(pos) === sep && digitsEnd(text, pos + 1) - (pos + 1) === 3; g++) { int += text.slice(pos + 1, pos + 4); pos += 4; }
        if (pos > end) {
          if (fractionAt(text, pos) && text.charCodeAt(pos) !== sep) {
            const fracEnd = digitsEnd(text, pos + 1);
            if (!fractionAt(text, fracEnd) && fracEnd - pos - 1 <= MAX_RUN) found.add(canon(int, text.slice(pos + 1, fracEnd)));
          } else if (!fractionAt(text, pos)) {
            found.add(canon(int, ''));
          }
        }
      }
      // A price split by markup, "$59<sup>99</sup>" (text "$59 99"): whitespace, then exactly two digits.
      if (isSpaceCode(sep)) {
        let q = end + 1;
        while (q < end + 4 && isSpaceCode(text.charCodeAt(q))) q++;
        const centsEnd = digitsEnd(text, q);
        if (centsEnd - q === 2 && !fractionAt(text, centsEnd)) found.add(canon(head, text.slice(q, centsEnd)));
      }
    }
  }
  return { found, abbr };
}

// The forms a numeric value is looked for in, or null when it is not a plain number: 59, "59.00",
// "1,234.5" and "49,90" are; "$59" and "4.8 stars" are text. A rating with more than two decimals
// is also looked for rounded to two and one, as pages show it.
function numericForms(v) {
  let s;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    s = String(v);
  } else if (typeof v === 'string') {
    s = v.trim();
  } else {
    return null;
  }
  if (!s || s.length > MAX_RUN + 6) return null;
  let m;
  let int;
  let frac = '';
  if ((m = /^-?(\d+)(?:\.(\d+))?$/.exec(s))) { int = m[1]; frac = m[2] || ''; }
  else if ((m = /^-?(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/.exec(s))) { int = m[1].replace(/,/g, ''); frac = m[2] || ''; }
  else if ((m = /^-?(\d+),(\d+)$/.exec(s))) { int = m[1]; frac = m[2]; }
  else return null;
  if (int.length > MAX_RUN || frac.length > MAX_RUN) return null;
  const forms = [canon(int, frac)];
  if (frac.replace(/0+$/, '').length > 2) {
    const n = Number(`${int}.${frac}`);
    for (const digits of [2, 1]) { const [i, f = ''] = n.toFixed(digits).split('.'); forms.push(canon(i, f)); }
  }
  return forms;
}

// Curly quotes are straight quotes, every kind of dash is a hyphen and runs of whitespace are one
// space, so a product name matches however the page or the markup spells them.
const normalizeText = s => s
  .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
  .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
  .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
  .replace(/\s+/g, ' ');

// The text and what is worked out from it, kept for the last two texts asked about (a page's body
// text, and its title with the body, are asked about in turn).
const prepared = [];
function prepare(text) {
  const i = prepared.findIndex(p => p.src === text);
  if (i !== -1) return prepared[i];
  if (prepared.length >= 2) prepared.shift();
  prepared.push({ src: text, lower: String(text).toLowerCase(), scan: null, norm: null });
  return prepared[prepared.length - 1];
}

// `text` is the page's visible text. A number is looked for as a number (see above); anything else
// as a case-insensitive substring of its first 100 characters, with entities decoded, quotes and
// dashes made plain and spaces collapsed.
export function valueVisible(value, text) {
  const p = prepare(text);
  const forms = numericForms(value);
  if (forms) {
    p.scan ??= scanNumbers(p.lower);
    return forms.some(f => p.scan.found.has(f));
  }
  const raw = typeof value === 'string' ? value : String(value);
  const needle = normalizeText(decodeEntities(raw.slice(0, 4 * MAX_NEEDLE))).trim().toLowerCase().slice(0, MAX_NEEDLE).trim();
  p.norm ??= normalizeText(p.lower);
  return p.norm.includes(needle);
}

// How a page shows a count in rounded form (1.2K for 1243, 12K+ for 12,345, 1.2M), when that is within
// 5 percent of the value: the text as the page has it ("1.2k"), or null.
function abbreviatedAs(value, text) {
  const forms = numericForms(value);
  const v = forms ? Number(forms[0]) : 0;
  if (!(v > 0)) return null;
  const p = prepare(text);
  p.scan ??= scanNumbers(p.lower);
  const hit = p.scan.abbr.find(a => Math.abs(a.approx - v) <= 0.05 * v);
  return hit ? hit.shown : null;
}

// The value is a number that is zero: 0, "0", "0.00", "0,00".
const isZero = v => numericForms(v)?.[0] === '0';

// What a page says when something is free. Latin words start at a word boundary ("carefree" does
// not count); the Hebrew word may follow a prefix (bechinam, for free).
const FREE_WORD = /(?<!\p{L})(?:free(?!\p{L})|gratis|kostenlos|gratuit)|\u05d7\u05d9\u05e0\u05dd/iu;

// Digits that are not 0-9 (Arabic-Indic, Devanagari, fullwidth ...): this check cannot read them as numbers.
const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/u;

// --- The check ----------------------------------------------------------------------------------

// The types of a node as plain names: "https://schema.org/Product" and "schema:Product" are Product;
// anything that is not a string is not a type.
function typesOf(node) {
  const raw = Array.isArray(node['@type']) ? node['@type'].slice(0, 20) : [node['@type']];
  const out = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const bare = t.slice(0, 200).trim().replace(/^(?:https?:\/\/schema\.org\/|schema:)/i, '');
    if (bare && bare.length <= 100 && !out.includes(bare)) out.push(bare);
  }
  return out;
}

const number = (v, fallback) => {
  v = unwrap(v);
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'number') return v;
  return typeof v === 'string' ? Number(v) : NaN;
};

// facts: what extract() returns (or a crawl saved). textTruncated says the text is only the first
// part of the page, appShell that the page is an empty shell filled by JavaScript: in both a value
// that is not found may still be on the page, so it is reported as unverified, not as missing.
export function checkSchemaFacts(facts, url, status = loadData('schema-status')) {
  const F = [];
  const items = [];
  const seen = new Set();
  const perCode = new Map();
  const dropped = new Map();
  // One finding per message on a page, and at most MAX_PER_CODE of one code.
  const add = (code, severity, label, message, evidence) => {
    const key = `${code}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    const n = (perCode.get(code) || 0) + 1;
    perCode.set(code, n);
    if (n > MAX_PER_CODE) { dropped.set(code, (dropped.get(code) || 0) + 1); return; }
    F.push(finding(code, severity, label, message, evidence));
  };

  const blocks = Array.isArray(facts.jsonld) ? facts.jsonld : [];
  if (!blocks.length) add('NO_JSONLD_STATIC', 'info', 'D', 'JSON-LD not detected in static HTML; it may be injected by JavaScript. Check the rendered page (the Rich Results Test or a browser) before calling it missing', { urls: [url] });
  if (facts.microdata) add('MICRODATA_PRESENT', 'info', 'D', 'Microdata (itemscope) found; this script checks JSON-LD only', { urls: [url] });

  const nodes = [];
  const limits = {};
  blocks.forEach((block, i) => {
    if (block.error) { add('JSONLD_PARSE_ERROR', 'high', 'D', `JSON-LD block ${i + 1} does not parse: ${clip(block.error)}`, { urls: [url], offset: block.offset }); return; }
    if (block.relaxed) add('JSONLD_NOT_STRICT', 'low', 'D', `JSON-LD block ${i + 1} only parses leniently (comments or trailing commas); write it as strict JSON`, { urls: [url], offset: block.offset });
    collectNodes(block.data, nodes, limits);
  });

  // An @id written as "#org" and as the full URL of the page is one id.
  const idKey = id => { try { return new URL(id, url).href; } catch { return id; } };
  const idOf = n => (typeof n['@id'] === 'string' && n['@id'] && n['@id'].length <= 2000 ? n['@id'] : null);
  const defined = new Set();
  for (const n of nodes) { const id = idOf(n); if (id && Object.keys(n).some(k => k !== '@id')) defined.add(idKey(id)); }

  const body = typeof facts.text === 'string' ? facts.text : '';
  const named = `${facts.title || ''} ${body}`;
  const textReason = facts.textTruncated ? 'only the first part of the page text was kept' : facts.appShell ? 'the page is a JavaScript app shell, so its visible text is not in the HTML' : null;
  // Numbers are not found in a text that writes them with other digits, so for numbers that is a reason too.
  let digits;
  const unverified = isNumber => textReason ?? (isNumber && (digits ??= NON_ASCII_DIGIT.test(body)) ? 'the page text uses digits other than 0-9 (such as Arabic-Indic numerals), which this check does not read as numbers' : null);
  // Is there a sign of a star rating? facts.starSignal is the answer extract() read from the HTML (star
  // glyphs in the text, or the word rating or stars in an aria-label, title or alt), and a crawl.json
  // saves it. Facts without it (a crawl.json an older crawl.mjs wrote) are asked with the same patterns
  // (lib/html.mjs) of the text and image alt text they do have; for those the answer is unknown, and
  // only an explicit false means none.
  let star;
  const starSignal = () => (star ??= facts.starSignal === true || STAR_GLYPH.test(body) || (Array.isArray(facts.images) && facts.images.some(i => typeof i?.alt === 'string' && STAR_WORDS.test(i.alt))));
  let free;
  const saysFree = () => (free ??= FREE_WORD.test(body));
  const memo = new Map();
  let numberChecks = 0;
  let nameChecks = 0;
  let checkLimit = false;
  // true, false, or null when the budget of distinct values for this page is spent.
  const visible = (value, text, isName) => {
    const key = `${isName ? 'n' : 'v'}|${typeof value}|${String(value).slice(0, 300)}`;
    if (memo.has(key)) return memo.get(key);
    if (isName ? nameChecks >= MAX_NAME_CHECKS : numberChecks >= MAX_NUMBER_CHECKS) { checkLimit = true; return null; }
    if (isName) nameChecks++; else numberChecks++;
    const r = valueVisible(value, text);
    memo.set(key, r);
    return r;
  };
  const evidenceFor = (property, value) => ({ urls: [url], property, value: typeof value === 'string' ? clip(value) : value });
  // A value that is not in the page text. Where the text cannot be trusted that is unverified, not missing.
  const notVisible = (typeName, property, value, severity, isNumber = true) => {
    const reason = unverified(isNumber);
    if (reason) {
      add('VALUE_UNVERIFIED', 'info', 'H', `${typeName}.${property} = ${show(value)} was not found in the page text this check has, but ${reason}, so it may still be on the page. Check it on the page itself`, evidenceFor(property, value));
    } else {
      const rule = isNumber ? "a price that is not on the page breaks Google's structured data guidelines" : 'the name should be the one the page shows';
      add('VALUE_NOT_VISIBLE', severity, 'D', `${typeName}.${property} = ${show(value)} does not appear in the static HTML text of the page. Markup must match what users see: ${rule}. If JavaScript fills it in, check the rendered page`, evidenceFor(property, value));
    }
  };
  // A rating, rating count or review count that is not in the page text. Certain (high) only when
  // nothing else points to a rating: not the other number, not stars. Review widgets often draw
  // ratings with JavaScript, so any such sign makes it a hypothesis (medium) to check on the rendered page.
  const ratingNotVisible = (typeName, key, value, node) => {
    const reason = unverified(true);
    if (reason) return notVisible(typeName, key, value, 'high');
    let why = key === 'ratingValue' ? null : (shown => (shown ? `the page shows ${shown}, a rounded form of it` : null))(abbreviatedAs(value, body));
    for (const other of RATING_KEYS) {
      if (why || other === key) continue;
      const v = unwrap(node[other]);
      if (!hasValue(v) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      // null (the budget of values is spent) counts as found: it is not certain that it is missing.
      if (visible(v, body, false) !== false) why = `the page shows the ${RATING_NAMES[other]} ${show(v)}`;
      else if (other !== 'ratingValue' && abbreviatedAs(v, body)) why = `the page shows the ${RATING_NAMES[other]} as ${abbreviatedAs(v, body)}, a rounded form of it`;
    }
    if (!why && starSignal()) why = 'the page shows stars, or has an element labelled or named as a rating (an aria-label, title, alt, class, id, itemprop or data-rating)';
    if (!why && facts.starSignal !== false) why = 'this check has only the text and image alt text of the page (this crawl.json does not say whether an aria-label or title mentions stars), so it cannot see stars drawn with an aria-label or title';
    const head = `${typeName}.${key} = ${show(value)} was not found in the static HTML of the page`;
    const widgets = 'Review widgets often draw ratings with JavaScript, so check the rendered page';
    if (why) add('VALUE_NOT_VISIBLE', 'medium', 'H', `${head}, but ${why}. ${widgets} and that the number users see is the one in the markup`, evidenceFor(key, value));
    else add('VALUE_NOT_VISIBLE', 'high', 'D', `${head}, and nothing else on the page points to a rating (no other rating number, no stars). ${widgets} first; if users really cannot see this rating, remove it from the markup: a rating that is not on the page breaks Google's structured data guidelines`, evidenceFor(key, value));
  };
  // The page's own address without its fragment: the only place an @id can be checked against.
  const here = (() => { try { const u = new URL(url); u.hash = ''; return u.href; } catch { return null; } })();
  const onThisPage = id => {
    if (id.startsWith('_:')) return true; // a blank node belongs to its document
    try { const u = new URL(id, url); u.hash = ''; return here !== null && u.href === here; } catch { return false; }
  };
  // The most specific type of a node that the status table knows: not Thing, and not the parent
  // (LocalBusiness) of another listed type (Restaurant).
  const labelOf = types => {
    const known = types.filter(t => specFor(t, status));
    return known.find(t => !known.some(o => o !== t && specFor(o, status).inheritedFrom === t)) ?? known[0] ?? types.find(t => t !== 'Thing') ?? types[0];
  };

  for (const n of nodes) {
    const id = idOf(n);
    const types = typesOf(n);
    if (!types.length) {
      // An id of schema.org (InStock), of another host or of another page of this site is defined
      // somewhere this check does not look, so only an id that points into this page can be dangling.
      if (id && !defined.has(idKey(id)) && onThisPage(id)) add('DANGLING_ID', 'low', 'D', `@id "${clip(id, 100)}" is referenced but not defined on this page (no node of its JSON-LD has that @id)`, { urls: [url], id: clip(id, 100) });
      continue;
    }
    const label = labelOf(types);
    for (const t of types) {
      const spec = specFor(t, status);
      const item = { type: t, id, richResult: spec?.richResult || 'unknown', missing: [] };
      if (spec && (spec.richResult === 'retired' || spec.richResult === 'dataset-search-only')) {
        const date = spec.since && !String(spec.note || '').includes(spec.since) ? ` (${spec.since})` : '';
        const what = spec.richResult === 'dataset-search-only'
          ? `${t} is valid markup, with no rich result in Google Search; it is used by Dataset Search${date}`
          : `${t} is valid markup, but Google shows no rich result for it: ${spec.note || spec.richResult}${date}`;
        add('RICH_RESULT_RETIRED', 'info', 'D', `${what}. Keep it only if it describes the page honestly; it is not a ranking or AI lever`, { urls: [url], type: t });
      }
      if (Array.isArray(spec?.required)) for (const group of spec.required) if (!group.some(k => hasValue(n[k]))) item.missing.push(group.join(' or '));
      if (item.missing.length && spec?.richResult === 'active') add('REQUIRED_MISSING', 'medium', 'D', `${t} is missing ${item.missing.join(', ')}, which its rich result requires`, { urls: [url], type: t });
      if (spec?.selfServingReviews && (hasValue(n.aggregateRating) || hasValue(n.review))) add('SELF_SERVING_REVIEW', 'medium', 'D', `${t} carries ratings about itself; Google does not show review stars for reviews a business publishes about itself`, { urls: [url], type: t });
      if (PRICED.has(t) && hasValue(unwrap(n.price ?? n.lowPrice)) && !hasValue(unwrap(n.priceCurrency))) add('PRICE_NO_CURRENCY', 'medium', 'D', `${t} has a price but no priceCurrency`, { urls: [url], type: t });
      if ((t === 'AggregateRating' || t === 'Rating') && hasValue(unwrap(n.ratingValue))) {
        const rv = number(n.ratingValue);
        const best = number(n.bestRating, 5);
        const worst = number(n.worstRating, 1);
        if (!Number.isFinite(rv)) add('RATING_OUT_OF_RANGE', 'medium', 'D', `${t}.ratingValue ${show(unwrap(n.ratingValue))} is not a number`, { urls: [url], type: t });
        else if (Number.isFinite(best) && Number.isFinite(worst) && !(rv >= worst && rv <= best)) add('RATING_OUT_OF_RANGE', 'medium', 'D', `${t}.ratingValue ${rv} is outside ${worst} to ${best}`, { urls: [url], type: t });
      }
      items.push(item);
    }
    for (const k of DATE_KEYS) {
      if (!Object.hasOwn(n, k)) continue;
      const v = unwrap(n[k]);
      if (!isIsoDate(v)) add('INVALID_DATE', 'medium', 'D', `${label}.${k} is not an ISO 8601 date (${show(v)})`, { urls: [url], property: k });
    }
    for (const [k, severity] of VISIBLE_KEYS) {
      const v = unwrap(n[k]);
      if (!hasValue(v) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      if (visible(v, body, false) !== false) continue;
      if (!PRICE_KEYS.has(k)) { ratingNotVisible(label, k, v, n); continue; }
      // Google asks for price 0 on a free item, and a page says "free" in words as often as "$0".
      if (isZero(v)) {
        if (!saysFree()) add('VALUE_UNVERIFIED', 'info', 'H', `${label}.${k} = ${show(v)} is how Google wants a free item written, but the page text this check has shows neither a 0 nor the word "free" (or gratis, kostenlos, gratuit). If the item is free, say so on the page; check it on the page itself`, evidenceFor(k, v));
        continue;
      }
      notVisible(label, k, v, severity);
    }
    if (types.includes('Product')) {
      const v = unwrap(n.name);
      if (typeof v === 'string' && hasValue(v) && visible(v, named, true) === false) notVisible('Product', 'name', v, 'low', false);
    }
  }

  const notes = [];
  if (limits.capped === 'depth') notes.push(`structured data nested more than ${MAX_DEPTH} levels deep was not read`);
  if (limits.capped === 'nodes') notes.push(`only the first ${MAX_NODES} nodes were read`);
  if (limits.capped === 'size') notes.push(`the JSON-LD is larger than this check reads (more than ${MAX_VISITS} entries), so only the first part was read`);
  if (checkLimit) notes.push(`only the first ${MAX_NUMBER_CHECKS} prices, ratings and counts (and ${MAX_NAME_CHECKS} names) were compared with the page text`);
  for (const [code, count] of dropped) notes.push(`${count} more ${code} finding${count === 1 ? ' was' : 's were'} not listed`);
  if (notes.length) F.push(finding('SCHEMA_LIMIT', 'info', 'D', `This page's structured data is bigger than this check reads: ${notes.join('; ')}. What was read is reported; the rest is unchecked, not clean`, { urls: [url] }));
  return { url, nodes: nodes.length, items, findings: F };
}

export function checkSchemaHtml(html, url, status) {
  return checkSchemaFacts(extract(html, url), url, status);
}

// One finding per code and message with every page it was found on, for the Markdown summary of
// many pages (a template defect is one line, not one per page). The JSON keeps each page's own findings.
export function mergeFindings(results) {
  const merged = new Map();
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.code}|${f.severity}|${f.message}`;
      const have = merged.get(key);
      if (!have) merged.set(key, { ...f, evidence: { ...f.evidence, urls: [...(f.evidence.urls || [])] } });
      else for (const u of f.evidence.urls || []) if (!have.evidence.urls.includes(u)) have.evidence.urls.push(u);
    }
  }
  return [...merged.values()];
}

// --- Command line -------------------------------------------------------------------------------

// Git Bash turns an argument such as /tmp/page.html into C:/Program Files/Git/tmp/page.html before node starts.
const REWRITTEN_BY_GIT_BASH = /^[A-Za-z]:[\\/](?:Program Files(?: \(x86\))?[\\/]Git|msys(?:32|64)|cygwin(?:64)?)(?:[\\/]|$)/i;
const GIT_BASH_HINT = 'Run the command with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash';
const rewrittenByGitBash = p => REWRITTEN_BY_GIT_BASH.test(p);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const fail = (message, code = 1) => { console.error(message); process.exit(code); };
  if (args.help) { console.log(HELP); process.exit(0); }
  const unknown = Object.keys(args).filter(k => k !== '_' && !CLI_OPTIONS.includes(k));
  if (unknown.length) fail(`Unknown option --${unknown[0]}. Options: ${CLI_OPTIONS.map(o => `--${o}`).join(', ')}. Run with --help for usage.`);
  const target = args._[0];
  const crawlFile = args['from-crawl'];
  if (crawlFile !== undefined && (typeof crawlFile !== 'string' || !crawlFile.trim())) fail('--from-crawl needs the path of a crawl.json');
  if (target === undefined && crawlFile === undefined) { console.log(HELP); process.exit(1); }
  if (target !== undefined && crawlFile !== undefined) fail('Give either a URL or a file, or --from-crawl, not both.');
  if (args.out !== undefined && (typeof args.out !== 'string' || !args.out.trim())) fail('--out needs a folder');
  const out = typeof args.out === 'string' ? args.out : 'seo/schema';
  // A folder that is not there and that sits in Git's own folders is not one the user chose: Git Bash rewrote /tmp/x.
  if (rewrittenByGitBash(out) && !fs.existsSync(out)) fail(`--out "${out}" looks like a path that Git Bash rewrote (an argument that starts with / becomes one like it). ${GIT_BASH_HINT}`);

  const results = [];
  let source = '';
  if (crawlFile !== undefined) {
    let crawl;
    try { crawl = JSON.parse(fs.readFileSync(crawlFile, 'utf8')); } catch (e) {
      fail(e && e.code === 'ENOENT' ? `Could not read ${crawlFile}: no such file` : `${crawlFile} is not valid JSON or cannot be read (${clip(e.message, 100)}); it should be the crawl.json that crawl.mjs wrote`);
    }
    if (!crawl || !Array.isArray(crawl.pages)) fail(`${crawlFile} has no pages list; it should be the crawl.json that crawl.mjs wrote`);
    for (const p of crawl.pages) {
      if (!p || typeof p !== 'object' || !p.facts || typeof p.facts !== 'object') continue;
      const url = p.finalUrl || p.url;
      if (typeof url !== 'string') continue;
      // A page the fetcher cut off has a cut-off text as well.
      // An older crawl.json does not say when it cut the text: a text of exactly the length crawl.mjs keeps was cut.
      const cut = p.truncated || (typeof p.facts.text === 'string' && p.facts.text.length >= CRAWL_TEXT_KEPT);
      const facts = cut && !p.facts.textTruncated ? { ...p.facts, textTruncated: true } : p.facts;
      results.push(checkSchemaFacts(facts, url));
    }
    source = `Pages come from ${crawlFile}.`;
  } else if (/^https?:\/\//i.test(target)) {
    let origin;
    let hostname;
    try { ({ origin, hostname } = new URL(target)); } catch { fail(`not a URL: "${target}"`); }
    const r = await createFetcher({ delayMs: 0, allowLocalOrigin: isLocalHost(hostname) ? origin : null }).get(target);
    if (r.error || r.status !== 200) fail(`Could not fetch ${target}: ${r.error || `HTTP ${r.status}`}`, 2);
    const type = String(r.headers['content-type'] || '');
    if (type && !/html|xml/i.test(type)) fail(`${target} is not an HTML page (content-type ${clip(type, 60)})`, 2);
    const facts = extract(r.body, r.finalUrl);
    if (r.truncated) facts.textTruncated = true;
    results.push(checkSchemaFacts(facts, r.finalUrl));
  } else {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) fail(`"${target}" is not an http(s) URL or a local HTML file`);
    let stat = null;
    try { stat = fs.statSync(target); } catch { /* said below */ }
    if (!stat) {
      // Only a file that is not there is blamed on Git Bash: a page that really is in Git's folders is checked.
      if (rewrittenByGitBash(target)) fail(`"${target}" is not there, and it looks like a path that Git Bash rewrote (an argument that starts with / becomes one like it). ${GIT_BASH_HINT}`);
      const hint = /^[A-Za-z]:\//.test(target)
        ? ' If you wrote a path that starts with / in Git Bash, it was rewritten into this one: run with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash.'
        : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(target) ? ' For a site write the full URL, such as https://example.com/page.' : '';
      fail(`File not found: ${target}.${hint}`);
    }
    if (!stat.isFile()) fail(`${target} is not a file`);
    if (stat.size > MAX_FILE_BYTES) fail(`${target} is larger than ${MAX_FILE_BYTES / 1048576} MB`);
    results.push(checkSchemaHtml(fs.readFileSync(target, 'utf8'), pathToFileURL(path.resolve(target)).href));
  }

  const all = results.flatMap(r => r.findings);
  const nodes = results.reduce((n, r) => n + r.nodes, 0);
  const notes = [
    `${results.length} page${results.length === 1 ? '' : 's'} checked, ${nodes} JSON-LD node${nodes === 1 ? '' : 's'}. Raw HTML only: markup that JavaScript adds is not seen here, so check the rendered page before calling any of it missing.`,
    ...(source ? [source] : []),
    ...(results.length ? [] : ['No page in this crawl has page data to check (pages that were skipped, blocked or not HTML carry none).']),
  ];
  try {
    writeJson(path.join(out, 'schema.json'), results);
    writeText(path.join(out, 'schema.md'), findingsMarkdown('Structured data', mergeFindings(results), notes));
  } catch (e) {
    fail(`Could not write the report to ${out}: ${clip(e && e.message, 150)}`, 2);
  }
  console.log(`${all.length} findings on ${results.length} page${results.length === 1 ? '' : 's'}. Wrote ${path.join(out, 'schema.md')}`);
}
