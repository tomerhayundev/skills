import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadData } from './lib/data.mjs';
import { bucketOf, ctrCurve, impressionFloor, striking, lowCtr, decay, cannibalization, dropCheck, overlaps, analyzeExport, renderGscMarkdown } from './gsc-analyze.mjs';

const BOM = String.fromCharCode(0xFEFF);
// Every temporary folder a test makes is removed when the file's tests are done.
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gsc-')); made.push(d); return d; };
after(() => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ } } });
const day = (start, i) => new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);

test('position buckets', () => {
  assert.equal(bucketOf(1.2), '1');
  assert.equal(bucketOf(2.9), '2-3');
  assert.equal(bucketOf(4.4), '4-5');
  assert.equal(bucketOf(10.4), '6-10');
  assert.equal(bucketOf(20.4), '11-20');
  assert.equal(bucketOf(25), null);
});

test('striking distance splits snippet work from content work', () => {
  const rows = [1.2, 2.5, 4.1, 6.0, 9.5, 14.0, 25].map((position, i) => ({ query: `q${i}`, position, impressions: 100 + i, clicks: 1 }));
  const s = striking(rows, 50);
  assert.deepEqual(s.snippet.map(r => r.query), ['q3', 'q2']);
  assert.deepEqual(s.content.map(r => r.query), ['q5', 'q4']);
  assert.equal(impressionFloor([{ impressions: 4 }, { impressions: 6 }]), 10);
  assert.equal(impressionFloor([{ impressions: 40 }, { impressions: 60 }, { impressions: 500 }]), 60);
  assert.equal(impressionFloor([], '25'), 25);
});

test('low CTR is judged against the site\'s own curve', () => {
  const rows = [0.06, 0.065, 0.07, 0.01].map((ctr, i) => ({ query: `q${i}`, position: 4.2, impressions: 1000, clicks: Math.round(ctr * 1000), ctr }));
  const curve = ctrCurve(rows);
  assert.equal(curve.find(c => c.bucket === '4-5').n, 4);
  const low = lowCtr(rows, curve, 100);
  assert.equal(low.length, 1);
  assert.equal(low[0].query, 'q3');
  assert.ok(Math.abs(low[0].lostClicks - 52.5) <= 1);
  assert.equal(lowCtr(rows, curve, 100, /q3/).length, 0);
  assert.equal(lowCtr(rows.slice(2), ctrCurve(rows.slice(2)), 100).length, 0, 'buckets with fewer than 3 rows give no median');
});

test('decay and cannibalization', () => {
  const d = decay([{ page: '/a', clicks: 50 }, { page: '/b', clicks: 100 }], [{ page: '/a', clicks: 100 }, { page: '/b', clicks: 105 }, { page: '/c', clicks: 40 }]);
  assert.deepEqual(d.map(x => [x.page, x.change]), [['/a', -0.5], ['/c', -1]], 'ordered by clicks lost (50 then 40), not by percentage');
  const c = cannibalization([
    { query: 'oak vs walnut', page: '/a', impressions: 600, clicks: 10, position: 3 },
    { query: 'oak vs walnut', page: '/b', impressions: 400, clicks: 2, position: 9 },
    { query: 'oak care', page: '/c', impressions: 990, clicks: 30, position: 2 },
    { query: 'oak care', page: '/d', impressions: 10, clicks: 0, position: 40 },
  ], 100);
  assert.deepEqual(c.map(x => x.query), ['oak vs walnut']);
  assert.equal(c[0].pages.length, 2);
});

test('drop check: a holiday week and incomplete days are not a drop; rolling updates are named', () => {
  const rows = Array.from({ length: 70 }, (_, i) => ({ date: day('2026-07-20', i), clicks: i >= 67 ? 10 : (i >= 39 && i <= 45 ? 50 : 100), impressions: 2000 }));
  const updates = [{ name: 'Test spam update', start: day('2026-07-20', 41), end: null }];
  const breaks = [{ id: 'old', start: '2025-01-01', end: '2025-02-01' }, { id: 'in', start: day('2026-07-20', 10), end: day('2026-07-20', 12) }];
  const d = dropCheck(rows, { updates, breaks });
  assert.equal(d.enough, true);
  assert.equal(d.window, 28);
  assert.deepEqual(d.provisional, [day('2026-07-20', 67), day('2026-07-20', 68), day('2026-07-20', 69)]);
  assert.equal(d.verdict, 'no-sustained-drop');
  assert.ok(d.clicksChange > -0.2);
  assert.equal(d.oneWeekDips.length, 1);
  assert.equal(d.oneWeekDips[0].start, day('2026-07-20', 39));
  assert.deepEqual(d.rolling.map(u => u.name), ['Test spam update']);
  assert.deepEqual(breaks.filter(b => overlaps(b, { start: rows[0].date, end: rows.at(-1).date })).map(b => b.id), ['in']);
  const real = dropCheck(rows.map((r, i) => ({ ...r, clicks: i >= 39 ? 40 : 100 })), { updates: [], breaks: [] });
  assert.equal(real.verdict, 'possible-drop');
  assert.equal(dropCheck(rows.slice(0, 10)).enough, false);
});

