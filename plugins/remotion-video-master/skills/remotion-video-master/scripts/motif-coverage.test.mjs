// node --test scripts/motif-coverage.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "motif-coverage.mjs");
const dir = mkdtempSync(join(tmpdir(), "coverage-"));
const LIME = "0xA6D608";

/** 30 fps: gray footage with a full lime segment of `lime` frames starting at `at`. */
function clip(name, total, at, lime) {
  const out = join(dir, name);
  const parts = [["gray", at], ["lime", lime], ["gray", total - at - lime]].filter(([, f]) => f > 0);
  const inputs = parts.flatMap(([c, f]) => ["-f", "lavfi", "-i", `color=c=${c === "lime" ? LIME : "0x7a7468"}:s=320x180:r=30:d=${f / 30}`]);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${parts.map((_, i) => `[${i}]`).join("")}concat=n=${parts.length}:v=1`, "-pix_fmt", "yuv420p", out]);
  assert.equal(r.status, 0, String(r.stderr));
  return out;
}
const run = (...a) => spawnSync(process.execPath, [script, ...a, "--accent=#a6d608"], { encoding: "utf8" });

test("a flood on every boundary fails on dose", () => {
  // 30 s with six 12-frame lime covers: 72 of 900 frames, 8%.
  const out = join(dir, "six.mp4");
  const seg = (c, f) => ["-f", "lavfi", "-i", `color=c=${c}:s=320x180:r=30:d=${f / 30}`];
  const inputs = [];
  for (let k = 0; k < 6; k++) inputs.push(...seg("0x7a7468", 138), ...seg(LIME, 12));
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${Array.from({ length: 12 }, (_, i) => `[${i}]`).join("")}concat=n=12:v=1`, "-pix_fmt", "yuv420p", out]);
  assert.equal(r.status, 0, String(r.stderr));
  const res = run(out);
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stdout, /dominates 8\.0% of the runtime/);
});

test("one declared turn passes; the same frames undeclared fail", () => {
  const file = clip("turn.mp4", 450, 200, 12); // 15 s, one 12-frame flood: 2.7%
  const declared = run(file, "--allow=195-215");
  assert.equal(declared.status, 0, declared.stdout);
  const undeclared = run(file);
  assert.equal(undeclared.status, 1, undeclared.stdout);
  assert.match(undeclared.stdout, /full frame of accent at frames 200-211 .* is not a declared turn/);
});

test("footage with no accent passes", () => {
  assert.equal(run(clip("clean.mp4", 90, 0, 0)).status, 0);
});

test("a cover that is a field of accent fails with --max-share=0", () => {
  const png = join(dir, "cover.png");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${LIME}:s=320x180`, "-frames:v", "1", png]);
  const res = run(png, "--max-share=0");
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stdout, /of the image/);
  const ok = join(dir, "cover-ok.png");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x7a7468:s=320x180", "-frames:v", "1", ok]);
  assert.equal(run(ok, "--max-share=0").status, 0);
});
