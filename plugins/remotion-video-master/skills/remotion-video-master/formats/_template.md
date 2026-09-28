# Format module template

Every module in `formats/<type>/FORMAT.md` has exactly these headings, in this order, so that any of
them can later become its own skill: move the folder to `skills/remotion-video-<type>/`, rename
`FORMAT.md` to `SKILL.md`, and point its `../../references/` links at the master's references.
Modules never run scripts themselves; the master's verification section does.

```markdown
---
name: remotion-video-<type>
description: Use when ... (the triggers this format would have as its own skill)
---

# <Format>

Status: full | stub (nearest: <module>)

## Fits when
The goal, the words that signal it, and "not when" pointing to the right module.

## Lengths and platforms
Default and range (from assets/specs.json via recommend.mjs), usual platforms and aspects, cutdowns.

## Story shape
A beat table with time budgets: the hook, the middle, the close and its call to action.

## Assets and voice
What must exist before the beat map: product source, recordings, voice (the media.md ladder), music.

## Engine profile
| Key | Value | Base (promo) | Why |
One row per key of assets/templates/profile.ts; a changed key always has its reason.

## Build notes
Format-specific mechanics, linking to ../../references/*.md sections.

## Verification
The pops mode, the extra checks, and the critique criteria this format adds.

## Common mistakes
| Mistake | Fix |
```

A stub keeps every heading with a line or two and opens with
`Status: stub (nearest: <module>). Read <module>, then apply the deltas below.`