test('analyzeExport reads a real-looking export folder and renders markdown', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Queries.csv'), BOM + 'Top queries,Clicks,Impressions,CTR,Position\noak table,40,800,5%,4.1\nwalnut table,45,900,5%,4.4\noak bench,50,1000,5%,4.8\nwood table care,8,1200,0.67%,9.2\noak dining table,1,1000,0.1%,4.3\n');
  fs.writeFileSync(path.join(dir, 'Pages.csv'), 'Top pages,Clicks,Impressions,CTR,Position\nhttps://shop.test/,100,3000,3.33%,3.0\n');
  fs.writeFileSync(path.join(dir, 'Chart.csv'), 'Date,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 30 }, (_, i) => `${day('2026-01-01', i)},10,300,3.3%,8`).join('\n'));
  fs.writeFileSync(path.join(dir, 'Filters.csv'), 'Filter,Value\nSearch type,Web\n');
  const r = analyzeExport(dir, { breaks: [{ id: 'gsc-impressions-logging-error', start: '2025-05-13', end: '2026-04-27', affects: ['impressions', 'ctr', 'position'], what: 'Impressions were wrong.' }], updates: [] });
  assert.deepEqual(r.range, { start: '2026-01-01', end: '2026-01-30' });
  assert.equal(r.dataBreaks.length, 1);
  assert.ok(r.striking.content.some(q => q.query === 'wood table care'));
  assert.ok(r.lowCtrQueries.some(q => q.query === 'oak dining table'));
  const md = renderGscMarkdown(r);
  assert.match(md, /## Data breaks in this range/);
  assert.match(md, /## Drop check/);
  assert.match(md, /wood table care/);
  assert.match(md, /oak dining table/);
});

// ---- Beyond the brief: edge cases, honesty and the command line ----

const writeExport = files => {
  const dir = tmp();
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};
const chartCsv = (start, n, clicks = () => 10) => 'Date,Clicks,Impressions,CTR,Position\n' + Array.from({ length: n }, (_, i) => `${day(start, i)},${clicks(i)},300,3.3%,8`).join('\n') + '\n';
const QUERIES = 'Top queries,Clicks,Impressions,CTR,Position\noak table,40,800,5%,4.1\nwalnut table,45,900,5%,4.4\noak bench,50,1000,5%,4.8\nwood table care,8,1200,0.67%,9.2\noak dining table,1,1000,0.1%,4.3\n';
const basicExport = (extra = {}) => writeExport({ 'Queries.csv': QUERIES, 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttps://shop.test/,100,3000,3.33%,3.0\n', 'Chart.csv': chartCsv('2026-01-01', 30), ...extra });
const section = (md, title) => md.split(/\n(?=## )/).find(s => s.startsWith(`## ${title}`)) ?? '';
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gsc-analyze.mjs');
const run = (args, opts = {}) => new Promise(resolve => execFile(process.execPath, [script, ...args], { timeout: 60000, cwd: os.tmpdir(), ...opts }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

test('a missing or blank position belongs to no bucket and no curve', () => {
  for (const p of [null, undefined, NaN, Infinity, '4']) assert.equal(bucketOf(p), null, String(p));
  const curve = ctrCurve([{ impressions: 500, clicks: 5, position: null }, { impressions: 500, clicks: 5 }]);
  assert.ok(curve.every(c => c.n === 0));
});

test('an impression floor that is not a number falls back to the median', () => {
  const rows = [{ impressions: 40 }, { impressions: 60 }, { impressions: 500 }];
  assert.equal(impressionFloor(rows, 'abc'), 60);
  assert.equal(impressionFloor(rows, ''), 60);
  assert.equal(impressionFloor(rows, '-5'), 60);
  assert.equal(impressionFloor(rows, '0'), 0);
  assert.equal(impressionFloor(rows, true), 60);
});

test('CTR comes from clicks and impressions when both are there', () => {
  const rows = [{ query: 'a', position: 4, impressions: 100000, clicks: 1, ctr: 0 }, { query: 'b', position: 4, impressions: 1000, clicks: 50, ctr: 0.05 }, { query: 'c', position: 4, impressions: 1000, clicks: 50, ctr: 0.05 }, { query: 'd', position: 4, impressions: 1000, clicks: 50, ctr: 0.05 }];
  const low = lowCtr(rows, ctrCurve(rows), 100);
  assert.deepEqual(low.map(r => r.query), ['a']);
  assert.ok(Math.abs(low[0].ctr - 0.00001) < 1e-9, 'a rounded 0% is not trusted over 1 click in 100,000 impressions');
});

test('overlaps: a break with no end is a step change that matters where it falls', () => {
  const step = { start: '2025-09-10', end: null };
  assert.equal(overlaps(step, { start: '2025-09-01', end: '2025-09-30' }), true);
  assert.equal(overlaps(step, { start: '2026-01-01', end: '2026-01-30' }), false);
  assert.equal(overlaps({ start: '2025-05-13', end: '2026-04-27' }, { start: '2026-01-01', end: '2026-01-30' }), true);
  assert.equal(overlaps({ start: '2025-01-01', end: '2025-02-01' }, { start: '2026-01-01', end: '2026-01-30' }), false);
});

test('drop check: provisionalDays 0 keeps every day; too few days left is not enough', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ date: day('2026-01-01', i), clicks: 10, impressions: 300 }));
  const d = dropCheck(rows, { provisionalDays: 0 });
  assert.deepEqual(d.provisional, []);
  assert.equal(d.recent.end, day('2026-01-01', 29));
  assert.equal(dropCheck(rows, { provisionalDays: 20 }).enough, false);
});

test('drop check: a deep one-week dip that recovered is not a drop; a drop that held is, with its onset week', () => {
  const start = '2026-07-20';
  const rows = fn => Array.from({ length: 70 }, (_, i) => ({ date: day(start, i), clicks: fn(i), impressions: 2000 }));
  // An outage week inside the last 28 days: the window total is down 25%, but the last week is back.
  const dip = dropCheck(rows(i => (i >= 46 && i <= 52 ? 0 : 100)));
  assert.ok(dip.clicksChange <= -0.2);
  assert.equal(dip.verdict, 'no-sustained-drop');
  assert.equal(dip.recovered, true);
  assert.equal(dip.onset, null);
  assert.equal(dip.oneWeekDips.length, 1);
  // A drop that stays.
  const held = dropCheck(rows(i => (i >= 46 ? 60 : 100)));
  assert.equal(held.verdict, 'possible-drop');
  assert.equal(held.recovered, false);
  assert.equal(held.onset.start, day(start, 46));
  assert.equal(held.onset.end, day(start, 52));
  // No drop at all: no onset.
  assert.equal(dropCheck(rows(() => 100)).onset, null);
});

test('drop check: a rolling update is named only if it began by the last day of the export', () => {
  const start = '2026-07-20';
  const rows = Array.from({ length: 70 }, (_, i) => ({ date: day(start, i), clicks: 100, impressions: 2000 }));
  const updates = [{ name: 'Later', start: day(start, 80), end: null }, { name: 'Earlier', start: day(start, 5), end: null }, { name: 'Done', start: day(start, 20), end: day(start, 24) }, { name: 'Before the windows', start: day(start, 1), end: day(start, 3) }];
  const d = dropCheck(rows, { updates });
  assert.deepEqual(d.rolling.map(u => u.name), ['Earlier']);
  assert.deepEqual(d.updatesInRange.map(u => u.name).sort(), ['Done', 'Earlier']);
});

test('drop check counts duplicate, missing and non-ISO dates instead of trusting them', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ date: day('2026-01-01', i), clicks: 10, impressions: 300 })).filter((_, i) => ![10, 11, 12].includes(i));
  const d = dropCheck([...rows, { ...rows[5] }, { date: '1/2/2026', clicks: 5, impressions: 1 }, { date: '', clicks: 5, impressions: 1 }]);
  assert.equal(d.enough, true);
  assert.deepEqual(d.quality, { skippedRows: 2, duplicateDays: 1, missingDays: 3 });
  const clean = dropCheck(rows.concat([{ ...rows[5], clicks: 999 }]));
  assert.equal(clean.weeks.reduce((n, w) => n + w.clicks, 0) < 999, true, 'a repeated date is not counted twice');
  assert.equal(dropCheck(Array.from({ length: 30 }, (_, i) => ({ date: `${i + 1}/1/2026`, clicks: 1, impressions: 1 }))).enough, false);
});

