#!/usr/bin/env node
/**
 * Measures how much of a video (or a cover image) is covered by the flat accent
 * color: the dose of floods and other full-frame motif graphics. A flood is an
 * exclamation mark; one on every boundary put flat color over a third of a 30 s
 * promo and made the cover a lime square. Needs Node 18+ and ffmpeg.
 *
 *   node motif-coverage.mjs <video-or-image> --accent=#a6d608
 *        [--tolerance=48] [--dominant=0.5] [--full=0.9] [--max-share=0.05] [--allow=<file.json|40-60,780-800>]
 *
 * A frame is "dominated" when at least --dominant of its pixels are within
 * --tolerance (RGB distance) of the accent, and "full" at --full. It fails
 * (exit 1) when dominated frames exceed --max-share of the runtime, or when any
 * full frame falls outside the --allow windows (the declared turn and close, as
 * frame ranges, or a JSON file of [[from, to], ...] or { "windows": [...] }).
 * For a cover, pass --max-share=0: no part of it may be a field of accent.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const raw = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const num = (k, d) => Number(raw(k) ?? d);
const usage = "usage: node motif-coverage.mjs <video-or-image> --accent=#rrggbb [--tolerance=48] [--dominant=0.5] [--full=0.9] [--max-share=0.05] [--allow=<file.json|40-60,780-800>]";
const hex = raw("accent")?.replace(/^#/, "");
if (!file || !/^[0-9a-f]{6}$/i.test(hex ?? "")) {
  console.error(usage);
  process.exit(2);
}
const ACCENT = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const TOL2 = num("tolerance", 48) ** 2;
const DOMINANT = num("dominant", 0.5);
const FULL = num("full", 0.9);
const MAX_SHARE = num("max-share", 0.05);

function windows(value) {
  if (value === undefined) return [];
  const parsed = existsSync(value) ? JSON.parse(readFileSync(value, "utf8")) : value.split(",").filter(Boolean).map((r) => r.split("-").map(Number));
  const list = Array.isArray(parsed) ? parsed : parsed.windows;
  if (!Array.isArray(list) || !list.every((w) => Array.isArray(w) && w.length === 2 && w.every(Number.isInteger))) {
    console.error(`--allow takes frame ranges like 40-60,780-800 or a JSON list of [from, to]; got ${value}`);
    process.exit(2);
  }
  return list;
}
const ALLOW = windows(raw("allow"));

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "json", file], { encoding: "utf8" });
const stream = JSON.parse(probe.stdout || "{}").streams?.[0];
if (!stream) {
  console.error(`cannot read ${file}`);
  process.exit(2);
}
const [n, d] = String(stream.r_frame_rate).split("/").map(Number);
const fps = n / (d || 1) || 1;

// Small frames are plenty for a share of pixels, and fast.
const W = 160;
const H = 90;
const size = W * H * 3;
const shares = await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const out = [];
  let pending = Buffer.alloc(0);
  ff.stdout.on("data", (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      let hits = 0;
      for (let i = 0; i < size; i += 3) {
        const dr = pending[i] - ACCENT[0];
        const dg = pending[i + 1] - ACCENT[1];
        const db = pending[i + 2] - ACCENT[2];
        if (dr * dr + dg * dg + db * db <= TOL2) hits++;
      }
      out.push(hits / (W * H));
      pending = pending.subarray(size);
    }
  });
  ff.on("error", reject);
  ff.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg exited ${code}`))));
});

/** Consecutive frames that pass a test, as [from, to] runs. */
const runs = (test) => {
  const r = [];
  shares.forEach((s, i) => {
    if (!test(s)) return;
    if (r.length && r.at(-1)[1] === i - 1) r.at(-1)[1] = i;
    else r.push([i, i]);
  });
  return r;
};
const allowed = (i) => ALLOW.some(([a, b]) => i >= a && i <= b);
const t = (f) => (f / fps).toFixed(2);

const dominated = shares.filter((s) => s >= DOMINANT).length;
const share = shares.length ? dominated / shares.length : 0;
const fullOutside = runs((s) => s >= FULL).map(([a, b]) => [a, b, !Array.from({ length: b - a + 1 }, (_, k) => a + k).every(allowed)]);

console.log(`${file}: ${shares.length} frame(s), accent #${hex}`);
for (const [a, b] of runs((s) => s >= DOMINANT)) {
  const peak = Math.max(...shares.slice(a, b + 1));
  console.log(`  accent over ${Math.round(DOMINANT * 100)}%+ of the frame: frames ${a}-${b} (${t(a)}-${t(b + 1)} s), peak ${Math.round(peak * 100)}%`);
}
const problems = [];
if (share > MAX_SHARE) problems.push(`flat accent dominates ${(share * 100).toFixed(1)}% of the ${shares.length > 1 ? "runtime" : "image"} (max ${(MAX_SHARE * 100).toFixed(0)}%)`);
for (const [a, b, outside] of fullOutside) if (outside) problems.push(`a full frame of accent at frames ${a}-${b} (${t(a)} s) is not a declared turn or close`);
for (const p of problems) console.log(`  FAIL ${p}`);
console.log(problems.length ? "\nA flood is an exclamation mark: keep it for the turn and the close, and never on the cover." : `\nok: ${(share * 100).toFixed(1)}% of the ${shares.length > 1 ? "runtime" : "image"} dominated by the accent`);
process.exit(problems.length ? 1 : 0);
