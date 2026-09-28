---
name: remotion-video-product-demo
description: Use when making a product demo, product tour, feature walkthrough or sales demo video with Remotion that shows what a product does across several features.
---

# Product demo

Status: full

## Fits when

The viewer should see what the product does, feature by feature, and want to try it. Signals:
"demo", "product tour", "walkthrough of the app", "sales video". Not a single task taught step by step
(tutorial), not a 15-30 s ad (promo).

## Lengths and platforms

Default 2 min, range 1-3 min; a deep dive runs 5-15 min in chapters. Usual homes: the landing page,
YouTube, sales emails (as a GIF thumbnail linking out), Product Hunt. Cutdowns: one feature per
15-30 s clip for social.

## Story shape

| Beat | Time | What happens |
| --- | --- | --- |
| Outcome | 0-3 s | What the product does for the viewer, shown as its result |
| Setup | 5-10 s | Who it is for, the problem in one line |
| Features | 3 to 5, 15-30 s each | Each: the need, the cursor doing it in the real product, the result |
| Proof | 5-10 s | A number, a quote, a logo row (real, with permission) |
| Close | 3-5 s | The call to action and where to go |

Order features by what the viewer needs first, not by the menu. Show 3 to 5; a list of 12 reads as
none.

## Assets and voice

Real components or live-site captures; screen recordings for flows that cannot be componentized. Voice
from the media ladder; caption-led works well for a landing page that autoplays muted. Music: a bed
under the voice, or a bed with a lift on the strongest feature when caption-led.

## Engine profile

| Key | Value | Base (promo) | Why |
| --- | --- | --- | --- |
| continuity | seamless | seamless | the engine's boundaries stay seamless |
| popsGate | declared cuts | strict | spliced recordings may cut; listed in `cuts.json` |
| hook | the outcome in 3 s | a line held 2 s | a demo earns attention with the result |
| captions | feature titles (statements) + subtitles when voiced | statements | a voiced demo is subtitled |
| music | bed under the voice, or bed + lift when caption-led | bed with a lift | the voice carries the demo |
| durations | from the voice or reading time, on the grid | grid | the words set the pace |
| shortCut | drops features, keeps the pace | fewer ideas | a shorter demo shows fewer features |
| critique | base 8 + "each feature lands" | base 8 | every feature shown must be understood |

## Build notes

Each feature is a scene; the motif carries the boundaries (a morph of one UI element across features
works especially well). Cursor zoom for small controls. A feature clip for social is the same scene
rendered alone, reframed for 9:16, with a caption instead of the voice.

## Verification

Pops with `--cuts` when recordings are spliced, otherwise strict. Loudness about -16 LUFS. Every
feature title and number readable on the phone sheet. Critique: the base 8 plus "each feature lands":
after watching, a viewer can name what each one does.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Touring the menu in order | Order by the viewer's need |
| Twelve features | Three to five; link to the rest |
| Screenshots sliding past | The real UI, a cursor doing the action |
