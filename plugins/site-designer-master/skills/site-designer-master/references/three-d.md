# 3D and shaders

A 3D scene is the most expensive thing a page can carry: weight, battery, attention. It earns its place by
showing or explaining something a photograph and a sentence cannot. When it does, it is often the moment a visit
is remembered by. When it does not, it is the first thing that makes a site read as generated.

## The bar

**A scene ships only when the page is clearly better with it.** Put its poster beside the same page with the
business's photograph in its place. If the photograph page is as good, the photograph wins and there is no scene.
Ordinary is a no: a scene that is fine, tidy or "not bad" is removed.

**Nothing is drawn by hand.** The skill never models a product, a food, a plant, a person or any other real thing
in code: a drawn stand-in reads as a toy next to the real thing (a test loaf, drawn four times, still read as a
glazed bun). 3D comes only from the kit's recipes, and a product only from the business's own 3D model.

## When a scene belongs

Write one sentence before choosing a scene: "On this page, the scene shows [what] so the visitor [understands or
feels what]". If the sentence needs a word like "modern", "premium" or "engaging", there is no scene. Record it in
the brief's `scene` field (see [brief](brief.md)) so the critic can hold the page to it.

| Recipe | Serves the content when | Never |
| --- | --- | --- |
| `object` | the business has its own 3D model of its product (a .glb from its maker, its shop or a scan) and turning it shows what a photo cannot: the back, the depth, the finish | without that model: the build stops, and the page uses the product photograph |
| `points` | real places matter: where the business is, delivers, sources, connects; the places come from the brief | a globe on a business with one address, or places made up |
| `ripple` | one photograph that is the point of the page (a piece, a dish, a room) answers the hand with a soft lens | on every picture, or on product shots that must stay exact |

- **One 3D idea per page** (meter SCENE_COUNT), on persuade and experience pages ([motion](motion.md) has the
  budget by mode). Operate and read pages: none, except `points` on a contact or delivery page with real places.
- **The words stay in HTML.** Headings, prices, buttons and labels sit over or beside the scene as page text;
  nothing a visitor must read is drawn inside the canvas.
- **The scene sits in the grid.** It takes the same column edges as the text beside it, never a floating box.

## Art direction

Fill these in the brief's `scene` before writing the markup. Every line comes from the brief and the picks.

| Line | Rule |
| --- | --- |
| Palette | The world is in token colours (`data-colors` names them): the scene's ground is the page's ground, one accent at most. A real product keeps its own colours and materials, from its model. |
| Light | The kit lights `object` with a soft studio environment and one key light with a soft shadow, and keeps the colours true; nothing is lit by default. |
| Motion | One idea, slow: an idle turn, or the scene following the scroll. Eased, never bouncing. The pointer tilts or bends a little, it never steers. |
| Finish | Restraint: no glow, no stacked effects, nothing behind words people read. |

### 3D tells (the critic judges these)

| Tell | Fill |
| --- | --- |
| The tutorial object: a torus knot, floating icosahedra, a random blob | no scene; the business's photograph |
| A product, food or thing drawn in code | the business's own model, or its photograph with `ripple` |
| A violet glass world, a neon-on-black "tech" space | the brand's ground and accent |
| Glow on everything, particles behind the headline | one effect, behind nothing anyone reads |
| Mouse parallax on every element, scroll that takes over the page | one gentle response in one place; native scroll always |
| A spinner before anything shows | the poster first, the scene fades in over it |
| Stock 3D shown as if it were the business's product | only the business's own model |

## The kit

`assets/site-kit/three/` is copied into a built site only when a page uses a scene. It holds:
- three.js 0.187 as one classic script, so the site also runs from disk (see `VERSION`);
- the stage (`stage.js`);
- the recipes (`scenes/`).

The stage does the parts every build used to get wrong:
- it starts the scene after the page has loaded and fades it in over the poster;
- it draws only while the scene is on screen and the tab is visible;
- it caps the pixel ratio at 2, or 1.5 on touch screens;
- it keeps the poster with reduced motion, without WebGL, while a model loads, or when the scene fails;
- it reads the brand colours from the tokens.

```html
<div class="where-we-deliver" data-scene="points" data-points="32.08,34.78;31.77,35.21" data-colors="ink-muted accent">
  <img src="/assets/scene-delivery.webp" alt="" width="1200" height="900">
</div>
```

- The poster is the first thing inside, with width and height, never lazy (the build stops otherwise). It is
  `alt=""` when the words beside it say what it shows; otherwise it carries that sentence.
- Make the poster from the scene: `node ${CLAUDE_SKILL_DIR}/scripts/poster.mjs <src>`. It writes every poster
  `<img>` path inside `assets/`, so the poster always matches the scene. Run it again after changing a scene.
- `ripple` uses its photograph as the poster: never redrawn.
- The scene's size is the poster's unless the site sets one (an `aspect-ratio`, or a block size on the scene).

| Recipe | Library | Attributes |
| --- | --- | --- |
| `object` | three.js | `data-model` the business's own .glb (plain glTF binary, no Draco or meshopt compression, at most 1.5 MB, textures at most 2048 px; required); `data-motion` idle, scroll, still |
| `points` | three.js | `data-points` real places as "lat,lon;lat,lon" from the brief; `data-count`; `data-colors` dots then places; `data-motion` |
| `ripple` | none (one shader) | `data-strength`; the photograph must be the site's own file (served; from disk it stays a still photograph) |

A site's own scene file (`src/scenes/<name>.js`) is possible only for something the user brings already made, and
it meets the same bar. The skill does not write one.

## Weight

- three.js is about 205 KB compressed. The stage loads it after the page has loaded, so it does not count
  against the first-load JavaScript budget in [performance](performance.md), but it is still weight on a phone:
  `ripple` needs no library and costs a few KB.
- The poster is the hero image and keeps the hero budget (at most 250 KB at 1440 wide).

## Floors (the meter checks these)

| Rule | Meter rule |
| --- | --- |
| Every scene starts with its poster: there, sized, never lazy. | SCENE_POSTER (the build checks it too) |
| A scene draws something real: it starts, and its frame is not one flat colour. | SCENE_BLANK |
| With reduced motion and in a browser without WebGL, the poster shows and nothing draws (two extra passes). | SCENE_FALLBACK |
| One 3D idea per page. | SCENE_COUNT (warning) |
| A scene that could not run in the checking browser is looked at by hand. | SCENE_UNCHECKED (warning) |
| A canvas is hidden from screen readers, or is a labelled picture. | CANVAS_ARIA |

The meter's browser draws one frame of each scene, not the loop. The walk checks the rest by hand in a real
browser: the scene fades in over the poster without a jump, it moves slowly and the pointer response is gentle, it
stops when scrolled away and resumes, it fits a phone with the words still readable beside it, and the bar above
holds: the page is clearly better with it than with the photograph.
