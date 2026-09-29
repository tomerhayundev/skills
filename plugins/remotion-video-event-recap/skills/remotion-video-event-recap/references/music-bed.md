# Music bed

Adding music to a Remotion pipeline so every cut lands on a beat and the track's
biggest moment lands on the story's payoff. Proven on a real promo system: a
hand-mixed version was approved by ear, then the pipeline reproduced it at 0.999
correlation, the same loudness, and a 29 ms (sub-frame) offset.

## 1. Choose the track

**Start from the brand, never from the last film.** When one track was bundled and nothing asked for
a choice, every film came out with the same upbeat corporate track, whatever the brand. The brand read's
Look row ([brand-read](brand-read.md)) sets the timbre: calm and organic, warm, minimal and elegant,
cinematic, kinetic, confident, playful or driving. It never sets the energy of the opening: a quiet
piano chosen for a minimal brand, played from its intro, left a Reel with no beat for 17 s, and the owner
only knew which track they wanted once they heard the options. Then:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/get-track.mjs --list            # the library, by mood, with tempo and length
node ${CLAUDE_SKILL_DIR}/scripts/get-track.mjs <id> [--dir=public/music]
```

`get-track.mjs <id>` copies or downloads the track into the project, checks it against the library's
checksum, and writes `track.json` (its fitted grid: bpm, beat 0, lifts, `feedStartSeconds`) and
`CREDITS.md` beside it. The tokens take the grid from `track.json` (architecture, Tokens). Name the
track and why it fits in the brief (`music.why`), and offer two alternatives of a different energy
(`music.alternatives`); the brief page plays 15 s of each from where the film would start it
(`startSeconds`), so the user chooses by ear before the build. **In a feed** (Reels, TikTok, Shorts,
Stories) the film starts the track at its `feedStartSeconds`, where the beat already plays, and
`musicCue(liftFrame, duration, MUSIC.feedStartBeat)` picks a later lift for the payoff. A track the user brings, or one found elsewhere, follows the rules below and is fitted with
`fit-beat-grid.mjs`.

**Tempo must fit the frame grid.** Frames per beat = `fps * 60 / bpm`. Pick a
tempo where that is a whole number, then make the pipeline's grid unit one beat
(or two). Then every scene duration, and so every cut, is on a beat for free.

| fps | Whole-frame tempos (BPM) |
| --- | --- |
| 30 | 60 (30f), 72 (25f), 75 (24f), 90 (20f), 94.74 (19f), 100 (18f), 112.5 (16f), 120 (15f), 128.57 (14f), 150 (12f) |
| 25 | 60 (25f), 75 (20f), 100 (15f), 125 (12f), 150 (10f) |
| 60 | 60 (60f), 72 (50f), 90 (40f), 100 (36f), 120 (30f), 144 (25f) |

Any `fps * 60 / n` works, fractions included (112.5 BPM is 16 frames). A near miss drifts: a
114 BPM track at 30fps is 15.79 frames per beat, so a cut drifts ~0.21 frames per beat, a full
frame every 5 beats. Most real tracks are near misses (six of nine vetted ones were), so stretch
them, pitch kept, to the nearest whole-frame tempo when that is under 2.5%
(`ffmpeg -i in.mp3 -af atempo=<target/source> out.mp3`, then fit again): no one hears 2%, and
every cut lands. The library stores such tracks with their `sourceBpm`, and `get-track.mjs`
stretches them on download.

**Tempo sets the feel** (a production studio's rule of thumb): 60 to 80 BPM reads
regal and cinematic, 90 to 110 smooth and effortless, 115 to 123 kinetic and
premium, faster is hype that fits some products and wrecks others.

**License.** Needed: commercial use, paid ads, social, and no YouTube Content ID
(or every upload gets claimed).
- ende.app (Sascha Ende): everything CC BY 4.0, commercial and ads allowed, no
  Content ID. The bundled track is from there.
- Kenney.nl sound effects: CC0.
- Keep a `CREDITS.md` next to the file and put the credit line in YouTube
  descriptions; CC BY asks for attribution even when the author says it's optional.

## 2. Fit the grid

```bash
node ${CLAUDE_SKILL_DIR}/scripts/fit-beat-grid.mjs public/music/track.mp3 [--bpm=120] [--section=32] [--fps=30]
```

It prints the tempo, seconds per beat, where beat 0 sits in the file, whether the
tempo fits the frame grid, and integrated loudness per section with lifts marked:

```
tempo 120 BPM, 0.5s per beat, beat 0 at 0s
15 frames per beat at 30fps: fits a whole-frame grid
  beat    0     0.00s  -16.2 LUFS
  beat   32    16.00s  -14.7 LUFS  <- lift
  beat   64    32.00s  -15.9 LUFS
  beat   96    48.00s  -14.2 LUFS  <- lift
