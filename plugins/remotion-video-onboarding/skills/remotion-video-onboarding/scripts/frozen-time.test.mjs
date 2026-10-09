// node --test scripts/frozen-time.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findCuts, scan, stillStretches } from "./frozen-time.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "frozen-time.mjs");
const dir = mkdtempSync(join(tmpdir(), "frozen-"));
const ff = (...a) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};
const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

const picture = join(dir, "picture.png");
ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=1", "-frames:v", "1", picture);

/** A held picture pushed in by `percent` of scale over `seconds`, smooth to a quarter pixel. */
function push(name, percent, seconds) {
  const out = join(dir, name);
  const grow = `(1+${percent}/100*t/${seconds})`;
  ff("-loop", "1", "-framerate", "30", "-i", picture, "-vf", `scale=w='2*trunc(2560*${grow}/2)':h='2*trunc(1440*${grow}/2)':eval=frame:flags=bicubic,crop=2560:1440,scale=640:360:flags=area`, "-t", String(seconds), "-pix_fmt", "yuv420p", out);
  return out;
}

test("a picture that only sits is still for its whole length, and fails", () => {
  const out = join(dir, "sits.mp4");
  ff("-loop", "1", "-framerate", "30", "-i", picture, "-t", "2", "-pix_fmt", "yuv420p", out);
  const r = run(out);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /still\s+0\.00-2\.00 s \(2\.00 s\)\s+<- over 0\.6 s/);
  assert.match(r.stdout, /still in total: 2\.00 s of 2\.00 s \(100%/);
});

test("a slow push across the hold is alive; a breath is not", async () => {
  assert.equal(run(push("push3.mp4", 3, 2)).status, 0, "3% over 2 s");
  const breath = await scan(push("breath.mp4", 0.2, 2));
  const still = stillStretches(breath).reduce((sum, s) => sum + s.seconds, 0);
  assert.ok(still > 1.5, `0.2% over 2 s is a breath: ${still.toFixed(2)} s of 2 s still`);
});

test("motion, then a hold: the hold is found with its times, and a profile can allow it", () => {
  const out = join(dir, "hold.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=1", "-vf", "tpad=stop_mode=clone:stop_duration=1.2", "-pix_fmt", "yuv420p", out);
  const r = run(out);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /still\s+1\.\d\d-2\.20 s \(1\.\d\d s\)/);
  assert.equal(run(out, "--max-stretch=2", "--per-30=30").status, 0, "a format whose profile lets the picture hold");
});

test("a change in one part of the picture counts as alive", () => {
  const out = join(dir, "local.mp4");
  // A still grey frame with a small box that blinks: the whole picture barely drifts, one block changes.
  ff("-f", "lavfi", "-i", "color=c=0x808080:s=640x360:r=30:d=2", "-vf", "drawbox=x=40:y=40:w=80:h=80:color=white:t=fill:enable='lt(mod(n,6),3)'", "-pix_fmt", "yuv420p", out);
  assert.equal(run(out).status, 0);
});

test("hard cuts are found at their frames", async () => {
  const out = join(dir, "cut.mp4");
  ff("-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1.5", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1.5", "-filter_complex", "[0][1]concat=n=2:v=1", "-pix_fmt", "yuv420p", out);
  assert.deepEqual(findCuts(await scan(out)), [45]);
});

/** A scan made of frame changes only, as findCuts reads it. */
const changes = (values) => ({ frames: values.map((change) => ({ change })) });
/** A drawing every `step` frames that moves by `size`, for `n` frames. */
const stepped = (step, size, n = 90) => Array.from({ length: n }, (_, i) => (i > 0 && i % step === 0 ? size : 0));

test("animation on twos or threes is not a run of cuts; a real cut inside it still is", () => {
  assert.deepEqual(findCuts(changes(stepped(2, 12))), [], "a new drawing every second frame");
  assert.deepEqual(findCuts(changes(stepped(3, 12))), [], "a new drawing every third frame");
  const cut = stepped(2, 12);
  cut[45] = 70;
  assert.deepEqual(findCuts(changes(cut)), [45]);
  const still = Array(60).fill(0);
  still[30] = 40;
  assert.deepEqual(findCuts(changes(still)), [30], "a cut between still shots");
});
