// node --test scripts/critic-pack.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makePack, parseFrames } from "./critic-pack.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "critic-pack.mjs");
const dir = mkdtempSync(join(tmpdir(), "critic-"));
const film = join(dir, "film.mp4");
// 4 s of one color, then a hard cut at frame 120 to another, with a tone that gets louder at 2 s.
spawnSync("ffmpeg", [
  "-v", "error", "-y",
  "-f", "lavfi", "-i", "color=c=0x224466:s=360x640:r=30:d=4",
  "-f", "lavfi", "-i", "color=c=0xddaa33:s=360x640:r=30:d=4",
  "-f", "lavfi", "-i", "sine=f=220:d=8",
  "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v];[2:a]volume='if(lt(t,2),0.1,0.8)':eval=frame[a]",
  "-map", "[v]", "-map", "[a]", "-pix_fmt", "yuv420p", "-c:a", "aac", film,
]);

test("frames come from a cuts.json (array or { cuts }) or a comma list, and must be whole", () => {
  const a = join(dir, "a.json");
  writeFileSync(a, JSON.stringify([30, 120]));
  const b = join(dir, "b.json");
  writeFileSync(b, JSON.stringify({ cuts: [{ frame: 45 }] }));
  assert.deepEqual(parseFrames(a), [30, 120]);
  assert.deepEqual(parseFrames(b), [45]);
  assert.deepEqual(parseFrames("15,60"), [15, 60]);
  assert.deepEqual(parseFrames(undefined), []);
  assert.throws(() => parseFrames("1.5"), /whole numbers/);
});

test("the pack holds the dense sheets, both sides of every cut, a strip per moment, frozen time, the audio timeline and an index", async () => {
  const out = join(dir, "pack");
  const written = await makePack(film, { cuts: [120], moments: [120], outDir: out });
  assert.deepEqual(written, ["hook.png", "contact.png", "phone.png", "dense-1.png", "dense-2.png", "cuts.png", "cut-120.png", "strip-120.png", "motion.txt", "audio.txt", "index.md"]);
  for (const f of written) assert.ok(existsSync(join(out, f)), f);
  const size = (f) => JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", join(out, f)], { encoding: "utf8" }).stdout).streams[0];
  assert.equal(size("cuts.png").width, 2 * 180 + 4, "one pair, tall video at 180 px, 4 px apart");
  assert.equal(size("strip-120.png").width, 12 * 180 + 11 * 4);
  assert.equal(size("hook.png").width, 12 * 180 + 11 * 4, "12 frames across the first two seconds");
  const index = readFileSync(join(out, "index.md"), "utf8");
  assert.match(index, /1\. frame 120, 4\.00 s/);
  assert.match(index, /strip-120\.png`: 12 consecutive frames around frame 120 \(4\.00 s\)/);
  assert.match(readFileSync(join(out, "audio.txt"), "utf8"), /LUFS/);
  assert.equal(size("dense-1.png").width, 5 * 180 + 4 * 4, "5 a row: each row is one second");
  assert.equal(size("cut-120.png").width, 8 * 180 + 7 * 4, "16 frames around the cut, 8 a row");
  assert.match(index, /dense-2\.png`: from 5\.00 s, a frame every 0\.2 s/);
  assert.match(index, /motion\.txt`: frozen time: 7\.\d\d s still in all/, "two flat colors: all of it still but the cut");
  assert.match(readFileSync(join(out, "motion.txt"), "utf8"), /over the budget/);
});

test("with auto cuts the cuts are found, for a reference nobody declared cuts for", async () => {
  const out = join(dir, "auto");
  const written = await makePack(film, { cuts: "auto", outDir: out });
  assert.ok(written.includes("cut-120.png"), written.join(" "));
  assert.match(readFileSync(join(out, "index.md"), "utf8"), /1\. frame 120, 4\.00 s/);
});

test("the command writes the folder and says what to hand the critic", () => {
  const out = join(dir, "cli");
  const r = spawnSync(process.execPath, [script, film, "--cuts=120", "--moments=60,200", `--out=${out}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /strip-200\.png/);
  assert.match(r.stdout, /Give the critic this folder and the film itself/);
});
