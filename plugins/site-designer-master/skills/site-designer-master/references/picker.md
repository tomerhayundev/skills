# The picker

The picker is a local page the skill opens first. The user marks what they like; their marks, not your
taste, set the direction. It is the only place the user answers questions: the directions, layouts and tweak
pages are pages of the same local app.

```
node ${CLAUDE_SKILL_DIR}/scripts/picker.mjs --work=<work> --brief=<work>/brief.json [--library=<dir>] [--port=4400] [--connected=image]
node ${CLAUDE_SKILL_DIR}/scripts/picker.mjs --work=<work> --brief=<work>/brief.json --step=directions|layouts
```

Run it in the background: it prints the address, waits for the user, and exits when they press Done (or
choose an option on the directions or layouts page). Everything is stored in the work folder:
`picker-state.json` (saved on every change, so a reload loses nothing), `taste.json`, `build-prompt.md` and
`choices.json`.

If the library has no pictures yet (the pack is not downloaded and nothing could be captured), the gallery
stays empty rather than showing cards without pictures: then ask the user in chat for two or three sites they
like and what they like about each, and go on with their words as the picks.

## What the picker shows

1. **Site inspirations** (it opens here): a gallery of real site designs from any field, never filtered to the
   client's industry. Every card shows its picture; a card without a picture is never shown. A tap on the
   picture picks it. "See it bigger" shows it on a computer and, when captured, on a phone side by side.
   Pictures are taken with cookie banners and pop-ups hidden; one still covered by a panel is refused.
   Above the gallery the user can **bring their own**: paste a link to a site they like (pictured on this machine
   in about a minute, at computer and phone width, with its design read like a library site) or add a picture of
   one (PNG, JPEG or WebP up to 8 MB, checked by its bytes). Only public web addresses are taken: no files, nothing
   on this machine or its home network, by name or by any address the name leads to. It is pictured by a browser of its own that reaches the
   internet only through a local gate: every connection (the page, frames, pop-ups, workers, WebSockets) is checked
   there, each name is resolved once and connected to exactly the checked address, so a changing answer cannot
   redirect it, and WebRTC and QUIC, which would not pass the gate, are off. Their own references are picked the moment they are added and marked
   "Yours"; they live in `<work>/own/`.
3. **Sections**: heroes, navigation, pricing, forms, footers, 404 pages.
4. **Motion**: our own demos grouped by topic (arriving, responding to touch, scrolling, between pages, no
   motion); every demo plays on its own in a loop, so they can be compared side by side (with reduced motion
   asked for, only its end state shows).
5. **Icons**: icon sets, each shown as the same 12 glyphs.
6. **Feel, dislikes, notes**:
   - three sliders (airy to dense, quiet to loud, still to lively) beside an abstract sketch that changes as
     they move, so a layperson sees the effect;
   - dislikes as tiles that draw what they mean; the AI tells (gradients, glows, icons in boxes, made-up
     numbers...) start as avoided and the user can allow any of them;
   - pictures: own photos (and their folder), free licensed photos, and image tools to generate with. A tool is
     offered only when found: a key's NAME in the environment (never its value) or `--connected=image` when
     this session can call an image tool. A field names any other service; never ask for a key in chat;
   - free notes: anything the panels did not ask.
7. **Done**: the brief, editable (on a redesign also keep my pages and words, or rethink), what Claude gets row by row, what happens next, and one button that says what it will do.

The gallery loads 50 at a time with a Load more button, sorts by recommended for this ask, best use, newest and
most picked, and filters by several facets at once. Marked items stay in a My picks tray.

## What it gives back

`taste.json` (every pick with what was liked about it, the dials, the avoided and allowed tells, the picture
plan, the notes and the answers) and a build prompt: the aesthetic in our words, the references by id with what
to take from each, the intent from the brief, the notes, the picture plan, the dials, and the guardrails (each
avoided tell by its meter rule, each AI tell the user allowed, the rut, the slop catalogue).

Rules from the sources library apply to every reference: a reference shapes the craft, never the idea; the
build never copies a site; nothing is named by brand to the user.
