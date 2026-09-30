#!/usr/bin/env node
/**
 * Screens sound effects before they go near a film. The effects that made
 * finished films sound amateur were measurably wrong before anyone mixed them:
 * whooshes that were mostly rumble (a repeated boom), ticks that were mostly
 * hiss, and effects too long for the move they sat on. Needs Node 18+ and ffmpeg.
 *
 *   node sfx-check.mjs <effect.wav> [more files...] [--max-seconds=1] [--max-low=0.5] [--max-high=0.4]
 *
 * Per file: its length, the share of its energy below 150 Hz (boom) and above
 * 6 kHz (hiss or click), and its peak. Exit 1 when any file is boomy (more than
 * half its energy below 150 Hz), hissy (more than 40% above 6 kHz) or longer
 * than --max-seconds. A file that passes is only a candidate: a person still
 * listens to it against the music (references/music-bed.md, Sound effects).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RATE = 44100;

function pcm(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`cannot read ${file}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
}

/** A second-order Butterworth section (RBJ cookbook), run twice for a fourth-order slope. */
function filtered(x, kind, hz) {
  const w = (2 * Math.PI * hz) / RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const b = kind === "low" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha;
  const pass = (input) => {
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const y = (b[0] * input[i] + b[1] * x1 + b[2] * x2 + 2 * cos * y1 - (1 - alpha) * y2) / a0;
      x2 = x1;
      x1 = input[i];
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    return out;
  };
  return pass(pass(x));
}

const energy = (x) => {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return e;
};

/** Length, boom and hiss shares and peak of one effect, and what is wrong with it. */
export function measure(file, { maxSeconds = 1, maxLow = 0.5, maxHigh = 0.4 } = {}) {
  const x = pcm(file);
  const total = energy(x) || 1e-12;
  const low = energy(filtered(x, "low", 150)) / total;
  const high = energy(filtered(x, "high", 6000)) / total;
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const seconds = x.length / RATE;
  const problems = [];
  if (low > maxLow) problems.push(`boomy: ${Math.round(low * 100)}% of its energy is below 150 Hz; repeated, it reads as one boom after another`);
  if (high > maxHigh) problems.push(`hissy: ${Math.round(high * 100)}% of its energy is above 6 kHz; it will poke out of any mix`);
  if (seconds > maxSeconds) problems.push(`long: ${seconds.toFixed(2)} s; an effect sits on one move`);
  return { seconds, low, high, peakDb: 20 * Math.log10(peak || 1e-6), problems };
}

function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
  if (!files.length) {
    console.error("usage: node sfx-check.mjs <effect.wav> [more files...] [--max-seconds=1] [--max-low=0.5] [--max-high=0.4]");
    process.exit(2);
  }
  let bad = 0;
  for (const f of files) {
    const m = measure(f, { maxSeconds: opt("max-seconds", 1), maxLow: opt("max-low", 0.5), maxHigh: opt("max-high", 0.4) });
    console.log(`${f}: ${m.seconds.toFixed(2)} s, ${Math.round(m.low * 100)}% below 150 Hz, ${Math.round(m.high * 100)}% above 6 kHz, peak ${m.peakDb.toFixed(1)} dBFS`);
    for (const p of m.problems) console.log(`  drop   ${p}`);
    if (m.problems.length) bad++;
  }
  console.log(bad ? `\n${bad} of ${files.length} dropped. The rest are candidates: listen to each against the music.` : `\n${files.length} candidate(s): listen to each against the music.`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
