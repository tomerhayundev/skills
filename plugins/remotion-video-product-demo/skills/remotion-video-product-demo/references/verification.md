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
node ${CLAUDE_SKILL_DIR}/scripts/frame-pops.mjs out/promo/<id>.mp4 --grid=<frames per beat> [--factor=3]
```

Measures how much each frame changes from the last (ffmpeg only decodes; the script
compares the raw pixels itself) and flags any frame that changes 3x more than its neighbours: a hard
cut, a transition that covers too much in one frame, an element that blinks in or
unmounts on screen. Exit 1 on any. It reports whether each pop sits on the beat grid. Run
it on every cut and every aspect before publishing, and after changing a transition: a
tall frame shows more of the world than a wide one, so it catches pops that wide hides.

The format's profile sets the gate. `strict` (a loop): zero pops. `declared-cuts` (every other format: the
beat cuts, match cuts and cuts inside recordings that `declaredCuts()` wrote): run with `--cuts=out/<id>.cuts.json`; pops at
the declared cuts pass (within a frame), any other pop fails. Scan a raw screen recording before
editing it: a page-load flash inside it is a pop nobody declared.

Look at every pop it flags before fixing anything: extract the frames either side and
compare them at full size, byte for byte if in doubt. Do not trust ffmpeg's difference
filters for this (`tblend`, `blend`): on full-range (yuvj) renders both reported large,
uniform changes between frames that were byte-identical.

## Frozen time

```bash
node ${CLAUDE_SKILL_DIR}/scripts/frozen-time.mjs out/<id>.mp4 [--max-stretch=0.6] [--per-30=1]
```

The opposite of a pop: too little change, for too long. A 15 s promo that passed every other check
and scored 8 on motion measured 36% still (5.5 of its 15 s): its opening, both caption rests and
its end card moved by nothing but a camera breath, and every one of those frames looked finished. A frame a second
cannot show it; this can. It lists every still stretch with its times, the total, and a drift
timeline, and fails when a stretch runs longer than the profile's `stillness.maxStretchSeconds` or
the total passes `perThirtySeconds` per 30 s of film (promo and explainer: 0.6 s and 1 s; product
demo, tutorial and the stubs built on them: 2 s and 8 s, because a real screen holds while it is
explained; pass those two numbers as flags).

A frame is alive when the whole picture drifts or when one part of it changes (a click, a number
ticking, a check popping). On its drift scale a camera breath reads 0.05 to 0.14 and the line is
0.2; a push of about 2% of scale a second reads 0.3 to 0.5 on a scene under a caption that stays
put, and about 1.0 when the whole frame moves. The same film after its holds were given that push
measured 0.00 s still, in both aspects.

The measure is a floor, not the judgment. For each stretch it lists: first ask whether the hold is
longer than its words need (then cut it), then whether something small can happen in it, and only
then give what remains the push (architecture, One square canvas). Never cut the reading time
itself. A critic who read the same film's 0.00 s still called its holds "still to the eye": a push
keeps a hold alive, it does not give it a job. Look at each stretch in the pack's dense sheets
before fixing anything.

## The cover and frame 0

The cover is designed, not picked: the real product and the promise, settled, text fully in,
never a transition frame or a field of flat color. `checkTransitions()` refuses a poster frame
inside a transition or a caption's entrance; then measure the rendered cover and look at it:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/motif-coverage.mjs out/<id>.webp --accent=<hex> --max-share=0
```

Platforms without a separate poster upload (and chat previews) show frame 0. A
scene that opens on an empty stage makes a blank thumbnail. Check both:

```bash
ffmpeg -y -i clip.mp4 -vf "select='eq(n,0)+eq(n,<posterFrame>)',scale=640:-1,tile=2x1" -frames:v 1 _f0-vs-poster.png
```

