# The hook: how a video opens

The opening decides whether the rest is seen. There is no one way to do it, and no fixed timing: a
hook is whatever makes this viewer stay for this film. An earlier version of this skill fixed one
shape for every promo (a line lands in a second and holds whole for two before anything happens),
and five critics in a row, asked cold, ranked the result as the film's worst problem: "the hook is a
finished picture that waits". A hook is chosen per film, from what the film has.

Sources: current guides to short-form hooks and paid social creative, which agree with each other
on the points below (their benchmark numbers are vendors' own and vary by account; use them as
direction, not as targets), and what critics found in this skill's own films.

## What every opening does

1. **Something is already happening on frame 0.** A full picture in motion: never an empty stage, a
   sparse one, a logo, a title card, a finished still waiting for its words, or a word halfway in.
   A thing may be part-way through its move on frame 0 (that is what mid-action means); a word may
   not. In a feed a still first frame is read as a pause and scrolled past; movement registers
   before any text does.
2. **The viewer knows what this is within about a second** in a feed, within three anywhere else.
   Picture, words and sound say one thing together; the first frame is planned, not the first three
   seconds.
3. **It opens something the film closes:** a question, a gap, a contradiction, a result not yet
   explained. A hook the film never pays off is bait, and the viewer leaves at the turn.
4. **The line can be read, and the picture does not wait for it.** A line stays up for its reading
   time (about 0.3 s a word, at least 1.5 s), in one place. Under it the picture keeps going, and
   what moves is what the line is about. 3 to 8 words; in a feed 6 or fewer, and readable within
   half a second: it may simply be there, whole, on frame 0. The hook line counts as one of the
   film's lines, but the rule that a caption rises into a calm picture is for the captions after
   it, not for the hook.
5. **It is this brand's, and it does not spend the payoff.** Prefer the picture only this brand
   has, framed until it fills the frame ([handoffs](handoffs.md#pace-and-density)). When frame 0 is
   the category's shot, the brand's difference is on screen within 2 s. "The strongest picture"
   means the strongest one that leaves the turn and the payoff for later; the tagline is a close,
   never a hook.
6. **It works with the sound off, and better with it on:** the beat is already playing, and the
   action's own sound, where there is one, starts on frame 0. With one music bed and no effects the
   sound is the same for every hook: then the choice is where the track starts. Check the first
   half second of `audio.txt`; an opening that lands on a quiet bar starts the track a bar later.

## Kinds of hook

Write five for the film, of different kinds, each as a picture, a sound and a line together, and
judge the picture first with the text off. Choose by what the material can do, not by habit.

| Kind | What opens the film | Works when |
| --- | --- | --- |
| In the middle of it | The action already under way: the pour mid-stream, the cursor mid-drag, the print head moving | the product or the making is visual |
| The result first | The finished thing, unmistakable within a second, then how | the outcome is the draw: a demo, a tutorial, a before-and-after |
| The viewer's question | A question they already have, over the picture that raises it | the pain is familiar and specific |
| The problem, seen | The thing going wrong for a second or so, then the first sign of the fix | the problem is visible, not abstract |
| The contradiction | A line the picture seems to deny ("A ceramic piece doesn't start with clay" over clay being poured) | the brand's difference is a surprise |
| The open gap | A claim with its reason withheld ("One change, and nobody emails about times again") | the film can pay it off by its middle |
| The interrupt | Something the feed does not show: an odd scale, an unexpected angle, a stop in the sound | there is a truly unusual picture; never faked |
| The build | The picture is caught part-way through assembling: most of it stands on frame 0 with the line, and the rest arrives, about one part a second, until the turn | the film is drawn (interface, type, diagrams) and has no footage |
| The strongest sentence | The best line of the interview, before anyone is introduced | a testimonial, a founder film |
| The peak | The best three seconds of the day | an event recap |
| The withhold | A piece of the thing, and a date | a teaser |

A drawn film has no footage to be "in the middle of", so its own version is the build, or the
product already working: a thread that is complete on frame 0 and sits under its line is a still;
the same thread arriving message by message is the problem happening. Start a build late, not
early: frame 0 of a build was once the emptiest frame of its film (one message on a bare page, no
line), and in a feed that lost what the build had won. Frame 0 holds at least half of what will
stand there, and the line.

## By kind of video

Each format's profile names what usually opens it and by when a viewer must know what the film is
about (`hook` in `assets/templates/profile.ts`). The film may open another way when it is stronger;
the brief says which and why.

| Video | Usually opens with | By |
| --- | --- | --- |
| Promo in a feed (Reels, TikTok, Shorts, Stories) | The strongest moving picture, a short line, the beat already playing ([feed](feed.md)) | 1 s |
| Promo elsewhere (pre-roll, a landing page, a launch film) | In the middle of it, the problem seen, the contradiction or the build; a launch film may take a breath, never a title card | 3 s (pre-roll: before the skip at 5 s) |
| Bumper (6 s) | The hook is the film: one picture, one line, the brand | 1 s |
| Teaser | The withhold | 2 s |
| Feature announcement | The feature doing its thing, then "New" | 3 s |
| Product demo | The result first, or the problem the viewer already has; then the product as its answer | 3 s, the product by 15 s |
| Tutorial, how-to | The finished result and how long it takes; no greeting, no intro | 3 s, step 1 by 15 s |
| Onboarding | What they will have at the end of this step | 3 s |
| Explainer | The problem, or the fact that surprises | 3 s |
| Testimonial | The strongest sentence, cold | 3 s |
| Event recap | The peak | 1 to 2 s |
| Social clip | Any of the kinds, picture first | 1 s |
| App store preview | The app in use from frame 0: it autoplays muted, and a title card wastes the only seconds it gets | 1 s |
| Landing page loop | No hook: it loops in silence beside the page's own headline. The product moving, and a seam nobody sees | |

When one opening ships to a feed and elsewhere, the feed's numbers govern.

A longer film watched by choice (a tutorial, a demo, an explainer on a video site) has a second
job in its first 15 s: confirm it is what the title promised, show what the viewer gets, and give a
reason to stay for the end.

## Build it

- Plan the first frame as a frame: what is in it, what is already moving, where the line sits.
- The first second has its own change, and something changes about every second through the first
  three. A change is a cut, a punch-in, a part arriving or an action completing; the slow push and
  the line's own rise are not. `visual-brief.mjs` checks the first shot of a promo for it (a cut, or
  `changesAt`: one time or a list of them): no gap over 2 s in a feed, 3 s elsewhere.
- The opening ends when its picture is complete, not when a slot runs out. A thread of four
  messages was finished at 1.4 s and then waited for a turn fixed at 3.0 s; the critic's words were
  "the hook stalls". Move the turn earlier and give the time to the beat after it.
- The line's reading time is a floor for the line, not a hold for the picture. When the picture
  under a line must stay calm (small words, a busy shot), it keeps its slow push and the line is
  shorter, not the hold longer.
- The motif is met in the hook or right after it (SKILL.md, Find the motif first).
- For a paid ad, plan a second hook as its own row of the manifest: the same film from its second
  shot on. When an ad's first seconds lose viewers and the rest holds them, only the opening is
  changed, so it should be cheap to change.

## Check it

- The storyboard critic judges the opening alone, before anything else: the first picture, its line,
  the sound. Would this viewer stay? Does something move on frame 0? Does it open something?
- The film critic reads `hook.png` (the first three seconds, 12 frames) the same way.
- `frozen-time.mjs` lists any still stretch in the opening, and there should be none; but it
  cannot tell a waiting picture from a working one once the wait has a slow push on it. The
  opening is judged in `hook.png` and the first dense sheet, by eye.
