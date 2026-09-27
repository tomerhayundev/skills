# Architecture

How the pipeline is built, in the order to scaffold it. Code is TypeScript and
minimal on purpose: adapt names to the project, keep the shapes.

## Layout

```
video/                      standalone package: own package.json, tsconfig, vitest
  public/music/             the music bed + CREDITS.md (staticFile resolves here)
  scripts/render.mts        batch renderer (tsx)
  scripts/upload.mts        publish to the media bucket
  src/index.ts              registerRoot(RemotionRoot)
  src/Root.tsx              one <Composition> per expand() output
  src/Clip.tsx              renders one composition: scene chain + music
  src/manifest.ts           the rows; the only file most requests touch
  src/expand.ts             rows -> compositions, all validation
  src/chain-layout.ts       Sequence placement + total duration, one source
  src/audio/music.ts        beat math for the music bed (pure)
  src/motion/tokens.ts      FPS, grid unit, colors, type sizes
  src/motion/spring.ts      the one easing spring
  src/motion/camera.tsx     focus-rect camera with an optional breathing drift
  src/motion/Caption.tsx    word-by-word caption in a reserved bottom band
  src/motion/Grade.tsx      vignette + film grain seeded on the grid
  src/layout/aspects.ts     the four output sizes and their safe margins
  src/layout/fit.ts         fitRect(): a canvas rect into an aspect
  src/layout/rtl.ts         mirrorRect/mirrorPoint for RTL locales
  src/scenes/index.ts       scene METADATA (Node-loadable, no .tsx)
  src/scenes/components.ts  scene COMPONENTS (browser bundle only)
  src/scenes/<Scene>.tsx    one per product moment
  src/content/              captions per locale, in-scene chrome text, personas
```

Keep it a separate package. The app's lint, type check and tests should never
depend on Remotion, and the video's should never block an app deploy.

## Tokens

```ts
export const FPS = 30;
/** One beat at 120 BPM. Every duration is a multiple of this. */
export const TRANSITION_FRAMES = 15;
/** The square authoring canvas. Every aspect is a window onto it. */
export const CANVAS = 1920;
export const COLOR = { stage: "#0b0b0d", accent: "#d7ff3e", paper: "#fff", ink: "#12121a" } as const;
```

Everything reads from here. A value that lives in one scene is a value that drifts
from the others.

## One square canvas, four windows

Author each scene once on the 1920x1920 canvas. A scene declares where its action
is with two rects, `focus.from` (cold open) and `focus.to` (settled). The camera
eases between them and `fitRect` scales that rect into whichever aspect is
rendering, leaving room for the caption band:

```ts
export function fitRect(rect: Rect, aspect: AspectId, captionBand = 0) {
  const out = ASPECTS[aspect];
  const h = out.height - captionBand;
  const scale = Math.min(out.width / rect.w, h / rect.h);
  return { scale, x: out.width / 2 - (rect.x + rect.w / 2) * scale, y: h / 2 - (rect.y + rect.h / 2) * scale };
}
```

A slow "breath" (scale +-1%) and "sway" (a few px) on non-loop clips keep a held
frame alive. Because they move the frame, a containment test must check the rect
against the drift envelope, not the static fit: compute the rect that is
guaranteed on screen at the drift extremes and assert every element sits inside
it. That is the test that caught clipped keyword chips.

## Scene registry: split metadata from components

```ts
// scenes/index.ts: loadable by plain Node/tsx (the render script imports it)
export const SCENES: Record<SceneId, SceneDef> = {
  MatchScore: { id: "MatchScore", defaultDuration: 300, focus: { from, to }, captionKey: "matchScore" },
  // persist: a shared element (e.g. the product page) for overlap transitions
};
// scenes/components.ts: browser bundle only
export const SCENE_COMPONENTS: Record<SceneId, React.FC<SceneProps>> = { MatchScore, /* ... */ };
```

The render script runs under tsx and cannot load what scenes import (fonts as
`.woff2`, CSS). If a `.tsx` becomes reachable from `expand.ts`, the whole pipeline
breaks. Keep a regression test that spawns `node --import tsx` on `expand.ts`.

