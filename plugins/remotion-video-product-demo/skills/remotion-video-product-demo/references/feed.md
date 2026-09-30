# In the feed: the first two seconds decide

Reels, TikTok, Shorts and Stories are built for the thumb: a viewer who is not caught in the first
one or two seconds is gone, and the rest of the film does not exist for them. A video in a vertical
feed, a promo above all, is built from its first two seconds outwards:

- **Frame 0 is the strongest moving picture in the film,** in the middle of the action: coffee
  hitting the cup, a crust tearing open, a hand in close-up doing the product's thing. Never a logo, the
  brand's slogan, a title card, a static product on white, or a fade up from black. Prefer the moving picture only this brand has; when frame 0 is the category's stock shot, the brand's difference is on screen within 2 s.
- **Something visibly changes about every second in the first three:** a cut, a move, an action
  completing. A calm film can slow down after the hook, never before it.
- **The hook line opens a question or speaks to the viewer** (6 words or fewer, on screen within
  0.5 s). It stays for its reading time while the picture keeps moving; the picture never waits
  for it. The brand's tagline is not a hook: it belongs to the close. The kinds of hook to choose
  from: [hooks](hooks.md).
- **Sound has energy on frame 0.** The track starts at its feed start (`feedStartSeconds` and
  `feedStartBeat` in the `track.json` that `get-track.mjs` writes: a point where the beat is already playing; see [music-bed](music-bed.md)), never at its quiet intro; its bigger lift
  still lands on the payoff.
- **The picture fills the vertical frame.** A split screen halves the subject; use one as a single
  gesture at the turn, never as the grammar of the whole film.
- **15 to 30 s, with the turn in the first half.** The 45 to 60 s engagement figures are for organic
  storytelling that holds, not for a promo; a longer feed promo is almost always padding.
- **The end leads back to frame 0,** so the loop plays again without a seam in the story.

The brand read's Look row shapes the frame (palette, space, type, how few words) and the sound's
timbre (piano or guitar); it never lowers the energy of the opening. A minimal, clean brand still
opens hard; it opens clean.

Checks: `visual-brief.mjs` with `"feed": true` refuses a film where nothing changes in the first
2 s (a cut, or a change inside the first shot marked with `changesAt`, so the hook line can stay up
across it), a track with no
start point, and a cut over 30 s without a reason; the concept and storyboard critics judge the first
two seconds alone first; the film critic reads `hook.png` from `critic-pack.mjs` before anything else
([verification](verification.md#critique-at-three-points)). `hook.png` shows the first three
seconds, so the second and third can be judged too.
