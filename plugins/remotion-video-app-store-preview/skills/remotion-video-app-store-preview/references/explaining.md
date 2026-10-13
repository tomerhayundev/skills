# The part that explains

Read this before designing any stretch that shows how something works: an explainer, a product
demo, a feature announcement, or the middle of a promo for an app or a tool. It is the stretch
viewers call "like every AI video" when it wears the default look.

Two lessons sit under it. Ours: an explainer whose opening loop of thin arcs, a running dot and
tally ticks was called "poorly executed, looks like Paint". Another studio's: a launch film whose
ad was praised and whose explaining stretch (one panel layout repeated for each of twelve steps)
was called "the same pattern, the same structure"; two restyles of that layout (a paper desk, a
lit 3D stage) did not win the owner over either. The repeat was the problem, not the styling.

## 1. Choose a way of showing it

These are the ways real launch films explain a product, taken from a frame-by-frame read of 25 of
them. Pick the one that fits what this film is for, say which and why in the brief (`explains`),
and build it from this film's own material. It is a way of showing, not a template.

| Way (`explains.way`) | What is on screen | Fits when |
| --- | --- | --- |
| `real-thing-close` | One real control, one row, one typed line fills the frame, on a plain ground, a few small words | software with a screen; one feature |
| `one-object-changes` | A list, a board or a page gains and loses parts step by step, one word naming each step | a process, a pipeline, "how it works" |
| `product-working` | The real canvas filling up, the real output arriving, nothing drawn around it | automation or a tool doing work you can watch |
| `output-as-film` | The things made with it, full frame, cut fast | a creative tool, anything whose result is a picture |
| `person-and-shapes` | A person (the founder, the maker) and plain shapes beside them | a new idea that needs trust |
| `life-product-small` | People, hands and places; the product as a small card or a phone in a hand | a consumer product; a feeling more than a feature |
| `mixed-media` | Footage, type, a close look at the product and a collage, cut together in one accent | a strong brand colour and real footage to work with |
| `type-alone` | One phrase at a time, thin guide lines and numbers around it | nothing to show yet; a manifesto |
| `steps-own-pictures` | Three to five steps, each with its own small scene, the words kept small | a method of a few steps |
| `drawn-diagram` | A diagram that builds, in the brand's tokens, with objects that have weight (the explainer format's diagram grammar) | an idea with nothing real to show |

When there is a real product, the real thing comes first; a drawn diagram is for an idea that has
nothing real to show. Two ways can share a film (the product working, then its output full frame).
One frame repeated for every item of a list is not on this table.

What the films that look made by a studio share:

- **The real thing, very close.** One real control, one row, the box the user types in, filling
  the frame like a product on a table. No invented icons, numbered pills or diagram panels.
- **One real shot changes how a graphic film is read**: a person at a desk, hands on paper, a
  place.
- **A strict palette**: a plain ground and one accent that appears a few times in the whole film.
- **Small type and a lot of space.** One typeface; no bold headline in a corner over a panel.
- **A different technique in each shot, inside that one system**: footage, then type, then a close
  look at the product, then a collage, all in the same colours and type.
- **Nobody lists** (section 2).

## 2. Nobody lists

A list becomes one picture that changes, never one frame per item. Five features are five changes
to one shot of the product, or one camera move past five stations built from different objects.
Ask of each step: what real thing did it make? Put that on screen at full size. A step that made
nothing you can see shares a shot with its neighbour.

**Change the skeleton, not the skin.** When the explaining stretch reads as a template, a new
style on the same layout is the same film. Change what is shown (the real thing each step made,
one picture that changes) and keep the story and the sound. Then style it.

## 3. One hero example

A film that shows what a product does carries **one example from the first shot to the last**:
the same customer, the same order, the same document, the same plant. Every feature is shown
happening to that example, and the close shows the example out in the world (the order arriving,
the report sent). A new example per feature is a montage of demos. This holds for demos,
feature films, explainers of a product and promos for an app or a tool; a sale of many products
shows many products ([brand-read](brand-read.md#3-the-ask-becomes-one-story)).

## 4. The real product, made to do the example

For a product that works on a screen, the strongest picture is the product doing this film's
example for real, captured, rather than a redrawn copy of its interface:

1. On the chooser's "what we show" question, offer **sign in once, and Claude uses the real
   product** ([intake](intake.md#the-chooser)).
2. Open the product in a browser window the user can see (a headed Playwright window with its own
   profile in the project, or a browser tool already connected), and let the user sign in
   themselves. Never type, ask for or store a password.
3. With their go, drive the product to make the hero example: fill the board, create the order,
   run the report. Use a demo or test account when one exists; never touch a real customer's data,
   send a message, publish or buy anything in it.
4. Capture each beat at the output size or larger: screenshots of each state and short screen
   recordings of each action ([media](media.md#screen-recordings)).
5. Code adds only what the product cannot: the camera, the cursor, the type, the sound, the
   payoff. The words then caption what the viewer already sees.

Anything shown that the product does not do yet is an illustration, named in the hand-off.

## 5. Ban the defaults by name

Asking for "something that doesn't look like AI" swaps one default for another. Name the defaults
and keep them out:

- a near-white or near-black ground with soft colour clouds; purple or blue gradients;
- a card with round corners and a soft shadow; a dark panel on a light ground;
- a pill with a number and a name; a row or grid of icon tiles;
- a big bold headline parked in a corner; one accent colour on everything;
- every element popping or sliding up with an overshoot; everything arriving at once;
- boxes behind the words, karaoke style; text that moves while it is being read;
- the same frame for every item of a list;
- glow orbs and drifting particles as decoration, a product spinning on a turntable, everything
  centred.

A look the user chose that uses one of these on purpose (light in the isometric-glow look comes
from what is working, never from floating orbs) keeps it, and says so in the brief.

## 6. Numbers, not adjectives

"Premium", "cinematic" and "modern" are where the default lives. Write the decision instead, in
the tokens: the ground and the one accent as hex; the type size of each role; the easing by name
and the spring's damping (1.0 never bounces, 0.7 to 0.85 is calm, 0.4 to 0.6 is lively); one hero
move per shot, smaller moves 50 to 70% as far and 100 to 200 ms later; for a 3D shot the lens
(a field of view of 16 to 24 degrees reads as a camera, 50 and more as a game), where the key light
stands and how hard its shadow is. A bounce belongs to things that pop in place, never to
something that crosses the frame.

## 7. Fixing an explaining stretch after notes

Rebuild three moments, not the film: the one that names the product, the strongest pair of
steps, and the turn, on the film's own sound, shown next to the old cut. Say what the test does not
prove yet (the sound effects were timed to the old picture, the other steps are unchanged).