Scene durations are multiples of the grid unit. Every scene takes the same props
(aspect, locale direction, captions, persona, whether it is standalone, whether it
drifts, whether it is captioned).

## Manifest and expand()

```ts
export interface ChainEntry {
  scene: SceneId;
  from?: number;            // window start inside the scene (first entry only)
  to?: number;              // window end
  captionOverride?: { en: string; he: string };  // swap the caption for this clip
  captionTiming?: { startAt: number; stagger?: number }; // reveal earlier/faster
  musicLift?: boolean;      // the music's lift lands on this entry's first frame
}
export interface ClipRow {
  id: string;
  scenes: ChainEntry[];
  aspects?: AspectId[];     // omitted = all four; name only to exclude
  locales?: LocaleId[];
  loop?: boolean;
  captions?: boolean;
  posterFrame: number;
}
```

A slice of an existing scene is a row, no new animation:

```ts
{ id: "keyword-chips", scenes: [{ scene: "MatchScore", from: 60, to: 210 }], posterFrame: 120 }
```

`expand()` validates and throws, so a bad row fails the build instead of rendering
something wrong: unknown scene, window outside the scene, caption override on a
scene without a caption, an interior entry with `from > 0`, a total duration off
the grid, a poster frame outside the clip, more than one `musicLift`, a lift on a
loop. It emits one composition per row x aspect x locale with id
`<clip>-<aspect>-<locale>` (hyphens only: Remotion rejects underscores in ids, and
only at runtime, never in a unit test).

## Chain layout

