#!/usr/bin/env node
/**
 * Fits a music track's beat grid and maps its sections, so a video can cut on
 * the beat and land its payoff on a lift. Needs only Node 18+ and ffmpeg.
 *
 *   node fit-beat-grid.mjs <track.mp3> [--bpm=120] [--section=32] [--fps=30] [--json]
 *
 * Prints: tempo, seconds per beat, the time of beat 0 (the first beat in the
 * file), whether the tempo fits a video frame grid, and integrated loudness
 * per section with "lift" marked where a quiet section turns loud.
 *
 * How: decode to mono 12 kHz, build an onset-strength envelope at 100 Hz
 * (positive change in log energy), find the tempo by autocorrelation, then
 * refine period and phase together by maximising the onset strength summed on
 * every predicted beat across the whole track. A whole-track fit is what makes
 * the grid drift-free: a period that is 1 ms off moves the beat a frame per
 * 30 s.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
if (!file) {
  console.error("usage: node fit-beat-grid.mjs <track> [--bpm=120] [--section=32] [--fps=30] [--json]");
  process.exit(2);
}
const SECTION_BEATS = opt("section", 32);
const FPS = opt("fps", 30);
const HINT_BPM = opt("bpm", 0);
const asJson = args.includes("--json");

const RATE = 12000;
const HOP = 120; // 100 envelope frames per second
const ENV_RATE = RATE / HOP;

function decode(path, filter) {
  const af = filter ? ["-af", filter] : [];
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, ...af, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], {
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2);
}

/**
 * Tempo reads three bands, because one broadband envelope lets the loudest
 * instrument decide how the groove repeats (a dotted rhythm can then fake a
 * 4/3 tempo). The phase reads broadband: the kick is the loudest hit and sits
 * on the beat, whereas any single band may be ruled by off-beat hats or an
 * off-beat bass line (house music), which locks the grid half a beat late.
 */
const BANDS = { low: "lowpass=f=150", mid: "bandpass=f=900:width_type=o:w=2", high: "highpass=f=3000" };

/** Onset strength of one band: its rise in log energy per 10 ms hop. */
function bandOnset(path, filter) {
  const pcm = decode(path, filter);
  const n = Math.floor(pcm.length / HOP);
  const onset = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) e += pcm[j] * pcm[j];
    const logE = Math.log10(1e-9 + e / HOP);
    if (i > 0) onset[i] = Math.max(0, logE - prev);
    prev = logE;
  }
  return onset;
}

function sumEnvelopes(...envs) {
  const n = Math.min(...envs.map((e) => e.length));
  const out = new Float64Array(n);
  for (const e of envs) for (let i = 0; i < n; i++) out[i] += e[i];
  return detrend(out);
}

function detrend(onset) {
  const n = onset.length;
  // Remove the slow trend so loud sections don't outvote quiet ones.
  const w = 50;
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += onset[i];
    if (i >= w) sum -= onset[i - w];
    out[i] = Math.max(0, onset[i] - sum / Math.min(i + 1, w));
  }
  return out;
}

/** Linear interpolation into the envelope at a fractional frame. */
const at = (env, x) => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  return env[i] + (env[i + 1] - env[i]) * (x - i);
};

/**
 * Tempo by autocorrelation of the onset envelope, weighted toward 120 BPM
 * with a one-octave log-normal prior (the same shape librosa uses). The prior
 * is what picks the beat a listener taps over its half, double, or 4/3 time.
 */
function coarseTempo(env) {
  let best = { bpm: 0, score: -Infinity };
  for (let bpm = 60; bpm <= 180; bpm += 0.25) {
    const lag = (60 / bpm) * ENV_RATE;
    let s = 0;
    for (let i = 0; i + lag + 1 < env.length; i += 1) s += env[i] * at(env, i + lag);
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    if (s * prior > best.score) best = { bpm, score: s * prior };
  }
  return best.bpm;
}

function refine(env, bpm) {
  let best = { period: 60 / bpm, phase: 0, score: -Infinity };
  const base = (60 / bpm) * ENV_RATE;
  for (let p = base * 0.98; p <= base * 1.02; p += 0.002) {
    for (let ph = 0; ph < p; ph += 0.1) {
      let s = 0;
      for (let x = ph; x < env.length - 1; x += p) s += at(env, x);
      if (s > best.score) best = { period: p, phase: ph, score: s };
    }
  }
  // Second pass, finer, around the winner.
  const { period: p0, phase: ph0 } = best;
  for (let p = p0 - 0.004; p <= p0 + 0.004; p += 0.0002) {
    for (let ph = ph0 - 0.3; ph <= ph0 + 0.3; ph += 0.01) {
      let s = 0;
      for (let x = ph; x < env.length - 1; x += p) s += at(env, x);
      if (s > best.score) best = { period: p, phase: ph, score: s };
    }
  }
  const secondsPerBeat = best.period / ENV_RATE;
  // Wrap the phase into [0, one beat). A phase a hair under a full beat is
  // really beat 0 at the very start of the file, not a beat later.
  let firstBeatSeconds = (((best.phase / ENV_RATE) % secondsPerBeat) + secondsPerBeat) % secondsPerBeat;
  if (secondsPerBeat - firstBeatSeconds < 0.005) firstBeatSeconds = 0;
  return { secondsPerBeat, firstBeatSeconds };
}

