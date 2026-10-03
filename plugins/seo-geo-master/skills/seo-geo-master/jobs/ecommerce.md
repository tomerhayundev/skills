# Ecommerce

## When

An online store: product and category pages, filters and faceted navigation, out-of-stock and discontinued products, manufacturer descriptions copied from a supplier, Merchant Center and product feeds, "my products do not show up". A whole-site ask starts in `jobs/audit.md` and continues here; one product URL that will not rank is `jobs/page.md`.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md` (money pages, the named purchase event), then the crawl: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl`. On a large catalog the crawl stops at its cap (`findings.md` says so in its first lines): group `pages.csv` by pattern (product, category, URLs with a query string for filters or sorting) instead of reading rows.
- Crawl findings that matter here: `CANONICAL_*`, `NOINDEX_*`, `SITEMAP_URL_*`, `TITLE_DUPLICATE`, `DESCRIPTION_DUPLICATE`, `DUPLICATE_INTENT_CANDIDATE`, `BROKEN_INTERNAL_LINK`, `LINK_TO_REDIRECT`, `REDIRECT_CHAIN`, `CONTENT_NEEDS_JS`.
- `node <skill>/scripts/schema-check.mjs --from-crawl <out>/crawl/crawl.json --out <out>/schema` for Product and Offer markup: `REQUIRED_MISSING`, `VALUE_NOT_VISIBLE`, `VALUE_UNVERIFIED`, `PRICE_NO_CURRENCY`, `SELF_SERVING_REVIEW`, `NO_JSONLD_STATIC`.
- Crawler access, in two runs, because the two kinds of path want opposite answers. Money pages (home, a category, a product), which crawlers must reach: `node <skill>/scripts/robots-check.mjs <url> --paths /,<a category>,<a product> --out <out>/robots`; a block there is a finding. Crawl traps (a filtered URL, a sort order, the internal search URL, written in full with their query string), which should be blocked: `node <skill>/scripts/robots-check.mjs <url> --paths <a filtered path>,<the internal search path> --out <out>/robots-traps`. For trap paths a block is the wanted result: the blocked findings in `robots-traps` (`CORE_SEARCH_BLOCKED`, `SEARCH_CRAWLER_BLOCKED` and the rest) are expected and are not reported as defects. A trap path that is allowed is the finding: nothing stops crawlers from the endless URLs (step 3).
- A Search Console export (`gsc-analyze.mjs`, pages file) for which products and categories bring clicks. A store platform connector or Merchant Center diagnostics only when a call to them has succeeded (`references/data-sources.md` section 3): read first, write only through the batch rule in step 7.
- `references/facts.md` (AI crawlers and platforms, Hebrew and Israel) and `references/spam-guard.md` item 4 before any plan that adds many pages.

## Steps

