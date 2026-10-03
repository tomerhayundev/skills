# Links

## When

Internal links, orphan pages, "what links to us", backlinks, disavow, link building, outreach. A page that will not rank goes through `jobs/page.md` first, and links come last there.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, write export paths without a leading `/`, or start the command with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md`: which pages are money pages, hubs and supporting pages. With no project file, infer the roles from the site's navigation and the offers, and label them inferred.
- A crawl that read every page: `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl` (or the one from intake or audit; raise `--max` when it stopped at its cap). `pages.csv` gives `inlinks` per page; `crawl.json` gives every internal link with its anchor text under `facts.links` (href, text, rel, internal). `inlinks` counts only the pages the crawl read, so it is a floor. `ORPHAN_PAGE` appears only when the crawl read everything and the page is in the sitemap; otherwise `ORPHANS_UNVERIFIED` lists candidates. Also `BROKEN_INTERNAL_LINK` and `LINK_TO_REDIRECT`.
- When a Search Console export exists: `node <skill>/scripts/gsc-analyze.mjs <export dir> --brand "<brand names>" [--query-page <file>] --out <out>/gsc`. The striking-distance table of `gsc.md` lists queries, not URLs, so it cannot be joined to `inlinks`. Take page URLs instead: the rows of the export's Pages file at average positions 8 to 20 with impressions above the floor `gsc.md` states (read the file by hand), or, when a query+page export exists, the pages that carry those queries. Join those URLs to `inlinks` in `pages.csv`, after writing both in one URL form (protocol, www, trailing slash). A page's position is an average over all its queries.
- Backlink data only from what the owner already has: the Search Console Links report, or an export from a tool they pay for. A tool's numbers and toxicity scores are estimates: label the tool and the date.
- `references/spam-guard.md` items 1, 2 and 5 and `references/facts.md` (Google: spam and quality) before any off-site advice.

## Steps

1. **Page tiers.** Money pages (the offers and their conversion events), hubs (a topic's overview page), supporting pages (answers to close questions). This tiering is a working model (judgment), not a Google concept.
2. **Internal links.**
   - Every supporting page links up to its hub and to the money page it supports; hubs link down to their supporting pages; related pages link across.
   - Orphans get links from pages on the same topic. Pages averaging positions 8 to 20 that have few inlinks come first.
   - Anchors are descriptive and varied: they say what the target page is about, and they are never "click here" or the same exact phrase everywhere. Read the existing anchors in `facts.links` first.
   - Links point at final URLs: fix `LINK_TO_REDIRECT` and `BROKEN_INTERNAL_LINK` on the way.
   - A new page gets links from existing pages at publish time; a new page nothing links to is an orphan.
3. **Proposals for internal links.** Each is: on this page, in this sentence, link these words to that page; quote the old and the new sentence. Lowest-risk pages first, a pilot of a handful of pages (judgment), judged after 4 to 6 weeks (judgment) against comparable unchanged pages. Pages in positions 1 to 3 or with steady clicks are left alone without a diagnosis.
4. **Backlinks: risk and opportunity are separate questions.**
   - Risk: a tool's toxicity score is a filter for review, never a verdict. Read the actual links and where they come from. Disavow only clearly manipulative links that cannot be removed, or after a link-related manual action names them; prepare the file with the reason for each line and the removal attempts, and the owner uploads it after an explicit yes.
   - Opportunity: who links to the pages that rank for the site's queries, and what those pages offer that earns the link.
5. **Earning links.**
   - Linkable assets: original data, a tool or calculator, a template, a statistics page kept current, a glossary.
   - Unlinked brand mentions: find them in the live results (the brand name, excluding the site's own domain) and ask for a link.
   - Digital PR with a real story from the owner's own data, and real partnerships (suppliers, associations, events, local organizations).
   - Personalised outreach: each message refers to something specific in the target page, says in one sentence why the resource helps that page's readers, and every contact is listed with the source URL where it was found. Messages are drafts; the owner sends them.
   - Paid placements (sponsorships, sponsored posts) carry rel="sponsored" (facts.md, 2026-08-28).
6. **Measure.** Inlinks per target page before and after, clicks to the target pages after 4 to 6 weeks (judgment), referring domains gained from the Links report or the owner's tool. Promise the process, never a ranking (spam-guard item 16).

## Decide

- Internal links first: they need no one's permission but the owner's, and the crawl can verify them. Off-site work follows only after indexing, intent and content are sound (`jobs/page.md`).
- A new or small site earns links with one asset worth citing, not with outreach volume (SKILL.md section 5).
- Brand mentions correlate with AI visibility; that is a correlation, not a cause (facts.md, 2025-12-12), so it is a reason to be worth mentioning, never a tactic to manufacture them.
- A disavow file is a last step with a reason per line, never a clean-up for its own sake.

## Output

- The report (`references/report.md`): the first internal-link batch as exact sentence edits, then the link-earning idea that fits the site, with what else was checked. Longer lists go in `seo/reports/YYYY-MM-DD-links.md`, or the scratch folder when the project file was declined; the chat says where.
- Project file, when agreed: a `baseline.md` row (with inlinks noted in the Source column) for the pilot pages and the control group before the change, `changelog.md` after the owner approves, `decisions.md` for any disavow decision and its reason.

## Never

<!-- myths -->
- Buying links that pass ranking credit, or "authority placements".
- PBNs, link exchanges and tiered links.
- Mass outreach templates, or contacts with no source URL.
- Disavowing on a toxicity score alone.
- The same exact-match anchor on every link.
- Promising a ranking or a number of links.
<!-- /myths -->

## Without data

The crawl gives the site's own link structure in full, and the live results show unlinked mentions. Without the Search Console Links report or a backlink export, say once that who links to the site is unknown, and never estimate a count. Without an export, label the 8 to 20 position choice as inferred and pick the pages by topic and by money-page role.
