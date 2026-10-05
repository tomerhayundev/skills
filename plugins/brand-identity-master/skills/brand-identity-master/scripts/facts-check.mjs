#!/usr/bin/env node
// Checks every text on a rendered board against what the brand actually said. Numbers, dates, prices, contacts,
// ratings and sentences with no source are failures; so are cliches and emojis.
import path from 'node:path';
import { parseArgs, isMain, readJson, writeJson } from './lib/cli.mjs';
import { loadData, EMOJI, clicheRe } from './lib/brand.mjs';

// Technical values that system text may hold. Order matters: "44 / 52 px" must go before "52 px".
const SYSTEM_TOKENS = [
  /#[0-9A-F]{6}\b/gi,
  /\bRGB\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/gi,
  /\b\d{2,3}\s*\/\s*\d{2,3}\b/g,
  /\d+(?:\.\d+)?\s*(?:px|mm|pt|em|%|:1|x|units?)(?![a-z])/gi,
  /\b(?:50|950|[1-9]00)\b/g,
  /\b\d\.\d+\b/g,
  /^\s*\d{1,2}\s*$/g,
];

const PATTERNS = [
  ['CURRENCY', /[$\u20AC\u00A3\u20AA\u00A5]|\b(?:USD|EUR|GBP|ILS|NIS)\b|\u05E9["\u05F4]\u05D7/i, 'a price or currency'],
  ['PERCENT', /\d\s*%/, 'a percentage'],
  ['SINCE', /\b(?:since|est\.?|established|founded)\b|\u05DE\u05D0\u05D6|\u05E0\u05D5\u05E1\u05D3/i, 'a founding claim'],
  ['YEAR', /\b(?:19|20)\d{2}\b/, 'a year'],
  ['EMAIL', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, 'an email address'],
  ['PHONE', /\+?\d[\d\s().-]{6,}\d/, 'a phone number'],
  ['RATING', /[\u2605\u2606]|\b\d(?:\.\d)?\s*(?:\/\s*5|stars?)\b/i, 'a rating'],
];

export const norm = (s) => String(s).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^["'\u201C\u201D\u2018\u2019]+/, '').replace(/[.!?,;:"'\u201C\u201D\u2018\u2019]+$/, '');

export function knownTexts(brand, data) {
  const k = new Set();
  const add = (v) => { if (typeof v === 'string' && v.trim()) k.add(norm(v)); };
  add(brand.identity?.name); add(brand.identity?.sector); add(brand.identity?.audience);
  (brand.atmosphere?.mood || []).forEach(add); (brand.atmosphere?.avoid || []).forEach(add); add(brand.atmosphere?.feelsLike);
  const v = brand.voice || {};
  [...(v.weAre || []), ...(v.weAreNot || []), ...(v.dontSay || [])].forEach(add);
  (v.doSay || []).forEach((d) => add(d.text));
  (brand.logo?.misuse || []).forEach(add);
  Object.values(brand.color?.roles || {}).forEach((r) => add(r.name));
  ['display', 'text', 'label'].forEach((r) => add(brand.type?.[r]?.family));
  (brand.copy || []).forEach((c) => add(c.text));
  data.labels.forEach(add);
  data.deliverables.forEach((d) => add(d.name));
  data.directions.forEach((d) => add(d.name));
  return k;
}

export function checkFacts(texts, brand, data) {
  const known = knownTexts(brand, data);
  const sourced = (brand.copy || []).filter((c) => c.source !== 'example').map((c) => norm(c.text));
  const dont = new Set((brand.voice?.dontSay || []).map(norm));
  const examples = new Set([
    ...(brand.copy || []).filter((c) => c.source === 'example').map((c) => norm(c.text)),
    ...(brand.voice?.doSay || []).filter((d) => d.source === 'example').map((d) => norm(d.text)),
    ...(brand.voice?.dontSay || []).map(norm),
  ]);
  const out = [];
  const add = (level, code, message, text) => out.push({ level, code, message, text });
  for (const t of texts) {
    const n = norm(t.text);
    const isKnown = known.has(n) || (n.length >= 12 && sourced.some((s) => s.includes(n)));
    if (EMOJI.test(t.text)) add('fail', 'EMOJI', 'An emoji on the board', t.text);
    if (t.text.includes('\u2014')) add('warn', 'EM_DASH', 'An em dash on the board', t.text);
    // System values and designer's notes may explain the system in any words, but never state a fact about
    // the business (a year, a price, a contact, a rating) unless the brand said it.
    if (t.system || t.note) {
      if (isKnown) continue;
      let rest = t.text;
      for (const re of SYSTEM_TOKENS) rest = rest.replace(re, ' ');
      for (const [code, re, what] of PATTERNS) if (!['YEAR', 'PERCENT', 'PHONE', 'RATING'].includes(code) && re.test(rest)) add('fail', `FACT_${code}`, `${t.system ? 'System text' : 'A note'} holds ${what}`, t.text);
      if (t.note && !t.system) {
        if (PATTERNS.find(([c]) => c === 'YEAR')[1].test(rest)) add('fail', 'FACT_YEAR', 'A note holds a year', t.text);
        const cln = data.cliches.find((w) => clicheRe(w).test(t.text));
        if (cln) add('fail', 'CLICHE', `The copy cliche "${cln}"`, t.text);
      }
      if (/\d/.test(rest)) add('warn', 'FACT_NUMBER_SYSTEM', 'A number in system text or a note that is not a code, size, weight or ratio', t.text);
      continue;
    }
    const cl = data.cliches.find((w) => clicheRe(w).test(t.text));
    if (cl && !t.misuse && !(t.example && dont.has(n))) add('fail', 'CLICHE', `The copy cliche "${cl}"`, t.text);
    if (examples.has(n) && !t.example) add('fail', 'EXAMPLE_UNMARKED', 'An example line is shown without data-example', t.text);
    if (isKnown) continue;
    let flagged = false;
    for (const [code, re, what] of PATTERNS) if (re.test(t.text)) { add('fail', `FACT_${code}`, `Unsourced ${what}`, t.text); flagged = true; }
    if (!flagged && /\d/.test(t.text)) { add('fail', 'FACT_NUMBER', 'An unsourced number', t.text); flagged = true; }
    if (!flagged && n.split(' ').length > 4) add('fail', 'UNSOURCED', 'A sentence that is not in brand.json copy, voice or the labels', t.text);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help || typeof args.brand !== 'string') { console.log('Usage: node facts-check.mjs brand/board.metrics.json --brand brand/brand.json'); process.exit(file ? 0 : 1); }
  const findings = checkFacts(readJson(file).texts, readJson(args.brand), loadData());
  const fails = findings.filter((f) => f.level === 'fail');
  writeJson(path.join(path.dirname(path.resolve(file)), 'facts-check.json'), findings);
  for (const f of findings) console.log(`${f.level === 'fail' ? 'FAIL' : 'warn'} ${f.code}: ${f.message}: "${f.text}"`);
  console.log(`facts-check: ${fails.length} failure(s), ${findings.length - fails.length} warning(s).`);
  process.exit(fails.length ? 1 : 0);
}
