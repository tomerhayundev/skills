# Intake: the brainstorm before any video

The intake decides what the video is for, where it runs and how long it is, and ends in one
approved **visual brief**: the plan, the style frames and a storyboard of every cut. This is the
brainstorm for a video: do not also run a generic brainstorming skill.

Most users cannot say what they want from a list of options, and do not know what the skill can
make. They can react to something that looks like the film. So the intake infers, decides as a
recommendation, and shows; it asks as little as it can.

Users are not creative directors and do not write prompts: they ask for what comes to mind, often
a list of things to include. The ask is raw material. Turning it into one story that fits the brand
is the skill's job, never handed back to the user.

## Step 0: infer everything you can

Read the ask, the product's README or landing copy, recent commits, the locales it ships (i18n
files), the footage and images in the project, and any Remotion project already in the repo. Read
what the brand says about itself, word for word: the site's hero line, its about page, collection
and product copy, the tag under its logo, its social bio when there is access, and note what each
line is about: the whole brand, or one collection, product or season. These feed the brand read
([brand-read](brand-read.md)), which comes before the motif and the script. Every
answer the ask or the product already gives ("a 15 s Reels ad", clips of the product in use) is
taken, not asked. Earlier films and ads of the brand in the folder are read for one thing: what not
to repeat (`before.md`, SKILL.md §0). They are never the reference, and the material is the whole
catalog (every product page on the site, every packshot and album), not the clips an earlier film
picked. A re-cut, a new locale or a new aspect of a film that is already rendered skips
the intake (SKILL.md §0); raw clips are assets, not a film, and go through it.

## The chooser

The user cannot judge a list of options in words, and does not know what the skill can make. The
chooser shows it: one page, one screen, with the recommendation already selected, so a user who
only presses Done gets the recommended film, and a user who looks sees every style moving, all on one screen
([styles](styles.md)). It is the only question round; there is no other question call.

1. From Step 0, settle what you can: the kind of video (a format id from `specs.json`), the
   platforms the ask names, what material exists (`footage`, `photos`, and `ui` when there is an app
   or a website), and which tools you can call in this session that make images, video, voice or
   stock footage (`--connected=image,video,voice,stock`: the script cannot see your tool list).
   The goal is set: onboarding videos ([the module](../formats/onboarding/FORMAT.md)). Run the chooser with `--lock-format`,
   so only the kinds of this module can be picked. When the ask is really another kind of video, say
   so in one line and recommend remotion-video-master, which covers every kind.
2. Recommend one style, or two that pair, each with a reason from this ask in the user's words
   (`--recommend="footage:your clips of the shop carry the proof"`). With no reason that comes from
   the ask, leave `--recommend` out: the library's default for the format and the material is used.
