# Responsive

| Rule | Check |
| --- | --- |
| The meter tests 320, 375, 768, 1024 and 1440; look at 1920 too. | meter widths in `assets/rules.json` |
| No horizontal scroll at any width; nothing wider than its container. | meter rule H_OVERFLOW |
| The phone is a second composition, not a squeezed desktop: re-think the order (the primary action and proof come early), the crop of each picture and the line breaks of the headline. | the critic on the 375 screenshots |
| Full-height sections use `min-height: 100svh` (or `dvh`), never `100vh`. | |
| Display type is fluid with `clamp()`; headings balance (`text-wrap: balance`), body text uses `pretty`. | the site kit's base.css |
| Tables become scrolling regions or cards on a phone. Images use `max-inline-size: 100%`, `srcset` and `sizes`; art-directed phone crops use `<picture>`. | |
| Controls are at least 44px tall on touch widths; never under 24px anywhere. | meter rules TARGET_TOUCH and TARGET_SIZE |
| Input changes come from `pointer` and `hover` media queries, never from width; nothing works by hover alone. | |
| Inputs use at least 16px text so phones do not zoom; zoom is never disabled. | the site kit's base.css |
| Safe areas: `env(safe-area-inset-*)` on anything fixed to an edge. | |
| Focus order matches the visual order after a layout reorders on a phone. | keyboard walk at 375 |

Breakpoints (mobile first, `min-width`): 480, 768, 1024, 1280, 1536. Prefer fluid values over extra
breakpoints; a component that lives at several widths uses container queries.
