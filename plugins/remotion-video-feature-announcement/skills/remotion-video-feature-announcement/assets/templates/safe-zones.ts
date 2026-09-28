/**
 * Platform safe zones: the part of the frame a platform's own UI (captions,
 * buttons, the account name) never covers. Drop into src/safe-zones.ts and use it
 * in the containment tests: every text rect inside safeRectFor(the platforms the
 * brief ships this aspect to).
 *
 * Values mirror assets/specs.json (verified 2026-09-28); keep the two in step.
 * Fractions scale with the frame; "px@1080x1920" values scale from that size.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Zone {
  unit: "fraction" | "px@1080x1920";
  top: number;
  bottom: number;
  left: number;
  right: number;
  unverified?: boolean;
}

export const SAFE_ZONES = {
  meta: { unit: "fraction", top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 },
  pinterest: { unit: "px@1080x1920", top: 270, bottom: 790, left: 65, right: 195 },
  shorts: { unit: "px@1080x1920", top: 380, bottom: 450, left: 0, right: 150, unverified: true },
  tiktok: { unit: "fraction", top: 0.12, bottom: 0.3, left: 0.06, right: 0.12, unverified: true },
  /** Title-safe plus the player's control bar; YouTube publishes no zone. */
  youtube: { unit: "fraction", top: 0.05, bottom: 0.12, left: 0.05, right: 0.05, unverified: true },
  /** The default for any platform that publishes no zone (landing pages, LinkedIn, X). */
  titleSafe: { unit: "fraction", top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
} satisfies Record<string, Zone>;

export type ZoneName = keyof typeof SAFE_ZONES;

/** The rect a zone leaves free in a width x height frame. */
export function safeRect(zone: Zone, width: number, height: number): Rect {
  const sx = zone.unit === "fraction" ? width : width / 1080;
  const sy = zone.unit === "fraction" ? height : height / 1920;
  const left = zone.left * sx;
  const top = zone.top * sy;
  return { x: left, y: top, width: width - left - zone.right * sx, height: height - top - zone.bottom * sy };
}

/** The rect safe on every listed platform at once (one tall master for Reels, Shorts and TikTok). */
export function safeRectFor(zones: ZoneName[], width: number, height: number): Rect {
  let r: Rect = { x: 0, y: 0, width, height };
  for (const name of zones) {
    const s = safeRect(SAFE_ZONES[name], width, height);
    const x = Math.max(r.x, s.x);
    const y = Math.max(r.y, s.y);
    r = { x, y, width: Math.min(r.x + r.width, s.x + s.width) - x, height: Math.min(r.y + r.height, s.y + s.height) - y };
  }
  return r;
}

export function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}
