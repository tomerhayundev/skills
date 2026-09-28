// node --test scripts/frame-pops.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "frame-pops.mjs");
const dir = mkdtempSync(join(tmpdir(), "pops-"));

/** A clip that hard-cuts from red to blue at `cut` frames, 30 fps, `total` frames long. */
function clip(name, cut, total = 90) {
  const out = join(dir, name);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y",
    "-f", "lavfi", "-i", `color=c=red:s=160x90:r=30:d=${cut / 30}`,
    "-f", "lavfi", "-i", `color=c=blue:s=160x90:r=30:d=${(total - cut) / 30}`,
    "-filter_complex", "[0][1]concat=n=2:v=1", "-pix_fmt", "yuv420p", out]);
  assert.equal(r.status, 0, String(r.stderr));
  return out;
}
const pops = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

test("a hard cut fails without --cuts", () => {
  const r = pops(clip("cut45.mp4", 45));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /pop at frame\s+45/);
});

test("the same cut passes when declared, as a list or a cuts.json", () => {
  const file = clip("cut45b.mp4", 45);
  assert.equal(pops(file, "--cuts=45").status, 0);
  const json = join(dir, "cuts.json");
  writeFileSync(json, JSON.stringify({ cuts: [45] }));
  const r = pops(file, `--cuts=${json}`);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /no undeclared pops \(1 at declared cuts\)/);
});

test("an undeclared cut still fails when another is declared", () => {
  const r = pops(clip("cut50.mp4", 50), "--cuts=45");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /1 undeclared pop/);
});

test("an off-grid declared cut is noted, not failed", () => {
  const r = pops(clip("cut50b.mp4", 50), "--cuts=50");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /declared cut at frame 50 is 5 frames off/);
});

test("a clip with no cut passes either way", () => {
  const out = join(dir, "flat.mp4");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=2", "-pix_fmt", "yuv420p", out]);
  assert.equal(pops(out).status, 0);
  assert.equal(pops(out, "--cuts=15").status, 0);
});
