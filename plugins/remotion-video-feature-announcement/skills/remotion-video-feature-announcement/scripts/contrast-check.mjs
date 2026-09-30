#!/usr/bin/env node
/**
 * Measures the contrast of text in a rendered still: the words against what is
 * behind them, in the pixels the viewer gets. A caption that read fine on the
 * canvas sat at 2.1:1 over a bright shot in the film. Needs Node 18+ and ffmpeg.
 *
 *   node contrast-check.mjs <still.png> --rect=x,y,w,h [--rect=...] [--min=4.5]
 *
 * Each --rect is a text block in the still's own pixels (the caption band, a
 * label, the end card's line). The pixels in it are split into the text and its
 * background, and the contrast is the WCAG ratio between the two; exit 1 when
 * any rect is under --min (4.5, the AA bar for body text). It also prints the
 * ratio against the part of the background closest to the text: when that falls
 * under 3, the picture behind the words is busy and they need a backing.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** WCAG relative luminance of an 8-bit sRGB pixel. */
export const luminance = (r, g, b) => 0.2126 * linear(r / 255) + 0.7152 * linear(g / 255) + 0.0722 * linear(b / 255);
/** WCAG contrast ratio of two luminances. */
export const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The text and background of one rect, and their contrast. */
export function measure(file, rect) {
  const [x, y, w, h] = rect;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || r.stdout.length < w * h * 3) throw new Error(`cannot read ${rect.join(",")} from ${file}`);
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = luminance(r.stdout[i * 3], r.stdout[i * 3 + 1], r.stdout[i * 3 + 2]);
  // Otsu's split on perceptual lightness: the text is one side, its background the other.
  const bins = 256;
  const hist = new Float64Array(bins);
  const light = (l) => Math.min(bins - 1, Math.floor(Math.cbrt(l) * bins));
  for (const l of lum) hist[light(l)]++;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let best = 0, cut = 0, below = 0, sumBelow = 0;
  for (let i = 0; i < bins; i++) {
    below += hist[i];
    sumBelow += i * hist[i];
    const above = lum.length - below;
    if (!below || !above) continue;
    const between = below * above * (sumBelow / below - (sum - sumBelow) / above) ** 2;
    if (between > best) {
      best = between;
      cut = i;
    }
  }
  const dark = [], bright = [];
  for (const l of lum) (light(l) <= cut ? dark : bright).push(l);
  if (Math.min(dark.length, bright.length) < lum.length * 0.01) return { ratio: 1, worst: 1, textShare: 0 };
  // The text is the smaller side; the median ignores the anti-aliased edge.
  const [text, back] = dark.length < bright.length ? [dark, bright] : [bright, dark];
  text.sort((a, b) => a - b);
  back.sort((a, b) => a - b);
  const mid = (xs, q = 0.5) => xs[Math.min(xs.length - 1, Math.floor(xs.length * q))];
  const t = mid(text);
  const nearest = mid(back, t < mid(back) ? 0.1 : 0.9);
  return { ratio: ratio(t, mid(back)), worst: ratio(t, nearest), textShare: text.length / lum.length };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const rects = args.filter((a) => a.startsWith("--rect=")).map((a) => a.slice(7).split(",").map(Number));
  const min = Number(args.find((a) => a.startsWith("--min="))?.slice(6) ?? 4.5);
  if (!file || !rects.length || rects.some((r) => r.length !== 4 || !r.every(Number.isInteger))) {
    console.error("usage: node contrast-check.mjs <still.png> --rect=x,y,w,h [--rect=...] [--min=4.5]");
    process.exit(2);
  }
  let bad = 0;
  for (const rect of rects) {
    const m = measure(file, rect);
    const where = `rect ${rect.join(",")}`;
    if (!m.textShare) {
      console.log(`${where}: no text found (one flat field)`);
      bad++;
      continue;
    }
    const low = m.ratio < min;
    if (low) bad++;
    console.log(`${where}: ${m.ratio.toFixed(1)}:1${low ? `   <- under ${min}:1` : ""}${m.worst < 3 ? `   (only ${m.worst.toFixed(1)}:1 against the nearest part of the picture behind it: give the words a backing)` : ""}`);
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
