// Tolerant HTML extraction without a DOM library. Works on raw HTML only (no JavaScript),
// which is what most AI crawlers see. Comments, script/style/noscript/template/textarea
// contents and inline SVG are masked (same length) so offsets stay true to the original.
//
// The input is untrusted, so nothing here may backtrack. A lazy "<open ...>[\s\S]*?</close>"
// pattern rescans to the end of the input for every opener that is never closed, which is
// quadratic on a hostile page. Tags and elements are found with indexOf and a closer search
// that is cached per kind instead: when no closer follows one opener, none follows a later one.

// Named entities. A Map, so a name like "constructor" or "__proto__" is simply unknown. Names are
// case-sensitive (&Eacute; and &eacute; differ). Latin-1 is U+00A0..U+00FF in order; the rest is the
// punctuation and symbols that turn up in titles and body text. Unknown names are left untouched.
const LATIN1 = ('nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml').split(' ');
const ENTITIES = new Map(LATIN1.map((name, i) => [name, String.fromCharCode(0xa0 + i)]));
for (const [name, ch] of Object.entries({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a',
  ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e', lsaquo: '\u2039', rsaquo: '\u203a', bull: '\u2022',
  dagger: '\u2020', Dagger: '\u2021', permil: '\u2030', prime: '\u2032', Prime: '\u2033',
  trade: '\u2122', euro: '\u20ac', check: '\u2713', minus: '\u2212', ne: '\u2260', le: '\u2264',
  ge: '\u2265', infin: '\u221e', larr: '\u2190', uarr: '\u2191', rarr: '\u2192', darr: '\u2193', harr: '\u2194',
  hearts: '\u2665', spades: '\u2660', clubs: '\u2663', diams: '\u2666',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f',
  excl: '!', num: '#', dollar: '$', percnt: '%', lpar: '(', rpar: ')', ast: '*', plus: '+', comma: ',', period: '.',
  sol: '/', colon: ':', semi: ';', equals: '=', quest: '?', commat: '@', lbrack: '[', rbrack: ']', lowbar: '_',
  lbrace: '{', rbrace: '}', vert: '|',
})) ENTITIES.set(name, ch);
// The markup entities were always matched without regard to case: &AMP; and &Lt; keep working.
const CASE_BLIND = new Set(['amp', 'lt', 'gt', 'quot', 'apos', 'nbsp']);

const namedEntity = name => {
  const hit = ENTITIES.get(name);
  if (hit !== undefined) return hit;
  const lower = name.toLowerCase();
  return CASE_BLIND.has(lower) ? ENTITIES.get(lower) : undefined;
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return namedEntity(e) ?? m;
  });
}

export function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function hostKey(url) {
  return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
}

const blank = s => s.replace(/[^\n]/g, ' ');

const isSpace = c => c === 32 || (c >= 9 && c <= 13);

// The index of the '>' that ends a tag whose attributes start at `from`, or -1 when no '>' follows.
// A quote opens a value only right after '=' and optional whitespace, and a '>' inside it does not end
// the tag: <a x-show="n > 0" href="/x">. An unquoted value runs to whitespace or '>', so a stray quote
// inside it opens nothing. A quote that is never closed is not searched for again: `noClose` keeps the
// first position from which no such quote exists, so a hostile page cannot make every later tag rescan
// to the end of the input. That tag then ends at the first '>' that is not inside a closed value.
// Make one tagMemo() per scan over a string.
const tagMemo = () => ({ '"': Infinity, "'": Infinity });
function tagEnd(src, from, noClose) {
  let end = src.indexOf('>', from);
  if (end === -1) return -1;
  let i = from;
  while (i < end) {
    if (src.charCodeAt(i++) !== 61) continue; // not '='
    while (i < end && isSpace(src.charCodeAt(i))) i++;
    const q = src[i];
    if (q !== '"' && q !== "'") { // an unquoted value, or none
      while (i < end && !isSpace(src.charCodeAt(i))) i++;
      continue;
    }
    const open = i + 1;
    const close = open >= noClose[q] ? -1 : src.indexOf(q, open);
    if (close === -1) { noClose[q] = Math.min(noClose[q], open); return end; }
    if (close > end) { // the '>' was inside the value: the tag ends at the next one
      const next = src.indexOf('>', close + 1);
      if (next === -1) return end;
      end = next;
    }
    i = close + 1;
  }
  return end;
}

