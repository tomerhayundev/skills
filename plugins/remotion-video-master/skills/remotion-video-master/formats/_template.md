# Format module template

Every module in `formats/<type>/FORMAT.md` has exactly these headings, in this order. Every module is
also published as its own specialist skill, `remotion-video-<type>`, generated from this master by
`scripts/sync.mjs` in the marketplace repo: its `name` and `description` become the specialist's
SKILL.md frontmatter, its `summary` the catalog and README line, and the specialist ships this module
(plus the nearest full module, for a stub) with the master's engine. A new module here becomes a new
specialist on the next sync. Modules never run scripts themselves; the master's verification section does.

```markdown
---
name: remotion-video-<type>
description: Use when ... (the triggers this format has as its own skill)
summary: >-
  What the specialist does, one line, for the catalog and the README.
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
