#!/usr/bin/env node
/**
 * What the film critic looks at, made the same way every round. A frame a second
 * cannot show a cut, a move or the music, so critics scored motion, transitions
 * and sound by guessing. This writes, into one folder:
 *
 *   hook.png        the first two seconds, 12 frames: what a thumb in a feed sees before it decides
 *   contact.png     a frame a second, the whole film
 *   cuts.png        every declared cut as a pair: its last frame before, its first after
 *   strip-<f>.png   12 consecutive frames around each moment named (the turn, the close, a fast move)
 *   audio.txt       the loudness timeline (where the lift lands) from audio-check.mjs
 *   index.md        what each sheet shows, and every cut and moment with its time
 *
 *   node critic-pack.mjs <video.mp4> [--cuts=<out/id.cuts.json|45,90>] [--moments=<frames>] [--out=out/_critic]
 *
 * --cuts takes what frame-pops.mjs takes (an array of frames, or { cuts: [...] }).
 * Needs Node 18+, ffmpeg and ffprobe.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

export function makePack(file, { cuts = [], moments = [], outDir }) {
  mkdirSync(outDir, { recursive: true });
  const v = probe(file);
  const t = (n) => (n / v.fps).toFixed(2);
  const w = v.height > v.width ? 180 : 320;
  const written = [];

  const perSecond = [];
  for (let n = 0; n < v.frames; n += Math.round(v.fps)) perSecond.push(n);
  const hookFrames = Math.min(v.frames, Math.round(2 * v.fps));
  sheet(file, Array.from({ length: 12 }, (_, i) => Math.min(hookFrames - 1, Math.round((i * (hookFrames - 1)) / 11))), 12, w, join(outDir, "hook.png"));
  written.push("hook.png");
  sheet(file, perSecond, 10, w, join(outDir, "contact.png"));
  written.push("contact.png");

  const inside = cuts.filter((c) => c > 0 && c < v.frames).sort((a, b) => a - b);
  if (inside.length) {
    sheet(file, inside.flatMap((c) => [c - 1, c]), 8, w, join(outDir, "cuts.png"));
    written.push("cuts.png");
  }

  for (const m of moments) {
    const from = Math.max(0, Math.min(v.frames - 12, m - 6));
    const frames = Array.from({ length: 12 }, (_, i) => from + i);
    sheet(file, frames, 12, w, join(outDir, `strip-${m}.png`));
    written.push(`strip-${m}.png`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const audio = run(process.execPath, [join(here, "audio-check.mjs"), file]);
  writeFileSync(join(outDir, "audio.txt"), audio.stdout + audio.stderr);
  written.push("audio.txt");

  const index = [
    `# Critic pack: ${file.replace(/\\/g, "/").split("/").pop()}`,
    "",
    `${v.frames} frames at ${v.fps} fps (${t(v.frames)} s), ${v.width}x${v.height}.`,
    "",
    "- `hook.png`: the first two seconds, 12 frames: judge it first, as a stranger scrolling a feed would (does something move, does it open a question?).",
    "- `contact.png`: a frame a second, read left to right, 10 a row.",
    inside.length ? "- `cuts.png`: every declared cut as a pair, the last frame before it and the first after it, 4 pairs a row." : "- No declared cuts were given.",
    ...moments.map((m) => `- \`strip-${m}.png\`: 12 consecutive frames around frame ${m} (${t(m)} s).`),
    "- `audio.txt`: loudness, true peak and the timeline; a `^` marks a jump (the lift).",
    "",
    inside.length ? "Cuts, in the order of the pairs:" : "",
    ...inside.map((c, i) => `${i + 1}. frame ${c}, ${t(c)} s`),
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  writeFileSync(join(outDir, "index.md"), index.join("\n") + "\n");
  written.push("index.md");
  return written;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const raw = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (!file) {
    console.error("usage: node critic-pack.mjs <video.mp4> [--cuts=<file.json|45,90>] [--moments=<frames>] [--out=out/_critic]");
    process.exit(2);
  }
  const outDir = resolve(raw("out") ?? "out/_critic");
  const written = makePack(resolve(file), { cuts: parseFrames(raw("cuts")), moments: parseFrames(raw("moments")), outDir });
  for (const w of written) console.log(`wrote  ${join(outDir, w)}`);
  console.log("Give the critic this folder, the one-sentence message, the brand read's Look row and the criteria.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
