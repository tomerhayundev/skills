# Verification

Rendering is not verification. In the pipeline this skill comes from, four bugs
passed the type checker, 300+ unit tests and Node-side checks, and were caught
only by rendering a frame and looking:

- every scene's text silently rendered in the OS fallback font, and still looked plausible;
- the film grain was a measured no-op;
- a persona's highlighted keywords didn't match its own CV;
- three of seven keyword chips were clipped at the frame edge on one aspect.

## Stills

```bash
npx remotion still src/index.ts <composition-id> out/_check.png --frame=120
```

Read the PNG. Pick frames deliberately: the poster frame, the moment each caption
is fully revealed, a frame mid-transition, the last frame. Prefix scratch files
with `_` and have the render script sweep them.

Tile a cut into one image:

```bash
ffmpeg -y -i clip.mp4 -vf "select='eq(n,60)+eq(n,180)+eq(n,285)+eq(n,420)',scale=640:-1,tile=4x1" -frames:v 1 _sheet.png
ffmpeg -y -i f1.png -i f2.png -i f3.png -i f4.png \
  -filter_complex "[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,scale=1500:-1" _grid.png
```

A contact sheet of every clip at every aspect side by side is worth a script of
its own: it is how a whole re-render gets reviewed in a minute.

Check per aspect:
- nothing clipped at the frame edge, including at the camera's drift extremes;
- the caption clear of content and fully readable;
- text legible at the aspect's real size (tall and square shrink everything);
- RTL: layout genuinely mirrored, numbers and percentages still left to right.

## Pops

```bash
node ${CLAUDE_SKILL_DIR}/scripts/frame-pops.mjs out/promo/<id>.mp4 [--factor=3]
```

Measures how much each frame changes from the last (ffmpeg only decodes; the script
compares the raw pixels itself) and flags any frame that changes 3x more than its neighbours: a hard
cut, a transition that covers too much in one frame, an element that blinks in or
unmounts on screen. Exit 1 on any. It reports whether each pop sits on the beat grid. Run
it on every cut and every aspect before publishing, and after changing a transition: a
tall frame shows more of the world than a wide one, so it catches pops that wide hides.

Look at every pop it flags before fixing anything: extract the frames either side and
compare them at full size, byte for byte if in doubt. Do not trust ffmpeg's difference
filters for this (`tblend`, `blend`): on full-range (yuvj) renders both reported large,
uniform changes between frames that were byte-identical.

## Frame 0 is a thumbnail

Platforms without a separate poster upload (and chat previews) show frame 0. A
scene that opens on an empty stage makes a blank thumbnail. Check it:

```bash
ffmpeg -y -i clip.mp4 -vf "select='eq(n,0)+eq(n,<posterFrame>)',scale=640:-1,tile=2x1" -frames:v 1 _f0-vs-poster.png
```

To bake the poster in without changing duration or audio sync, replace frame 0
rather than adding one:

```bash
ffmpeg -y -i clip.mp4 -i poster.png -filter_complex "[1][0]scale2ref[p][v];[v][p]overlay=enable='eq(n,0)'" \
  -c:a copy -c:v libx264 -crf 18 -pix_fmt yuv420p clip-thumb.mp4
```

## Tests that earned their place

- **Containment with drift**: every element's rect must sit inside the rect that
  stays on screen at the camera's breathing extremes, per aspect, per locale. A
  naive fit test passes and the element still clips on screen.
- **Caption hold**: for every captioned beat, the frame the last word settles plus
  1.5 s must precede the beat's end. Compute with the same spring the animation
  uses, not by eye.
- **Font probe**: a separate bundle renders a string in the real font and in
  `system-ui`; the pixels must differ.
- **Grain probe**: a `grain-off` twin of a loop; the pixels must differ, and a
  loop's first and last frames must match.
- **Import path**: spawn `node --import tsx` on the module the render script
  imports; it must load without the browser-only assets.
- **Manifest**: every scene has at least one standalone clip, every clip covers all
  aspects and locales unless it's a named exception, company names are fictional.

## Audio

A Remotion render always writes an audio stream, even with no audio element, so
"the file has audio" proves nothing. Measure:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/audio-check.mjs out/promo/<id>.mp4 [--reference=approved.mp4]
```

It flags a silent track, prints integrated loudness, range and true peak, a
per-0.5 s loudness timeline with jumps marked (the lift should show at the lift
frame), and against a reference the offset and correlation. Offsets of 20 to
40 ms are codec priming and below perception.

Scene cuts, for checking a lift or beat against the edit:

```bash
ffmpeg -i clip.mp4 -vf "select='gt(scene,0.08)',showinfo" -an -f null - 2>&1 | grep -oE "pts_time:[0-9.]+"
```

Shared-element transitions don't register as cuts; take those boundaries from the
chain layout instead.

## Before calling it done

- Stills read at every aspect and locale touched.
- Audio measured, and a human has listened to at least one cut per change.
- The rendered file you are about to publish is the one you checked (the render
  script's skip logic can hand you a stale file; use `--force` when in doubt).
