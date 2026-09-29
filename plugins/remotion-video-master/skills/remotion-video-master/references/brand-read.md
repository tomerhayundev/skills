# Brand read: the concept comes from what the brand says about itself

The people who ask for a video are not creative directors. They type what comes to mind: a single
line, or a list ("a promo, include the workshops, the products, the classes and more"). The ask is raw
material. Turning it into one story is this skill's job, never the user's, and the story comes from
what the brand already says about itself.

That is almost always written down: the site's hero line, its about page, the copy on a collection,
the tag under the logo, the social bio. A film that skips those words and films the most visible
activity comes out generic: a bakery whose film is kneading hands looks like every bakery, and a
list ask filmed as a chapter per item is a montage, not a story.

The read happens before the motif, the script and the brief, and its conclusions are shown to the
user in the visual brief, where a misread costs one line to fix.

## 1. Collect the brand's own words

Quote, never paraphrase. Into `docs/brand-read.md`, with where each came from and what it is about:
the whole brand, or one part of it (a collection, a product, a season, a campaign). "Our autumn loaf
wears a leaf stencil" is about one season, even when it sits on the home page.

- the hero line and the tagline, and the tag under the logo;
- the about page: who makes it, how, and why it is different in their own words;
- collection, product and service copy: what they repeat, the names they give things;
- the social bio and pinned posts, when there is access; reviews, when the site shows them;
- the product's own look: how it photographs its products (seamless white, lifestyle, dark),
  its colors, its type.

## 2. Four conclusions, each tied to a quote

| Row | The question | It becomes |
| --- | --- | --- |
| Difference | What does the brand say makes it unlike others of its kind: a method, an origin, a person, a promise? | the film's idea, and the motif's source |
| Look | Which adjectives does it use about itself or its products (bold, warm, playful, premium)? | the film's frame: space, color, type, how many words; the music's timbre (piano, guitar, strings). Never the energy of the opening: in a feed, a quiet brand still opens hard, it opens clean |
| Signature | Does the whole brand already own an object, line, shape, material, color or phrase (in its logo, or on everything it makes, a mascot)? | the motif, when there is one |
| Spine | Is there a sentence of its own that can carry a story from start to end ("from the field to your table")? | the arc; the tagline itself is for the close, not the hook |

Each row holds the quote, where it is from, its **scope** (the whole brand, or which part), and what
it means for the film. When the brand says nothing for a row, write what was inferred and from what
(`inferredFrom`), never an invented quote.

**Scope decides what a quote can carry.** Difference, Look and Spine come from what the brand says
about itself as a whole: the hero line, the about page, the logo, what every product shares. A
Signature must belong to the whole brand. A feature of one collection, product or season is a proof
the film can show in its place, never the motif and never the brand's leading value: a new line is
what the brand made lately, not who it is. When it is unclear whether something is brand-wide, the
brief marks it for the owner to confirm instead of building the film on it.

## 3. The ask becomes one story

List every item the user named. Find the spine that makes each item a step or a proof in the same
story, and write down where each one lands in the film. A chapter per item is a montage: five items
in 30 s is five fragments and no idea.

When two items really cannot share one story (a service for companies and a toy for children), the
film tells the one the brand leads with, and the brief says in one line which item gets a film of
its own. The user is never asked to choose.

## 4. Three concepts, and a critic before the brief

Write three concepts that differ in idea, not in wording. Each is one sentence and its beat sheet
first: one line per job (for a promo: hook, promise, proofs, offer, close; the format's own jobs
otherwise), with where every asked item lands. Only then its motif or visual device, its turn, and a
line on why the device serves those jobs; a concept that starts from a device and fits a story to it
is rewritten from the jobs. Then a fresh critic (a subagent with no part in the writing)
gets the brand read, the ask, the material list and the three concepts, and scores each from 1 to 10:

| Criterion | The question |
| --- | --- |
| One idea | Can it be said in one sentence, or is it a list with a title? |
| Structure | Can every beat's job be named? After one viewing, would a stranger know who this is, what they get, why this one, and what to do? |
| A professional ad | Would the brand's own marketing lead post it as their ad, or is it a feed trend with a logo on the end? |
| Only this brand | Would it work for the closest rival of the same kind doing the same thing (another bakery with the same oven, another tool in the same category)? Then it fails. Is it built on what the whole brand is, or on one collection's detail? One collection's detail fails too. |
| The look | Would the film look like the Look row: the brand's own adjectives? |
| Surprise | Is there a moment a stranger would not expect, one that stops the scroll? |
| The first two seconds | For a feed (Reels, TikTok, Shorts, Stories): picture only frame 0 to 2 s, picture and sound. Does something move, does the beat already play, does the line open a question? A slogan, a logo, a still product or a quiet intro fails, whatever comes after. |
| Every ask inside | Does each item the user named sit inside the story, not beside it? |
| Makes it | Can it be built entirely from the material that exists? A concept that needs footage, photos or a recording nobody has offered fails this line ([intake](intake.md#build-from-what-exists)). |

The best concept goes forward. When it scores under 8 on any line, rewrite it once against the
critic's notes and score it again. Log the scores in `docs/review_log.md`. The brief shows the winner
and names the runner-up in one line; it never shows the user a menu of concepts.

## 5. What goes in the visual brief

The page opens with **what I understood about your brand** (the four rows: the quote, its source,
and what it means for the film; a row taken from one part of the brand is marked for the owner to
confirm), then **the idea** in one sentence, then **what you asked for and where it is in
the film**, then the music. `visual-brief.mjs` refuses a brief without them. The user reads the read
first: a wrong conclusion is corrected there, before any frame depends on it.

## Worked example: a family bakery

The ask: "a video for the bakery, show the breads, the workshops, the Friday market and everything".

The site: the hero line is "bread that takes its time". The about page says the family has baked for
three generations, that every sourdough ferments for 48 hours before a wood-fired oven, and that
they "don't rush dough"; the bread is "simple, honest, nothing added". Every loaf carries the
family's score, a wheat ear cut into the crust, and the logo is the same wheat ear. The home page
also shows this season's new pumpkin loaf, with a leaf stencilled on its crust.

What a film without the read did: the motif was kneading hands (the most visible action), and the
film was five chapters (breads, pastries, the workshop, the market, the close), cut fast on an
upbeat track with a caption on every beat. Any bakery could have run it, and it looked nothing like
"simple, nothing added".

The read:

| Row | The brand's words | For the film |
| --- | --- | --- |
| Difference | "48 hours", "don't rush dough" | the story is time |
| Look | "simple, honest, nothing added" | natural light, few words, no graphics beyond them, a warm acoustic track; after a hard open on the crust cracking, long holds |
| Signature | the wheat ear scored into every crust; the same ear in the logo | the motif is the score |
| Spine | "bread that takes its time" | the arc is the 48 hours |

The leaf stencil is striking, and it is on the home page, but it belongs to one season's loaf: the
film can show that loaf among the breads, and it is not the signature. The wheat ear is on every
loaf and in the logo, so it is.

The concept: 48 hours in 30 seconds. The film counts the hours on the dough itself: mixed at hour 0,
rising through the night, scored with the wheat ear at hour 47, out of the oven and onto the Friday
market table at hour 48 (the breads and the market). The turn, "your 48 hours start Friday": hands in
the workshop scoring their own loaf. The close: the score becomes the logo's wheat ear. Every item
asked for is an hour in the same count.