// One pass in document order, so a "<!--" inside a script is script text and a "<script>" inside a
// comment is comment text, as in a browser. An opener without a closer is left as it is.
function mask(html) {
  const open = /<(?:(!--)|(script|style|noscript|template|textarea)\b|(svg)\b)/gi;
  const closers = new Map(); // kind -> closer regex, or null once a search failed
  const noClose = tagMemo();
  const ranges = [];
  let m;
  while ((m = open.exec(html))) {
    const kind = m[1] ? 'comment' : m[2] ? m[2].toLowerCase() : 'svg';
    let close = closers.get(kind);
    if (close === null) continue;
    let innerStart = open.lastIndex; // where the closer search starts
    if (kind === 'comment') innerStart = m.index + 4;
    else if (kind !== 'svg') {
      const gt = tagEnd(html, open.lastIndex, noClose);
      if (gt === -1) break; // no '>' left, so nothing after this point can be closed
      innerStart = gt + 1;
    }
    if (!close) {
      close = new RegExp(kind === 'comment' ? '-->' : '<\\/' + kind + '\\s*>', 'gi');
      closers.set(kind, close);
    }
    close.lastIndex = innerStart;
    const c = close.exec(html);
    if (!c) { closers.set(kind, null); continue; }
    // Comments and svg are blanked whole; raw-text elements keep their own open and close tags.
    ranges.push(kind === 'comment' || kind === 'svg' ? [m.index, close.lastIndex] : [innerStart, c.index]);
    open.lastIndex = close.lastIndex;
  }
  let out = '';
  let pos = 0;
  for (const [from, to] of ranges) { out += html.slice(pos, from) + blank(html.slice(from, to)); pos = to; }
  return out + html.slice(pos);
}

// Opening tags <name ...>, like /<name\b([^>]*)>/gi but quote-aware (see tagEnd). Yields {index, attrs, end}.
function* openTags(src, name) {
  const open = new RegExp('<' + name + '\\b', 'gi');
  const noClose = tagMemo();
  let m;
  while ((m = open.exec(src))) {
    const gt = tagEnd(src, open.lastIndex, noClose);
    if (gt === -1) return;
    yield { index: m.index, attrs: src.slice(open.lastIndex, gt), end: gt + 1 };
    open.lastIndex = gt + 1;
  }
}

// Elements <name ...>inner</name> (first closer wins), like
// /<name\b([^>]*)>([\s\S]*?)<\/name\s*>/gi but with a quote-aware tag end. Yields
// {index, attrs, from, to, end}, inner is src.slice(from, to).
function* elements(src, name) {
  const open = new RegExp('<' + name + '\\b', 'gi');
  const close = new RegExp('<\\/' + name + '\\s*>', 'gi');
  const noClose = tagMemo();
  let m;
  while ((m = open.exec(src))) {
    const gt = tagEnd(src, open.lastIndex, noClose);
    if (gt === -1) return;
    close.lastIndex = gt + 1;
    const c = close.exec(src);
    if (!c) return; // no closer after this opener means none after any later one
    yield { index: m.index, attrs: src.slice(open.lastIndex, gt), from: gt + 1, to: c.index, end: close.lastIndex };
    open.lastIndex = close.lastIndex;
  }
}

// A '<' starts a tag only before a letter, '/', '!' or '?': "if x < 5 and y > 3" is prose.
const isTagStart = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 47 || c === 33 || c === 63;

// Replaces every tag with a space, without rescanning to the end for every '<' that has no '>'.
function stripTags(s) {
  const noClose = tagMemo();
  let out = '';
  let pos = 0; // start of the text not yet copied
  let from = 0; // where the next '<' is looked for
  for (;;) {
    const lt = s.indexOf('<', from);
    if (lt === -1) break;
    if (!isTagStart(s.charCodeAt(lt + 1))) { from = lt + 1; continue; }
    const gt = tagEnd(s, lt + 1, noClose);
    if (gt === -1) break; // no '>' left, so no later '<' can be closed either
    out += s.slice(pos, lt) + ' ';
    pos = from = gt + 1;
  }
  return out + s.slice(pos);
}

const clean = s => decodeEntities(stripTags(String(s))).replace(/\s+/g, ' ').trim();

// Same as s.replace(/\/\*[\s\S]*?\*\//g, '').
function stripBlockComments(s) {
  let out = '';
  let pos = 0;
  for (;;) {
    const from = s.indexOf('/*', pos);
    if (from === -1) break;
    const to = s.indexOf('*/', from + 2);
    if (to === -1) break;
    out += s.slice(pos, from);
    pos = to + 2;
  }
  return out + s.slice(pos);
}

