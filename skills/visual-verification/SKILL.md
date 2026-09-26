---
name: visual-verification
description: Use when about to call any work done, correct, good, approved, or ready to ship, or to hand off / approve an output, especially after only reading the code/source, or after only checking that it LOOKS right without using it. The core is to confirm with your own eyes that it actually WORKS, not just that it renders. Covers UI, web pages, interactive features, designs, generated images, documents, CLI/script/API output, prose/copy, and data files. Symptoms: "the code looks right", "it looks right so it works", "tests pass so it works", "the handler is wired up", "no need to run/click/open/render it", or skipping the check because you are short on time.
---

# Visual Verification

## Overview

**Confirming the code is not confirming the output. And looking the part is not working.**

You may NOT call work done, correct, good, or ready, or approve / hand it off, until you have observed the **actual end-user-facing result** as the user experiences it, **exercised its behavior**, and judged it good against the goal. Reading the source never counts. A screenshot proves layout; only *using* the feature proves it works: a flawless-looking button with a dead handler is pixel-identical to a working one.

**Violating the letter of this rule violates its spirit.** "I can tell from the code" and "it looks right, so it works" are the exact judgments this skill exists to override.

## When to Use

Every time you are about to call an output done/good/ready, approve it, or hand it off, whenever it has a surface distinct from its source: a page, running program, opened document, generated media, command output, or delivered text. Not for a plain chat answer (already visible); yes for every artifact you produce or modify.

## What Actually Counts (this turn)

| Output | Required |
|---|---|
| UI / web page / component | A **screenshot** of the rendered result, **and if it does anything, use it** (next row). |
| Interactive feature / button / form / link / flow | **Perform the real user action end-to-end and watch the result occur**: click fires, form submits, data changes, right state shows. Check console/network for errors. "Wired up" ≠ works. |
| Generated image / chart | **View the actual image**, not the code. |
| Document (pdf / docx / pptx / xlsx) | **Open and view every page.** "Generated successfully" is a log, not the document. |
| CLI / script / API | **Run it** and read the real output / response. |
| Prose / copy / translation | **Read the final delivered text end-to-end**, as the user receives it, not the diff. |
| Data / file output | **Open and inspect the actual values.** |

"Dev server started" / "compiled" / "tests pass" / "code looks right" are never confirmation.

## How to Look: strict order

Drop to a lower rung only when the one above is genuinely unavailable, never for convenience. **Interact on whichever rung you use; don't just screenshot.**

1. **Real Chrome first, always**: Claude in Chrome (`mcp__claude-in-chrome__*`) has real sessions and real rendering, and runs the page's JS so you can exercise behavior. Check `list_connected_browsers` at the START; if a browser is connected, use it. Reaching for the in-app browser while Chrome is available is a violation, not a shortcut; do not do it because the harness is already open or it is "close enough."
2. **In-app Browser** (`mcp__Claude_Browser__*`: `navigate`, then `computer` to click/screenshot): **only when Chrome is closed / not connected.** `file://` is usually blocked, so serve the file (`preview_start` or a static server) and open `http://localhost/...`.
3. **Computer-use** (`mcp__computer-use__*`): native apps, documents a browser can't render, anything else on screen.

**Instrumented browsers can lie by omission.** A driven browser may block or hide things a real one allows: `document.cookie` reads/writes can be blocked, storage sandboxed, some events synthetic. When behavior depends on such state, verify through an effect the tool cannot fake (a full reload and read what the *server* rendered), and never report a tool artifact as a product bug (or vice-versa); say which you've ruled out.

## The Loop

```
render/open  →  USE it (exercise the behavior)  →  watch what happens  →  judge vs goal
   works & good → approve      broken or wrong → keep working → re-verify
```

Approve only after a turn where you both saw it and (if it behaves) used it.

## When You Can't Verify

Inability to look is **not** permission to approve. Do not turn "I couldn't render / open / run it" into "the code looks fine, so it's done." Stop; tell the user what you couldn't confirm, why, and what you did verify. Never give an approval verdict for an output you didn't see.

