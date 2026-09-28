---
name: remotion-video-promo
description: Use when making a product promo, ad (bumper, 15 s or 30 s), teaser, launch film, one-take launch film or landing page loop with Remotion; when adding music, captions, aspect ratios or a new language to one; when cutting a shorter or longer version; or when setting up a promo video pipeline in a new project.
compatibility: Node 18+, ffmpeg and ffprobe on PATH, Remotion 4.x with React 18 or 19.
---

<!-- Generated from remotion-video-master 0.4.0 by scripts/sync.mjs. Do not edit here: change remotion-video-master, then run the sync. fingerprint: 4935ffb9ed3f -->

# Remotion promo video

Promo videos with Remotion, from the brief to measured renders. This is the promo specialist
of remotion-video-master: the same engine and checks, fixed to one kind of video. [The promo module](formats/promo/FORMAT.md)
sets its story shape, lengths, rules and checks: read it before the intake. For any other kind of
video, use remotion-video-master, which covers them all.

## 0. Is it new?

List compositions first (`npx remotion compositions`, or the project's dry-run): often the ask is
already rendered. A clip is a manifest row, not new code: a new cut, aspect or locale of a film that
is already rendered is a row and skips the intake. Raw clips in the project are assets, not a film:
they go through the intake. A new product moment in an existing video is one new scene:
fill the motif block if the project has none, then write the scene, register it, give it a focus
rect and a containment test ([architecture](references/architecture.md)). A new scene is the last
resort; anything bigger starts with the intake.

## 1. Intake: the brainstorm (hard gate)

Nothing is built past the style frames before the user approves the **visual brief**. This is
the brainstorm for a video; do not also run a generic brainstorming skill. Users rarely know what
the skill can make, and cannot judge a list of options: infer, decide as a recommendation, and show.
Details and hands-off rules: [intake](references/intake.md).

1. Read the ask, the product, its locales, its footage and any existing video project; take every
   answer they already give.
2. The goal is set: this skill makes promo videos. Ask only what is still open, in **one question
   call at most**, recommended option first: usually where it runs, or the kind of promo when the
   module lists several. If the ask is really another kind of video, say so and recommend remotion-video-master.
3. Run `node ${CLAUDE_SKILL_DIR}/scripts/recommend.mjs --format=<id> --platforms=<id,id>` (a tutorial
   or onboarding video adds `--steps=<n>`) and take its recommended length; its aspects, safe zones,
   captions and warnings go in the brief.
4. Decide the source, the voice (only what is possible), the motif and the reference yourself, as
   recommendations, and write the script (section 3), each cutdown as its own.
5. Show the **visual brief** (section 6, step 1) and ask one thing: go, or change any line or shot.
   Hands-off, "just make it", or running as a subagent: show it and continue.

## 2. The promo module

[formats/promo/FORMAT.md](formats/promo/FORMAT.md) is this skill's format: its story shape, lengths, engine profile, build notes
and checks apply on top of everything below. Numbers come from `assets/specs.json`
([platforms](references/platforms.md)).

## 3. Story, script and copy: the core

The narrative, the script and the words decide whether a video works; the motion only delivers them.
Before any beat map: the one message in one sentence, the format's arc (tension first, one turn,
show then say), and every word written in a script table (beat, time, picture, words, motif), read
aloud, timed (about 2.5 spoken words a second; about 0.3 s a word on screen, at least 1.5 s a line)
and cut by a third. Each cutdown is a script of its own: its own one-sentence message, a cold read
by someone who has not seen the long cut, and no scene whose setup was dropped. Five hooks written, the best two or three shown; the product's own words; no
filler a rival could say; one call to action. The script is approved with the brief. Rules and
templates: [story](references/story.md).

## 4. Find the motif first

The motif is one object the film is made of. It comes from the brand's promise and from what
the product does to the viewer's problem, and it is decided before the beat map. A CV builder
whose name means tailored got a tailor's thread and needle: it stitches the CV, threads the job
tags and sews the wordmark shut. The motif is a character with an arc, not a wipe: the viewer
meets the real object, it does what the product does, and it carries the film's turns. A shape
that fits every brand says nothing about this one.