1. **Product pages.** A description written for this product, not the supplier's text; real photos; price and availability visible on the page and matching the Product and Offer markup (`VALUE_NOT_VISIBLE`, `PRICE_NO_CURRENCY`). Variants (size, colour): one canonical product URL with the variant picked on the page, or, when variants have their own URLs, each with its own correct canonical and a ProductGroup in the markup tying them together. Never a canonical that sends a searched-for variant to a page that does not show it.
2. **Markup tells the truth.** Ratings and review counts appear in the markup only if they are on the page and come from customers of that product. Reviews the store wrote about itself are fake reviews (spam-guard item 6). Render a template before calling its markup missing (`NO_JSONLD_STATIC`).
3. **Category pages.** An intro that helps choose: what separates the products here, who each kind suits, how to pick a size or material, in the brand's own words. Filters, sorting and search: a filter combination is indexable only when people search for it (a Search Console query or the live results show it; never assumed demand). Every other combination gets a canonical to the unfiltered category or noindex. Combinations without end (sort orders, tracking parameters, internal search, cart) are blocked from crawling in robots.txt (a proposal, with the old file saved first). Never both on one URL: a robots block hides the noindex (`NOINDEX_BLOCKED`).
4. **Out of stock and discontinued.** Out of stock for a while: keep the page, say when it returns (`[ADD: the real restock date]`; never a guessed date), keep availability in the markup true. Discontinued: 301 to the closest real replacement, or 410 when none exists. Never all of them to the home page. A redirect or a removal is a live change the owner approves.
5. **Duplicate manufacturer descriptions.** Find them with `DESCRIPTION_DUPLICATE`, `TITLE_DUPLICATE` and a quoted distinctive sentence in the live results. Rewrite the top sellers first (by the owner's sales data or connector, else by Search Console clicks, else by `inlinks` labelled inferred), by `references/writing.md`: what it is for, fit, material and care, `[ADD: ...]` for what only the owner knows.
6. **Feeds and free listings.** The product data sent to Merchant Center, free listings included (price, availability, title, images), matches the product page; a mismatch is a defect on whichever side is wrong. Read the diagnostics when access exists, otherwise write "feed not read".
7. **Catalog edits in approved batches.** A batch is 20 to 25 products (judgment). The originals are saved first, as `<out>/originals/YYYY-MM-DD-batch-N.csv` (URL, field, current text); the new text sits beside them in `<out>/batches/YYYY-MM-DD-batch-N.md`. A batch holds titles, descriptions, meta text, alt text and category intros only: never price, inventory or availability fields. The owner reviews the batch, then it is applied through the platform admin or a connector. One variable per batch and an unchanged comparable group as the control (`references/measurement.md` section 6).
8. **Agentic commerce, as an option.** Google's agentic checkout runs on the Universal Commerce Protocol: launched in the US, with Canada, Australia and then the UK announced later and Israel not in the announced list (facts.md, 2026-01-11 and 2026-05-20). ChatGPT discovers products from merchant feeds under the Agentic Commerce Protocol, onboarding approved partners (facts.md, 2026-03-24); coverage by country is not in facts.md: write "unknown; read OpenAI's live page" for the ChatGPT feed regions until the live page has been read. For a store outside the announced regions, promise neither: what the owner controls is a clean feed and an accurate price, availability and product identifier on the page.

## Decide

- Order: site-wide blocks and crawl traps, then template defects (markup, canonicals; one template fix reaches every product), then top sellers, then the long tail. Rank by clicks or sales at stake, never by number of pages.
- A product or category page in positions 1 to 3, or with steady clicks, changes only after a diagnosis that says why.
- Judge search and sales together: a rise in clicks without more orders is not a win (SKILL.md section 6); if the purchase event is not named, setting it up is part of the first recommendation.
- Index what has demand and a reason to exist; everything else is canonicalized, noindexed or blocked, and the sitemap lists only indexable canonical URLs.

## Output

- The report (`references/report.md`): verdict, 1 to 3 actions, what else was checked. Batches, originals and the filter plan go in `<out>/batches/`, `<out>/originals/` and `seo/reports/YYYY-MM-DD-ecommerce.md` (scratch folder when the project file was declined).
- Project file, when agreed: a `baseline.md` row for the batch pages and the control group before the change; `changelog.md` after the owner approves, with old and new text, judge-on date and revert rule; `decisions.md` for which filters stay indexable and why.

## Never

<!-- myths -->
- Product markup with ratings that are not on the page, or review markup the store wrote about itself.
- Redirecting every discontinued product to the home page, or deleting out-of-stock pages that will return.
- Leaving filter combinations without demand indexable, or one landing page per filter combination.
- A batch that touches price, inventory or availability.
- Mass AI-written descriptions that no person checked (spam-guard item 4, facts.md 2026-10-01).
- Promising agentic checkout, a ChatGPT listing or AI shopping features where availability is not confirmed (ChatGPT feed regions: unknown; read OpenAI's live page).
<!-- /myths -->

## Without data

The crawl, the schema check and the live results carry steps 1 to 5. Say once what is missing: Search Console would show which products and categories bring clicks (the order of the rewrite), the store's sales data would define the top sellers, Merchant Center diagnostics would show feed errors. Label every priority that rests on the crawl alone as inferred.
