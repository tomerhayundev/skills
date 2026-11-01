import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { buildPack, unpack, ensurePack } from './pack.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-'));
function packDir() {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'sites'), { recursive: true });
  fs.writeFileSync(path.join(d, 'sites', 'a.webp'), Buffer.from([1, 2, 3, 4]));
  fs.writeFileSync(path.join(d, 'sites', 'a-large.webp'), Buffer.alloc(5000, 7));
  fs.mkdirSync(path.join(d, 'icons'));
  fs.writeFileSync(path.join(d, 'icons', 'b.webp'), Buffer.from('xyz'));
  return d;
}

test('a pack holds every file and unpacks to the same bytes', () => {
  const src = packDir();
  const out = path.join(tmp(), 'pack.bin.gz');
  const info = buildPack(src, out);
  assert.equal(info.files, 3);
  assert.match(info.sha256, /^[0-9a-f]{64}$/);
  const dest = tmp();
  unpack(out, dest);
  for (const f of ['sites/a.webp', 'sites/a-large.webp', 'icons/b.webp']) assert.deepEqual(fs.readFileSync(path.join(dest, f)), fs.readFileSync(path.join(src, f)), f);
});

test('a file path that climbs out of the folder is refused', () => {
  const src = packDir();
  const out = path.join(tmp(), 'pack.bin.gz');
  buildPack(src, out, { extra: [{ path: '../evil.txt', data: Buffer.from('x') }] });
  assert.throws(() => unpack(out, tmp()), /outside the pack folder/);
});

test('ensurePack downloads, checks the checksum and unpacks; a wrong checksum is refused', async () => {
  const src = packDir();
  const file = path.join(tmp(), 'pack.bin.gz');
  const { sha256 } = buildPack(src, file);
  const srv = http.createServer((req, res) => { res.end(fs.readFileSync(file)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/pack.bin.gz`;
  try {
    const dest = path.join(tmp(), 'pack');
    assert.deepEqual(await ensurePack({ url, sha256, version: 'v1' }, dest), { ok: true, from: 'download', version: 'v1' });
    assert.ok(fs.existsSync(path.join(dest, 'sites', 'a.webp')));
    assert.deepEqual(await ensurePack({ url, sha256, version: 'v1' }, dest), { ok: true, from: 'cache', version: 'v1' });
    const bad = path.join(tmp(), 'pack');
    const r = await ensurePack({ url, sha256: '0'.repeat(64), version: 'v1' }, bad);
    assert.equal(r.ok, false);
    assert.match(r.reason, /checksum/);
    assert.equal(fs.existsSync(path.join(bad, 'sites')), false);
  } finally { srv.close(); }
});

test('no pack address means no download, and says so', async () => {
  const r = await ensurePack({}, path.join(tmp(), 'pack'));
  assert.deepEqual(r, { ok: false, reason: 'no pack address yet' });
});
