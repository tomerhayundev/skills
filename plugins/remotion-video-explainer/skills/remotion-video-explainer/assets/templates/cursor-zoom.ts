/**
 * Cursor zoom for screen recordings: the camera eases in on where the action is
 * and back out, like a screen-recording studio does. Drop into src/motion/cursor-zoom.ts.
 *
 * Keyframes say which point of the recording to center and how far to zoom. Between
 * keyframes the camera moves on the base's quintic ease (it starts and stops with no
 * acceleration), and it never shows past the recording's edges.
 *
 * Wiring: wrap the <Video> in a div of the recording's size with
 * `transform-origin: 0 0; transform: zoomTransform(frame, keys, geo)`. Never put
 * `will-change` on it: Chrome would rasterize it once and the text would go soft.
 * UI zooms of 1.2-1.6x read best (the viewer still sees where they are); go past 2x only for a
 * small control, with keyframes at least 1 s apart. The jerk test enforces the spacing.
 */

export interface ZoomKey {
  frame: number;
  /** Point of the recording to put in the frame's center, in recording pixels. */
  x: number;
  y: number;
  /** 1 = the recording fills the frame; 2 = twice as close. */
  scale: number;
}

export interface ZoomGeometry {
  frameWidth: number;
  frameHeight: number;
  srcWidth: number;
  srcHeight: number;
}

export interface Camera {
  scale: number;
  /** Translation in frame pixels, applied after the scale with transform-origin 0 0. */
  tx: number;
  ty: number;
}

/** The base's camera ease: zero velocity and acceleration at both ends. */
export const quintic = (t: number) => t * t * t * (t * (6 * t - 15) + 10);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function focusAt(frame: number, keys: ZoomKey[]): ZoomKey {
  if (!keys.length) throw new Error("cursor zoom needs at least one keyframe");
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) return sorted[0];
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) return last;
  const i = sorted.findIndex((k) => k.frame > frame);
  const a = sorted[i - 1];
  const b = sorted[i];
  const t = quintic((frame - a.frame) / (b.frame - a.frame));
  return { frame, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), scale: lerp(a.scale, b.scale, t) };
}

/** A key moved so its window stays inside the recording at its own scale. */
function clampKey(k: ZoomKey, g: ZoomGeometry): ZoomKey {
  const fit = Math.max(g.frameWidth / g.srcWidth, g.frameHeight / g.srcHeight);
  const scale = fit * Math.max(1, k.scale);
  const halfW = g.frameWidth / (2 * scale);
  const halfH = g.frameHeight / (2 * scale);
  return { ...k, x: Math.min(g.srcWidth - halfW, Math.max(halfW, k.x)), y: Math.min(g.srcHeight - halfH, Math.max(halfH, k.y)) };
}

/**
 * Camera at `frame`: the recording is fitted to cover the frame, then zoomed on the focus point.
 * Keys are clamped before interpolating: clamping afterwards bends the path at the edge and jolts
 * the camera (a key near the edge once made 40 px/frame^3 against a limit of 12).
 */
export function zoomAt(frame: number, keys: ZoomKey[], g: ZoomGeometry): Camera {
  const k = focusAt(frame, keys.map((key) => clampKey(key, g)));
  const fit = Math.max(g.frameWidth / g.srcWidth, g.frameHeight / g.srcHeight);
  const scale = fit * Math.max(1, k.scale);
  // Keep the visible window inside the recording.
  const halfW = g.frameWidth / (2 * scale);
  const halfH = g.frameHeight / (2 * scale);
  const cx = Math.min(g.srcWidth - halfW, Math.max(halfW, k.x));
  const cy = Math.min(g.srcHeight - halfH, Math.max(halfH, k.y));
  return { scale, tx: g.frameWidth / 2 - cx * scale, ty: g.frameHeight / 2 - cy * scale };
}

export function zoomTransform(frame: number, keys: ZoomKey[], g: ZoomGeometry): string {
  const c = zoomAt(frame, keys, g);
  return `translate(${c.tx}px, ${c.ty}px) scale(${c.scale})`;
}
