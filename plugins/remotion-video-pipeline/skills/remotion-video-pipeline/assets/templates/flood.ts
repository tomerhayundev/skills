/**
 * The flood: a hard cut, hidden. The film's motif grows from the outgoing
 * scene's anchor until it covers the frame, the cut happens underneath, and it
 * contracts into the incoming scene's anchor. Drop into src/motion/flood.ts.
 *
 * The shape is the motif's silhouette (a page, a drop, a speech bubble, a
 * leaf), given as a closed polygon around (0, 0), the point it grows from. A
 * plain disc is the fallback for a motif with no closed outline, not the default.
 *
 * Eased on the share of the frame covered, not the scale: visible area grows
 * with scale^2 and then clips at the frame edges, so a scale-eased shape covers
 * most of the frame in two frames (a pop that frame-pops.mjs flags).
 *
 * Coverage is exact for any outline that is star-shaped around (0, 0), meaning
 * every ray from (0, 0) leaves the outline once: pages, drops, bubbles, hearts,
 * leaves, stars. The frame is star-shaped around the anchor too, so along each
 * ray the visible part of the shape is the nearer of the two edges.
 *
 * Wiring (see references/architecture.md#transitions): for each boundary that
 * is not a shared-element overlap, render a Sequence from cut - FLOOD_FRAMES
 * lasting 2 * FLOOD_FRAMES. In it, draw the outline as an SVG polygon with
 * transform `translate(cx cy) scale(s)`, s = floodScale(frame, geo, profile),
 * on the outgoing anchor while frame < FLOOD_FRAMES and the incoming one after.
 * Anchors are in output pixels. Build the profile once (module scope), not per frame.
 */

/** Frames each way: about 0.3s. Faster pops; slower reads as a wipe you wait for. */
export const FLOOD_FRAMES = 9;

/** Past full cover, so the shape is safely edge to edge on the cut frames. */
const OVERSCALE = 1.15;

/** Rays per profile. 360 keeps coverage within a fraction of a percent. */
const RAYS = 360;

export interface FloodGeometry {
  /** Anchor (where the shape grows from) in output pixels. Must be inside the frame. */
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** A closed outline in any unit, around (0, 0): [[x, y], ...], no repeated last point. */
export type Outline = ReadonlyArray<readonly [number, number]>;

/** The outline's distance from (0, 0) along each of RAYS evenly spaced directions. */
export type Profile = ReadonlyArray<number>;

const angle = (i: number) => (2 * Math.PI * i) / RAYS;

/** A regular polygon standing in for a circle of radius 1: the fallback shape. */
export function discOutline(sides = 96): Outline {
  return Array.from({ length: sides }, (_, i) => [Math.cos((2 * Math.PI * i) / sides), Math.sin((2 * Math.PI * i) / sides)] as const);
}

/**
 * Casts a ray from (0, 0) in every direction and records where it leaves the
 * outline. Throws when a ray crosses the outline more or less than once: the
 * anchor is outside the shape, or the shape folds back on itself around it
 * (a crescent, a ring). Move the anchor inside, or simplify the silhouette.
 */
export function floodProfile(outline: Outline): Profile {
  if (outline.length < 3) throw new Error("flood outline needs at least 3 points");
  return Array.from({ length: RAYS }, (_, i) => {
    const dx = Math.cos(angle(i));
    const dy = Math.sin(angle(i));
    const hits: number[] = [];
    for (let k = 0; k < outline.length; k++) {
      const [ax, ay] = outline[k];
      const [bx, by] = outline[(k + 1) % outline.length];
      const ex = bx - ax;
      const ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue; // ray parallel to this edge
      const t = (ax * ey - ay * ex) / den; // distance along the ray
      const u = (ax * dy - ay * dx) / den; // position along the edge, 0..1
      if (t > 1e-9 && u >= -1e-9 && u < 1 - 1e-9) hits.push(t);
    }
    const distinct = hits.sort((a, b) => a - b).filter((t, j, all) => j === 0 || t - all[j - 1] > 1e-7);
    if (distinct.length !== 1) {
      throw new Error(`flood outline must contain (0, 0) and be star-shaped around it; the ray at ${Math.round((angle(i) * 180) / Math.PI)} degrees crosses it ${distinct.length} times`);
    }
    return distinct[0];
  });
}

/** Distance from the anchor to the frame edge along each ray. */
function frameProfile({ cx, cy, width, height }: FloodGeometry): number[] {
  if (cx < 0 || cx > width || cy < 0 || cy > height) throw new Error("flood anchor must be inside the frame");
  return Array.from({ length: RAYS }, (_, i) => {
    const dx = Math.cos(angle(i));
    const dy = Math.sin(angle(i));
    const tx = dx > 1e-12 ? (width - cx) / dx : dx < -1e-12 ? -cx / dx : Infinity;
    const ty = dy > 1e-12 ? (height - cy) / dy : dy < -1e-12 ? -cy / dy : Infinity;
    return Math.min(tx, ty);
  });
}

/** Share of the frame (0..1) the shape covers at `scale`: sum over rays of the visible wedge. */
export function visibleCoverage(scale: number, geo: FloodGeometry, profile: Profile): number {
  if (scale <= 0) return 0;
  const edge = frameProfile(geo);
  const dTheta = (2 * Math.PI) / RAYS;
  let area = 0;
  for (let i = 0; i < RAYS; i++) {
    const r = Math.min(scale * profile[i], edge[i]);
    area += 0.5 * r * r * dTheta;
  }
  return Math.min(1, area / (geo.width * geo.height));
}

/** The scale at which the shape covers the whole frame, times OVERSCALE. */
export function floodReach(geo: FloodGeometry, profile: Profile): number {
  const edge = frameProfile(geo);
  let full = 0;
  for (let i = 0; i < RAYS; i++) full = Math.max(full, edge[i] / profile[i]);
  return full * OVERSCALE;
}

/** The scale whose visible coverage is `target` (bisection; coverage only grows with scale). */
function scaleForCoverage(target: number, geo: FloodGeometry, profile: Profile): number {
  const reach = floodReach(geo, profile);
  if (target >= 1) return reach;
  if (target <= 0) return 0;
  let lo = 0;
  let hi = reach;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (visibleCoverage(mid, geo, profile) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Scale at local frame `f` of the flood's own 2 * FLOOD_FRAMES window; the cut
 * sits at f = FLOOD_FRAMES. Edge to edge on both frames either side of it.
 */
export function floodScale(f: number, geo: FloodGeometry, profile: Profile): number {
  if (f < 0 || f >= 2 * FLOOD_FRAMES) return 0;
  const coverage = f < FLOOD_FRAMES ? easeInOutSine((f + 1) / FLOOD_FRAMES) : 1 - easeInOutSine((f - FLOOD_FRAMES) / FLOOD_FRAMES);
  return scaleForCoverage(coverage, geo, profile);
}
