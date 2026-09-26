/**
 * The flood: a hard cut, hidden. A disc grows from the outgoing scene's anchor
 * until it covers the frame, the cut happens underneath, and it contracts into
 * the incoming scene's anchor. Drop into src/motion/flood.ts.
 *
 * Eased on the share of the frame covered, not the radius: visible area grows
 * with r^2 and then clips, so a radius-eased disc covers most of the frame in
 * two frames (a pop that frame-pops.mjs flags).
 *
 * Wiring (see references/architecture.md#transitions): for each boundary that
 * is not a shared-element overlap, render a Sequence from cut - FLOOD_FRAMES
 * lasting 2 * FLOOD_FRAMES; in it, draw a circle of floodRadius(frame, geo)
 * centred on the outgoing anchor while frame < FLOOD_FRAMES, the incoming
 * anchor after. Anchors are in output pixels.
 */

/** Frames each way: about 0.3s. Faster pops; slower reads as a wipe you wait for. */
export const FLOOD_FRAMES = 9;

/** Past the farthest corner, so the disc is safely edge to edge on the cut frames. */
const OVERSCALE = 1.15;

export interface FloodGeometry {
  /** Focal point in output pixels. */
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export function floodReach({ cx, cy, width, height }: FloodGeometry): number {
  return Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) * OVERSCALE;
}

/** Share of the frame (0..1) a disc of radius r around the focal point covers. */
export function visibleCoverage(r: number, { cx, cy, width, height }: FloodGeometry): number {
  if (r <= 0) return 0;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(width, cx + r);
  const steps = 240;
  const dx = (x1 - x0) / steps;
  let area = 0;
  for (let i = 0; i < steps; i++) {
    const x = x0 + (i + 0.5) * dx;
    const half = Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
    area += Math.max(0, Math.min(height, cy + half) - Math.max(0, cy - half)) * dx;
  }
  return Math.min(1, area / (width * height));
}

/** The radius whose visible coverage is `target` (bisection; coverage is monotonic in r). */
function radiusForCoverage(target: number, geo: FloodGeometry): number {
  const reach = floodReach(geo);
  if (target >= 1) return reach;
  if (target <= 0) return 0;
  let lo = 0;
  let hi = reach;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (visibleCoverage(mid, geo) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Radius at local frame `f` of the flood's own 2 * FLOOD_FRAMES window; the
 * cut sits at f = FLOOD_FRAMES. Edge to edge on both frames either side of it.
 */
export function floodRadius(f: number, geo: FloodGeometry): number {
  if (f < 0 || f >= 2 * FLOOD_FRAMES) return 0;
  const coverage = f < FLOOD_FRAMES ? easeInOutSine((f + 1) / FLOOD_FRAMES) : 1 - easeInOutSine((f - FLOOD_FRAMES) / FLOOD_FRAMES);
  return radiusForCoverage(coverage, geo);
}
