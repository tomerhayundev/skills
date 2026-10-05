# Brand read

Read this when the brand has a site, a profile or any text of its own. These are the same rules as the brand read in the video master skill, so a brand is read the same way by both.

The people who ask for a brand identity are not brand strategists. What makes their brand different is usually already written: on the home page, in the about text, in the words under the logo. A board that skips those words comes out generic. A board that uses them sounds like the brand.

## Collect the brand's own words

Quote. Never paraphrase. Record where each quote came from (the page url) and what it is about.

- The hero line and the tagline, and any line under the logo.
- The about text: who makes it, how, and why it is different, in their words.
- What the product or service copy repeats, and the names it gives things.
- Testimonials the site shows, as they are written. Never add a rating to them.
- The site's language. It becomes the board's language. A Hebrew site gets a Hebrew board (see `rtl.md`).

Read the home page and the about page at least. Stop when the words start repeating. Ten good quotes are plenty.

## Scope

Every quote records its scope: the whole brand, or one part of it (a collection, a season, a product, a campaign).

- Only quotes about the whole brand may lead the board: the essence, the feels-like line, the hero quote.
- A feature of one part is a proof the board may show in a mockup. It is never the brand's leading value.
- When it is unclear whether something is brand-wide, mark it for the owner to confirm in the reply. Do not build the board on it.

## Colours and fonts the site already uses

The site shows how the brand already presents itself.

- Open the home page in the browser tools when they are available. Otherwise fetch its HTML and the CSS it links.
- Read the computed colours of the main ground, the headings, the body text and the buttons, and the font families of headings and body.
- **A site colour the logo lacks** may become the secondary or the accent. Pass it to `palette.mjs` with `--site-colors`. Its role carries `source: "site"`.
- **A site colour that fights the logo** (a different hue for the same job) is reported to the owner, not adopted.
- **Site fonts are a hint, not a rule.** Keep a site font when it is in `data/fonts.json` and the direction allows its pairing. Otherwise name what the site uses and why the board uses something else.

## What goes into brand.json

- **Every quote** goes into `read.quotes` as `{ "text", "url", "scope" }`.
- **Every line the board will show** goes into `copy` as `{ "text", "source": "url", "url" }`. `facts-check.mjs` passes only lines found there, the labels, and the brand file's own fields.
- **Anything guessed** (sector, audience, a value the site never states) goes into `read.inferred`, and the field's `basis.kind` is `inferred`.
- **When the site says nothing for a field,** write what was inferred and from what. Never write a quote nobody said.
- **No site.** Say so in one line, work from the logo and the user's words, and keep every board line to labels, the brand name, examples marked as examples, and text bars.

A year, a count or a claim the site does state ("baking on this corner since 2014") may appear on the board, word for word, as copy with its url. One the site does not state never appears.