test('decay: pages gone from the current export are marked, and unequal periods are compared per day', () => {
  const d = decay([{ page: '/a', clicks: 50 }, { page: '/b', clicks: 100 }], [{ page: '/a', clicks: 200 }, { page: '/b', clicks: 200 }, { page: '/c', clicks: 40 }], 10, 0.5);
  assert.deepEqual(d.map(x => [x.page, x.change, x.gone]), [['/a', -0.5, false], ['/c', -1, true]]);
  assert.equal(d[0].oldClicks, 200, 'the raw clicks stay as they were exported');
  assert.deepEqual(d.map(x => x.lostClicks), [50, 20], 'lost clicks are counted in the days of the current export');
});

test('cannibalization counts a page once, however many rows it comes in', () => {
  const row = (page, impressions, position = 3) => ({ query: 'oak', page, impressions, clicks: 1, position });
  assert.deepEqual(cannibalization([row('/a', 300), row('/a', 300)], 100), []);
  const c = cannibalization([row('/a', 300, 2), row('/a', 300, 4), row('/b', 300, 8), { query: '', page: '/z', impressions: 900 }, { query: 'x', page: '', impressions: 900 }], 100);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].pages.map(p => [p.page, p.impressions, p.position]), [['/a', 600, 3], ['/b', 300, 8]]);
});

test('a Hebrew-interface export works end to end', () => {
  const LRM = String.fromCharCode(0x200e);
  const he = (head, rows) => BOM + head + '\n' + rows.join('\n') + '\n';
  const dir = writeExport({
    'שאילתות.csv': he('השאילתות המובילות,קליקים,חשיפות,CTR,מיקום', [`שולחן אלון,40,800,${LRM}5%,4.1`, `שולחן אגוז,45,900,${LRM}5%,4.4`, `ספסל אלון,50,1000,${LRM}5%,4.8`, `טיפול בשולחן עץ,8,1200,${LRM}0.67%,9.2`, `שולחן אוכל מעץ אלון,1,1000,${LRM}0.1%,4.3`]),
    'דפים.csv': he('הדפים המובילים,קליקים,חשיפות,שיעור קליקים,מיקום', ['https://shop.test/,100,3000,3.33%,3.0']),
    'תרשים.csv': he('תאריך,קליקים,חשיפות,CTR,מיקום', Array.from({ length: 30 }, (_, i) => `${day('2026-01-01', i)},10,300,3.3%,8`)),
    'מסננים.csv': he('מסנן,ערך', ['סוג חיפוש,אינטרנט']),
  });
  const r = analyzeExport(dir);
  assert.deepEqual(Object.keys(r.files).sort(), ['dates', 'pages', 'queries']);
  assert.deepEqual(r.range, { start: '2026-01-01', end: '2026-01-30' });
  assert.ok(r.dataBreaks.some(b => b.id === 'gsc-impressions-logging-error'), 'the real data-breaks.json is read by default');
  assert.deepEqual(r.striking.content.map(q => q.query), ['טיפול בשולחן עץ']);
  assert.deepEqual(r.lowCtrQueries.map(q => q.query), ['שולחן אוכל מעץ אלון']);
  assert.deepEqual(r.filters, [{ name: 'סוג חיפוש', value: 'אינטרנט' }]);
  const md = renderGscMarkdown(r);
  assert.match(md, /טיפול בשולחן עץ/);
  assert.match(md, /שולחן אוכל מעץ אלון/);
});

test('a capped export is called incomplete wherever a ranking depends on it', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => `query ${i},${i % 7},${200 + i},1%,${4 + (i % 16)}`).join('\n');
  const dir = basicExport({ 'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\n' + rows + '\n' });
  const r = analyzeExport(dir, { updates: [], breaks: [] });
  assert.equal(r.capped.queries, true);
  assert.equal(r.capped.pages, false);
  assert.match(r.notes.join(' '), /1,000 rows or more/);
  const md = renderGscMarkdown(r);
  assert.ok(md.includes(r.notes.find(n => /1,000 rows or more/.test(n))), 'the cap note is printed whole');
  for (const title of ['Striking distance', 'The site\'s own CTR curve', 'Low CTR queries']) assert.match(section(md, title), /incomplete/i, title);
  assert.doesNotMatch(section(md, 'Low CTR pages'), /1,000-row cap/, 'the pages table is not capped');
  assert.doesNotMatch(renderGscMarkdown(analyzeExport(basicExport(), { updates: [], breaks: [] })), /1,000-row cap/);
});

test('compare: a capped or missing pages table is said, not guessed', () => {
  const older = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,100,1000,10%,3\n/gone,60,1000,6%,5\n/b,100,1000,10%,3\n', 'Chart.csv': chartCsv('2025-12-01', 28) });
  const cur = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,50,1000,5%,6\n/b,100,1000,10%,3\n', 'Chart.csv': chartCsv('2026-01-01', 28) });
  const r = analyzeExport(cur, { compareDir: older, updates: [], breaks: [] });
  assert.deepEqual(r.decay.map(d => [d.page, d.gone]), [['/gone', true], ['/a', false]]);
  assert.match(renderGscMarkdown(r), /not in the current export/);
  // No pages table on one side: decay is not computed (every page would look gone).
  const noPages = writeExport({ 'Queries.csv': QUERIES });
  const r2 = analyzeExport(noPages, { compareDir: older, updates: [], breaks: [] });
  assert.equal(r2.decay, null);
  assert.match(r2.notes.join(' '), /Decay was not computed/);
  const r3 = analyzeExport(cur, { compareDir: noPages, updates: [], breaks: [] });
  assert.equal(r3.decay, null);
  // A capped current pages table: a missing page may only be below the cut.
  const big = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 1000 }, (_, i) => `/p${i},5,100,5%,5`).join('\n') + '\n' });
  const r4 = analyzeExport(big, { compareDir: older, updates: [], breaks: [] });
  assert.equal(r4.capped.pages, true);
  assert.match(section(renderGscMarkdown(r4), 'Decay'), /incomplete/i);
});

