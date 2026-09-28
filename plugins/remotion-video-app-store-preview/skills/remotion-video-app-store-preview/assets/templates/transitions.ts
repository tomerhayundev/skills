/**
 * Transitions: which boundary gets which transition, checked before anything renders.
 * Drop into src/transitions.ts. expand() calls checkTransitions() for every clip and
 * throws on any problem; the chain layout writes declaredCuts() to out/<id>.cuts.json,
 * which frame-pops.mjs --cuts reads.
 *
 * Every boundary is a cut on the beat unless its chain entry says otherwise. A motif
 * turn (a flood, or a push through the real object) is reserved for the turn (problem to
 * solution) and the close: at most `motifTurnsPerFifteenSeconds` per 15 s of film, plus
 * one at the close. A promo whose engine flooded every boundary put flat color over a
 * third of its 30 s; this is the check that stops it.
 */

export type TransitionKind = "cut" | "match" | "shared" | "morph" | "push" | "flood";

export interface Boundary {
  /** The frame the incoming shot starts on, in clip frames. */
  frame: number;
  kind: TransitionKind;
  /** Why a motif turn is here. A tutorial's chapter boundaries are step markers, not turns. */
  reason?: "turn" | "close" | "chapter";
  /** A flood grows out of the motif where it already is on screen, never out of empty space. */
  fromMotifOnScreen?: boolean;
  /** Frames the transition takes on each side of `frame`. Defaults per kind (a flood: 9 at 30 fps). */
  halfWindow?: number;
}

export interface TransitionRules {
  /** Motif turns allowed per 15 s of film (at least one in any film). */
  motifTurnsPerFifteenSeconds: number;
  /** Whether one more motif turn may carry the close. */
  closeTurn: boolean;
}

export interface ClipPlan {
  durationInFrames: number;
  fps: number;
  boundaries: Boundary[];
  posterFrame: number;
  /** [from, to] frames of each caption's entrance, until its words have landed. */
  captionEntrances?: Array<[number, number]>;
}

const MOTIF_TURNS: TransitionKind[] = ["push", "flood"];
const HALF_WINDOW: Record<TransitionKind, number> = { cut: 0, match: 0, shared: 15, morph: 15, push: 12, flood: 9 };

/** Every problem with the clip's transitions and poster frame; empty when it is sound. */
export function checkTransitions(plan: ClipPlan, rules: TransitionRules): string[] {
  const problems: string[] = [];
  const seconds = plan.durationInFrames / plan.fps;
  const turns = plan.boundaries.filter((b) => MOTIF_TURNS.includes(b.kind));

  for (const b of turns) {
    if (b.reason !== "turn" && b.reason !== "close") {
      problems.push(`frame ${b.frame}: a ${b.kind} is a motif turn; give it reason "turn" or "close", or make it a cut on the beat`);
    }
    if (b.kind === "flood" && !b.fromMotifOnScreen) {
      problems.push(`frame ${b.frame}: a flood grows out of the motif where it already is on screen (fromMotifOnScreen), never out of empty space`);
    }
  }

  const budget = Math.max(1, Math.floor((seconds / 15) * rules.motifTurnsPerFifteenSeconds));
  const turnCount = turns.filter((b) => b.reason === "turn").length;
  if (turnCount > budget) {
    problems.push(`${turnCount} motif turns in ${seconds.toFixed(1)} s; the budget is ${budget} (${rules.motifTurnsPerFifteenSeconds} per 15 s) plus the close. Make the others cuts on the beat or match cuts`);
  }
  const closes = turns.filter((b) => b.reason === "close").length;
  if (closes > (rules.closeTurn ? 1 : 0)) problems.push(`${closes} motif turns marked "close"; a film has at most ${rules.closeTurn ? "one" : "none"}`);

  const { posterFrame: p } = plan;
  if (p < 0 || p >= plan.durationInFrames) problems.push(`poster frame ${p} is outside the clip`);
  for (const b of plan.boundaries) {
    const half = b.halfWindow ?? HALF_WINDOW[b.kind];
    if (half > 0 && p >= b.frame - half && p <= b.frame + half) {
      problems.push(`poster frame ${p} sits inside the ${b.kind} at frame ${b.frame}; the cover is a settled frame of the product and the promise`);
    }
  }
  for (const [from, to] of plan.captionEntrances ?? []) {
    if (p >= from && p <= to) problems.push(`poster frame ${p} sits inside a caption's entrance (${from}-${to}); pick a frame where the words have landed`);
  }
  return problems;
}

/** The frames of every declared cut, for out/<id>.cuts.json and frame-pops.mjs --cuts. */
export function declaredCuts(boundaries: Boundary[]): number[] {
  return boundaries.filter((b) => b.kind === "cut" || b.kind === "match").map((b) => b.frame);
}