Nothing hard-cuts (see [Transitions](#transitions)). When both neighbours declare `persist`
(the same element on screen, e.g. the product page), they overlap by one grid unit:
the outgoing scene's chrome fades out, the incoming fades in, and a floating copy
of the shared element glides between the two cameras' settled rects. Reuse each
scene's own settled rect for the overlay, or the element pops in size at the cut.

One function computes both each Sequence's `from` and the composition's total
duration, so the declared length can never disagree with what renders.
A windowed first entry is rendered with a negative `Sequence.from`, so the scene's
own clock starts mid-animation. Its `durationInFrames` must grow by the same
amount, or the back half of the clip goes black.

## Transitions

**Every scene is made out of the previous one.** Two mechanisms, chosen per boundary:

1. **Shared element** (both scenes declare `persist`): the element glides from one
   scene's framing into the next, as above.
2. **Flood** (every other boundary): the motif's silhouette (SKILL.md, "Find the motif
   first"), in the accent, grows from the outgoing scene's anchor until it covers the
   frame, the cut happens underneath, and it contracts into the incoming scene's anchor.
   The next scene's key element grows out of where the last one was. Pure math in
   `assets/templates/flood.ts` (with tests).

Getting the flood right:

- **The shape is the motif.** Give its silhouette as a closed polygon around the point
  it grows from, build `floodProfile(outline)` once at module scope, and draw the
  polygon with `translate(cx cy) scale(floodScale(frame, geo, profile))`. The outline
  must contain that point and be star-shaped around it (every ray from it leaves the
  outline once): a page, a drop, a speech bubble, a leaf, a tag, a heart. A crescent, a
  ring or a letter C is not, and `floodProfile` throws; simplify the silhouette or move
  the point. `discOutline()` is the fallback for a motif with no closed outline, and the
  plan's Transitions row says why it was used.
- **Ease the coverage, not the scale.** Visible area grows with scale squared and then
  clips at the frame edges, so a scale eased over 9 frames covers most of the screen in
  two frames: a pop. Pick the share of the frame covered per frame (an ease-in-out on
  coverage), then solve for the scale by bisection on the shape/frame overlap (exact for
  a star-shaped outline: along each ray the visible part ends at the nearer of the two
  edges). Result: no frame changes more than about 18% of the screen.
- **About 0.3s each way** (9 frames at 30fps), full cover on both frames around the cut,
  and a reach 1.15x past full cover.
- **Anchors.** A scene's anchor is where its eye goes, in canvas coords, mapped through
  the same camera fit and RTL mirroring as the scene (`focus.to` for the outgoing
  scene, `focus.from` for the incoming one). Default: the focus rect's centre. Declare
  one when the key element sits elsewhere, or the shape contracts beside it. Mirror the
  outline too in RTL when the motif has a direction (a speech bubble's tail).
- **Automatic.** Derive flood boundaries from the chain (every boundary that isn't a
  shared-element overlap), so a new cut can never ship as a hard cut.
- Other shape changes that read the same way: text rising out of a mask line, icons
  popping from zero on a spring, bars drawing across, a page pushing the last one out.

**A value with several targets over time** (a counter that retargets, a card that moves
twice): make it the base value plus one spring per change, each starting at its own
frame: `v(f) = v0 + sum(delta_i * spring(f - start_i))`. It stays a pure function of the
frame, with no state carried between frames.

**Motion blur** for fast shape changes: `@remotion/motion-blur` (`<CameraMotionBlur>`)
renders subframes and blends them; the ffmpeg equivalent is rendering at 4x the frame rate
and blending with `tmix`. It multiplies render time, so apply it around floods, not to
the whole film.

## Captions

A bottom band is reserved per aspect (taller on `tall`), sized from the caption's
estimated line count, so the camera never pushes content into the text. Words
reveal on the one spring with a stagger. One word gets the accent color: mark it
explicitly (`^word`), because "the longest word" lands on function words in
languages like Hebrew. Test the hold: the frame the last word settles, plus 1.5s,
must come before the beat ends. Write that as a unit test over every row.

## Locales and RTL

A locale is not a translation pass. Mirror the layout with `mirrorRect` /
`mirrorPoint` applied to the LTR geometry, switch fonts per script, and keep
numbers LTR inside RTL text (an isolated `dir="ltr"` span): "89%" reversing is the
classic failure. Captions and in-scene UI text live in per-locale dictionaries;
write them idiomatically for the market, not translated.

## Fonts, grain, determinism

- Load every face with `@remotion/fonts` `loadFont` behind `delayRender` from a
  module-level promise. Keep a render test with a probe composition that renders
  text in the font and in `system-ui` and asserts the pixels differ.
- Film grain: an SVG `feTurbulence` whose seed cycles every grid unit, so loops
  seam cleanly. Keep a `grain-off` twin composition and a test that the grain
  actually changes pixels (it was once a measured no-op).
- Every frame must be a pure function of the frame number: no `Date.now()`, no
  `Math.random()` without a seed, no CSS animations.

## The render script

```ts
const serveUrl = await bundle({ entryPoint: join(ROOT, "src/index.ts") });
for (const spec of specs) {
  if (upToDate(spec)) continue;                 // outputs newer than every source
  const composition = await selectComposition({ serveUrl, id: spec.id, inputProps: { spec } });
  await renderMedia({ composition, serveUrl, codec: "h264", crf: spec.loop ? 30 : 18,
    pixelFormat: "yuv420p", outputLocation: mp4, inputProps: { spec } });
  if (spec.loop) await renderMedia({ /* ... */ codec: "vp9", crf: 32, outputLocation: webm });
  await renderStill({ composition, serveUrl, frame: spec.posterFrame, imageFormat: "webp", output: webp, inputProps: { spec } });
}
```

- Flags: `--filter --aspect --locale --dry-run --force`. Batch by aspect.
- Watched sources for the skip check: `src/`, `scripts/`, `public/`, and any app
  modules the scenes import (a template or typography change invalidates renders).
- Sort outputs into `out/promo/`, `out/clips/`, `out/loops/`. A flat pile of 100
  files hides which ones are deliverables.
- Loops that ship in the app's own `public/` get a hard size cap (e.g. 400 KB)
  checked before the skip decision and after rendering.

## Publishing

- A dedicated public bucket for marketing media, never the bucket that holds user
  uploads (public access is bucket-wide).
- Keys `video/<yyyy-mm-dd>/<clip>-<aspect>-<locale>.mp4` plus a `manifest.json`,
  so a re-cut never overwrites a clip already live in an ad.
- Serve the landing page's promo straight from the bucket's CDN domain, not
  through an app route (that pays app bandwidth for every view).
- Keep a runtime switch for which dated cut the site serves, so rolling forward or
  back is not a deploy.
