---
name: visual-verification
description: >-
  Use when about to say work is done, fixed, working, verified, live, or ready, or to hand off or
  approve an output: after merging, deploying, or pushing to staging or production; after publishing
  or republishing an artifact or design; when the user asks "is it fixed / working?" or to confirm,
  test, or visually verify something; when a stop hook or /goal asks if the task is complete.
  Especially when the evidence is code, tests/CI/E2E, a health check or status code, a harness or dev
  route, localhost, JS measurements, or a screenshot of a feature you never used. Covers UI, pages,
  interactive flows, logins/OAuth, exports and PDFs, designs, generated media, documents, CLI/API
  output, prose and translations, and data.
---

# Visual Verification

## Overview

**Confirming the code is not confirming the output. Looking the part is not working. A proxy is not the thing.**

You may NOT call work done, correct, good, or ready, or approve / hand it off, until you have observed the **actual end-user-facing result on the real surface** (the route, app, file, and environment the user will actually use), **exercised its behavior**, and judged it good against the goal. Reading the source never counts. A screenshot proves layout; only *using* the feature proves it works: a flawless-looking button with a dead handler is pixel-identical to a working one.

Everything else is a proxy: code, tests, CI/E2E, health checks and status codes, harness or dev routes, localhost when the user named staging, JS measurements, a render you never looked at. Proxies guide you. They are never the verdict.

**Violating the letter of this rule violates its spirit.** "I can tell from the code" and "it looks right, so it works" are the exact judgments this skill exists to override.

## When to Use

Every time you are about to call an output done/good/ready, approve it, or hand it off, whenever it has a surface distinct from its source: a page, running program, opened document, generated media, command output, or delivered text. That includes after a merge or deploy, after **every** publish or republish of an artifact or design, when the user asks "is it fixed?", and when a stop hook asks whether the goal is complete. Not for a plain chat answer (already visible).

## What Actually Counts (this turn)

| Output | Required |
|---|---|
| UI / web page / component | A **screenshot** of the real page, walked **top to bottom, including the page end**, at every viewport and in every language the user uses. **If it does anything, use it** (next row). |
| Interactive feature / button / form / flow | **Perform the real user action end-to-end and watch the result occur**, entering the flow where a user does. Use real clicks: a JS `.click()` skips whatever covers the button. Check console/network. "Wired up" ≠ works. |
| Anything the UI promises (a price, a count, "saved") | **Do the action and compare state before and after** (balance charged = price shown). |
| Login / OAuth / gated flow | **Complete one real run** through the login with the real client. If a human step is needed, ask for exactly that step, wait, then confirm the effect yourself (the page, the provider log). |
| Deploy / staging | Verify **on the environment the user named, on the build you just shipped**: its own CI/E2E finished, the served build contains your change. |
| Artifact / design | **Open the published version** (not its source) after every publish, every board and viewport, top to bottom. |
| Export / document (pdf / docx / pptx / xlsx) | **The file the real export produces** on the target environment. Open and view every page. "Generated successfully" is a log, not the document. |
| Motion / animation / video | **Frames over time** (several shots or a recording): it moves, autoplay advances, nothing stutters. A still can't show motion. |
| Generated image / chart | **View the actual image**, not the code. |
| CLI / script / API | **Run it** and read the real output / response. |
| Prose / copy / translation | **Read the final delivered text end-to-end**, as the user receives it, not the diff. |
| Data / file output | **Open and inspect the actual values.** Before trusting an aggregate, read one worst case. |

"Dev server started" / "compiled" / "tests pass" / "E2E green" / "health 200" / "401 as expected" / "code looks right" are never confirmation.

## The Loop

```
scope → reach the real surface → USE it → look hard → judge vs goal → report
   works & good → approve      broken or wrong → keep working → re-verify
```

1. **Scope.** Before opening a browser, list what "working" means in the user's own words: each surface, state, language, viewport, and entry path. "All", "full", "en+he", "pipeline", and "mobile" each widen the list. Include the deliverable itself (the exported PDF, not the preview) and the environment the user named.
2. **Reach the real surface** and confirm it is serving your change (a stale build looks exactly like a failed fix).
3. **Use** every item on the list.
4. **Look hard.** Read each screenshot like a reviewer hunting for defects, not like an author hoping it's fine: zoom into text inside controls and placeholders, sibling alignment, direction (RTL), contrast, clipping, overflow, the page end. Read every console error; don't wave any off.
5. **Report** item by item (below).

Approve only after a turn where you both saw it and (if it behaves) used it.

## How to Look: strict order

Drop to a lower rung only when the one above is genuinely unavailable, never for convenience. **Interact on whichever rung you use; don't just screenshot.**

1. **Real Chrome first, always**: Claude in Chrome (`mcp__claude-in-chrome__*`) has real sessions and real rendering. Check `list_connected_browsers` at the START; if a browser is connected, use it. Reaching for another tool while Chrome is available is a violation, not a shortcut. **Connected is not usable**: if screenshots time out or `document.visibilityState` is `"hidden"`, ask the user to bring the Chrome window to the front; if it's logged out, ask them to log in. Then wait. A login wall is never a reason to fall back to public pages or E2E.
2. **In-app Browser** (`mcp__Claude_Browser__*`): **only when Chrome is not connected.** It runs hidden: no animation, unreliable geometry, `file://` blocked (serve over `http://localhost`).
3. **Headless Playwright**: for full walks (many viewports and languages), for a check Chrome can't do (a width it won't resize to), or when neither browser can render what you need. View every screenshot you save, and call it "headless Chromium" in the report, never "real Chrome".
4. **Computer-use** (`mcp__computer-use__*`): native apps, documents a browser can't render, anything else on screen.

