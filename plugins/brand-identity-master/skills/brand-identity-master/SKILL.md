---
name: brand-identity-master
description: Use when someone has a logo and wants a brand identity, brand guidelines, a style guide, a brand board, a colour palette or fonts for their logo, logo usage rules, or a brand kit for a business, a client or a portfolio post, in any language, as in "make a brand for my logo".
compatibility: Node 18+, and Chrome or Edge (any Chromium browser) for reading the logo and rendering the board. No image model or API key.
---

# Brand identity master

Turns a logo into a visual identity: a brand file other skills read (`brand/brand.json`), and a brand identity board ready to show a client. Everything comes from the logo and the brand's own words. The board is HTML rendered to PNG by a headless browser, and the logo file is placed as it is, never redrawn.

This is version 0.3.0 of the skill. Asked which version is loaded, answer with this line: an installed copy changes only when it is updated, and a running session keeps the copy it started with.

Scripts live in this skill's `scripts/` folder: run them as `node <this skill>/scripts/<name>.mjs`. Output goes to `brand/` in the working folder. Answer the user in their language; the board is in the brand's language.

## The floor (never broken)

1. The logo is never redrawn, traced, retyped, cropped, recoloured by hand or stretched. The board shows only the original file and the versions `make-variants.mjs` writes, always at their own aspect ratio.
2. No invented facts: no slogan, date, "since" line, number, price, address, phone, email, person's name, rating or count unless the user gave it or the brand's site states it, recorded in `brand.json` `copy` with its source. Content with no source is a text bar or a plain label ([copy rules](references/copy.md)).
3. Every hex code on the board is the colour drawn next to it. Every text passes contrast: 4.5:1, or 3:1 for large display text.
4. Nothing overlaps, nothing is clipped, the board fits its own height.
5. No emojis, no pure #000000 for text, no copy cliches.
6. Nothing shown to the user holds a placeholder image or a stand-in logo. If the logo or the site cannot be read, say so and ask.
7. The checks are part of the build: a board that fails `board-check.mjs` or `facts-check.mjs` is not delivered.

## 1. Read before asking

1. Take every answer the ask already gives: the brand name, what it does, a site, where the board will be shown.
2. Read the logo: `node scripts/sample-logo.mjs <logo file> --brand-dir brand`. It copies the file unchanged to `brand/logo/` and writes `brand/logo-read.json` (ground, ink colours with shares, shape facts, minimum size). Then look at the logo yourself and write the read by eye ([logo read](references/logo-read.md)).
3. If there is a site, run the [brand read](references/brand-read.md): quote its own words with where each came from and its scope, and note the colours and fonts it already uses.
4. Ask at most one round, only what changes the result and cannot be read: usually the brand name when the logo has none, and the site link. Recommend "use what there is". Never wait for material nobody offered, and never plan around it.

## 2. Choose the direction

Score five axes from 1 to 5 (luxury, tech, warmth, energy, authority) from the logo and the brand's words, each with its basis: `read` when the brand says it, `inferred` when it comes from the shape. Pick the nearest direction and a runner-up:

| Direction | File | Usually |
| --- | --- | --- |
| Quiet luxury | [quiet-luxury](directions/quiet-luxury.md) | high luxury, low energy; serif capitals, monograms, metal |
| Precise tech | [precise-tech](directions/precise-tech.md) | high tech; geometric, monoline, grid-built marks |
| Warm handmade | [warm-handmade](directions/warm-handmade.md) | high warmth; drawn, stamped or irregular marks |
| Trusted authority | [trusted-authority](directions/trusted-authority.md) | high authority; steady, symmetric, deep colours |
| Bright playful | [bright-playful](directions/bright-playful.md) | high energy; round, bold, saturated |
| Natural organic | [natural-organic](directions/natural-organic.md) | warmth with calm; flowing forms, earth and plant tones |

