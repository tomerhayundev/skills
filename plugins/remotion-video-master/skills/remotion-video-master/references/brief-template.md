# Brief template

Copy into the project as `docs/brief.md` and fill every line. The intake shows a 10-line summary of it
for approval; nothing is built before that approval.

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
- Pops: <strict | declared cuts only> (frame-pops.mjs)
- Loudness about -16 LUFS, true peak under -1 dBFS; <silent for loops>
- Text inside every safe zone shipped to; the 360 px phone sheet reads
- Critique loop: every score 8 or more (story and copy first), logged in docs/review_log.md
- Platform specs re-checked on the official pages before shipping
```