The best fix is a frame 0 that is already a complete, readable picture (the hook's
picture, mid-action, without its caption, is usually enough): complete, not still. A loop needs that: frame 0 is also
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
node ${CLAUDE_SKILL_DIR}/scripts/critic-pack.mjs refs/ref.mp4 --cuts=auto --out=refs/_ref
```

Two frames a second show a reference's look and hide how it moves: a transition that takes a third
of a second falls between them. The pack finds the cuts itself (`--cuts=auto`) and writes the
overview (`contact.png`), a frame every 0.2 s (`dense-<n>.png`), both sides of every cut
(`cuts.png`), 16 frames across the second around each cut (`cut-<frame>.png`) and the drift timeline
with the fast moments marked (`motion.txt`). Its `index.md` lists every cut's time, which gives the
shot lengths.

Read the sheets, then write `docs/style_guide.md`: palette (hex), type (family, weight, tracking),
shot lengths, camera moves, texture and grain, how text enters and exits; and, per reference, a
note of three lines: **its key moment** (with the time), **how it works** (what moves, what stays,
what is already in place under it: read it off that cut's 16 frames) and **how it could serve this
film**. The moves that hold across the references become the film's grammar; match each to the
catalog in [handoffs](handoffs.md). Take the grammar, never the content, footage, layouts, logos,
characters or music. A folder of the client's own past work makes a reference nobody else can copy.

With no reference from the user, take one from the sources library (`find-sources.mjs`, SKILL.md
section 5) and read each result as its `read` says:

- `frames` is video. When the entry's rights say `study`, fetch that one clip (the item's video
  URL, often in the page's JSON-LD) into `refs/`, kept out of git and never rendered, and run the
  pack on it. When they say `view`, read it in the page: pause the video, set its `currentTime`
  from the page's script at 0.2 to 0.5 s steps around the key moment, and screenshot each step. A
  seek lands on the nearest keyframe, so a time read this way is good to about 0.3 s: say so in
  the guide.
- `look` is screenshots: read them as stills. `registry`, `md` and `text` give code or words directly.
- Write each into the style guide's three lines like any reference, and name it there by category
  ("a fintech app's swipe-to-pay"), never by the site's or the brand's name. The pages themselves go
  in `refs/sources.md` (their URLs and what each gave), kept out of git and out of anything the user
  sees, so a later session can open them again.

With nothing found, the catalog of moves in [handoffs](handoffs.md) and the product's own look are
the reference.

## Phone test

Feeds are watched on phones. Tile the render at 360 px wide and read it:

```bash
ffmpeg -y -i clip.mp4 -vf "fps=15/<duration in s>,scale=360:-1,tile=5x3" -frames:v 1 _phone.png
```

`critic-pack.mjs` writes the same sheet as `phone.png`. 15 frames spread over the whole video,
whatever its length. Every caption, label and number must
read at that size, wide renders included (they are watched on phones too). What does not read gets
bigger or goes.

## Text contrast

```bash
node ${CLAUDE_SKILL_DIR}/scripts/contrast-check.mjs out/_check.png --rect=<x,y,w,h> [--rect=...]
```

Every line of settled text reads at 4.5:1 or more against what is behind it, measured in the
rendered still, not in the tokens: a caption that is white on the canvas sits on whatever the shot
puts under it. Give it each text block's rect (the caption band, a label, the end card's line) at
the frames where the picture behind is brightest and busiest. It also reports the contrast against
the nearest part of the background; under 3:1 there, the words need a backing (a band, a scrim, a
card), not a bigger font. Words in the middle of a fade are not measured.

## Loop seam

A loop plays its last frame straight into its first. Play it twice and scan the seam:

```bash
ffmpeg -y -stream_loop 1 -i loop.mp4 -c copy _loop2.mp4
node ${CLAUDE_SKILL_DIR}/scripts/frame-pops.mjs _loop2.mp4
```

A pop at the seam means the last frame is not the first, or matches it in position but
not in velocity (a cursor that stops dead and restarts).

## Motif coverage

A flood is an exclamation mark. Measure how much of the film flat accent color covers:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/motif-coverage.mjs out/<id>.mp4 --accent=<hex> --allow=<turn and close frame ranges>
```

It fails when accent dominates more than 5% of the runtime, or a full frame of it falls
outside the declared turn and close. Measured on a 30 s promo that flooded all six of its
boundaries: 7.5% dominated and six undeclared full frames; its 15 s cut, two.

## Critique at three points

