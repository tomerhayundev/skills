#!/usr/bin/env node
/**
 * Checks a rendered video's audio the way you'd check its picture: measured,
 * not assumed. Needs Node 18+ and ffmpeg/ffprobe.
 *
 *   node audio-check.mjs <video.mp4> [--reference=<approved.mp4>] [--window=0.5]
 *
 * Prints frame count, integrated loudness, true peak, a flag for a silent
 * track (Remotion always writes an audio stream, so "has audio" proves
 * nothing), a loudness timeline to see where a lift lands, and with
 * --reference the time offset and correlation against an approved mix.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
if (!file) {
  console.error("usage: node audio-check.mjs <video.mp4> [--reference=<approved.mp4>] [--window=0.5]");
  process.exit(2);
}
const WINDOW = Number(opt("window") ?? 0.5);
const reference = opt("reference");

const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28 });

function probe(path) {
  const r = run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,r_frame_rate:format=duration", "-of", "json", path]);
  const j = JSON.parse(r.stdout);
  const [num, den] = j.streams[0].r_frame_rate.split("/").map(Number);
  return { frames: Number(j.streams[0].nb_read_frames), fps: num / den, duration: Number(j.format.duration) };
}

function loudness(path) {
  const r = run("ffmpeg", ["-hide_banner", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const tail = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => Number(tail.match(re)?.[1]);
  return { integrated: num(/I:\s+(-?[\d.]+) LUFS/), range: num(/LRA:\s+(-?[\d.]+) LU/), peak: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

function pcm(path, rate) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2);
}

function timeline(samples, rate) {
  const n = Math.round(WINDOW * rate);
  const out = [];
  for (let i = 0; i + n <= samples.length; i += n) {
    let e = 0;
    for (let j = i; j < i + n; j++) e += samples[j] * samples[j];
    out.push(10 * Math.log10(1e-12 + e / n / 32768 ** 2));
  }
  return out;
}

/** Best lag (ms) of `a` against `b` over a 4s stretch, and its correlation. */
function align(a, b, rate) {
  const start = Math.min(3 * rate, Math.floor(a.length / 3));
  const len = Math.min(4 * rate, a.length - start - rate);
  const maxLag = Math.round(0.1 * rate);
  let best = { lag: 0, r: -Infinity };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let c = 0;
    let na = 0;
    let nb = 0;
    for (let i = start; i < start + len; i++) {
      const x = a[i];
      const y = b[i + lag] ?? 0;
      c += x * y;
      na += x * x;
      nb += y * y;
    }
    const r = c / Math.sqrt(na * nb || 1);
    if (r > best.r) best = { lag, r };
  }
  return { ms: (best.lag / rate) * 1000, r: best.r };
}

const p = probe(file);
const l = loudness(file);
const RATE = 8000;
const samples = pcm(file, RATE);
const silent = !(l.integrated > -70);

console.log(`${file}`);
console.log(`  video   ${p.frames} frames at ${p.fps}fps (${p.duration.toFixed(3)}s container)`);
console.log(`  audio   ${silent ? "SILENT (no audible signal; a render with no audio element still writes a silent track)" : `${l.integrated} LUFS integrated, ${l.range} LU range, peak ${l.peak} dBFS`}`);
if (!silent) {
  const warn = [];
  if (l.integrated > -13) warn.push("louder than -14 LUFS social/YouTube normalisation will turn it down");
  if (l.integrated < -20) warn.push("quiet; most platforms won't turn it up");
  if (l.peak > -1) warn.push("peak above -1 dBFS; lossy re-encodes on ingest may clip");
  for (const w of warn) console.log(`  warn    ${w}`);
  const t = timeline(samples, RATE);
  console.log(`\n  loudness per ${WINDOW}s (dBFS, a jump of 2 dB or more marked ^):`);
  let line = "  ";
  t.forEach((db, i) => {
    const mark = i > 0 && db - t[i - 1] >= 2 ? "^" : " ";
    line += `${(i * WINDOW).toFixed(1).padStart(5)}s ${db.toFixed(0).padStart(3)}${mark}`;
    if ((i + 1) % 8 === 0) {
      console.log(line);
      line = "  ";
    }
  });
  if (line.trim()) console.log(line);
}

if (reference) {
  const ref = pcm(reference, RATE);
  const a = align(samples, ref, RATE);
  // this[t] matches ref[t + lag]: a negative lag means this file reaches the
  // same sound later than the reference does.
  const delay = -a.ms;
  console.log(`\n  vs ${reference}: this plays ${delay >= 0 ? `${delay.toFixed(1)} ms later` : `${(-delay).toFixed(1)} ms earlier`}, correlation ${a.r.toFixed(3)}`);
  console.log(`  (under one frame, ${(1000 / p.fps).toFixed(1)} ms, is not perceptible; codec priming alone is ~20-40 ms)`);
}
