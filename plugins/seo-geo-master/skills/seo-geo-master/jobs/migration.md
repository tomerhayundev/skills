# Migration

## When

A new domain, a new platform or CMS, a new URL structure, a redesign, a move to HTTPS, merging or splitting sites, a subdomain move. It runs before the change. When the loss has already happened, run `jobs/drop.md` first and use the post-launch table below to look for the cause.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md`, `baseline.md`, `changelog.md`: money pages and conversion events, what changed recently, the owner's busiest weeks.
- The baseline crawl of the current site: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl-before`. Raise `--max` until the first lines of `findings.md` no longer say the crawl stopped at its cap.
- Page data from what exists: a Search Console export (pages with clicks; a 1,000-row export is incomplete), analytics landing pages, server logs only if the owner already has them.
- The new site on staging: `node <skill>/scripts/crawl.mjs <staging url> --max 200 --out <out>/crawl-staging`. The crawl obeys robots.txt and cannot log in: a staging site with `Disallow: /` reports `SITE_BLOCKED_BY_ROBOTS` (the owner confirms the site is theirs before `--ignore-robots`), and a site behind a login cannot be crawled, so check its templates in a browser and say so.
- After launch: the same crawl on production into `<out>/crawl-after`, `node <skill>/scripts/robots-check.mjs <url> --paths /,<top URLs> --out <out>/robots`, and, for an old URL's first answer and its whole redirect chain, one run per URL (the top URLs and a small sample, judgment), each with its own `--out` because a run replaces what its folder holds: `node <skill>/scripts/crawl.mjs <old url> --max 1 --out <out>/migration/check-<n>`. Read `chain` for that URL under `pages` in `crawl.json`: each hop's status and location, then `finalUrl`. Add `--ignore-robots` only after the owner has said the site is theirs (the ownership question in SKILL.md section 1 step 3); without it an old URL that robots.txt blocks is reported as skipped (`ROBOTS_SKIPPED`), not checked.
- `references/facts.md` (International and site moves, and Crawling and technical), `references/measurement.md` section 6.

## Steps

1. **Necessity gate.** Name the benefit and how it will be measured (speed, a platform the team can keep running, a legal or brand reason, merging duplicate sites). If it is cosmetic, advise against and say what can change without changing a URL. Never bundle a URL change, a redesign and a content rewrite: do one, so a loss can be traced (judgment). Avoid the owner's peak season, taken from the weekly clicks of the last year when the data reaches back; Google suggests timing a move for lower traffic if possible (facts.md, 2026-08-20).
2. **Baseline inventory, before anything changes.** The union of the crawl, the sitemap, Search Console pages with clicks, analytics landing pages and server logs. Per URL: status, title, description, canonical, H1, robots, schema types, internal links in, hreflang (`pages.csv` has the quick columns, `crawl.json` the rest). Save `<out>/migration/inventory.csv`, mark the URLs with clicks or links as top URLs, and add `baseline.md` rows (clicks, conversions) for the main segments.
3. **Redirect map.**
   - Each old URL maps 1:1 to its closest equivalent, never many to the home page; where there is no equivalent, a 404 or 410.
   - 301 or 308, one hop (no `REDIRECT_CHAIN`), every destination answers 200, and protocol, www, trailing slash and case variants are handled by rule.
   - Internal links, canonicals, sitemaps and hreflang are updated to the final URLs (`LINK_TO_REDIRECT`, `SITEMAP_URL_REDIRECTS`, `CANONICAL_*`, `HREFLANG_TARGET_NOT_200`).
   - Old URLs are never blocked in robots.txt: the redirect would not be seen.
   - Write the map as a file in the server's own format for the developer. Applying it is the owner's step (step 7).
