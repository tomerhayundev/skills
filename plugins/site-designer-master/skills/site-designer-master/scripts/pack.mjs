#!/usr/bin/env node
// The picture pack: every library picture in one gzipped file (a JSON index, then the files back to back), so
// the picker downloads it once and works offline. No archive tools needed on either side.
//   node pack.mjs build <pack dir> <out.bin.gz>       prints the checksum and file count for assets/library/pack.json
//   node pack.mjs unpack <file.bin.gz> <pack dir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs, isMain } from './lib/cli.mjs';

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).replace(/\\/g, '/')];
  });
}

export function buildPack(dir, out, { extra = [] } = {}) {
  const files = walk(dir).sort().map((p) => ({ path: p, data: fs.readFileSync(path.join(dir, p)) })).concat(extra);
  let offset = 0;
  const index = files.map((f) => { const e = { path: f.path, offset, size: f.data.length }; offset += f.data.length; return e; });
  const head = Buffer.from(JSON.stringify({ format: 1, files: index }));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  const gz = zlib.gzipSync(Buffer.concat([len, head, ...files.map((f) => f.data)]), { level: 6 });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, gz);
  return { files: files.length, bytes: gz.length, sha256: crypto.createHash('sha256').update(gz).digest('hex') };
}

export function unpack(file, dir) {
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  const n = raw.readUInt32BE(0);
  const { files } = JSON.parse(raw.subarray(4, 4 + n).toString('utf8'));
  const base = path.resolve(dir);
  const start = 4 + n;
  for (const f of files) {
    const target = path.resolve(base, f.path);
    if (!target.startsWith(base + path.sep)) throw new Error(`${f.path} is outside the pack folder`);
  }
  for (const f of files) {
    const target = path.resolve(base, f.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, raw.subarray(start + f.offset, start + f.offset + f.size));
  }
  return files.length;
}

// Makes sure the pictures are on this machine: the pack named in assets/library/pack.json is downloaded once,
// checked against its checksum and unpacked; a version already unpacked is used as it is.
export async function ensurePack(info, dir, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {}) {
  const stamp = path.join(dir, '.pack-version');
  if (info.version && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === info.version) return { ok: true, from: 'cache', version: info.version };
  if (!info.url) return { ok: false, reason: 'no pack address yet' };
  try {
    const res = await fetchImpl(info.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, reason: `download answered ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== info.sha256) return { ok: false, reason: 'checksum does not match; the download was not used' };
    const tmpFile = path.join(path.dirname(path.resolve(dir)), `.pack-${process.pid}.bin.gz`);
    fs.writeFileSync(tmpFile, buf);
    try { unpack(tmpFile, dir); } finally { fs.rmSync(tmpFile, { force: true }); }
    fs.writeFileSync(stamp, `${info.version}\n`);
    return { ok: true, from: 'download', version: info.version };
  } catch (e) {
    return { ok: false, reason: `download failed: ${e.message}` };
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, a, b] = args._;
  if (cmd === 'build' && a && b) console.log(JSON.stringify(buildPack(a, b)));
  else if (cmd === 'unpack' && a && b) console.log(`${unpack(a, b)} files`);
  else { console.error('usage: node pack.mjs build <pack dir> <out.bin.gz> | unpack <file> <dir>'); process.exit(2); }
}
