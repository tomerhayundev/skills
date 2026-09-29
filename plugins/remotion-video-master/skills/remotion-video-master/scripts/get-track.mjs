#!/usr/bin/env node
/**
 * The music library: vetted tracks by mood, each already fitted to the beat grid,
 * so a film's music is chosen for the brand instead of defaulting to one track.
 * Only one track ships inside the skill; the others are downloaded on demand from
 * Wikimedia Commons (the file's current URL looked up by its title, one request
 * at a time, backing off when throttled) and checked against the library's checksum.
 *
 *   node get-track.mjs --list [--mood=<word>]
 *   node get-track.mjs <id> [--dir=public/music] [--fps=30]
 *
 * <id> writes into --dir: the track (<id>.mp3 or .ogg), track.json (bpm, seconds and
 * frames per beat, beat 0, the lifts, gain, credit: what the tokens and music.ts
 * read) and CREDITS.md (the attribution line CC BY asks for). --library=<file>
 * reads another catalog (tests). Needs Node 18+.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIBRARY = join(here, "..", "assets", "music", "library.json");

export function loadLibrary(file = DEFAULT_LIBRARY) {
  const lib = JSON.parse(readFileSync(file, "utf8"));
  return { ...lib, dir: dirname(resolve(file)) };
}

/** Frames per beat when it is a whole number (within float error), else null. */
export function wholeFrames(fps, bpm) {
  const f = (fps * 60) / bpm;
  return Math.abs(f - Math.round(f)) < 0.01 ? Math.round(f) : null;
}

/** The library as lines, one per track, grouped by mood. */
export function listing(lib, { mood, fps = 30 } = {}) {
  const tracks = lib.tracks.filter((t) => !mood || `${t.mood} ${t.fits ?? ""}`.toLowerCase().includes(mood.toLowerCase()));
  const lines = [];
  for (const m of [...new Set(tracks.map((t) => t.mood))]) {
    lines.push(`${m}`);
    for (const t of tracks.filter((x) => x.mood === m)) {
      const fpb = wholeFrames(fps, t.bpm);
      const stretched = t.sourceBpm ? `, stretched from ${t.sourceBpm}` : "";
      const tempo = t.bpm ? `${t.bpm} BPM (${fpb ? `${fpb} frames a beat` : "off the frame grid"}${stretched})` : "tempo not fitted yet";
      lines.push(`  ${t.id.padEnd(24)} ${tempo}, ${Math.round(t.durationSeconds)} s  ${t.title}, ${t.artist}${t.bundled ? "  [bundled]" : ""}`);
      if (t.liftHint) lines.push(`  ${"".padEnd(24)} lift: ${t.liftHint}`);
      if (t.fits) lines.push(`  ${"".padEnd(24)} fits: ${t.fits}`);
    }
  }
  return lines;
}

const hash = (algo, buf) => createHash(algo).update(buf).digest("hex");
/** Wikimedia asks every client to say who it is; nothing personal goes in here. */
const USER_AGENT = "remotion-video-master-get-track/1.0 (https://github.com/tomerhayundev/skills)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** GET with the user agent, one request at a time, backing off on 429 and 5xx. */
async function politeFetch(url, tries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": USER_AGENT } });
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** i;
      await sleep(Math.min(wait, 30000));
      continue;
    }
    return res;
  }
}

/** A Commons file's current download URL and SHA-1: files keep their title, while their URL can move. */
async function commonsFile(lib, title) {
  const api = `${lib.commonsApi ?? COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=url%7Csha1&titles=${encodeURIComponent(title)}`;
  const res = await politeFetch(api);
  if (!res.ok) throw new Error(`Commons lookup failed: ${res.status} for ${title}`);
  const page = Object.values((await res.json()).query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`${title} is no longer on Wikimedia Commons; pick another track with --list`);
  return info;
}