Tests prove the arithmetic; they cannot say whether the film is good. The author is the worst
judge of their own film: a self-scored promo passed every criterion at exactly 8, and the same
model, asked afterwards as a critic, found the floods, the missing motif introduction and the
15 s cut that made no sense on its own. So the critique is cold, by a fresh critic (a subagent with
no part in the build), and it comes early: the later a problem is found, the more it costs.

A critique only at the end became a polish loop. A 30 s ad went through eight cold rounds: its
scores wandered between 5 and 7, because each new critic brought new taste and each round's fixes
created the next round's complaints, and the last critic asked to restructure its first 10 s, a
problem the storyboard already showed. A brand film went through six rounds to 7.3 and was still
"fine, not wow": its concept was a list, which no amount of polish fixes.

### 1. The concept, before the brief

In the brand read ([brand-read](brand-read.md), step 4): three concepts, scored on one idea, only
this brand, the brand's look, surprise, every asked item inside, and whether the material can make
it. The winner is rewritten once when any score is under 8. This is where "banal" is caught.

### 2. The storyboard, before the build (required)

A fresh critic gets the visual brief page (its PNG), the motion frame's strip (`out/motion-1-strip.png`,
12 frames across the turn, which `visual-brief.mjs` writes) and the clip itself, the brand read and
the one-sentence message, and, when the rhythm matters, the internal rough cut
(`visual-brief.mjs --animatic`); the prompt is in [critic-prompts](critic-prompts.md). For a film in
a feed it judges the first two seconds alone before anything else: the first beat's picture, its line
and the track from its start point. Does something move on frame 0, is the beat already playing, does
the line open a question? A slogan, a logo, a still product, a slow fade or a quiet intro fails, and
nothing later makes up for it. Then it judges structure:

- each shot's job (for a promo: hook, promise, proof, offer, close), and whether a stranger would
  know after one viewing who this is, what they get, why this one and what to do;
