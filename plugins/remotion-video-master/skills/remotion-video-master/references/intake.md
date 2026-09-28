# Intake: the brainstorm before any video

The intake decides what the video is for, where it runs and how long it is, and ends in an
approved `docs/brief.md`. Nothing is scaffolded, drawn or rendered before that approval. This is
the brainstorm for a video: do not also run a generic brainstorming skill.

## Step 0, before asking anything

Read the ask, the product's README or landing copy, recent commits, and any Remotion project already
in the repo. Every question the ask already answers ("a 15 s Reels ad") is skipped and confirmed in
one line instead ("15 s ad for Reels, 9:16: noted"). A re-cut, a new locale or an existing composition
skips the intake entirely (SKILL.md §0).

## How to ask

- With a structured question tool (AskUserQuestion in Claude Code): up to 4 questions per call,
  2 to 4 options each, the recommended option first with "(Recommended)" in its label and a one-line
  reason in its description. The user can always answer in their own words ("Other").
- Without one: a numbered menu, one question per message, the recommended option first, ending
  "Reply with a number, or say it in your own words."
- Five calls at most. Batch questions that don't depend on each other.

## The calls

**A. Goal family and mode**
- "What is this video for?" Options from `specs.json` families: **Sell it** (ad, teaser, launch film,
  feature announcement, landing loop) / **Show how it works** (product demo, tutorial, onboarding, app
  store preview) / **Explain an idea** (explainer) / **Social or story** (social clip, testimonial,
  event recap). Recommend the family the ask and the product point to, and say why.
- "How do you want to work?" **Guided: a few choices, each with my recommendation (Recommended)** /
  **Hands-off: I choose, you approve the brief once**.

**B. Format and platforms**
- "Which kind?" The family's formats, up to 4, each label carrying its default length ("Short ad, 15 s").
  Skip when the family has one format.
- "Where will it run?" (multi-select) The family's top 4 platforms (`specs.json` families), the likeliest
  first. More via "Other".

Then run `node ${CLAUDE_SKILL_DIR}/scripts/recommend.mjs --format=<id> --platforms=<id,id>` and use its
numbers verbatim.

**C. Length, source, voice**
- "How long?" The script's options in its order: the recommended length first, then the short and long
  ends; when it returned a master plus cutdowns, offer that as the recommendation and explain which
  platform needs the cutdown. Each option's description says why (platform limit, attention data).
- "What do we show?" Real components in this repo / capture the live site / your screen recording /
  design the UI once (a product that doesn't exist yet). Recommend what Step 0 found.
- "Voice?" (only when the format usually carries one) First check what is possible
  ([media](media.md#voice-decide-what-is-possible-before-offering-it)): a recording the user has, an AI
  voice key already in the environment, the machine's own speech engine. Offer only what works:
  **captions only** (recommended when nothing else is available or the platforms autoplay muted) /
  **your own recording** / **an AI voice** (only with a key present) / **a draft machine voice** (for
  the animatic, shipped only if the user approves it). Never ask for a key in chat. With no voice,
  the video is caption-led by design, not a lesser version.

**D. Motif and reference** (after looking at the product)
- "Which motif?" 2 or 3 candidates that pass the competitor test, strongest first, each one line: the
  object and why only this brand owns it (SKILL.md, Find the motif first).
- "A reference?" The product's own look (Recommended when none was mentioned) / I'll share one.

**E. The script and the brief**
Write the script first ([story](story.md)): the one message, the arc, every word timed. Then show a
10-line summary of `docs/brief.md` (goal, deliverables, length, the one message, the best two or three
hooks with the recommended one first, the CTA, motif, voice, music, acceptance) and ask: **Approve** /
**Change something**. The words are approved here, before anything is animated.

## Hands-off

Hands-off mode, running as a subagent, or "just make it" / "skip the questions": take every
recommendation, write `docs/brief.md` with an **Assumptions** section listing each choice made for the
user, show it, and continue. The stills sign-off (order of work, step 3) is the first human checkpoint;
running as a subagent with nobody to sign off, continue past it, note the skipped sign-off in
`docs/review_log.md`, and hand the stills back with the result. Never skip the brief itself.

## Push back when the ask is wrong

When the chosen length fights the platform (a 3 min tutorial for Reels), the script returns a master
plus cutdowns; say so plainly and recommend it. When the ask would produce dead air or unreadable
captions, offer the length that works. One sentence of why, then the options.
