# Audit

## When

A whole-site ask ("audit my site", "how is my SEO", "why don't we get traffic"), the first job for a new client or a new site, or an area with no single URL (schema, sitemap, robots.txt, Core Web Vitals, indexing). It is also the default when no other job fits. One URL goes to `jobs/page.md`; a sudden loss goes to `jobs/drop.md` first.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- A scoped audit (only schema, sitemap, robots.txt, Core Web Vitals or indexing, as SKILL.md section 2 routes it) runs the crawl plus only that area's script and steps: schema is `schema-check` and step 5; sitemap is the crawl's sitemap findings and step 2; robots.txt is `robots-check` and step 2; Core Web Vitals is `cwv.mjs`; indexing is step 2 with the Search Console Page indexing report. Step 1 always runs. The report covers only that area and says so in "How this was made".
- Read `seo/` if it exists: `brief.md` (money pages, conversion events), `baseline.md`, `changelog.md` and `decisions.md` (what was tried, open flags).
- Crawl: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl`. If it reports `ROBOTS_SKIPPED` or `SITE_BLOCKED_BY_ROBOTS`, ask once whether the owner owns the site; on a yes, re-run with `--ignore-robots`.
- Crawler access: `node <skill>/scripts/robots-check.mjs <url> --paths /,<money page>,<money page> --out <out>/robots`.
- Structured data on every template the crawl read: `node <skill>/scripts/schema-check.mjs --from-crawl <out>/crawl/crawl.json --out <out>/schema`.
- Speed, one URL per run: `node <skill>/scripts/cwv.mjs <home url> --out <out>/cwv-home`, then one template page into `<out>/cwv-template`. INP has no lab value: total blocking time is a stand-in and is never called INP. Field data needs `CRUX_API_KEY` in the environment; without it, say field data was not fetched.
- When a Search Console export exists: `node <skill>/scripts/gsc-analyze.mjs <export dir> [--compare <older export dir>] --brand "<brand names>" --out <out>/gsc`. Read its data breaks first; decay rows need `--compare`.
- `references/facts.md` for every date or number you state; `references/spam-guard.md` before any advice about links or page volume.

## Steps

1. **Dead or moved site first.** Open `<out>/crawl/pages.csv` and read the start URL's own row. If its `finalUrl` is on another domain, its status is 404 or 5xx, or the crawl reports `START_PAGE_NOT_200` (a start page that answered something other than 200, or not at all) or `SITE_UNAVAILABLE` (it answered 429 or 503), the crawl audited little or nothing about this site. Stop and find the live domain (the brief, the site's own links, a live search for the brand) before anything else. Ask in one question only if it is still unclear.
2. **Indexing triage.** Sort every crawl, robots and schema finding into four bins and name the bin in the report. The code lists below are examples, not complete lists: a finding whose code is not listed goes in the bin its meaning fits.
   - Technical blocks: 5xx, URLs robots.txt blocks, noindex, 4xx, redirect errors (for example `START_PAGE_NOT_200`, `ROBOTS_UNAVAILABLE`, `SITE_BLOCKED_BY_ROBOTS`, `CORE_SEARCH_BLOCKED`, `SITEMAP_URL_ERROR`, `SITEMAP_URL_NOT_200`, `SITEMAP_URL_BLOCKED`, `SITEMAP_URL_NOINDEX`, `NOINDEX_BLOCKED`, `BROKEN_INTERNAL_LINK`, `REDIRECT_LOOP`, `REDIRECT_CHAIN`, `HTML_OVER_2MB`, `KEY_TAGS_AFTER_2MB`). `NOINDEX_PAGE` belongs here only when the page should rank; on a page meant to stay out of search it is Intentional.
   - Signal conflicts: two signals that disagree, such as canonical against sitemap, noindex, hreflang or robots (for example `SITEMAP_URL_NOT_CANONICAL`, `CANONICAL_POINTS_ELSEWHERE`, `CANONICAL_CHAIN`, `CANONICAL_CONFLICT`, `CANONICAL_MULTIPLE`, `CANONICAL_TARGET_NOT_200`, `NOINDEX_WITH_CANONICAL`, `HREFLANG_*`). Decide which signal the owner means, then change the others to match.
   - Engine decisions: in Search Console's Page indexing report, "Crawled - currently not indexed" means Google fetched the page and chose not to index it for now, and "Discovered - currently not indexed" means Google found the URL but has not crawled it yet, usually rescheduled to avoid overloading the site (facts.md, 2026-10-03). Neither is an error, and resubmitting fixes neither. Treat each as a question about the page: thin, duplicate (`DUPLICATE_INTENT_CANDIDATE`), unlinked (`ORPHAN_PAGE`), or not worth indexing. For "Discovered", also check for a slow or rate-limited server (`RATE_LIMITED`, slow responses in the crawl). Without Search Console access these statuses are unknown; say so.
   - Intentional: a 404 or 410 for a removed page, noindex on login, cart and thank-you pages (`NOINDEX_PAGE` there), an internal-search block. Check against `brief.md` and leave alone.
   On-page hygiene findings (`TITLE_MISSING`, `DESCRIPTION_*`, `H1_*`, `IMG_ALT_MISSING`, `LANG_MISSING`, `JSONLD_PARSE_ERROR`) are not indexing problems: they go to "What else we checked", unless one is site-wide (the same defect across a template or most pages), which makes it a template candidate for step 6.
   When the crawl stopped at its cap it reports `ORPHANS_UNVERIFIED`, not `ORPHAN_PAGE`: call those candidates, or raise `--max` once and re-run.
3. **Page families.** Group the crawled URLs by pattern (first path segment, template, language) from `pages.csv`. In each family read the best page and the worst page (best by clicks when there is an export, otherwise the most linked and most complete), compare siblings, and name what the weak ones lack. Protect near-top rankers: a page in positions 1 to 3 or with steady clicks changes only after a diagnosis.
4. **GEO basics.** Run `jobs/geo.md` steps 1 to 4: crawler access, content in the raw HTML, entity clarity, the Search generative AI setting. Do not run its sampling here unless the ask is about AI.
5. **Render check.** In a browser, open every page the crawl flagged `CONTENT_NEEDS_JS` and one page of every template that `schema-check` reported with `NO_JSONLD_STATIC`. Compare what a visitor sees with the raw HTML. Without a browser tool, write "not rendered" and never call the content or the markup missing. The raw-HTML fact stands either way: crawlers that do not run JavaScript (most AI crawlers) see only the raw HTML, so a page meant to be found serves its heading, description and main text in the HTML (server-side rendering or prerendering), and a page not meant to be found is noindexed and left out of the sitemap and menus.
6. **Shortlist and pick** by SKILL.md section 7: 5 to 10 candidates from at least three kinds, scored impact x confidence / effort, 1 to 3 recommended, the rest in "What else we checked". With a Search Console export, build candidates from `gsc.md` (method in `jobs/grow.md` steps 2 to 4), so the shortlist rests on measured evidence and not on crawler warnings alone. Decay rows and Low CTR pages are pages: "underperforming page" candidates. Striking-distance and Low CTR query rows are queries, not URLs: find the page that ranks for each in a query+page export or the live results before it becomes a page candidate, and a query with no fitting page is "demand with no page". A "winner to protect" is a page in positions 1 to 3 or with steady clicks, read from the Pages file; never a decay row.

## Decide

- Fix order: site-wide blocks first, then templates, then a sample of pages before any bulk change, content last. A template fix reaches many pages at once, so it outranks any single page.
- A crawler warning alone never outranks a measured loss. With a Search Console export, rank by clicks at stake; without one, say the ranking is inferred.
- `D` findings are facts. `H` findings (`CONTENT_NEEDS_JS`, `DUPLICATE_INTENT_CANDIDATE`, `ORPHANS_UNVERIFIED`, `VALUE_UNVERIFIED`) need a look at the page before they appear in the report. For `VALUE_NOT_VISIBLE`, check the rendered page before calling a rating or price fake; only high and `D` in the static HTML is certain.
- For an ask about more customers or leads, if `brief.md` names no conversion event for the money pages, setting one up is part of the first recommendation (SKILL.md section 6).
- A new or small site gets foundations and indexing first, then one offer page and one supporting page (SKILL.md section 5). A mature site protects what ranks.
- A store or a multilingual site continues in `ecommerce` or `international` after this job; a local business in `local`.

## Output

- The report (`references/report.md`): verdict first, 1 to 3 actions, "What else we checked" (every bin and every candidate not chosen, with a real reason), "How this was made". The full text goes to `seo/reports/YYYY-MM-DD-audit.md`, or the scratch folder when the project file was declined; the chat says where.
- Project file, when agreed, as the last step: findings worth tracking go into `decisions.md` as open flags (an unchecked `H` finding is a flag, never a guess); a `baseline.md` row, written before the change, for every page an action touches; `changelog.md` only once the owner approved and a change was made.
- Propose, never publish: every fix is a proposal with the exact change, the originals saved first, in reviewed batches.

## Never

<!-- myths -->
- Report a raw list of every finding.
- Call a page "not indexed" from a `site:` search alone; a failed lookup is unknown.
- Recommend a fix for something already correct. Check first: the Sitemap line in the live robots.txt, the alt attribute in the image tags, existing schema in the raw HTML and in the rendered page.
- Treat "Crawled - currently not indexed" or "Discovered - currently not indexed" as an error to fix by resubmitting.
- Give the site a single score out of 100.
- Edit robots.txt, redirects, canonicals or the sitemap on the live site without the owner's approval.
<!-- /myths -->

## Without data

Crawl, robots check, schema check, lab speed data and live checks only. Say once, in "How this was made", what Search Console would add: which pages Google actually indexed and why it skipped the others, queries and clicks to rank candidates by measured loss, and field Core Web Vitals. Label every priority that rests on the crawl alone as inferred.
