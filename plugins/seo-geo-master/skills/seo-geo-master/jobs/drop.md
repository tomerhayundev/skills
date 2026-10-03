# Drop

## When

A sudden loss: "why did my traffic drop", clicks falling, pages dropping out of Google, a manual action, a security warning, the site down or missing, a loss right after a deploy, a migration or an update. It always runs first, before any growth work. A slow decline over months is `jobs/grow.md`. This job decides what is going on and what to do first; it does not start fixing.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, write export paths without a leading `/`, or start the command with `MSYS_NO_PATHCONV=1`.

- `node <skill>/scripts/gsc-analyze.mjs <export dir> [--compare <older export dir>] [--query-page <file>] --brand "<brand names>" --out <out>/gsc`. The drop check reads the Dates (Chart) file; the older folder for `--compare` covers an equal period before the drop. Read `gsc.md` in this order: data breaks, drop check, decay, the rest. An export of 1,000 rows or more is incomplete: say so.
- Live pages, which win over the snapshots in `data/updates.json` and `data/data-breaks.json` (each has a verified date): the Search Console data anomalies page (https://support.google.com/webmasters/answer/6211453), the Search Status Dashboard (https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history), and in Search Console the Manual actions, Security issues, Page indexing and Crawl stats pages.
- `seo/changelog.md` and `baseline.md`, plus anything the owner knows was deployed in the weeks before the drop.
- The site as it is now: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl` and `node <skill>/scripts/robots-check.mjs <url> --paths /,<money page>,<money page> --out <out>/robots`.
- Bing Webmaster Tools and analytics, when they exist. `references/measurement.md` sections 1 and 6; `references/facts.md` (Google: updates; Crawling and technical).

## Steps

1. **Is it real?** Clicks are the metric; impressions, CTR and position carry the data breaks.
   - Open the start URL's row in `pages.csv`: a dead, redirected or erroring site (`START_PAGE_NOT_200` for a status other than 200 or a failed fetch, `SITE_UNAVAILABLE` for 429 or 503) is the finding, ahead of any measuring.
   - Read the anomalies page and the dashboard live, then the data breaks section of `gsc.md`.
   - Rule out, one at a time: a tracking or consent change (a new banner, a removed tag, a changed filter); a wrong property (http or https, www or not, a domain against a prefix property, a subfolder); bot traffic (it moves analytics, not Search Console clicks); weekday and holiday effects (same weekdays, the holidays of the owner's market); seasonality (the same weeks a year earlier, when the data reaches back); the newest 2 to 3 days (incomplete; the script leaves them out); a data break.
   - If analytics fell but Search Console clicks held, it is a measurement problem: say so, propose the tracking fix, and stop.
   - Cross-check Bing when it is verified: Google down and Bing steady points at Google; both down points at the site, demand or tracking (judgment).
   - Read the drop check as `gsc.md` prints it. "A possible real drop" continues. "No sustained drop in clicks" ends the job with that verdict; a "dip that recovered" and any one-week dips are listed with their dates, so name the calendar cause or say none was found. "Early drop" means the last complete week is down and the window is not yet: re-run in a week, and still run steps 3 to 5 for the cause.
2. **Size and onset.** Size: the clicks change and the weekly table. Onset: the script names the onset week (the first week 20% or more below the weeks before it that stayed there); find the day in the daily clicks of the Dates file. A step on one day points to an event (a deploy, an update, an outage, a manual action); a slope points to competition, demand or decay (judgment).
3. **Broad or narrow.** Many unrelated pages falling together point to something site-wide or external: a template, the server, robots, an update, demand. One cluster points to its content, a competitor or a change to that cluster. The decay rows (`--compare`) give the page list.
4. **Segment.** Template or folder, brand against non-brand (`--brand`), intent, device, country, search appearance, new against established pages; the Countries, Devices and Search appearance files are read by hand. For the top losing queries read the live results with query, country, language, device and date: a steady position with falling clicks can mean an AI answer or another feature took the click; confirm it in the live results (`jobs/grow.md` step 3).
5. **Causes.** Line the changelog and deploy history up with the onset, then check the site now.
   - Technical: `START_PAGE_NOT_200`, `SITE_UNAVAILABLE`, `RATE_LIMITED`, `SITE_BLOCKED_BY_ROBOTS`, `ROBOTS_UNAVAILABLE`, `NOINDEX_*`, `SITEMAP_URL_*`, `CANONICAL_*`, `REDIRECT_*`, `CONTENT_NEEDS_JS`. After a sudden step, check robots.txt first: an unreachable file (5xx, and 429 as well) makes crawlers assume they may crawl nothing (facts.md).
   - Google: always read Manual actions and Security issues. An update counts only if it started on or before the onset (`data/updates.json`, as of its verified date; one announced since is on the live dashboard only), its scope covers Web search (a Discover-only update does not), and it has finished with a week passed: judge against the period before it began (facts.md). While one is rolling out, attribution waits.
   - Content or competition: a result page now led by another page type, a competitor that moved up, an intent shift (the live results).
6. **Recovery plan**, whatever the cause. Baseline rows for the affected segment and a comparable unaffected control; the same segments re-measured every week on the same weekdays, never the newest 2 to 3 days; a review date and an escalation trigger written now ("if the last complete week is still below at the review date, then ..."). Say plainly that a quality-related recovery can take months and is not guaranteed.

## Decide

- **Act now:** a confirmed technical fault, a manual action, a security issue. Propose the exact fix at once; the owner approves (robots.txt, redirects and canonicals are live changes), and fixes go one at a time so each effect can be read. A manual action names its cause: fix that cause across the site, then the owner files the reconsideration request in Search Console. A link-related action goes to `jobs/links.md`.
- **Wait:** an update still rolling out or finished less than a week ago, a move inside the site's normal week-to-week swing (the weekly table; judgment), a dip that recovered.
- **Investigate:** a concentrated segment with no explanation. Repeat steps 3 to 5 with a finer segment and read the pages themselves.
- Attribute a drop to an update only when the onset and the pattern both match: it started on or before the onset, its scope covers the site, and the losers look like what it targets. Otherwise write "unattributed" and the date of the next check, never "probably the update".

## Output

- The report (`references/report.md`): verdict first (real or not, the size, the onset, act, wait or investigate), then the action with its evidence, what else was checked (every rule-out with its result), how this was made. Full evidence in `seo/reports/YYYY-MM-DD-drop.md`, or the scratch folder when the project file was declined; the chat says where.
- Project file, when agreed: `decisions.md` (the cause class or "unattributed", the review date, open flags), `baseline.md` rows before any fix, `changelog.md` only for a fix the owner approved.

## Never

<!-- myths -->
- Mass edits or rewrites in response to a drop, or reverting good changes that are not shown to be the cause.
- Disavowing links, or deleting or noindexing pages at scale.
- Publishing in bulk during an update rollout, or stacking several changes so no effect can be read.
- Blaming an update from timing alone, or counting a Discover-only update against Web search clicks.
- Resubmitting sitemaps or requesting indexing for everything as a fix.
- Judging on the newest 2 to 3 days, or reading impressions, CTR or position as fact inside a data break.
<!-- /myths -->

## Without data

Without Search Console or analytics the size and onset are unknown: write the loss as owner-reported, never as a figure, and say that Manual actions and Security issues need Search Console access to be read. With fewer than 21 days of Dates data the script says it cannot run the check: read the pages and queries tables by hand and say so. Still run the crawl and the robots check: a fault found there is a candidate cause, not an attribution, until the data confirms the onset. Say once that a Performance export with its Dates file would give size, onset and segments.
