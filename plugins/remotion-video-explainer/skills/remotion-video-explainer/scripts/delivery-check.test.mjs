// node --test scripts/delivery-check.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boxOrder } from "./delivery-check.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "delivery-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "delivery-"));
const check = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

const BOX = "drawbox=x=40:y=40:w=120:h=60:color=0xE65238:t=fill";
/** 2 s of a brand red on a light ground, with a tone unless `audio` is false, encoded through `vf` with `outArgs`. */
function film(name, { vf, outArgs }, { audio = true } = {}) {
  const out = join(dir, name);
  const inputs = ["-f", "lavfi", "-i", "color=c=0xF2F0EB:s=320x180:r=30:d=2"];
  if (audio) inputs.push("-f", "lavfi", "-i", "sine=f=440:d=2");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-vf", vf, "-c:v", "libx264", ...outArgs, ...(audio ? ["-shortest"] : []), out]);
  assert.equal(r.status, 0, String(r.stderr));
  return out;
}
/** What colorSpace: "bt709" gives: limited range, BT.709 matrix, primaries and transfer, index first. */
const RIGHT = {
  vf: `${BOX},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`,
  outArgs: ["-c:a", "aac", "-movflags", "+faststart"],
};
/** What a Remotion render gives without colorSpace: full-range yuvj420p, BT.601 matrix, no primaries or transfer. */
const FULL_RANGE = {
  vf: `${BOX},scale=out_color_matrix=bt601:out_range=pc,format=yuvj420p,setparams=range=pc:colorspace=bt470bg`,
  outArgs: ["-c:a", "aac", "-movflags", "+faststart"],
};
const without = (spec, ...drop) => ({ ...spec, outArgs: spec.outArgs.filter((a, i, l) => !drop.includes(a) && !drop.includes(l[i - 1])) });

test("a full-range BT.601 file fails, with how far the brand colour moves on a player that assumes BT.709", () => {
  const r = check(film("full.mp4", FULL_RANGE));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /yuvj420p/);
  assert.match(r.stdout, /colour: full range \(pc\), matrix bt470bg/);
  assert.match(r.stdout, /a player that ignores the tags shows colours up to \d+ levels off/);
  assert.match(r.stdout, /colorSpace: "bt709"/, "says the fix");
});

test("a limited-range BT.709 file with its moov first and AAC passes", () => {
  const r = check(film("right.mp4", RIGHT));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /OK/);
});

test("a file whose index sits at the end fails: a phone waits for the whole download", () => {
  const r = check(film("late.mp4", without(RIGHT, "-movflags")));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /moov after mdat/);
});

test("audio that is not AAC fails; a silent film is noted, not failed", () => {
  const mp3 = { ...RIGHT, outArgs: RIGHT.outArgs.map((a) => (a === "aac" ? "libmp3lame" : a)) };
  const r = check(film("mp3.mp4", mp3));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /audio: mp3/);
  const silent = check(film("silent.mp4", without(RIGHT, "-c:a"), { audio: false }));
  assert.equal(silent.status, 0, silent.stdout);
  assert.match(silent.stdout, /no audio stream/);
});

test("several files are checked in one call, and one failure fails the call", () => {
  const r = check(film("a.mp4", RIGHT), film("b.mp4", FULL_RANGE));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /a\.mp4: OK/);
  assert.match(r.stdout, /b\.mp4:\r?\n  - /);
  assert.match(r.stdout, /1 of 2 file\(s\) not ready to deliver/);
});

test("the box reader finds top-level boxes in file order", () => {
  const head = (type, size) => { const b = Buffer.alloc(8); b.writeUInt32BE(size); b.write(type, 4, "latin1"); return b; };
  const file = Buffer.concat([head("ftyp", 16), Buffer.alloc(8), head("moov", 8), head("mdat", 12), Buffer.alloc(4)]);
  assert.deepEqual(boxOrder(file), ["ftyp", "moov", "mdat"]);
});
