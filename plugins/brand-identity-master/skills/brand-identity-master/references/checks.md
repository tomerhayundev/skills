# Checks

Read this when a check fails or warns. Both checks read the measurements `render.mjs` writes; they never look at your intentions, only at the page.

## Running them

```
node scripts/board-check.mjs brand/board.metrics.json --brand brand/brand.json
node scripts/facts-check.mjs brand/board.metrics.json --brand brand/brand.json
```

- Both write a JSON report next to the metrics (`board-check.json`, `facts-check.json`) and exit 1 on any failure.
- A failure blocks delivery: fix the page or `brand.json`, render again, and check again. Never weaken a check or hide an element to pass.
- Warnings are reported to the owner as a number, with a word on any that matter.
- Run them on the direction card too (`brand/direction.metrics.json`). There, MISUSE_MISSING is expected: the card has no misuse tiles.

## board-check codes

| Code | Means | Usual fix |
| --- | --- | --- |
| LOGO_NOT_IMG | A logo is drawn as something other than an img | Use `<img data-logo src="logo/...">` |
| LOGO_FILE | A logo points to no file, or to a data URI | Point to `logo/original.*` or a version file |
| LOGO_CHANGED | A logo file is neither the original nor a recorded version | Use the original, or run `make-variants.mjs` again |
| LOGO_DISTORTED | A logo is shown at another ratio than its own | `height: auto` or `object-fit: contain` |
| LOGO_TOO_SMALL | A logo is under its minimum width | Make the tile or the logo bigger |
| MISUSE_MISSING (warn) | No "never do this" tiles | Add the three misuse tiles |
| BOARD_LONG (warn) | The board is over 5,600 px tall | Merge rows, cut the weakest card or mockup |
| SWATCH_MISMATCH | A chip is drawn in another colour than it declares | Use the role's CSS variable and its real hex |
| HEX_MISMATCH | The printed code is not the chip's colour | Print the role's hex |
| HEX_MISSING (warn) | A chip has no printed code | Add the code in `data-hex` |
| TEXT_TOO_SMALL | Text under 12 px | 13 px or more |
| CLIPPED | Text is cut by its box | Let it wrap, or make the box bigger |
| GROUND_UNKNOWN (warn) | Text over a pattern or gradient | `data-ground="#HEX"` on the box |
| CONTRAST | Text under 4.5:1 (3:1 when large) | Use the role's `on` colour |
| OVERLAP | Two texts on top of each other | Return the block to normal flow |
| BLOCK_OVERLAP | Two blocks overlap | Remove negative margins or absolute positions |
| OFF_PAGE | Text or the page is wider than 1600 px | Fix the spans, wrap long words |
| FONT_FAILED | A font failed to load | Check the link or the bundled file |
| FONT_MISSING | A brand font is never declared, so a fallback shows | Put the link `tokens.mjs` prints in the `<head>`, or use a bundled pairing |
| FONT_NOT_LOADED (warn) | A brand font is declared but unused | Use it, or check the family name |
| RTL | A right-to-left brand or line is set left to right | `dir="rtl"` (see `rtl.md`) |
| RTL_FONT | Hebrew or Arabic text in a font without that script (a warning when the font is not in `data/fonts.json`) | Use a pairing for that script |

## facts-check codes

| Code | Means | Usual fix |
| --- | --- | --- |
| EMOJI | An emoji on the board | Remove it |
| CLICHE | A banned cliche | Use a plain, specific word |
| EM_DASH (warn) | An em dash in board text | Use a colon, a comma or two sentences |
| FACT_NUMBER | A number with no source | A text bar, or a source in `copy` |
| FACT_CURRENCY | A price or currency | A text bar |
| FACT_PERCENT | A percentage with no source | Remove it, or add a source |
| FACT_SINCE | A founding claim | Only the site's own line, in `copy` |
| FACT_YEAR | A year with no source | Same as above |
| FACT_EMAIL, FACT_PHONE | Contact details nobody gave | Text bars |
| FACT_RATING | Stars or a score | Remove it |
| FACT_NUMBER_SYSTEM (warn) | A number in system text that is not a known unit | Check it is a real value |
| UNSOURCED | A sentence over four words that is in no source | Put the brand's quote in `copy`; mark an explanation as `data-note`; or use a label or bars |
| EXAMPLE_UNMARKED | An example line shown as the brand's own | Wrap it in `data-example` |
