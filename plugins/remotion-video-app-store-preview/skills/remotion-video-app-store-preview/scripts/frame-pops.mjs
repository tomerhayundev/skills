#!/usr/bin/env node
/**
 * Finds single-frame pops in a rendered video: frames that change far more
 * than their neighbours. A hard cut, a flood that fills the frame in one
 * frame, an element that blinks in or unmounts on screen: each is a spike in
 * frame-to-frame difference. Motion that belongs to the edit spreads its
 * change over frames. Needs Node 18+ and ffmpeg.
 *
 *   node frame-pops.mjs <video.mp4> [--factor=3] [--floor=1.5] [--grid=15] [--cuts=<file.json|45,210>]
 *
 * Prints every spike (frame, time, difference, its neighbours' median, and
 * whether it sits on the beat grid) and exits 1 if there are any, so it can
 * gate a render.
 *
 * --cuts: for formats whose profile allows hard cuts (a tutorial cutting inside
 * a screen recording). A pop within one frame of a declared cut passes; any
 * other pop still fails. Pass the chain layout's out/<id>.cuts.json (an array of
 * frames, or { "cuts": [...] }) so what was declared is what rendered.
 *
 * ffmpeg only decodes; the difference is computed here, byte by byte. ffmpeg's
 * own difference filters (tblend, blend) reported large, uniform changes
 * between frames that were byte-identical on full-range (yuvj) renders, which
 * faked pops. Still look at every flagged frame before fixing anything.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const raw = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const opt = (k, d) => Number(raw(k) ?? d);
if (!file) {
  console.error("usage: node frame-pops.mjs <video> [--factor=3] [--floor=1.5] [--grid=15] [--cuts=<file.json|45,210>]");
  process.exit(2);
}

/** Declared cut frames from --cuts: a JSON file (array or { cuts }) or a comma list. */
function declaredCuts(value) {
  if (value === undefined) return null;
  const text = existsSync(value) ? readFileSync(value, "utf8") : value;
  const parsed = existsSync(value) ? JSON.parse(text) : text.split(",").filter(Boolean).map(Number);
  const list = Array.isArray(parsed) ? parsed : parsed.cuts;
  const frames = (list ?? []).map((c) => (typeof c === "object" ? c.frame : c));
  if (!frames.every(Number.isInteger)) {
    console.error(`--cuts must list whole frame numbers, got ${JSON.stringify(list)}`);
    process.exit(2);
  }
  return frames;
}
const CUTS = declaredCuts(raw("cuts"));
const FACTOR = opt("factor", 3);
const FLOOR = opt("floor", 1.5);
const GRID = opt("grid", 15);
const WINDOW = 3;
/** Compare every STRIDE-th pixel: plenty for a whole-frame mean, and fast. */
const STRIDE = 3;

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
const stream = JSON.parse(probe.stdout || "{}").streams?.[0];
if (!stream) {
  console.error(`cannot read ${file}`);
  process.exit(2);
}
const { width, height } = stream;
const [num, den] = String(stream.r_frame_rate).split("/").map(Number);
const fps = num / (den || 1);
const size = width * height;

const values = await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-an", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const out = [];
  let prev = null;
  let pending = Buffer.alloc(0);
  ff.stdout.on("data", (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      const frame = pending.subarray(0, size);
      if (prev) {
        let sum = 0;
        let n = 0;
        for (let i = 0; i < size; i += STRIDE) {
          sum += Math.abs(frame[i] - prev[i]);
          n++;
        }
        out.push(sum / n);
      }
      prev = Buffer.from(frame);
      pending = pending.subarray(size);
    }
  });
  ff.on("error", reject);
  ff.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg exited ${code}`))));
});

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const pops = [];
values.forEach((d, i) => {
  // Value i compares frames i and i + 1: the change INTO frame i + 1.
  const frame = i + 1;
  const around = [...values.slice(Math.max(0, i - WINDOW), i), ...values.slice(i + 1, i + 1 + WINDOW)];
  const base = median(around);
  if (d >= FLOOR && d > FACTOR * Math.max(base, FLOOR / FACTOR)) pops.push({ frame, t: frame / fps, d, base });
});

const isDeclared = (frame) => CUTS?.some((c) => Math.abs(c - frame) <= 1) ?? false;

console.log(`${file}: ${values.length + 1} frames at ${fps}fps, median change ${median(values).toFixed(2)}`);
for (const p of pops) {
  const onGrid = p.frame % GRID === 0 ? `on the ${GRID}-frame grid` : `${p.frame % GRID} frames off the grid`;
  const tag = isDeclared(p.frame) ? " [declared cut]" : "";
  console.log(`  pop at frame ${String(p.frame).padStart(4)} (${p.t.toFixed(2)}s): change ${p.d.toFixed(2)} vs ~${p.base.toFixed(2)} around it, ${onGrid}${tag}`);
}
const undeclared = pops.filter((p) => !isDeclared(p.frame));
if (CUTS) {
  for (const c of CUTS) if (c % GRID !== 0) console.log(`  note: declared cut at frame ${c} is ${c % GRID} frames off the ${GRID}-frame grid`);
  const declaredPops = pops.length - undeclared.length;
  console.log(undeclared.length ? `\n${undeclared.length} undeclared pop(s) (${declaredPops} at declared cuts). Only the cuts the profile allows may pop.` : `\nno undeclared pops (${declaredPops} at declared cuts)`);
} else {
  console.log(pops.length ? `\n${pops.length} pop(s). A hard cut is one; a morph or flood spreads its change across frames.` : "\nno pops");
}
process.exit(undeclared.length ? 1 : 0);