export function parseJsonLd(raw) {
  const text = String(raw).trim().replace(/^<!--/, '').replace(/-->$/, '').trim();
  try {
    return { raw: text, data: JSON.parse(text), error: null };
  } catch (e1) {
    const relaxed = stripBlockComments(text).replace(/,\s*([}\]])/g, '$1');
    try {
      return { raw: text, data: JSON.parse(relaxed), error: null, relaxed: true };
    } catch {
      return { raw: text, data: null, error: e1.message };
    }
  }
}

// Something on a page that points to a star rating: star glyphs in the text (U+2605, U+2606, U+2B50), or
// the word rating, rated or stars (or the Hebrew words) in an aria-label, title or image alt, or in a name
// the page gives an element: a class, an id, an itemprop, or a data- attribute (data-rating) whose name or
// value says so. Written with or without quotes, and in camel case (starRating). This is the one
// definition of that rule. extract() answers it in facts.starSignal, which a crawl saves (it keeps no
// aria-label, title, class or id), and schema-check.mjs uses the same patterns for facts that carry no answer.
// A sign is a reason to doubt "no rating on this page", never proof of one: a widget with such a name may
// draw nothing, so the answer only moves a finding from certain to "check the rendered page".
// The scan reads the raw HTML once, with no pattern that rescans: a quote that is never closed can fail
// only once per quote character, an unquoted value stops at the first space, and a data- name is capped at
// 64 characters (a run of "data-data-data-" would otherwise be rescanned from every start), so it stays
// linear on a hostile page.
export const STAR_GLYPH = /[\u2605\u2606\u2b50]/;
export const STAR_WORDS = /(?<!\p{L})(?:ratings?|rated|stars?)(?!\p{L})|\u05d3\u05d9\u05e8\u05d5\u05d2|\u05db\u05d5\u05db\u05d1/iu;
const SIGN_ATTR = /\b(aria-label|title|alt|class|id|itemprop|data-[a-z0-9_-]{0,64})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/gi;
const CAMEL_EDGE = /(\p{Ll})(\p{Lu})/gu;
function hasStarSignal(html, text) {
  if (STAR_GLYPH.test(text)) return true;
  for (const m of html.matchAll(SIGN_ATTR)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    // aria-label, title and alt are phrases; the others are names, so starRating is read as "star Rating".
    const words = name === 'aria-label' || name === 'title' || name === 'alt' ? value : value.replace(CAMEL_EDGE, '$1 $2');
    if (STAR_WORDS.test(words)) return true;
    if (name.startsWith('data-') && STAR_WORDS.test(name)) return true;
  }
  return false;
}

const APP_IDS = new Set(['root', 'app', '__next', '__nuxt']);
const EMPTY_DIV_CLOSE = /\s*<\/div\s*>/y;

