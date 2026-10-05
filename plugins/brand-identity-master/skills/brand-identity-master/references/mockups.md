# Mockups

Read this when building the applications block. Mockups show the identity at work, built in HTML and CSS: no image model, no photos, no stand-in logo.

## Choosing

- Pick four to six deliverables from `data/deliverables.json`:
  - the deliverable's `sectors` include the brand's sector, or `*`;
  - take them in the order the direction file lists under "Mockups first".
- Always at least one paper piece (card, letterhead, label, bag, box) and one screen (app screen, website home, social post).
- For a brand with no site, prefer pieces that need little text: card, sticker, bag, sign, social post.
- Each deliverable has `logo`, `colour` and `avoid` notes. Follow them: they are how a studio would set that piece.

## Building

- Group the pieces into scenes (`.scene` cards in `.cards`): stationery, packaging, a social grid, a website. Each scene has its own ground from the palette, a caption, and two or three pieces placed together.
- Copy the matching blocks from `assets/board/mockups.html` into the applications block. Each mockup keeps:
  - `data-mockup` on its wrapper;
  - a caption that is the deliverable's name, as written in `data/deliverables.json`.
- **The logo** is the original or a version file in an `<img data-logo>`: `monoDark` on light paper, `monoLight` or the original on dark, `reversed` on the primary.
- **Paper colours** come from palette roles: set `--paper` and `--paper-ink` on `.paper`. A light-ground mockup needs `data-ground` set to the paper's hex.
- **Perspective and tilt** (`.tilt`, the box lid) are allowed in mockups only. There the checks warn about the logo's ratio and size instead of failing, because the piece is drawn in space.
- **Spans**: mockups sit in the 12-column `.mockups` grid. Adjust spans in the brand layer so the row reads as one composition, aligned on a shared baseline.
- **Shadows**: one soft long shadow per piece (already in `.paper`). No glows, no reflections.

## Content

- Every piece has at least one real line: a quote, the feels-like line, a mood word, a label, or an example line marked `data-example`. Text with no source is a `.bar`, at most three per piece, widths `w30` to `w90`.
- Navigation and buttons use plain labels from `data/labels.json`, in the brand's language ("Menu", "Book", "Contact").
- A quote from the brand read may be a headline on a screen or a post, word for word, recorded in `copy`.
- With no quote to use (no site), a `doSay` example line may stand in as a headline, inside `data-example`, and the voice block on the same board labels those lines as examples.
- Never made up for a mockup:
  - a price, a dish, a product name;
  - a date, opening hours, a person's name;
  - an address, a phone number, an email;
  - a count, a rating, a review.

  A business card shows bars where the name and contact details would be, unless the user gave them.

## Looking at them

After the render, look at the applications row in `board.png`:

- Does each piece read as its real object at a glance (a card, a bag, a phone)?
- Is the logo on each piece the right version for its ground?
- Do the pieces share one light direction and one shadow?
- Would the row still read with the captions hidden?

If a piece fails one of these, change or drop it. Four strong pieces beat six weak ones.
