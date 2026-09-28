import { describe, expect, it } from "vitest";
import { type Boundary, checkTransitions, declaredCuts } from "./transitions";

const promo = { motifTurnsPerFifteenSeconds: 1, closeTurn: true };
const fps = 30;
const clip = (seconds: number, boundaries: Boundary[], posterFrame = 60, captionEntrances?: Array<[number, number]>) => ({
  durationInFrames: seconds * fps,
  fps,
  boundaries,
  posterFrame,
  captionEntrances,
});

describe("transitions", () => {
  it("refuses a flood on every boundary (six floods in 30 s)", () => {
    const floods: Boundary[] = [105, 255, 330, 465, 615, 780].map((frame) => ({ frame, kind: "flood" }));
    const problems = checkTransitions(clip(30, floods), promo);
    expect(problems.filter((p) => /give it reason/.test(p))).toHaveLength(6);
    expect(problems.filter((p) => /never out of empty space/.test(p))).toHaveLength(6);
  });

  it("refuses more turns than the budget, even with reasons", () => {
    const turns: Boundary[] = [150, 300, 450].map((frame) => ({ frame, kind: "flood", reason: "turn", fromMotifOnScreen: true }));
    expect(checkTransitions(clip(30, turns), promo).join("\n")).toMatch(/3 motif turns in 30\.0 s; the budget is 2/);
    expect(checkTransitions(clip(15, turns.slice(0, 2)), promo).join("\n")).toMatch(/budget is 1/);
  });

  it("passes cuts on the beat, one turn and the close", () => {
    const plan: Boundary[] = [
      { frame: 135, kind: "push", reason: "turn" },
      { frame: 330, kind: "cut" },
      { frame: 465, kind: "match" },
      { frame: 615, kind: "cut" },
      { frame: 780, kind: "flood", reason: "close", fromMotifOnScreen: true },
    ];
    expect(checkTransitions(clip(30, plan, 700), promo)).toEqual([]);
    expect(declaredCuts(plan)).toEqual([330, 465, 615]);
  });

  it("gives every film at least one turn, and at most one close", () => {
    expect(checkTransitions(clip(10, [{ frame: 120, kind: "flood", reason: "turn", fromMotifOnScreen: true }]), promo)).toEqual([]);
    const twoCloses: Boundary[] = [
      { frame: 300, kind: "flood", reason: "close", fromMotifOnScreen: true },
      { frame: 600, kind: "flood", reason: "close", fromMotifOnScreen: true },
    ];
    expect(checkTransitions(clip(30, twoCloses, 60), promo).join("\n")).toMatch(/2 motif turns marked "close"/);
  });

  it("never takes the cover from inside a transition or a caption's entrance", () => {
    const flood: Boundary[] = [{ frame: 780, kind: "flood", reason: "close", fromMotifOnScreen: true }];
    expect(checkTransitions(clip(30, flood, 782), promo).join("\n")).toMatch(/poster frame 782 sits inside the flood at frame 780/);
    expect(checkTransitions(clip(30, flood, 700, [[690, 710]]), promo).join("\n")).toMatch(/inside a caption's entrance/);
    expect(checkTransitions(clip(30, [{ frame: 300, kind: "cut" }], 300), promo)).toEqual([]);
    expect(checkTransitions(clip(30, [], 900), promo).join("\n")).toMatch(/outside the clip/);
  });
});
