---
name: remotion-video-promo
description: Use when making a product promo, ad (bumper, 15 s or 30 s), teaser, launch film, one-take launch film or landing page loop with Remotion; when adding music, captions, aspect ratios or a new language to one; when cutting a shorter or longer version; or when setting up a promo video pipeline in a new project.
summary: >-
  Promo videos with Remotion: bumpers, 15 and 30 s ads, teasers, launch films and landing page loops. Beat-locked, the brand's motif carrying the turn and the close, four aspects and RTL locales from one manifest.
---

# Promo

Status: full. The engine's own method (published as remotion-video-pipeline until 1.2.1): its rules
are the engine's defaults, and every other format's profile starts from them.

## Fits when

The video sells: a paid or organic ad, a teaser before a launch, a launch film, a feature reveal, a
hero loop. Signals: "ad", "promo", "teaser", "launch", "announce", "15 s", "hero". Not when the viewer
must learn to do something (tutorial) or understand an idea (explainer).

## Lengths and platforms

| Kind | Default | Range | Usual platforms |
| --- | --- | --- | --- |
| Bumper | 6 s | 5-6 s | YouTube (unskippable) |
| Short ad | 15 s | 6-15 s | Reels, TikTok, Stories, X, Pinterest |
| Standard ad | 30 s | 15-34 s | TikTok, YouTube, LinkedIn |
| Teaser | 10 s | 6-15 s | Reels, TikTok, X |
| Launch film | 60 s | 45-90 s | landing page, YouTube, Product Hunt, LinkedIn |
| Landing loop | 10 s | 6-15 s | landing page hero, silent |

Cutdowns come from one master: a shorter cut drops ideas and plays the ones it keeps at the long
cut's pace. A 6 s cut is the hook plus the brand. Unless the brief narrows them, every clip ships in
all four aspects (wide, tall, square, classic) and every locale the product ships, RTL mirrored.

## Story shape

| Beat | Time | What happens |
| --- | --- | --- |
| Hook | 0-2 s (holds to 3) | The problem or the promise in one line, landed within 1 s and held whole 2 s |
| Reveal | 2-4 s | The product appears, made out of the hook's picture |
| Highlights | 2 or 3 moments | One idea each, a cursor driving the real product; the lift on the payoff |
| Close | 2-4 s | The brand, the line, the call to action |

A short cut needs a narrative (build, multiply, improve, brand), not a montage. A teaser withholds
the product and gives the date. A launch film can be a one-take ([one-take-film](../../references/one-take-film.md))
when the motif travels.

## Assets and voice

The motif block first. Real components or live-site captures. No voice by default: the music bed
carries it, the captions tell it (3 lines per 15 s counting the hook, at most 4 with the close). A promo with no voice is
music-led, not caption-led: about -16 LUFS, the lift scored. A loop is silent.

## Engine profile

| Key | Value | Base (promo) | Why |
| --- | --- | --- | --- |
| continuity | seamless: no unmotivated cut | seamless | this is the base |
| popsGate | declared cuts | declared cuts | only the beat cuts listed in `cuts.json` may pop |
| transitions | 1 motif turn per 15 s, plus the close | same | a flood is an exclamation mark |
| hook | line in 1 s, held 2 s | same | |
| captions | statements: 3 per 15 s, 4-6 words, rise into a still, held 1.5 s | same | |
| music | bed with its lift on the payoff | same | |
| durations | grid | grid | |
| shortCut | fewer ideas at the long cut's pace | same | |
| critique | the base 11 (story and copy first; transitions, graphics and the cover included) | same | |

## Build notes

The whole engine applies as written: [architecture](../../references/architecture.md) (manifest,
`expand()`, chain, transitions), [creative-rules](../../references/creative-rules.md) (story, continuity,
motion, captions, lengths and placements, ads and honesty), [music-bed](../../references/music-bed.md).
Transitions (`assets/templates/transitions.ts`): cuts on the beat and match cuts on the motif by
default, shared elements where scenes share one, and the motif's full treatment (a push through the
real object, or a flood in its shape, `assets/templates/flood.ts`) only at the turn and the close:
at most one per 15 s, plus the close. A cutdown is re-scripted, not trimmed ([story](../../references/story.md)).

## Verification

Pops with `--cuts` (only declared beat cuts). Motif coverage within budget, the cover measured clean.
Loudness about -16 LUFS (silent for loops). Safe zones per shipped platform; the phone sheet; a loop's
seam scan. Critique by a fresh critic, each cut on its own: the base criteria, all 8 or more.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A flood that is a plain disc | Grow the motif's silhouette |
| A flood on every boundary | Cuts on the beat; the motif carries the turn and the close |
| The motif pops up before the real object was seen | Open on the real thing, hold it, then let the motif act |
| Four captions and a hook in 15 s | Three lines, the hook included (four with the close); each costs about 2.5 s of still picture |
| The 15 s cut is the 30 s cut, faster | Drop ideas, keep the pace |
| Music under the landing loop | Loops are silent |
