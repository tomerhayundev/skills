#!/usr/bin/env node
/**
 * What the film critic looks at, made the same way every round. A frame a second
 * cannot show a cut, a move, a 1.5 s shot or the music, so critics scored motion,
 * transitions and sound by guessing. This writes, into one folder:
 *
 *   hook.png        the first three seconds, 12 frames: what a viewer sees before deciding to stay
 *   contact.png     a frame a second, the whole film: the overview
 *   phone.png       15 frames across the film at 360 px wide: what reads at phone size
 *   dense-<n>.png   a frame every 0.2 s, 5 s a sheet, each row one second: where a short shot or a hold shows
 *   cuts.png        every cut as a pair: its last frame before, its first after
 *   cut-<f>.png     16 frames across the second around each cut: what is carried over it
 *   strip-<f>.png   12 consecutive frames around each moment named (the turn, the close, a fast move)
 *   motion.txt      frozen time from frozen-time.mjs: every still stretch, the total, the drift timeline
 *   audio.txt       the loudness timeline (where the lift lands) from audio-check.mjs
 *   index.md        what each sheet shows, and every cut and moment with its time
 *
 *   node critic-pack.mjs <video.mp4> [--cuts=<out/id.cuts.json|45,90|auto>] [--moments=<frames>] [--out=out/_critic]
 *                        [--max-stretch=0.6] [--per-30=1]
 *
 * --cuts takes what frame-pops.mjs takes (an array of frames, or { cuts: [...] }), or
 * `auto` to find the hard cuts in a film whose cuts nobody declared: a reference
 * (references/verification.md, Read a reference). --max-stretch and --per-30 are the
 * profile's frozen-time numbers, passed on to frozen-time.mjs.
 * Needs Node 18+, ffmpeg and ffprobe.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findCuts, report, scan } from "./frozen-time.mjs";

const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28 });

function ff(args) {
  const r = run("ffmpeg", ["-v", "error", "-y", ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.trim().split("\n").pop()}`);
}

/** Frames from a --cuts value: a JSON file (array or { cuts }) or a comma list. */
export function parseFrames(value) {
  if (value === undefined || value === "") return [];
  const parsed = existsSync(value) ? JSON.parse(readFileSync(value, "utf8")) : value.split(",").filter(Boolean).map(Number);
  const list = Array.isArray(parsed) ? parsed : parsed.cuts ?? [];
  const frames = list.map((c) => (typeof c === "object" ? c.frame : c));
  if (!frames.every(Number.isInteger)) throw new Error(`frames must be whole numbers, got ${JSON.stringify(list)}`);
  return frames;
}

function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,r_frame_rate,width,height", "-of", "json", file]);
  const s = JSON.parse(r.stdout).streams[0];
  const [num, den] = s.r_frame_rate.split("/").map(Number);
  return { frames: Number(s.nb_read_frames), fps: num / den, width: s.width, height: s.height };
}

/** One sheet of chosen frames, `cols` across, each `w` px wide. */
function sheet(file, frames, cols, w, out) {
  const select = frames.map((n) => `eq(n\\,${n})`).join("+");
  const across = Math.min(cols, frames.length);
  const rows = Math.ceil(frames.length / across);
  ff(["-i", file, "-vf", `select='${select}',scale=${w}:-2,tile=${across}x${rows}:padding=4:color=white`, "-fps_mode", "vfr", "-frames:v", "1", out]);
}

