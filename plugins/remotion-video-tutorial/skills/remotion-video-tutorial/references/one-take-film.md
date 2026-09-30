# One-take film: an element that travels through everything

A launch film shot as one continuous take: one large canvas, a camera, and one
element that travels through every moment and changes what it touches (a thread and
needle, a line, a cursor, a ball). It is not a manifest chain of scenes, so it gets its
own small architecture. Everything below came out of building one and taking two rounds
of review from a picky owner; each rule names the mistake it prevents.

The element is the film's motif, taken from the brand and the product's action (SKILL.md,
"Find the motif first"). A thread and needle worked because the product tailors CVs; the
same film with a ball would be a template.

## Four modules and a component

| File | Holds |
| --- | --- |
| `plan.ts` | The beat map per cut: moments, beats, legs (`{ leg, from, to, ease }` in beats), captions, the drop beat. Timings the tests check (hook words, caption rise, the spring's settle frame) are exported data. |
| `geometry.ts` | Stations on the canvas, each moment's leg paths, the timeline (arc length over frames), the element's heading and depth, slack, and anything derived from the path (picked-up items, a score). Pure math. |
| `camera.ts` | Per-moment framing, the moves between moments, the lean, the dead zone. Computed once per film and aspect, then looked up per frame. |
| `Film.tsx` | Mounts each station while the camera can see it (not on a timer: unmounting on a timer blinked things off on screen), draws the path, the element, captions, audio. |

## Beat map first, then stills, then a motion clip

1. A table per cut: beat, time, what changes, caption. Each moment is a throw in, an
   action, and (if it has a caption) a rest of about 4 beats.
2. The visual brief (SKILL.md, Order of work): the storyboard of each cut, and style frames
   at final quality of the hardest moments (the opening, the busiest station, a
   caption in its rest, the payoff).
3. A 4 to 5 second motion clip of the trickiest stretch, at final quality, before rendering
   everything. Motion quality can't be judged from stills.
4. Internally, a rough cut of the whole cut with the music (`visual-brief.mjs --animatic`, or
   `--scale=0.5`): pacing is judged here, before polish. It is never shown to the user.
5. Then all cuts, each checked (see the review loop at the end).

## A shorter cut is fewer ideas, not faster ones

The first 15 s cut shrank every leg to fit and "looked fast and even harder to
follow". A short promo delivers the message in less time; it does not run faster.

- Keep 3 or 4 moments: the question, the answer, the proof on the drop, the brand.
- Moments that both cuts play use the same leg timings. Share the objects (the hook
  spec is literally the same object) and test that shared legs have equal lengths.
- A cut that skips stations places the rest differently. Test on-screen speed per
  shared moment: the element's movement across the frame and the camera's pan, each
  at most 1.1 times the long cut's. Not "path speed times zoom": that pictures a locked
  camera and flags a throw that pans the same distance from a closer framing.
- Place skipped-over stations so a neighbour is either fully in the frame or fully
  out. A sliver of the previous station at the edge of the end card reads as a mistake.

## Motion that reads as premium, not cheap

The first version eased every leg on its own (the element stopped dead between legs),
turned on sharp corners, and looped over the text of labels. Review called it cheap.

1. **One timeline.** Arc length over frames is one monotone cubic (Hermite) through
   every leg's start and end, flat through rests. A deliberate impact (a strike) is the
   only hard stop.

   ```ts
   type Seg = { f0: number; f1: number; s0: number; s1: number; kind: "flat" | "strike" | "linear" | "smooth"; m0: number; m1: number };
   const sec = (g: Seg) => (g.s1 - g.s0) / (g.f1 - g.f0);
   // The speed where two segments meet, as seen from `a` (b is its neighbour).
   const knot = (a: Seg, b?: Seg) =>
     !b || b.kind === "flat" || b.kind === "strike" ? 0
     : b.kind === "linear" ? sec(b)
     : (2 * sec(a) * sec(b)) / (sec(a) + sec(b)); // harmonic mean
   segs.forEach((g, i) => {
     if (g.kind === "linear") g.m0 = g.m1 = sec(g);
     if (g.kind === "strike") g.m1 = 3 * sec(g); // s0 + L*t^3: hits at full speed
     if (g.kind === "smooth") {
       // Past 3x the secant a cubic overshoots and the path would draw backwards.
       g.m0 = Math.min(3 * sec(g), knot(g, segs[i - 1]));
       g.m1 = Math.min(3 * sec(g), knot(g, segs[i + 1]));
     }
   });
   // smooth: Hermite h00*s0 + h10*h*m0 + h01*s1 + h11*h*m1, with h = f1 - f0
   ```

   Insert a `flat` segment wherever the next leg starts later than the last one ends.
2. **Throws are curves** (cubic Bezier, handles about 0.4 of the distance, clamped to
   80..450 px) that land the way the next leg sets off. Straight out of a moving leg a
   throw leaves the way the path was already going; out of a rest it leaves toward its
   target in a lifted arc, and the element turns to face it during the last 12 frames
   of the rest (anticipation). Without that it spun 150 degrees in two frames.
3. **Heading** is the path direction over the last ~24 px, averaged over the last 8
   frames (weighted to the latest). Test: never more than 25 degrees in one frame.
4. **Around text, never over it.** Pass behind labels (in one eyelet, out the other),
   run under keyword chips, keep stitches in page margins. A leg has under-ranges where
   the path is not drawn: the element dips there (short gaps) or goes out of sight (long
   ones). Test every sample of the path against every text rect.
5. **Weight.** A soft shadow under the path and the element. Free path (the throws)
   sags behind a fast element and pulls tight as it slows, rate-limited to a few px per
   frame. Stitched or attached path does not sag: held by what it is sewn into.
6. **A pasted thing appears whole.** Revealing it under the moving element read as the
   element erasing it.

## Camera

Premium camera motion is mostly the absence of jolts. The tests found four kinds:

| Jolt | Fix |
| --- | --- |
| The camera ran on its own clock, left before the element and arrived after; the dead zone then dragged it back | Move between stations by the element's progress along the throw into the moment. Hold while the element rests. If the throw flows on into the next leg without a rest, give the move ~8 frames more to settle |
| A cubic ease flips acceleration at its midpoint; a sine ease brakes hardest in its last frame | Quintic ease, `t*t*t*(t*(6*t-15)+10)`: starts and stops with no acceleration |
| The lean toward the element switched on in one frame (a pop in tall only) | Fade the lean in and out over ~12 frames |
| The dead zone shoved the camera the frame the element reached the edge | Compute the correction per frame, then smooth it (Gaussian, sigma 4, +/-10 frames) and apply that |

Also: a pan that follows the element ramps in (quadratic over its first ~300 px), and
a move eases toward the live framing, not a snapshot of it. Tall is width-bound: give
wide stations bigger tall framings, and check the lean does not push content off an
edge.

Test the jerk, not the speed: the third difference of the camera centre on screen stays
under 12 px per frame cubed, every frame, every aspect. A big smooth move passes; a snap
fails.

## Hook and captions

- **Hook:** chosen for the film ([hooks](hooks.md)); the picture is already moving on
  frame 0 and never waits for its line. The line is whole for its reading time (about
  0.3 s a word, at least 1.5 s) and sits in one place; what moves under it is what it
  talks about, and the element's path stays out of its rect. Test the reading time, and
  that something changes in every second of the first three. Break tall lines by hand;
  one word alone on a line reads as an accident.
- **Captions:** 4 to 6 words, bigger than you think. They rise only into a calm
  picture (the hold's slow push goes on, about 2% of scale a second; nothing else moves): the
  element and the camera move under 1.5 px a frame from the first word
  until a second after the last one lands. Fully shown at least 1.5 s, never
  overlapping. Draw the element's motif under the accent word (a line drawn under it),
  so the eye goes where the motion taught it to go. First version: captions arrived
  while the element was still working, and nobody read them.

## Gestures mirror the product action

For every moment write three things: the product action, the on-screen gesture, and
how the gesture could be misread. A needle revealing pasted text looked like it was
erasing it. A line through words reads as crossing them out; a line under them reads as
selecting them. When the product finds things (keywords, matches), let the element pick
them out and carry them to the result: the picked-up keywords rode the thread into the
score ring, and the score stepped up once per keyword, on the half beats.

## The tests that caught real problems

- The hook line is whole for its reading time, and something changes in each of the first three seconds.
- Captions: word count, time fully shown, no overlap, a still picture while they rise.
- Speed is continuous at every knot except the strike (compare the two one-sided
  derivatives at each leg boundary, epsilon 0.001 frames).
- The heading turns at most 25 degrees in a frame.
- The path never crosses a text rect; it threads each label through both eyelets.
- The element stays inside the picture on every frame from the strike on, per aspect.
- The camera's jerk stays under 12 px/frame^3, per aspect.
- The short cut: same hook, fewer moments and captions, equal shared legs, nothing
  faster on screen.
- Derived results land on the drop: the score reaches its final value on the drop
  frame and not one frame before.

## Review loop, every round

- `frame-pops.mjs` on every cut and aspect. The camera jolt at the strike popped in
  tall only.
- `frozen-time.mjs` on every cut and aspect: a rest where only a breath moves is the
  one-take film's usual fault, and every frame of it looks finished.
- A contact sheet per cut (one frame a second). It caught what tests missed: slivers of
  neighbouring stations at the frame edge, a panel collapsing into a black slab, the
  first item of a row cropped in tall.
- The phone sheet (360 px wide): captions and labels must read at feed size.
- Scores from the [film critique](verification.md#critique-at-three-points), until every one is 8 or more.
- Loudness with `audio-check.mjs`, and a person watching with sound.
