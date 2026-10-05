# Board

Read this while writing `brand/board.html` from the skeleton. It says what the board holds, the conventions the checks read, how the direction's layout is made, and what makes a board look finished.

## Blocks

The default order is below. A direction may reorder or merge blocks, but never leaves out the logo system, colour or typography.

1. **Masthead**: the brand name and "Brand identity".
2. **Intro row**, three cards:
   - the primary logo large on its home ground, with its pattern;
   - the essence (the feels-like line, a quote from the brand);
   - reading the logo: its parts, each shown as a crop of the original (`data-detail`) with a short note, plus the mood words.
3. **Logo system**:
   - primary, on light, reversed;
   - clear space and minimum size, with their values;
   - three misuse tiles and a minimum-size tile.
4. **Colour and type**:
   - colour as stacked bars (name, role, hex, RGB, written in the role's own text colour) plus the scale strip;
   - type specimens of the display and text faces, and a hierarchy.
5. **Voice, patterns, icons**:
   - voice: we are / we are not, say and don't say, examples marked;
   - three patterns from different recipes;
   - eight icons from `data/icons/` picked by sector, each with a plain label naming what it depicts.
6. **Applications**: three rows of scenes from the mockup kit (stationery and packaging, website and app, the world and social), four to six pieces in all (see `mockups.md`).
7. **Colophon**: the brand name and "Guidelines".

## A full board

A studio board is dense with real content and looks finished. Empty tiles and grey bars everywhere read as a wireframe. Fill the board without inventing anything:

- **Every card is full**:
  - a label;
  - its content, large enough to carry the card;
  - one or two sentences of designer's notes (`data-note`).

  No card is only text bars, and no card holds one small item in a big empty field.
- **Notes carry the thinking.** Say why each choice comes from the logo or the brand's words: "Rings at the logo's stroke", "Gold stays an accent". A note explains the design. It never states a fact about the business: no years, counts, prices, awards, clients or services.
- **Read the logo on the board.** Show its parts as crops of the original file (`data-detail`), never as new drawings. Name each part in two words, with a short note.
- **Show patterns in use**, not only as swatches: behind the hero, on a social tile, on packaging, on a website ground.
- **Mockups are scenes.** Group two or three pieces on a ground of their own, and give the social grid six tiles that mix:
  - logo versions;
  - pattern;
  - colour;
  - mood words;
  - the brand's quotes.
- **Headlines are always real words**: the brand's quotes, the feels-like line, mood words, labels, or example lines marked `data-example`. Grey bars stand only for secondary lines, at most three per piece.
- **No dead ground.** Outside the hero, no empty stretch taller than about 160 px. Cards in a row share their height, and their content uses it.
- **The brand name in type** may appear in a nav bar, a footer or a heading. It is never set beside the mark like a new lockup. When the logo is itself a wordmark, specimens use "Aa" and the brand's quotes, not the brand name.

## Conventions the checks read

- **`data-block`** on every block, so overlapping blocks are caught.
- **`data-logo`** on every logo `<img>`. Its `src` is `logo/original.*` or a version file, never a CSS mask, background image or data URI, so every logo shown can be hashed against the original.
- **`data-detail`** on a crop of the original that shows one part of it. It may crop and scale; the file must still be the original or a version.
- **`data-ground="#HEX"`** on a box whose ground is not a plain background colour (a pattern, a gradient, a scene), so contrast is measured against the real ground.
- **`data-swatch="#HEX"`** on a colour chip or bar, with `data-hex` on its printed code, both inside `data-swatch-card`.
- **`data-system`** on technical values: codes, RGB, sizes, weights, ratios, rules.
- **`data-note`** on designer's notes. They may be any sentence explaining the system, and are still checked for facts.
- **`data-example`** on example lines, so they never pass as the brand's own words.
- **`data-misuse`** on "never do this" tiles. Only these may show the logo changed.
- **`data-mockup`** on mockups. Perspective is allowed there.
- **`.bar`** for content that has no source.

## Layout

- The page is 1600 px wide, a 12-column grid (`.sheet`). Rows of cards use `.cards` with `.c-3` to `.c-12`.
- The direction file names three layout variants. Build the chosen one in the board's brand-layer `<style>` by changing spans, order, card grounds and gaps. Do not edit `base.css`: `tokens.mjs` copies it fresh.
- Blocks and cards are in normal flow (grid or flex). Use absolute positioning only for decorative layers (`.pattern`) and captions, never to place text in the flow. Positioned text is what overlaps.
- Two brands of the same direction should not get the same board: vary the variant, the card grounds, the bold move and the pattern.

## Sizes and space

- No text under 12 px. Labels are 13 px, notes 14 px, body 17 to 19 px.
- No `vh` units or full-window heights. `render.mjs` refuses a page whose height follows the window.
- Every logo outside a mockup or a detail crop is at least `logo.minSize.screenPx` wide. Make the card bigger rather than the logo smaller.
- Space sits between cards (24 px) and between sections (56 to 96 px), not inside empty tiles.
- The whole board stays near 5,200 px tall at 1,600 px wide. Past 5,600 px board-check warns (BOARD_LONG): merge rows, or cut the weakest card or mockup. Long boards read as unedited.
- Every text sits on a ground it passes contrast on: use the role's `on` colour.

## The one bold move

Pick exactly one from the direction's list, and make it big enough to be seen from across a room. For example:

- an oversize crop of the mark;
- a giant specimen;
- a full-bleed colour band;
- the pattern across the hero.

Everything else stays calm, but full. After the render, the critique in SKILL.md asks where it is. If you cannot point to it, there is none; if you can point to three, there are too many.

## Language

The board's language is the brand's. Labels can be taken in that language from `data/labels.json`, where Hebrew labels are listed. Notes are written in the brand's language too. A Hebrew or Arabic board follows `rtl.md`.