test('compare: different period lengths are compared per day, and an export that is not older is said', () => {
  const older = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,200,1000,10%,3\n/b,200,1000,10%,3\n', 'Chart.csv': chartCsv('2025-11-01', 56) });
  const cur = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,50,1000,5%,6\n/b,100,1000,10%,3\n', 'Chart.csv': chartCsv('2026-01-01', 28) });
  const r = analyzeExport(cur, { compareDir: older, updates: [], breaks: [] });
  assert.deepEqual(r.decay.map(d => d.page), ['/a'], '/b held its clicks per day');
  assert.match(r.notes.join(' '), /56 days.*28 days|28 days.*56 days/);
  const flipped = analyzeExport(older, { compareDir: cur, updates: [], breaks: [] });
  assert.match(flipped.notes.join(' '), /should be the older/);
  const nodates = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,100,1000,10%,3\n' });
  assert.match(analyzeExport(cur, { compareDir: nodates, updates: [], breaks: [] }).notes.join(' '), /same number of days/);
});

test('--query-page must have a query and a page column', () => {
  const dir = basicExport();
  assert.throws(() => analyzeExport(dir, { queryPageFile: path.join(dir, 'Queries.csv'), updates: [], breaks: [] }), err => err instanceof TypeError && /query and a page/.test(err.message));
  const qp = path.join(dir, 'qp.csv');
  fs.writeFileSync(qp, 'Query,Page,Clicks,Impressions,CTR,Position\noak table,https://shop.test/a,5,600,1%,3\noak table,https://shop.test/b,2,400,1%,9\n');
  const r = analyzeExport(dir, { queryPageFile: qp, updates: [], breaks: [], minImpressions: 100 });
  assert.deepEqual(r.cannibalization.map(c => c.query), ['oak table']);
  assert.match(renderGscMarkdown(r), /oak table \(1,000 impressions\)/);
});

test('a brand list with no names excludes nothing; a name excludes its queries without regard to case', () => {
  const dir = basicExport();
  for (const brand of [',', ' , ', '']) assert.ok(analyzeExport(dir, { brand, updates: [], breaks: [] }).lowCtrQueries.some(q => q.query === 'oak dining table'), JSON.stringify(brand));
  assert.equal(analyzeExport(dir, { brand: 'Oak Dining, shop.test', updates: [], breaks: [] }).lowCtrQueries.length, 0);
});

test('markdown cells from the export cannot break a table', () => {
  const dir = writeExport({ 'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\n"a | b\nc",5,500,1%,5\nplain,5,500,1%,5\n' });
  const md = renderGscMarkdown(analyzeExport(dir, { updates: [], breaks: [] }));
  assert.match(md, /^\| a \\\| b c \|/m);
  assert.ok(md.split('\n').every(l => !/^c \|/.test(l)));
});

