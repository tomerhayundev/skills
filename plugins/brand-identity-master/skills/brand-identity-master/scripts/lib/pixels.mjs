// Reads a decoded logo (RGBA pixels): what is background, which colours are ink, and facts about its shape.
import { rgbToOklab, oklabToRgb, rgbToHex } from './color.mjs';

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const labAt = (img, p) => rgbToOklab([img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]]);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const count = (m) => { let n = 0; for (const v of m) n += v; return n; };

export function detectBackground(img) {
  const { width: w, height: h, data } = img;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const clear = border.filter((p) => data[p * 4 + 3] < 200).length;
  if (clear / border.length > 0.5) return { kind: 'transparent' };
  const labs = border.filter((p) => data[p * 4 + 3] >= 200).map((p) => labAt(img, p));
  const med = [0, 1, 2].map((k) => median(labs.map((l) => l[k])));
  const near = labs.filter((l) => dist(l, med) < 0.03).length;
  if (near / labs.length >= 0.85) return { kind: 'solid', hex: rgbToHex(oklabToRgb(med)), lab: med.map((v) => round(v, 4)) };
  return { kind: 'none' };
}

export function inkMask(img, bg) {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (img.data[p * 4 + 3] < 200) continue;
    if (bg.kind === 'solid' && dist(labAt(img, p), bg.lab) < 0.06) continue;
    mask[p] = 1;
  }
  return mask;
}

export function erode(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (mask[p] && mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) out[p] = 1;
  }
  return out;
}

// Ink away from its edges, so anti-aliasing and compression fringes do not become colours,
// unless the shape is too thin to have an interior.
export function coreMask(mask, w, h) {
  const total = count(mask);
  const e1 = erode(mask, w, h);
  const e2 = erode(e1, w, h);
  if (count(e2) >= 0.25 * total) return e2;
  if (count(e1) >= 0.2 * total) return e1;
  return mask;
}

export function clusterColors(img, mask, { maxColors = 5, minShare = 0.02, mergeDist = 0.05 } = {}) {
  const bins = new Map();
  let total = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const lab = labAt(img, p);
    const key = lab.map((v) => Math.round(v / 0.02)).join(',');
    let b = bins.get(key);
    if (!b) { b = { n: 0, sum: [0, 0, 0] }; bins.set(key, b); }
    b.n++; b.sum[0] += lab[0]; b.sum[1] += lab[1]; b.sum[2] += lab[2];
    total++;
  }
  if (!total) return [];
  const sorted = [...bins.values()].map((b) => ({ n: b.n, lab: b.sum.map((s) => s / b.n) })).sort((a, b) => b.n - a.n);
  const merged = [];
  for (const c of sorted) {
    const t = merged.find((m) => dist(m.lab, c.lab) < mergeDist);
    if (t) { const n = t.n + c.n; t.lab = t.lab.map((v, k) => (v * t.n + c.lab[k] * c.n) / n); t.n = n; }
    else merged.push({ ...c });
  }
  merged.sort((a, b) => b.n - a.n);
  return merged.filter((c) => c.n / total >= minShare).slice(0, maxColors)
    .map((c) => ({ hex: rgbToHex(oklabToRgb(c.lab)), share: round(c.n / total) }));
}

function parts(mask, w, x0, y0, x1, y1) {
  const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
  const rowEmpty = (y) => { for (let x = x0; x <= x1; x++) if (mask[y * w + x]) return false; return true; };
  const colEmpty = (x) => { for (let y = y0; y <= y1; y++) if (mask[y * w + x]) return false; return true; };
  const longest = (from, to, empty) => { let best = 0, run = 0; for (let i = from; i <= to; i++) { if (empty(i)) { run++; if (run > best) best = run; } else run = 0; } return best; };
  if (longest(y0, y1, rowEmpty) >= Math.max(3, 0.06 * bh)) return { parts: 2, split: 'stacked' };
  if (longest(x0, x1, colEmpty) >= Math.max(3, 0.08 * bw)) return { parts: 2, split: 'side' };
  return { parts: 1, split: null };
}

export function shapeFacts(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!ink) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  let mirrored = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x] && mask[y * w + (x0 + x1 - x)]) mirrored++;
  const interior = count(erode(mask, w, h));
  // Stroke width at each ink pixel: the shorter of its horizontal and vertical ink runs.
  const hr = new Uint16Array(w * h), vr = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) { let x = 0; while (x < w) { if (!mask[y * w + x]) { x++; continue; } let e = x; while (e < w && mask[y * w + e]) e++; for (let k = x; k < e; k++) hr[y * w + k] = e - x; x = e; } }
  for (let x = 0; x < w; x++) { let y = 0; while (y < h) { if (!mask[y * w + x]) { y++; continue; } let e = y; while (e < h && mask[e * w + x]) e++; for (let k = y; k < e; k++) vr[k * w + x] = e - y; y = e; } }
  const widths = [];
  for (let p = 0; p < w * h; p++) if (mask[p]) widths.push(Math.min(hr[p], vr[p]));
  widths.sort((a, b) => a - b);
  const pct = (q) => widths[Math.min(widths.length - 1, Math.floor(q * widths.length))];
  return {
    bbox: { x: x0, y: y0, w: bw, h: bh },
    aspect: round(bw / bh),
    coverage: round(ink / (bw * bh)),
    mirrorX: round(mirrored / ink),
    edgeDensity: round((ink - interior) / ink),
    strokeMinPx: pct(0.05),
    strokeMedianPx: pct(0.5),
    ...parts(mask, w, x0, y0, x1, y1),
  };
}

export function analyze(img) {
  const background = detectBackground(img);
  const mask = inkMask(img, background);
  return {
    background,
    inks: clusterColors(img, coreMask(mask, img.width, img.height)),
    shape: shapeFacts(mask, img.width, img.height),
  };
}