| Slot | What goes in it | CV-builder example |
| --- | --- | --- |
| Promise | The brand's promise plus the product's action, in one phrase | tailoring one CV to each job |
| Motif | The object that phrase suggests | a tailor's thread and needle |
| First meeting | Where the viewer first sees the real object, held at least 1 s before it is ever abstracted, moved or used as a shape | the needle, threaded, over the first CV |
| Verb | What the motif does, which must be what the product does (tailor, scan and reveal, sort) | it stitches |
| World | Filmed footage or drawn UI, and where the motif lives in it: on a real surface, on a device's screen, or in the brand's graphic layer ([creative-rules](references/creative-rules.md#graphics-over-footage)) | drawn: the whole film is UI |
| Travels, grows or morphs | Travels (thread, road, cable): a one-take film ([one-take-film](references/one-take-film.md)). Morphs (one element of the product's UI): that element is shared across the boundaries it crosses. Grows or opens (page, box, lid, code): it opens once, at the turn, to reveal what the product does | travels |
| Turns | The one or two boundaries the motif carries: the turn (problem to solution) and the close. Every other boundary is a cut on the beat, a match cut on the motif, or a shared element | the first stitch; the sewn wordmark |
| Echoes | Small appearances in a layer the viewer knows: a caption underline, a step marker, the logo close | the caption underline is a stitch |
| Competitor test | A planning question, never rendered: if this film carried the closest competitor's name, would it still work for them? Test the gesture too (stuck on, or built in). If it would, go back to the promise | a thread means nothing to a brand whose promise is not tailoring |

The competitor never appears in the film in any form (section 9); the test lives in the plan
only. The disc in `flood.ts` is the fallback for a motif with no closed outline; when a turn
uses it, the Turns row says why.

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

1. **The visual brief**, the one approval: build it first, and aim to show it 20 to 30 minutes after the ask:
   - the plan in a few lines ([brief template](references/brief-template.md));
   - two **style frames** at final quality from the real assets: the key moment (the turn) and the
     cover. Render them with the engine (`npx remotion still` of a first scene holding only what those
     frames need); with no Remotion project yet, render them as HTML at the final size in a headless
     browser, the engine Remotion uses, and rebuild them as scenes after the go;
   - a **storyboard of every cut**: each beat's frame from the real assets (footage, captures, or a
     quick still), its time, its words and how the shot is entered;
   - the hook, with two runners-up.

   `node ${CLAUDE_SKILL_DIR}/scripts/visual-brief.mjs docs/visual-brief.json` checks the plan (gaps,
   the grid, reading time) and writes one page; show it and wait for the go (guided). After changes,
   rebuild the page and show it again with what changed named; a one-word fix is confirmed in one line
   and the build goes on.
2. Build from the approved storyboard: its beat list is the beat map, and the style frames become
   real frames of the film.
3. Internal, optional: the rough cut (`visual-brief.mjs --animatic`, 480p with the music) to check
   pacing and reading time, or for a fresh critic to read the story. **Never send it to the user**:
   they will judge it as the film.
4. The primary deliverable, one aspect, at full quality.
5. The critique loop, scored cold by a fresh critic, until every score is 8 or more (section 10).
6. Then the other aspects, cuts and locales.

The user sees only what looks finished: the visual brief, then the film. When the build runs long,
send a few seconds of the turn as a clip at final quality as soon as it exists, without asking
anything.

## 7. Architecture in one screen

| Piece | Rule |
| --- | --- |
| Canvas | Author every scene on one square canvas (1920x1920). Each aspect is a camera window onto it, fitted to the scene's focus rect. When content cannot read at size in an aspect, give that scene a layout per aspect; never shrink text to fit. A single deliverable in one aspect is authored at its own size; when more aspects may follow, author on the square canvas from the start, because moving later means re-authoring every scene. |
| Aspects | `wide` 1920x1080, `tall` 1080x1920, `square` 1080x1080, `classic` 1440x1080, `portrait` 1080x1350, `appstore` 886x1920: whatever the brief's deliverables list. A manifest row that omits `aspects` gets the first four; name them only to exclude. |
| Scene registry | Metadata (duration, focus rects, caption key, persist rect) in a module Node can load; components in a separate map. A scene's `.tsx` never reaches the render script's import path. |
| Manifest | `{ id, format, scenes: [{ scene, from?, to?, transition?, captionOverride?, captionTiming?, musicLift? }], aspects?, locales?, loop?, posterFrame }` |
| `expand()` | Rows x aspects x locales into compositions. Validates windows, the grid, the transitions and the poster frame (`assets/templates/transitions.ts`), the music and the format's profile. Throws rather than renders something wrong. |
| Chain | Every boundary is a cut on the beat unless its entry says otherwise: a match cut on the motif, a shared element or morph, or a motif turn (a flood, or a push through the real object) with its reason. Every cut is written to `out/<id>.cuts.json` for the pops gate. |
| Durations | On the grid (15 frames at 30 fps, one beat at 120 BPM). Voice-led formats size scenes from the audio with `calculateMetadata`, rounded up to the grid. |
| Tokens | One source for every color, size and duration. One accent color. |
| Safe zones | Every text rect inside each shipped platform's safe zone (`assets/templates/safe-zones.ts`), per aspect: Reels and Stories hide the bottom 35%. |

A new project scaffolds in this order: tokens, one scene on the square canvas, the registry,
`expand()`, the chain `Clip`, the render script, then the music bed. Full detail:
[architecture](references/architecture.md).

## 8. Rules a format sets

Each module's "Engine profile" sets continuity, popsGate, transitions, hook, captions, music,
durations, shortCut and critique (`assets/templates/profile.ts`, enforced by `expand()`). The promo
profile is the base: no unmotivated cut (declared beat cuts pass the pops gate, any other pop
fails), at most one motif turn per 15 s plus the close, a hook line held 2 s, 3 statement lines
per 15 s counting the hook, each rising into a still picture, a bed with its lift on the payoff. A module changes a key only with a
written reason (`withOverrides` throws otherwise), so no format quietly lowers the bar. Every
profile's critique starts with **story and copy**.

## 9. Hard rules (every format)

| Rule | Why |
| --- | --- |
| Durations on the grid | Loops seam, cuts land on beats, grain repeats cleanly. Enforce it in `expand()`. |
| Show the real product | Import its components; without code, real captures; never a redrawn version of a UI that exists. |
| Every transition is motivated; the motif carries only the turns | A flood on every boundary reads as an effect pasted over the film: six floods in 30 s put flat color over a third of it, and no boundary mattered more than another. At most one motif turn per 15 s plus the close; the rest are cuts on the beat, match cuts, shared elements (`transitions.ts` counts them). |
| The motif is met before it is abstracted | A shape that appears from nothing and floods the screen reads as a sticker. Show the real object and hold on it first. |
| Graphics belong to a layer the viewer knows | In the world (on a surface, in its perspective), in an interface (a device's screen, a viewfinder), or in the brand's layer (captions, the close): anchored, proportionate, matched in light and grain. A full frame of flat color only at a declared turn or the close (`motif-coverage.mjs`). |
| No competitor, ever | No name, logo, product, packaging or recognizable design, not even blurred or in the background. Contrast with the category's generic problem, and state the brand's advantage positively. |
| The cover is designed | The real product and the promise, settled. Never a transition frame or a field of flat color. |
| No AI giveaways | Text in the corners, decorative borders around the whole video, a centered title on a gradient, everything fading in. |
| Every gesture mirrors the product action | Transitions included. A reveal under a moving element reads as erasing; pasted things appear whole; a code molded into the product never arrives like a sticker. |
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
node ${CLAUDE_SKILL_DIR}/scripts/motif-coverage.mjs out/<id>.mp4 --accent=<hex> [--allow=<turn frames>]
node ${CLAUDE_SKILL_DIR}/scripts/motif-coverage.mjs out/<id>.webp --accent=<hex> --max-share=0
```

- Stills per aspect: nothing clipped, text in the safe zones, legible, RTL mirrored; frame 0 settled.
- Pops: `--cuts=out/<id>.cuts.json`; only declared cuts may pop. Motif coverage: flat accent over at
  most 5% of the runtime, a full frame of it only inside a declared turn or the close, none on the cover.
- Audio about -16 LUFS, true peak under -1 dBFS. Only a tutorial or onboarding video read with
  no voice keeps its bed lower on purpose (about -24 to -20 LUFS: the viewer is reading steps);
  every other video with no voice is music-led and stays at -16. The 360 px phone sheet reads;
  loops pass the seam scan.
- The critique loop: a fresh critic (a subagent that sees only the frames and the one-sentence
  message) first says what a first-time viewer understands every 2 s, then scores each criterion
  of the module's profile from 1 to 10. Fix the three worst, repeat until every score is 8 or more,
  logged in `docs/review_log.md`. Every score at exactly 8 is a warning: get a second critic.

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
  H.264 CRF 18 masters (ad platforms re-encode), CRF 30 + VP9 WebM for in-page loops, a designed
  WebP cover (the poster frame, or a still of its own); SRT alongside when the brief lists it. Publish to a public media bucket separate from
  private uploads.

## Common mistakes

| Mistake | Reality |
| --- | --- |
| Building before the visual brief is approved | It sets the length, the platforms, the words and the look; everything else follows |
| Five rounds of questions | Infer, decide as recommendations, ask one call at most, then show the visual brief |
| Showing the user a rough cut or a half-size render | They judge it as the film; show the visual brief, then finished footage |
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
| A flood on every boundary | Cuts on the beat; the motif carries the turn and the close |
| The motif appears as a shape before anyone has seen the thing | Show the real object, hold it, then let it act |
| Flat graphics floating over footage | Put them on a surface, a device's screen, or the brand's layer |
| The cover is a transition frame | Design it: the product and the promise, settled |
| The short cut keeps a scene whose setup was cut | Re-script it: its own message, its own cold read |
| Scoring your own film at exactly 8 | A fresh critic scores it cold |