Read the chosen direction file now, and only that one (and the runner-up's named moves when blending). Its rules hold for this brand only: a rule from one direction is never applied to another.

## 3. The palette

`node scripts/palette.mjs brand/logo-read.json --ground <light|dark> [--site-colors "#hex,#hex"] --out brand/palette.json`

It sets primary, secondary and accent from the logo's inks (a small accent stays an accent), builds even OKLCH scales, tints the neutrals toward the logo's hue (never pure black or white) and gives each role a text colour that passes 4.5:1. Name each colour descriptively ("Antique Brass", not "Gold 2"). The direction may change the 60/30/10 split; write the reason in the role's `why`.

## 4. Direction card (the approval point)

1. Write `brand/brand.json` as far as the direction goes ([brand file](references/brand-file.md)): identity with basis, atmosphere, colour roles from `palette.json` with names, type from a pairing the direction allows in [fonts](data/fonts.json), shape and pattern, logo rules from `logo-read.json`.
2. `node scripts/make-variants.mjs brand/brand.json`, then `node scripts/tokens.mjs brand/brand.json`. When a font comes from Google Fonts, `tokens.mjs` prints a font link: put it in the `<head>` of every page you render.
3. Copy [the direction card](assets/board/direction.html) to `brand/direction.html`, put this brand's words and values in it, and render it: `node scripts/render.mjs brand/direction.html --width 1200 --no-retina`. Run both checks on `brand/direction.metrics.json` (section 5, step 6).
4. Show `brand/direction.png` with two lines: the direction and why, and what was inferred rather than read. Ask "go, or what should change?". A change re-renders the card. Nothing else is built before "go". If the user is away, continue on your recommendation and say so.

## 5. Build

In this order; each step passes before the next.

1. Complete `brand.json`: logo rules, voice, copy ([brand file](references/brand-file.md)). If a colour changed since the card, run `make-variants.mjs` again.
2. `node scripts/validate-brand.mjs brand/brand.json`: fix every error.
3. `node scripts/tokens.mjs brand/brand.json` and `node scripts/design-md.mjs brand/brand.json`. Never write `tokens.css` or `DESIGN.md` by hand.
4. Write `brand/board.html` from one of the two board layouts the direction names: [editorial](assets/board/editorial.html) (a light page, a name-led hero, numbered sections, a collage) or [cards](assets/board/skeleton.html) (a grid of full cards with scenes). Follow the [board rules](references/board.md), the direction's layout, [patterns](references/patterns.md), [icons](data/icons.json) chosen for the sector and [mockups](references/mockups.md) built from [the mockup kit](assets/board/mockups.html). The skeleton shows structure and conventions only: its look is not a look to copy.
5. `node scripts/render.mjs brand/board.html`: it measures the height, writes `board-vN.png` and `board-vN@2x.png`, and copies the latest to `board.png`.
6. `node scripts/board-check.mjs brand/board.metrics.json --brand brand/brand.json` and `node scripts/facts-check.mjs brand/board.metrics.json --brand brand/brand.json`. Fix every failure in the page or in `brand.json`, never by weakening a check, then render again ([checks](references/checks.md)).

## 6. Critique, then refine once

Look at `brand/board.png` and answer briefly, in writing:

- The swap test: put another logo of the same sector on this board. What would still be true? If most of it, the board is generic: bring in more of what comes from this logo (its parts, its pattern, its colours, its stroke and corners in the layout).
- The finished test: would it hold up next to a studio's board? Any card of grey bars only, any empty stretch, any card with one small thing in a big field, any mockup that is mostly placeholder is unfinished: fill it with the brand's words, its parts, its pattern and notes ([a full board](references/board.md)).
- The sibling test: would this board pass for another brand's board from this skill? Change the layout family, the hero, the rhythm of light and dark grounds or the mockup arrangement until it would not.
- Where is the one bold move? There is exactly one.

Then at most two refine passes. Render and run both checks after each.

## 7. Deliver

Run the visual-verification skill on the board if it is installed. Reply in the user's language with:

- `brand/board.png` and `board@2x.png`, `brand/brand.json`, `brand/DESIGN.md`, `brand/tokens.css`, `brand/logo/`;
- the direction in two lines;
- what was inferred rather than read, so the owner can correct it in one line;
- the check results as numbers (failures 0, warnings n).

Every delivered board is kept (`board-v1.png`, `board-v2.png`); none is overwritten. Right-to-left brands follow [rtl](references/rtl.md).

## Red flags (stop and fix)

- A rule from one direction is being applied to another.
- The board would look the same with another brand's logo on it.
- The palette has a colour the logo does not have and the direction does not justify.
- The board says something the brand never said.
- You are about to deliver without running both checks, or after a failing one.
- You are drawing, tracing or retyping the logo.
