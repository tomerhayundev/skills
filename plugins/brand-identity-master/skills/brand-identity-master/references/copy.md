# Copy

Read this before putting any words on the board or in a mockup. The board shows what the brand said and how the system works; it never invents facts to look finished. `facts-check.mjs` enforces this on the rendered page.

## What the board may say

- **Labels** from `data/labels.json` (Palette, Clear space, Menu, Book and so on), in the brand's language where the list has it.
- **The brand name** as the brand writes it.
- **Quotes from the brand read**, word for word, each recorded in `brand.json` `copy` with `source: "url"` and its url. A part of a quote of 12 or more characters is fine.
- **Words from the brand file**: mood and avoid words, the feels-like line, the audience line, colour names, font names, logo misuse lines, voice words.
- **Example lines** (`voice.doSay` with `source: "example"`, and `voice.dontSay`), always inside `data-example`. Say "Example" near them.
- **Deliverable names and direction names**, as captions.
- **Designer's notes** inside `data-note`: one or two sentences per card on why a choice comes from the logo or the brand's words. A note explains the design. It never states a fact about the business: no years, counts, prices, awards, clients or services.
- **Technical values** inside `data-system`: hex codes, RGB, sizes in px or mm, weights (400, 700), ratios (4.5:1), scale steps (50 to 950), and short rule sentences ("Clear space 0.25 of the mark height on every side").

## Text bars

Content with no source is a text bar: `<span class="bar w70"></span>`. It is drawn in the text colour at about 22% strength, widths `w30` to `w90`.

A business card with bars where the name and contact lines go reads as real and invents nothing. A menu with bars where the dishes go does the same.

Bars carry no text, so they never fail a check.

## Never

- **Facts with no source.** Never a number, year, price, currency, percentage, address, phone number, email, person's name, rating, review, star or count without one.
- **Claims with no source.** No "since", "est." or "established" line, and no claim to be the first, the best or award-winning, unless the site says it word for word.
- **Emojis.** None anywhere on the board.
- **Em dashes** in board text.
- **These cliches** (from `data/banned-copy.json`), anywhere in the brand's voice or copy:
  - elevate, seamless, seamlessly, unleash;
  - next-gen, next generation, next level;
  - cutting-edge, state-of-the-art, best-in-class, world-class;
  - revolutionize, revolutionise, game-changer, game changing;
  - unlock, empower, synergy, innovative solutions;
  - supercharge, effortless, effortlessly;
  - redefine, redefined, reimagine, reimagined;
  - unparalleled, curated experience.
- **The brand's adjectives said about itself** ("luxury", "artisan", "eco", "trusted") when the brand never uses them. Show the quality; do not claim it.

When a block feels empty without words, use more space, a larger specimen or the pattern, never invented text.
