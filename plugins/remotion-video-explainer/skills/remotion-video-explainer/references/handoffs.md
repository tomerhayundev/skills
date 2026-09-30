# Handoffs: what each cut carries

A film plays as one piece when the eye is handed from shot to shot. The motif does it at the turns
and wherever it links two shots (SKILL.md, Find the motif first). This file is about every other
boundary, and about the moves that do the handing. The catalog and the pacing numbers come from an
open-source study of 28 professional launch films (motion-video-kit, MIT), retold by kind of move;
the rules under it are this skill's.

## The floor: every cut carries something

Briefs written without this rule named a motif and then cut "on the beat" nine times out of ten:
the shots were good and the film restarted at each cut. So, for every boundary, the brief names what
the eye follows over it into the next shot (`carries`, per beat, from the second beat on):

| What carries | What it means | Example |
| --- | --- | --- |
| The motif | The film's one object crosses the cut, or does the turn | the thread runs out of one page and into the next tag |
| A real object | The same thing is on both sides, in the same place and at the same size | the cast piece in the maker's hands, then in a guest's hands |
| A shape | A different thing with the same outline, in the same place | a round dish to a round sieve; a white stream to a white layer |
| A movement | The move continues in the same direction at the same speed | a hand going down on both sides; a pan that keeps panning |
| The frame | The foreground of one shot becomes the way into the next (the catalog below) | the headline grows past the camera and the product is already under it |

The motif is still the strictest of these and carries the turns. The others are the floor under it:
a shot the motif is not in is still handed on by something real in the picture. "The beat" and "the
music" carry nothing: they say when the cut lands, not where the eye goes.

**The same pixels on both sides.** A carried object lands where it left: the same centre and the
same size in the last frame before the cut and the first frame after it. For a morph or a shared
element the two sides are the last frame of the outgoing state and the first of the incoming one;
for a flood, full cover on both frames around the cut. Place the destination
first, then bring the object to it. In the engine: a match cut gives both scenes the same focus rect
for the object; a shared element uses each scene's settled rect (architecture, Chain layout). Test
it: the object's rect on both sides of the boundary, per aspect, within 2 px. A carried heading that
sat 12 px off after its parent's slow push was seen at once; the fix was to give the overlay the
same push.

**A plain cut is allowed when size, direction and subject match on both sides,** and the motion goes
on after the cut. It is the unmatched cut, a new layout sliding in after an unrelated one, that
reads as a slideshow.

## Three moments a viewer remembers

Before the storyboard, name three transformations (two in a film of 10 to 20 s, one under 10 s), each
as a thing and what it becomes, in plain words with no effect names (`moments` in the brief):

- "the inspection photo becomes the first picture of the report"
- "the four email bubbles become one link"
- "the printed model becomes the mould it is cast in"

A moment that can only be said with an effect name ("a zoom transition into the logo") is an effect,
not a moment. The turn is usually one of the three, and the motif usually does it. A film with no
such moment is a run of shots, however well each one is animated.

## The catalog: moves that hand a shot on

Pick by what the film has to say, never by which looks best. Use one as the film's main grammar and
at most two others; a film that uses six is a showreel.

