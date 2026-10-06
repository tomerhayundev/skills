# Styles: what the film is made of

The chooser (`scripts/choose.mjs`) shows the user every style, all on one screen, each an 8 s sample
film, with one or two recommended for this ask. Claude picks the look unless the user taps one, or two
that go together. This file
says what each style is, how it is built, and the rules that keep a style from becoming a template.

## The rule: a medium, never a template

- A style sets what the film is made of. The story, the motif, the hook and every move still come
  from the brand read and the script. The samples were made once for a fictional product to show
  each medium; their layouts, moves, colours and words are never copied into a film.
- One style, or two that pair (`pairs` in `assets/styles/styles.json`). The second lives on the
  first's surface: a line drawn onto the real surface in the footage, type set on the product's
  screen, a cut-out laid on the drawn world. Never beside it, floating
  ([creative-rules](creative-rules.md#graphics-over-footage)).
- The chosen style fills the motif table's World row (SKILL.md, section 4), and the style frames on
  the visual brief are made in it.

## The styles

| Style | Made of | How it is built | Watch for |
| --- | --- | --- | --- |
| `footage` Real footage and photos | The user's own clips and photos | Clips cut on the beat; stills held and moved (a push of about 2% of scale a second) | Graphics sit on a surface in the shot, never in empty air |
| `ui-device` Your product's screens | The product's own components, or Playwright captures of the live site | Inside a device frame (`find-sources.mjs --kind=code --need=device-mockup`); the cursor and taps from `cursor-zoom.ts` | UI redrawn from imagination is always slightly wrong: use the real one |
| `line-art` Wireframe and line drawing | SVG paths | `@remotion/paths` `evolvePath` on the base spring; one line weight for the whole film; the motif drawn the same way | A drawing that only outlines and never does anything is decoration |
| `vector` Flat illustration | Flat SVG shapes in the brand's tokens | Shapes with mass that fall, stack and settle; one accent colour | Node-and-arrow loops read as clip art |
| `kinetic-type` Moving type | The script's own words | The brand's fonts at size; statement lines ([story](story.md)); about 0.3 s a word on screen | Type that moves while it must be read |
| `diagram` Diagrams and data | Charts and flows in SVG | Built up on the beats with `evolvePath`; every number from the brief's facts list | A chart with no claim behind it |
| `collage` Cut-out collage | The user's photos, cut out | A mask path per photo (or a background-removal tool the user turned on), layered on the brand's colours with a soft paper shadow | Ragged cut edges; stock shown as the brand's own |
| `3d` 3D scene | A simple 3D model of the product, or its screen on a 3D device | `@remotion/three` (`ThreeCanvas`), the camera driven by `useCurrentFrame()`, never by a clock | 3D flips and spins for their own sake (banned, creative-rules) |
| `sketch` Hand-drawn | Marker strokes | SVG paths with a seeded wobble (a fixed seed per shot, so every render is the same) in the brand's colours | A wobble that changes every frame and flickers |
| `realistic` Realistic scenes | Photo-real places and textures: the user's own photos first, then free public-domain or CC0 photos (`find-sources.mjs`, no key needed), stock when that tool is on, or an image tool when that is on | Places and textures around the story, moved like stills (a push of about 2% of scale a second), graded to one look | Never the product, never a place shown as the brand's own when it is not; a generated image is labelled as one; the tells of generated images (creative-rules) |

## Tools

The chooser lists a tool only when it was found: a key's name in the environment or the project's
`.env` (never its value), or a tool the agent can call in this session (`--connected`). Each is off
until the user turns it on (`choices.tools`). A tool left off is not used, even where it would
help; the brief may say in one line what it would add.

- **voice**: an AI voiceover ([media](media.md#voice-decide-what-is-possible-before-offering-it), rung 2).
- **image**: backdrops and textures for the `realistic` style or any style's background layer. Use
  the connected tool when there is one; otherwise a small script calls the provider's HTTP API with
  the key read from the environment, never printed, following the provider's current documentation.
- **video**: short moving backgrounds where the film has no footage, never presented as the brand's
  real place or product.
- **stock**: licensed clips for moments the brand has no footage of; each licence goes in
  `docs/brief.md`.

## Remembered choices

`docs/preferences.json` keeps each film's choices (written when the user presses Done, never for
`chosenBy: "assumed"`). The chooser marks the last film's style ("Your last film") and never forces
it: the recommendation comes from this ask. Section 0's rules against repeating are about the
opening, the motif, the track and the layout device; a brand may keep its style from film to film.

## The samples

One 8 s film per style, no sound: a short ad for a fictional product (a self-watering terracotta pot
with no brand) made in that style, with the same four beats in all of them (the promise, the problem,
the turn, the payoff, the promise again, so it loops without a seam). Each comes in English and in
Hebrew, and in four shapes: wide (960x600, for 16:9), tall (648x1152, for 9:16), square (648x648) and
portrait (648x810, for 4:5); the stacked shapes put the words in a band at the top, inside the
platforms' safe zone. The page plays the shape of the platform the user picked. They are fetched on
first use from the skills repo's release (`loopBase` in `styles.json`), checked against their sha256
and kept in `~/.cache/remotion-video-master/styles`. Offline, the page shows each style's poster
instead. Sources and licences: `assets/styles/SOURCES.md`. The project that renders them:
`examples/style-gallery` in the skills repo.
