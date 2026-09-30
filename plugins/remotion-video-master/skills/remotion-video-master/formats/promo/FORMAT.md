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

## Story shape: every shot has a job

A promo sells, so it is built on a spine of jobs, and the jobs come before any visual idea:

| Job | Time (30 s) | What it does for the viewer |
| --- | --- | --- |
| Hook | the first 1 to 3 s | Makes this viewer stay: a picture already moving on frame 0 and, usually, a short line; chosen for the film from the kinds in [hooks](../../references/hooks.md) (in the middle of it, the result first, a question, the problem seen, a contradiction, the build), never a fixed shape |
| Promise | 2-6 s | Says what this brand gives them, the one message, in the brand's own words; the brand is seen or named here, not only at the end |
| Proof | 2 or 3 beats | Each answers one doubt a viewer has (is it good, is it for me, can I do it, why this one) with the real product, place or people: a cursor driving the real product, or the real thing and the hands that use it; the lift on the strongest proof |
| Offer | 1 or 2 beats | Exactly what can be bought, booked or tried, concrete (not a list of everything the brand does) |
| Close | 2-4 s | The brand, one action, where to do it |

Write this beat sheet first, one row per shot, with each shot's job (`job` in the visual brief, shown
on the page). A shot whose job cannot be named is cut, however good it looks.

**Then the motif carries it, and it is not optional.** The motif (SKILL.md, Find the motif first) is
the one object that runs through the whole film and makes it flow: the viewer meets it in the hook
or right after, it links the shots (match cuts on it, the same object passed from shot to shot, a
path the camera follows), it does the turn, and it comes back in the close. Its verb is what the
brand does (the thread stitches because the product tailors). Without it a promo is a sequence of
clips; with a motif that does nothing (a line from the logo, a shape, a pretty object) it is
decoration. What is optional is a gimmick device (a split frame, before-and-after pairs, a counter):
chosen only when it serves a job, never as the idea, because a film built on a gimmick becomes a
trend clip with a logo on the end.

After one viewing, a stranger can say who this is, what they get, why this one, and what to do, and
remembers the one object that carried it. If they cannot, the beat sheet is missing a job or the film
is missing its motif, whatever the motion looks like.

A short cut needs a narrative (build, multiply, improve, brand), not a montage. A teaser withholds
the product and gives the date. A launch film can be a one-take ([one-take-film](../../references/one-take-film.md))
when the motif travels.

## Dense, varied, and handed from shot to shot

The pacing and the handoffs a promo is held to ([handoffs](../../references/handoffs.md)); the
visual brief checks the ones a plan can show, and the film's measurements the rest:

- **About 12 to 15 compositions in 30 s,** each about 1.4 to 3.5 s; one held longer changes inside.
- **The subject spans 60 to 85% of the usable frame** along its longer side, and the scale changes: at least three of macro,
  close, medium, wide, overhead and full-frame type, never the same three shots running.
- **One or two things to read at a time:** dense is not busy.
- **Every cut carries something:** the motif, or a real object, shape or movement that sits in the
  same place on both sides. "On the beat" says when, not what.
- **Three moments a viewer remembers,** each a thing and what it becomes, named before the storyboard.
- **Nothing stands still:** no stretch over 0.6 s, 1 s in 30 s in all; a hold is cut to what its
  words need, and the reading time that remains keeps a slow push, about 2% of scale a second.

A calm brand keeps all of it: calm is fewer things in the frame, slower moves and a quieter track,
never dead time.

## In the feed

Reels, TikTok, Shorts and Stories: the first two seconds decide, and a promo there runs 15 to 30 s
with the turn in its first half. The rules: [feed](../../references/feed.md). The hook opens the
spine above; it never replaces it.

## Professional finish

What separates an ad from a feed clip, and costs little once planned:
- **One look.** Every clip graded to the same color and contrast, stabilized, and cut to its best
  one or two seconds.
- **A clean frame.** Clutter that is not the story (a kitchen, cables, a bin) is cropped out, or the
  shot is swapped for another take; the subject is framed, not found.
- **Designed words.** Captions in the brand's typeface, one size system, one position, one accent:
  they read as the brand's, not as a phone app's text.
- **The brand present early.** Its color or mark within the first seconds, subtly; its name by the
  promise; its logo and action at the close.
