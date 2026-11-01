# Hebrew and right to left

Hebrew is first-class, not a re-skin. Most public design skills ignore it; this one checks it.

| Item | Rule | Check |
| --- | --- | --- |
| Document | `<html lang="he" dir="rtl">` from site.json; a mixed page marks direction per block. | meter rule LANG_DIR |
| CSS | Logical properties everywhere (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Physical left and right only on a selector marked `.no-flip`. | meter rule PHYSICAL_PROPS |
| Fonts | A Hebrew-capable family for every role; choose the Hebrew face first and match the Latin face to it. `fonts.mjs` stops when a family lacks Hebrew, and the meter fails text set in a face whose files do not cover Hebrew. | fonts.mjs; meter rule FONT_SCRIPT_COVERAGE |
| Size | Hebrew body reads small at the same pixel size: one step up from the Latin default (18px rather than 16-17). | |
| Line height | Body 1.6-1.75; display 1.1-1.25. | meter rule LEADING |
| Letter spacing | Always 0; no caps (Hebrew has none). | meter rule TRACKING |
| Mirroring | Arrows, chevrons, progress, sliders and breadcrumb separators mirror. Logos, play buttons, clocks, checkmarks and media controls do not. | the critic |
| Mixed direction | Numbers, phone numbers, prices, emails, URLs and Latin names inside Hebrew go in `<bdi>` or a `dir="ltr"` span; phone numbers always read left to right. | |
| Forms | Email, URL and phone inputs read left to right; labels and errors right to left. | the site kit's base.css |
| Panels and drawers | Open from the reading start: right in Hebrew, left in English. | the tweak panel follows it |
| Language switcher | Language names in their own language, never flags. | |
