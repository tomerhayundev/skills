# Patterns

Read this when choosing `shape.pattern`. Every recipe is built from the logo itself or from its measured facts in `logo-read.json`, never from a new drawing. The CSS classes live in `base.css`.

Text never sits directly on a pattern without help. Put it in a box with a plain ground, or set `data-ground` on the patterned box to the colour under the pattern, so the contrast check measures the real ground.

## mark-tile

- **Made from:** the `tint` version of the logo (`logo/tint.png`, written by `make-variants.mjs`).
- **Class:** `.p-mark-tile`, a layer inside a box with `position: relative`.
- **Variables:** set the tile size with `background-size` in the brand layer. Use about 3 to 5 times the logo's minimum size, so the mark reads as a mark.
- **Directions:** warm handmade and bright playful, and quiet luxury only at a very low tint.
- **Never** under the primary logo in the hero, where it competes with the logo.

## mark-crop

- **Made from:** the `tint` version, shown oversize and cropped by its box.
- **Class:** `.p-mark-crop`.
- **Variables:** move `background-position` and `background-size` in the brand layer so a recognisable part of the mark (a curve, a corner, a serif) crosses the box edge.
- **Directions:** quiet luxury, natural organic, and trusted authority on a band.
- Often the one bold move.

## stroke-lines

- **Made from:** the logo's stroke. Set `--stroke` (from `shape.strokeWeight`) and the line gap in the brand layer.
- **Class:** `.p-stroke-lines`.
- **Variables:** `--pattern-ink` sets the line colour. Keep it quiet: a tint of the text colour at 10 to 20%, or the primary at low strength. Make the gap about 12 to 20 times the stroke.
- **Directions:** precise tech, trusted authority, and natural organic (wider gaps).

## stroke-rings

- **Made from:** the logo's stroke, as concentric rings. It suits marks built on a circle or a ring.
- **Class:** `.p-stroke-rings`.
- **Variables:** `--pattern-ink`, `--stroke`. The ring gap is 36 px in `base.css`; change it in the brand layer to echo the logo's own spacing.
- **Directions:** quiet luxury, and natural organic for round marks.

## proportion-grid

- **Made from:** the logo's own proportions. Set the cell size `--grid-w` and `--grid-h` to the logo's bounding-box ratio (`shape.bbox` in `logo-read.json`), scaled to between 60 and 160 px.
- **Class:** `.p-proportion-grid`.
- **Variables:** `--pattern-ink`, `--stroke`, `--grid-w`, `--grid-h`.
- **Directions:** precise tech, trusted authority. In precise tech it can be the drawn grid the whole board sits on.

## detail-dots

- **Made from:** the logo's smallest detail. Set `--dot` to about half of `strokeMin`, scaled to the board, so it lands between 1.5 and 4 px.
- **Class:** `.p-detail-dots`.
- **Variables:** `--pattern-ink`, `--dot`. The spacing is 24 px; change it in the brand layer.
- **Directions:** warm handmade (as a quiet paper grain), bright playful (bold and bright), precise tech (fine).
- At high density it is the "busy ground" misuse example, so keep it quiet everywhere else.
