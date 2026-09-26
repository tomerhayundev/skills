import { describe, expect, it } from "vitest";
import { FLOOD_FRAMES, floodRadius, floodReach, visibleCoverage } from "./flood";

const W = 1920;
const H = 1080;
const geo = { cx: W / 2, cy: 400, width: W, height: H };
const cover = (f: number) => visibleCoverage(floodRadius(f, geo), geo);

describe("flood", () => {
  it("reaches past the farthest corner", () => {
    expect(floodReach(geo)).toBeGreaterThan(Math.hypot(W - geo.cx, H - geo.cy) * 1.1);
  });

  it("matches pi r^2 while the disc is inside the frame", () => {
    expect(visibleCoverage(200, geo)).toBeCloseTo((Math.PI * 200 * 200) / (W * H), 2);
  });

  it("covers the frame on both sides of the cut", () => {
    expect(cover(FLOOD_FRAMES - 1)).toBeCloseTo(1, 3);
    expect(cover(FLOOD_FRAMES)).toBeCloseTo(1, 3);
  });

  it("is nothing outside its window", () => {
    expect(floodRadius(-1, geo)).toBe(0);
    expect(floodRadius(2 * FLOOD_FRAMES, geo)).toBe(0);
  });

  it("never changes more than a fifth of the frame in one frame", () => {
    for (let f = 0; f <= 2 * FLOOD_FRAMES; f++) expect(Math.abs(cover(f) - cover(f - 1)), `frame ${f}`).toBeLessThanOrEqual(0.2);
  });
});
