#!/usr/bin/env node
/**
 * Measures how much of a rendered video stands still. frame-pops.mjs finds too
 * much change in one frame; this finds too little over many: a hold where only
 * the camera's breath moves, an end card that just sits, a rest after a caption.
 * A film that passed every other check had over a third of its runtime like
 * that, and nobody saw it, because every frame of it looked finished. Needs Node 18+ and
 * ffmpeg/ffprobe.
 *
 *   node frozen-time.mjs <video.mp4> [--max-stretch=0.6] [--per-30=1] [--drift=0.2] [--local=3]
 *
 * A frame is still when, against the frame 0.1 s before it, the whole picture
 * drifts less than --drift and no part of it changes by more than --local (grey
 * levels, mean over a block a sixth of the frame wide). Drift is how far the
 * picture moved, as a percent of the frame's longer side per second, estimated
 * from the difference over the edge strength, so the same push reads the same on
 * a busy photo and on a flat interface. Measured: a push of the whole frame at
 * 1.5% of scale a second reads about 1.0; the same push on a scene under a
 * caption that stays put reads 0.3 to 0.5, because only part of the frame
 * moves; a camera breath of under 1% reads 0.05 to 0.14. The line is 0.2. So a
 * slow push (about 2% of scale a second) is alive, a click or a number ticking
 * is alive, and a breath is not. Stretches under 0.2 s are landings, not holds,
 * and are not counted.
 *
 * Prints every still stretch, the total and a timeline of drift per 0.5 s
 * (`=` still, `>` fast), and exits 1 when a stretch is longer than
 * --max-stretch seconds or the total passes --per-30 seconds per 30 s of film.
 * The defaults are the promo profile's; a format whose profile sets other
 * numbers passes them (references/verification.md, Frozen time).
 *
 * ffmpeg only decodes and scales; the differences are computed here. Its own
 * difference filters reported changes between identical frames on full-range
 * renders (see frame-pops.mjs).
 */
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WIDTH = 320;
const BLOCK = 54; // about a sixth of the scaled width
const MIN_HOLD = 0.2; // seconds: shorter is a landing

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(r.stdout || "{}").streams?.[0];
  if (!s) throw new Error(`cannot read ${file}`);
  const [num, den] = String(s.r_frame_rate).split("/").map(Number);
  return { width: s.width, height: s.height, fps: num / (den || 1) };
}

/**
 * One pass over the film at 320 px wide. Per frame: `change` (mean difference from the
 * frame before, for finding cuts), `drift` (percent of the longer side per second, against the
 * frame 0.1 s earlier) and `local` (the largest block's mean difference over that 0.1 s).
 */
