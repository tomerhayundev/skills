import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, nextVersion, sha256File, writeJson, readJson, SKILL_DIR } from './cli.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));

test('parseArgs reads positionals, flags and values', () => {
  assert.deepEqual(parseArgs(['a.svg', '--out', 'x.json', '--dry', '--width=1200']), { _: ['a.svg'], out: 'x.json', dry: true, width: '1200' });
});

test('nextVersion counts up and never reuses a kept version', () => {
  const dir = tmp();
  const f = path.join(dir, 'board.png');
  assert.equal(nextVersion(f), path.join(dir, 'board-v1.png'));
  for (const n of ['board-v1.png', 'board-v3.png', 'board-v2@2x.png']) fs.writeFileSync(path.join(dir, n), '');
  assert.equal(nextVersion(f), path.join(dir, 'board-v4.png'));
});

test('writeJson creates folders, readJson and sha256File read back', () => {
  const f = path.join(tmp(), 'a', 'b.json');
  writeJson(f, { x: 1 });
  assert.deepEqual(readJson(f), { x: 1 });
  assert.match(sha256File(f), /^[0-9a-f]{64}$/);
});

test('SKILL_DIR points at the skill folder', () => {
  assert.equal(path.basename(SKILL_DIR), 'brand-identity-master');
  assert.ok(fs.existsSync(path.join(SKILL_DIR, 'scripts', 'lib', 'cli.mjs')));
});