function sectionLoudness(path, start, seconds) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(start), "-t", String(seconds), "-i", path, "-af", "ebur128", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const m = [...r.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop();
  return m ? Number(m[1]) : null;
}

/** Mean onset strength on a grid's beats: how often the grid hits a hit. */
function hitRate(env, secondsPerBeat, firstBeatSeconds) {
  let s = 0;
  let n = 0;
  for (let x = firstBeatSeconds * ENV_RATE; x < env.length - 1; x += secondsPerBeat * ENV_RATE) {
    s += at(env, x);
    n++;
  }
  return n ? s / n : 0;
}

const low = bandOnset(file, BANDS.low);
const mid = bandOnset(file, BANDS.mid);
const high = bandOnset(file, BANDS.high);
const tempoEnv = sumEnvelopes(low, mid, high);
const beatEnv = sumEnvelopes(bandOnset(file, null));
const duration = tempoEnv.length / ENV_RATE;

// Autocorrelation settles half/double time (via the prior) but can land on a
// 3:4 or 2:3 relative of the real beat (a dotted groove). Among those, the
// real beat is the grid whose beats most often land on the loudest hits.
let fit = null;
const coarse = HINT_BPM || coarseTempo(tempoEnv);
for (const ratio of HINT_BPM ? [1] : [1, 3 / 4, 4 / 3, 2 / 3, 3 / 2]) {
  const bpm = coarse * ratio;
  if (bpm < 60 || bpm > 180) continue;
  const f = refine(beatEnv, bpm);
  const score = hitRate(beatEnv, f.secondsPerBeat, f.firstBeatSeconds) * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
  if (process.env.DEBUG) console.error(`  candidate ${(60 / f.secondsPerBeat).toFixed(2)} score ${score.toFixed(4)}`);
  if (!fit || score > fit.score) fit = { ...f, score };
}
const { secondsPerBeat, firstBeatSeconds } = fit;
const bpm = 60 / secondsPerBeat;
const framesPerBeat = secondsPerBeat * FPS;

const sections = [];
const sectionSeconds = SECTION_BEATS * secondsPerBeat;
for (let beat = 0; firstBeatSeconds + (beat + SECTION_BEATS) * secondsPerBeat <= duration + 0.5; beat += SECTION_BEATS) {
  const start = firstBeatSeconds + beat * secondsPerBeat;
  const lufs = sectionLoudness(file, start, sectionSeconds);
  const prev = sections.at(-1);
  sections.push({ beat, start: Number(start.toFixed(3)), lufs, lift: prev && lufs !== null && prev.lufs !== null ? lufs - prev.lufs >= 1 : false });
}

const result = {
  file,
  durationSeconds: Number(duration.toFixed(2)),
  bpm: Number(bpm.toFixed(3)),
  secondsPerBeat: Number(secondsPerBeat.toFixed(6)),
  firstBeatSeconds: Number(firstBeatSeconds.toFixed(4)),
  framesPerBeat: Number(framesPerBeat.toFixed(3)),
  liftBeats: sections.filter((s) => s.lift).map((s) => s.beat),
  sections,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${file}  (${result.durationSeconds}s)`);
  console.log(`tempo ${result.bpm} BPM, ${result.secondsPerBeat}s per beat, beat 0 at ${result.firstBeatSeconds}s`);
  const whole = Math.abs(framesPerBeat - Math.round(framesPerBeat)) < 0.01;
  console.log(`${result.framesPerBeat} frames per beat at ${FPS}fps: ${whole ? "fits a whole-frame grid" : "does NOT fit a whole-frame grid, beats will drift against cuts"}`);
  console.log(`\nsections of ${SECTION_BEATS} beats (integrated loudness):`);
  for (const s of sections) console.log(`  beat ${String(s.beat).padStart(4)}  ${s.start.toFixed(2).padStart(7)}s  ${s.lufs ?? "?"} LUFS${s.lift ? "  <- lift" : ""}`);
  console.log(`\nliftBeats: [${result.liftBeats.join(", ")}]`);
}
