#!/usr/bin/env node
/**
 * Finds single-frame pops in a rendered video: frames that change far more
 * than their neighbours. A hard cut, a flood that fills the frame in one
 * frame, an element that blinks in: each is a spike in frame-to-frame
 * difference. Motion that belongs to the edit spreads its change over frames.
 * Needs Node 18+ and ffmpeg.
 *
 *   node frame-pops.mjs <video.mp4> [--factor=3] [--floor=1.5] [--grid=15]
 *
 * Prints every spike (frame, time, difference, its neighbours' median, and
 * whether it sits on the beat grid) and exits 1 if there are any, so it can
 * gate a render.
 */
import { spawnSync } from "node:child_process";

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

// Mean luma of |frame n - frame n-1|, from two independent decodes of the file
// offset by one frame. Not tblend: its internal previous-frame buffer
// occasionally compared against the wrong frame and faked large pops between
// identical frames. Every flagged pop still deserves a look: fine film grain
// that re-renders can register while being invisible.
const r = spawnSync(
  "ffmpeg",
  [
    "-hide_banner", "-i", file, "-i", file, "-an", "-filter_complex",
    "[0:v]format=gray[a];[1:v]format=gray,trim=start_frame=1,setpts=PTS-STARTPTS[b];[a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f", "null", "-",
  ],
  { encoding: "utf8", maxBuffer: 1 << 28 },
);
if (r.status !== 0) {
  console.error(r.stderr.split("\n").slice(-5).join("\n"));
  process.exit(2);
}
const values = [...r.stdout.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
// ffprobe prints e.g. "30/1," (the trailing comma is real); take the fraction.
const rate = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.match(/(\d+)\/(\d+)/);
const fps = rate ? Number(rate[1]) / Number(rate[2]) : 30;

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
