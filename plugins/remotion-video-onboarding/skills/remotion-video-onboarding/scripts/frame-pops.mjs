#!/usr/bin/env node
/**
 * Finds single-frame pops in a rendered video: frames that change far more
 * than their neighbours. A hard cut, a flood that fills the frame in one
 * frame, an element that blinks in or unmounts on screen: each is a spike in
 * frame-to-frame difference. Motion that belongs to the edit spreads its
 * change over frames. Needs Node 18+ and ffmpeg.
 *
 *   node frame-pops.mjs <video.mp4> [--factor=3] [--floor=1.5] [--grid=15] [--cuts=<file.json|45,210>] [--loop]
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
 * Stalls: one to three frames in which nothing moves, between frames that move (a
 * cursor that stops dead and restarts, a repeated frame at a loop's seam). That is a
 * dip in motion, not a spike, so it is no pop. Motion is counted as pixels that
 * changed by more than 12 levels, so encoder noise is not motion; a still frame is one
 * where almost none did (a repeated frame), with two steadily moving frames on each
 * side, so animation on twos (still, moving, still) is not a stall. With --loop (the
 * loop played twice, as verification.md shows) a stall fails; without it a stall is
 * only noted, since footage at 24 fps in a 30 fps film repeats a frame by design. A
 * hold of four frames or more is a hold, judged by frozen-time.mjs.
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
  console.error("usage: node frame-pops.mjs <video> [--factor=3] [--floor=1.5] [--grid=15] [--cuts=<file.json|45,210>] [--loop]");
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
const LOOP = args.includes("--loop");
/** A pixel moved when it changed by more than this many levels (0-255). */
const MOVED_LEVELS = 12;
/** A step moves when at least this many sampled pixels moved. */
const MOVING = 8;
/** A step is still when at most this many sampled pixels moved (or 1% of the moving step before
 * it), and its faint changes (over FAINT_LEVELS) are at most 10% of the moving steps' around it: a
 * repeated frame decodes to encoder noise only, while elements easing at different speeds, or
 * settling after a cut, still move some. */
const STILL = 2;
const FAINT_LEVELS = 4;
/** The longest run of still steps that counts as a stall; longer is a hold. */
const MAX_STALL = 3;
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

const moved = [];
const faint = [];
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
        let m = 0;
        let f = 0;
        for (let i = 0; i < size; i += STRIDE) {
          const d = Math.abs(frame[i] - prev[i]);
          sum += d;
          if (d > MOVED_LEVELS) m++;
          if (d > FAINT_LEVELS) f++;
          n++;
        }
        out.push(sum / n);
        moved.push(m);
        faint.push(f);
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

/** Runs of one to MAX_STALL still steps with two steadily moving steps on each side. */
const isStill = (k, ref) => moved[k] <= Math.max(STILL, 0.01 * ref);
const isMoving = (k) => k >= 0 && k < moved.length && moved[k] >= MOVING;
const stalls = [];
for (let i = 2; i < moved.length; i++) {
  if (!isMoving(i - 1) || !isMoving(i - 2) || !isStill(i, moved[i - 1])) continue;
  let j = i;
  while (j < moved.length && isStill(j, moved[i - 1])) j++;
  // The motion around it is steady: each of the four moving steps at least a twentieth of the largest
  // (on twos, the steps between drawings flicker a little and break this).
  const around = [i - 2, i - 1, j, j + 1];
  const steady = around.every(isMoving) && Math.min(...around.map((k) => moved[k])) >= 0.05 * Math.max(...around.map((k) => moved[k]));
  // A repeated frame also has almost no faint change (encoder noise only), where a small element
  // moving slowly keeps a good share of the faint change around it.
  const ref = Math.min(faint[i - 1], faint[j] ?? 0);
  const repeated = faint.slice(i, j).every((x) => x <= Math.max(2, 0.1 * ref));
  if (j - i <= MAX_STALL && steady && repeated) stalls.push({ frame: i + 1, t: (i + 1) / fps, frames: j - i });
  i = j;
}

const isDeclared = (frame) => CUTS?.some((c) => Math.abs(c - frame) <= 1) ?? false;

console.log(`${file}: ${values.length + 1} frames at ${fps}fps, median change ${median(values).toFixed(2)}`);
for (const p of pops) {
  const onGrid = p.frame % GRID === 0 ? `on the ${GRID}-frame grid` : `${p.frame % GRID} frames off the grid`;
  const tag = isDeclared(p.frame) ? " [declared cut]" : "";
  console.log(`  pop at frame ${String(p.frame).padStart(4)} (${p.t.toFixed(2)}s): change ${p.d.toFixed(2)} vs ~${p.base.toFixed(2)} around it, ${onGrid}${tag}`);
}
for (const s of stalls) {
  console.log(`  ${LOOP ? "" : "note: "}stall at frame ${String(s.frame).padStart(4)} (${s.t.toFixed(2)}s): ${s.frames} frame${s.frames > 1 ? "s" : ""} with no motion between moving frames`);
}
const undeclared = pops.filter((p) => !isDeclared(p.frame));
if (CUTS) {
  for (const c of CUTS) if (c % GRID !== 0) console.log(`  note: declared cut at frame ${c} is ${c % GRID} frames off the ${GRID}-frame grid`);
  const declaredPops = pops.length - undeclared.length;
  console.log(undeclared.length ? `\n${undeclared.length} undeclared pop(s) (${declaredPops} at declared cuts). Only the cuts the profile allows may pop.` : `\nno undeclared pops (${declaredPops} at declared cuts)`);
} else {
  console.log(pops.length ? `\n${pops.length} pop(s). A hard cut is one; a morph or flood spreads its change across frames.` : "\nno pops");
}
if (LOOP && stalls.length) console.log(`${stalls.length} stall(s): the motion stops dead and restarts. A loop's last frame must lead into its first in position and in speed.`);
process.exit(undeclared.length || (LOOP && stalls.length) ? 1 : 0);
