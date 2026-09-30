// node --test scripts/audio-check.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "audio-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "audio-"));
/** 4 s of picture over a quiet tone (the music), with an optional 0.1 s effect at 2 s, `gain` times full scale. */
function film(name, gain) {
  const out = join(dir, name);
  const effect = gain ? `;[2:a]volume=${gain},adelay=2000[e];[m][e]amix=inputs=2:normalize=0[a]` : ";[m]anull[a]";
  const r = spawnSync("ffmpeg", ["-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=gray:s=160x90:r=30:d=4",
    "-f", "lavfi", "-i", "sine=f=220:d=4",
    "-f", "lavfi", "-i", "sine=f=3000:d=0.1",
    "-filter_complex", `[1:a]volume=0.5[m]${effect}`, "-map", "0:v", "-map", "[a]", "-t", "4", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
}
const check = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });
const bed = film("bed.mp4", 0);

test("against the music alone, a loud effect is found where it is and marked as poking out", () => {
  const r = check(film("loud.mp4", 6), `--music-only=${bed}`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sound effects against .*bed\.mp4 \(the music alone\)/);
  assert.match(r.stdout, /\s(1\.9\d|2\.0\d)s 0\.\d\ds\s+lifts the mix \+\d+\.\d dB; the effect is \+\d+\.\d dB against the music, its peak \+\d+\.\d dB over the music around it\s+<- pokes out/);
  assert.match(r.stdout, /1 of 1 effect\(s\) poke out/);
});

test("an effect that sits under the music is listed and not marked, and no effect means none found", () => {
  const soft = check(film("soft.mp4", 0.35), `--music-only=${bed}`);
  assert.match(soft.stdout, /the effect is -\d\.\d dB against the music/);
  assert.match(soft.stdout, /1 effect\(s\), none louder than the music; now listen/);
  assert.match(check(bed, `--music-only=${bed}`).stdout, /none found: the two files sound the same/);
});