test('date problems and export filters are reported', () => {
  const dir = basicExport({ 'Chart.csv': 'Date,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 30 }, (_, i) => `${i + 1}/1/2026,10,300,3%,8`).join('\n') + '\n' });
  const r = analyzeExport(dir, { updates: [], breaks: [] });
  assert.equal(r.range, null);
  assert.match(r.notes.join(' '), /YYYY-MM-DD/);
  const ok = analyzeExport(basicExport(), { updates: [], breaks: [] });
  assert.deepEqual(ok.filters, []);
  const filtered = analyzeExport(basicExport({ 'Filters.csv': 'Filter,Value\nSearch type,Web\nCountry,Israel\n' }), { updates: [], breaks: [] });
  assert.deepEqual(filtered.filters, [{ name: 'Search type', value: 'Web' }, { name: 'Country', value: 'Israel' }]);
  assert.match(renderGscMarkdown(filtered), /Country: Israel/);
});

test('two files of one kind: one is used, the other is named', () => {
  const dir = basicExport({ 'Queries (1).csv': QUERIES.replace('oak table', 'copy table') });
  const r = analyzeExport(dir, { updates: [], breaks: [] });
  assert.match(r.notes.join(' '), /Queries\.csv.*ignored|ignored.*Queries\.csv/);
  assert.equal(Object.values(r.files).filter(f => /^Queries/.test(f)).length, 1);
});

test('data breaks: stated first, with a caution on every figure that relies on position or CTR', () => {
  const brk = { id: 'gsc-impressions-logging-error', start: '2025-05-13', end: '2026-04-27', affects: ['impressions', 'ctr', 'position'], notAffected: ['clicks'], what: 'Impressions were wrong.' };
  const step = { id: 'results-per-page-change', start: '2025-09-10', end: null, approximate: true, affects: ['impressions', 'position'], what: 'A measurement change.' };
  const md = renderGscMarkdown(analyzeExport(basicExport(), { updates: [], breaks: [brk, step] }));
  assert.match(section(md, 'Data breaks in this range'), /gsc-impressions-logging-error/);
  assert.doesNotMatch(section(md, 'Data breaks in this range'), /results-per-page-change/, 'a step change before the range is not inside it');
  for (const title of ['Striking distance', 'The site\'s own CTR curve', 'Low CTR queries']) assert.match(section(md, title), /Caution.*gsc-impressions-logging-error/, title);
  const approx = renderGscMarkdown(analyzeExport(basicExport({ 'Chart.csv': chartCsv('2025-09-01', 30) }), { updates: [], breaks: [step] }));
  assert.match(section(approx, 'Data breaks in this range'), /date approximate/);
  const none = renderGscMarkdown(analyzeExport(basicExport(), { updates: [], breaks: [] }));
  assert.match(section(none, 'Data breaks in this range'), /No known Search Console data break/);
  assert.doesNotMatch(section(none, 'Striking distance'), /Caution/);
});

test('drop check text: a possible drop gives its onset and says which updates cannot explain it', () => {
  const dir = basicExport({ 'Chart.csv': chartCsv('2026-07-20', 70, i => (i >= 46 ? 40 : 100)) });
  const updates = [{ name: 'Early update', start: day('2026-07-20', 44), end: day('2026-07-20', 50) }, { name: 'Late update', start: day('2026-07-20', 60), end: day('2026-07-20', 62) }, { name: 'Open update', start: day('2026-07-20', 65), end: null }];
  const md = renderGscMarkdown(analyzeExport(dir, { updates, breaks: [] }));
  const drop = section(md, 'Drop check');
  assert.match(drop, /possible real drop/);
  assert.match(drop, new RegExp(`Onset.*${day('2026-07-20', 46)}`));
  assert.match(drop, /Late update[^\n]*started after the onset/);
  assert.doesNotMatch(drop, /Early update[^\n]*started after the onset/);
  assert.match(drop, /Still rolling out: Open update/);
  assert.ok(drop.includes('Left out as possibly incomplete (Search Console lags 2 to 3 days; for an old export these days may be complete)'));
  const dip = renderGscMarkdown(analyzeExport(basicExport({ 'Chart.csv': chartCsv('2026-07-20', 70, i => (i >= 46 && i <= 52 ? 0 : 100)) }), { updates: [], breaks: [] }));
  assert.match(section(dip, 'Drop check'), /recovered/);
  assert.doesNotMatch(section(dip, 'Drop check'), /possible real drop/);
});

test('large exports stay linear in their rows', () => {
  const n = 60000;
  const q = 'Top queries,Clicks,Impressions,CTR,Position\n' + Array.from({ length: n }, (_, i) => `query ${i},${i % 9},${100 + (i % 500)},${(i % 9) / 10}%,${1 + (i % 25)}`).join('\n') + '\n';
  const p = 'Top pages,Clicks,Impressions,CTR,Position\n' + Array.from({ length: n }, (_, i) => `/page/${i},${i % 30},${100 + (i % 700)},3%,${1 + (i % 25)}`).join('\n') + '\n';
  const qp = 'Query,Page,Clicks,Impressions,CTR,Position\n' + Array.from({ length: n }, (_, i) => `query ${i % 20000},/page/${i % 7},1,${50 + (i % 40)},1%,${1 + (i % 25)}`).join('\n') + '\n';
  const dir = writeExport({ 'Queries.csv': q, 'Pages.csv': p, 'Query page.csv': qp, 'Chart.csv': chartCsv('2025-10-01', 400) });
  const t0 = Date.now();
  const r = analyzeExport(dir, { compareDir: dir, updates: [], breaks: [], minImpressions: 10 });
  const md = renderGscMarkdown(r);
  assert.ok(Date.now() - t0 < 15000, `took ${Date.now() - t0} ms`);
  assert.ok(r.cannibalization.length > 0 && md.length > 0);
});

test('command line: help, usage errors and paths that Git Bash rewrote', async () => {
  const h = await run(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Usage: node gsc-analyze\.mjs/);
  assert.match(h.stdout, /MSYS_NO_PATHCONV/);
  assert.equal((await run([])).code, 1);
  const dir = basicExport();
  const unknown = await run([dir, '--nope']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown option --nope/);
  for (const bad of [['--min-impressions', 'abc'], ['--min-impressions'], ['--brand'], ['--compare'], ['--query-page'], ['--out']]) {
    const r = await run([dir, ...bad, ...(bad[0] === '--out' ? [] : ['--out', path.join(tmp(), 'o')])]);
    assert.equal(r.code, 1, bad.join(' '));
    assert.match(r.stderr, new RegExp(bad[0]), bad.join(' '));
  }
  const rewritten = 'C:/Program Files/Git/tmp/gsc-export';
  const r1 = await run([rewritten]);
  assert.equal(r1.code, 1);
  assert.match(r1.stderr, /MSYS_NO_PATHCONV/);
  const r2 = await run([dir, '--compare', 'C:/Program Files/Git/tmp/older', '--out', path.join(tmp(), 'o')]);
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /MSYS_NO_PATHCONV/);
  const r3 = await run([dir, '--query-page', 'C:/Program Files/Git/tmp/qp.csv', '--out', path.join(tmp(), 'o')]);
  assert.equal(r3.code, 1);
  assert.match(r3.stderr, /MSYS_NO_PATHCONV/);
  const r4 = await run(['C:/Users/nobody-here/AppData/Local/Temp/gsc-export']);
  assert.equal(r4.code, 1);
  assert.match(r4.stderr, /MSYS_NO_PATHCONV/);
  const plain = await run([path.join(tmp(), 'nothing-here')]);
  assert.equal(plain.code, 1);
  assert.match(plain.stderr, /not found/i);
  assert.doesNotMatch(plain.stderr, /MSYS_NO_PATHCONV/, 'a plain missing folder is not blamed on Git Bash');
});

test('command line: Git Bash out folder', async () => {
  const r = await run([basicExport(), '--out', 'C:/Program Files/Git/tmp/gsc-out-test']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /MSYS_NO_PATHCONV/);
});

test('command line: a zip, a file, an empty folder and a folder of other CSVs are refused with a reason', async () => {
  const dir = tmp();
  const zip = path.join(dir, 'export.zip');
  fs.writeFileSync(zip, 'PK');
  const z = await run([zip]);
  assert.equal(z.code, 1);
  assert.match(z.stderr, /unzip/i);
  const f = await run([path.join(dir, 'export.csv')]);
  assert.equal(f.code, 1);
  fs.writeFileSync(path.join(dir, 'notes.csv'), 'a,b\n1,2\n');
  const other = await run([dir]);
  assert.equal(other.code, 1);
  assert.match(other.stderr, /No Search Console tables/);
  assert.match(other.stderr, /notes\.csv/);
  const empty = await run([tmp()]);
  assert.equal(empty.code, 1);
  assert.match(empty.stderr, /No Search Console tables/);
});

test('command line: writes gsc.json and gsc.md from the real updates and breaks files', async () => {
  const cwd = tmp();
  const dir = writeExport({ 'Queries.csv': QUERIES, 'Chart.csv': chartCsv('2026-08-10', 52, i => (i < 30 ? 100 : 95)) });
  const r = await run([dir, '--min-impressions', '500'], { cwd });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Wrote/);
  const json = JSON.parse(fs.readFileSync(path.join(cwd, 'seo', 'gsc', 'gsc.json'), 'utf8'));
  const range = { start: '2026-08-10', end: '2026-09-30' };
  assert.deepEqual(json.range, range);
  assert.equal(json.floor, 500);
  const md = fs.readFileSync(path.join(cwd, 'seo', 'gsc', 'gsc.md'), 'utf8');
  assert.ok(!md.includes(String.fromCharCode(0x2014)));
  assert.match(md, /28-day/, 'a 7-day window says what a 28-day one needs');
  // Whatever the data files say today about this range is in the report.
  for (const b of loadData('data-breaks').breaks.filter(x => overlaps(x, range))) assert.ok(md.includes(b.id), b.id);
  for (const u of loadData('updates').updates.filter(x => x.end === null && x.start <= range.end)) {
    assert.ok(md.includes(`Still rolling out: ${u.name}`), u.name);
  }
  const out = path.join(tmp(), 'nested', 'out');
  const second = await run([dir, '--out', out, '--brand', 'oak']);
  assert.equal(second.code, 0, second.stderr);
  assert.ok(fs.existsSync(path.join(out, 'gsc.md')));
});

test('the real data files: a range in 2025 meets the logging error, the results-per-page step and an update', () => {
  const dir = writeExport({ 'Queries.csv': QUERIES, 'Chart.csv': chartCsv('2025-08-01', 62) });
  const r = analyzeExport(dir);
  const ids = r.dataBreaks.map(b => b.id);
  assert.ok(ids.includes('gsc-impressions-logging-error') && ids.includes('results-per-page-change'), ids.join(','));
  assert.ok(r.drop.updatesInRange.some(u => u.name === 'August 2025 spam update'));
  assert.deepEqual(r.drop.rolling, [], 'a rolling update that began after this export is not named');
  const md = renderGscMarkdown(r);
  assert.match(section(md, 'Data breaks in this range'), /results-per-page-change \(2025-09-10 to ongoing, date approximate\)/);
});