- **Sound edited to the picture.** The track starts on its beat, its lift lands on the strongest
  proof, and it ends on a button or a clean hit under the close, never a fade in the middle of a bar.

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
| hook | chosen per film: a picture moving on frame 0, clear within 3 s (1 s in a feed) | same | no one opening fits every film |
| captions | statements: 3 per 15 s, 4-6 words, rise into a calm picture, held 1.5 s; the hook line is counted but the picture under it keeps going | same | |
| music | bed with its lift on the payoff | same | |
| durations | grid | grid | |
| stillness | no still stretch over 0.6 s; 1 s per 30 s in all | same | a hold keeps a slow push |
| shortCut | fewer ideas at the long cut's pace | same | |
| critique | the base 14 (story and copy first; the brand's look, transitions, graphics, professional finish, the cover and "every cut carries something" included) | same | |

## Build notes

The whole engine applies as written: [architecture](../../references/architecture.md) (manifest,
`expand()`, chain, transitions), [creative-rules](../../references/creative-rules.md) (story, continuity,
motion, captions, lengths and placements, ads and honesty), [music-bed](../../references/music-bed.md).
Transitions (`assets/templates/transitions.ts`): cuts on the beat and match cuts on the motif by
default, shared elements where scenes share one, and the motif's full treatment (a push through the
real object, or a flood in its shape, `assets/templates/flood.ts`) only at the turn and the close:
at most one per 15 s, plus the close. A cutdown is re-scripted, not trimmed ([story](../../references/story.md)).

**A physical product, a place or a service** (a studio, a shop, a maker, food) is shot, not captured,
and the brand read's Look row sets the grammar:
- The brand's own photos are assets: products photographed on seamless white, or in homes, are how
  the brand already sees itself; a film in the same language looks like it.
- Grade every clip to one look before the first scene: phone footage from different days in
  different light reads as a pile of clips.
- Cut on shape and motion (a round loaf to a round plate, a hand to a hand), not on a timer; hold a
  beautiful frame longer rather than add one.
- A process is shown in the world, never turned into interface: a row of step labels over the
  footage makes a craft look like a checkout flow.
- Words stay few when the brand calls itself minimal: a caption on every beat is the opposite of
  clean.

## Verification

Pops with `--cuts` (only declared beat cuts). Frozen time with `frozen-time.mjs` (0.6 s, 1 s per
30 s). Motif coverage within budget, the cover measured clean. Loudness about -16 LUFS (silent for
loops); with effects, the music-only twin and no effect louder than the music. Safe zones per
shipped platform; the phone sheet; text contrast at 4.5:1; a loop's seam scan. Critique at three
points (the concept, the storyboard, then each scene alone and the film in at most three rounds),
each cut on its own: the base criteria, all 8 or more, and the last critic's SHIP.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A flood that is a plain disc | Grow the motif's silhouette |
| A flood on every boundary | Cuts on the beat; the motif carries the turn and the close |
| The motif pops up before the real object was seen | Open on the real thing, hold it, then let the motif act |
| Four captions and a hook in 15 s | Three lines, the hook included (four with the close); each costs about 2.5 s of still picture |
| The 15 s cut is the 30 s cut, faster | Drop ideas, keep the pace |
| Music under the landing loop | Loops are silent |
| A feed promo that opens on the slogan, a packshot or a quiet intro | Frame 0 is the strongest moving picture, with a hook line and the beat already playing |
| A finished picture on frame 0 that waits two seconds under its line | The picture is already happening and keeps going; the line stays for its reading time, the picture never waits for it |
| The same opening shape on every film | Write five hooks of different kinds and choose by what this film has |
| A calm brand, so a calm opening | The Look sets the frame and the timbre, not the energy: open clean and hard |
| A 51 s Reel because engagement peaks at 45-60 s | That is organic storytelling; a feed promo is 15-30 s with the turn in the first half |
| A split screen for the whole film | Every picture at half size; use a split once, at the turn |
| Starting from a gimmick device (before-and-after pairs, a split frame) and fitting the story to it | The beat sheet of jobs first, then the motif that carries them; a gimmick only where it serves a job |
| A promo with no motif: good shots, no flow | One object from the brand's action runs through it: met in the hook, linking the shots, doing the turn, back in the close |
| A motif named, then nine cuts "on the beat" | Each cut says what it carries: the motif, or a real object, shape or movement in the same place on both sides |
| A small card in the middle of an empty frame, "with room to breathe" | The subject spans 60 to 85% of the usable frame along its longer side; minimal is fewer things, not smaller ones |
| Holds where only the camera breathes (each caption's rest, the end card) | A slow push, about 2% of scale a second, across each hold; measure with `frozen-time.mjs` |
| A long hold kept, with a push added so the measure passes | The push is for reading time; a hold nothing needs is cut, or something happens in it |
| The same framing shot after shot | Change the scale: macro, close, medium, wide, overhead, type |
| A calm brand, so long holds | Calm is fewer things and slower moves; the picture never stops |
| A strong hook with nothing a viewer could act on after it | Hook, promise, proof, offer, close: a stranger can say who, what, why this one, what to do |
| Phone footage as found: mixed color, clutter in frame, app-style text | One grade, a clean frame, captions in the brand's type (Professional finish) |
