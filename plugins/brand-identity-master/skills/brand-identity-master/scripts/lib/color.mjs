// Colour maths: sRGB, OKLab and OKLCH (Bjorn Ottosson's matrices), WCAG 2 contrast.

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;

export function rgbToOklab([r, g, b]) {
  const lr = toLin(r), lg = toLin(g), lb = toLin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

export function oklabToRgb(lab) {
  return oklabToLinear(lab).map((v) => toSrgb(Math.max(0, Math.min(1, v))));
}

export function oklabToOklch([L, a, b]) {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}

export function oklchToOklab([L, C, h]) {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

export const hexToOklab = (hex) => rgbToOklab(hexToRgb(hex));
export const hexToOklch = (hex) => oklabToOklch(hexToOklab(hex));

export function oklchToHex([L, C, h]) {
  let lo = 0, hi = C;
  if (inGamut(oklabToLinear(oklchToOklab([L, C, h])))) lo = C;
  else for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklabToLinear(oklchToOklab([L, mid, h])))) lo = mid; else hi = mid; }
  return rgbToHex(oklabToRgb(oklchToOklab([L, lo, h])));
}

export function deltaOk(a, b) {
  const A = typeof a === 'string' ? hexToOklab(a) : a;
  const B = typeof b === 'string' ? hexToOklab(b) : b;
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export function parseCssColor(str) {
  const s = String(str).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toUpperCase(), alpha: 1 };
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
  return { hex: rgbToHex(p.slice(0, 3)), alpha: p.length > 3 ? p[3] : 1 };
}

export function blendOver(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex), b = hexToRgb(bgHex);
  return rgbToHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

export function mixOklab(aHex, bHex, t) {
  const A = hexToOklab(aHex), B = hexToOklab(bHex);
  return rgbToHex(oklabToRgb(A.map((v, i) => v + (B[i] - v) * t)));
}
