#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readGscTable, parseCsv } from './lib/csv.mjs';
import { loadData } from './lib/data.mjs';
import { parseArgs, isMain, writeJson, writeText } from './lib/report.mjs';

const HELP = `Usage: node gsc-analyze.mjs <export-dir> [--compare <older-export-dir>] [--query-page <file.csv>]
                         [--brand "name,other name"] [--min-impressions N] [--out seo/gsc]

Reads Search Console Performance exports (CSV, English or Hebrew headers) from a folder (unzip the
download first): Queries, Pages and Chart or Dates are analysed; Countries, Devices and Search
appearance files are recognised but not analysed. Reports data breaks in the date range, a drop check,
striking distance (positions 4-7 and 8-20), low CTR against the site's own curve, decay (with --compare)
and cannibalization (with --query-page or a query+page export). Every number comes from the export; an
export of 1,000 rows or more is called incomplete. Writes gsc.json and gsc.md to --out (default seo/gsc).
--brand leaves queries that contain a brand name out of the CTR curve and the low CTR list. Decay rows
are ordered by the clicks a page lost, with the percentage as a column. Exports written with decimal
commas or semicolon separators (some locales) are not supported: export in English or Hebrew.

In Git Bash a path argument that starts with / (the export folder, --compare, --query-page, --out) is
rewritten into a Windows path: run with MSYS_NO_PATHCONV=1 in front, or write the path without the
leading slash.`;

export const BUCKETS = [['1', 0, 1.5], ['2-3', 1.5, 3.5], ['4-5', 3.5, 5.5], ['6-10', 5.5, 10.5], ['11-20', 10.5, 20.5]];

// The caller's own mistakes (a bad file, a bad flag). The CLI reports these and exits 1; anything else that
// is thrown is a bug and keeps its stack trace. It is a TypeError for callers that already catch that.
export class InputError extends TypeError {
  constructor(message) { super(message); this.name = 'InputError'; }
}

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MEASURES_AFFECTED = new Set(['impressions', 'ctr', 'position']);

const median = a => {
  const s = a.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// Clicks over impressions when both are there: the exported CTR is rounded to two decimals of a percent,
// which turns 1 click in 100,000 impressions into 0%.
const ctrOf = r => (r.impressions > 0 && Number.isFinite(r.clicks) ? r.clicks / r.impressions : (r.ctr ?? 0));
const sum = (rows, k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
const change = (a, b) => (b ? (a - b) / b : null);

const isIso = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const dayNumber = d => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const daysIn = r => dayNumber(r.end) - dayNumber(r.start) + 1;

export function bucketOf(pos) {
  if (typeof pos !== 'number' || !Number.isFinite(pos)) return null;
  const b = BUCKETS.find(([, lo, hi]) => pos >= lo && pos < hi);
  return b ? b[0] : null;
}

// --- Reading an export folder ---------------------------------------------------------------------

const FILTER_HEADER = /^(filter|\u05de\u05e1\u05e0)/i;

function readFilters(rows) {
  return rows.slice(1, 21).map(r => ({ name: String(r[0] ?? '').trim(), value: String(r[1] ?? '').trim() })).filter(f => f.name);
}

// Every recognised table, by what its headers say it is (not by file name: a Hebrew interface names the
// files in Hebrew). When two files are the same kind, the first by name is used and the other is named.
function readExportDir(dir) {
  const tables = {};
  const notes = [];
  const unrecognised = [];
  let filters = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.csv$/i.test(f)) continue;
    const file = path.join(dir, f);
    let stat = null;
    try { stat = fs.statSync(file); } catch { /* a broken link: skipped */ }
    if (!stat || !stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) { notes.push(`${f} is larger than ${MAX_FILE_BYTES / 1048576} MB and was skipped.`); unrecognised.push(f); continue; }
    const text = fs.readFileSync(file, 'utf8');
    const t = readGscTable(text);
    if (t.kind) {
      if (tables[t.kind]) notes.push(`${f} was ignored: ${tables[t.kind].file} is already the ${t.kind} table.`);
      else tables[t.kind] = { ...t, file: f };
      continue;
    }
    const rows = parseCsv(text);
    if (rows.length && FILTER_HEADER.test(String(rows[0][0] ?? '').trim())) filters = readFilters(rows);
    else unrecognised.push(f);
  }
  return { tables, notes, unrecognised, filters };
}

export function loadExport(dir) {
  return readExportDir(dir).tables;
}

// --- Analyses -------------------------------------------------------------------------------------

export function ctrCurve(rows, minImpressions = 10) {
  return BUCKETS.map(([name]) => {
    const rs = rows.filter(r => r.impressions >= minImpressions && bucketOf(r.position) === name);
    return { bucket: name, n: rs.length, medianCtr: median(rs.map(ctrOf)) };
  });
}

