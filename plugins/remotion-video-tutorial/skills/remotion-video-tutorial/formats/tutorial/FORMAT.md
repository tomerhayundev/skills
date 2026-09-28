---
name: remotion-video-tutorial
description: Use when making a tutorial, how-to, walkthrough of a task, or step-by-step guide video with Remotion, for YouTube, a help center or a landing page, with or without a voiceover.
summary: >-
  Tutorial and how-to videos with Remotion: step by step, chaptered by the brand's motif, a voiceover or word-synced subtitles, cursor zooms, checked so a stranger can repeat every step.
---

# Tutorial

Status: full

## Fits when

The viewer has to be able to do something after watching: set up, connect, export, book. Signals:
"how to", "tutorial", "walkthrough", "guide", "step by step", "help video". Not when the goal is to
want the product (promo) or to understand an idea (explainer); a tour of many features is a product
demo.

## Lengths and platforms

Default 3 min, range 1-5 min (instructional videos of 3-5 min hold the most engagement). The length
follows the steps: roughly 15-25 s a step plus the outcome and the recap, so a 3-step task runs about
a minute and the 3 min default assumes 6-8 steps. Never pad to reach it: count the steps and run
`recommend.mjs --steps=<n>`. Longer material becomes
chapters, or several videos, one task each. Usual home: YouTube 16:9 with an SRT,
the help center, a landing page. Render only the aspects the brief lists: a YouTube tutorial is wide;
its Shorts or Reels version is a vertical teaser that points to it, not the tutorial squeezed.

## Story shape

| Beat | Time | What happens |
| --- | --- | --- |
| Outcome | 0-3 s | The finished result and how long it takes ("Book a client in 3 steps, 2 minutes"). Viewers came from search: no brand intro before step 1 |
| Steps | the body | One chapter per step: a step marker, the action shown wide then zoomed, the result visible, a short calm hold |
| Recap | 5-10 s | The steps in one view, the result again |
| Next | 3-5 s | Where to go next (the next tutorial, the docs); the brand here, not at the start |

A step: open **wide enough to show where the control lives**, ease in on it with the cursor zoom, do
the action, show the result, hold 1 to 2 s with the camera breathing so a viewer can find it or pause.

## Assets and voice

- Source: the product's real components driven by a scripted cursor, or a screen recording
  ([media](../../references/media.md#screen-recordings)). Fictional data, no personal details.
- Voice: climb the ladder in [media](../../references/media.md#voice-decide-what-is-possible-before-offering-it).
  Narration says each step while it happens. With no voice the tutorial is caption-led: step titles
  plus subtitles of the instruction, timed by reading speed.
- Music: none, or a quiet bed 18-22 dB under the voice. No lift needed.

## Engine profile

| Key | Value | Base (promo) | Why |
| --- | --- | --- | --- |
| continuity | chaptered | seamless | steps are chapters; hard cuts inside a recording keep it honest and short |
| popsGate | declared cuts | strict | cuts inside recordings are listed in `cuts.json`; any other pop still fails |
| hook | the outcome and the time it takes, in 3 s | a line held 2 s | search viewers want the result, then step 1 |
| captions | step titles (statements, up to 8 words so exact UI labels fit) + subtitles, 2 lines, 32-42 characters, shown with the action | statements rising into a still | a tutorial says it while doing it |
| music | none or a bed under the voice | bed with a lift | instruction is easier with little music |
| durations | from the voice, or from reading time when caption-led, on the grid | grid | the words set the pace |
| shortCut | a teaser pointing to the full video | fewer ideas | a tutorial cannot lose steps |
| critique | base 8 + "a stranger can repeat each step" + "words and action within 0.3 s" | base 8 | the test of a tutorial is whether someone can follow it |

Kept from the base: the motif (step markers are made of it; the chapter boundaries are its floods or
morphs, never a centered title on a gradient), springs, the grid, fonts, safe zones, no AI giveaways.

## Build notes

- Chapters: one Sequence per step; the boundary between chapters is a motif transition, cuts only
  inside a step's recording, each written to `out/<id>.cuts.json`.
- Cursor zoom: `assets/templates/cursor-zoom.ts`; wide at the start of each step, back out at its end.
- Subtitles: with a voice, `@remotion/captions` from its transcript, shipped as an SRT with the YouTube
  master (the player shows it) and burned only into feed cutdowns. Caption-led, the instruction lines
  are on-screen text, burned in by design; an SRT is optional.
- A calm hold is not dead air: the result stays on screen, the camera breathes, the step marker holds.
- UI state changes ease too, or `frame-pops.mjs` flags them: a subtitle leaves before the next enters
  (a few frames each way), focus rings and selections grow in on the spring, a page pushes on the
  camera's quintic ease. Nothing swaps in one frame.
- One deliverable (a YouTube master): skip the square canvas; the cursor-zoom camera is the camera.
  Keep the zoomed product inside a rounded screen window above the caption band: a window is part of
  the product picture, not a frame border (the ban is on decorative borders around the whole video).
- Music with no lift: skip `musicCue()` (it needs a lift frame) and play the bed from its quiet
  opening (`trimBefore: 0`) with `musicVolume()`; or give it a lift on the turn (step 3's result).

## Verification

Pops with `--cuts=out/<id>.cuts.json`: zero undeclared. Loudness about -16 LUFS with a voice; a
caption-led tutorial's bed sits lower on purpose (around -24 to -20 LUFS) so it never competes with
reading; true peak under -1 dBFS either way. Words-to-action offset under 0.3 s at every step (the voice line's or the caption's start against
the action's frame). The phone sheet (15 frames over the whole length), for the master and any cutdown. Critique: the base 8 plus a
stranger test: someone who never saw the product repeats each step from the video alone.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A brand intro before step 1 | The outcome in 3 s, then step 1; the brand at the end |
| Zoomed in from the first frame | Show where the control lives, then zoom |
| The caption arrives after the click | Say it while doing it |
| Every step at promo speed | Hold 1-2 s on each result |
| A 4-minute tutorial squeezed into a Reel | A vertical teaser that points to it |
