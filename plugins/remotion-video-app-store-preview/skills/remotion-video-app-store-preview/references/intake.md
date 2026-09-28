# Intake: the brainstorm before any video

The intake decides what the video is for, where it runs and how long it is, and ends in one
approved **visual brief**: the plan, the style frames and a storyboard of every cut. This is the
brainstorm for a video: do not also run a generic brainstorming skill.

Most users cannot say what they want from a list of options, and do not know what the skill can
make. They can react to something that looks like the film. So the intake infers, decides as a
recommendation, and shows; it asks as little as it can.

## Step 0: infer everything you can

Read the ask, the product's README or landing copy, recent commits, the locales it ships (i18n
files), the footage and images in the project, and any Remotion project already in the repo. Every
answer the ask or the product already gives ("a 15 s Reels ad", clips of the product in use) is
taken, not asked. A re-cut, a new locale or a new aspect of a film that is already rendered skips
the intake (SKILL.md §0); raw clips are assets, not a film, and go through it.

## One question call, at most

Ask only what Step 0 could not settle, in a single call, the recommended option first with
"(Recommended)" and a one-line reason. With a structured question tool (AskUserQuestion in Claude
Code): up to 4 questions, 2 to 4 options each; the user can always answer in their own words.
Without one: a numbered menu in one message, ending "Reply with a number, or say it in your own
words." What may be in it, and only when nothing points to an answer:

- The goal is set: app store preview videos ([the module](../formats/app-store-preview/FORMAT.md)). When the ask is really another kind of
  video, say so in one line and recommend remotion-video-master, which covers every kind; never ask what the
  video is for. **Which kind of app store preview**, only when the module lists several.
- **Where it will run** (multi-select): the family's top 4 platforms (`specs.json` families), the
  likeliest first.
- **What we show**, only when the project has no product code, footage or captures: capture the live
  site / your screen recording / design the UI once (a product that doesn't exist yet).
- **The voice**, only when the format usually carries one and nothing says which: first check what is
  possible ([media](media.md#voice-decide-what-is-possible-before-offering-it)), then offer only what
  works: **captions only** (recommended when nothing else is available or the platforms autoplay
  muted) / **your own recording** / **an AI voice** (only with a key present). Never ask for a key in
  chat. With no voice, the video is caption-led by design, not a lesser version.

Everything else is decided, as a recommendation the user sees in the visual brief: the length, the
source, the motif, the reference, the hook.

## Decide, then show

- Run `node ${CLAUDE_SKILL_DIR}/scripts/recommend.mjs --format=<id> --platforms=<id,id>` and take its
  recommended length; when it returns a master plus cutdowns, plan both and say which platform needs
  the cutdown. A tutorial or onboarding video first counts the task's steps and adds `--steps=<n>`.
- The motif: the strongest candidate that passes the competitor test (a question in the plan: would
  it still work for the closest competitor? the competitor is never shown), with where the viewer
  first meets the real thing and the one or two turns it carries (SKILL.md, Find the motif first).
- The reference: the product's own look, unless the user gave one.
- The script ([story](story.md)): the one message, the arc, every word timed; the best hook and two
  runners-up. Each cutdown is its own script.

Then build the visual brief (SKILL.md, Order of work, step 1): `docs/visual-brief.json` holds the
plan, the style frames, the hook and a storyboard per cut; `scripts/visual-brief.mjs` turns it into
one page. The storyboard shows each beat's frame from the real assets, its time, its words and how
the shot is entered. Show the page and ask one thing: **go**, or change any line or any shot. The
words, the order and the look are approved here, before anything is animated. `docs/brief.md` is the
record behind it (brief-template).

## Hands-off

Hands-off, running as a subagent, or "just make it" / "skip the questions": no question call; write
`docs/brief.md` with an **Assumptions** section listing each choice made for the user, show the
visual brief, and continue without waiting. With nobody to answer, note it in `docs/review_log.md`
and hand the visual brief back with the result. Never skip the visual brief itself.

## What the user is shown, and what they are not

The user sees what looks finished: the visual brief (its style frames are final quality), then the
film. The rough cut (`visual-brief.mjs --animatic`) is internal, for pacing and reading time: a user
shown a rough cut judges it as the film.

## Push back when the ask is wrong

When the chosen length fights the platform (a 3 min tutorial for Reels), plan a master plus
cutdowns and say so plainly in the brief. When the ask would produce dead air or unreadable
captions, plan the length that works and say why in one sentence.
