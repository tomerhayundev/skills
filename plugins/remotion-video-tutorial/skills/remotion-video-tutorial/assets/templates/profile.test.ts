import { describe, expect, it } from "vitest";
import { EXPLAINER, PRODUCT_DEMO, PROMO, TUTORIAL, profileFor, withOverrides } from "./profile";

describe("profile", () => {
  it("keeps the base's rules as the promo profile", () => {
    expect(PROMO.continuity).toBe("seamless");
    expect(PROMO.popsGate).toBe("strict");
    expect(PROMO.hook).toEqual({ kind: "line", deliverBySeconds: 1, holdSeconds: 2 });
    expect(PROMO.captions).toMatchObject({ perFifteenSeconds: 3, words: [4, 6], holdSeconds: 1.5, riseIntoStill: true });
    expect(PROMO.critique[0]).toBe("story and copy");
  });

  it("refuses a changed key without a reason", () => {
    expect(() => withOverrides(PROMO, { popsGate: "declared-cuts" }, {})).toThrow(/popsGate/);
    expect(() => withOverrides(PROMO, { popsGate: "declared-cuts" }, { popsGate: "  " })).toThrow(/popsGate/);
  });

  it("accepts an unchanged key without a reason", () => {
    expect(withOverrides(PROMO, { popsGate: "strict" }, {})).toEqual(PROMO);
  });

  it("lets a tutorial cut inside recordings and still hold the 1.5 s caption floor", () => {
    expect(TUTORIAL.continuity).toBe("chaptered");
    expect(TUTORIAL.popsGate).toBe("declared-cuts");
    expect(TUTORIAL.captions.holdSeconds).toBeGreaterThanOrEqual(1.5);
    expect(TUTORIAL.critique).toContain("a stranger can repeat each step");
  });

  it("never drops a base critique criterion", () => {
    for (const p of [PRODUCT_DEMO, TUTORIAL, EXPLAINER]) for (const c of PROMO.critique) expect(p.critique).toContain(c);
  });

  it("gives stubs their nearest full module's profile", () => {
    expect(profileFor("onboarding")).toBe(TUTORIAL);
    expect(profileFor("feature-announcement")).toBe(PROMO);
    expect(profileFor("social-organic")).toBe(PROMO);
    expect(() => profileFor("vlog")).toThrow(/no profile/);
  });

  it("applies a stub's own reasoned changes on top of its nearest profile", () => {
    expect(profileFor("event-recap")).toMatchObject({ continuity: "chaptered", popsGate: "declared-cuts", hook: PROMO.hook });
    expect(profileFor("testimonial")).toMatchObject({ popsGate: "declared-cuts", hook: EXPLAINER.hook });
    expect(profileFor("app-store-preview")).toMatchObject({ durations: "grid", popsGate: PRODUCT_DEMO.popsGate });
    expect(profileFor("app-store-preview").captions.mode).toBe("statements");
  });
});
