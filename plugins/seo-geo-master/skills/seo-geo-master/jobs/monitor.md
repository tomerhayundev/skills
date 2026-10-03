# Monitor

## When

"Watch it for me", a weekly or monthly check, alerts, a health report on a site already being worked on. It reads and reports; it never edits. A sudden loss goes to `jobs/drop.md`.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, write export paths without a leading `/`, or start the command with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md` (money pages), `changelog.md` (changes whose judge-on date has come), `decisions.md` (open flags), `baseline.md`, and the last `seo/reports/*-monitor.md` to compare verdicts and flags.
- Search Console data is the newest export the owner already has, with its end date stated in the report; never ask for a new export on a schedule. When the owner also has an older export for the previous equal period, add it: `node <skill>/scripts/gsc-analyze.mjs <export dir> [--compare <previous export dir>] --brand "<brand names>" --out <out>/monitor/YYYY-MM-DD/gsc` (decay needs `--compare`). A connector that reads Search Console (`references/data-sources.md` section 3) replaces the export once a call to it has succeeded.
- The site: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/monitor/YYYY-MM-DD/crawl` and `node <skill>/scripts/robots-check.mjs <url> --paths /,<money page>,<money page> --out <out>/monitor/YYYY-MM-DD/robots`.
- In Search Console: Page indexing, Sitemaps, Crawl stats, Manual actions, Security issues. The Search Status Dashboard live, with `data/updates.json` and `data/data-breaks.json` as snapshots. Bing Webmaster Tools when verified.
- `references/measurement.md` sections 1, 6 and 7.

## Steps

1. **Cadence and windows.** Monthly for most sites. Weekly only when there is enough traffic: segments under about 100 clicks a period need longer windows (judgment). Compare the same weekdays in equal periods and never the newest 2 to 3 days.
2. **Calibrate on this site.** Calibration needs at least 8 complete weeks of clicks (judgment). From the weekly table of the drop check in `gsc.md` (up to 12 complete weeks, ending at the export's end date), list the week-over-week changes in clicks of the last 8 to 12 weeks. The normal range is up to the 90th percentile of those changes, ignoring their sign (judgment). Fewer than 8 complete weeks: write "not calibrated" and run only the critical faults in step 4. For a segment, calibrate on its own weekly clicks when a filtered Dates export exists; otherwise use the site-wide range and label the alert inferred. Recalibrate every run; never borrow another site's numbers.
3. **Checklist.** One row per item in the report, each with its evidence and date.
   - Known Google issues and updates: the live dashboard first. A rolling update puts any attribution on hold.
   - Clicks by segment (site, template or folder, brand and non-brand, country, device) against the previous equal period.
   - Indexed and not-indexed counts (Page indexing). Unknown without access.
   - Crawl and server errors: Crawl stats, `START_PAGE_NOT_200`, `SITE_UNAVAILABLE`, `RATE_LIMITED`, 5xx.
   - Sitemaps: `SITEMAP_URL_*` in the crawl and the Sitemaps report.
   - Manual actions and Security issues.
   - Top gainers and losers: the decay rows (pages) with `--compare`, and the striking-distance and low-CTR query rows (queries, not URLs: the page behind a query comes from a query+page export or the live results).
   - A spot-check of 3 to 5 key pages (judgment): status 200, indexable, canonical to itself, title and H1 unchanged, main content in the raw HTML.
   - The changelog: every change whose judge-on date has come gets its Result line, search and business together.
   - AI visibility, only if a sampling was set up: the same question list again (`jobs/geo.md` step 7) and the Generative AI report's pages.
4. **Alerts.** Both tiers are (judgment), calibrated on the site's own last 8 to 12 weeks, and they alert on declines only: a rise is reported with the gainers, and one far outside the normal range is checked for a data break or a tracking change first.
   - Warning: a week-over-week decline in clicks beyond the 90th percentile of this site's normal change.
   - Critical: a decline of about twice that. Also critical whatever the numbers: the site or key templates down, robots or noindex on key pages (`SITE_BLOCKED_BY_ROBOTS`, `CORE_SEARCH_BLOCKED`, `NOINDEX_PAGE` on a key page), a manual action, a security issue.
   - A decline inside the normal range is noise. One day is never an alert.
5. **Verdict**, one line: Healthy, Watch or Problem, and one next action.
   - Healthy: no alert, and the open flags are known and dated.
   - Watch: a warning, an early drop, a data gap, a flag with a date, or a move that coincides with a rolling update or a data break. Next action: the date of the next check.
   - Problem: any critical alert. Next action: the first move of the job the table below names.
6. **Escalate** by what was found, and classify the cause before anything changes:

| Found | Next job |
| --- | --- |
| A critical clicks alert, "a possible real drop", a manual action for another cause, a security issue | `jobs/drop.md` |
| Indexed count falling or not-indexed rising, sitemap, robots, canonical or noindex findings on key pages | `jobs/audit.md` (indexing, step 2) |
| A URL, domain or platform change planned or just made | `jobs/migration.md` |
| CTR falling at a steady position, decay rows (pages), striking-distance and low-CTR queries | `jobs/grow.md` |
| A manual action that names links | `jobs/links.md` |
| Generative AI impressions or sampled frequencies shifting | `jobs/geo.md` |

## Decide

- No edits from an alert until the cause is classified and the owner decides; the alert opens a job, it does not authorize a fix.
- One warning is a reason to look again after the next complete week, not to change anything.
- A move that coincides with a rolling update, or with a data break inside the compared periods (`data/data-breaks.json`), stays unattributed, and the verdict is Watch until the update has finished and a week has passed. An export at the 1,000-row cap is reported as incomplete.
- Offer a scheduled routine only if the user asks for one. Then set it up with the scheduling tool that exists, running this job's read-only checklist, with the report saved and never an edit. A scheduled run with no Search Console connector (one a call has already succeeded on) cannot read fresh clicks and never asks the owner for an export: it runs the technical half only (crawl, robots, sitemap, key pages), and its verdict is "traffic not measured".

## Output

- The report (`references/report.md`) short: the verdict line first, the end date of the Search Console data used, the checklist table (item, status, evidence with dates), the alerts with the threshold used and how it was calibrated, one next action. Full text in `seo/reports/YYYY-MM-DD-monitor.md`, or the scratch folder when the project file was declined; the chat gets the verdict and the next action.
- Project file, when agreed: `decisions.md` for new open flags and their review dates; the Result line in `changelog.md` for every change judged this run. No `baseline.md` row unless a change follows.

## Never

<!-- myths -->
- Judging on the newest 2 to 3 days, on a single day, or on a move inside the site's normal range.
- Weekly checks on a site too small for them.
- Alert thresholds copied from another site or from an imported benchmark.
- Editing anything straight from an alert.
- Explaining a move by an update that is still rolling out.
- One health score for the site.
<!-- /myths -->

## Without data

Without Search Console the run covers the technical checks only (crawl, robots, sitemap, key pages, live results). The verdict says "traffic not measured" and is never Healthy about traffic. Say once that an export or a read-only connector would add clicks, indexing counts and the calibration.