When a tool misbehaves or gives a result you can't explain, read [tool-traps.md](tool-traps.md) before concluding anything. Never report a tool artifact as a product bug, or a product bug as a tool artifact.

## When You Can't Verify

Inability to look is **not** permission to approve. Before reporting it, escalate:

- Read **today's** error. "It was sandbox-blocked last time" is not a reason.
- Try the next rung, or another route to the same observable (the deployed environment's own export button, the provider's log).
- If only the user can unblock it (log in, click consent, bring a window up, allow a download), ask for exactly that in one line, wait, and continue.

If it is still blocked, say what you couldn't confirm, why, and what you did verify. Saying what you didn't check is not checking: never answer "yes / done / fixed" while it's open, and don't offer the missing check as optional.

## The Report

Write the verdict from the list, never the list from the verdict:

```
Broken: 1 of 5 fails, 1 open.
✓ Save stores the edit and it survives a reload: Chrome, staging, real click, EN+HE
✓ ...
✗ Hebrew placeholders sit left-aligned in the signup inputs (screenshot)
? PDF export: needs you to allow the download
```

- Any ✗ makes the verdict **Broken**; any ? makes it **Not verified yet**. A "done" headline over open items is a false report.
- Name the tool and the environment truthfully: headless is not "real Chrome", localhost is not staging, `get_page_text` is not a visual check.
- A failed or inconclusive check stays failed. Don't swap it for a different check that passed.
- Something broken that you didn't cause is still ✗. The user asked whether it works, not whose fault it is.
- A stop hook or a repeated "is it done?" gets this status again, updated. Never a bare "Done."

## Rationalizations: STOP

| Excuse | Reality |
|---|---|
| "I can tell from the code / source" | You can't know if the render or runtime disagrees with the source. Looking takes seconds. |
| "It looks right, so it works" / "the screenshot looks perfect" | Appearance and behavior are independent. A still can't show a control doing nothing. Use it. |
| "The handler / logic is wired up" | Wired ≠ fires at runtime. Click it and watch. |
| "Tests / CI / E2E pass" | They check what they assert, with their data, on their path. The user sees the actual result. |
| "Health 200 / 401 as expected / the redirect works" | Proves the server answers. Run the flow. |
| "The harness / dev route / served source shows it" | A harness leaves out the real wiring (router, auth, the second consumer). The verdict comes from the real route. |
| "I measured it (heights, computed style, textContent)" | Numbers can't show a missing title, white-on-white text, or crowding. Look. |
| "Fixed by construction / the preview equals the export" | Open the export. |
| "It works on localhost" | The user named staging. URLs, data, and renderers differ there. |
| "I did my part; the login / click is theirs" | Then it isn't verified. Ask for that step, wait, check the effect. |
| "I told them what I didn't check" | Disclosure isn't verification. Escalate first, and never headline "done". |
| "The tool couldn't open it, so the code is good enough" | Escalate (Chrome, serve it, Playwright, computer-use) or report it as unverified. Don't approve. |
| "Pre-existing, not my change" | Still ✗ in the report. |
| "I already glanced earlier" | Stale / secondhand looks don't count. Verify the current output now. |
| "PM / user is waiting, no time" | A 10-second check beats shipping broken and redoing it. |
| "Tiny change / one line" | One line produces big breakage. Check. |
| "I'm confident it's right" | Confidence is what you feel *before* you look. |

## Red Flags: you're about to violate this

- A verdict whose evidence is code, a test run, a health check, a harness, localhost, or a JS read
- Approving an interactive element without **triggering it and watching the result** this turn
- A verdict on a visual output with **no screenshot**, or on behavior with **no interaction**, this turn
- Sampling: some viewports, the top of the page, one language, when the user said all / both / mobile
- A "done" headline with open items under it, or a bare "Done." to a stop hook
- "I couldn't open it, but the code looks correct"

**All mean: STOP. See it, use it, or say you couldn't verify.**

## Worked Example: a generated document

Open the produced file and look at **every page**; never judge from the generator or its log (the log can claim a value the page doesn't show). If your reader can't render it, rasterize each page and view it (PyMuPDF: `import fitz; fitz.open("out.pdf")[0].get_pixmap(dpi=150).save("p.png")`). Confirm every required value is present, legible, on-page; nothing overlaps; all pages rendered. Check the states that matter everywhere else too: empty, long text, mobile, error, RTL, dark mode.

## Reproducing a reported bug

When the user reports a bug, verify the fix against **the actual environment and data where the bug lives**: the real page, the real account, the staging/prod deployment the user pointed at. A synthetic harness seeded with mock data that does **not** reproduce the original bug proves nothing: if you can't first make the bug appear, you can't know your change fixes it. Reproduce first (see it fail), then apply the fix, then re-verify on the same surface (see it pass). A green harness with different data is a false positive, and short test data hides bugs that only long, empty, or RTL content shows. When testing on the user's real data, snapshot it first, restore it after, and reload to confirm the restore.

## Layout / CSS changes: check the neighbours

Moving, wrapping, or restyling one element routinely knocks its **siblings** out of place: a flex child made taller re-centres the row; a new column shifts alignment; absolute positioning overlaps something. After any layout change, don't just confirm the element you added is *present*; **zoom in on the whole affected group and judge alignment, spacing, and overlap of every neighbour**, in both LTR and RTL if the app is bidirectional, including the direction of text inside inputs and placeholders. "The thing I added is there" is not the same as "the row still looks right." Verify against the user's *specific* complaint, not a generic "it renders."
