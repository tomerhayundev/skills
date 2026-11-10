# Motion

Motion has a job: feedback (this worked), orientation (where this came from), or one signature moment on a
persuade or experience page. Not every element. The user's motion picks set the character; these numbers
set the limits.

Delight is feedback, not decoration. A visit is remembered by its best moments and its end, and the good
moments come from answers to what the visitor did: the press that responds, the field that confirms, the form
that lands well. Animating everything on load and on scroll is not more care; it is the slop the catalogue lists.

| Item | Default |
| --- | --- |
| Durations | micro feedback 100-150 ms; UI transitions 200-300 ms; one authored entrance per page up to about 600 ms; exits about 70% of entrances. |
| Easing | ease-out for entering (a fast-start curve such as `cubic-bezier(0.16, 1, 0.3, 1)`), ease-in for leaving, linear only for progress; no bounce or elastic. |
| Origin | Motion starts where the visitor acted. A menu, dropdown or popover grows from the control that opened it (`transform-origin` on the edge that touches the control, a small scale such as 0.97 to 1 with the fade), never from the screen centre; it closes faster, or at once. A message enters from where it sits (a notice slides in from its edge, several stack, a sent form's answer replaces the form in place). Only a modal dialog comes from the centre. Fading everything up the same way, or snapping open with no motion, is the generated look. The kit's phone menu already does this. |
| Properties | `transform` and `opacity` only; never animate width, height, top or left. |
| Stagger | 40-80 ms between items, at most about 6 items; rise distance 8-24 px. |
| Budget by mode | Persuade and experience: one signature moment plus light reveals. Operate and read: feedback only. Never scroll-jacking; no endless loops near text people read. A 3D scene counts as the page's signature moment ([3D](three-d.md)). |
| Tweak panel | `--motion-scale` multiplies durations, so the user can calm or lift the whole site by sight. |

## Floors (the meter fails these)

| Rule | Meter rule |
| --- | --- |
| With reduced motion on, nothing keeps moving: the final state shows. The site kit already stops CSS animation; script animations (`element.animate`, canvas loops) must check `matchMedia('(prefers-reduced-motion: reduce)')`. | REDUCED_MOTION (a pass with the browser's reduced-motion switch on) |
| Content is visible by default. A scroll reveal starts from visible and adds its hidden start state only after its script runs, so a failed or blocked script never leaves text invisible. | CONTENT_HIDDEN_AT_REST (a pass with scroll observers disabled) |
| Carousels: avoid. If one is used: previous, next and pause controls, no auto-rotation, or it stops on hover, on focus and with reduced motion. | the critic |

## A safe reveal

```css
.reveal { opacity: 1; transform: none; }
.js .reveal:not(.is-in) { opacity: 0; transform: translateY(16px); }
.reveal { transition: opacity calc(400ms * var(--motion-scale, 1)) ease-out, transform calc(400ms * var(--motion-scale, 1)) ease-out; }
```

The `.js` class is set by the script that also creates the observer, so without the script nothing hides.
