# Real references (the archive and the library's measured picks)

A model left alone falls back on the patterns it saw most, which read as generated. Written rules help; real
pages help more, because they show how the parts work together. Two sources, used together:

1. **The picks.** Every live site in the picker's library was captured at computer and phone width, with its
   cookie banners and pop-ups hidden, and its design read from the page as exact values: background and
   surfaces (from the picture itself), text and accent, the type of each role (family, size, line height,
   weight, tracking), spacing steps, content width and corners. The build prompt carries these values for each
   pick. They are the starting point of the tokens, then adjusted to the brief and the floors.
2. **The archive** (when connected): more than 800 real sites, 2,300 pages, desktop and phone, each with a
   design record, plus section examples (first screens, prices, menus, footers, proof).

## How each step uses the archive

| Step | Call | Use |
| --- | --- | --- |
| 0, the brief | `search_screens` with the business's field | **The line-up**: what the category already does (the rut). Fill `rut` in the brief from what repeats. Never pick from the field: the user's picks come from every field. |
| 2, directions | `recommend` with the brief's words and the picks' words (style, mood, layout), never the field | One structure per direction, and a real example of it. Compare the directions with the five examples it returns. |
| 4, each section | `find_components` (hero, pricing, cta, nav, footer, testimonial, faq, stat) with the chosen style | See how real pages solve this section before writing it; take the discipline, never the layout whole. |
| 4, tokens | `get_design_system` for one or two examples | Exact values to set beside the picks' values. |
| 6, the critic | `compare` the site's look with two archive examples | Is it in the same league; is it interchangeable with the category? |

## Rules

- **Study at most three references in detail.** Every extra one makes the style less sure.
- **Mix, never copy.** Name which part comes from which reference (the first screen from one, the type from
  another, the grid from a third). A site that copies one reference fails the critic.
- **Ignore a reference whose picture shows a pop-up, a cookie banner or a loader**: its design is hidden.
- **Ask for directions before building.** References can drift (a coffee brief once returned health sites);
  showing directions first catches it before the build.
- **Never filter the user's choices by field.** The field is only for the line-up, to see what to avoid.
- The archive's pictures belong to their designers: nothing from them is copied into the site.