const floorOverride = v => {
  if (v === undefined || v === null || v === true || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function impressionFloor(rows, override) {
  return floorOverride(override) ?? Math.max(10, median(rows.map(r => r.impressions)) ?? 10);
}

export function striking(rows, floor) {
  const pick = (lo, hi) => rows.filter(r => r.position >= lo && r.position < hi && r.impressions >= floor).sort((a, b) => b.impressions - a.impressions);
  return { snippet: pick(3.5, 7.5), content: pick(7.5, 20.5) };
}

export function lowCtr(rows, curve, floor, brandRe = null) {
  const med = Object.fromEntries(curve.map(c => [c.bucket, c.n >= 3 ? c.medianCtr : null]));
  return rows
    .filter(r => r.impressions >= floor && r.position >= 2.5 && r.position < 15.5 && !(brandRe && brandRe.test(r.query || '')))
    .map(r => {
      const m = med[bucketOf(r.position)];
      const ctr = ctrOf(r);
      return { ...r, ctr, bucketMedian: m, lostClicks: m === null || m === undefined ? 0 : r.impressions * (m - ctr) };
    })
    .filter(r => r.bucketMedian !== null && r.bucketMedian !== undefined && r.ctr < r.bucketMedian * 0.7 && r.lostClicks > 0)
    .sort((a, b) => b.lostClicks - a.lostClicks);
}

// scale: what the older clicks are multiplied by to be comparable (current days / older days) when the two
// exports cover different numbers of days; 1 when they are equal or unknown.
export function decay(currentPages, olderPages, minOld = 10, scale = 1) {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const cur = new Map();
  for (const r of currentPages) if (r.page) cur.set(r.page, r);
  const out = [];
  for (const o of olderPages) {
    if (!o.page || !(o.clicks >= minOld)) continue;
    const r = cur.get(o.page);
    const newClicks = r ? r.clicks || 0 : 0;
    const expected = o.clicks * k;
    const ch = (newClicks - expected) / expected;
    if (ch > -0.3) continue;
    out.push({ page: o.page, oldClicks: o.clicks, newClicks, change: ch, lostClicks: expected - newClicks, gone: !r, oldImpressions: o.impressions, newImpressions: r ? r.impressions : 0, oldPosition: o.position, newPosition: r ? r.position : null });
  }
  // The most clicks lost first: a page that lost 700 clicks matters more than forty that lost ten each, however the
  // percentages compare. Ties go to the bigger percentage drop, then to the page, so the order never follows the input.
  return out.sort((a, b) => b.lostClicks - a.lostClicks || a.change - b.change || (a.page < b.page ? -1 : a.page > b.page ? 1 : 0));
}

// A page counts once per query, however many rows it comes in (a device or country split, say): its
// impressions and clicks are added and its position is weighted by impressions.
export function cannibalization(qp, floor) {
  const byQ = new Map();
  for (const r of qp) {
    if (!r.query || !r.page) continue;
    let pages = byQ.get(r.query);
    if (!pages) byQ.set(r.query, pages = new Map());
    let a = pages.get(r.page);
    if (!a) pages.set(r.page, a = { page: r.page, impressions: 0, clicks: 0, weight: 0, posSum: 0, lastPosition: null });
    const imp = r.impressions || 0;
    a.impressions += imp;
    a.clicks += r.clicks || 0;
    if (Number.isFinite(r.position)) { a.posSum += r.position * imp; a.weight += imp; a.lastPosition = r.position; }
  }
  const out = [];
  for (const [query, pages] of byQ) {
    let total = 0;
    for (const a of pages.values()) total += a.impressions;
    if (total <= 0 || total < floor) continue;
    const sharing = [...pages.values()].filter(a => a.impressions / total >= 0.2).sort((a, b) => b.impressions - a.impressions);
    if (sharing.length >= 2) {
      out.push({ query, impressions: total, pages: sharing.map(a => ({ page: a.page, impressions: a.impressions, clicks: a.clicks, position: a.weight ? a.posSum / a.weight : a.lastPosition, share: a.impressions / total })) });
    }
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

// A break with no end date is a step change (the new way of measuring stays): it matters for a range that
// contains its start. Callers that mean "until now" for an open end (a rolling update) pass the end themselves.
export function overlaps(b, range) {
  if (!b || !b.start || !range) return false;
  const end = b.end ?? b.start;
  return b.start <= range.end && end >= range.start;
}

// The first week that is 20% or more below the median of the weeks before it and stays there to the end.
function findOnset(weeks) {
  for (let i = 2; i < weeks.length; i++) {
    const base = median(weeks.slice(0, i).map(w => w.clicks));
    if (base && weeks.slice(i).every(w => w.clicks <= 0.8 * base)) return { start: weeks[i].start, end: weeks[i].end, baseline: base };
  }
  return null;
}

const isOpen = u => u.end === null || u.end === undefined;

// data/updates.json keeps details after the first semicolon of a scope ("global; up to two weeks"): the
// part before it is the scope. A scope that is not global is shown; one that leaves Web search out cannot
// explain a drop in Web search clicks (the February 2026 Discover update is Discover only).
const scopeHead = scope => String(scope ?? 'global').split(';')[0].trim().toLowerCase();
export const isGlobalScope = scope => scopeHead(scope) === 'global' || scopeHead(scope) === '';
// true: Web search is covered; false: it is not; null: the scope text does not say.
export function coversWebSearch(scope) {
  const s = String(scope ?? '').trim();
  const head = scopeHead(s);
  if (isGlobalScope(s) || /^global\b/.test(head) || /\bweb\b/i.test(head)) return true;
  if (/\bdiscover\b|\bnews\b|\bimages?\b|\bvideos?\b/i.test(head) && !/\bsearch\b/i.test(head)) return false;
  return null;
}
const withScope = u => ({ ...u, scope: u.scope ?? 'global', coversWeb: coversWebSearch(u.scope) });

export function dropCheck(dates, { updates = [], breaks = [], provisionalDays = 3, updatesVerified = null } = {}) {
  const byDate = new Map();
  let duplicateDays = 0;
  for (const r of dates) {
    if (!r || !isIso(r.date)) continue;
    if (byDate.has(r.date)) duplicateDays++; else byDate.set(r.date, r);
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const quality = {
    skippedRows: dates.length - byDate.size - duplicateDays,
    duplicateDays,
    missingDays: rows.length ? dayNumber(rows.at(-1).date) - dayNumber(rows[0].date) + 1 - rows.length : 0,
  };
  const p = Math.max(0, Math.floor(Number(provisionalDays)) || 0);
  if (rows.length < 21 || rows.length - p < 14) return { enough: false, days: rows.length, quality };
  const provisional = p ? rows.slice(-p) : [];
  const usable = rows.slice(0, rows.length - p);
  const window = usable.length >= 56 ? 28 : 7;
  const recent = usable.slice(-window);
  const prior = usable.slice(-2 * window, -window);
  const weeks = [];
  for (let i = usable.length; i - 7 >= 0 && weeks.length < 12; i -= 7) {
    const w = usable.slice(i - 7, i);
    weeks.unshift({ start: w[0].date, end: w[6].date, clicks: sum(w, 'clicks'), impressions: sum(w, 'impressions') });
  }
  const medWeek = median(weeks.map(w => w.clicks)) || 0;
  const oneWeekDips = weeks
    .map((w, i) => ({ ...w, i }))
    .filter(w => w.clicks < 0.7 * medWeek && w.i < weeks.length - 1 && weeks[w.i + 1].clicks >= 0.9 * medWeek && (w.i === 0 || weeks[w.i - 1].clicks >= 0.9 * medWeek))
    .map(w => ({ start: w.start, end: w.end, clicks: w.clicks, vsMedian: medWeek ? w.clicks / medWeek - 1 : null }));
  const range = { start: (prior[0] || recent[0]).date, end: rows.at(-1).date };
  const clicksChange = change(sum(recent, 'clicks'), sum(prior, 'clicks'));
  // A drop is sustained when the last complete week is still down against the weeks before the window. A
  // window that is down only because of a dip the last week has recovered from is not a drop.
  const priorPerWeek = prior.length ? sum(prior, 'clicks') / (prior.length / 7) : 0;
  const lastWeekChange = priorPerWeek ? (weeks.at(-1).clicks - priorPerWeek) / priorPerWeek : null;
  const lower = clicksChange !== null && clicksChange <= -0.2;
  const sustained = lastWeekChange === null || lastWeekChange <= -0.1;
  const verdict = lower && sustained ? 'possible-drop' : 'no-sustained-drop';
  // A drop that is only a week old: the window as a whole is not down 20%, but the last complete week is.
  const early = verdict === 'no-sustained-drop' && lastWeekChange !== null && lastWeekChange <= -0.2;
  const lastWeek = { start: weeks.at(-1).start, end: weeks.at(-1).end, clicks: weeks.at(-1).clicks };
  return {
    enough: true, window, quality,
    recent: { start: recent[0].date, end: recent.at(-1).date, clicks: sum(recent, 'clicks'), impressions: sum(recent, 'impressions') },
    prior: prior.length ? { start: prior[0].date, end: prior.at(-1).date, clicks: sum(prior, 'clicks'), impressions: sum(prior, 'impressions') } : null,
    clicksChange, impressionsChange: change(sum(recent, 'impressions'), sum(prior, 'impressions')),
    lastWeek, lastWeekChange, recovered: lower && !sustained, early,
    weeks, oneWeekDips, provisional: provisional.map(r => r.date),
    onset: verdict === 'possible-drop' ? findOnset(weeks) : null,
    updatesVerified,
    updatesInRange: updates.filter(u => overlaps({ start: u.start, end: u.end ?? range.end }, range)).map(withScope),
    rolling: updates.filter(u => isOpen(u) && u.start <= range.end).map(withScope),
    breaksInRange: breaks.filter(b => overlaps(b, range)),
    verdict,
  };
}

function brandNames(brand) {
  const list = Array.isArray(brand) ? brand : typeof brand === 'string' ? brand.split(',') : [];
  return list.map(s => String(s).trim()).filter(Boolean);
}

function brandRegex(names) {
  const escaped = names.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.length ? new RegExp(escaped.join('|'), 'i') : null;
}

const capNote = what => `${what} has 1,000 rows or more. Search Console stops an export at 1,000 rows, so this table is incomplete: rows beyond it (the long tail) are missing, and any total or ranking taken from it below is marked as incomplete.`;

export function analyzeExport(dir, opts = {}) {
  const { tables: t, notes: loadNotes, unrecognised, filters } = readExportDir(dir);
  const updatesFile = opts.updates ? null : loadData('updates');
  const updates = opts.updates ?? updatesFile.updates;
  const updatesVerified = opts.updatesVerified ?? updatesFile?.verified ?? null;
  const breaksFile = opts.breaks ? null : loadData('data-breaks');
  const breaks = opts.breaks ?? breaksFile.breaks;
  const brandList = brandNames(opts.brand);
  const brandRe = brandRegex(brandList);
  const notes = [...loadNotes];
  const files = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.file]));
  const capped = { queries: !!t.queries?.capped, pages: !!t.pages?.capped, dates: !!t.dates?.capped, queryPage: !!t.queryPage?.capped, comparePages: false };
  for (const v of Object.values(t)) if (v.capped) notes.push(capNote(v.file));

  const dates = t.dates?.rows ?? [];
  const isoDates = dates.map(r => r.date).filter(isIso).sort();
  const range = isoDates.length ? { start: isoDates[0], end: isoDates.at(-1) } : null;
  if (!range) {
    notes.push(dates.length
      ? 'The Chart or Dates export has no date in YYYY-MM-DD form, so the date range is unknown: check data/data-breaks.json by hand.'
      : 'No Chart or Dates export: the date range is unknown, so check data/data-breaks.json by hand.');
  }

  const queries = t.queries?.rows ?? [];
  const pages = t.pages?.rows ?? [];
  const baseTable = queries.length ? 'queries' : pages.length ? 'pages' : null;
  const base = baseTable === 'queries' ? queries : pages;
  const floor = impressionFloor(base, opts.minImpressions);
  // Brand queries (--brand) are left out before the curve is built: they have a far higher CTR than the
  // rest and would lift every median. A pages export has no queries to leave out.
  const curveRows = brandRe && baseTable === 'queries' ? base.filter(r => !brandRe.test(r.query || '')) : base;
  const curve = ctrCurve(curveRows);
  const pagesCurve = ctrCurve(pages);
  const dataBreaks = range ? breaks.filter(b => overlaps(b, range)) : [];
  const measurementBreaks = dataBreaks.filter(b => (b.affects || []).some(a => MEASURES_AFFECTED.has(a))).map(b => b.id);

  const result = {
    files, range, notes, capped, baseTable, floor,
    floorSource: floorOverride(opts.minImpressions) === null ? 'median' : 'flag',
    curve, pagesCurve, filters,
    brand: { names: brandList, excludedFromCurve: base.length - curveRows.length },
    dataBreaks, measurementBreaks, breaksVerified: breaksFile ? breaksFile.verified ?? null : null,
    updatesVerified,
    drop: range ? dropCheck(dates, { updates, breaks, updatesVerified }) : null,
    striking: queries.length ? striking(queries, floor) : null,
    lowCtrQueries: queries.length ? lowCtr(queries, curve, floor, brandRe) : [],
    pagesFloor: impressionFloor(pages, opts.minImpressions),
    lowCtrPages: pages.length ? lowCtr(pages, pagesCurve, impressionFloor(pages, opts.minImpressions)) : [],
    compare: null, decay: null, cannibalization: null, cannibalizationFile: null,
  };

  if (opts.compareDir) {
    const c = readExportDir(opts.compareDir);
    for (const n of c.notes) notes.push(`--compare: ${n}`);
    const cIso = (c.tables.dates?.rows ?? []).map(r => r.date).filter(isIso).sort();
    const cRange = cIso.length ? { start: cIso[0], end: cIso.at(-1) } : null;
    const cPages = c.tables.pages;
    if (cPages?.capped) { capped.comparePages = true; notes.push(capNote(`The --compare file ${cPages.file}`)); }
    let scale = 1;
    result.compare = { file: cPages?.file ?? null, range: cRange, scale, breaks: [] };
    if (!pages.length) notes.push('Decay was not computed: this export has no Pages table (a CSV with a page column).');
    else if (!cPages) notes.push('Decay was not computed: the --compare folder has no Pages table (a CSV with a page column).');
    else {
      if (range && cRange) {
        const now = daysIn(range);
        const before = daysIn(cRange);
        if (now !== before) {
          scale = now / before;
          notes.push(`The two exports cover different numbers of days (this one ${now} days, the --compare one ${before} days): decay compares clicks per day.`);
        }
        if (cRange.end >= range.start) notes.push(`The --compare export (${cRange.start} to ${cRange.end}) does not end before this one starts (${range.start}): it should be the older export.`);
        const span = { start: cRange.start < range.start ? cRange.start : range.start, end: cRange.end > range.end ? cRange.end : range.end };
        result.compare.breaks = breaks.filter(b => overlaps(b, span) && (b.affects || []).some(a => MEASURES_AFFECTED.has(a))).map(b => b.id);
      } else {
        notes.push('Could not check that the two exports cover the same number of days (a Chart or Dates file is missing from one of them): decay assumes they do.');
      }
      result.compare.scale = scale;
      result.decay = decay(pages, cPages.rows, 10, scale);
      // Most of the older pages absent from this export usually means the URLs changed form, not that the
      // pages lost their clicks.
      const here = new Set(pages.map(r => r.page).filter(Boolean));
      const olderPages = cPages.rows.filter(r => r.page);
      const missingPages = olderPages.filter(r => !here.has(r.page)).length;
      Object.assign(result.compare, { olderPages: olderPages.length, missingPages, mostMissing: olderPages.length > 0 && missingPages / olderPages.length > 0.5 });
    }
  }

  let qp = null;
  if (opts.queryPageFile) {
    const file = path.basename(opts.queryPageFile);
    const tq = readGscTable(fs.readFileSync(opts.queryPageFile, 'utf8'));
    if (tq.kind !== 'queryPage') throw new InputError(`${file} does not have both a query and a page column, so it cannot show which pages share a query. It should be a Performance export with one row per query and page (from the API, a connector or a sheet), not the Queries or Pages download.`);
    qp = { ...tq, file };
    result.files.queryPage = file;
    capped.queryPage = tq.capped;
    if (tq.capped) notes.push(capNote(file));
  } else if (t.queryPage) {
    qp = t.queryPage;
  }
  if (qp) {
    result.cannibalization = cannibalization(qp.rows, floor);
    result.cannibalizationFile = qp.file;
  }
  result.unrecognised = unrecognised;
  return result;
}

// --- Markdown -------------------------------------------------------------------------------------

const pct = v => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'unknown');
const signed = v => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : 'unknown');
const n0 = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : 'unknown');
const pos1 = v => (Number.isFinite(v) ? v.toFixed(1) : 'unknown');
const oneLine = s => String(s ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
// Text from the export goes into tables and lists: one line, no pipes that end a cell, bounded.
const cell = s => {
  const t = oneLine(s);
  return (t.length > 200 ? `${t.slice(0, 197)}...` : t).replace(/\|/g, '\\|');
};
const span = r => (r ? `${r.start} to ${r.end}` : 'date range unknown');
const cutNote = (total, limit) => `Showing ${limit} of ${n0(total)}: the full list is in gsc.json.`;
// An update's scope when it is not global, and what that means for a drop in Web search clicks.
const scopeNote = (u, label) => (isGlobalScope(u.scope) ? '' : ` ${label}: ${oneLine(u.scope)}.`)
  + (u.coversWeb === false ? ' That scope does not include Web search, so it cannot explain a drop in Web search clicks.' : u.coversWeb === null ? ' Check that this scope includes Web search before using it to explain a drop.' : '');

export function renderGscMarkdown(o) {
  const range = span(o.range);
  const L = ['# Search Console analysis', ''];
  L.push(`Measured from the Search Console export (${range}). Files: ${Object.entries(o.files).map(([k, f]) => `${k}=${cell(f)}`).join(', ') || 'none recognised'}.`);
  const intro = [...o.notes.map(oneLine)];
  if (o.filters?.length) intro.push(`Filters on this export: ${o.filters.map(f => `${cell(f.name)}: ${cell(f.value)}`).join('; ')}. The numbers below cover only what these filters keep.`);
  if (intro.length) L.push('', ...intro.map(n => `- ${n}`));
  const caution = ids => (ids?.length ? [`Caution: ${ids.join(', ')} ${ids.length === 1 ? 'affects' : 'affect'} impressions, CTR or position in this range (see Data breaks above), so the position and CTR figures here are less reliable.`, ''] : []);
  const incomplete = what => [`Incomplete (1,000-row cap): ${what}`, ''];

  if (o.range) {
    L.push('', '## Data breaks in this range', '');
    if (!o.dataBreaks.length) L.push(`No known Search Console data break overlaps this range (checked against data/data-breaks.json${o.breaksVerified ? `, verified ${o.breaksVerified}` : ''}).`);
    for (const b of o.dataBreaks) {
      L.push(`- ${b.id} (${b.start} to ${b.end ?? 'ongoing'}${b.approximate ? ', date approximate' : ''}):${b.what ? ` ${b.what}` : ''} Affects ${(b.affects || []).join(', ') || 'unknown'}.${b.notAffected?.length ? ` Not affected: ${b.notAffected.join(', ')}.` : ''}`);
    }
  }

  if (o.drop) {
    const d = o.drop;
    L.push('', '## Drop check', '');
    if (!d.enough) L.push(`Only ${d.days} usable days of data: not enough for a drop check (21 or more needed, and the newest 3 are left out).`);
    else {
      const verdict = d.verdict === 'possible-drop'
        ? 'a possible real drop. Check the calendar (holiday, season, outage, tracking) first, then diagnose it with jobs/drop.md'
        : d.recovered
          ? `no sustained drop in clicks: the window is down, but the last complete week is back within 10% of the level before it (${signed(d.lastWeekChange)}), so this is a dip that recovered`
          : 'no sustained drop in clicks';
      L.push(`Measured from the Dates export (${range}).`, '');
      L.push(`- Last ${d.window} complete days (${d.recent.start} to ${d.recent.end}) against the ${d.window} days before (${d.prior.start} to ${d.prior.end}): clicks ${signed(d.clicksChange)}, impressions ${signed(d.impressionsChange)}. Verdict: ${verdict}.`);
      L.push(`- Last complete week (${d.lastWeek.start} to ${d.lastWeek.end}): ${n0(d.lastWeek.clicks)} clicks, ${signed(d.lastWeekChange)} against the average week of the ${d.window} days before the window (${d.prior.start} to ${d.prior.end}).`);
      if (d.early) L.push(`- Early drop: the last complete week is ${signed(d.lastWeekChange)} against the weeks before the window, but the window as a whole is only ${signed(d.clicksChange)}: too early to call it sustained; check again in a week.`);
      if (d.window === 7) L.push('- This is a 7-day comparison, which is noisy: a 28-day comparison needs a Dates export of 59 days or more.');
      if (d.onset) L.push(`- Onset: by the week of ${d.onset.start} to ${d.onset.end} (the first week that was 20% or more below the weeks before it and stayed there).`);
      if (d.provisional.length) L.push(`- Left out as possibly incomplete (Search Console lags 2 to 3 days; for an old export these days may be complete): ${d.provisional.join(', ')}.`);
      const q = d.quality;
      const problems = [q.missingDays && `${q.missingDays} missing day${q.missingDays === 1 ? '' : 's'}`, q.duplicateDays && `${q.duplicateDays} repeated date${q.duplicateDays === 1 ? '' : 's'}`, q.skippedRows && `${q.skippedRows} row${q.skippedRows === 1 ? '' : 's'} without a YYYY-MM-DD date`].filter(Boolean);
      if (problems.length) L.push(`- The dates table has ${problems.join(', ')}: the windows count rows, not calendar days.`);
      for (const b of d.breaksInRange) {
        const aff = b.affects || [];
        if (aff.includes('clicks')) L.push(`- Known break ${b.id} affects clicks inside the compared windows: this comparison is not reliable.`);
        else if (aff.includes('impressions')) L.push(`- Known break ${b.id} lies in the compared windows: do not read the impressions change as a gain or loss of visibility; clicks are what this check judges.`);
      }
      for (const w of d.oneWeekDips) L.push(`- A one-week dip from ${w.start} to ${w.end} (${signed(w.vsMedian)} against the median week) that recovered the next week: check the calendar (holiday, outage, tracking) before calling it a drop.`);
      const asOf = d.updatesVerified ? `as of data/updates.json, verified ${d.updatesVerified}` : '';
      for (const u of d.updatesInRange) {
        const late = d.verdict === 'possible-drop' && d.onset && u.start > d.onset.end;
        L.push(`- Google update in this range: ${u.name} (${u.end ? `${u.start} to ${u.end}` : `from ${u.start}, still rolling out${asOf ? ` ${asOf}` : ''}`}).${scopeNote(u, 'Scope')}${late ? ' It started after the onset week, so it cannot explain the onset.' : ''}`);
      }
      if (d.rolling.length) L.push(`- Still rolling out: ${d.rolling.map(u => u.name).join(', ')}${asOf ? ` (${asOf})` : ''}.${d.rolling.map(u => scopeNote(u, `Scope of ${u.name}`)).join('')} Do not attribute changes to it until it has finished and a week has passed.`);
      L.push('', 'Weekly clicks, counted back from the last complete day:', '', '| Week | Clicks | Impressions |', '| --- | --- | --- |');
      for (const w of d.weeks) L.push(`| ${w.start} to ${w.end} | ${n0(w.clicks)} | ${n0(w.impressions)} |`);
    }
  }

  if (o.striking) {
    L.push('', `## Striking distance (impression floor ${n0(o.floor)})`, '');
    L.push(`Measured from the queries export (${range}). The floor is ${o.floorSource === 'flag' ? 'set by --min-impressions' : 'the median impressions of the rows in this export (at least 10)'}. Positions 4 to 7: title and snippet work. Positions 8 to 20: content and internal links. Position is Search Console's average over the range.`, '');
    if (o.capped?.queries) L.push(...incomplete('the queries export stopped at 1,000 rows, so queries beyond them are missing; this ranking and the floor come from the rows that are there.'));
    L.push(...caution(o.measurementBreaks));
    for (const [name, rows] of [['Positions 4 to 7', o.striking.snippet], ['Positions 8 to 20', o.striking.content]]) {
      L.push(`### ${name}`, '', '| Query | Position | Impressions | Clicks | CTR |', '| --- | --- | --- | --- | --- |');
      if (!rows.length) L.push('| none | | | | |');
      for (const r of rows.slice(0, 20)) L.push(`| ${cell(r.query)} | ${pos1(r.position)} | ${n0(r.impressions)} | ${n0(r.clicks)} | ${pct(ctrOf(r))} |`);
      if (rows.length > 20) L.push('', cutNote(rows.length, 20));
      L.push('');
    }
  }

  if (o.baseTable) {
    L.push('## The site\'s own CTR curve', '');
    L.push(`Measured from the ${o.baseTable} export (${range}): the median CTR of its own rows with 10 or more impressions, by average position. No outside benchmark is used.`, '');
    const names = (o.brand?.names ?? []).map(cell).join(', ');
    if (!names) L.push('Brand queries are included (no --brand given): a brand query usually has a much higher CTR than the rest and lifts the medians. Give --brand "name" to leave them out.', '');
    else if (o.baseTable !== 'queries') L.push(`--brand was given (${names}), but this curve comes from the pages export, which has no queries, so brand queries cannot be left out of it.`, '');
    else {
      const n = o.brand.excludedFromCurve;
      L.push(`Brand queries are excluded (--brand ${names}): ${n ? `${n} row${n === 1 ? '' : 's'} matching ${names} left out of the curve.` : 'no row matched.'}`, '');
    }
    if (o.capped?.[o.baseTable]) L.push(...incomplete(`the ${o.baseTable} export stopped at 1,000 rows, so the curve comes from the rows that are there.`));
    L.push(...caution(o.measurementBreaks));
    L.push('| Position | Rows | Median CTR |', '| --- | --- | --- |');
    for (const c of o.curve) L.push(`| ${c.bucket} | ${c.n} | ${c.n >= 3 ? pct(c.medianCtr) : 'too few rows'} |`);
  }

  for (const [name, rows, key, has, floor, capped] of [
    ['Low CTR queries', o.lowCtrQueries, 'query', !!o.files.queries, o.floor, o.capped?.queries],
    ['Low CTR pages', o.lowCtrPages, 'page', !!o.files.pages, o.pagesFloor, o.capped?.pages],
  ]) {
    if (!has) continue;
    const ownCurve = key === 'page' && o.baseTable !== 'pages';
    L.push('', `## ${name} (against the ${ownCurve ? "pages' own curve" : 'curve above'})`, '');
    L.push(`Measured from the ${key === 'query' ? 'queries' : 'pages'} export (${range}). Rows at positions 2.5 to 15.5 with at least ${n0(floor)} impressions whose CTR is under 70% of the median CTR of their own position bucket (buckets with fewer than 3 rows have no median). Clicks lost = impressions x (bucket median - CTR).`, '');
    if (key === 'page' && !ownCurve) L.push('The curve is the one above: it is built from this same pages export.', '');
    if (ownCurve) {
      L.push("The pages' own curve (the median CTR of the pages with 10 or more impressions, by average position) from the pages export, not the queries curve above:", '', '| Position | Rows | Median CTR |', '| --- | --- | --- |');
      for (const c of o.pagesCurve ?? []) L.push(`| ${c.bucket} | ${c.n} | ${c.n >= 3 ? pct(c.medianCtr) : 'too few rows'} |`);
      L.push('');
    }
    if (capped) L.push(...incomplete(`the ${key === 'query' ? 'queries' : 'pages'} export stopped at 1,000 rows, so rows beyond them are not ranked.`));
    L.push(...caution(o.measurementBreaks));
    if (!rows.length) { L.push('None found.'); continue; }
    L.push(`| ${key === 'query' ? 'Query' : 'Page'} | Position | Impressions | CTR | Bucket median | Clicks lost |`, '| --- | --- | --- | --- | --- | --- |');
    for (const r of rows.slice(0, 20)) L.push(`| ${cell(r[key])} | ${pos1(r.position)} | ${n0(r.impressions)} | ${pct(r.ctr)} | ${pct(r.bucketMedian)} | ${n0(r.lostClicks)} |`);
    if (rows.length > 20) L.push('', cutNote(rows.length, 20));
  }

  if (o.decay) {
    L.push('', '## Decay (pages that lost 30% or more of their clicks)', '', 'Ordered by the most clicks lost (older clicks scaled to the days of this export when the two periods differ); the percentage is the change in clicks.', '');
    L.push(`Measured from two pages exports: now ${range}, before ${span(o.compare?.range)}. ${o.compare?.scale !== 1 ? 'The change is per day, because the exports cover different numbers of days.' : 'The change compares total clicks.'} Impressions and position are there to help choose a cause: impressions falling points to demand or lost visibility, position falling to ranking, clicks falling alone to CTR or the result page.`, '');
    if (o.capped?.pages || o.capped?.comparePages) L.push(...incomplete('a pages export stopped at 1,000 rows, so a page that is not in the current export may only sit below its cut and not have lost its clicks.'));
    if (o.compare?.mostMissing) L.push(`Caution: ${n0(o.compare.missingPages)} of the ${n0(o.compare.olderPages)} pages in the --compare export are not in this one. The URL form may have changed (http or https, www, trailing slash) between the two exports, in which case the "gone" pages below were renamed, not lost: compare them by hand before calling any of them lost.`, '');
    if (o.compare?.breaks?.length) L.push(`Caution: ${o.compare.breaks.join(', ')} fall${o.compare.breaks.length === 1 ? 's' : ''} in or between these two exports and distort impressions or position: judge by clicks, not by those columns.`, '');
    if (!o.decay.length) L.push('None found.');
    else {
      L.push('| Page | Clicks before | Clicks now | Clicks lost | Change | Impressions (before to now) | Position (before to now) |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const d of o.decay.slice(0, 30)) L.push(`| ${cell(d.page)} | ${n0(d.oldClicks)} | ${d.gone ? '0 (not in the current export)' : n0(d.newClicks)} | ${n0(d.lostClicks)} | ${signed(d.change)} | ${n0(d.oldImpressions)} to ${d.gone ? 'none' : n0(d.newImpressions)} | ${pos1(d.oldPosition)} to ${d.gone ? 'none' : pos1(d.newPosition)} |`);
      if (o.decay.length > 30) L.push('', cutNote(o.decay.length, 30));
    }
  }

  if (o.cannibalization) {
    L.push('', '## Cannibalization (two or more pages share a query\'s impressions)', '');
    L.push(`Measured from the query+page export${o.cannibalizationFile ? ` ${cell(o.cannibalizationFile)}` : ''} (${range}): queries where at least two pages each have 20% or more of the query's impressions. Different URLs on one query are not always a problem (they can serve different intent): look at the pages before merging or redirecting anything.`, '');
    if (o.capped?.queryPage) L.push(...incomplete('the query+page export has 1,000 rows or more, so queries and pages beyond them are missing.'));
    L.push(...caution(o.measurementBreaks));
    if (!o.cannibalization.length) L.push('None found.');
    for (const c of o.cannibalization.slice(0, 20)) L.push(`- ${cell(c.query)} (${n0(c.impressions)} impressions): ${c.pages.map(p => `${cell(p.page)} at ${pos1(p.position)} (${n0(p.impressions)}, ${pct(p.share)})`).join('; ')}`);
    if (o.cannibalization.length > 20) L.push('', cutNote(o.cannibalization.length, 20));
  }
  return L.join('\n') + '\n';
}

// --- Command line ---------------------------------------------------------------------------------

const CLI_OPTIONS = ['help', 'compare', 'query-page', 'brand', 'min-impressions', 'out'];
// Git Bash turns an argument such as /tmp/gsc into C:/Program Files/Git/tmp/gsc (or a Temp folder) before node starts.
const REWRITTEN_BY_GIT_BASH = /^[A-Za-z]:[\\/](?:Program Files(?: \(x86\))?[\\/]Git|msys(?:32|64)|cygwin(?:64)?)(?:[\\/]|$)/i;
const GIT_BASH_HINT = 'Run the command with MSYS_NO_PATHCONV=1 in front, or write the path without the leading slash';

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const fail = (message, code = 1) => { console.error(message); process.exit(code); };
  if (args.help) { console.log(HELP); process.exit(0); }
  const unknown = Object.keys(args).filter(k => k !== '_' && !CLI_OPTIONS.includes(k));
  if (unknown.length) fail(`Unknown option --${unknown[0]}. Options: ${CLI_OPTIONS.map(o => `--${o}`).join(', ')}. Run with --help for usage.`);
  if (!args._.length) { console.log(HELP); process.exit(1); }
  if (args._.length > 1) fail(`Give one export folder, not ${args._.length}. Run with --help for usage.`);

  const value = (name, what) => {
    const v = args[name];
    if (v === undefined) return null;
    if (typeof v !== 'string' || !v.trim()) fail(`--${name} needs ${what}`);
    return v;
  };
  const exportDir = args._[0];
  const compareDir = value('compare', 'the folder of an older export');
  const queryPageFile = value('query-page', 'the path of a query+page CSV file');
  const brand = value('brand', 'a name, or a comma-separated list of names');
  const minRaw = value('min-impressions', 'a number of impressions, such as 50');
  const out = value('out', 'a folder') ?? 'seo/gsc';
  if (minRaw !== null && floorOverride(minRaw) === null) fail(`--min-impressions needs a number of impressions (0 or more), such as 50, not "${minRaw}"`);

  // A path that is not there and that looks like one Git Bash rewrote is blamed on Git Bash; only the strict
  // Git folders are refused for --out, which is created when it is missing.
  const notThere = (what, p) => `${what} not found: ${p}.${REWRITTEN_BY_GIT_BASH.test(p) || /^[A-Za-z]:\//.test(p) ? ` If you wrote a path that starts with / in Git Bash, it was rewritten into this one. ${GIT_BASH_HINT}.` : ''}`;
  const statOf = p => { try { return fs.statSync(p); } catch { return null; } };
  const folder = (p, what) => {
    const st = statOf(p);
    if (!st) fail(notThere(what, p));
    if (!st.isDirectory()) fail(/\.zip$/i.test(p) ? `${p} is a zip file: unzip it first and pass the folder that holds the CSV files` : `${p} is not a folder: pass the folder that holds the exported CSV files`);
  };
  folder(exportDir, 'Export folder');
  if (compareDir) folder(compareDir, '--compare folder');
  if (queryPageFile) {
    const st = statOf(queryPageFile);
    if (!st) fail(notThere('--query-page file', queryPageFile));
    if (!st.isFile()) fail(`${queryPageFile} is not a file`);
  }
  if (REWRITTEN_BY_GIT_BASH.test(out) && !statOf(out)) fail(`--out "${out}" looks like a path that Git Bash rewrote (an argument that starts with / becomes one like it). ${GIT_BASH_HINT}.`);

  let r;
  try {
    r = analyzeExport(exportDir, { compareDir, queryPageFile, brand, minImpressions: minRaw });
  } catch (e) {
    if (e instanceof InputError) fail(e.message);
    if (e && typeof e.code === 'string' && /^E[A-Z]+$/.test(e.code)) fail(`Could not read the export: ${e.message}`, 2);
    throw e;
  }
  if (!Object.keys(r.files).length) {
    fail(`No Search Console tables found in ${exportDir}${r.unrecognised.length ? ` (CSV files seen: ${r.unrecognised.slice(0, 10).join(', ')})` : ' (it holds no CSV files)'}. Expected the CSV files of a Performance export (Queries, Pages, Chart or Dates, ...), English or Hebrew headers.`);
  }
  try {
    writeJson(path.join(out, 'gsc.json'), r);
    writeText(path.join(out, 'gsc.md'), renderGscMarkdown(r));
  } catch (e) {
    fail(`Could not write the report to ${out}: ${String(e && e.message).slice(0, 150)}`, 2);
  }
  console.log(`Wrote ${path.join(out, 'gsc.md')} and ${path.join(out, 'gsc.json')}`);
}