| Move | What happens | Fits |
| --- | --- | --- |
| Foreground fly-through | The thing at the front (a headline, the mark, the object) grows past the camera with its edges stretching, while the next scene is already in place under it. No empty frame between the two | a promise that opens onto the product |
| The mark as a doorway | The brand's shape grows until an opening in it fills the frame and is the next scene | a turn or a close, when the mark has an opening |
| Select, then expand | A selected item (outlined, picked by a cursor or a hand) grows into the workspace of the next beat | software; a product picked from a row |
| The result fills in | The shell of the result appears first, then its parts fill in order, and the finished state holds to be read | anything the product makes: a page, a report, a booking |
| Lines that stay | A line, rail or path stays on screen while the words change, and joins two states | the steps of one process |
| One canvas | The camera travels over one layout; the chosen item stays sharp, its neighbours soften, and the new content arrives before the old leaves | a flow from request to result ([one-take-film](one-take-film.md)) |
| A ring around a sentence | Many small items orbit one steady line that keeps adding words | many proofs of one claim |
| Stack and fan | Cards arrive and cover each other; one becomes many, or many settle into one | options, templates, past work |
| The fold | A panel folds to a bright strip and the next one rises out of it | one state becoming the next |
| Layers apart | A product separates into its real layers, holds, and closes again | a physical product: how it is built |
| Parts lift off the whole | The source stays recognizable while regions of it lift away into categories | a document, a plan, a photo being read by the product |
| A wall, then one | Too much (a wall of posts, photos, tabs) collapses to one clear subject | the problem turning into the answer |
| The wheel | A turning list with one bright item in front and the rest receding | steps or services, one at a time |
| A breath of color | A soft field of the brand's color fills the frame once, for the handoff to the brand | the close; once in a film |
| Tile wipe | A grid of tiles covers and opens | a chapter break; once |
| Ask, choose, confirm | A request stays readable while a sheet rises, a choice is made and the state confirms | a service: booking, quoting, ordering |
| Type as the move | Large words enter from opposite sides and open onto the next scene | a line that is itself the beat |

By kind of thing: a physical product gets its material and its layers; software gets a cursor or a
selection that causes each change; a service gets ask, choose, confirm; a place or a maker filmed on
a phone gets matches on shape and movement, and the same object passed from hand to hand.

Every one of these is an action with a visible result: a scan produces findings, a tap produces a
new state, a request produces a confirmation. A move that produces nothing is decoration.

## Pace and density

For a promo and the modules built on it:

- **About 12 to 15 compositions in 30 s,** each about 1.4 to 3.5 s. Count framings, not cuts: a
  one-take film counts each place the camera settles. A composition held past 3.5 s changes inside
  (a move, an action completing), or it is two shots.
- **One main move leads, smaller ones run under it,** all overlapping: the camera or the key object
  moves, labels follow a few frames apart, a tick or an edge settles last. The frame never stops
  and starts all at once.
- **Land slowly enough to read, leave fast, arrive slowing.** Nothing moves at a constant rate but a
  hold's slow push.
- **Nothing stands still for more than about 0.6 s,** and no more than about 1 s of a 30 s film in
  all (`frozen-time.mjs`). A hold is first cut to what its words need; the reading time that
  remains (a caption, the end card) keeps a slow push, about 2% of scale a second:
  calm enough to read, never frozen (architecture, One square canvas).
- **The subject spans 60 to 85% of the usable frame,** along its longer side: its width for a wide
  subject, its height for a tall one. The usable frame is the aspect's frame less the caption band
  and the platform's safe zone. So a link pill or a wordmark passes by its width, nothing is asked
  to reach 60% by area, and a margin of at least 7% is left on each side. Test it on each scene's
  settled rect, per aspect. A small card in a large empty field reads as unfinished; a minimal brand
  is minimal in how few things are in the frame, not in how small they are.
- **The scale changes:** macro, close, medium, wide, overhead, full-frame type. At least three in
  15 s or more, never the same three shots running, never the same layout twice (a heading over
  three cards).
- **One or two things to read at a time.** Dense is not busy: density is how often the picture
  changes and how full the frame is, never how many things compete in it. Films made in code with
  everything moving at once are already recognized on sight, and viewers say why: "too many
  competing elements". The eye gets one subject and, at most, one line about it.

A calm brand keeps all of this. Calm is fewer things, slower moves and a quieter track; it is not
dead time.

These rules say how a shot is framed, never which shot is chosen. When the picture only this brand
has sits small or slow in its frame (a machine on a bench, a tool on a table), crop in, push in or
enter it mid-move until it fills the frame; it is not traded for the category's fuller shot.
