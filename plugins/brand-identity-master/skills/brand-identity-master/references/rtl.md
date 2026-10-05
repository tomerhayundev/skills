# Right to left

Read this when the brand writes in Hebrew or Arabic, or when the logo or the site does. The checks fail a right-to-left brand set left to right, and Hebrew or Arabic set in a font without that script.

## Page

- Open the board, the direction card and the mockup copies with `<html lang="he" dir="rtl">` (or `lang="ar"`).
- In `brand.json`, set `type.script` to `hebrew` or `arabic`. `validate-brand.mjs` then requires display and text fonts that cover it.
- The board's language is the brand's: labels come from the Hebrew entries in `data/labels.json` where they exist. Otherwise write the label in the brand's language and add it to the list in a later release, never to a single board's check.
- A Latin brand name inside a Hebrew board stays as the brand writes it.

## Type

- Use only pairings whose `script` is the brand's (in `data/fonts.json`, for example `auth-he-frank-heebo`, `warm-he-amatic-rubik`). Every direction has at least one.
- **Labels:** no letter-spacing and no uppercase transform on Hebrew or Arabic.
  - Tracking breaks the letterforms.
  - Uppercase does nothing.

  Set `.eyebrow` and `.caption` to `letter-spacing: 0; text-transform: none` in the brand layer when the board is in Hebrew or Arabic.
- Hebrew reads larger at the same size than Latin capitals. Body text of 17 to 19 px is fine; labels at 14 px read better than 13.
- Numbers, hex codes and units may stay in the Latin label face inside `data-system`.

## Layout

- Under `dir="rtl"` the grid mirrors by itself: the first span starts at the right.
- `base.css` already right-aligns tile captions and moves the mockup's nav logo to the start.
- Mockups read right to left:
  - the logo sits at the right of a nav bar;
  - arrows point left for "next";
  - a phone screen's content aligns right.
- A pattern with a direction (`stroke-lines` at an angle, a `mark-crop` entering from a side) mirrors too, so it leads the eye from right to left.
- The hero and the logo system stay centred where they were centred: symmetry does not change with direction.

## Mixed text

- **Isolate Latin runs.** Numbers, hex codes, Latin brand names and units inside a Hebrew line go in `<bdi>` or a `<span dir="ltr">`, so the browser does not reorder their punctuation (a code like `#1B2A4A` must not become `1B2A4A#`).
- **Check the PNG** for:
  - mirrored brackets and quotes;
  - a full stop at the wrong end of a line;
  - a colon jumping sides.
- **Check the reply too.** When the user writes in Hebrew, the reply is in Hebrew. File names and code stay as they are.