// ---- Review fixes: update scope, early drops, brand curve, cut tables, renamed URLs ----

const flat = (start, n, fn = () => 100) => chartCsv(start, n, fn);
const dropOf = (chart, opts = {}) => analyzeExport(basicExport({ 'Chart.csv': chart }), { breaks: [], ...opts });
const line = (text, re) => text.split('\n').filter(l => re.test(l)).join('\n');

test('updates overlay: a scope that is not global is printed, and one that leaves out Web search cannot explain a drop', () => {
  const updates = [
    { name: 'Feb Discover update', type: 'discover-core', start: '2026-02-05', end: '2026-02-27', scope: 'Discover only, English, US' },
    { name: 'Feb global update', type: 'core', start: '2026-02-25', end: '2026-02-26', scope: 'global' },
    { name: 'Feb open update', type: 'spam', start: '2026-02-20', end: null, scope: 'global; up to two weeks; still rolling out on 2026-10-02' },
  ];
  const r = dropOf(flat('2026-02-01', 40), { updates, updatesVerified: '2026-10-02' });
  const drop = section(renderGscMarkdown(r), 'Drop check');
  const discover = line(drop, /Feb Discover update/);
  assert.match(discover, /Discover only, English, US/);
  assert.match(discover, /does not include Web search, so it cannot explain a drop in Web search clicks/);
  const global = line(drop, /Feb global update/);
  assert.match(global, /Google update in this range/);
  assert.doesNotMatch(global, /scope/i, 'a global update needs no scope line');
  assert.match(line(drop, /Google update in this range: Feb open update/), /still rolling out as of data\/updates\.json, verified 2026-10-02/);
  assert.match(line(drop, /^- Still rolling out: /), /^- Still rolling out: Feb open update \(as of data\/updates\.json, verified 2026-10-02\)/);
  assert.doesNotMatch(line(drop, /Feb open update/), /cannot explain/, 'a global update with a detail after the first semicolon is global');
  // The same facts are in the JSON.
  assert.equal(r.updatesVerified, '2026-10-02');
  assert.equal(r.drop.updatesVerified, '2026-10-02');
  const byName = Object.fromEntries(r.drop.updatesInRange.map(u => [u.name, u]));
  assert.equal(byName['Feb Discover update'].scope, 'Discover only, English, US');
  assert.equal(byName['Feb Discover update'].coversWeb, false);
  assert.equal(byName['Feb global update'].scope, 'global');
  assert.equal(byName['Feb global update'].coversWeb, true);
  assert.equal(r.drop.rolling[0].scope, 'global; up to two weeks; still rolling out on 2026-10-02');
  assert.equal(r.drop.rolling[0].coversWeb, true);
  // Updates handed in without a scope are global; without a verified date the report names none.
  const bare = dropOf(flat('2026-02-01', 40), { updates: [{ name: 'Bare', start: '2026-02-20', end: null }] });
  assert.equal(bare.drop.rolling[0].scope, 'global');
  assert.equal(bare.updatesVerified, null);
  assert.doesNotMatch(renderGscMarkdown(bare), /as of data\/updates\.json/);
});

// Fixture updates in the shape of data/updates.json: these tests must not depend on which update the real file shows as open today.
const FIXTURE_UPDATES = [
  { name: 'February 2026 Discover core update', type: 'discover-core', start: '2026-02-05', end: '2026-02-27', scope: 'Discover only, English, US' },
  { name: 'September 2026 spam update', type: 'spam', start: '2026-09-24', end: null, scope: 'global; up to two weeks; still rolling out on 2026-10-02' },
];

test('updates overlay: the real updates file is read by default and gives its verified date', () => {
  const verified = loadData('updates').verified;
  assert.match(verified, /^\d{4}-\d{2}-\d{2}$/);
  const r = analyzeExport(basicExport({ 'Chart.csv': flat('2026-02-01', 40) }), { breaks: [] });
  assert.equal(r.updatesVerified, verified);
  assert.ok(r.drop.updatesInRange.length > 0, 'the real file has updates in February 2026');
});

test('updates overlay: a Discover update says it is not Web search, and an open update is named as still rolling out with the verified date', () => {
  const verified = '2026-10-02';
  const r = analyzeExport(basicExport({ 'Chart.csv': flat('2026-02-01', 40) }), { breaks: [], updates: FIXTURE_UPDATES, updatesVerified: verified });
  const discover = line(section(renderGscMarkdown(r), 'Drop check'), /February 2026 Discover core update/);
  assert.match(discover, /Discover only, English, US/);
  assert.match(discover, /cannot explain a drop in Web search clicks/);
  const sep = analyzeExport(basicExport({ 'Chart.csv': flat('2026-08-10', 52) }), { breaks: [], updates: FIXTURE_UPDATES, updatesVerified: verified });
  assert.match(line(section(renderGscMarkdown(sep), 'Drop check'), /^- Still rolling out: /), new RegExp(`September 2026 spam update \\(as of data/updates\\.json, verified ${verified}\\)`));
  // Once the update has an end date nothing is rolling out, and the report no longer says so.
  const finished = FIXTURE_UPDATES.map(u => (u.end === null ? { ...u, end: '2026-10-05' } : u));
  const done = analyzeExport(basicExport({ 'Chart.csv': flat('2026-08-10', 52) }), { breaks: [], updates: finished, updatesVerified: verified });
  assert.deepEqual(done.drop.rolling, []);
  assert.doesNotMatch(renderGscMarkdown(done), /Still rolling out/);
});

test('a recovered one-week dip while an update is rolling is still no sustained drop, and not an early drop', () => {
  // 70 days to 2026-09-30: a one-week dip 2026-09-07..13, the newest three days incomplete.
  const chart = flat('2026-07-23', 70, i => { const d = day('2026-07-23', i); return (d >= '2026-09-07' && d <= '2026-09-13') || d >= '2026-09-28' ? 10 : 100; });
  const r = dropOf(chart, { updates: FIXTURE_UPDATES, updatesVerified: '2026-10-02' });
  assert.equal(r.range.end, '2026-09-30');
  assert.equal(r.drop.verdict, 'no-sustained-drop');
  assert.equal(r.drop.recovered, true);
  assert.equal(r.drop.early, false);
  assert.equal(r.drop.oneWeekDips[0].start, '2026-09-07');
  assert.ok(r.drop.rolling.some(u => u.name === 'September 2026 spam update'));
  const drop = section(renderGscMarkdown(r), 'Drop check');
  assert.doesNotMatch(drop, /early drop/i);
  assert.match(drop, /Last complete week \(2026-09-21 to 2026-09-27\)/);
});

