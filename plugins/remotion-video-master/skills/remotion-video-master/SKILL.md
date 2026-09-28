---
name: remotion-video-master
description: Use when asked to make, plan, cut or improve any video with Remotion (a promo or ad, teaser, launch film, product demo, tutorial or how-to, explainer, feature announcement, social clip, testimonial, event recap, app store preview, landing page loop), especially when what it is for, where it runs or how long it should be is still open, as in "make a video for my app".
compatibility: Node 18+, ffmpeg and ffprobe on PATH, Remotion 4.x with React 18 or 19.
---

<!-- master-only -->
<!-- Maintainers: this skill is the single source of the remotion-video-<module> specialist skills.
Each formats/<module> is also published on its own, generated from this folder by scripts/sync.mjs
in the marketplace repo (see its MAINTAINING.md). Edit here, never in a specialist. Blocks between
master-only markers are left out of the specialists; "specialist" comments become their text. -->

# Remotion video master

One place for any Remotion video: agree what it is for, where it runs and how long it is, write
its story, then build it with one engine. Each kind of video is a module in `formats/`; the engine,
the motif and the verification are shared.
<!-- /master-only -->
<!-- specialist
# Remotion {{kind}} video

{{Kind}} videos with Remotion, from the brief to measured renders. This is the {{kind}} specialist
of {{master}}: the same engine and checks, fixed to one kind of video. [The {{kind}} module]({{path}})
sets its story shape, lengths, rules and checks: read it before the intake. For any other kind of
video, use {{master}}, which covers them all.
-->

## 0. Is it new?

List compositions first (`npx remotion compositions`, or the project's dry-run): often the ask is
already rendered. A clip is a manifest row, not new code: a new cut, aspect or locale of existing
footage is a row and skips the intake. A new product moment in an existing video is one new scene:
fill the motif block if the project has none, then write the scene, register it, give it a focus
rect and a containment test ([architecture](references/architecture.md)). A new scene is the last
resort; anything bigger starts with the intake.

## 1. Intake: the brainstorm (hard gate)

No scaffolding, scene or render before the user approves `docs/brief.md`. This is the
brainstorm for a video; do not also run a generic brainstorming skill. Script, fallbacks
and hands-off rules: [intake](references/intake.md).

1. Read the ask, the product and any existing video project; skip what is already answered.
<!-- master-only -->
2. Offer the **goal** (Sell it / Show how it works / Explain an idea / Social or story), the
   **mode** (guided, or hands-off), then the **format** and the **platforms**.
<!-- /master-only -->
<!-- specialist
2. The goal is set: this skill makes {{kind}} videos. Offer the **mode** (guided, or hands-off), the kind of
   {{kind}} when the module lists several, and the **platforms**. If the ask is really another kind
   of video, say so and recommend {{master}}.
-->
3. Run `node ${CLAUDE_SKILL_DIR}/scripts/recommend.mjs --format=<id> --platforms=<id,id>` (a tutorial
   or onboarding video adds `--steps=<n>`: its steps set the length) and offer its **lengths** with their reasons; its aspects, safe zones, captions and warnings go in the brief.
4. Offer the **source**, the **voice** (only what is possible), the **motif** and a **reference**.
5. Write the script (section 3) and [the brief](references/brief-template.md); show a summary with the
   hook options; approve. Recommended option first, always; hands-off lists its assumptions.

<!-- master-only -->
## 2. Formats

Load only the chosen module. A stub names its nearest full module: read that, then apply
the stub's deltas. Numbers come from `assets/specs.json` ([platforms](references/platforms.md)).

| Format | Module | Default length |
| --- | --- | --- |
| Short ad, standard ad, bumper, teaser, launch film, landing loop | [promo](formats/promo/FORMAT.md) | 15 s / 30 s / 6 s / 10 s / 60 s / 10 s |
| Product demo | [product-demo](formats/product-demo/FORMAT.md) | 2 min |
| Tutorial, how-to | [tutorial](formats/tutorial/FORMAT.md) | 3 min |
| Explainer | [explainer](formats/explainer/FORMAT.md) | 75 s |
| Feature announcement | [feature-announcement](formats/feature-announcement/FORMAT.md) (stub, promo) | 30 s |
| Social clip | [social-organic](formats/social-organic/FORMAT.md) (stub, promo) | 30 s |
| Event recap | [event-recap](formats/event-recap/FORMAT.md) (stub, promo) | 60 s |
| App store preview | [app-store-preview](formats/app-store-preview/FORMAT.md) (stub, product-demo) | 25 s |
| Onboarding | [onboarding](formats/onboarding/FORMAT.md) (stub, tutorial) | 60 s a step |
| Testimonial | [testimonial](formats/testimonial/FORMAT.md) (stub, explainer) | 60 s |
<!-- /master-only -->
<!-- specialist
## 2. The {{kind}} module

[{{path}}]({{path}}) is this skill's format: its story shape, lengths, engine profile, build notes
and checks apply on top of everything below. Numbers come from `assets/specs.json`
([platforms](references/platforms.md)).
-->

## 3. Story, script and copy: the core

The narrative, the script and the words decide whether a video works; the motion only delivers them.
Before any beat map: the one message in one sentence, the format's arc (tension first, one turn,
show then say), and every word written in a script table (beat, time, picture, words, motif), read
aloud, timed (about 2.5 spoken words a second; about 0.3 s a word on screen, at least 1.5 s a line)
and cut by a third. Five hooks written, the best two or three shown; the product's own words; no
filler a rival could say; one call to action. The script is approved with the brief. Rules and
templates: [story](references/story.md).

