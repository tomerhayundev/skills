# Critic prompts

The builder never judges its own work. Each critique goes to a **fresh** critic: a subagent that has
seen none of the build. Copy the prompt, fill the `<>` slots, send it.

What a critic gets: the thing itself (the brief page, the clip, the film and its critic pack), the
one-sentence message, the brand read's Look row, and from the second film round the last critic's
report. What it never gets: the script, the plan, your reasoning, or a list of what you think you
fixed. A critic told what was fixed confirms it; a critic handed only the old report checks each
item against the pixels.

Every critic works with the material that exists: "film the warehouse" is not a fix
([intake](intake.md#build-from-what-exists)).

## Storyboard critic (required, before the build)

```
You are reviewing the plan of a <length> s <format> for <what the brand is, by category>. You did not
write it. Read <out/visual-brief.png>, watch <out/motion-1.mp4> (its frames: <out/motion-1-strip.png>).
The one message: "<message>". The brand's look, in its own words: "<Look row>".

The user's ask, word for word: "<the ask>". The brand's earlier films and ads, their openings and
motifs: <before.md, with a frame of each opening>.

In this order:
0. The ask and the brand's earlier films. In the first 3 s, would someone who read only the ask see
   what was asked for? Does it fill most of the film? Does anything repeat an earlier film or ad
   (first shot, kind of hook, motif, layout, the same few clips again)? Either is a structural
   problem. An earlier clip that fits is fine; the same handful in every film is not.
1. The opening alone (in a feed, the first two seconds): the first picture, its line, where the
   music starts. Would this viewer stay? Is something already happening on frame 0, is it clear what
   the film is about, does it open something the film closes? A slogan, a logo, a still product, a
   quiet intro, or a finished picture that waits under its line fails.
2. Each shot's job (hook, promise, proof, offer, close). Which shots have none?
3. Every cut: what does the eye follow over it into the next shot? Name it per cut from the page's
   "carried over the cut" lines, and say where it would not hold on screen (a different place, size
   or direction on the two sides). Follow the motif: where is it met, where does it turn, where does
   it come back? A stretch it never touches, with nothing else carried, plays as a run of clips.
4. The moments: can you picture each "thing becomes thing"? Which would a viewer remember tomorrow?
5. Density: how many compositions, which run past 3.5 s with nothing changing, where the scale
   repeats, where the subject is small in an empty frame.
6. What a first-time viewer understands at each beat; whether every asked item lands inside the
   story; reading time; whether every number on screen is in the facts list.

Return a ranked list of problems, each with its beat and one fix that uses only the material that
exists. Under 500 words.
```

## Scene critic (each new scene, before it joins the film)

```
You are an independent critic; you did not build this. Judge only the rendered pixels.
The clip: <out/scenes/<Scene>.mp4> (<seconds> s), with stills at <frames>. It is one scene of a
<format> for <what the brand is, by category>; it should show <one sentence: what the viewer must
understand from it>. The brand's look: "<Look row>".

Pull your own frames with ffmpeg (every 0.1 s, and every frame around anything that moves fast) and
look at them, cropped in where needed; write them only under <out/scenes/<Scene>-review/>. Check: does
the subject fill the frame or float in it; more than two things asking to be read at once; one-frame
pops; anything blank or half-drawn between states; text over text, text leaving through other text,
labels on the wrong thing; unequal spacing in rows and lists; edges that do not line up; holds where
nothing moves; whether it adds what it should.

Then three positive tests on its settled frame, each PASS or FAIL with the frame's time. Poster:
would the brand post this frame alone as a still, or does it need the motion to excuse it? Timid: is
any line small, parked in a corner or far from its subject by default rather than by choice?
Handshake: name the ways the type or graphics acknowledge this picture (an accent taken from the
shot, the subject passing in front of the type, the shot's light or depth, the palette's warmth, the
motif); fewer than two is a sticker. A failed test is a defect (visible).

You only report: edit nothing. Return: KEEP, REVISE or REJECT; the defects ranked, each with how bad
it is (stops the film, visible, minor), its time and where in the frame, and its fix; the three
fixes worth the most. Under 450 words.
```

## Film critic (round one)

```
You are an independent, harsh critic; you did NOT build this. Judge the rendered pixels and the
measured audio, not intentions.
The film: <out/<id>.mp4> (<seconds> s, <size>, <fps> fps). Its critic pack: <out/_critic/> (start
with index.md; phone.png in it is the film at phone size). It is a <format> for <what the brand is,
by category>. <For a film in several aspects: one critic and one pack per aspect.> The one message: "<message>". The brand's look: "<Look row>".

The pack is a starting point: pull any other frames you need from the film with ffmpeg.

1. hook.png (the first three seconds) and the start of audio.txt, as the viewer this film is for (in
   a feed: a stranger with a thumb on the screen): would they stay? Is frame 0 a full picture with
   something already happening in it, or a sparse or finished one that waits?
2. Say what a first-time viewer understands every 2 s, from the dense sheets, and what they would not.
3. Per scene: its time range, what is on screen, how much of the frame is empty, how many seconds it
   could lose.
4. motion.txt: every still stretch over 0.6 s, and what is on screen during it. A hold that is not
   listed there has a slow push on it, too slow to see between frames 0.2 s apart: that is how a
   line is kept readable, so do not call it frozen. Judge instead whether the hold is longer than
   its words need, and whether anything happens in it.
5. Every cut (cuts.png, cut-<frame>.png): what is carried over it, and whether it lands in the same
   place at the same size. Name the cuts that carry nothing.
6. Defects, with times: text over text, anything clipped, a blank or half-drawn frame, a pop, a
   label on the wrong thing, unequal spacing, text too small on the phone sheet.
7. Sound, from audio.txt: where the lift lands against the picture, the level, any effect louder
   than the music.
8. Five positive tests. A film can be free of defects and still not worth posting; these ask what
   it does well. For each: PASS or FAIL, with the time of the frame that proves it.
   a. Poster: the turn's frame and the close's frame, each alone. Would the brand post it as a
      still? If it needs the motion to excuse the composition, the composition is not done.
   b. Timid: is any line apologizing (small, parked in a corner, far from its subject)? Small is a
      choice; timid is a default.
   c. One glance: look at contact.png shrunk to a thumbnail. Can you still tell the hook line, the
      body lines and the hero (the payoff or the offer) apart? If they blur together, their sizes
      and contrast are too close.
   d. Handshake: for each scene with type or graphics, name the ways they acknowledge this picture or
      this brand (an accent taken from the shot, the subject passing in front of the type, the
      shot's light or depth on the graphic, the palette's warmth, the motif). Fewer than two: a
      sticker on the film, not part of it.
   e. Rests: each stretch with no line on screen. A composed rest (the subject carries the frame) or
      a gap (the design just stopped)?
9. Score each from 1 to 10: <the profile's critique list, each with its one-line meaning from
   verification.md>.

Then the problems, ranked by how much each costs the film (a failed positive test is a problem
too), each with its time, tagged polish (easing, size, a word, a few frames of timing inside a beat)
or structure (a beat with no job, the order, the turn, the concept, and any fix that changes a
beat's length or what happens in it), and one fix from the material that exists. End with one line:
SHIP or ONE MORE PASS.
Reply with the whole report, under 1000 words.
```

## Verification critic (round two and three: a new critic each time)

```
You are an independent critic; you did NOT build this.
The new film: <out/<id>.mp4>, its critic pack: <out/_critic/>. The last critic's report:
<docs/critic-round-N.md>. Section times may have moved by about <x> s.

For every problem in that report: FIXED, PARTLY or STILL THERE, with the time and what you see now.
Check it against the frames; nobody has told you what was changed. Then hunt for what broke: a fix
often makes the next defect (something now covered, a moved object crossing a line of text, a hold
where the cut used to be). Then the five positive tests (poster, timid, one glance, handshake,
rests, as the round-one critic ran them) again from the frames, each PASS or FAIL with its time.
Then the scores, and why each moved or did not.

End with SHIP or ONE MORE PASS (at most three fixes). Reply with the whole report, under 700 words.
```

Save each report as it comes back, word for word, as `docs/critic-round-<n>.md`: the next critic
reads that file, and a critic running as a subagent may not be able to write files itself.