test('fresh drops: the last complete week is always printed against the weeks before the window', () => {
  const start = '2026-07-20';
  // 70 days, the newest 3 left out, so a 28-day window. The last complete week is index 60..66.
  const fresh = (from, factor) => flat(start, 70, i => (i >= from && i <= 66 ? 100 * factor : 100));
  const flatRun = dropOf(flat(start, 70));
  assert.equal(flatRun.drop.early, false);
  assert.deepEqual(flatRun.drop.lastWeek, { start: day(start, 60), end: day(start, 66), clicks: 700 });
  assert.match(section(renderGscMarkdown(flatRun), 'Drop check'), new RegExp(`Last complete week \\(${day(start, 60)} to ${day(start, 66)}\\): 700 clicks, 0\\.0% against the average week of the 28 days before the window \\(${day(start, 11)} to ${day(start, 38)}\\)`));
  for (const [days, factor] of [[12, 0.7], [7, 0.5]]) {
    const r = dropOf(fresh(67 - days, factor));
    assert.equal(r.drop.verdict, 'no-sustained-drop', `${days} days`);
    assert.ok(r.drop.clicksChange > -0.2, `${days} days: the window as a whole is not down 20%`);
    assert.equal(r.drop.early, true, `${days} days`);
    const text = section(renderGscMarkdown(r), 'Drop check');
    assert.match(text, /Early drop/, `${days} days`);
    assert.match(text, /too early to call it sustained; check again in a week/, `${days} days`);
    assert.match(text, /Last complete week/, `${days} days`);
  }
  // A drop that already holds is the verdict itself, not an early one; a small dip is neither.
  const held = dropOf(fresh(46, 0.6));
  assert.equal(held.drop.verdict, 'possible-drop');
  assert.equal(held.drop.early, false);
  assert.doesNotMatch(section(renderGscMarkdown(held), 'Drop check'), /Early drop/);
  const small = dropOf(fresh(60, 0.85));
  assert.equal(small.drop.early, false);
  // A recovered dip is not early either.
  const dip = dropOf(flat(start, 70, i => (i >= 46 && i <= 52 ? 0 : 100)));
  assert.equal(dip.drop.recovered, true);
  assert.equal(dip.drop.early, false);
});

test('--brand: brand queries are left out of the CTR curve before its medians are taken, and the curve section says so', () => {
  const rows = [['shoes a', 20], ['shoes b', 40], ['shoes c', 60], ['acme shoes', 500]].map(([q, clicks]) => `${q},${clicks},1000,${clicks / 10}%,4.2`).join('\n');
  const dir = writeExport({ 'Queries.csv': 'Top queries,Clicks,Impressions,CTR,Position\n' + rows + '\n' });
  const bucket = r => r.curve.find(c => c.bucket === '4-5');
  const without = analyzeExport(dir, { updates: [], breaks: [] });
  assert.equal(bucket(without).n, 4);
  assert.ok(Math.abs(bucket(without).medianCtr - 0.05) < 1e-9, 'the brand query lifts the median');
  assert.match(section(renderGscMarkdown(without), 'The site\'s own CTR curve'), /Brand queries are included/);
  const withBrand = analyzeExport(dir, { brand: 'Acme', updates: [], breaks: [] });
  assert.equal(bucket(withBrand).n, 3);
  assert.ok(Math.abs(bucket(withBrand).medianCtr - 0.04) < 1e-9, 'without the brand query the median is the shoppers\'');
  assert.deepEqual(withBrand.brand, { names: ['Acme'], excludedFromCurve: 1 });
  const text = section(renderGscMarkdown(withBrand), 'The site\'s own CTR curve');
  assert.match(text, /Brand queries are excluded/);
  assert.match(text, /1 row matching Acme/);
  assert.match(section(renderGscMarkdown(analyzeExport(dir, { brand: 'nothing matches', updates: [], breaks: [] })), 'The site\'s own CTR curve'), /Brand queries are excluded[^\n]*no row matched/);
  // An empty brand list is no brand.
  assert.match(section(renderGscMarkdown(analyzeExport(dir, { brand: ' , ', updates: [], breaks: [] })), 'The site\'s own CTR curve'), /Brand queries are included/);
  // A pages export has no queries to leave out.
  const pagesOnly = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\n/a,50,1000,5%,4.2\n/b,50,1000,5%,4.2\n/c,50,1000,5%,4.2\n' });
  const p = analyzeExport(pagesOnly, { brand: 'acme', updates: [], breaks: [] });
  assert.equal(p.brand.excludedFromCurve, 0);
  assert.match(section(renderGscMarkdown(p), 'The site\'s own CTR curve'), /--brand was given[^\n]*pages export[^\n]*cannot be left out/);
});

