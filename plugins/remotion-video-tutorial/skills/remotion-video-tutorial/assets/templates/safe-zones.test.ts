import { describe, expect, it } from "vitest";
import { SAFE_ZONES, inside, safeRect, safeRectFor } from "./safe-zones";

describe("safe zones", () => {
  it("leaves the middle of a Reel free of Meta's UI", () => {
    const r = safeRect(SAFE_ZONES.meta, 1080, 1920);
    expect(r.x).toBeCloseTo(64.8);
    expect(r.y).toBeCloseTo(268.8);
    expect(r.width).toBeCloseTo(950.4);
    expect(r.height).toBeCloseTo(979.2); // the bottom 35% is taken
  });

  it("scales pixel zones with the frame", () => {
    const r = safeRect(SAFE_ZONES.pinterest, 540, 960);
    expect(r).toEqual({ x: 32.5, y: 135, width: 410, height: 430 });
  });

  it("intersects the zones of every platform a master ships to", () => {
    const r = safeRectFor(["meta", "pinterest"], 1080, 1920);
    expect(r.x).toBeCloseTo(65);
    expect(r.y).toBeCloseTo(270);
    expect(r.width).toBeCloseTo(820);
    expect(r.height).toBeCloseTo(860);
  });

  it("catches a caption band in the bottom third of a Reel", () => {
    const safe = safeRectFor(["meta"], 1080, 1920);
    expect(inside({ x: 90, y: 1500, width: 900, height: 160 }, safe)).toBe(false);
    expect(inside({ x: 90, y: 1060, width: 900, height: 160 }, safe)).toBe(true);
  });

  it("keeps a YouTube master's text off the player's control bar", () => {
    const r = safeRect(SAFE_ZONES.youtube, 1920, 1080);
    expect(r.y + r.height).toBeCloseTo(1080 * 0.88);
    expect(r.x).toBeCloseTo(96);
  });

  it("is the whole frame when no platform is listed", () => {
    expect(safeRectFor([], 1920, 1080)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
