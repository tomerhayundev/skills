# Page

## When

One URL that will not rank or will not get indexed, "why isn't this page ranking", "optimize this page", "check this page". For a whole site use `jobs/audit.md`. A page that will not rank goes through the steps below in order, indexing first and links last, never straight to links.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md` for the page's role (money, hub, supporting) and its conversion event; `changelog.md` for earlier changes to this URL.
- The page itself: `node <skill>/scripts/crawl.mjs <url> --max 1 --out <out>/page`. It gives status, redirects, canonical, noindex, title, description, headings, alt text, JSON-LD, word count and whether the sitemap lists the page.
- A `--max 1` crawl reads only this page, so its `inlinks` is always 0 and means nothing. For links in, read `inlinks` for this URL in `pages.csv` of the intake or audit crawl, wherever it is (the scratch folder or `<out>/crawl`); it counts only the pages that crawl read, so it is a floor. When no such crawl exists, run `node <skill>/scripts/crawl.mjs <site url> --max 60 --out <out>/crawl` first.
- `node <skill>/scripts/schema-check.mjs <url> --out <out>/page-schema`. Given a URL it fetches that one page, once, without reading robots.txt (only the crawl obeys it), so for a page robots.txt blocks the same rule as for `--ignore-robots` applies: the owner confirms the site is theirs first.
- When the crawl reports `ROBOTS_SKIPPED` or `SITE_BLOCKED_BY_ROBOTS`: `node <skill>/scripts/robots-check.mjs <site url> --paths <the page's path> --out <out>/robots` names the deciding rule. `--ignore-robots` only after the owner confirms the site is theirs.
- The page in a browser: what a visitor sees first, and the rendered text.
- The live results for its main query (from `brief.md`, from Search Console, or the buyer's own words, labelled inferred). Record query, country, language, device and date; count positions by hand.
- URL Inspection in Search Console when access exists.

## Steps

Stop at the first real problem and report it; do not polish a page that has a defect upstream.

1. **Indexable.** Check each, from the crawl row and its findings:
   - Status 200 (a redirect means this is not the final URL), and not blocked by robots.txt.
   - No noindex in a meta tag or an `X-Robots-Tag` header (`NOINDEX_PAGE`).
   - Canonical to itself (`CANONICAL_POINTS_ELSEWHERE`, `CANONICAL_MULTIPLE`).
   - In the sitemap, under its final URL (`SITEMAP_URL_*`), and linked from other pages (`inlinks`).
   - Main content in the raw HTML (`CONTENT_NEEDS_JS`, then the browser).
   - URL Inspection says what Google did: indexed or not, which canonical it chose, when it last crawled. Without it, a `site:` search is a rough hint and never proof.
2. **Intent.** Read the live results: format (product pages, guides, lists, tools, videos), depth, freshness, who ranks (brands, marketplaces, forums, publishers), and whether an AI answer or another feature takes the space. A guide cannot win a query where every result is a product page: the fix is a different page type or a different query, not a rewrite.
3. **Quality.** Does the page answer faster and better than what ranks? Does it hold one thing a reader cannot get elsewhere: first-hand experience, original data, a worked example, a real photo, a real price? E-E-A-T is how raters judge trust, not a ranking switch (facts.md, 2025-12-10). Where only the owner can supply the thing, write `[ADD: ...]` and ask for it.
4. **Protected fields.** Title, meta description and H1 stay true to the body: every price, year and claim in them is on the page and correct.
5. **On-page.**
   - Title: the clickable promise. Pixel width matters more than a character count, so judge truncation on the live result.
   - Meta description: a snippet candidate. Google may write its own, so the first lines of the page must work as a snippet too.
   - Headings that read like the questions a buyer asks, in the brand's own words; a direct answer near the top; descriptive alt text on real images (read what exists before proposing any); links out to sources.
6. **Structured data matches the visible content.** Read the `schema-check` findings: `VALUE_NOT_VISIBLE`, `VALUE_UNVERIFIED`, `REQUIRED_MISSING`, `SELF_SERVING_REVIEW`, `RICH_RESULT_RETIRED` (keep only if honest; not a ranking or AI lever), `NO_JSONLD_STATIC` (render the page before calling markup missing). Every value in the markup must be on the page.
7. **Internal links in.** From related pages that already rank or get traffic, with descriptive anchors rather than "click here". Find candidates in the crawl (link text, pages on the same topic). A larger linking effort goes to `jobs/links.md`.

## Decide

- If the page ranks 1 to 3 or earns steady clicks, change nothing without a diagnosis that says why.
- The first real problem wins. A page that cannot be indexed gets no copy edits; a page aimed at the wrong intent gets a different target, not polish.
- When steps 1 to 6 find nothing and links in are weak, links are the next move. When they find nothing at all, "no defect found" is a valid verdict: demand, competition and authority remain, and the report says what was checked instead of inventing a change.
- Changes are judged on the windows in `references/measurement.md`, against a baseline taken first.

## Output

- The report (`references/report.md`) with the one change that matters most: do this, why, evidence, effort, how we will know. Where text changes, give the exact old and new text, quoted, written by `references/writing.md`. "What else we checked" lists the steps that passed.
- Project file, when agreed: a `baseline.md` row for this URL before the change (clicks, impressions, CTR, position, conversions, source; "unknown" is a valid value), and a `changelog.md` entry after the owner approves, with the judge-on date and the revert rule.

## Never

<!-- myths -->
- Keyword density, keyword counts or "LSI keywords".
- Word-count targets: match what ranks for the query and what the reader needs.
- Title or description rewrites without a baseline.
- Schema added to win rankings, or FAQ or HowTo markup added for rich results.
- Invented experts, credentials, reviews, quotes or statistics.
- Jumping to links or content before steps 1 and 2 are cleared.
<!-- /myths -->

## Without data

Live checks and the crawl are enough for steps 2 to 7. Name once, in "How this was made", the missing piece: Search Console's URL Inspection, which says whether Google indexed the page and which canonical it chose. Positions are then a hand-counted snapshot with its conditions, not a baseline.