/** Puts track <id> and its track.json and CREDITS.md in `dir`. Throws before writing anything when it cannot be verified. */
export async function getTrack(lib, id, { dir, fps = 30 }) {
  const t = lib.tracks.find((x) => x.id === id);
  if (!t) throw new Error(`no track "${id}" in the library; run --list`);
  if (!t.bpm) throw new Error(`${t.id} has not been fitted to the beat grid yet; fit it with fit-beat-grid.mjs and add bpm, firstBeatSeconds and liftBeats to the library`);
  const framesPerBeat = wholeFrames(fps, t.bpm);
  if (!framesPerBeat) throw new Error(`${t.bpm} BPM is ${((fps * 60) / t.bpm).toFixed(2)} frames a beat at ${fps} fps: not a whole number, cuts would drift`);
  let buf;
  let ext = (t.bundled ?? t.commons ?? t.url ?? ".mp3").match(/\.(mp3|ogg|oga|wav|m4a)$/i)?.[1].toLowerCase() ?? "mp3";
  if (t.bundled) buf = readFileSync(join(lib.dir, t.bundled));
  else {
    const url = t.commons ? (await commonsFile(lib, t.commons)).url : t.url;
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} for ${url}; open ${t.page} and download it by hand into ${dir}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const changed = (t.sha256 && hash("sha256", buf) !== t.sha256) || (t.sha1 && hash("sha1", buf) !== t.sha1);
  if (changed) throw new Error(`checksum mismatch for ${t.id}: the file at the source changed; listen to it and refit it with fit-beat-grid.mjs before using it`);
  if (ext === "oga") ext = "ogg";
  mkdirSync(dir, { recursive: true });
  const stretch = t.sourceBpm && Math.abs(t.sourceBpm - t.bpm) > 0.001 ? t.bpm / t.sourceBpm : null;
  if (stretch) ext = "mp3";
  const target = join(dir, `${t.id}.${ext}`);
  if (!stretch) writeFileSync(target, buf);
  else {
    // Time-stretched (pitch kept) to the nearest whole-frame tempo: under 2.5%, which no one hears.
    const tmp = mkdtempSync(join(tmpdir(), "track-"));
    try {
      const src = join(tmp, "source");
      writeFileSync(src, buf);
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-af", `atempo=${stretch}`, "-c:a", "libmp3lame", "-q:a", "2", target], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`ffmpeg could not stretch ${t.id} to ${t.bpm} BPM: ${(r.stderr || r.error?.message || "").trim().split("\n").pop()}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const secondsPerBeat = framesPerBeat / fps;
  const track = {
    id: t.id,
    file: `music/${t.id}.${ext}`,
    title: t.title,
    artist: t.artist,
    license: t.license,
    bpm: Number(((fps * 60) / framesPerBeat).toFixed(3)),
    ...(stretch ? { sourceBpm: t.sourceBpm, stretch: Number(stretch.toFixed(5)) } : {}),
    secondsPerBeat,
    framesPerBeat,
    firstBeatSeconds: t.firstBeatSeconds,
    liftBeats: t.liftBeats,
    liftSeconds: t.liftBeats.map((b) => Number((t.firstBeatSeconds + b * secondsPerBeat).toFixed(3))),
    durationSeconds: t.durationSeconds,
    gainDb: t.gainDb ?? 0,
    credit: t.credit,
  };
  writeFileSync(join(dir, "track.json"), JSON.stringify(track, null, 2) + "\n");
  writeFileSync(join(dir, "CREDITS.md"), `# Music credits\n\n\`${t.id}.${ext}\`: ${t.credit}\n\nSource: ${t.page}\nLicense: ${t.license}${t.licenseUrl ? `, ${t.licenseUrl}` : ""}\n\nPut the credit line in the post's description or caption wherever there is one.\n`);
  return { file: target, track };
}

async function main() {
  const args = process.argv.slice(2);
  const raw = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const lib = loadLibrary(raw("library") ?? DEFAULT_LIBRARY);
  const fps = Number(raw("fps") ?? 30);
  if (args.includes("--list")) {
    for (const l of listing(lib, { mood: raw("mood"), fps })) console.log(l);
    console.log("\nPick by the brand read's Look row; then: node get-track.mjs <id> [--dir=public/music]");
    return;
  }
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) {
    console.error("usage: node get-track.mjs --list [--mood=<word>] | <id> [--dir=public/music] [--fps=30]");
    process.exit(2);
  }
  const dir = resolve(raw("dir") ?? "public/music");
  try {
    const { file, track } = await getTrack(lib, id, { dir, fps });
    console.log(`wrote  ${file}`);
    console.log(`wrote  ${join(dir, "track.json")}   ${track.bpm} BPM, ${track.framesPerBeat} frames a beat, lifts at ${track.liftSeconds.slice(0, 3).join(" s, ")} s`);
    console.log(`wrote  ${join(dir, "CREDITS.md")}   credit: ${track.credit}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