export function extract(html, baseUrl) {
  html = String(html ?? '');
  const masked = mask(html);
  // UTF-8 byte offset of a UTF-16 index. Incremental, so many ascending calls cost one pass.
  let curIdx = 0;
  let curBytes = 0;
  const byteAt = i => {
    if (i < curIdx) { curIdx = 0; curBytes = 0; }
    curBytes += Buffer.byteLength(html.slice(curIdx, i), 'utf8');
    curIdx = i;
    return curBytes;
  };
  const headEnd = masked.search(/<\/head\s*>|<body\b/i);
  const headEndIdx = headEnd === -1 ? masked.length : headEnd;

  let base = baseUrl;
  const baseTag = openTags(masked, 'base').next().value;
  if (baseTag) {
    const href = parseAttrs(baseTag.attrs).href;
    if (href) { try { base = new URL(href, baseUrl).href; } catch { /* keep baseUrl */ } }
  }
  const abs = href => {
    try {
      const u = new URL(String(href).trim(), base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      u.hash = '';
      return u.href;
    } catch { return null; }
  };
  const siteHost = (() => { try { return hostKey(baseUrl); } catch { return null; } })();

  const facts = {
    lang: null, dir: null, title: null, titleCount: 0, metaDescription: null, descriptionCount: 0,
    metaRobots: [], robotsMetaOutsideHead: false, viewport: null, canonical: null, canonicals: [],
    hreflang: [], ogImage: null, headings: { h1: [], h2: [], h3: [] }, links: [], images: [], jsonld: [],
    wordCount: 0, text: '', appShell: false, microdata: false, starSignal: false,
    offsets: { title: null, canonical: null, metaRobots: null, firstJsonld: null },
    bytes: { total: Buffer.byteLength(html, 'utf8'), scripts: 0, inlineBase64: 0 },
  };

  const htmlTag = openTags(masked, 'html').next().value;
  if (htmlTag) { const a = parseAttrs(htmlTag.attrs); facts.lang = a.lang || null; facts.dir = a.dir || null; }

  for (const t of elements(masked, 'title')) {
    if (facts.titleCount++ === 0) { facts.title = clean(masked.slice(t.from, t.to)); facts.offsets.title = byteAt(t.index); }
  }

  for (const m of openTags(masked, 'meta')) {
    const a = parseAttrs(m.attrs);
    const name = (a.name || '').toLowerCase();
    const prop = (a.property || '').toLowerCase();
    if (name === 'description') {
      facts.descriptionCount++;
      if (facts.metaDescription === null) facts.metaDescription = (a.content || '').trim();
    } else if (name === 'robots' || name === 'googlebot') {
      // A loop: push(...tokens) overflows the call stack on a list of hundreds of thousands of tokens.
      for (const token of (a.content || '').toLowerCase().split(',')) { const t = token.trim(); if (t) facts.metaRobots.push(t); }
      if (facts.offsets.metaRobots === null) facts.offsets.metaRobots = byteAt(m.index);
      if (m.index > headEndIdx) facts.robotsMetaOutsideHead = true;
    } else if (name === 'viewport') {
      facts.viewport = a.content || '';
    } else if (prop === 'og:image' && !facts.ogImage) {
      // abs('') would resolve to the page itself, so an empty content stays null
      facts.ogImage = (a.content || '').trim() ? abs(a.content) : null;
    }
  }
  facts.microdata = /\bitemscope\b/i.test(masked);

  for (const m of openTags(masked, 'link')) {
    const a = parseAttrs(m.attrs);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && a.href) {
      const href = abs(a.href);
      if (href) { facts.canonicals.push(href); if (facts.offsets.canonical === null) facts.offsets.canonical = byteAt(m.index); }
    }
    if (rel.includes('alternate') && a.hreflang && a.href) facts.hreflang.push({ lang: a.hreflang.trim(), href: abs(a.href) });
  }
  facts.canonical = facts.canonicals[0] ?? null;

  for (const level of [1, 2, 3]) {
    for (const h of elements(masked, 'h' + level)) facts.headings['h' + level].push(clean(masked.slice(h.from, h.to)));
  }

  for (const el of elements(masked, 'a')) {
    const a = parseAttrs(el.attrs);
    if (!a.href) continue;
    const href = abs(a.href);
    if (!href) continue;
    const inner = masked.slice(el.from, el.to);
    let text = clean(inner);
    if (!text) { const img = openTags(inner, 'img').next().value; if (img) text = (parseAttrs(img.attrs).alt || '').trim(); }
    const rel = (a.rel || '').toLowerCase();
    let internal = false;
    try { internal = siteHost !== null && hostKey(href) === siteHost; } catch { internal = false; }
    facts.links.push({ href, text, rel, nofollow: /\bnofollow\b/.test(rel), internal });
  }

  for (const m of openTags(masked, 'img')) {
    const a = parseAttrs(m.attrs);
    facts.images.push({
      src: a.src ? (a.src.startsWith('data:') ? 'data:' : abs(a.src)) : null,
      alt: 'alt' in a ? a.alt : null,
      width: a.width ?? null, height: a.height ?? null, loading: a.loading ?? null, fetchpriority: a.fetchpriority ?? null,
    });
  }

  // Scripts are found in the masked copy, so one inside a comment is skipped, and read from the original.
  for (const s of elements(masked, 'script')) {
    const a = parseAttrs(s.attrs);
    const inner = html.slice(s.from, s.to);
    facts.bytes.scripts += Buffer.byteLength(inner, 'utf8');
    if ((a.type || '').toLowerCase().includes('ld+json')) {
      const offset = byteAt(s.index);
      if (facts.offsets.firstJsonld === null) facts.offsets.firstJsonld = offset;
      facts.jsonld.push({ ...parseJsonLd(inner), offset });
    }
  }

  const bodyTag = openTags(masked, 'body').next().value;
  const bodyStart = bodyTag ? bodyTag.end : (headEnd === -1 ? 0 : headEndIdx);
  facts.text = clean(masked.slice(bodyStart));
  facts.wordCount = facts.text ? facts.text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0;
  facts.starSignal = hasStarSignal(html, facts.text);
  // An empty root container: <div id="root|app|__next|__nuxt"> with nothing inside.
  for (const d of openTags(masked, 'div')) {
    if (!APP_IDS.has((parseAttrs(d.attrs).id || '').toLowerCase())) continue;
    EMPTY_DIV_CLOSE.lastIndex = d.end;
    if (EMPTY_DIV_CLOSE.test(masked)) { facts.appShell = true; break; }
  }
  for (const m of html.matchAll(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g)) facts.bytes.inlineBase64 += m[0].length;
  return facts;
}
