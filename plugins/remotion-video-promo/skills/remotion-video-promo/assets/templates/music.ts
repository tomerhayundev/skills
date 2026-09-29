/**
 * The music bed under every non-looping clip. Drop into src/audio/music.ts.
 *
 * Pure numbers, no Remotion import: expand() imports this, and the render
 * script loads expand() under plain Node/tsx. The <Html5Audio> that plays it
 * lives in the clip component.
 *
 * Fill MUSIC from public/music/track.json, which `node get-track.mjs <id>` writes
 * for the library track the brief chose (or `fit-beat-grid.mjs <track> --json`
 * for a track from elsewhere). The values below are for the bundled track
 * (assets/music/, CC BY 4.0, see CREDITS.md); never keep them by default.
 *
 * Adapt: FPS and the grid unit come from your tokens. The grid unit must equal
 * one beat (secondsPerBeat * FPS), which music.test.ts checks.
 */
import { FPS, TRANSITION_FRAMES as GRID } from "../motion/tokens";

export const MUSIC = {
  /** Under public/, for staticFile(). */
  file: "music/ende-business-moves-1.mp3",
  durationSeconds: 163.96,
  /** Where beat 0 sits in the file (the kick's attack). */
  firstBeatSeconds: 0,
  secondsPerBeat: 0.5,
  /** Beats where a quiet section of the track gives way to a loud one. */
  liftBeats: [32, 96, 192, 256],
  /** Gain on the raw track. -0.3 dB lands this track near -16 LUFS. */
  gainDb: -0.3,
} as const;

/** Long enough that starting mid-track doesn't click. */
const FADE_IN_FRAMES = 4;
/** The bed settles out under the brand close. */
const FADE_OUT_FRAMES = 40;

export interface MusicCue {
  /** The beat of the track that plays on the clip's frame 0. */
  startBeat: number;
  /**
   * Frames of the file skipped before frame 0, for <Html5Audio trimBefore>.
   * Rendered audio lands 20 to 40 ms late from codec priming (mp3 decode, AAC
   * encode). Under one frame and not perceptible; don't compensate.
   */
  trimBefore: number;
}

/**
 * Picks where in the track a clip starts so a lift lands exactly on
 * `liftFrame`. Uses the earliest lift that works: a late lift frame needs a
 * late lift, or the track would have to start before its own beginning.
 */
export function musicCue(liftFrame: number, durationInFrames: number): MusicCue {
  if (liftFrame % GRID !== 0) {
    throw new Error(`music lift frame ${liftFrame} is off the ${GRID}-frame beat grid, so the lift would land between beats`);
  }
  const liftBeatInClip = liftFrame / GRID;
  const trackFrames = MUSIC.durationSeconds * FPS;

  for (const liftBeat of MUSIC.liftBeats) {
    const startBeat = liftBeat - liftBeatInClip;
    if (startBeat < 0) continue;
    const trimBefore = Math.round((MUSIC.firstBeatSeconds + startBeat * MUSIC.secondsPerBeat) * FPS);
    if (trimBefore + durationInFrames <= trackFrames) return { startBeat, trimBefore };
  }
  throw new Error(
    `no lift in the music track can land on frame ${liftFrame} of a ${durationInFrames}-frame clip ` +
      `without running past the end of the track (${MUSIC.durationSeconds}s)`,
  );
}

/** Track gain with a short fade in and a fade out over the last FADE_OUT_FRAMES. */
export function musicVolume(frame: number, durationInFrames: number): number {
  const gain = 10 ** (MUSIC.gainDb / 20);
  const fadeIn = Math.min(1, frame / FADE_IN_FRAMES);
  const fadeOut = Math.min(1, Math.max(0, (durationInFrames - 1 - frame) / FADE_OUT_FRAMES));
  return gain * fadeIn * fadeOut;
}
