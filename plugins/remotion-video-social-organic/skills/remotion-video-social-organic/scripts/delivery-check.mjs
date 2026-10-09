#!/usr/bin/env node
/**
 * Checks a delivered file the way a phone, a TV or an ad platform will meet it. Needs Node 18+,
 * ffmpeg and ffprobe.
 *
 *   node delivery-check.mjs out/<id>.mp4 [more files]
 *
 * For each file, a problem is:
 * - colour: not limited range with the BT.709 matrix, primaries and transfer all tagged. Without
 *   `colorSpace: "bt709"` Remotion writes full-range yuvj420p with the BT.601 matrix: right on a player
 *   that reads the tags, off on one that assumes the usual BT.709 (measured on a film: a brand red
 *   #E65238 shown as #F25E35). The check decodes the middle frame both ways and prints how far apart.
 * - a pixel format other than yuv420p, or an odd width or height;
 * - an MP4 whose index (moov) comes after its media (mdat): a phone waits for the whole download
 *   before it plays (faststart);
 * - audio that is not AAC. A file with no audio stream is noted, not failed (a silent loop).
 *
 * Prints "<file>: OK" or the problems with their fix, and exits 1 if any file has one.
 */
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Top-level box types of an MP4 in file order, from a Buffer or a file path (headers only). */
export function boxOrder(source) {
  const isBuf = Buffer.isBuffer(source);
  const fd = isBuf ? null : openSync(source, "r");
  const head = Buffer.alloc(16);
  const read = (pos, len) => {
    if (isBuf) return source.subarray(pos, pos + len);
    const n = readSync(fd, head, 0, len, pos);
    return head.subarray(0, n);
  };
  const total = isBuf ? source.length : statSync(source).size;
  const types = [];
  try {
    let pos = 0;
    while (pos + 8 <= total && types.length < 64) {
      const h = read(pos, 16);
      if (h.length < 8) break;
      let size = h.readUInt32BE(0);
      const type = h.toString("latin1", 4, 8);
      if (size === 1 && h.length >= 16) size = Number(h.readBigUInt64BE(8));
      else if (size === 0) size = total - pos;
      if (size < 8) break;
      types.push(type);
      pos += size;
    }
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return types;
}

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_type,codec_name,pix_fmt,width,height,color_range,color_space,color_primaries,color_transfer:format=duration,format_name",
    "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout || "{}");
}

/** The middle frame as RGB, decoded as tagged, or as a player that assumes BT.709 limited range. */
function frameRgb(file, at, assume709) {
  const vf = assume709 ? "scale=in_color_matrix=bt709:in_range=tv:out_range=pc" : "scale=out_color_matrix=bt709:out_range=pc";
  const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 29 });
  return r.status === 0 ? r.stdout : null;
}

const known = (v) => (v && v !== "unknown" ? v : "unknown");

/** Problems and notes for one file. */
export function checkFile(file) {
  const info = probe(file);
  if (!info) return { problems: [`cannot read ${file}`], notes: [] };
  const problems = [], notes = [];
  const video = info.streams?.find((s) => s.codec_type === "video");
  const audio = info.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(info.format?.duration) || 0;
  if (!video) return { problems: ["no video stream"], notes };
  if (video.pix_fmt !== "yuv420p") problems.push(`pixel format ${video.pix_fmt}; deliver yuv420p`);
  const range = video.color_range, matrix = known(video.color_space), prim = known(video.color_primaries), trc = known(video.color_transfer);
  const tv = range === "tv" && video.pix_fmt !== "yuvj420p";
  if (!tv || matrix !== "bt709" || prim !== "bt709" || trc !== "bt709") {
    const rangeText = range === "pc" || video.pix_fmt === "yuvj420p" ? "full range (pc)" : range === "tv" ? "limited range (tv)" : "range not tagged";
    let line = `colour: ${rangeText}, matrix ${matrix}, primaries ${prim}, transfer ${trc}; render with colorSpace: "bt709" (limited range, all three tags)`;
    const at = Math.max(0, duration / 2);
    const a = frameRgb(file, at, false), b = frameRgb(file, at, true);
    if (a && b && a.length === b.length) {
      let max = 0;
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; }
      line += `. At ${at.toFixed(1)} s a player that ignores the tags shows colours up to ${max} levels off`;
    }
    problems.push(line);
  }
  if (video.width % 2 || video.height % 2) problems.push(`size ${video.width}x${video.height}; width and height must be even`);
  if (/mp4|mov/.test(info.format?.format_name ?? "")) {
    const order = boxOrder(file);
    const moov = order.indexOf("moov"), mdat = order.indexOf("mdat");
    if (moov === -1) problems.push("no moov box found");
    else if (mdat !== -1 && moov > mdat) problems.push("moov after mdat: a phone waits for the whole download before it plays; encode with -movflags +faststart");
  }
  if (!audio) notes.push("no audio stream (fine for a silent loop; a film with music has one)");
  else if (audio.codec_name !== "aac") problems.push(`audio: ${audio.codec_name}; deliver AAC`);
  return { problems, notes };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("usage: node delivery-check.mjs <file.mp4> [more files]");
    process.exit(2);
  }
  let failed = 0;
  for (const file of files) {
    const { problems, notes } = checkFile(file);
    if (problems.length) failed++;
    console.log(problems.length ? `${file}:` : `${file}: OK`);
    for (const p of problems) console.log(`  - ${p}`);
    for (const n of notes) console.log(`  note: ${n}`);
  }
  if (failed) console.log(`\n${failed} of ${files.length} file(s) not ready to deliver.`);
  process.exit(failed ? 1 : 0);
}
