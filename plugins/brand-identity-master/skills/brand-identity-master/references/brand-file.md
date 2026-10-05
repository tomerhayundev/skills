# Brand file

Read this while writing `brand/brand.json`. Every rule here is enforced by `validate-brand.mjs`; other skills read this file, so it must be complete and true.

## version

`"version": 1`. The schema version of the file, not of the brand.

## identity

- `name`: the brand's name as the brand writes it.
- `sector` and `audience`: a few words each.
- `direction`: one of the six direction ids. `runnerUp`: another id, or `null`.
- `axes`: `luxury`, `tech`, `warmth`, `energy`, `authority`, each a whole number from 1 to 5.
- `basis`: for `sector`, `audience` and `direction`, an object `{ "kind": "read" | "inferred", "from": "..." }`.

```json
"identity": { "name": "Aurelle", "sector": "boutique hotel", "direction": "quiet-luxury", "runnerUp": "trusted-authority",
  "axes": { "luxury": 5, "tech": 1, "warmth": 3, "energy": 1, "authority": 3 },
  "basis": { "sector": { "kind": "read", "from": "the about page" } } }
```

## atmosphere

- `mood`: 3 to 5 words the board should feel like.
- `avoid`: 3 to 5 words it must not feel like.
- `feelsLike`: one sentence of at most 30 words, concrete and sensory ("A lamp left on in a quiet hall.").

## logo

- `original`: `{ path, sha256, width, height }`. The path is `logo/original.<ext>` (copied by `sample-logo.mjs`). The sha256 must match the file: the original never changes.
- `versions`: written by `make-variants.mjs`. `monoDark`, `monoLight` and `reversed` are required, `tint` is optional. Each is `{ path, sha256, color }`. Never write these by hand.
- `clearSpace`: between 0.1 and 2, as a share of the mark's height.
- `minSize`: `{ screenPx, printMm }`, from `logo-read.json`. `screenPx` is a whole number of at least 16; `printMm` is at least 5.
- `allowedBackgrounds`: names of colour roles the logo may sit on.
- `misuse`: at least three "Do not ..." lines. The board shows them as crossed-out tiles.

## color

- `roles`: `primary`, `neutralDark`, `neutralLight`, `surface` and `text` are required; `secondary` and `accent` are optional. Each role has:
  - `hex`: uppercase, like `#C9A24B`.
  - `name`: a descriptive name.
  - `source`: `logo`, `site` or `derived`.
  - `rgb`: must match the hex.
  - `on`: the text colour used on it.
  - `contrast`: the real ratio of `on` over `hex`, within 0.05, and at least 4.5.
  - `share`: the part of a layout, or `null`. All shares add up to 1 at most.
  - `why`: optional, one sentence.
- No pure `#000000` for `text` or `neutralDark`.
- `primitives`: scales from `palette.mjs`, steps 50 to 950. Each step is darker than the one before.
- `dark`: optional, a map from role to hex for a dark theme.

Name colours as a material or an object plus a quality: "Night Umber", "Antique Brass", "Harbour Blue". Never "Primary Blue 2".

```json
"primary": { "hex": "#C9A24B", "name": "Aurelle Gold", "source": "logo", "rgb": [201, 162, 75], "on": "#15120E", "contrast": 7.78, "share": 0.3 }
```

## type

- `script`: `latin`, `hebrew`, `arabic` or `cyrillic`.
- `display`, `text`, `label`: each `{ family, weights, fallback, source, license }`.
  - `family` must be in `data/fonts.json`, and its `weights` must exist for that family.
  - `license` is copied from `data/fonts.json`.
  - `source` is `google`, or `bundled` only when every weight ships in `assets/fonts`.
  - Display and text fonts must cover the script.
- `scale`: `{ ratio, base }`, with the ratio between 1.1 and 1.7.

Use a pairing from `data/fonts.json` that the direction allows. A role may add `why`.

## shape

- `radius`: px, 0 or more. It comes from the logo's corners (0 for sharp, larger for round).
- `strokeWeight`: px, from the logo's `strokeMedian` scaled to the board.
- `pattern`: `{ recipe, params }`. The recipe is one of the six in `data/directions.json` (see `patterns.md`).
- `iconStyle`: `{ stroke, caps }`. The caps are `round`, `square` or `butt`, matching the logo's line ends.

## voice

- `weAre` and `weAreNot`: exactly three words each.
- `doSay`: 2 to 3 lines `{ text, source }`. Use the brand's own words (`url` or `user`); a line you wrote must be `example` and is shown marked as one.
- `dontSay`: 2 to 3 lines the brand must not sound like. They are shown marked as examples.
- `tone`: optional, a map from a context (welcome, service, social) to a few words.

## copy

Every line the board shows that is not a label, a name or a voice field: `{ text, source, url? }`.

- `source` is `url` (with the page url), `user` (the user said it), `label` or `example`.
- A year, number or claim appears here only when the site or the user stated it.

## read

- `quotes`: `{ text, url, scope }` from the brand read.
- `inferred`: the fields that were guessed.
- Optionally, a short summary of `logo-read.json`.

The reply to the user lists `read.inferred`.
