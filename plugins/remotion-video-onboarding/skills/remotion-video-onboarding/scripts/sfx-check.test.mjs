// node --test scripts/sfx-check.test.mjs   (needs ffmpeg on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "./sfx-check.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "sfx-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "sfx-"));
function tone(name, hz, seconds) {
  const out = join(dir, name);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=f=${hz}:d=${seconds}:r=44100`, out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test("a rumble is boomy, a whistle is hissy, and a short mid sound is a candidate", () => {
  assert.match(measure(tone("boom.wav", 60, 0.4)).problems.join(), /boomy: \d+% of its energy is below 150 Hz/);
  assert.match(measure(tone("hiss.wav", 9000, 0.2)).problems.join(), /hissy: \d+% of its energy is above 6 kHz/);
  const pop = measure(tone("pop.wav", 900, 0.3));
  assert.deepEqual(pop.problems, []);
  assert.ok(pop.low < 0.05 && pop.high < 0.05 && Math.abs(pop.seconds - 0.3) < 0.02);
});

test("an effect longer than the move it sits on is dropped, and the command fails on any drop", () => {
  const long = tone("long.wav", 900, 2);
  assert.match(measure(long).problems.join(), /long: 2\.00 s/);
  const r = spawnSync(process.execPath, [script, tone("ok.wav", 900, 0.3), long], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /1 of 2 dropped/);
  assert.equal(spawnSync(process.execPath, [script, long, "--max-seconds=3"]).status, 0);
});
