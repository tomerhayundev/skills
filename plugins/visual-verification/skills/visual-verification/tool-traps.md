# Tool traps when verifying

Read this when a verification tool misbehaves or gives a result you can't explain. Every trap below once produced a false pass or a wasted hour.

## Claude in Chrome (`mcp__claude-in-chrome__*`)

- **Connected does not mean usable.** A minimized or background window reports `document.visibilityState === "hidden"` and `outerWidth` 0. Screenshots time out ("renderer may be frozen") or return stale frames, timers and `requestAnimationFrame` are throttled, and `resize_window` reports success without changing anything. Check `visibilityState` and `outerWidth` first. If the window is hidden, ask the user to bring Chrome to the front, and wait.
- **Logged out means redirected to login.** Ask the user to log in (you never type passwords), wait for them, then continue from where you were. Checking public pages or pointing to E2E runs is not a substitute.
- **Consent screens and credential steps are blocked** by the permission classifier. Treat them as a step the human does: say exactly what to click and what to send back, wait, then check the effect yourself.
- **Screenshots on heavy or animated pages can time out** on alternate calls. Retry after a short wait. Never put two screenshots in one `browser_batch`, because one failure drops the images of the others.
- **`find` and `get_page_text` right after `navigate` can return the previous page.** Confirm the URL before reading.
- **A `computer` click that doesn't fire** on a React control: before switching to a JS `el.click()`, check `document.elementFromPoint(x, y)`. If something covers the control, that is a real bug a user would hit. A JS click proves the handler works, not that a person can click it.
- **`form_input` may not stick on React-controlled inputs and checkboxes.** Click instead, then zoom in to confirm the state.
- **`resize_window` may not change a maximized window.** Use Playwright for mobile widths.
- **An instrumented browser can block `document.cookie` and sandbox storage.** When a result depends on that state, confirm it through something the tool can't fake: a full reload, then read what the server rendered. Never report a tool artifact as a product bug, or a product bug as a tool artifact.

## In-app Browser (`mcp__Claude_Browser__*`)

- **It runs as a hidden tab.** `requestAnimationFrame` never fires, CSS transitions and animations are frozen, `scrollTo` emits no scroll event, and screenshots may time out. You cannot verify animation, scroll-driven effects or video autoplay here.
- **The viewport can report `innerWidth` 0.** Then `max-width` media queries match, so mobile CSS applies on "desktop", and `getBoundingClientRect` can return zeros. Computed styles are trustworthy there. Geometry is not.
- **`file://` is blocked.** Serve the file over http (`preview_start` or a static server).
- **The first navigation after `preview_start` can land on `/`.** Repeat it.

## Headless Playwright

- **Use it for full walks.** It is reliable for every viewport (for example 1440×900 and 390×844), both languages, scroll stops that trigger animations, full-page plus viewport-slice screenshots, console and `pageerror` capture, and clicking through real flows.
- **It is not the user's browser.** It isn't logged in unless you give it a session, it isn't the user's hardware, and fonts can differ. Call it "headless Chromium (Playwright)" in the report, never "real Chrome".
- **A scratch `.mjs` may not resolve a bare `import "playwright-core"`.** Import it from the project's `node_modules` by absolute `file://` URL.
- **Open every screenshot you save** (Read the PNG). A screenshot on disk that you never viewed is not a look.
- **Jank hides on a fast machine.** Throttle the CPU (CDP `Emulation.setCPUThrottlingRate`, 4x) and record frame times before calling motion smooth.

## Files and exports

- **If a PDF won't render in your reader, or the browser only downloads it,** rasterize each page and view the PNGs: `import fitz; d = fitz.open("out.pdf"); [p.get_pixmap(dpi=110).save(f"p{i}.png") for i, p in enumerate(d)]`. Check the page count too.
- **To find a file the app just exported,** list the Downloads folder before and after clicking Export.
- **An export rendered on a server** (a cloud browser, a different Chromium) can differ from a local render. Sign off on the file exported from the deployed environment.

## Dev servers and deploys

- **Stale builds.** Dev servers (Turbopack, Vite) can keep serving old CSS or JS after edits or a branch switch. Before judging a change, prove it is in what's being served: your new class in `document.styleSheets`, a text marker on the page, or the new build id. If it isn't there, stop the server, delete the build cache (`.next` or similar) and restart.
- **After a deploy,** wait for the deploy's own CI or E2E to finish and read the result. Confirm the served build is the new one before you verify.
- **Logs from auth providers and queues lag about a minute.** Wait before concluding that nothing happened.
- **A CDN or WAF can reject scripted clients.** For example, Cloudflare returns 1010 for a python-urllib User-Agent. That 403 comes from the tool, not the app.

## Checks that cannot fail

- **"Expected string absent, so pass" also passes when the page is dead** (status 000, an empty body). Compare against the exact expected value, and give "matched nothing" its own loud outcome.
- **A proxy that moves regardless of the effect passes while the visible result is broken.** Examples: state classes advancing while `position: sticky` doesn't pin, or `textContent` being correct while the text is white on white. Measure the effect itself, then look at it.
- **Before trusting an aggregate number** (a score, a percentage, a count), print one worst-case sample and read it.