- the flow: what the eye follows over every cut (the page's "carried over the cut" lines), and
  whether it would hold on screen; the motif through the storyboard: where it is met, how each shot
  hands it to the next, where it turns and where it comes back. A stretch of shots it never touches,
  with nothing else carried, plays as a run of clips;
- the moments: whether each "thing becomes thing" can be pictured, and which a viewer would remember;
- density: how many compositions, which run past 3.5 s with nothing changing, where the scale
  repeats, where the subject is small in an empty frame ([handoffs](handoffs.md#pace-and-density));
- what a first-time viewer understands at each beat; whether every beat carries the message forward
  (a beat that only shows a logo or a pretty frame is a gap); tension, one turn, the payoff; whether
  every asked item lands inside the story; reading time; whether every number on screen is in the
  facts list; whether the chosen track fits the brand read's look.

What it finds is fixed on the page before the user sees it. The rough cut is never shown to the
user. The critic, like the film, works with the material that exists: "film the warehouse" or "get a
screen recording" is not a fix, unless the user offered it in the question call; the fix is another
shot, a still, the brand's layer or the end card ([intake](intake.md#build-from-what-exists)).

### 3. The film: each scene alone, then the whole film in at most three rounds

**Each scene, before it joins the film.** A scene with animation of its own (drawn interface, a
motif move, a handoff) is rendered alone: stills at its key frames and a 3 to 4 s clip
(`npx remotion render --frames=<from>-<to>`), and a fresh critic reads it with the scene prompt in
[critic-prompts](critic-prompts.md): KEEP, REVISE or REJECT. It costs minutes, and it is where a
one-frame pop, a label on the wrong thing, a blank frame between two states or a small card in an
empty frame is cheap to fix. A shot that is only a trimmed clip needs none. Scenes can be built and
read in parallel once the shared pieces exist (the tokens, the motif, the rect of every handoff):
one owner per scene file, reviewers that never edit, a fixer only where a reviewer asked for one
([architecture](architecture.md#building-scenes-in-parallel)).

**Then the whole film.**

- The critic gets the film, its critic pack, the one-sentence message, the brand read's Look row and
  the profile's criteria; never the script, the plan or your reasoning:

  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/critic-pack.mjs out/<id>.mp4 --cuts=out/<id>.cuts.json --moments=<turn frames>
  ```

  It writes `out/_critic/`: the first three seconds (`hook.png`), a frame a second (`contact.png`), a
  frame every 0.2 s with each row one second (`dense-<n>.png`), both sides of every cut (`cuts.png`)
  and 16 frames across the second around each (`cut-<frame>.png`), a 12-frame strip around each
  moment named (the turn, the close, the fastest move), frozen time (`motion.txt`), the loudness
  timeline (`audio.txt`), the phone sheet (`phone.png`) and an index with every cut's time. A frame
  a second alone cannot show a move, a cut, a 1.5 s shot or the music, so the scores for them were
  guesses. The pack is where the critic starts, not all it may see: it pulls any other frames it
  needs from the film itself. One pack per aspect (`--out=out/_critic-<aspect>`).
- For a film in a feed, it judges `hook.png` and the first two seconds of `audio.txt` before anything
  else, as a stranger with a thumb on the screen: would they stop? The hook score is capped by this.
- Before scoring, it narrates what a first-time viewer understands every 2 s, and what they would
  not. Anything the message needs that a first-time viewer would not understand is a problem.
- It returns the problems ranked by what each costs the film, with times, then the scores, and ends
  with one line: SHIP or ONE MORE PASS. Fix the biggest first: a weak opening is not averaged away
  by strengths elsewhere.
- From round two, a **new** critic gets the last critic's report and nothing else about the round:
  never what was changed, never what you believe is fixed. It marks each problem fixed, partly or
  still there from the frames, then hunts for what the fixes broke (a fix often makes the next
  defect: something now covered, a moved object crossing a line, a hold where the cut was). A critic
  told what was fixed confirms it. Scores move on evidence, not on a new critic's taste.
- It tags each problem **polish** (fixed in place: easing, size, a word, a few frames of timing
  inside a beat) or **structure** (a beat with no job, the order, the turn, the concept, and any
  fix that changes a beat's length or what happens in it). A structure problem goes back to the
  storyboard: re-plan those beats, have the storyboard critic read them, then rebuild. Polishing
  around a structure problem is how scores stall at 7. Every fix uses the material that exists; a
  score is never made to wait on footage the user has not offered.
- It scores each cutdown on its own, as if the long cut did not exist.
- Every score at exactly the threshold is a warning: a second critic scores it again.
- Stop when the critic says SHIP, every score is 8 or more and the measured checks pass. Stop after
  three rounds, or after two rounds in a row where the lowest score did not rise: hand the user the
  film with the one structural choice that would lift it, in one line ("the first 10 s carry no
  message; I would restructure them around ..."), instead of another round. A film with no defects
  is not yet a good film: "clean and basic" is a structure problem, not a pass.

What the critic scores, each from 1 to 10 (the profile's `critique` list; paste each with its line
from here into the prompt, since a name alone tells a critic nothing):

- **story and copy**: the one message clear after one viewing, every line specific to this brand,
  one call to action ([story](story.md));
- **the hook**: whether this viewer would stay, judged on the opening alone against what usually
  opens this kind of video ([hooks](hooks.md)): something happening on frame 0, what it is about
  clear within a second or so, something opened that the film closes; **readability** at phone size;
- **motion**: springs, one move leading with smaller ones under it, nothing sliding linearly, frozen
  time inside the budget (`motion.txt`);
- **variety**: something new on every beat, the scale changing, no layout used twice;
- **composition**: the subject fills the frame (no small card in an empty field), rows equally
  spaced, edges lined up;
- **the motif and the brand**: one object linking the shots so it plays as one film; met as a real
  object before it is abstracted; does what the product does; would this film still work for the
  closest competitor (asked as a question, never shown);
- **every cut carries something**: over each cut the eye follows the motif, a real object, a shape
  or a movement, landing in the same place at the same size; a cut that carries nothing is named;
- **the brand's look**: the film looks like the brand's own adjectives (the brand read's Look row):
  a brand that calls itself minimal and clean is not filmed busy;
- **transitions: hierarchy and dose**: the turn feels bigger than the other boundaries;
- **graphics belong to the picture**: each one on a surface, in an interface or in the brand's layer;
- **professional finish**: one look across every clip, a clean frame with no clutter that is not the
  story, captions in the brand's type as one system, the brand present from the first seconds: would
  the brand's marketing lead post it as their ad?
- **the cover**: the product and the promise, settled;
- **sound**: the lift on the payoff where there is one, the level, every effect on a real move and
  under the music. A caption-led tutorial's or onboarding video's bed is scored on staying out of
  the way; a silent loop skips this.

What it hunts for: text overlapping during a swap, text flying through other text, anything that
slides instead of easing, more than two things asking to be read at once, text in the corners,
decorative readouts (a timecode, coordinates, a status line), frame borders, a centered title on a gradient,
everything fading in, soft text the camera scaled, a hold where nothing moves, a blank frame between
two states, a label on the wrong thing, rows unequally spaced, a stutter at the loop seam.

After each round: fix the polish in place and re-render only the affected frames
(`--frames=<from>-<to>` for a look, then the full file); send structure back to the storyboard. Keep
the ledger in `docs/review_log.md`, one row a round, so a score that moves has its evidence beside it:

| Round | The film | What the critic found (ranked) | What changed | Measured, before to after |
| --- | --- | --- | --- | --- |
| 1 | `out/<id>.mp4` | 1. ... (structure) 2. ... (polish) | ... | frozen 6.2 s to 0.4 s; pops 2 to 0; -15.9 LUFS; lowest score 6 to 8 |

Stop by the rules above, then hand it to a person to watch with sound.

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
- **Manifest**: every scene has at least one standalone clip, every clip covers the
  brief's aspects and locales (for a promo: all four aspects, every locale) unless it's a
  named exception, company names are fictional.
- **Camera jerk**: the third difference of the camera centre on screen, every frame,
  every aspect, under about 12 px per frame cubed. It caught a lean switched on in one
  frame, a dead zone shoving the camera, and eases that brake in their last frame.
- **Calm picture under captions**: nothing on screen (the moving element, the camera)
  moves more than 1.5 px a frame from a caption's first word until a second after its
  last one lands, measured at points on screen (the frame's corners), not at canvas
  points that a high zoom has pushed off it. The hold's slow push (about 2% of scale a
  second) stays inside that; a breath of 1% alone reads as frozen.
- **Match registration**: for every match cut, morph and shared element, the carried
  object's rect in the last frame before the boundary equals its rect in the first
  frame after it, within 2 px, per aspect; for a flood, full cover on both frames
  around the cut ([handoffs](handoffs.md)).
- **Fill**: each scene's subject, at its settled rect, spans 60 to 85% of the usable
  frame (the aspect less the caption band and the safe zone) along its longer side,
  per aspect.
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

A film with sound effects is also rendered with them off (the music-only twin; [music-bed](music-bed.md#sound-effects)),
and the two are compared:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/audio-check.mjs out/<id>.mp4 --music-only=out/<id>.music-only.mp4
```

It lists each effect it can hear with its time, how loud the effect is against the music under
it and how far its peak stands over the music around it, and marks any that is louder than the
music or peaks more than 6 dB over it.

## Before calling it done

- Stills read at every aspect and locale touched.
- The dense sheets of each cut (a frame every 0.2 s), checked at the frame edges too: a
  sliver of a neighbouring scene or station at the edge is easy to miss in stills.
- The phone sheet reads; text contrast at 4.5:1 or more where the picture behind it is brightest;
  a loop's seam passes `frame-pops.mjs`.
- Frozen time inside the profile's budget (`frozen-time.mjs`).
- The concept and the storyboard critiques passed before the build; the film's last critic said SHIP with 8 or more everywhere, or the user has the one structural choice; the ledger is in `docs/review_log.md`.
- Audio measured; with effects, the music-only twin rendered and no effect louder than the music;
  and a human has listened to at least one cut per change.
- The hand-off says, in two short lists, what was **measured** (pops, frozen time, loudness,
  contrast, safe zones) and what **still needs a person** (watching it once with sound, the music
  and any effect by ear, anything the critics disagreed on). A number is not a listen.
- The rendered file you are about to publish is the one you checked (the render
  script's skip logic can hand you a stale file; use `--force` when in doubt).