3. Anything else still open goes on the page as at most three questions, written to
   `docs/chooser-questions.json` as `[{ "id", "question", "options": [{ "id", "label" }], "recommended" }]`
   in the user's language, and only when nothing points to an answer:
   - **The voice**, when the format usually carries one (`recommend.mjs` says so): first check what is
     possible ([media](media.md#voice-decide-what-is-possible-before-offering-it)), then offer only
     what works: **captions only** (recommended when nothing else is available or the platforms
     autoplay muted) / **your own recording** / **an AI voice** (only when a voice key or tool was
     found). Never ask for a key in chat. With no voice, the video is caption-led by design, not a
     lesser version.
   - **What we show**, only when the project has no product code, footage or captures: capture the
     live site / your screen recording / design the UI once (a product that doesn't exist yet).
   - **More material**, only when something the ask names has no footage, photo or capture at all
     (a delivery service with no footage of a delivery): **build it from what there is**
     (recommended) / **I have it, or can make it**. This is the one moment material is asked for
     ("Build from what exists", below).
4. Run it in the background and open the page:

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/choose.mjs --format=short-ad --platforms=reels --material=footage,photos --recommend="footage:your clips of the shop carry the proof" --questions=docs/chooser-questions.json --lang=he --film=spring-sale
   ```

   It prints `chooser <url>` and opens the user's browser. In the Claude desktop app, add
   `--no-open` and open the URL in the built-in browser pane. Tell the user in one line, in their
   language, that the recommended choices are already picked and Done brings them back. Done prints
   `choices <json>` and ends the script; every tap before that is already in `docs/choices.json`.
   If the user answers in the chat instead, read `docs/choices.json`, apply what they said, and end
   the page with `curl -X POST <url>done`.
5. No browser the user can reach (a remote or cloud session): `--static=out/chooser.html` writes the
   page with the posters and no saving. Send it as a file and ask for the picks in the chat, in one
   numbered message.

The choices are the brief's: the kind, the platforms, the length, the style, the tools and the
answers are not asked again. Copy `style` (with `chosenBy`) into `docs/visual-brief.json`, whose
check refuses a brief without it. Everything else is decided as a recommendation the user sees in
the visual brief: the source, the motif, the reference, the hook.

## Decide, then show

- Run `node ${CLAUDE_SKILL_DIR}/scripts/recommend.mjs --format=<id> --platforms=<id,id>` with the chosen
  format and platforms (the length is the one chosen on the page); when it returns a master plus
  cutdowns, plan both and say which platform needs
  the cutdown. A tutorial or onboarding video first counts the task's steps and adds `--steps=<n>`.
- The brand read and the concept ([brand-read](brand-read.md)): four conclusions from the brand's
  own words, three concepts built on them, scored by a fresh concept critic; the winner places every
  item the user asked for inside one story.
- The motif: from the brand read's difference or signature, the strongest candidate that passes the
  competitor test (a question in the plan: would it still work for the closest rival of the same kind,
  doing the same thing? the rival is never shown), with where the viewer first meets the real thing
  and the one or two turns it carries (SKILL.md, Find the motif first).
- The music: a track from the library whose timbre fits the brand read's look (`get-track.mjs --list`),
  with the reason in one line, and two alternatives of a different energy; the brief plays all three
  from where the film would start them, and the user chooses by ear ([music-bed](music-bed.md)). Fetch it (`get-track.mjs <id>`) before the
  script is timed: every beat lasts a whole number of the track's beats (0.533 s at 112.5 BPM, not
  0.5 s), and the page refuses beats off that grid.
- The reference: the product's own look, unless the user gave one.
- The script ([story](story.md)): the one message, the arc, every word timed; the best hook and two
  runners-up. Each cutdown is its own script.

Then build the visual brief (SKILL.md, Order of work, step 1): `docs/visual-brief.json` holds the
brand read, the idea, where each asked item lands, the music, the plan, the style frames, the hook
and a storyboard per cut; `scripts/visual-brief.mjs` turns it into one page in the user's language.
The storyboard shows each beat's frame from the real assets, its time, its job, its scale, its words,
how the shot is entered and what is carried over the cut into it; the page also names the moments
a viewer will remember ([handoffs](handoffs.md)). A fresh critic reads the page for structure first
(the storyboard critique), and its
findings are fixed on the page. Then show it and ask one thing: **go**, or change any line or any
shot. The brand read, the words, the order and the look are approved here, before anything is
animated. `docs/brief.md` is the record behind it (brief-template).

## Hands-off

Hands-off, running as a subagent, or "just make it" / "skip the questions": no page; run `choose.mjs`
with `--hands-off`, which writes the recommendation to `docs/choices.json` as `chosenBy: "assumed"`;
then write
`docs/brief.md` with an **Assumptions** section listing each choice made for the user, show the
visual brief, and continue without waiting. With nobody to answer, note it in `docs/review_log.md`
and hand the visual brief back with the result. Never skip the visual brief itself.

## Build from what exists

The film is made from the material that exists: the project's footage and photos, the site, the
product's own captures, and what the user said on the chooser they have or will make. Nothing
else is planned on. A missing picture is solved inside the film, never handed to the user:

- another shot that shows the same thing, or the moment before or after it;
- a still that exists (the site's photo of it, a packshot), held and moved;
- the brand's layer: a typographic beat on the brand's colors, a line, the logo's mark;
- the item named on the end card instead of shown, when nothing can show it.

So the brief lists no homework: no "record a clip of", no "send a photo of", no plan, score or fix
that waits on material nobody offered. A critic's note that needs new material is answered with one
of the moves above. Later, a user who offers material is welcome to it: that is their choice, never
the skill's condition.

## What the user is shown, and what they are not

The user sees what looks finished: the visual brief (its style frames are final quality), then the
film. The rough cut (`visual-brief.mjs --animatic`) is internal, for pacing and reading time: a user
shown a rough cut judges it as the film.

## Push back when the ask is wrong

A list of things to include is not wrong: it is the story's material (above). When the chosen length fights the platform (a 3 min tutorial for Reels), plan a master plus
cutdowns and say so plainly in the brief. When the ask would produce dead air or unreadable
captions, plan the length that works and say why in one sentence.
