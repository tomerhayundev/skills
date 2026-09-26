---
name: remotion-video-pipeline
description: Build or extend a production Remotion pipeline for product promo and marketing videos. One manifest row per clip, scenes sliced by frame range, every clip expanded to four aspect ratios and several locales (RTL included), a beat-locked music bed whose lift lands on the story's payoff, batch rendering, measured visual and audio verification, and publishing. Use when asked to make a promo video, product demo, ad cut, launch video, or social clip (Reels, TikTok, Shorts, LinkedIn, X); to add music, captions, aspect ratios, or a new language to Remotion videos; to cut a shorter or longer version; or to set up a video pipeline in a new project.
compatibility: Node 18+, ffmpeg and ffprobe on PATH, Remotion 4.x with React 18 or 19.
---

# Remotion video pipeline

A pipeline where adding a clip is a data change, not an animation job. Built and
proven on a real product (nine scenes, four aspects, two locales, ~120 renders),
then generalized here so the next project starts from the lessons, not from zero.

**The core idea: a clip is a manifest row, not new code.** A 15-second ad is a
chain of frame ranges sliced out of scenes that already exist. Writing a new scene
is the last resort.

## Decide what the ask is

1. **Does it already exist?** List compositions (`remotion compositions` or the
   project's dry-run). Often the ask is a file that is already rendered.
2. **Is it a new cut of existing footage?** Add a manifest row. Done.
3. **Is it a new product moment?** Write one new scene, register it, give it a
   focus rect and a containment test. See [architecture](references/architecture.md).
4. **No pipeline yet?** Scaffold it in this order: tokens, one scene on the square
   canvas, the registry, `expand()`, the chain `Clip`, the render script, then the
   music bed. Each step is in [architecture](references/architecture.md).

## Architecture in one screen

| Piece | Rule |
| --- | --- |
| Canvas | Author every scene on one square canvas (1920x1920). Each aspect ratio is a camera window onto it, fitted to the scene's declared focus rect. |
| Aspects | `wide` 1920x1080, `tall` 1080x1920, `square` 1080x1080, `classic` 1440x1080. Omit to get all four; name them only to exclude. |
| Scene registry | Metadata (duration, focus rects, caption key, persist rect) in a module Node can load; components in a separate map. A scene's `.tsx` must never be reachable from the render script's import path. |
| Manifest | `{ id, scenes: [{ scene, from?, to?, captionOverride?, captionTiming?, musicLift? }], aspects?, locales?, loop?, posterFrame }` |
| `expand()` | Rows x aspects x locales into compositions. Validates windows, the grid, the poster frame, and the music. Throws rather than renders something wrong. |
| Chain | Hard cut between scenes by default; a short shared-element overlap when both scenes share an element. Declared duration and rendered timeline come from one function. |
| Grid | Every duration is a multiple of one grid unit (15 frames at 30fps). It is also one beat at 120 BPM, which is what makes the music free. |
| Tokens | One source for every color, size and duration. One accent color, nothing competes with it. |

## Hard rules

| Rule | Why |
| --- | --- |
| Clip durations are multiples of the grid unit | Grain and loops seam cleanly and every cut lands on a beat. Enforce it in `expand()`. |
| A fully revealed caption holds at least 1.5s before its beat ends | The top cause of an incoherent cut. Test the arithmetic, not a screenshot. |
| Interior chain entries start at `from: 0` | Windowing an interior entry makes its Sequence mount early and overpaint the previous scene. Guard it. |
| Never loosen a containment test to make a rect fit | Move the content. Clipped chips shipped once because a test was "adjusted". |
| Fake company names next to fabricated metrics | A real employer beside an invented score fails ad review. |
| Show the real product | Render the app's real components in the video (import them), not screenshots of them. |
| Loops carry no music | A track cannot loop seamlessly inside a short loop, and in-page loops play muted anyway. |
| Load fonts explicitly and prove it | A missing font falls back to system-ui silently and still looks plausible. Keep a render test that fails on the fallback. |

## Music bed (the one layer silent pipelines miss)

Music is what makes a product video feel expensive, and it is cheap if the grid
was built for it. Full method, code and numbers: [music-bed](references/music-bed.md).

1. **Pick a track whose beat is a whole number of frames**: `fps * 60 / bpm`. At
   30fps, 120 BPM is 15 frames, 90 is 20, 100 is 18. Tempo sets the feel: 90 to
   110 smooth and cool, 115 to 123 kinetic and premium, 60 to 80 cinematic.
2. **Fit it**: `node ${CLAUDE_SKILL_DIR}/scripts/fit-beat-grid.mjs track.mp3`
   prints the exact tempo, where beat 0 sits, and the loud/quiet section map with
   its lifts. Use `--bpm=<n>` when the library states the tempo.
3. **Place the lift on the payoff**: mark one chain entry `musicLift: true` (the
   moment the product delivers, e.g. a score improving). `musicCue()` picks where
   in the track each clip starts so a quiet-to-loud lift lands on that frame.
4. **Play it**: `<Html5Audio src={staticFile(file)} trimBefore={cue.trimBefore} volume={f => musicVolume(f, duration)} />`.
   Remotion 4.0.3xx renamed `Audio` to `Html5Audio` and `startFrom` to `trimBefore`.
5. **Verify by measuring** (below), then have a human listen. Tests can't hear.

A drop-in module and its tests: `assets/templates/music.ts`, `music.test.ts`. A
vetted 120 BPM CC BY 4.0 track with its fitted grid ships in `assets/music/`.

## Look at it, then measure it

Rendering is not verification. Every silent bug in the original pipeline passed
type checks and hundreds of unit tests, and was caught only by rendering a frame and
looking: font fallback, a film grain that was a measured no-op, clipped chips,
keywords that did not match their own CV. Details: [verification](references/verification.md).

```bash
npx remotion still src/index.ts <composition-id> out/check.png --frame=120
node ${CLAUDE_SKILL_DIR}/scripts/audio-check.mjs out/promo/<id>.mp4 [--reference=approved.mp4]
```

- Read the PNG. Tile several frames per cut with ffmpeg `tile` or `xstack`.
- Per aspect: nothing clipped, caption clear of content, text legible.
- RTL locales: layout mirrored, numbers still read left to right ("89%" must not flip).
- Audio: a Remotion render always has an audio stream, so "has audio" proves
  nothing. `audio-check` flags a silent track, reports LUFS and peak, and shows
  where the lift lands. Target about -16 LUFS, peak under -1 dBFS.
- Frame 0 is the thumbnail on platforms that don't take a poster. Check it; if it
  is an empty stage, bake the poster frame in (see verification).

## Rendering and publishing

- Bundle once, then `selectComposition` + `renderMedia` per composition. H.264 CRF
  18 for masters (ad platforms re-encode), CRF 30 plus VP9 WebM under a size cap for
  in-page loops, a WebP poster from `renderStill` at `posterFrame`.
- **Render in batches** (one aspect at a time). A full unattended run has crashed
  Chromium. Make the script incremental: skip outputs newer than every source,
  and watch `src/`, `scripts/`, `public/` (the music) and any app components the
  scenes import.
- Publish to a **public media bucket separate from private user uploads**. Public
  access is usually bucket-wide, so that split is the only thing protecting user
  files. Key uploads by date so a re-cut never overwrites a clip that is live in an ad.

## Creative rules

The short version; the reasoning and sources are in [creative-rules](references/creative-rules.md).

- The first 2 seconds decide if anyone keeps watching. Plan the hook first.
- A short cut needs a narrative (build, multiply, improve, brand), not a montage.
- One shot, one idea, the key object centered, room to breathe.
- Eased motion only (one critically damped spring for everything); overlap
  transitions for continuity, hard cuts otherwise; vary the rhythm.
- Show 3 or 4 examples, never all of them: more reads as a blur.
- Sound with restraint: one music bed, at most a few effects that match the motion.
  If an effect feels loud or out of place, cut it.
- If a requested length forces dead air or an unreadable caption, say so and
  propose the length that works.

## Common mistakes

| Mistake | Reality |
| --- | --- |
| Writing a new scene for a new cut | Usually a manifest row slicing existing footage |
| A duration like 200 frames | Off the grid: breaks loops, beats and grain |
| "It rendered, so it works" | Render a still and look; measure the audio |
| Rendering everything in one run | Batch by aspect |
| Trusting a tempo estimate | Fit the grid over the whole track and check `framesPerBeat` |
| Chasing a 20 to 40 ms audio offset | That is codec priming, under one frame; leave it |
| Music under an in-page loop | Loops stay silent |
