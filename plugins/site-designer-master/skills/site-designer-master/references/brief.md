# The brief

You write the brief from what exists (the ask, the current site, the brand file, the business's own pages and
reviews), and the picker shows it on its Done panel, where the user can correct it. The user is never asked
to write it.

Save it as `brief.json` next to the site source. The meter reads it (every number in it counts as sourced) and
the critic reads it.

## Fields

| Field | What it holds | Example |
| --- | --- | --- |
| `business` | One plain line: what, for whom, where | "a sourdough bakery on a corner in a small town" |
| `siteType` | one-page, brochure, shop, booking, portfolio, content, event, saas | brochure |
| `modes` | page path to mode: persuade (home, landing), operate (shop, booking, forms), read (articles, docs, legal), experience (portfolio, launch) | `{ "/": "persuade", "/order/": "operate" }` |
| `primaryAction` | The one thing the site exists for, as a button would say it | "Order for pickup" |
| `arrivals` | 1-3 short stories: who arrives, from where, on what | "a neighbour searching on a phone at 7am" |
| `proof` | Only real proof: `{ label, value, source }` | `{ "label": "reviews", "value": "4.8", "source": "the business's map listing" }` |
| `facts` | Real facts the copy may use: hours, address, prices, years | "Open 7:00-14:00, closed Saturday" |
| `ownThings` | 8-12 things only this business has: street, materials, rituals, products by name | "the 5am bake", "the blue door" |
| `rut` | What this category always ships, and its predictable opposite; both stay out unless picked | "rustic kraft paper and script logos / sterile white minimal" |
| `firstFeeling` | The one feeling the first screen gives, chosen from the business and the ask, and what makes it visible | `{ "word": "warm", "shows": "a photo of the morning bake, one line, honey colour" }` |
| `checks` | Every mood word the ask uses ("modern", "premium", "warm"), turned into something that can be seen and checked; a word that cannot be checked is dropped | "premium" → "one accent, no stock photos, every price stated with what it includes" |
| `voice` | Words the business would say, and words it would never say | `{ "would": ["baked", "by hand", "the corner"], "never": ["artisanal journey", "elevate", "cheap"] }` |
| `sitemap` | Pages with the section order of each, chosen from the visitor's questions | |
| `objections` | The questions a visitor has before acting: price, time, risk, "is it for me" | |
| `brandFonts` | The brand's own faces, exempt from the overused list | |
| `redesign` | `{ "mode": "keep" or "rethink", "source": "<url>" }` when it is a redesign | |
| `scene` | Only when a page earns 3D ([3D](three-d.md)): the page, the recipe, the one-sentence job, and the art direction (world, palette, light, material, motion, finish) | `{ "page": "/delivery/", "recipe": "points", "job": "shows the four towns the bakery delivers to, so a visitor sees at once whether they are in", "places": "from facts" }` |
| `picks` | Filled by the picker: what the user marked and what they liked about each | |

## How to fill it

- The idea comes from `ownThings`. Write one sentence: "On this site, [a thing only they have] becomes [the
  device the site is built on]". Then the competitor test: put the nearest competitor's name in the sentence.
  If it still works, the idea is the category's, not this business's: go back to the list.
- Section order follows the visitor's questions, not a template. A service usually runs: the offer, proof,
  how it works, what it costs, objections, the ask. Choose per site type and say why in one line.
- `proof` holds only what you can point to. A missing proof becomes a visible placeholder in the copy
  ("[number of regular customers]") for the owner to fill, never an invented number (meter rule UNSOURCED_NUMBER).
- `firstFeeling` is one word, not three. A visitor judges the site in a fraction of a second, and that first view
  lends its quality, good or bad, to everything behind it. The critic names the feeling of the first screens
  before reading this field; a mismatch fails the 5-second test. It is the business's feeling, not luxury by
  default: a bakery's may be warm, a clinic's calm, a gig's exciting. Calm comes from clear prices and hours as
  much as from white space; never empty a page to look expensive.
- A mood word is not a brief: two designers read "premium" in opposite ways. Each one becomes a line in `checks`
  that the critic and the walk look for.
- On a "keep" redesign, the current pages and words go into the sitemap and the copy unchanged, even where
  the copy rules would differ. Only the design changes.