liftBeats: [32, 96, 192, 256]
```

How it works, and why each part exists:
- **Tempo** from autocorrelation of a three-band onset envelope (kick, body, hats),
  weighted toward 120 BPM with a one-octave prior. Broadband energy alone let a
  dotted groove fake a 4/3 tempo (146.7 instead of 110).
- **Metrical check**: the 3:4 and 2:3 relatives are refit, and the grid whose
  beats land most often on the loudest hits wins.
- **Phase** from the broadband envelope: the kick is the loudest hit and sits on
  the beat. Any single band can be ruled by off-beat hats or an off-beat bass line
  (common in house music), which locks the grid half a beat late.
- **Period and phase refined together over the whole track.** A period 1 ms off
  moves the beat a frame every 30 seconds.
- **Sections** by integrated loudness (EBU R128) per N beats. A lift is a section
  at least 1 LU louder than the one before it.

Validated on five library tracks: tempo right on all five, phase within 12 ms of
an independent beat tracker where that tracker was itself consistent. Library
tempo metadata beats any estimate: pass `--bpm` when it's stated.

## 3. The module

`assets/templates/music.ts` (with `music.test.ts`) is the drop-in version. The
essentials:

```ts
export const MUSIC = {
  file: "music/track.mp3",          // under public/, for staticFile()
  durationSeconds: 163.96,
  firstBeatSeconds: 0.0203,         // from fit-beat-grid
  secondsPerBeat: 0.5,              // 120 BPM: one beat per grid unit
  liftBeats: [32, 96, 192, 256],    // quiet section turns loud
  gainDb: -0.3,                     // match the approved mix
} as const;

/** Where in the track a clip starts so a lift lands on liftFrame. */
export function musicCue(liftFrame: number, durationInFrames: number) {
  if (liftFrame % GRID !== 0) throw new Error("lift frame off the beat grid");
  for (const liftBeat of MUSIC.liftBeats) {
    const startBeat = liftBeat - liftFrame / GRID;
    if (startBeat < 0) continue;                       // lift too early for this frame
    const trimBefore = Math.round((MUSIC.firstBeatSeconds + startBeat * MUSIC.secondsPerBeat) * FPS);
    if (trimBefore + durationInFrames <= MUSIC.durationSeconds * FPS) return { startBeat, trimBefore };
  }
  throw new Error("no lift fits: the clip would run past the end of the track");
}

export function musicVolume(frame: number, durationInFrames: number) {
  const gain = 10 ** (MUSIC.gainDb / 20);
  const fadeIn = Math.min(1, frame / 4);                                   // no click mid-track
  const fadeOut = Math.min(1, Math.max(0, (durationInFrames - 1 - frame) / 40)); // settles under the logo
  return gain * fadeIn * fadeOut;
}
```

Keep it pure (no Remotion import): `expand()` calls `musicCue()` and the render
script loads `expand()` under plain Node.

## 4. Wire it

In `expand()`, find the entry marked `musicLift`, take its real start on the
timeline (the chain layout's `Sequence.from` plus the entry's window start), and
attach `music: musicCue(liftFrame, duration)` to each composition. Loops get
`music: null`. With nothing marked, the lift lands on frame 0, so a short clip
opens on the loud section.

In the clip component, once, outside the scene Sequences:

```tsx
{spec.music ? (
  <Html5Audio src={staticFile(MUSIC.file)} trimBefore={spec.music.trimBefore}
    volume={(f) => musicVolume(f, spec.durationInFrames)} />
) : null}
```

The `volume` callback's frame counts from when the audio starts playing. Add
`public/` to the render script's watched sources so a track swap invalidates
renders. Mark the file binary in `.gitattributes`.

**Choose the lift by story.** Mark the payoff: the moment the product delivers
(a score going up, a result appearing). When a clip is longer than the first
lift allows, `musicCue` moves to a later lift; with sections every 16 s the
track's peak can land on a later beat too. Check the section map against the scene
starts and say which moments the loud sections cover.

## 5. Tests

- One beat equals one grid unit (`secondsPerBeat * FPS === GRID`).
- The lift beat plays within half a frame of the lift frame.
- A lift off the grid throws; a clip longer than the track throws.
- Volume: 0 on frame 0, full gain mid-clip, under 0.05 on the last frame,
  monotonic fade, never above gain.
- `expand()`: loops get none; unmarked opens on the first lift; two marks throw;
  a mark on a loop throws.
- Manifest: every promo cut that shows the payoff scene marks it.

## 6. Verify the render

```bash
node ${CLAUDE_SKILL_DIR}/scripts/audio-check.mjs out/promo/<id>.mp4 --reference=approved.mp4
```

- Loudness about -16 LUFS integrated, true peak under -1 dBFS. Social platforms
  normalize to about -14; much louder gets turned down, much quieter does not get
  turned up.
- The timeline should show the jump (`^`) at the lift frame's time.
- Against an approved hand mix: correlation near 1.0, offset under one frame.
  Rendered audio lands 20 to 40 ms after the frame from codec priming (mp3 decode
  plus AAC encode). That is below perception; don't compensate with a constant
  that will be wrong for the next codec.
- Then a human listens. Tests can't hear.

## Sound effects

Optional, and restraint is the whole rule. One soft impact when the logo lands, a
light tick for a card arriving: effects that match motion on screen, in the same
key and space as the music, mixed under it. Never on every beat. If a sound feels
loud, out of place, or doesn't help someone understand the product, remove it.