export async function scan(file) {
  const v = probe(file);
  const w = WIDTH;
  const h = Math.max(2, Math.round((v.height * w) / v.width / 2) * 2);
  const size = w * h;
  const step = Math.max(1, Math.round(v.fps / 10));
  const cols = Math.ceil(w / BLOCK);
  const rows = Math.ceil(h / BLOCK);
  const frames = [];
  const ring = [];
  await new Promise((done, fail) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
    let pending = Buffer.alloc(0);
    ff.stdout.on("data", (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= size) {
        const cur = Buffer.from(pending.subarray(0, size));
        pending = pending.subarray(size);
        const prev = ring[ring.length - 1];
        const back = ring.length >= step ? ring[ring.length - step] : null;
        let change = 0;
        if (prev) {
          let sum = 0;
          for (let i = 0; i < size; i++) sum += Math.abs(cur[i] - prev[i]);
          change = sum / size;
        }
        let drift = null;
        let local = null;
        if (back) {
          let sum = 0;
          let grad = 0;
          const block = new Float64Array(cols * rows);
          const count = new Float64Array(cols * rows);
          for (let y = 0; y < h; y++) {
            const by = Math.floor(y / BLOCK) * cols;
            for (let x = 0; x < w; x++) {
              const i = y * w + x;
              const d = Math.abs(cur[i] - back[i]);
              sum += d;
              const b = by + Math.floor(x / BLOCK);
              block[b] += d;
              count[b]++;
              if (x + 1 < w) grad += Math.abs(cur[i + 1] - cur[i]);
              if (y + 1 < h) grad += Math.abs(cur[i + w] - cur[i]);
            }
          }
          // Difference over edge strength is how far the picture moved, in pixels.
          const pixels = sum / size / (grad / (2 * size) + 0.25);
          drift = ((pixels / Math.max(w, h)) * 100) / (step / v.fps);
          local = 0;
          for (let b = 0; b < block.length; b++) if (count[b]) local = Math.max(local, block[b] / count[b]);
        }
        frames.push({ change, drift, local });
        ring.push(cur);
        if (ring.length > step) ring.shift();
      }
    });
    ff.on("error", fail);
    ff.on("close", (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`))));
  });
  // The first frames have nothing 0.1 s behind them: they take the first measured frame's values.
  const first = frames.find((f) => f.drift !== null);
  for (const f of frames) if (f.drift === null) Object.assign(f, { drift: first?.drift ?? 0, local: first?.local ?? 0 });
  return { ...v, step, frames };
}

/** Runs of still frames at least 0.2 s long, as { from, to, seconds } with `to` exclusive. */
export function stillStretches(scanned, { drift = 0.2, local = 3 } = {}) {
  const { frames, fps } = scanned;
  const out = [];
  let from = null;
  const close = (to) => {
    if (from !== null && (to - from) / fps >= MIN_HOLD) out.push({ from, to, seconds: (to - from) / fps });
    from = null;
  };
  frames.forEach((f, i) => {
    const still = f.drift < drift && f.local < local;
    if (still && from === null) from = i;
    if (!still) close(i);
  });
  close(frames.length);
  return out;
}

/** Hard cuts: frames that change far more than the frames around them (the frame-pops rule, at 320 px). */
export function findCuts(scanned, { factor = 3, floor = 5 } = {}) {
  const values = scanned.frames.map((f) => f.change);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const cuts = [];
  for (let i = 1; i < values.length; i++) {
    const around = [...values.slice(Math.max(1, i - 3), i), ...values.slice(i + 1, i + 4)];
    if (values[i] >= floor && values[i] > factor * Math.max(median(around), floor / factor)) cuts.push(i);
  }
  return cuts;
}

/** The whole report as lines, and whether the film passes. */
export function report(file, scanned, { maxStretch = 0.6, per30 = 1, drift = 0.2, local = 3 } = {}) {
  const { frames, fps } = scanned;
  const seconds = frames.length / fps;
  const stretches = stillStretches(scanned, { drift, local });
  const total = stretches.reduce((s, x) => s + x.seconds, 0);
  const budget = (per30 * seconds) / 30;
  const longest = stretches.reduce((m, x) => Math.max(m, x.seconds), 0);
  const lines = [`${file}: ${frames.length} frames at ${fps} fps (${seconds.toFixed(2)} s)`];
  for (const s of stretches) {
    lines.push(`  still ${(s.from / fps).toFixed(2).padStart(6)}-${(s.to / fps).toFixed(2)} s (${s.seconds.toFixed(2)} s)${s.seconds > maxStretch ? `   <- over ${maxStretch} s` : ""}`);
  }
  const per = Math.max(1, Math.round(fps / 2));
  const isStill = new Uint8Array(frames.length);
  for (const s of stretches) isStill.fill(1, s.from, s.to);
  lines.push("", "  drift per 0.5 s (% of the longer side per second; = still, > fast):");
  let line = "  ";
  for (let i = 0, n = 0; i < frames.length; i += per, n++) {
    const win = frames.slice(i, i + per).map((f) => f.drift).sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    const stillShare = isStill.subarray(i, i + per).reduce((a, b) => a + b, 0) / win.length;
    const mark = stillShare >= 0.5 ? "=" : med >= 8 ? ">" : " ";
    line += `${(i / fps).toFixed(1).padStart(5)}s ${med.toFixed(1).padStart(5)}${mark}`;
    if ((n + 1) % 6 === 0) {
      lines.push(line);
      line = "  ";
    }
  }
  if (line.trim()) lines.push(line);
  const ok = total <= budget + 1e-9 && longest <= maxStretch + 1e-9;
  lines.push(
    "",
    `still in total: ${total.toFixed(2)} s of ${seconds.toFixed(2)} s (${((100 * total) / seconds).toFixed(0)}%; the budget is ${budget.toFixed(2)} s, ${per30} s per 30 s); longest ${longest.toFixed(2)} s (limit ${maxStretch} s)`,
    ok ? "within the budget" : "over the budget: cut each hold to what its words need, let something happen in it, and give what remains a slow push (about 2% of scale a second)",
  );
  return { lines, ok, total, longest, stretches };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
  if (!file) {
    console.error("usage: node frozen-time.mjs <video.mp4> [--max-stretch=0.6] [--per-30=1] [--drift=0.2] [--local=3]");
    process.exit(2);
  }
  const scanned = await scan(file);
  const r = report(file, scanned, { maxStretch: opt("max-stretch", 0.6), per30: opt("per-30", 1), drift: opt("drift", 0.2), local: opt("local", 3) });
  console.log(r.lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
