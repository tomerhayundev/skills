import { describe, expect, it } from "vitest";
import { FPS, TRANSITION_FRAMES as GRID } from "../motion/tokens";
import { MUSIC, musicCue, musicVolume } from "./music";

/** Where beat `beat` of the track plays in the clip, in seconds from frame 0. */
function beatTimeInClip(beat: number, trimBefore: number): number {
  return MUSIC.firstBeatSeconds + beat * MUSIC.secondsPerBeat - trimBefore / FPS;
}

describe("MUSIC", () => {
  // The point of the track: one beat is one grid unit, so a cut on the grid
  // is a cut on the beat.
  it("has one beat per grid unit", () => {
    expect(MUSIC.secondsPerBeat * FPS).toBe(GRID);
  });
});

describe("musicCue", () => {
  it("in a feed, never starts the track before its feed start, and still lands a lift on the payoff", () => {
    const liftFrame = 4 * GRID;
    const cue = musicCue(liftFrame, 20 * GRID, MUSIC.liftBeats[0] + 1);
    expect(cue.startBeat).toBeGreaterThanOrEqual(MUSIC.liftBeats[0] + 1);
    expect(MUSIC.liftBeats).toContain(cue.startBeat + liftFrame / GRID);
  });
  it("opens on the first lift when the lift is at frame 0", () => {
    expect(musicCue(0, 10 * GRID).startBeat).toBe(MUSIC.liftBeats[0]);
  });

  it("uses a later lift when the first would need the track to start before 0s", () => {
    const lateFrame = (MUSIC.liftBeats[0] + 1) * GRID;
    const cue = musicCue(lateFrame, lateFrame + 10 * GRID);
    expect(cue.startBeat + lateFrame / GRID).toBe(MUSIC.liftBeats[1]);
  });

  it("puts the lift beat on the lift frame, to within half a frame", () => {
    for (const liftFrame of [0, 5 * GRID, 15 * GRID, 40 * GRID]) {
      const cue = musicCue(liftFrame, liftFrame + 20 * GRID);
      const liftBeat = cue.startBeat + liftFrame / GRID;
      expect(MUSIC.liftBeats).toContain(liftBeat);
      expect(Math.abs(beatTimeInClip(liftBeat, cue.trimBefore) - liftFrame / FPS)).toBeLessThanOrEqual(0.5 / FPS);
    }
  });

  it("rejects a lift frame off the grid", () => {
    expect(() => musicCue(GRID + 1, 30 * GRID)).toThrow(/grid/);
  });

  it("rejects a clip that would run past the end of the track", () => {
    expect(() => musicCue(0, Math.ceil(MUSIC.durationSeconds * FPS))).toThrow(/track/);
  });
});

describe("musicVolume", () => {
  const duration = 30 * GRID;
  const gain = 10 ** (MUSIC.gainDb / 20);

  it("starts silent so the first frame doesn't click", () => {
    expect(musicVolume(0, duration)).toBe(0);
  });

  it("sits at the track gain mid-clip", () => {
    expect(musicVolume(duration / 2, duration)).toBeCloseTo(gain, 6);
  });

  it("fades out monotonically and is silent on the last frame", () => {
    let previous = gain;
    for (let f = duration - 60; f < duration; f++) {
      const v = musicVolume(f, duration);
      expect(v).toBeLessThanOrEqual(previous);
      previous = v;
    }
    expect(musicVolume(duration - 1, duration)).toBeLessThan(0.05);
  });

  it("never exceeds the track gain", () => {
    for (let f = 0; f < duration; f++) expect(musicVolume(f, duration)).toBeLessThanOrEqual(gain);
  });
});
