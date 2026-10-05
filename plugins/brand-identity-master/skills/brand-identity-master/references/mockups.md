# Mockups

Read this when building the applications section. Mockups show the identity at work. They are built from the mockup kit in `assets/board/mockups.html` (HTML and CSS): no image model, no photos, no stand-in logo.

## Choosing

- **Pick four to six deliverables** from `data/deliverables.json` whose `sectors` include the brand's sector or `*`. Take them in the order the direction file lists under "Mockups first".
- **Mix the kinds:** always at least one paper piece (card, letterhead, envelope, bag, box, label), one screen (app screen, website home, social post) and, when the sector has a place, one piece out in the world (storefront sign, cup, tote).
- **No site?** Prefer pieces that need few words: cards, bags, boxes, stickers, cups, signs, a social post carrying a mood word or the feels-like line.
- **Follow each deliverable's notes.** It has `logo`, `colour` and `avoid` notes: they are how a studio would set that piece.

## Building

- **Scenes.** Build three rows, each a `.cards` row of two scenes, so the section stays near 1,500 px tall:

  | Row | Scenes |
  | --- | --- |
  | 1 | stationery (`c-8`) and packaging (`c-4`) |
  | 2 | website (`c-8`) and app screen (`c-4`) |
  | 3 | storefront or merchandise (`c-6`) and social (`c-6`) |

  Swap scenes to suit the sector; keep three rows.
- **Copy the pieces** from `mockups.html`. Each kit piece reads three variables, set on the piece or its scene from palette roles:
  - `--paper`: its ground;
  - `--ink`: the text on it;
  - `--accent`: buttons, rules, icons and sleeves, with `--accent-on` for text on the accent.
- **What the kit holds:**
  - stationery: `k-letter`, `k-envelope`, `k-card` (`.front` with the logo, the back with the name and icon rows), `k-pair` (two cards set together);
  - screens: `k-phone` (status bar, head, hero card, icon list, `k-btn`, tab bar), `k-browser` with `k-site` (nav, split hero with a pattern panel, three feature cards);
  - packaging and merchandise: `k-bag` (3D, a patterned side), `k-box` (3D), `k-cup` (sleeve), `k-sticker`, `k-tote`;
  - out in the world: `k-front` (fascia, awning, window);
  - social: `k-post` and the six-tile `social-grid`.
- **Finish:** `.lit` adds a layered shadow, `.grain` a paper grain, `.tilt-l` and `.tilt-r` a small turn. Use a pattern inside panels, side faces, hero cards and posts.
- **Every piece keeps `data-mockup`,** and every scene has a caption that is a deliverable name from `data/deliverables.json` (or "Stationery", "Packaging").
- **The logo** is the original or a version file in an `<img data-logo>`:
  - `monoDark` on light paper;
  - `monoLight` or the original on dark;
  - `reversed` on the primary.
- **Perspective and tilt** are allowed in mockups only. There the checks warn about the logo's ratio and size instead of failing.
- **Grounds:** set `data-ground` on any piece whose ground is a pattern, a grain or a scene, so text on it is measured against the real ground.

## Content

- **A headline on every screen and post**, in real words: a quote from the brand read, the feels-like line, a mood word, or a `doSay` example inside `data-example` when the brand has no quote.
- **Feature cards and list rows:** an icon from `data/icons/` and a mood or voice word as the title, with text bars for the body.
- **The back of a business card:** the brand name, then rows of icons (user, mail, phone) with text bars: a real layout, no invented details.
- **Navigation and buttons** use plain labels from `data/labels.json` in the brand's language ("Menu", "Book", "Contact", "Reserve").
- **Never made up for a mockup:**
  - a price, a dish, a product name;
  - a date, opening hours, a person's name;
  - an address, a phone number, an email, a domain;
  - a count, a rating, a review.

## Looking at them

After the render, look at the applications rows in `board.png`:

- Does each piece read as its real object at a glance?
- Is the logo on each piece the right version for its ground?
- Do the pieces share one light direction and one shadow?
- Is any scene half empty? Then the other scene in its row is too tall, or the piece is too small.

Fix or drop a piece that fails. Four strong pieces beat six weak ones.
