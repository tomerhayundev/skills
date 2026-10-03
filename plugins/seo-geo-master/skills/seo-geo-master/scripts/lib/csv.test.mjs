import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeHeader, parseNumber, readGscTable } from './csv.mjs';

test('parseCsv handles quotes, escaped quotes, CRLF, BOM, empty lines and multi-line fields', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\n\n1,2\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\n"multi\nline"'), [['a'], ['multi\nline']]);
});

test('normalizeHeader maps English and Hebrew Search Console headers', () => {
  const en = { 'Top queries': 'query', 'Top pages': 'page', Query: 'query', Page: 'page', Clicks: 'clicks', Impressions: 'impressions', CTR: 'ctr', Position: 'position', Date: 'date', Country: 'country', Device: 'device', 'Search Appearance': 'appearance' };
  for (const [h, k] of Object.entries(en)) assert.equal(normalizeHeader(h), k, h);
  const he = { 'שאילתות מובילות': 'query', 'דפים מובילים': 'page', 'קליקים': 'clicks', 'חשיפות': 'impressions', 'שיעור קליקים': 'ctr', 'מיקום': 'position', 'תאריך': 'date', 'מדינה': 'country', 'מכשיר': 'device' };
  for (const [h, k] of Object.entries(he)) assert.equal(normalizeHeader(h), k, h);
  assert.equal(normalizeHeader('Filter'), null);
});

test('parseNumber', () => {
  assert.equal(parseNumber('1,234'), 1234);
  assert.ok(Math.abs(parseNumber('4.3%') - 0.043) < 1e-12);
  assert.equal(parseNumber('17.1'), 17.1);
  assert.equal(parseNumber(0.05), 0.05);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});

test('readGscTable classifies and converts tables', () => {
  const q = readGscTable('Top queries,Clicks,Impressions,CTR,Position\noak table,10,200,5%,3.2\n"oak, walnut",1,50,2%,12\n');
  assert.equal(q.kind, 'queries');
  assert.deepEqual(q.rows[0], { query: 'oak table', clicks: 10, impressions: 200, ctr: 0.05, position: 3.2 });
  assert.equal(q.rows[1].query, 'oak, walnut');
  assert.equal(q.capped, false);
  assert.equal(readGscTable('Query,Page,Clicks,Impressions,CTR,Position\na,https://x.test/,1,2,50%,1\n').kind, 'queryPage');
  assert.equal(readGscTable('Date,Clicks,Impressions,CTR,Position\n2026-09-01,5,100,5%,8\n').kind, 'dates');
  assert.equal(readGscTable('שאילתות מובילות,קליקים,חשיפות,CTR,מיקום\nשולחן,3,90,3.3%,7.5\n').rows[0].clicks, 3);
  assert.equal(readGscTable('Filter,Value\nSearch type,Web\n').kind, null);
  const capped = 'Top pages,Clicks,Impressions,CTR,Position\n' + Array.from({ length: 1000 }, (_, i) => `https://x.test/${i},1,10,10%,5`).join('\n');
  assert.equal(readGscTable(capped).capped, true);
});

test('readGscTable keeps the last of duplicate columns, ignores unknown ones and tolerates short rows', () => {
  const t = readGscTable('Query,Notes,Clicks,Clicks,Impressions\noak,x,1,2,30\nbirch\n');
  assert.equal(t.kind, 'queries');
  assert.deepEqual(t.rows[0], { query: 'oak', clicks: 2, impressions: 30 });
  assert.deepEqual(t.rows[1], { query: 'birch', clicks: null, impressions: null });
});

test('readGscTable stays linear on a hostile file with a very wide header and many rows', () => {
  const n = 20000;
  const text = Array(n).fill('Clicks').join(',') + '\n' + Array(n).fill('1').join('\n') + '\n';
  const start = Date.now();
  const t = readGscTable(text);
  const ms = Date.now() - start;
  assert.equal(t.rows.length, n);
  assert.ok(ms < 1000, `took ${ms} ms`);
});

test('hardening: direction marks in numbers, mid-field quotes, 1,000 or more rows', () => {
  const NL = String.fromCharCode(10);
  assert.equal(parseNumber('\u200e1,234'), 1234);
  assert.ok(Math.abs(parseNumber('4.3%\u200f') - 0.043) < 1e-12);
  assert.equal(parseNumber('\u202a12\u202c'), 12);
  assert.deepEqual(parseCsv(['5" table,1', 'foo,2', ''].join(NL)), [['5" table', '1'], ['foo', '2']]);
  const rows = Array.from({ length: 1001 }, (_, i) => 'https://x.test/' + i + ',1,10,10%,5');
  assert.equal(readGscTable(['Top pages,Clicks,Impressions,CTR,Position', ...rows].join(NL)).capped, true);
});