## 4. Find the motif first

Every transition is made of one motif: an object that comes from the brand's name or
promise and from what the product does to the viewer's problem. It is decided before
the beat map, because it decides what the beats look like. A CV builder whose name
means tailored got a tailor's thread and needle: it stitches the CV, threads the job
tags, and sews the wordmark shut. A shape that fits every brand says nothing about this one.

| Slot | What goes in it | CV-builder example |
| --- | --- | --- |
| Promise | The brand name or promise plus the product's action, in one phrase | tailoring one CV to each job |
| Motif | The object that phrase suggests | a tailor's thread and needle |
| Travels, grows or morphs | Travels (thread, road, cable, river): a one-take film ([one-take-film](references/one-take-film.md)). Grows or opens (page, drop, bubble, leaf, tag, box): a chain whose floods are its silhouette. Morphs (one element of the product's own UI): a chain where that element never cuts and is shared on every boundary | travels |
| Transitions | How the motif carries each boundary | the needle strikes, stitches, threads |
| Echoes | Where else it appears: caption underline, a score, the logo close | the caption underline is a stitch |
| Competitor test | Put the closest rival's logo on the film. What stops making sense? A rival shares the features, so the answer comes from the name or the promise | a thread means nothing to a brand whose promise is not tailoring |

If only the logo breaks, the motif is decoration: go back to the name and the promise.
The disc in `flood.ts` is the fallback for a motif with no closed outline; when a flood
uses it, the Transitions row says why.

## 5. Reference and real assets

- **A reference in the brief**: write `docs/style_guide.md` from it before the beat map
  (palette hex, type, shot lengths, transitions, camera moves, texture, how text enters and
  exits); commands in [verification](references/verification.md#read-a-reference). Its
  grammar, never its content; where it breaks a hard rule, the rule wins.
- **Real assets**: the product's own components when its code is in the repo. No code access:
  capture the live site with Playwright into `./assets` (each screen state, the logo, colors,
  fonts) and list what you found before animating. A product with no UI yet gets its UI designed
  once, as components, treated as the real ones. A native app (iOS, Android, React Native) has no
  web components to import: record the device or simulator from a shot list (the user records when
  this machine cannot run the simulator), or use react-native-web if the app already runs on the web.
  Recordings, captions and voice: [media](references/media.md).

## 6. Order of work

1. The approved brief: style guide, real assets, the script (section 3), the motif block.
2. Beat map, built from the script table: beat, time, what changes, the words on it.
3. Stills of 3 or 4 key moments, for sign-off.
4. Animatic: the whole film at half size (`--scale=0.5`) with the real music or voice (a
   silent loop gets a click on every beat). Fix pacing here, before any polish.
5. Full renders, one aspect at a time.
6. The critique loop until every score is 8 or more (section 10).

## 7. Architecture in one screen

| Piece | Rule |
| --- | --- |
| Canvas | Author every scene on one square canvas (1920x1920). Each aspect is a camera window onto it, fitted to the scene's focus rect. When content cannot read at size in an aspect, give that scene a layout per aspect; never shrink text to fit. A single deliverable in one aspect is authored at its own size; when more aspects may follow, author on the square canvas from the start, because moving later means re-authoring every scene. |
| Aspects | `wide` 1920x1080, `tall` 1080x1920, `square` 1080x1080, `classic` 1440x1080, `portrait` 1080x1350, `appstore` 886x1920: whatever the brief's deliverables list. A manifest row that omits `aspects` gets the first four; name them only to exclude. |
| Scene registry | Metadata (duration, focus rects, caption key, persist rect) in a module Node can load; components in a separate map. A scene's `.tsx` never reaches the render script's import path. |
| Manifest | `{ id, format, scenes: [{ scene, from?, to?, captionOverride?, captionTiming?, musicLift? }], aspects?, locales?, loop?, posterFrame }` |
| `expand()` | Rows x aspects x locales into compositions. Validates windows, the grid, the poster frame, the music and the format's profile. Throws rather than renders something wrong. |
| Chain | Boundaries follow the profile's continuity: a shared element, a morph, or a flood in the motif's shape; a declared cut only where the profile allows one, written to `out/<id>.cuts.json`. |
| Durations | On the grid (15 frames at 30 fps, one beat at 120 BPM). Voice-led formats size scenes from the audio with `calculateMetadata`, rounded up to the grid. |
| Tokens | One source for every color, size and duration. One accent color. |
| Safe zones | Every text rect inside each shipped platform's safe zone (`assets/templates/safe-zones.ts`), per aspect: Reels and Stories hide the bottom 35%. |

A new project scaffolds in this order: tokens, one scene on the square canvas, the registry,
`expand()`, the chain `Clip`, the render script, then the music bed. Full detail:
[architecture](references/architecture.md).

## 8. Rules a format sets

Each module's "Engine profile" sets continuity, popsGate, hook, captions, music, durations,
shortCut and critique (`assets/templates/profile.ts`, enforced by `expand()`). The promo profile is
the base's rules exactly: seamless, zero pops, a hook line held 2 s, 3 statement captions per 15 s
rising into a still picture, a bed with its lift on the payoff. A module changes a key only with a
written reason (`withOverrides` throws otherwise), so no format quietly lowers the bar. Every
profile's critique starts with **story and copy**.

## 9. Hard rules (every format)

| Rule | Why |
| --- | --- |
| Durations on the grid | Loops seam, cuts land on beats, grain repeats cleanly. Enforce it in `expand()`. |
| Show the real product | Import its components; without code, real captures; never a redrawn version of a UI that exists. |
| Every transition is made of the motif | Plans without a motif flooded every boundary with a plain disc, the shape that fits any brand. |
| No AI giveaways | Text in the corners, decorative borders around the whole video, a centered title on a gradient, everything fading in. |
| Every gesture mirrors the product action | A reveal under a moving element reads as erasing. Pasted things appear whole. |
| Fake company names next to invented metrics | A real employer beside an invented score fails ad review. |
| Never loosen a containment or safe-zone test | Move the content. |
| Interior chain entries start at `from: 0` | Windowing one mounts it early and overpaints the previous scene. |
| Loops carry no music | A track cannot loop inside a short loop, and in-page loops play muted anyway. |
| Load fonts explicitly and prove it | A missing font falls back silently and still looks plausible. |

## 10. Look at it, then measure it

Rendering is not verification. Every silent bug in the original pipeline passed type checks
and hundreds of unit tests and was caught only by rendering a frame and looking. Details:
[verification](references/verification.md).

```bash
npx remotion still src/index.ts <composition-id> out/check.png --frame=120
node ${CLAUDE_SKILL_DIR}/scripts/frame-pops.mjs out/<id>.mp4 [--cuts=out/<id>.cuts.json]
node ${CLAUDE_SKILL_DIR}/scripts/audio-check.mjs out/<id>.mp4
```

- Stills per aspect: nothing clipped, text in the safe zones, legible, RTL mirrored; frame 0 settled.
- Pops: zero for strict formats; `--cuts` for formats with declared cuts (any other pop fails).
- Audio about -16 LUFS, true peak under -1 dBFS. Only a tutorial or onboarding video read with
  no voice keeps its bed lower on purpose (about -24 to -20 LUFS: the viewer is reading steps);
  every other video with no voice is music-led and stays at -16. The 360 px phone sheet reads;
  loops pass the seam scan.
- The critique loop: score each criterion of the module's profile from 1 to 10, fix the
  three worst, repeat until every score is 8 or more, logged in `docs/review_log.md`.

## 11. Music, voice and rendering

- Music bed: a track whose beat is a whole number of frames, fitted with
  `scripts/fit-beat-grid.mjs`, the lift on the payoff (`assets/templates/music.ts`, a vetted
  CC BY 120 BPM track in `assets/music/`). Method: [music-bed](references/music-bed.md).
  Remotion 4.0.3xx renamed `Audio` to `Html5Audio` and `startFrom` to `trimBefore`; the old names break.
- Voice: the user's recording, an AI voice only when its key is already in the environment, a
  machine voice for drafts; with none of those the video is caption-led by design (step titles,
  subtitles timed by reading speed, an SRT). Never ask for a key in chat. Ladder and mechanics:
  [media](references/media.md). Music sits 18 to 22 dB under a voice.
- Render: bundle once, `renderMedia` per composition, in batches of one aspect at a time (a full
  unattended run has crashed Chromium; skip outputs newer than their sources). Remotion's H.264 may
  be tagged full-range yuvj420p: platforms take it; re-encode with `-pix_fmt yuv420p` if one refuses.
  H.264 CRF 18 masters (ad platforms re-encode), CRF 30 + VP9 WebM for in-page loops, a WebP
  poster; SRT alongside when the brief lists it. Publish to a public media bucket separate from
  private uploads.

## Common mistakes

| Mistake | Reality |
| --- | --- |
| Building before the brief is approved | The brief sets the length, the platforms and the words; everything else follows |
| Treating every video as a promo | Each format sets its own rules; a tutorial breaks half the promo rules on purpose |
| A length that fights the platform | Run `recommend.mjs`; offer a master plus cutdowns |
| Captions in the bottom third on Reels | The platform UI covers the bottom 35% |
| Writing a new scene for a new cut | Usually a manifest row slicing existing footage |
| A duration like 200 frames | Off the grid: breaks loops, beats and grain |
| "It rendered, so it works" | Render a still and look; measure the audio |
| Rendering everything in one run | Batch by aspect |
| Trusting a tempo estimate | Fit the grid over the whole track and check `framesPerBeat` |
| Chasing a 20 to 40 ms audio offset | That is codec priming, under one frame; leave it |
| Music under an in-page loop | Loops stay silent |
