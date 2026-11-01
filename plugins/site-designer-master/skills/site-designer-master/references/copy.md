# Copy and UX writing

On a "keep my words" redesign the user's copy is used as it is; these rules apply to everything else.

| Rule | Check |
| --- | --- |
| Write in the business's own words: lift nouns, product names and phrasing from their site, menu, posts and reviews. Quote 5-10 source phrases in the brief and reuse them. | the brief |
| No AI-cliché vocabulary in any language (the lists live in `assets/slop-catalogue.json`, English and Hebrew, dated). | meter rule BANNED_COPY |
| No invented numbers, testimonials, client logos, team members or awards. Every number on the page is in the brief; anything missing is a visible placeholder. | meter rule UNSOURCED_NUMBER |
| No invented quotes: a blockquote or quote holds only real words from the brief's proof, with their source. | meter rule UNSOURCED_QUOTE |
| Specific beats superlative: "Sourdough baked at 5am" beats "The best bread in town". | the critic |
| Front-load: the first two words of a heading carry its meaning. Paragraphs run at most three lines on desktop. | the critic |
| Buttons say what happens: a verb plus an object, sentence case unless the brand says otherwise. | meter rule BUTTON_TEXT |
| Every state has words: empty (what it is and how to fill it), error (what happened and how to fix it), success (what happens next). | the review page /_review/ |
| Plain language, at the reading level of the people who arrive; sentence case headings. | |
| Hebrew: no letter-spacing, no caps (Hebrew has none), numbers and Latin names kept left to right inside the line (see rtl). | meter rules TRACKING and FONT_SCRIPT_COVERAGE |

## The swap test

Put the nearest competitor's name in place of this business's name in the hero and the about text. If the
words still fit, they are the category's words. Replace them with the business's own things from the brief.

Then the never list: no word from the brief's `voice.never` appears on any page, and the headings use the
`voice.would` words where they fit.

## The line-up test

Put the first screen beside three sites from the same category at the same size, with the names hidden. If it
could be any of them, it is interchangeable: change the device the page is built on, not the colours.
