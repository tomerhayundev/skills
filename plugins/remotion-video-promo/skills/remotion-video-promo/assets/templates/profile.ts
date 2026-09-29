/**
 * Format profiles: the rules a format sets for the shared engine. Drop into
 * src/profile.ts; expand() reads the manifest's `format` and enforces these.
 *
 * The promo profile is the engine's base rules exactly (remotion-video-pipeline's method). Another format
 * changes a key only with a written reason (withOverrides throws otherwise), so
 * a module can never quietly lower the bar.
 */

export interface FormatProfile {
  /** seamless: no unmotivated cut; every boundary is a declared beat cut, a match cut, a shared element or a motif turn. chaptered: steps are chapters marked by the motif's step markers, and hard cuts are allowed inside recordings. */
  continuity: "seamless" | "chaptered";
  /** strict: frame-pops.mjs fails any pop. declared-cuts: pops pass only at cuts listed in out/<id>.cuts.json. */
  popsGate: "strict" | "declared-cuts";
  /** Motif turns (a flood or a push through the real object) per 15 s, plus one at the close; every other boundary is a cut, a match cut or a shared element (transitions.ts). */
  transitions: { motifTurnsPerFifteenSeconds: number; closeTurn: boolean };
  /** What lands in the first seconds, by when, and how long a hook line holds whole. */
  hook: { kind: "line" | "outcome" | "problem"; deliverBySeconds: number; holdSeconds?: number };
  captions: {
    /** statements: short captions rising into a still picture. subtitles: word-synced lines of the voice. */
    mode: "statements" | "subtitles+titles" | "subtitles+statements";
    perFifteenSeconds?: number;
    words?: [number, number];
    holdSeconds: number;
    riseIntoStill: boolean;
    maxLines?: number;
  };
  /** underVoiceDb: how far a bed sits under a voice. With no voice, a tutorial or onboarding bed sits at about -24 to -20 LUFS so it never competes with reading; every other format with no voice is music-led at about -16 LUFS. */
  music: { mode: "bed-with-lift" | "bed-under-voice" | "bed-under-voice-or-none"; underVoiceDb?: [number, number] };
  /** grid: manifest durations on the grid. words: scenes sized from the words (the voiceover's audio, or reading time when caption-led), rounded up to the grid. */
  durations: "grid" | "words";
  shortCut: string;
  critique: string[];
}

/** "story and copy" first: the message, the script and the words decide whether a video works. */
const BASE_CRITIQUE = [
  "story and copy",
  "hook",
  "phone readability",
  "motion",
  "variety",
  "composition",
  "motif and brand",
  "the brand's look",
  "transitions: hierarchy and dose",
  "graphics belong to the picture",
  "cover",
  "sound",
];

export const PROMO: FormatProfile = {
  continuity: "seamless",
  popsGate: "declared-cuts",
  transitions: { motifTurnsPerFifteenSeconds: 1, closeTurn: true },
  hook: { kind: "line", deliverBySeconds: 1, holdSeconds: 2 },
  captions: { mode: "statements", perFifteenSeconds: 3, words: [4, 6], holdSeconds: 1.5, riseIntoStill: true },
  music: { mode: "bed-with-lift" },
  durations: "grid",
  shortCut: "fewer ideas at the long cut's pace",
  critique: BASE_CRITIQUE,
};

export type Reasons = Partial<Record<keyof FormatProfile, string>>;

/** A profile derived from `base`; every key that differs must carry a reason. */
export function withOverrides(base: FormatProfile, overrides: Partial<FormatProfile>, reasons: Reasons): FormatProfile {
  for (const key of Object.keys(overrides) as (keyof FormatProfile)[]) {
    const changed = JSON.stringify(overrides[key]) !== JSON.stringify(base[key]);
    if (changed && !reasons[key]?.trim()) throw new Error(`profile key "${key}" differs from the base without a reason`);
  }
  return { ...base, ...overrides };
}