export async function makePack(file, { cuts = [], moments = [], outDir, maxStretch, per30 }) {
  mkdirSync(outDir, { recursive: true });
  const v = probe(file);
  const name = file.replace(/\\/g, "/").split("/").pop();
  const t = (n) => (n / v.fps).toFixed(2);
  const tall = v.height > v.width;
  const w = tall ? 180 : 320;
  const written = [];
  const scanned = await scan(file);
  if (cuts === "auto") cuts = findCuts(scanned);

  const perSecond = [];
  for (let n = 0; n < v.frames; n += Math.round(v.fps)) perSecond.push(n);
  const hookFrames = Math.min(v.frames, Math.round(3 * v.fps));
  sheet(file, Array.from({ length: 12 }, (_, i) => Math.min(hookFrames - 1, Math.round((i * (hookFrames - 1)) / 11))), 12, w, join(outDir, "hook.png"));
  written.push("hook.png");
  sheet(file, perSecond, 10, w, join(outDir, "contact.png"));
  written.push("contact.png");
  sheet(file, Array.from({ length: 15 }, (_, i) => Math.min(v.frames - 1, Math.round(((i + 0.5) * v.frames) / 15))), 5, 360, join(outDir, "phone.png"));
  written.push("phone.png");

  // Every 0.2 s, five a row, so each row is one second; five rows a sheet keeps each frame readable.
  const fifths = [];
  for (let i = 0; Math.round((i * v.fps) / 5) < v.frames; i++) fifths.push(Math.round((i * v.fps) / 5));
  const dense = [];
  for (let i = 0; i < fifths.length; i += 25) {
    const file_ = `dense-${dense.length + 1}.png`;
    sheet(file, fifths.slice(i, i + 25), 5, w, join(outDir, file_));
    dense.push({ name: file_, from: fifths[i] });
    written.push(file_);
  }

  const inside = cuts.filter((c) => c > 0 && c < v.frames).sort((a, b) => a - b);
  if (inside.length) {
    sheet(file, inside.flatMap((c) => [c - 1, c]), 8, w, join(outDir, "cuts.png"));
    written.push("cuts.png");
    const stride = Math.max(1, Math.round(v.fps / 16));
    for (const c of inside) {
      const around = [...new Set(Array.from({ length: 16 }, (_, i) => Math.max(0, Math.min(v.frames - 1, c + (i - 8) * stride))))];
      sheet(file, around, 8, tall ? 180 : 200, join(outDir, `cut-${c}.png`));
      written.push(`cut-${c}.png`);
    }
  }

  for (const m of moments) {
    const from = Math.max(0, Math.min(v.frames - 12, m - 6));
    const frames = Array.from({ length: 12 }, (_, i) => from + i);
    sheet(file, frames, 12, w, join(outDir, `strip-${m}.png`));
    written.push(`strip-${m}.png`);
  }

  const still = report(name, scanned, { ...(maxStretch !== undefined && { maxStretch }), ...(per30 !== undefined && { per30 }) });
  writeFileSync(join(outDir, "motion.txt"), still.lines.join("\n") + "\n");
  written.push("motion.txt");

  const here = dirname(fileURLToPath(import.meta.url));
  const audio = run(process.execPath, [join(here, "audio-check.mjs"), file]);
  writeFileSync(join(outDir, "audio.txt"), audio.stdout + audio.stderr);
  written.push("audio.txt");

  const index = [
    `# Critic pack: ${name}`,
    "",
    `${v.frames} frames at ${v.fps} fps (${t(v.frames)} s), ${v.width}x${v.height}.`,
    "",
    "- `hook.png`: the first three seconds, 12 frames: judge it first, as the viewer would (is frame 0 a full picture with something happening, does it open a question, does anything wait?).",
    "- `contact.png`: a frame a second, read left to right, 10 a row: the overview.",
    "- `phone.png`: 15 frames across the film, each 360 px wide, the size a phone shows it: every caption, label and number must read here.",
    ...dense.map((d) => `- \`${d.name}\`: from ${t(d.from)} s, a frame every 0.2 s, 5 a row: each row is one second.`),
    inside.length ? "- `cuts.png`: every cut as a pair, the last frame before it and the first after it, 4 pairs a row." : "- No cuts were given or found.",
    inside.length ? "- `cut-<frame>.png`: 16 frames across the second around that cut, 8 a row: what the eye follows over it." : "",
    ...moments.map((m) => `- \`strip-${m}.png\`: 12 consecutive frames around frame ${m} (${t(m)} s).`),
    `- \`motion.txt\`: frozen time: ${still.total.toFixed(2)} s still in all, the longest stretch ${still.longest.toFixed(2)} s (${still.ok ? "within" : "over"} the budget), and every stretch with its times.`,
    "- `audio.txt`: loudness, true peak and the timeline; a `^` marks a jump (the lift).",
    "",
    inside.length ? "Cuts, in the order of the pairs:" : "",
    ...inside.map((c, i) => `${i + 1}. frame ${c}, ${t(c)} s`),
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  writeFileSync(join(outDir, "index.md"), index.join("\n") + "\n");
  written.push("index.md");
  return written;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const raw = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const num = (k) => (raw(k) === undefined ? undefined : Number(raw(k)));
  if (!file) {
    console.error("usage: node critic-pack.mjs <video.mp4> [--cuts=<file.json|45,90|auto>] [--moments=<frames>] [--out=out/_critic] [--max-stretch=0.6] [--per-30=1]");
    process.exit(2);
  }
  const outDir = resolve(raw("out") ?? "out/_critic");
  const cuts = raw("cuts") === "auto" ? "auto" : parseFrames(raw("cuts"));
  const written = await makePack(resolve(file), { cuts, moments: parseFrames(raw("moments")), outDir, maxStretch: num("max-stretch"), per30: num("per-30") });
  for (const w of written) console.log(`wrote  ${join(outDir, w)}`);
  console.log("Give the critic this folder and the film itself, with the prompt from references/critic-prompts.md: never your reasoning, never what you think you fixed.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
