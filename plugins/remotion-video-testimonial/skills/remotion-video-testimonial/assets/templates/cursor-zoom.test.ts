import { describe, expect, it } from "vitest";
import { type ZoomKey, quintic, zoomAt } from "./cursor-zoom";

const g = { frameWidth: 1920, frameHeight: 1080, srcWidth: 1920, srcHeight: 1080 };

/** Largest third difference of where a recording point lands on screen, in px per frame^3. */
function maxJerk(keys: ZoomKey[], from: number, to: number, point = { x: 1500, y: 300 }): number {
  const screen = (f: number) => {
    const c = zoomAt(f, keys, g);
    return { x: c.tx + point.x * c.scale, y: c.ty + point.y * c.scale };
  };
  let max = 0;
  for (let f = from; f <= to; f++) {
    const [a, b, c, d] = [screen(f - 3), screen(f - 2), screen(f - 1), screen(f)];
    const jx = d.x - 3 * c.x + 3 * b.x - a.x;
    const jy = d.y - 3 * c.y + 3 * b.y - a.y;
    max = Math.max(max, Math.hypot(jx, jy));
  }
  return max;
}

describe("cursor zoom", () => {
  it("eases with zero velocity at both ends", () => {
    expect(quintic(0)).toBe(0);
    expect(quintic(1)).toBe(1);
    expect(quintic(0.001) - quintic(0)).toBeLessThan(1e-7);
  });

  it("shows the whole recording at scale 1", () => {
    expect(zoomAt(0, [{ frame: 0, x: 960, y: 540, scale: 1 }], g)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it("puts the focus point in the frame's center when zoomed in", () => {
    const c = zoomAt(0, [{ frame: 0, x: 1200, y: 500, scale: 2 }], g);
    expect(c.tx + 1200 * c.scale).toBeCloseTo(960);
    expect(c.ty + 500 * c.scale).toBeCloseTo(540);
  });

  it("never shows past the recording's edges", () => {
    const c = zoomAt(0, [{ frame: 0, x: 1900, y: 20, scale: 2 }], g);
    expect(c.tx).toBeGreaterThanOrEqual(-1920 * c.scale + 1920 - 1e-9);
    expect(c.ty).toBeLessThanOrEqual(0);
  });

  it("covers a frame of a different aspect", () => {
    const tall = { frameWidth: 1080, frameHeight: 1920, srcWidth: 1920, srcHeight: 1080 };
    const c = zoomAt(0, [{ frame: 0, x: 960, y: 540, scale: 1 }], tall);
    expect(1080 * c.scale).toBeGreaterThanOrEqual(1920);
  });

  it("a 1.5 s zoom stays under the base's camera jerk limit", () => {
    const keys = [
      { frame: 0, x: 960, y: 540, scale: 1 },
      { frame: 45, x: 1500, y: 300, scale: 2.5 },
    ];
    expect(maxJerk(keys, 3, 60)).toBeLessThan(12);
  });

  it("a zoom onto a control at the very edge stays smooth", () => {
    const keys = [
      { frame: 0, x: 960, y: 540, scale: 1 },
      { frame: 45, x: 1910, y: 30, scale: 1.4 },
      { frame: 90, x: 1910, y: 1060, scale: 1.4 },
    ];
    expect(maxJerk(keys, 3, 100, { x: 1800, y: 100 })).toBeLessThan(12);
  });

  it("a 0.2 s zoom of the same size breaks it, which is why keyframes need room", () => {
    const keys = [
      { frame: 0, x: 960, y: 540, scale: 1 },
      { frame: 6, x: 1500, y: 300, scale: 2.5 },
    ];
    expect(maxJerk(keys, 3, 12)).toBeGreaterThan(12);
  });
});
