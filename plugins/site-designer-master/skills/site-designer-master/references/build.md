# Building the site

A static multi-page site: no framework for the user to learn, runs offline, header and footer written once.

## The source folder

```
<src>/
  site.json        name, lang, dir, pages: [{ path, file, title, description, nav, label }]
  tokens.json      the visual system (see visual-system); checked by tokens.mjs on every build
  brief.json       the brief (read by the meter and the critic)
  pages/*.html     the body of each page (sections only; the layout adds head, header, footer)
  partials/*.html  optional: override the site kit's header, footer, head or skip link
  site.css         the site's own styles, on top of the kit's base.css; logical properties only
  assets/**        images, icons, fonts (copied as they are)
  fonts.css        written by fonts.mjs
```

Templates: `{{> partial}}` includes a partial; `{{title}}`, `{{name}}`, `{{nav}}`, `{{t.skip}}`,
`{{data.key}}` insert values. Write links from the site root (`/about/`); the build checks every one and
writes them relative, so the site also opens from disk.

## Commands

| Step | Command | What it does |
| --- | --- | --- |
| Fonts | `node ${CLAUDE_SKILL_DIR}/scripts/fonts.mjs <src>` | Fetches the families in tokens.json (open licences), keeps only the scripts the language needs, writes `assets/fonts/` and `fonts.css`. Stops when a family lacks a needed script. |
| Tokens | `node ${CLAUDE_SKILL_DIR}/scripts/tokens.mjs <src>/tokens.json --out=<dir>/tokens.css` | Checks spacing, scale, contrast, families and layers against the floors; the build runs it too. |
| Build | `node ${CLAUDE_SKILL_DIR}/scripts/build.mjs <src> --out=<site> [--dev] [--data=<values.json>]` | Every page, the 404 page, the CSS and assets. Fails on a link to nothing, a missing partial, a missing value or broken tokens. `--dev` adds the tweak panel and /_review/. |
| Run | `node ${CLAUDE_SKILL_DIR}/scripts/serve.mjs <site> [--src=<src>] [--port=4321]` | Serves on this machine only, stores form posts, answers the tweak panel when given the source folder. |

## The site kit

`assets/site-kit/` holds the layout, the head, header, footer and skip link partials, the 404 page, the
strings for English and Hebrew, `base.css` (logical properties, focus ring, states, reduced motion, 44px
controls) and `site.js` (phone menu, the sent-form message). Override a partial in `<src>/partials/`
instead of editing the kit.

## Worst-case data

Before verifying, build once with `--data=<worst-case.json>` holding the longest real names, a category with
zero items and one with one, the largest number the business could show, every paragraph 30% longer and
Latin names inside Hebrew lines. The meter must pass this build too.
