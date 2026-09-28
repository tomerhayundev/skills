import { describe, expect, it } from "vitest";
import { FLOOD_FRAMES, type FloodGeometry, type Outline, discOutline, floodProfile, floodReach, floodScale, visibleCoverage } from "./flood";

// Motif-style outlines around the point they grow from (y points down, as on screen).
const page: Outline = [[-0.4, -0.5], [0.25, -0.5], [0.4, -0.35], [0.4, 0.5], [-0.4, 0.5]]; // folded corner
const drop: Outline = [
  [0, -1.2],
  ...Array.from({ length: 41 }, (_, k) => {
    const t = ((-30 + (240 * k) / 40) * Math.PI) / 180;
    return [0.6 * Math.cos(t), 0.2 + 0.6 * Math.sin(t)] as const;
  }),
];
const bubble: Outline = [[-0.6, -0.4], [0.6, -0.4], [0.6, 0.3], [-0.1, 0.3], [-0.35, 0.6], [-0.3, 0.3], [-0.6, 0.3]]; // with a tail
const shapes = { disc: discOutline(), page, drop, bubble };

const frames: Record<string, FloodGeometry> = {
  "wide, anchor above centre": { cx: 960, cy: 400, width: 1920, height: 1080 },
  "tall, anchor near a corner": { cx: 150, cy: 1700, width: 1080, height: 1920 },
  "square, centred": { cx: 540, cy: 540, width: 1080, height: 1080 },
};

describe("flood", () => {
  for (const [shapeName, outline] of Object.entries(shapes)) {
    const profile = floodProfile(outline);
    for (const [frameName, geo] of Object.entries(frames)) {
      const cover = (f: number) => visibleCoverage(floodScale(f, geo, profile), geo, profile);

      describe(`${shapeName}, ${frameName}`, () => {
        it("covers the frame on both frames around the cut", () => {
          expect(cover(FLOOD_FRAMES - 1)).toBeGreaterThan(0.999);
          expect(cover(FLOOD_FRAMES)).toBeGreaterThan(0.999);
        });

        it("is nothing outside its window", () => {
          expect(floodScale(-1, geo, profile)).toBe(0);
          expect(floodScale(2 * FLOOD_FRAMES, geo, profile)).toBe(0);
        });

        it("grows, then shrinks, never changing more than a fifth of the frame in one frame", () => {
          for (let f = 0; f <= 2 * FLOOD_FRAMES; f++) {
            const step = cover(f) - cover(f - 1);
            expect(Math.abs(step), `frame ${f}`).toBeLessThanOrEqual(0.2);
            if (f < FLOOD_FRAMES) expect(step, `frame ${f} grows`).toBeGreaterThanOrEqual(-1e-9);
            if (f > FLOOD_FRAMES) expect(step, `frame ${f} shrinks`).toBeLessThanOrEqual(1e-9);
          }
        });
      });
    }
  }

  it("matches pi r^2 for the disc while it is inside the frame", () => {
    const geo = frames["wide, anchor above centre"];
    expect(visibleCoverage(200, geo, floodProfile(discOutline()))).toBeCloseTo((Math.PI * 200 * 200) / (1920 * 1080), 3);
  });

  it("matches the exact area of a square while it is inside the frame", () => {
    const geo = frames["square, centred"];
    const square: Outline = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    expect(visibleCoverage(100, geo, floodProfile(square))).toBeCloseTo((200 * 200) / (1080 * 1080), 3);
  });

  it("reaches past full cover", () => {
    const geo = frames["tall, anchor near a corner"];
    const profile = floodProfile(page);
    expect(visibleCoverage(floodReach(geo, profile) / 1.15, geo, profile)).toBeGreaterThan(0.999);
  });

  it("rejects an outline that does not contain its anchor", () => {
    expect(() => floodProfile([[2, 2], [3, 2], [3, 3], [2, 3]])).toThrow(/contain \(0, 0\)/);
  });

  it("rejects an outline that folds back around its anchor (a crescent)", () => {
    const outer = Array.from({ length: 48 }, (_, k) => {
      const t = ((-150 + (300 * k) / 47) * Math.PI) / 180;
      return [Math.cos(t), Math.sin(t)] as const;
    });
    const inner = Array.from({ length: 48 }, (_, k) => {
      const t = ((150 - (300 * k) / 47) * Math.PI) / 180;
      return [0.35 + 0.8 * Math.cos(t), 0.8 * Math.sin(t)] as const;
    });
    expect(() => floodProfile([...outer, ...inner])).toThrow(/star-shaped/);
  });

  it("grows out of a visible motif and settles into a visible mark", () => {
    const geo = frames["wide, anchor above centre"];
    const profile = floodProfile(page);
    const ends = { fromScale: 120, toScale: 80 };
    const cover = (f: number) => visibleCoverage(floodScale(f, geo, profile, ends), geo, profile);
    expect(floodScale(0, geo, profile, ends)).toBeGreaterThan(120); // never smaller than where it started
    expect(cover(FLOOD_FRAMES - 1)).toBeGreaterThan(0.999);
    expect(cover(FLOOD_FRAMES)).toBeGreaterThan(0.999);
    const last = floodScale(2 * FLOOD_FRAMES - 1, geo, profile, ends);
    expect(last).toBeCloseTo(80, 0); // the mark takes over at the next frame without a jump
    for (let f = 1; f < 2 * FLOOD_FRAMES; f++) expect(Math.abs(cover(f) - cover(f - 1)), `frame ${f}`).toBeLessThanOrEqual(0.2);
  });

  it("rejects an anchor outside the frame", () => {
    expect(() => visibleCoverage(10, { cx: -5, cy: 10, width: 100, height: 100 }, floodProfile(page))).toThrow(/inside the frame/);
  });
});
