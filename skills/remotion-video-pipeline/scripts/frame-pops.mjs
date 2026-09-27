#!/usr/bin/env node
/**
 * Finds single-frame pops in a rendered video: frames that change far more
 * than their neighbours. A hard cut, a flood that fills the frame in one
 * frame, an element that blinks in or unmounts on screen: each is a spike in
 * frame-to-frame difference. Motion that belongs to the edit spreads its
 * change over frames. Needs Node 18+ and ffmpeg.
 *
 *   node frame-pops.mjs <video.mp4> [--factor=3] [--floor=1.5] [--grid=15]
 *
 * Prints every spike (frame, time, difference, its neighbours' median, and
 * whether it sits on the beat grid) and exits 1 if there are any, so it can
 * gate a render.
 *
 * ffmpeg only decodes; the difference is computed here, byte by byte. ffmpeg's
 * own difference filters (tblend, blend) reported large, uniform changes
 * between frames that were byte-identical on full-range (yuvj) renders, which
 * faked pops. Still look at every flagged frame before fixing anything.
 */
import { spawn, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
if (!file) {
  console.error("usage: node frame-pops.mjs <video> [--factor=3] [--floor=1.5] [--grid=15]");
  process.exit(2);
}
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

console.log(`${file}: ${values.length + 1} frames at ${fps}fps, median change ${median(values).toFixed(2)}`);
for (const p of pops) {
  const onGrid = p.frame % GRID === 0 ? `on the ${GRID}-frame grid` : `${p.frame % GRID} frames off the grid`;
  console.log(`  pop at frame ${String(p.frame).padStart(4)} (${p.t.toFixed(2)}s): change ${p.d.toFixed(2)} vs ~${p.base.toFixed(2)} around it, ${onGrid}`);
}
console.log(pops.length ? `\n${pops.length} pop(s). A hard cut is one; a morph or flood spreads its change across frames.` : "\nno pops");
process.exit(pops.length ? 1 : 0);
