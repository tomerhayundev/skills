# Logo read

Read this after `sample-logo.mjs` has run and before you choose a direction: it says what the numbers mean and what to add by eye.

## What the script measures

`brand/logo-read.json` holds measured facts. Trust them over your impression of the colours.

- **background**: `transparent`, `solid` (with its `hex`: a white or black ground behind the logo, never a brand colour), or `none` (the logo fills its frame, like a badge or a photo).
- **inks**: the logo's own colours with their share of the inked area. Anti-aliasing fringes and compression noise are left out, so a JPEG on white gives one orange, not ten. For an SVG, each colour snaps to the value written in the file (`declared: true`).
- **shape**:
  - `aspect`: width over height of the inked area.
  - `parts` and `split`: `stacked` means a symbol above a wordmark, `side` means a symbol beside one. Wide letter spacing can look like `side`; check by eye.
  - `mirrorX` near 1 means the mark is symmetric left to right.
  - `edgeDensity` high means fine detail; low means a bold, simple shape.
  - `strokeMin` and `strokeMedian`: the thinnest and the typical stroke, in the file's own units.
- **minSize**: a heuristic. The thinnest stroke should stay 1 px wide on screen and 0.1 mm in print, and the logo is never shown under 24 px. A hairline logo gets a large minimum; that is the logo's nature, not an error.

## The read by eye

Look at the logo itself (open the file) and write down, in a few words each:

- **Shape language**: pick one or two of geometric, organic, hand-drawn, stamped, serif lettering, script, monoline, heavy, outline, emblem.
- **Likely sector**, and whether the name or the site confirms it.
- **Audience** in one line.
- **Its own thing**: the shape, line, angle or detail only this logo has. The pattern and the one bold move grow from it.

Never describe the logo as something it is not to make a direction fit.

## The five axes

Score each from 1 to 5. Anchors:

| Axis | 1 looks like | 5 looks like |
| --- | --- | --- |
| luxury | everyday, cheerful, mass | hushed and rare: fine serifs, metal, space |
| tech | no technology at all | systems and screens: geometry, monoline, grids |
| warmth | cool, distant, clinical | close and human: round, drawn, warm hues |
| energy | still and calm | loud and moving: saturated, bold, tilted |
| authority | informal, personal | institutional: symmetric, steady, deep colours |

The nearest direction usually follows from the two highest axes. When two directions tie, the brand's own words (the brand read) decide, then the shape language.

## Basis

Every conclusion in `identity.basis` has:

- `kind`: `read` when the brand states it (the site, the user), `inferred` when it comes from the logo's look.
- `from`: what led to it, in a few words ("gold on dark, a fine ring, a serif capital").

Every `inferred` conclusion is listed in the reply, so the owner can correct it in one line. A guess is never presented as a fact.

## Hard cases

- **One colour, black or near-black.** The palette comes from the direction and the site. Mark those roles `derived` or `site`, and say in the reply that the logo gave no colour.
- **The logo fills its frame** (`background: none`). Clean one-colour versions are not possible. `make-variants.mjs` says so. Show the logo on grounds it suits and say why there is no reversed version.
- **A logo file with a solid ground** (a JPG, or a PNG on white). `make-variants.mjs` also writes `logo/clear.png`: the same pixels with the ground taken out. Use it on every ground other than the file's own; the original is shown only in detail crops.
- **A logo of several colours.** The reversed version turns its dark colours light and keeps its bright ones, so inner details (dots, accents) survive on dark grounds; the one-colour versions merge everything into one silhouette, so use them only where one colour is required, and say so.
- **A hairline.** The minimum size is large. Show the logo big. Never shrink it under the minimum to fit a tile; make the tile bigger.
- **A wordmark only.** The pattern comes from the letterforms' stroke and proportions, not from a symbol.
- **A symbol only.** Ask for the brand name in the one question round. The board needs it, and it is never guessed.
- **A low-resolution file.** Say the file is small. Show it no larger than about twice its pixel size, and suggest that the owner send the original artwork.
