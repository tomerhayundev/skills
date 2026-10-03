import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { finding, sortFindings, findingsMarkdown, parseArgs, isMain } from './report.mjs';

test('finding validates severity and label', () => {
  const f = finding('X', 'high', 'D', 'msg', { urls: ['https://a.test/'] });
  assert.deepEqual(f, { code: 'X', severity: 'high', label: 'D', message: 'msg', evidence: { urls: ['https://a.test/'] } });
  assert.throws(() => finding('X', 'urgent', 'D', 'm'), /severity/);
  assert.throws(() => finding('X', 'high', 'Z', 'm'), /label/);
});

test('sortFindings orders by severity then code', () => {
  const list = [finding('B', 'low', 'D', 'b'), finding('A', 'critical', 'D', 'a'), finding('C', 'low', 'H', 'c'), finding('A2', 'low', 'D', 'a2')];
  assert.deepEqual(sortFindings(list).map(f => f.code), ['A', 'A2', 'B', 'C']);
});

test('sortFindings puts severity first even when code order disagrees', () => {
  const list = [
    finding('A', 'low', 'D', 'a'),
    finding('B', 'medium', 'D', 'b'),
    finding('C', 'high', 'D', 'c'),
    finding('Z', 'critical', 'D', 'z'),
    finding('A', 'info', 'D', 'a-info'),
  ];
  assert.deepEqual(sortFindings(list).map(f => f.severity), ['critical', 'high', 'medium', 'low', 'info']);
  assert.deepEqual(sortFindings(list).map(f => f.code), ['Z', 'C', 'B', 'A', 'A']);
  const medHigh = [finding('A', 'medium', 'D', 'a'), finding('Z', 'high', 'D', 'z')];
  assert.deepEqual(sortFindings(medHigh).map(f => f.code), ['Z', 'A']);
});

test('sortFindings breaks ties by plain code order, not by locale', () => {
  const list = [finding('b', 'low', 'D', 'lower'), finding('B', 'low', 'D', 'upper'), finding('a', 'low', 'D', 'a')];
  assert.deepEqual(sortFindings(list).map(f => f.code), ['B', 'a', 'b']);
});

test('sortFindings does not mutate its input', () => {
  const list = [finding('B', 'low', 'D', 'b'), finding('A', 'critical', 'D', 'a')];
  sortFindings(list);
  assert.deepEqual(list.map(f => f.code), ['B', 'A']);
});

test('findingsMarkdown lists findings with labels and caps urls at 10', () => {
  const urls = Array.from({ length: 12 }, (_, i) => `https://a.test/${i}`);
  const md = findingsMarkdown('Crawl', [finding('T', 'medium', 'H', 'Thin', { urls })], ['note one']);
  assert.match(md, /^# Crawl/);
  assert.match(md, /- note one/);
  assert.match(md, /\*\*medium\*\* `T` \(heuristic\): Thin/);
  assert.match(md, /and 2 more/);
  assert.match(findingsMarkdown('Empty', []), /No findings\./);
});

test('parseArgs handles positional, --k v, --k=v and boolean flags', () => {
  assert.deepEqual(parseArgs(['https://a.test', '--max', '50', '--out=dir', '--help']), { _: ['https://a.test'], max: '50', out: 'dir', help: true });
});

const REPORT_URL = new URL('./report.mjs', import.meta.url).href;

// Writes probe scripts into a fresh temp dir; the dir is removed when the test ends.
function isMainFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ismain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = path.join(root, 'real');
  fs.mkdirSync(real);
  const imp = `import { isMain } from ${JSON.stringify(REPORT_URL)};\n`;
  fs.writeFileSync(path.join(real, 'probe.mjs'), imp + 'console.log(isMain(import.meta.url));\n');
  fs.writeFileSync(path.join(real, 'child.mjs'), imp + 'export const childIsMain = isMain(import.meta.url);\n');
  fs.writeFileSync(path.join(real, 'parent.mjs'), imp
    + "import { childIsMain } from './child.mjs';\n"
    + 'console.log(JSON.stringify({ parent: isMain(import.meta.url), child: childIsMain }));\n');
  return { root, real };
}

function runNode(file) {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('isMain is true for the script node runs directly', t => {
  const { real } = isMainFixture(t);
  assert.equal(runNode(path.join(real, 'probe.mjs')), 'true');
});

test('isMain is true when the script is run through a symlink or junction', t => {
  const { root, real } = isMainFixture(t);
  const link = path.join(root, 'link');
  try {
    fs.symlinkSync(real, link, 'junction');
  } catch (err) {
    t.skip(`cannot create a directory junction here: ${err.code || err.message}`);
    return;
  }
  assert.equal(runNode(path.join(link, 'probe.mjs')), 'true');
});

test('isMain is false for an imported module and for a URL that is not the entry script', t => {
  const { real } = isMainFixture(t);
  assert.deepEqual(JSON.parse(runNode(path.join(real, 'parent.mjs'))), { parent: true, child: false });
  assert.equal(isMain(pathToFileURL(path.join(os.tmpdir(), 'not-the-entry-script.mjs')).href), false);
});