## Rationalizations: STOP

| Excuse | Reality |
|---|---|
| "I can tell from the code / source" | You can't know if the render or runtime disagrees with the source. Looking takes seconds. |
| "It looks right, so it works" | Appearance and behavior are independent. Use it. |
| "The handler / logic is wired up" | Wired ≠ fires at runtime. Click it and watch. |
| "The screenshot looks perfect" | A still image can't show a control doing nothing. Interact, then look again. |
| "Tests pass, so it works" | Tests check what you asserted; the user sees the actual result. |
| "The tool couldn't open it, so the code is good enough" | Escalate (Chrome, serve it, computer-use) or report you couldn't verify. Don't approve. |
| "I already glanced earlier" | Stale / secondhand looks don't count. Verify the current output now. |
| "It's just text, the diff is the same" | Read the final delivered text end-to-end as the user gets it. |
| "PM / user is waiting, no time" | A 10-second check beats shipping broken and redoing it. |
| "Tiny change / one line" | One line produces big breakage. Check. |
| "I'm confident it's right" | Confidence is what you feel *before* you look. |

## Red Flags: you're about to violate this

- "I can tell from the code" / "it looks right so it must work" / "no need to run/click/open/render it"
- Approving an interactive element without **triggering it and watching the result** this turn
- A verdict on a visual output with **no screenshot**, or on behavior with **no interaction**, this turn
- Not checking the console / output after interacting
- "I couldn't open it, but the code looks correct"

**All mean: STOP. See it, use it, or say you couldn't verify.**

## Worked Examples

**Web / UI:** serve it (`file://` won't open in-app; use `http://localhost`) → screenshot, checking the states that matter (empty, long text, mobile, error) → **use every control you touched** (click, type, submit, walk the flow), watching the result and the console → any misrender or dead click means fix and re-verify.

**Generated document (PDF/etc.):** open the produced file and look at **every page**; never judge from the generator or its log (the log can claim a value the page doesn't show). If your reader can't render it, or the browser only downloads it, rasterize each page and view it (PyMuPDF: `import fitz; fitz.open("out.pdf")[0].get_pixmap(dpi=150).save("p.png")`). Confirm every required value is present, legible, on-page; nothing overlaps; all pages rendered.

**Prose / copy:** read the final delivered text end-to-end in the form the user receives it, not the diff.

## Reproducing a reported bug

When the user reports a bug, verify the fix against **the actual environment and data where the bug lives**: the real page, the real account, the staging/prod deployment the user pointed at. A synthetic harness seeded with mock data that does **not** reproduce the original bug proves nothing: if you can't first make the bug appear, you can't know your change fixes it. Reproduce first (see it fail), then apply the fix, then re-verify on the same surface (see it pass). A green harness with different data is a false positive.

## Layout / CSS changes: check the neighbours

Moving, wrapping, or restyling one element routinely knocks its **siblings** out of place: a flex child made taller re-centres the row; a new column shifts alignment; absolute positioning overlaps something. After any layout change, don't just confirm the element you added is *present*; **zoom in on the whole affected group and judge alignment, spacing, and overlap of every neighbour**, in both LTR and RTL if the app is bidirectional. "The thing I added is there" is not the same as "the row still looks right." Verify against the user's *specific* complaint, not a generic "it renders."

## Common Mistakes

- **Appearance, not behavior**: a screenshot proves layout, not that clicking does anything. Use it.
- **Present, not correct**: you confirmed your new element exists but not that it sits right relative to its siblings. A wrap/flex/position change is exactly where this bites.
- **Wrong state**: a cached / pre-change / error page. Confirm it's the current output.
- **Mock that doesn't repro**: verifying a bug fix against seeded data that never showed the bug. Reproduce on the real surface first.
- **Happy-path only**: check empty, long text, mobile width, error, dark mode.
- **Trusting the build log**: "compiled" is the build, not the output.
- **Reading the generator, not the artifact**: open the produced file.
