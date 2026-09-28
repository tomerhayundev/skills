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
with `_` and have the render script sweep them before it renders, so every sheet you
look at comes from the current render. Copy a sheet out of `out/` to keep it.

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

The format's profile sets the gate. `strict` (promo, explainer): zero pops. `declared-cuts`
(tutorial, product demo, event recap, testimonial): run with `--cuts=out/<id>.cuts.json`; pops at
the declared cuts pass (within a frame), any other pop fails. Scan a raw screen recording before
editing it: a page-load flash inside it is a pop nobody declared.

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

The best fix is a frame 0 that is already a settled, readable frame (the hook's
picture, without its caption, is usually enough). A loop needs that: frame 0 is also
the frame after its last, so a replaced frame 0 pops at the seam. Bake a poster only
when frame 0 cannot be designed that way. The pop gate runs on the render before the
bake: the bake itself is a one-frame change at frame 1 that the scan flags, and that
single flag on the baked file is expected. To bake it without changing duration or
audio sync, replace frame 0 rather than adding one:

```bash
ffmpeg -y -i clip.mp4 -i poster.png -filter_complex "[1][0]scale2ref[p][v];[v][p]overlay=enable='eq(n,0)'" \
  -c:a copy -c:v libx264 -crf 18 -pix_fmt yuv420p clip-thumb.mp4
```

## Read a reference

A named or shown look beats a described one: without a reference, a model falls back
to its default (a centered title, a gradient, everything fading in). Study the
reference before planning:

```bash
mkdir -p refs/frames
ffmpeg -y -i refs/ref.mp4 -vf "fps=2,scale=480:-1" refs/frames/%03d.png
ffmpeg -y -i refs/ref.mp4 -vf "fps=2,scale=320:-1,tile=6x5" -frames:v 1 refs/_contact.png
ffmpeg -i refs/ref.mp4 -vf "select='gt(scene,0.3)',showinfo" -an -f null - 2>&1 | grep -oE "pts_time:[0-9.]+"
```

The last command lists its cuts, which gives shot lengths. Read the frames, then write
`docs/style_guide.md`: palette (hex), type (family, weight, tracking), shot lengths,
transition types, camera moves, texture and grain, how text enters and exits. Take the
grammar, never the content, logos or characters. A folder of the client's own past
work makes a reference nobody else can copy.

## Phone test

Feeds are watched on phones. Tile the render at 360 px wide and read it:

```bash
ffmpeg -y -i clip.mp4 -vf "fps=15/<duration in s>,scale=360:-1,tile=5x3" -frames:v 1 _phone.png
```

15 frames spread over the whole video, whatever its length. Every caption, label and number must
read at that size, wide renders included (they are watched on phones too). What does not read gets
bigger or goes.

## Loop seam

A loop plays its last frame straight into its first. Play it twice and scan the seam:

```bash
ffmpeg -y -stream_loop 1 -i loop.mp4 -c copy _loop2.mp4
node ${CLAUDE_SKILL_DIR}/scripts/frame-pops.mjs _loop2.mp4
```

A pop at the seam means the last frame is not the first, or matches it in position but
not in velocity (a cursor that stops dead and restarts).

## Critique loop

Tests prove the arithmetic; they cannot say whether the film is good. After the first
full render, look at it as a harsh motion director, not as its proud author:

1. Make the sheets: the contact sheet (one frame a second), the phone sheet, and a strip
   of 12 consecutive frames around the fastest moment
   (`ffmpeg -ss <t> -i clip.mp4 -vf "scale=320:-1,tile=12x1" -frames:v 1 _strip.png`).
2. Score each from 1 to 10: story and copy (the one message clear after one viewing, every line
   specific to this brand, one call to action; [story](story.md)); the hook in the first 2 s; readability at phone size;
   motion (springs, no dead frames, nothing sliding linearly); variety (something new on
   every beat); composition; the motif and the brand (would a competitor's logo fit?);
   sound (the lift on the payoff where there is one, the level, and any effects sitting on the
   motion; a caption-led video's bed is scored on staying out of the way; a silent loop skips this).
3. Write the three worst problems with timestamps. Hunt for: text overlapping during a
   swap, anything that slides instead of easing, text in the corners, frame borders, a
   centered title on a gradient, everything fading in, soft text the camera scaled, a beat
   where nothing happens, a stutter at the loop seam.
4. Fix them, re-render only the affected frames (`--frames=<from>-<to>` for a look,
   then the full file), and score again.
5. Log every round in `docs/review_log.md`: scores, problems, fixes. Stop when every score
   is 8 or more, then hand it to a person to watch with sound.

## Tests that earned their place

- **Safe zones**: every text rect sits inside `safeRectFor(<the platforms this aspect ships to>)`
  (`assets/templates/safe-zones.ts`), per aspect. Reels and Stories hide the bottom 35%, where a
  caption band would otherwise go; one tall master for several platforms uses their intersection.
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
- **Camera jerk**: the third difference of the camera centre on screen, every frame,
  every aspect, under about 12 px per frame cubed. It caught a lean switched on in one
  frame, a dead zone shoving the camera, and eases that brake in their last frame.
- **Still picture under captions**: nothing on screen (the moving element, the camera)
  moves more than 1.5 px a frame from a caption's first word until a second after its
  last one lands.
- **Short cut pace**: per moment both cuts share, the short cut's on-screen speed is at
  most 1.1 times the long cut's.
- **Text crossing**: every sample of a drawn path stays out of every text rect.

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
- A contact sheet per cut (one frame a second), checked at the frame edges too: a
  sliver of a neighbouring scene or station at the edge is easy to miss in stills.
- The phone sheet reads; a loop's seam passes `frame-pops.mjs`.
- The critique loop's last round scores 8 or more everywhere, logged in `docs/review_log.md`.
- Audio measured, and a human has listened to at least one cut per change.
- The rendered file you are about to publish is the one you checked (the render
  script's skip logic can hand you a stale file; use `--force` when in doubt).
