# The slop catalogue

`assets/slop-catalogue.json` is a dated registry of the tells that make a page read as generated. Each tell has
a meter rule, a status (banned fails the page, warned must be defended) and a **fill**: what to do instead.

## Three rules about the catalogue itself

1. **Every ban has a fill.** Removing tells alone makes a thin page, and people prefer a rich page with
   template devices over a clean empty one. Each fill is a procedure that adds something real.
2. **A fill is never a named font or colour.** Every published "use this instead" list becomes the next wave:
   the replacement fonts of one year are the overused fonts of the next. Fills say how to choose, never what.
3. **It is dated and re-reviewed.** `reviewed` says when; retire a tell when it stops predicting weak pages,
   add one when a new house style appears.

## The tells

| Meter rule | Tell | Fill |
| --- | --- | --- |
| GRADIENT_TEXT | words filled with a gradient | one solid ink; presence from size, weight or space |
| HUE_GRADIENT | a gradient across hues more than 60 degrees apart | one flat field, a tone step inside one hue, or a real photograph |
| AI_PALETTE | violet-indigo gradients and the default indigo fills | sample the accent from the logo, product or place; build its ramp in OKLCH |
| GLOW_SHADOW | coloured glows | a small lightness step or a hairline; neutral shadows only on what floats |
| HAIRLINE_WIDE_SHADOW | a hairline plus a wide soft shadow on every panel | one separation method, declared once |
| NESTED_CARDS | a panel inside a panel | the inner group becomes a list, a divider or spacing |
| ICON_TILE_ROW | three icon tiles each over a heading | the thing itself (a photo, a real screen, a number from the brief) or a strong two-column list; vary sizes by importance |
| EYEBROW | a small tracked label over a heading | the heading says it; categories go in navigation or breadcrumbs |
| CENTRED_SHARE | most text centred | a shared start edge; centre one short moment at most |
| OVERUSED_FONT | a face from the dated overused list | choose from the brand and the picks: what the picked sites use, a family with that structure covering every script, not on the list |
| MIXED_FONT_HEADLINE | one word of a headline in another face or italic | one voice; emphasis from the words or a line break |
| BANNED_COPY | stock phrases, English and Hebrew | the business's own nouns and one concrete fact |
| PRIMARY_PER_VIEW | two filled buttons in one section | one filled button; the other becomes a text link |
| BUTTON_TEXT | "Submit", "Learn more" and the like | a verb plus an object |
| CONTENT_HIDDEN_AT_REST | text invisible until a scroll trigger fires | visible by default; hide only after the script runs |
| UNSOURCED_NUMBER | a number the brief does not hold | the brief's number, or a visible placeholder |
| UNSOURCED_QUOTE | a quote nobody said | a real review from the brief with its source, or the proof stated plainly |

## Looks that are saturated right now (self-check, not rules)

Check the first direction against these: if it lands on one, it is the model's default, not the user's pick.
Cream ground with a serif and a terracotta accent; near-black with one neon accent and glows; broadsheet
hairlines with an italic serif and tracked small labels; flat saturated colour with hard offset shadows; the
"product card kit" of rounded panels, icon tiles and pill badges. Allowed when the user picked it.

## Defaults where good sources disagree

- Gradients: no hue-to-hue or decorative washes; functional scrims over photos and real materials are fine.
- Eyebrow labels: banned, except real navigation such as breadcrumbs.
- Monospace: only for code and real data, never as a "technical" costume.
- Cream or warm-neutral grounds: warned, not banned; fine when the picks or the brand call for them.
- Motion: one authored moment per page; operate and read pages get feedback only.
- Headings and buttons: sentence case unless the brand says otherwise.
- Invented content: never.
