---
name: remotion-video-explainer
description: Use when making an explainer, concept video, "how it works" or animated explanation of an idea with Remotion, where the viewer must understand something rather than click through a product.
summary: >-
  Explainer videos with Remotion: one idea made clear with diagrams and the brand's motif, voiced or caption-led, checked for one-sentence recall.
---

# Explainer

Status: full

## Fits when

The viewer must understand an idea: why a problem exists, how something works, what makes the product
different. Signals: "explainer", "how it works", "explain", "concept", "why". Not a task (tutorial),
not a feature tour (product demo).

## Lengths and platforms

Default 75 s, range 60-120 s. Usual homes: the landing page, YouTube, LinkedIn, a pitch deck. A
15-30 s cutdown keeps only the idea and the close.

## Story shape

| Beat | Time | What happens |
| --- | --- | --- |
| Problem | 0-3 s | The problem the viewer has, as a picture |
| Why it matters | 5-10 s | What it costs them |
| The idea | 10-15 s | The one idea, carried by the motif |
| How it works | 3 points, 10-15 s each | Each built out of the previous picture; diagrams draw themselves |
| Proof | 5-10 s | A result or a number (real) |
| Close | 5 s | The idea in one line, the call to action |

One idea per explainer. If a viewer cannot repeat it in one sentence, cut until they can.

## Assets and voice

A script first: one sentence per beat, read aloud and timed before any animation. Voice from the media
ladder (an explainer is usually voiced; caption-led works for muted feeds). Diagrams and the motif,
more than product UI.

## Engine profile

| Key | Value | Base (promo) | Why |
| --- | --- | --- | --- |
| continuity | seamless | seamless | an argument is one continuous picture |
| popsGate | declared cuts | declared cuts | |
| hook | the problem in 3 s | chosen per film | an explainer opens on the viewer's problem |
| captions | subtitles (2 lines) + key terms as statements | statements | voiced, so subtitled |
| music | bed under the voice, a lift on the "aha" | bed with a lift | the voice carries the argument |
| durations | from the voice or reading time, on the grid | grid | the words set the pace |
| shortCut | drops sub-points, keeps the idea | fewer ideas | a shorter explainer keeps the one idea |
| critique | base + "one-sentence recall" | base | a viewer should repeat the idea |

## Build notes

The motif is the argument's through-line (it becomes the diagram). Charts with `@remotion/paths` on
the base's spring; numbers count up only to real values. Every point is built out of the last picture:
no slide-deck cuts.

Diagrams follow an editorial grammar in the brand's own tokens. The accent marks only the one or two things the viewer should look at first; the rest is ink and muted. Every node earns its place: about four in view, never twelve. A diagram draws in the order the voice explains it, at most two items entering per beat, its lines drawn with `evolvePath`; secondary flows are dashed. Text at the film's reading sizes: no small mono labels or eyebrows, and a label is cut before it is shrunk. A diagram never stands still: the camera pushes toward what the voice names, and the next point is built out of this picture. Types that read on screen: a loop, a flow, layers, a pyramid or funnel, before and after, a timeline, a quadrant, a simple sankey; tables, schemas and class diagrams do not. A product made of parts (a device, an app stack) can open as an exploded view, its layers lifting apart on one axis; the same shot serves a launch film. References for this: `find-sources.mjs --need=svg-animation --format=explainer`.

Drawn diagrams are judged on craft. Thin node-and-arrow loops, a dot running round a ring and tally ticks read as clip art, however clean the colors; objects with weight read as designed: a block that falls onto its day, a slot shoved along a rail with a little overshoot, layers that lift apart and press back. The motif sits on the line or object it belongs to: an empty slot rides the timeline, never floats above it as if framing something. A callback (the proof, the close) brings back the strongest picture of the film, never a weak one, so the viewer is not shown the bad version twice. A diagram hold needs an event every 2 to 3 s (something lands, lights, fills or moves on): a slow push alone passes the frozen-time check and still reads as nothing happening, so a stretch where only the camera moves is cut.

## Verification

Pops with `--cuts`. Loudness about -16 LUFS. Critique: the base criteria plus one-sentence recall: someone who
watched it once says the idea back. The critic also judges craft: would a motion designer sign this drawing, or does it look made in a drawing app? A film can score 8 on every line and still fail this.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Three ideas in one explainer | One idea; the others are other videos |
| Animation before the script is timed | Time the script aloud first |
| Diagrams that appear whole | Draw them in the order the voice explains them |
| A diagram in a print skin (tiny labels, its own palette, two accents) | The brand's tokens, one accent, film reading sizes |
| An opening diagram of thin boxes, arrows and a dot going round | Objects with weight on one line: they fall, shove and settle |
| The motif floating above the diagram it is about | Put it on the line or object it belongs to |
| The proof replays the weakest picture | Call back the strongest picture of the film |
| Holds where only the camera pushes | An event every 2 to 3 s, or cut the hold |