test('Low CTR pages say which curve they are judged against, and a cut table says how many rows there are', () => {
  const many = (n, lowFrom) => Array.from({ length: n }, (_, i) => `${i},${i >= lowFrom ? 5 : 50},1000,${i >= lowFrom ? 0.5 : 5}%,4.2`);
  const qs = 'Top queries,Clicks,Impressions,CTR,Position\n' + many(55, 30).map(r => `query ${r}`).join('\n') + '\n';
  const ps = 'Top pages,Clicks,Impressions,CTR,Position\n' + many(55, 30).map(r => `/page/${r}`).join('\n') + '\n';
  const r = analyzeExport(writeExport({ 'Queries.csv': qs, 'Pages.csv': ps, 'Chart.csv': flat('2026-01-01', 30) }), { updates: [], breaks: [], minImpressions: 100 });
  const md = renderGscMarkdown(r);
  const pages = section(md, 'Low CTR pages');
  assert.doesNotMatch(pages.split('\n')[0], /against the curve above/);
  assert.match(pages.split('\n')[0], /pages' own curve/);
  assert.match(pages, /\| Position \| Rows \| Median CTR \|/, 'the pages curve is printed');
  assert.equal(r.pagesCurve.find(c => c.bucket === '4-5').n, 55);
  assert.match(section(md, 'Low CTR queries').split('\n')[0], /against the curve above/);
  assert.match(section(md, 'Striking distance'), /showing 20 of 55/i);
  assert.equal(r.lowCtrQueries.length, 25);
  assert.match(section(md, 'Low CTR queries'), /showing 20 of 25/i);
  assert.match(section(md, 'Low CTR pages'), /showing 20 of 25/i);
  // Nothing is cut when 20 rows or fewer are listed.
  const small = renderGscMarkdown(analyzeExport(basicExport(), { updates: [], breaks: [] }));
  assert.doesNotMatch(small, /showing \d+ of/i);
  // Cannibalization (20 shown) and decay (30 shown).
  const qp = 'Query,Page,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 22 }, (_, i) => `q${i},/a,1,500,1%,3\nq${i},/b,1,500,1%,5`).join('\n') + '\n';
  const cann = analyzeExport(writeExport({ 'Queries.csv': QUERIES, 'Query page.csv': qp }), { updates: [], breaks: [], minImpressions: 100 });
  assert.match(section(renderGscMarkdown(cann), 'Cannibalization'), /showing 20 of 22/i);
  const old = 'Top pages,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 32 }, (_, i) => `/p${i},100,1000,10%,3`).join('\n') + '\n';
  const cur = 'Top pages,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 32 }, (_, i) => `/p${i},10,1000,1%,3`).join('\n') + '\n';
  const dec = analyzeExport(writeExport({ 'Pages.csv': cur }), { compareDir: writeExport({ 'Pages.csv': old }), updates: [], breaks: [] });
  assert.match(section(renderGscMarkdown(dec), 'Decay'), /showing 30 of 32/i);
});

test('decay: when most of the older pages are missing from the current export, the URL form may have changed', () => {
  const older = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttp://shop.test/a,100,1000,10%,3\nhttp://shop.test/b,100,1000,10%,3\nhttp://shop.test/c,100,1000,10%,3\nhttp://shop.test/d,100,1000,10%,3\n' });
  const renamed = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttps://www.shop.test/a/,100,1000,10%,3\nhttps://www.shop.test/b/,100,1000,10%,3\nhttps://www.shop.test/c/,100,1000,10%,3\nhttps://www.shop.test/d/,100,1000,10%,3\n' });
  const r = analyzeExport(renamed, { compareDir: older, updates: [], breaks: [] });
  assert.equal(r.compare.olderPages, 4);
  assert.equal(r.compare.missingPages, 4);
  assert.equal(r.compare.mostMissing, true);
  const text = section(renderGscMarkdown(r), 'Decay');
  assert.match(text, /4 of the 4 pages/);
  assert.match(text, /URL form may have changed \(http or https, www, trailing slash\)/);
  assert.match(text, /renamed, not lost/);
  // Under half missing: no warning. Exactly half is not "most".
  const kept = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttp://shop.test/a,100,1000,10%,3\nhttp://shop.test/b,100,1000,10%,3\nhttp://shop.test/c,10,1000,1%,3\n' });
  const ok = analyzeExport(kept, { compareDir: older, updates: [], breaks: [] });
  assert.equal(ok.compare.missingPages, 1);
  assert.equal(ok.compare.mostMissing, false);
  assert.doesNotMatch(section(renderGscMarkdown(ok), 'Decay'), /URL form/);
  const half = writeExport({ 'Pages.csv': 'Top pages,Clicks,Impressions,CTR,Position\nhttp://shop.test/a,100,1000,10%,3\nhttp://shop.test/b,100,1000,10%,3\n' });
  assert.equal(analyzeExport(half, { compareDir: older, updates: [], breaks: [] }).compare.mostMissing, false);
});

test('scope and early-drop edges: exactly -20% is early, scope words are read from the scope head only', async () => {
  const { coversWebSearch } = await import('./gsc-analyze.mjs');
  assert.equal(coversWebSearch('global'), true);
  assert.equal(coversWebSearch('global; up to two weeks; still rolling out on 2026-10-02'), true);
  assert.equal(coversWebSearch('global, English only'), true);
  assert.equal(coversWebSearch('Discover only, English, US'), false);
  assert.equal(coversWebSearch('Discover only; Web search not affected'), false);
  assert.equal(coversWebSearch('US only'), null);
  assert.equal(coversWebSearch('Search and Discover'), null);
  const day = i => new Date(Date.parse('2026-07-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
  const rows = Array.from({ length: 70 }, (_, i) => ({ date: day(i), clicks: i >= 60 && i <= 66 ? 80 : 100, impressions: 2000 }));
  const d = dropCheck(rows, { updates: [], breaks: [] });
  assert.equal(d.verdict, 'no-sustained-drop');
  assert.equal(d.early, true);
});

// ---- decay is ranked by the clicks a page lost, not by the percentage ----

test('decay: a page that lost 700 clicks (35%) is listed before 40 pages that lost about 10 clicks each, and the cut note says how many there are', () => {
  const older = [{ page: '/big', clicks: 2000 }, ...Array.from({ length: 40 }, (_, i) => ({ page: `/small${i}`, clicks: 20 }))];
  const now = [{ page: '/big', clicks: 1300 }, ...Array.from({ length: 40 }, (_, i) => ({ page: `/small${i}`, clicks: 10 }))];
  const d = decay(now, older);
  assert.equal(d.length, 41);
  assert.equal(d[0].page, '/big');
  assert.equal(d[0].lostClicks, 700);
  assert.ok(Math.abs(d[0].change + 0.35) < 1e-9, 'the percentage is kept');
  assert.ok(d.slice(1).every(x => x.lostClicks === 10 && x.change === -0.5));
  // Ties on lost clicks go to the bigger percentage drop, then to the page name, so the order never depends on the input order.
  const tie = decay([{ page: '/d', clicks: 30 }, { page: '/a', clicks: 40 }, { page: '/c', clicks: 0 }, { page: '/b', clicks: 30 }], [{ page: '/d', clicks: 50 }, { page: '/a', clicks: 60 }, { page: '/c', clicks: 20 }, { page: '/b', clicks: 50 }]);
  assert.deepEqual(tie.map(x => [x.page, x.lostClicks]), [['/c', 20], ['/b', 20], ['/d', 20], ['/a', 20]]);
  // Through the report: the cut table starts with the page that matters most.
  const csv = rows => 'Top pages,Clicks,Impressions,CTR,Position\n' + rows.map(r => `${r.page},${r.clicks},${r.clicks * 20},5%,4`).join('\n') + '\n';
  const r = analyzeExport(writeExport({ 'Pages.csv': csv(now) }), { compareDir: writeExport({ 'Pages.csv': csv(older) }), updates: [], breaks: [] });
  assert.equal(r.decay[0].page, '/big');
  const text = section(renderGscMarkdown(r), 'Decay');
  const first = text.split('\n').find(l => l.startsWith('| /'));
  assert.match(first, /^\| \/big \| 2,?000 \| 1,?300 \| /);
  assert.match(first, /-35(\.0)?%/);
  assert.match(text, /\| Clicks lost \|/);
  assert.match(text, /showing 30 of 41/i);
  assert.match(text, /most clicks lost/i, 'the section says how it is ordered');
  assert.equal(text.split('\n').filter(l => l.startsWith('| /')).length, 30);
});
