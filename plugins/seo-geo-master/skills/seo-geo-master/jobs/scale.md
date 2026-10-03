# Scale

## When

Many pages made from data or a template: location pages, product or place directories, "X in every city", programmatic pages, and comparison pages ("A vs B", "alternatives to A"). A single local page is `jobs/local.md`; a plan that adds a few pages is `jobs/content.md`.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md` and `decisions.md`: what the site is, what it already publishes at scale, what was rejected.
- The crawl, from intake or audit, or `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl`: `DUPLICATE_INTENT_CANDIDATE`, `TITLE_DUPLICATE`, `DESCRIPTION_DUPLICATE` and `words` per page in `pages.csv` for any family that already exists, `SITEMAP_URL_*` for what is listed.
- A Search Console export (`gsc-analyze.mjs`, pages file) for how an existing family performs: impressions and clicks per page against its siblings. In Search Console, Page indexing for "Crawled - currently not indexed" among them.
- The data source itself: which fields exist per record, whose data it is, how fresh, and whether others publish the same.
- The live results for two or three sample targets (query, country, language, device, date): which page types rank, and whether pages like these appear at all.
- `references/spam-guard.md` item 4 and `references/facts.md` (Google: spam and quality) for the dated wording.

## Steps

1. **Standalone-value test, per page type.** Would this page be worth visiting if it were the only one of its kind? A data source adds unique value when each record brings something a visitor cannot get from the next page: the business's own data, real inventory, real prices, original measurements, real local facts. Public data everyone has, with the name swapped, does not pass.
2. **No mad-libs.** A template where only a place or product name changes fails the test. Write the page type down: URL pattern, fields, what makes each page differ, the question it answers, and an exclusion rule (a record with too little data gets no page; the cut-off is set per site, judgment).
3. **Pilot a small batch** (judgment), written by `references/writing.md` with a person reading the template and a sample of the finished pages; a person fact-checks any AI-assisted text (facts.md, 2026-10-01). Take the baseline first, keep similar existing pages as a control, then measure indexing and clicks for 4 to 6 weeks (judgment). The pass line is written before the pilot, from the site's own comparable pages (judgment).
4. **Decide from the pilot.** Widen in steps only the page types that pass. Indexed pages with no impressions are a template or demand problem to fix before widening. Pages Google chose not to index ("Crawled - currently not indexed" is a verdict on the page, not an error, and resubmitting does not change it: facts.md, 2026-10-03) point to a page type that fails the test (judgment). Index only pages that pass. The rest are noindexed or not published, and the sitemap lists only the pages that pass (`SITEMAP_URL_NOINDEX` otherwise).
5. **The risk, in plain words.** Google's spam policies call producing many pages mainly to manipulate rankings, with little added value, scaled content abuse, whatever the method and AI included; a separate page for every query fan-out variation is the same (facts.md, 2026-08-28 and 2026-07-10). The cost of getting this wrong can be larger than the gain from the pages (judgment), which is why the pilot comes first and a page that cannot pass the test is not published.
6. **Comparison and alternatives pages.**
   - Fair and dated: the date shown, the criteria stated up front, a sentence on who each option suits.
   - A source for every claim about the other product (its own public pages, linked), and its real strengths named.
   - No review or rating markup about the site's own product: a rating a business gives itself is a fake review (spam-guard item 6).
   - Competitor names used only as plain names to identify them: no logos or look-alike styling that suggests affiliation; the owner checks the other company's brand rules when unsure.
   - Reversed duplicates ("A vs B" and "B vs A") merge into one page; check by hand as well, since `DUPLICATE_INTENT_CANDIDATE` is a hint, not a complete check (`jobs/content.md` step 5).
   - An "alternatives to A" page exists only when the site is a real alternative.
7. **Location pages** follow `jobs/local.md` step 4: one page per real place with its own facts, never a town-swapped copy.

## Decide

- Fewer pages with unique value beat many without it. When the data cannot carry a page per record, build one strong page instead: a filterable table, a tool, a hub (judgment).
- A new or small site does not start here: foundations and one or two real pages first (SKILL.md section 5).
- A family that already exists and underperforms is a rework or a prune before it is a model to copy.
- Never publish the whole set before the pilot has passed; the owner approves each widening.

## Output

- The report (`references/report.md`): the verdict on whether this page type passes the test, the pilot proposal (batch, baseline, control, pass line, judge-on date, revert rule), what else was checked. The page-type spec and the sample pages go in `seo/reports/YYYY-MM-DD-scale.md`, or the scratch folder when the project file was declined; the chat says where.
- Project file, when agreed: `baseline.md` rows for the pilot folder and its control before publishing, `changelog.md` after the owner approves (the pages, the date, the revert rule), `decisions.md` for the page types that failed and why.

## Never

<!-- myths -->
- Mad-libs templates where only a place or product name changes.
- Mass pages, or AI-written pages that no person checked.
- A page for every keyword variant or query fan-out variation.
- Town-swapped location pages.
- Publishing the whole set before a pilot has passed, or listing pages that failed in the sitemap.
- Review or rating markup about the site's own product on a comparison page.
- Unsourced, undated or one-sided claims about a competitor, or both "A vs B" and "B vs A".
<!-- /myths -->

## Without data

Without Search Console, the pilot is judged by the crawl (indexable, linked, in the sitemap) and by hand-checked live results, and indexing stays unconfirmed: a `site:` search is a rough hint, never proof. Say so once, keep the first batch small, and label the verdict inferred.
