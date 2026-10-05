# Applications

Read this when designing the applications, the largest and richest part of the board. Applications show the identity at work in this business's own world. They are drawn in HTML and CSS for this brand: no image model, no photos, no stand-in logo, and no reused kit.

## Choosing

- **Ask what this business actually makes, hands out and uses,** and draw that. For example:

  | Business | Pieces |
  | --- | --- |
  | A bakery | a bread bag with a window, a pastry box, a paper cup and sleeve, a chalkboard or printed menu, an apron, a delivery sticker |
  | A boutique hotel | a key card in its sleeve, a room folder, a door hanger, an amenity box, a wax-sealed envelope, a brass door plate |
  | A developer tool | the product screen or dashboard, a docs page, a terminal, stickers, a conference badge |
  | An advisory firm | a letterhead and envelope, a report cover, a door plate, a presentation slide, an email signature |

  `data/deliverables.json` lists more, with their sizes and notes.
- **Six to ten pieces in one large scene, with one or two smaller panels beside it.** For example: a desk or counter scene two thirds wide, with the website and a social grid stacked next to it. Not one piece per card, and not a row of separate bands.
- **The pieces fill the scene.** They overlap as on a real desk or shelf, at different sizes, some cropped by the scene's edge. The ground shows less than the pieces do: a scene with empty bands between small pieces gets its pieces enlarged or regrouped.
- **At least one paper or packaging piece and one screen piece.** The screen piece is the website's first screen with the brand's own line and product nouns, or a social grid of three to six posts (a logo version on colour, a quote, a pattern, a product noun).

## Building

- **Draw each piece for this brand:**
  - real proportions;
  - its material: paper grain, kraft, foil, glass, card, fabric, all done with CSS gradients;
  - light from one side and soft layered shadows;
  - perspective with `transform` where it helps;
  - the parts that make it read as its object at a glance: a bag has its gusset, folds and handles set into the bag, a box has a lid edge and a side, a card has thickness and a shadow, a cup has a rim and a sleeve.
- **Carry the identity on every surface:** the logo (an `<img data-logo>`, a version on dark or coloured grounds), the patterns, the palette, the type.
- **A scene has a ground of its own** from the palette or a material (a wood desk, a stone counter, a linen cloth), with `data-ground` on it, and the pieces overlap naturally. Only one piece in an overlapping stack carries text, so texts never collide.
- **Every piece keeps `data-mockup`.** A short caption names the scene. Tilt and perspective are allowed (the checks warn, not fail).

## Hard pieces

Bags, cups, clothing and bottles are hard to draw in CSS, and one badly drawn piece pulls the whole board down. Draw one only when it is central to this business, and then build it right; otherwise let flat pieces carry the scene (letters, envelopes, cards, tags, boxes seen from above, stickers, seals, screens).

- **A bag:** portrait, about 3:4. Two thin handles set into punched holes just inside the top edge (both ends inside the bag's width), a folded band along the top, a darker strip down one side for the gusset, and a soft shadow at the base. The logo sits in the upper half at about a third of the front's width; the name is small beneath it, never edge to edge. Partly hidden behind a flat piece, it reads best.
- **A cup:** a slight taper, a rolled rim, a lid or a sleeve band carrying the mark.
- **Cut rather than keep:** a scene with five good pieces beats seven with one bad one.

## Content

- **Every piece has real words:**
  - the brand name;
  - a quote from the brand read;
  - the feels-like line;
  - labels from `data/labels.json` in the brand's language;
  - product nouns the site itself uses ("Sourdough", "Rye").
- **Stationery carries sample details** from `data/placeholders.json` in `data-placeholder`, with the board footnote. A letter shows a heading and a few real lines from the brand's words rather than grey bars; use text bars only where a line has no content at all, and never as the main content of a piece.
- **Never made up:** prices, dishes or products the site does not name, dates, opening hours, real-sounding names, addresses, counts, ratings, reviews.

## Looking at them

After the render:

- Does each piece read as its real object at a glance, made of its real material? Look at each piece alone, at thumbnail size: would it pass for a photo of the real thing? Fix it or cut it.
- Does the scene look like this business's world, or like any business?
- Would a studio post it?

Redraw what fails. Fewer, better pieces beat a row of thin ones.
