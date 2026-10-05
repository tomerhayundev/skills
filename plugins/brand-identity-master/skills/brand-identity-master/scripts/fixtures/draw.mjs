// Tiny raster drawing for test fixtures: RGBA images with anti-aliased shapes.
export function makeImage(w, h, rgba = [0, 0, 0, 0]) {
  const data = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) data.set(rgba, p * 4);
  return { width: w, height: h, data };
}

function blend(img, x, y, [r, g, b, a], cov) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height || cov <= 0) return;
  const i = (y * img.width + x) * 4;
  const sa = (a / 255) * Math.min(1, cov);
  const da = img.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  const src = [r, g, b];
  for (let k = 0; k < 3; k++) img.data[i + k] = Math.round((src[k] * sa + img.data[i + k] * da * (1 - sa)) / oa);
  img.data[i + 3] = Math.round(oa * 255);
}

export function fillRect(img, x0, y0, x1, y1, rgba) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) blend(img, x, y, rgba, 1);
}

export function fillCircle(img, cx, cy, r, rgba) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(img, x, y, rgba, Math.max(0, Math.min(1, r + 0.5 - d)));
    }
  }
}

export function ring(img, cx, cy, rOuter, rInner, rgba) {
  for (let y = Math.floor(cy - rOuter - 1); y <= Math.ceil(cy + rOuter + 1); y++) {
    for (let x = Math.floor(cx - rOuter - 1); x <= Math.ceil(cx + rOuter + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.max(0, Math.min(1, rOuter + 0.5 - d)) - Math.max(0, Math.min(1, rInner + 0.5 - d));
      blend(img, x, y, rgba, cov);
    }
  }
}

function inside(points, x, y) {
  let c = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function fillPolygon(img, points, rgba) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(points, x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      blend(img, x, y, rgba, n / 16);
    }
  }
}

export function addNoise(img, amount, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let p = 0; p < img.width * img.height; p++) {
    if (img.data[p * 4 + 3] === 0) continue;
    for (let k = 0; k < 3; k++) img.data[p * 4 + k] = Math.max(0, Math.min(255, img.data[p * 4 + k] + Math.round((rnd() * 2 - 1) * amount)));
  }
}