export const PRODUCT_DEMO = withOverrides(
  PROMO,
  {
    hook: { kind: "outcome", deliverBySeconds: 3 },
    captions: { mode: "subtitles+titles", holdSeconds: 1.5, riseIntoStill: false, maxLines: 2 },
    music: { mode: "bed-under-voice", underVoiceDb: [18, 22] },
    durations: "words",
    shortCut: "drops features, keeps the pace",
    critique: [...BASE_CRITIQUE, "each feature lands"],
  },
  {
    hook: "a demo earns attention with the outcome, not a slogan",
    captions: "a voiced demo is subtitled; feature titles still follow the statement rules",
    music: "the voice carries the demo",
    durations: "the words set the pace: the voice, or reading time when caption-led",
    shortCut: "a shorter demo shows fewer features",
    critique: "every feature shown must be understood",
  },
);

export const TUTORIAL = withOverrides(
  PRODUCT_DEMO,
  {
    continuity: "chaptered",
    hook: { kind: "outcome", deliverBySeconds: 3 },
    music: { mode: "bed-under-voice-or-none", underVoiceDb: [18, 22] },
    shortCut: "a teaser that points to the full video",
    critique: [...BASE_CRITIQUE, "a stranger can repeat each step", "words and action within 0.3 s"],
  },
  {
    continuity: "steps are chapters; hard cuts inside a recording keep it honest and short",
    hook: "show the finished result and how long it takes in the first 3 s",
    music: "instruction is easier to follow with little or no music",
    shortCut: "a tutorial cannot lose steps; its short version sells the full one",
    critique: "the test of a tutorial is whether someone can follow it",
  },
);

export const EXPLAINER = withOverrides(
  PROMO,
  {
    hook: { kind: "problem", deliverBySeconds: 3 },
    captions: { mode: "subtitles+statements", holdSeconds: 1.5, riseIntoStill: true, maxLines: 2 },
    music: { mode: "bed-under-voice", underVoiceDb: [18, 22] },
    durations: "words",
    shortCut: "drops sub-points, keeps the argument",
    critique: [...BASE_CRITIQUE, "one-sentence recall"],
  },
  {
    hook: "an explainer opens on the problem the viewer has",
    captions: "voiced, so subtitled; key terms get statement captions",
    music: "the voice carries the argument",
    durations: "the words set the pace: the voice, or reading time when caption-led",
    shortCut: "a shorter explainer keeps the one idea",
    critique: "a viewer should repeat the idea in one sentence",
  },
);

export const PROFILES: Record<string, FormatProfile> = {
  promo: PROMO,
  "product-demo": PRODUCT_DEMO,
  tutorial: TUTORIAL,
  explainer: EXPLAINER,
};

/** Stub modules use their nearest full module's profile. */
export const NEAREST: Record<string, keyof typeof PROFILES> = {
  "feature-announcement": "promo",
  "social-organic": "promo",
  "event-recap": "promo",
  "app-store-preview": "product-demo",
  onboarding: "tutorial",
  testimonial: "explainer",
};

/** Stubs whose module text changes a key of their nearest profile, each with its reason. */
export const STUB_PROFILES: Record<string, FormatProfile> = {
  "event-recap": withOverrides(
    PROMO,
    { continuity: "chaptered" },
    {
      continuity: "real footage cuts; motif transitions between sections, beat cuts inside them",
    },
  ),
  testimonial: withOverrides(
    EXPLAINER,
    { continuity: "chaptered" },
    {
      continuity: "an interview is edited speech",
    },
  ),
  "app-store-preview": withOverrides(
    PRODUCT_DEMO,
    { durations: "grid", captions: { mode: "statements", perFifteenSeconds: 3, words: [4, 6], holdSeconds: 1.5, riseIntoStill: true } },
    {
      durations: "the store's hard 15-30 s limit sets the length, not the words",
      captions: "it autoplays muted in the store, so it is caption-led",
    },
  ),
};

export function profileFor(module: string): FormatProfile {
  const profile = STUB_PROFILES[module] ?? PROFILES[module] ?? PROFILES[NEAREST[module]];
  if (!profile) throw new Error(`no profile for module "${module}"`);
  return profile;
}