4. **Staging stays out of the index.** Authentication, or noindex; robots.txt alone does not prevent indexing. Never combine noindex with a robots.txt `Disallow`: the page is not fetched, so the noindex is never seen (`NOINDEX_BLOCKED`). Whatever keeps staging out goes on the launch checklist as something to remove; Google asks for the list of URLs to remove noindex from to be ready before the move starts (facts.md, 2026-08-20).
5. **Compare before launch.** Crawl staging and read it against the inventory through the map: each old URL's new address answers 200, is indexable, has a self canonical, and keeps title, H1, schema types and hreflang unless the change meant otherwise. List the gaps; they block launch.
6. **Launch checklist.** Each item has a done-date.
   - The owner confirmed go-live (date and what exactly switches), and a rollback path is agreed (what switches back, who does it).
   - Staging blocks removed: noindex, authentication, `Disallow: /`; confirm in production's robots.txt and a template's raw HTML.
   - Redirects spot-checked on the top URLs, then a sample of the rest.
   - New sitemap submitted; both properties verified (old and new) when the domain or subdomain changes.
   - The change logged in `changelog.md` with the baseline, the launch date and the judge-on dates.
   - A move from one domain or subdomain to another: once the redirects work, the owner starts the Change of Address tool in the old property, for every verified variant of the old domain. A move to HTTPS, a switch between www and non-www, or a change of paths inside one domain does not use it (facts.md, 2026-08-20).
   - Redirects stay for as long as possible, generally at least a year (facts.md, 2026-08-20), and longer while the old URLs still get visits or links.
7. **Irreversible steps** each need the owner's explicit confirmation at that step: the DNS cutover, activating the redirects, deleting old URLs or the old site, retiring the old domain or its redirects, the Change of Address submission. The skill prepares and checks; the owner decides.
8. **After launch.**

| When | Check | Act |
| --- | --- | --- |
| Day 1 | Crawl production; robots.txt; a template's raw HTML; the top URLs' redirects; site-wide errors | Roll back on site-wide errors. Remove a leftover noindex or robots block. Fix broken redirects on top URLs. |
| Days 2 to 14 | Crawl again; Page indexing and Crawl stats; 404s against the inventory | Mass 404s (missing map rows), wrong canonicals and chains are fixed in batches the owner approves. |
| Weeks 2 to 6 | Clicks by segment against the baseline, same weekdays, newest 2 to 3 days left out | A fault traced to a cause with no quick fix goes to the owner with options. Movement is not judged before week 2 (judgment); Google says most pages of a small or medium site take a few weeks to move, so early fluctuation is expected (facts.md, 2026-08-20). |
| Later | A persistent loss | `jobs/drop.md`, with the launch date as an onset candidate. |

## Decide

- Go or no-go: no-go while top URLs lack a mapped destination, the staging blocks are untested, the date is in peak season, or the change is bundled. The report states the verdict; the owner decides.
- Roll back only for the day-1 faults. A page-level loss with no fault found in the crawl is not a reason to revert.
- A traced fault gets its fix and nothing else, so its effect can be read.

## Output

- The report (`references/report.md`): go or no-go first, then the actions. The inventory, the redirect map and the launch checklist go in `<out>/migration/` and `seo/reports/YYYY-MM-DD-migration.md` (scratch folder when the project file was declined); the chat says where.
- Project file, when agreed: `baseline.md` rows before launch, `changelog.md` once the owner approved and launched (launch date, judge-on dates, revert rule), `decisions.md` for the benefit, the rollback path and the open flags.

## Never

<!-- myths -->
- Redirecting many old URLs to the home page.
- Blocking old URLs in robots.txt.
- Launching with staging noindex, authentication or a robots block still in place.
- Bundling a URL change, a redesign and a content rewrite, or launching in peak season.
- Deleting old URLs before their redirects work, or removing redirects early.
- Taking any irreversible step without the owner's explicit confirmation.
<!-- /myths -->

## Without data

With no Search Console, analytics or logs, the inventory is the crawl and the sitemap: URLs only those sources know (old campaign pages, deep articles nothing links to) may be missing from it, so the redirect map covers only what is known. Say so once in the go or no-go, and label the top-URL choice as inferred.
