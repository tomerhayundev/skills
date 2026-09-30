// node --test scripts/contrast-check.test.mjs   (needs ffmpeg on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { luminance, measure, ratio } from "./contrast-check.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "contrast-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "contrast-"));
/** A 400x200 field of `back` with bars of `text` standing in for a line of words. */
function still(name, back, text) {
  const out = join(dir, name);
  const bars = [40, 90, 140, 190, 240, 290].map((x) => `drawbox=x=${x}:y=80:w=24:h=40:color=${text}:t=fill`).join(",");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${back}:s=400x200`, "-frames:v", "1", "-vf", bars, out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test("the ratio is the WCAG one", () => {
  assert.ok(Math.abs(ratio(luminance(255, 255, 255), luminance(0, 0, 0)) - 21) < 0.01);
  assert.ok(Math.abs(ratio(luminance(118, 118, 118), luminance(255, 255, 255)) - 4.54) < 0.05, "the grey that just passes AA on white");
});

test("white on near black passes, pale grey on white fails, with the measured ratio", () => {
  const strong = measure(still("strong.png", "0x101014", "white"), [0, 0, 400, 200]);
  assert.ok(strong.ratio > 15, String(strong.ratio));
  const pale = still("pale.png", "white", "0xb0b0b0");
  assert.ok(measure(pale, [0, 0, 400, 200]).ratio < 3);
  const r = spawnSync(process.execPath, [script, pale, "--rect=0,0,400,200"], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /rect 0,0,400,200: 2\.\d:1\s+<- under 4\.5:1/);
  assert.equal(spawnSync(process.execPath, [script, still("ok.png", "0x101014", "white"), "--rect=0,0,400,200"]).status, 0);
});

test("a rect with no text in it is said so, not passed", () => {
  const r = spawnSync(process.execPath, [script, still("flat.png", "white", "white"), "--rect=0,0,400,200"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no text found/);
});
