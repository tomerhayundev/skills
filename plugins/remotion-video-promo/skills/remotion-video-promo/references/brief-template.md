# Brief template

Copy into the project as `docs/brief.md` and fill every line: it is the record. What the user sees and
approves is the **visual brief**, one page built from it by `scripts/visual-brief.mjs` (below): the plan
in a few lines, the style frames, a storyboard of every cut, and the hook. Nothing is built past the
style frames before that approval.

`docs/visual-brief.json`, the page's input (the full shape is in the script's header):

```json
{
  "title": "Your <product> <format>: here's what you'll get",
  "plan": ["A **30 s** master and a **15 s** cut, 16:9, for ...", "**No voiceover.** ...", "**The motif** ..."],
  "styleFrames": [{ "image": "out/style-turn.png", "caption": "**The turn.** ..." }, { "image": "out/style-cover.png", "caption": "**The cover.** ..." }],
  "hook": { "recommended": "...", "why": "...", "alternatives": ["...", "..."] },
  "next": "**After your go**, I build it; the next thing you see is the finished <primary deliverable>.",
  "cuts": [{ "name": "30 s", "message": "...", "source": "footage/...", "beats": [{ "at": 0, "dur": 3.5, "src": 0, "len": 3.4, "picture": "...", "words": "...", "in": "Opens on the problem" }] }]
}
```

The record:

```markdown
# Brief: <product> <format>

## Goal
- Format: <format id> (module: formats/<module>/FORMAT.md). Why: <one line>
- Audience: <who, what they already know>
- The message in one sentence: <what the viewer should believe or do after watching>

## Deliverables (from recommend.mjs, specs verified <date>)
| Platform | Aspect | px | Length | fps | Codec | Captions | Sound | Safe zone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

Master and cutdowns: <master length and where it lives; each cutdown and why>
Languages: <every locale the product ships, RTL mirrored; or the ones the brief names>

## Story, script and copy (references/story.md)
- Who, the one message, the change: <three lines>
- Arc: <tension, the turn, the payoff, in one line each>
- Hook (first 3 s): <the chosen line>; runners-up: <two more>
- Close / CTA: <one verb, one destination>
- Script: docs/script.md (beat, time, picture, words, motif), read aloud and timed

## Material
- Source: <real components | live-site captures | the user's recording | UI designed once>
- Voice: <captions only | AI voice (which) | the user's recording>
- Music: <track, BPM, where the lift lands>

## Motif
<the motif block from SKILL.md, every row filled>
Style guide: <docs/style_guide.md if there is a reference, or "the product's own look">

## Engine profile
<the module's profile; each override of the base with its reason>

## Assumptions
<every choice made for the user in hands-off mode; empty in guided mode>

## Acceptance
- Pops: declared cuts only (frame-pops.mjs --cuts); motif coverage within budget, the cover clean
- Loudness about -16 LUFS, true peak under -1 dBFS; <silent for loops>
- Text inside every safe zone shipped to; the 360 px phone sheet reads
- Critique loop: every score 8 or more (story and copy first), logged in docs/review_log.md
- Platform specs re-checked on the official pages before shipping
```
