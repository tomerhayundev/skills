# Visual system: the numbers

Every built site follows these numbers. **Floor** means the meter fails the page; **default** means the
build uses it unless the picks, the brand or the page's mode say otherwise, and a change is defended in one
line. All values are tokens (`tokens.json`, checked by `tokens.mjs`); no raw value appears in a component.
Fonts and colours are never fixed here: they come from the brand and the user's picks.

Modes (from the brief): persuade (home, landing), operate (shop, booking, forms), read (articles, docs, legal),
experience (portfolio, launch).

| Meter rule | What it checks |
| --- | --- |
| BODY_SIZE, TEXT_MIN, UI_TEXT_MIN | the type floors in section 4 |
| LEADING, TRACKING, TRACKING_WIDE, MEASURE | line height, letter spacing and line length in sections 3 and 4 |
| CONTRAST | the contrast floors in section 5 |
| TARGET_SIZE, TARGET_TOUCH | the control sizes in section 7 |
| H_OVERFLOW | the grid and widths in section 3 |
| IMG_DIMENSIONS, HERO_LAZY | the image rules in section 8 |

## 1. Units and base

| Item | Rule |
|---|---|
| Root | `html { font-size: 100% }` (16 px, respects the user's setting). Sizes in `rem`, spacing in `rem`, borders and hairlines in `px`. |
| Base unit | 4 px (0.25 rem). Every spacing, size and radius token is a multiple of 4, except 2 px for hairlines/focus offsets. |
| Fluid values | `clamp(min, preferred-vw, max)` for display type, section padding and gutters. Min is the phone value, max the 1440 value. |
| Logical properties | `margin-inline`, `padding-block`, `inset-inline-start`, `text-align: start/end` everywhere. Physical `left/right` only for things that must not flip (a play icon). Floor in any RTL-capable build. |

## 2. Spacing

**Scale (tokens `--space-1` ...):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 240 px.

| Use | Default | Floor |
|---|---|---|
| Inside a control (icon to label) | 8 | |
| Label to its field, heading to its paragraph | 8-12 | |
| Between items in a group (list rows, form fields) | 16-24 | |
| Between groups inside a section | 32-64 | |
| **Section padding, Persuade / Experience** | desktop 120-192 (`clamp(72px, 10vw, 192px)`), phone 72-112 | section gap clearly larger than any inner gap |
| Section padding, Operate / Read | desktop 64-96, phone 48-64 | |
| Space above a heading vs below it | above >= 1.5x below (the heading binds to what follows) | above > below |
| Text to a visible container edge | 16-24 | >= 8 px |
| Body text to the viewport edge | 16-24 phone, gutter on desktop | >= 16 px (>= 12 px at <= 480) |
| Gap between tap targets | 8 | 8 px or targets >= 44 |

**Rhythm rule:** tight inside groups, generous between; the meter flags monotony when one value is >= 60% of >= 10 spacing declarations with <= 3 unique values. Use `gap` for sibling rhythm, not margins on children.

## 3. Layout grid, containers and breakpoints

| Item | Default |
|---|---|
| Columns | 12 on desktop (>= 1024), 8 on tablet (768-1023), 4 on phone. CSS Grid, not flex percentage math. |
| Gutter (column gap) | `clamp(16px, 2vw, 32px)` |
| Page margin (outer) | `clamp(16px, 4vw, 64px)`; equal on both sides. Persuade/Experience may use tight margins (16-32) with large things running to the edge. |
| Container | content max 1280-1440; full-bleed bands allowed; cap very wide layouts at 1920. |
| Text measure | 45-75ch for running text; floor <= 80ch. Constrain the text, not the page. |
| Left edges | 2-3 shared alignment edges per page; > 6 distinct left edges with the top three under 60% = ragged. |
| Centred text | at most one centred moment per page (a short hero or close); > 72% of text centred = warn; never centre a paragraph over 3 lines. |
| Breakpoints (min-width, mobile first) | 480, 768, 1024, 1280, 1536. Prefer fluid `clamp()` over extra breakpoints; components that live in different widths use container queries. |
| Test widths | 320, 375, 390, 768, 1024, 1280, 1440, 1920. |
| Full-height sections | `min-height: 100svh` (or `dvh`), never `100vh`. |
| First screen | one dominant thing: display type >= 4.5vw or a picture >= 30% of the viewport; no hero void >= 28% of it. |
| Empty space | no blank stretch >= 60% of the viewport height; no section huddled on one side leaving half the width empty. |

## 4. Typography

**Families:** 1 or 2 (a third only with a role nothing else can do, typically mono for real code/data). Load only used weights. Every family must cover every script on the page (Hebrew checked by rendering a specimen and detecting fallback).

**Scale:** modular, few steps far apart.

| Item | Persuade / Experience | Operate / Read |
|---|---|---|
| Ratio between steps | 1.25-1.5 (floor: adjacent roles >= 1.25x) | 1.2-1.25 |
| Distinct sizes on a page | <= 5-6 | 4-9 |
| Display (hero) | `clamp(2.5rem, 6vw, 6rem)`; >= 4x body; max ~6 rem (larger only as a decided giant-wordmark direction) | 2-3 rem |
| Body | 1.0625-1.25 rem (17-20 px) | 1 rem (16 px) |
| Small / caption | 0.875 rem | 0.8125-0.875 rem |

**Floors:** running text >= 16 px; nothing read under 13 px; functional UI text >= 11 px; legal >= 10 px. Form inputs >= 16 px (stops phone zoom).

| Item | Default |
|---|---|
| Line height, body | 1.5-1.6 (Hebrew 1.6-1.75); floor 1.3 for any multi-line text |
| Line height, display | 0.95-1.1 Latin; Hebrew 1.1-1.25 (no ascender/descender model to lean on) |
| Letter spacing, display | -0.01 to -0.03 em; floor -0.04 em |
| Letter spacing, body | 0; never > 0.05 em; never negative on text under 20 px |
| Letter spacing, Hebrew | 0 always (no tracking, no all-caps; caps do not exist) |
| Uppercase | only short labels/nav, with +0.04 to +0.08 em; never body (>= 80 chars in caps = fail) |
| Headline length | hero 4-8 words; <= 2 lines at 1440, <= 3 at 390 |
| Wrapping | `text-wrap: balance` on headings, `pretty` on body; no one-word last line on display type |
| Weights | between sections of a page, hierarchy by size and space first; display may be regular; <= 3 weights per family on a page |
| Inside a component | a card, form, list row or price block builds hierarchy from weight and ink, not size: its title is at most one step larger than its body (often the same size), one weight heavier and in `ink`; secondary lines in `ink-muted`. At most 3 font sizes inside one component; five sizes on one card is the generated look. |
| Numbers | `font-variant-numeric: tabular-nums` in tables, prices lists, anything compared |
| Paragraph rhythm | space between paragraphs = 0.75-1 em of body, or a first-line indent, never both |
| Light text on dark | +0.05 line height, one weight step heavier |
| Loading | `font-display: swap`, preload the above-the-fold face, fallback with size-adjust to limit shift |

## 5. Colour

**Roles (tokens):** `ground`, `surface`, `surface-2`, `ink`, `ink-muted`, `border`, `accent`, `accent-ink` (text on accent), `focus`, `danger`, `success`, `warning`; dark variants when a dark theme exists. Raw colour literals outside the token file = fail (> 12 = a second palette).

| Item | Rule |
|---|---|
| Source | the brand file, else the logo and current site; the picks decide strategy (restrained, committed, full, drenched). |
| Ramps | built in OKLCH: vary lightness, reduce chroma toward white/black. |
| Proportion | ground 70-90% of a screen; accent < 5% and on the action plus at most one detail. |
| Contrast floors | body and small text 4.5:1; large text (>= 24 px, or >= 19 px bold) 3:1; UI parts, icons, focus ring, input borders 3:1. Default for running text: >= 7:1. |
| Muted text | still >= 4.5:1; on a coloured surface, tint muted text from that hue, never plain grey. |
| Neutrals | every neutral role (`ground`, `surface`, `surface-2`, `border`, `ink`, `ink-muted`) carries the accent's hue at very low chroma (OKLCH chroma about 0.005-0.02), so the greys belong to the brand and none is a dead grey. A brand whose own greys are cool or warm keeps them. |
| Surfaces | separated by a small lightness step (2-6 L points) before lines or shadows. |
| Pure black / white | grounds use tinted near-black/near-white; pure #000 text on #fff is allowed for Read mode. |
| Dark theme | designed, not inverted: `color-scheme: dark`, deep tinted ground, depth by surface steps, muted text re-checked. Only when the picks or brand ask for it. |
| Status | never colour alone: icon or text too. |
| Slop detectors | violet/indigo gradients and default indigo hexes, cyan-on-dark, gradient text, coloured glows, radial halos, reflex cream + terracotta: per the slop catalogue. |

## 6. Shape, borders and elevation

| Item | Default |
|---|---|
| Radius system | chosen once, from the picks: all square (0-2), soft (6-12), or round (pill buttons, 16-24 panels). At most 3 radius values for panels. |
| Nested radius | inner = outer - padding. |
| Borders | 1 px hairline in `border` role; one separation method per surface: border OR shadow OR tone step, never hairline + wide shadow. |
| Elevation scale | 0 (flat, default), 1 (sticky header, dropdown: small soft shadow), 2 (popover), 3 (modal). Shadows tinted to the ground hue, never coloured glows; no resting shadows on cards by default. Each level is two layers, a tight faint contact shadow under a wider softer one, never one big dark blur: level 1 `0 1px 2px <ink at 6%>, 0 2px 8px <ink at 6%>`; level 2 `0 1px 3px <8%>, 0 8px 24px <8%>`; level 3 `0 2px 6px <10%>, 0 24px 48px <12%>`, colours from the `ink` role. |
| Cards | only when elevation means something; never nested; rows of equal cards with icon tiles are a tell. |
| Coloured side stripes | no `border-inline-start` > 1 px as an accent on cards or alerts. |
| Z-index scale | base 0, raised 10, sticky 100, dropdown 200, overlay 300, modal 400, toast 500. No other values. |

## 7. Components (sizes and states)

| Item | Default | Floor |
|---|---|---|
| Button height | 44-48 (primary), 36-40 (secondary in dense UI) | hit area >= 44 on touch, >= 24 any pointer |
| Button padding | inline 20-28, block from height | label never touches the edge |
| Button text | verb + object, sentence case, one primary per view | |
| Input height | 44-48; text 16 px | >= 16 px text |
| Label | above the field, 8 px gap; error text below, 4-8 px gap | visible label always |
| Field gap | 20-24 between fields; 32-48 between field groups | |
| Icon sizes | 16, 20, 24 (UI); 32-48 decorative; stroke width one value per set; icons align to the text's cap height | icon-only buttons have an accessible name |
| Nav height | 64-80 desktop, 56-64 phone; sticky offsets set with `scroll-padding-top` so focus is never hidden | |
| Focus ring | 2 px solid `focus` colour, 2 px offset, `:focus-visible` | visible on every control, 3:1 |
| States | hover (pointer only), focus-visible, active (-1 px or darker), disabled (not by opacity alone; `aria-disabled` + reason), loading (busy, double-submit blocked) | every interactive element has all that apply |
| Links in text | underlined (offset 0.15-0.2 em, 1-2 px), visited distinguishable where useful | not colour alone |

## 8. Imagery

| Item | Default |
|---|---|
| Aspect ratios | a set of 2-3 per site (e.g. 4:5 portraits, 3:2 scenes, 1:1 grids) chosen from the picks; never random crops. |
| Sizing | every image and video has `width`/`height` or `aspect-ratio` (no layout shift). `srcset` + `sizes`; `<picture>` for art-directed phone crops. |
| Formats | AVIF or WebP with JPEG fallback; SVG for icons and line art. |
| Hero image | not lazy, `fetchpriority="high"`; everything below the first screen `loading="lazy"`. |
| Text over images | a scrim or a calm area; contrast measured on pixels, not assumed. |
| Weights | hero <= 250 KB at 1440 wide; other images <= 150 KB; page total images <= 1.5 MB on first load (Persuade), less elsewhere. |
