# Verifying the site

**Confirming the code is not confirming the site. Looking right is not working.** A model believes its own
page looks right, so nothing is called done, good or ready until it has been seen and used on the served site
this turn. Three layers: the meter proves no rule is broken, the critic says whether it is good, and the walk
proves it works, by using it. Everything else (the code, the tests, "it built", a page you never opened) is a
proxy: proxies guide you, they are never the verdict.

## Layer 1: the meter

```
node ${CLAUDE_SKILL_DIR}/scripts/meter.mjs <site> --brief=<src>/brief.json
```

It copies the built site, injects a probe into every page, opens each page in headless Chrome or Edge at 320,
375, 768, 1024 and 1440, and scores what the page really renders against `assets/rules.json`. At the widest
width it loads every page twice more: once with scroll observers disabled (CONTENT_HIDDEN_AT_REST) and once
with the browser's reduced-motion switch on (REDUCED_MOTION). It also scans the site's CSS for physical
left and right (PHYSICAL_PROPS) and runs the axe-core accessibility scan at 375 and 1440 (AXE_SERIOUS).

- **FAIL** lines: fix every one, then run again.
- **warn** lines: fix, or tell the user in one line why it stays.
- Run it on the development build first (it includes /_review/), then on the final build, and on the
  worst-case data build.

The checks by area: structure (H1_COUNT, HEADING_SKIP, LANDMARKS), type (BODY_SIZE, TEXT_MIN, UI_TEXT_MIN,
LEADING, TRACKING, TRACKING_WIDE, MEASURE), colour (CONTRAST), controls (TARGET_SIZE, TARGET_TOUCH), images
(IMG_ALT, IMG_BROKEN, IMG_DIMENSIONS, HERO_LAZY), right to left (LANG_DIR, FONT_SCRIPT_COVERAGE,
PHYSICAL_PROPS), contrast that cannot be measured over pictures or gradients (CONTRAST_UNMEASURED, check by eye), speed (CLS, LCP), layout (H_OVERFLOW), and the slop catalogue's rules.

## Layer 2: the critic

See [critic](critic.md). The critic never sees the code.

## Layer 3: the walk (see it, use it)

```
node ${CLAUDE_SKILL_DIR}/scripts/serve.mjs <site> --src=<src>
node ${CLAUDE_SKILL_DIR}/scripts/walk-list.mjs <site> --url=<the served address> --out=<work>/walk.md
```

The walk list names every surface and action: every page at 375 and 1440 to the page end, every navigation
link, the phone menu, every form (real values and wrong values), the 404 page, the keyboard path, the tweak
panel, motion, right to left. Work through it on the **served** site (`http://127.0.0.1`, not a file on disk),
and mark each line by hand as you see and use it.

1. **Scope first.** The list is the scope; add anything the user named (a language, a page, a device).
2. **Reach the real surface** and confirm it serves the build you just made (a stale build looks exactly like a
   failed fix).
3. **Use it.** Real clicks, real typing: a script's `.click()` skips whatever covers the button. Submit every
   form and check `.site-data/submissions.jsonl` gained the line. Open and close the phone menu.
4. **Look hard,** like a reviewer hunting for defects, not an author hoping: zoom into text inside buttons and
   inputs, the alignment of neighbours, direction inside inputs on a Hebrew page, contrast over pictures,
   clipping, the page end. Read every console error.
5. **Motion** needs frames over time: several screenshots or a recording. A still cannot show motion.

**Which browser, in this order:** the user's real Chrome when it is connected; the in-app browser only when
it is not; headless Chromium only for what neither can do. Name the one you used truthfully: headless is never
"real Chrome".

## The report

Write the verdict from the list, never the list from the verdict:

```
Broken: 1 of 14 fails, 1 open.
✓ /contact/ form stores the message and shows the thank-you block: real Chrome, 375 and 1440
✓ ...
✗ Hebrew placeholders sit left-aligned in the booking inputs (screenshot)
? Map link: opens the phone's map app, not checkable here
```

- Any ✗ makes the verdict **Broken**; any ? makes it **Not verified yet**. "Done" over open lines is a false report.
- A failed check stays failed; never swap it for another check that passed.
- Something broken that you did not cause is still ✗.
- When you cannot look (no browser, a blocked page), try the next browser; if only the user can unblock it,
  ask for exactly that step and wait. Saying what you did not check is not checking: never headline "done".

## Proof for the user

Show the first screens at 375 and 1440, the meter's last line ("0 failures, N warnings") with each warning
defended, and the walk report. A claim of done without all three is not done.

## Excuses that mean stop

| Excuse | Reality |
| --- | --- |
| "I can tell from the code" | The render disagrees with the source more often than you think. Look. |
| "The screenshot looks perfect, so it works" | A dead button looks exactly like a working one. Use it. |
| "The meter passed" | The meter checks its rules. The user sees the site. Walk it. |
| "It built without errors" | A build log is not a page. Open it. |
| "I checked the home page" | The user gets every page, at every width, to the page end. |
| "I'm confident it's right" | Confidence is what you feel before you look. |
