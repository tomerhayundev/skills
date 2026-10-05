# Board

Read this while designing `brand/board.html`. It says what a great board holds, the conventions the checks read, and the few rules that keep it honest. Everything else (layout, rhythm, grounds, every application) is designed from scratch for this brand: there is no template.

## The bar

A final presentation from a top branding studio, ready for a client meeting and a portfolio post: premium, editorial, clean. Every block is aligned to careful margins, the hierarchy is clear at a glance, space is used with intent inside the blocks, and nothing is noise. It should look like an identity a company paid thousands for.

## Blocks

What a studio's identity board holds. Order and combine them as this brand needs; leave nothing thin.

- **The opening** (see below): the logo whole, the name, one short line, the strategy.
- **Reading the logo.** Its parts (a shape, a stroke, a detail, a colour), each shown as a crop of the original file (`data-detail`) with a two-word name and a short note. This is where the identity visibly grows from the logo. Each crop shows exactly the part it names, cropped tight around it: look at every crop alone and name it; if the name does not fit what you see, crop again.
- **The logo system:**
  - the primary logo;
  - versions and the logo on colour: on light, on dark, reversed (for a logo of several colours it keeps its bright details), one colour;
  - a construction card at the logo's measured unit, with clear space and minimum size;
  - misuse examples.
- **Proposed extensions**, labelled as such (below).
- **Colour, rich and named:**
  - the roles from the logo;
  - supporting tints and shades taken from the scales and given their own names;
  - codes (HEX, RGB) and a usage ratio;
  - pairings that pass contrast.

  Never only tints of one colour: when the logo holds one hue, the support colour and the named neutrals of stone and sand stand beside it with their codes. Show it big: tall columns or stacked bands, the names in the display face, the codes small. Four to six named tints is plenty; the full scales live in `tokens.css` and `DESIGN.md`, and appear on the board as one slim strip at most.
- **Typography:** specimens of the display and text faces, a hierarchy, and the type at work on a real line of the brand's.
- **Voice:**
  - each trait with what it is not ("calm, not loud");
  - say and don't say lines (examples marked);
  - an image-style note.
- **Graphic language:**
  - three or four patterns grown from different parts of the logo, in the brand's colours, each tile large enough to read (300 px or more): fewer large tiles beat a row of small ones;
  - shapes and dividers;
  - eight or more icons in the logo's stroke, each with a plain label.
- **Applications.** The largest and richest part of the board (see `mockups.md`): what this business actually makes and uses, drawn for it.
- **A colophon.**

## The opening

The first 600 to 800 px decide the board. Make it a cover a studio would sign:

- **A quiet masthead line** across the top: the brand name, "Brand identity" in the brand's language, the direction. Small, tracked, set apart by a hairline.
- **The logo whole, large and calm,** shown as the brand would show it: on a plain ground it suits, with real space around it. When the logo file has a solid ground, use `logo/clear.png` on every other ground, never the original inside a box of its own background.
- **The name set as a wordmark** in the display face, the way the direction sets names, as the largest type on the board. When the logo already contains the name, a lockup or the brand's line can take that place.
- **One short line:** the shortest true one, such as the brand's own line, or the mood words as a line ("Quiet. Considered. Warm."). A long sentence belongs further down.
- **The strategy** (sector, audience, mood, voice) in plain text columns, not chips or pills.
- **Restraint:** one ground, one accent. Nothing behind or around the logo: no pattern, ring, frame or glow in its clear space, or it reads as part of the logo. A pattern stays faint, away from the logo and the text, or is left out. No boxes inside boxes.
- **The same frame as the board:** a framed panel inside the page margins, or a first row of two or three panels (the logo with its name, the brand's line, the strategy), not a full-bleed band unlike everything after it.

## A full board

- **Every block is full and finished:** real content, large enough to carry its space, with one or two designer's notes (`data-note`) saying why each choice comes from the logo or the brand's words. A note never states a fact about the business.
- **Headlines are real words:** the brand's quotes, the feels-like line, mood words, labels, or marked examples.
- **No dead ground and no filler.** If a block looks like a placeholder, redraw it.

## Proposed extensions

A studio board shows what the identity can grow into. Build these around the unchanged logo file, never by redrawing or retyping it, and label each "Proposed" on the board (`data-proposed` on its block):

- **Seal or stamp:** the logo `<img>` inside a ring, with the brand name or one of the brand's own lines set around it (SVG `textPath`).
- **App icon:** a logo version on a rounded square.
- **Name lockup:** the logo beside the brand name set in the display face. Skip it when the logo already contains the name.
- **Pattern tiles, stickers, a monogram frame** around the mark.

## Sample details

Stationery needs details to read as real. A card, letterhead or invoice may show sample details from `data/placeholders.json` inside `data-placeholder` (`{brand}` filled in), with one board footnote in `data-placeholder-note` saying they are placeholders. Prices, dates, counts, ratings and claims are never sample details.

## Conventions the checks read

- `data-block` on each major section.
- `data-logo` on every logo `<img>` (the original or a version file: never a CSS mask, background image or data URI).
- `data-detail` on a crop of the original that shows one part of it.
- `data-ground="#HEX"` on a box whose ground is a pattern, gradient, texture or scene.
- `data-swatch="#HEX"` on a colour chip, with `data-hex` on its printed code, both inside `data-swatch-card`.
- `data-system` on technical values.
- `data-note` on designer's notes.
- `data-example` on example lines.
- `data-misuse` on "never do this" tiles (`base.css` draws the slash).
- `data-construction` on a clear-space or construction drawing, whose lines may run around the logo on purpose.
- `data-mockup` on applications.
- `data-proposed` on proposed extensions.
- `data-placeholder` and `data-placeholder-note` for sample details.
- `.bar` for a line with no content at all (use rarely).

## Layout

- **Design the page from scratch for this brand.** The direction file's variants are starting ideas, not plans. Compose the board the way a studio lays out a presentation board: varied block sizes, a clear reading order, bold moments, real density.
- **A mosaic, not a stack.** Most rows hold two or three blocks of different widths, side by side: the palette beside the type, the voice beside the patterns, the logo on colour beside the rules. Only the opening and the main application scene may run the full width.
- **Section titles are small labels** (a number and a word or two), not big headings: the content is the headline. Space goes inside the blocks, not into empty bands between them (gaps of 20 to 32 px between blocks).
- **Width and grid:** 1600 px wide. Use CSS grid or flex; never position text absolutely in the flow.
- **The page ground is clean.** By default it is a light neutral, under dark and coloured panels. A dark page is only for a dark brand, and then deep and clean, never a muddy mid-dark. Panels contrast with the page (board-check warns when they melt into it).
- **The opening shows the logo whole.** A crop of the mark may appear elsewhere, as decoration or a detail study, never instead of the logo.

## Sizes and space

- No text under 12 px; labels 13 px; notes 14 px; body 17 to 19 px.
- No `vh` units or full-window heights.
- Every logo outside an application, a detail crop or a proposed extension is at least `logo.minSize.screenPx` wide.
- The board is 3,600 to 4,200 px tall (board-check warns past 4,600 px). When it runs long, set blocks side by side and cut the weakest card: never pad, never shrink type under the sizes above.
- Every text passes contrast on its ground: use the role's `on` colour.

## The one bold move

At least one moment that stops the eye: the logo huge on its ground, a wall of pattern, a giant specimen, a palette that fills the width, an application scene at full width. Bold moments are designed, never crops of the logo in the opening.

## Language

The board's language is the brand's. Hebrew and Arabic boards follow `rtl.md`.
