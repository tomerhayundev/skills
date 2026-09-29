# Brief template

Copy into the project as `docs/brief.md` and fill every line: it is the record. What the user sees and
approves is the **visual brief**, one page built from it by `scripts/visual-brief.mjs` (below), in the
user's language: what was understood about the brand, the idea, where each thing they asked for lands,
the music, the plan in a few lines, the style frames, a storyboard of every cut, and the hook. Nothing
is built past the style frames before that approval.

`docs/visual-brief.json`, the page's input (the full shape is in the script's header):

```json
{
  "lang": "he",
  "title": "Your <product> <format>: here's what you'll get",
  "brand": [
    { "row": "difference", "quote": "<the brand's own words>", "source": "about page", "scope": "brand", "meaning": "<what it means for the film>" },
    { "row": "look", "quote": "...", "source": "home page", "scope": "brand", "meaning": "..." },
    { "row": "signature", "quote": "...", "source": "the logo", "scope": "brand", "meaning": "..." },
    { "row": "spine", "quote": null, "inferredFrom": "<what it was inferred from, when the brand says nothing>", "scope": "brand", "meaning": "..." }
  ],
  "idea": "<the concept in one sentence>",
  "asks": [{ "item": "<each thing the user asked for, in their words>", "where": "<where it lands in the film>" }],
  "music": { "id": "<library id>", "title": "...", "artist": "...", "bpm": 90, "why": "<why it fits the brand's look>", "file": "public/music/track.mp3", "liftSeconds": 16 },
  "plan": ["A **30 s** master and a **15 s** cut, 16:9, for ...", "**No voiceover.** ...", "**The motif** ..."],
  "styleFrames": [{ "image": "out/style-turn.png", "caption": "**The turn.** ..." }, { "image": "out/style-cover.png", "caption": "**The cover.** ..." }],
  "hook": { "recommended": "...", "why": "...", "alternatives": ["...", "..."] },
  "next": "**After your go**, I build it; the next thing you see is the finished <primary deliverable>.",
  "cuts": [{ "name": "30 s", "message": "...", "turnAt": 12, "source": "footage/...", "beats": [{ "at": 0, "dur": 3, "src": 0, "len": 3, "picture": "...", "words": "...", "in": "Opens on the problem" }] }]
}
```

The page refuses (exit 1) a brief with a missing brand row, a row without its `scope` (`"brand"` for
the whole brand, or the one part it is about), a difference, look or spine taken from one part of the
brand (a signature taken from one part is shown marked for the owner to confirm), a row with neither
a quote nor what it was inferred from, no idea, no `asks` list (an empty list when the ask named nothing), an asked item
with no place in the film, or music without a reason. Beat times sit on the track's beat grid
(`60 / bpm` seconds; 0.5 s at 120 BPM).

The record:

```markdown
# Brief: <product> <format>

## Brand read (references/brand-read.md)
| Row | The brand's words (where; the whole brand, or which part) | For the film |
| --- | --- | --- |
| Difference | | |
| Look | | |
| Signature | | |
| Spine | | |

## The idea
- The concept in one sentence: <...>; runner-up: <one line>; concept critic's scores in docs/review_log.md
- What was asked, and where it lands: <each item: its beat>

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
- What has no picture, and how the film covers it: <each item: another shot | a still that exists |
  the brand's layer | the end card>. Never a request for new material (intake, Build from what exists)
- Music: <library id, title, BPM (frames per beat), why it fits the Look row, where the lift lands>

## Motif
<the motif block from SKILL.md, every row filled>
Style guide: <docs/style_guide.md if there is a reference, or "the product's own look">

## Engine profile
<the module's profile; each override of the base with its reason>

## Assumptions
<every choice made for the user in hands-off mode; empty in guided mode>

## Acceptance
- Pops: declared cuts only (frame-pops.mjs --cuts --grid=<frames per beat>); motif coverage within budget, the cover clean
- Loudness about -16 LUFS, true peak under -1 dBFS; <silent for loops>
- Text inside every safe zone shipped to; the 360 px phone sheet reads
- Critique: the concept and the storyboard passed before the build; the film at 8 or more on every criterion (story and copy first) within three rounds, or handed over with the one structural choice; logged in docs/review_log.md
- Platform specs re-checked on the official pages before shipping
```
