# Local

## When

A business with a place or a service area: "show up on Maps", "near me", Google Business Profile, reviews, opening hours, location or service-area pages. A set of near-identical town pages also goes through `jobs/scale.md`. A whole-site ask starts in `jobs/audit.md`.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md`: the places and areas served, the real name, address, phone and hours, the conversion events (calls, directions, bookings). With no project file, take them from the site's contact and about pages.
- The crawl, from intake or audit, or `node <skill>/scripts/crawl.mjs <url> --max 60 --out <out>/crawl`: location pages, `TITLE_DUPLICATE`, `DESCRIPTION_DUPLICATE`, `DUPLICATE_INTENT_CANDIDATE` (town-swapped pages show up as this), `inlinks` in `pages.csv`.
- `node <skill>/scripts/schema-check.mjs --from-crawl <out>/crawl/crawl.json --out <out>/schema` for LocalBusiness markup: `REQUIRED_MISSING`, `VALUE_NOT_VISIBLE`, `VALUE_UNVERIFIED`, `SELF_SERVING_REVIEW`, `NO_JSONLD_STATIC` (render the page before calling markup missing).
- The public listings in a browser (Google Maps, Bing Places): name, categories, hours, photos, description, links, reviews and the replies. The live results for the main "<service> <place>" query, with place, country, language, device and date; count positions by hand. Map results change with where the searcher stands, so one check is a snapshot.
- Business Profile insights (calls, directions, website clicks) and a Search Console export for branded queries (`gsc-analyze.mjs`, `references/data-sources.md`), only when they already exist.
- `references/facts.md` (Local, and Hebrew and Israel) and `references/spam-guard.md` items 4 and 6.

## Steps

1. **Business Profile first.** It is what a customer sees before the site. Draft the exact values; the owner applies them (propose, never publish).
   - Primary category: the strongest choice, the category that names what the business mainly is. Check the categories the top local results use, then pick the closest honest one.
   - Secondary categories only for real, separate services.
   - Hours, including holiday hours; services with a line each; real photos of the place, the team and the work (`[ADD: ...]` for what only the owner can supply); a description in the brand's own words (quote the site); booking or contact links that land where a visitor can act.
   - Q&A: the Business Profile Q&A API was discontinued on 2025-11-03 (facts.md). Whether Q&A has also left the listings themselves is unverified, so do not plan to seed Q&A. The answers customers look for belong in the profile, on the site and in review replies.
2. **One name, address, phone and hours everywhere.** Compare the site, the profile, Bing Places, social profiles and directories field by field in a table, with the source URL of each difference. The name is the one on the door and the invoices, with no keywords added. The owner says which version is right; the proposal corrects the others.
3. **Reviews.** Ask every customer the same way, with the same words and the same link, and never reward a review. Reply to every review, good or bad, in a few specific sentences with no private details; draft the replies for the owner to post. Never gate, filter or incentivize: Google's contribution policies prohibit incentivized or biased reviews, and a 2026 update is reported to bar asking only happy customers (a trade-press report of 2026-02-20, a secondary source; facts.md). Ratings a business publishes about itself in LocalBusiness or Organization markup earn no review stars (`SELF_SERVING_REVIEW`); leave rating markup off those pages and show real reviews as page content.
4. **Location and service-area pages**, only with real local substance: one page per real place, each with its own facts (projects done there with photos, local details only someone there knows, the staff who work there, local terms or prices, its own address and hours when it is a real location). The test: take the town name out; if the page still says the same thing, it is a template (judgment). Fold the failures into one stronger area page. Never a town-swapped copy (spam-guard item 4, `jobs/scale.md`).
5. **The site side.** LocalBusiness markup (or the fitting subtype) with name, address, phone and hours matching the visible page and the profile: optional clarity, not a ranking or AI lever (facts.md, 2026-07-10). Contact details as text, a call link and a directions link where visitors use them, and a named conversion event for each (SKILL.md section 6).
6. **Measure.** Business Profile insights (calls, directions, website clicks); branded queries in Search Console; and the GA4 link to the Business Profile (since 2026-06-08, facts.md), proposed when it is not set up because it changes the owner's analytics. It adds interactions, calls, bookings, directions, website clicks, messages and menus to GA4 reports for a rolling 6-month window only, so save the baseline numbers early. Ask Maps (Gemini in Google Maps) launched in the US and India on 2026-03-12 and is not announced for Israel (facts.md): do not promise it where it is not announced.

## Decide

- Order: wrong hours, phone or address first (it costs customers today), then the primary category, consistency across listings, reviews, pages, markup last.
- Judge by actions (calls, directions, bookings) against a baseline, not by map position: position moves with the searcher, so never promise one (spam-guard item 16).
- Set no review targets that push staff to ask only some customers.
- A profile edit and a page edit are separate changes with separate judge-on dates (`references/measurement.md` section 6).

## Output

- The report (`references/report.md`) in the owner's language. The profile proposal is a table: field, now, proposed, source. Reply drafts and the listing comparison go in `seo/reports/YYYY-MM-DD-local.md`, or the scratch folder when the project file was declined; the chat says where.
- Project file, when agreed: a `baseline.md` row before a change, with the profile's calls, directions and website clicks for the 28 days in the Conversions column and the source named; `changelog.md` only after the owner approves; `decisions.md` for the chosen primary category and the open flags.

## Never

<!-- myths -->
- Keywords added to the business name, or a name that differs between listings.
- Fake addresses, or an address that is not where the business works.
- Review gating, filtering or incentives, buying reviews, writing reviews for the business, or asking only happy customers.
- Town-swapped location pages.
- Rating markup the business writes about itself.
- Promising a map position, or Ask Maps, to a business outside its launch regions.
<!-- /myths -->

## Without data

The site, the public listings and the live results are enough for steps 1 to 5. Say once what Business Profile insights would add: whether calls, directions and website clicks moved after a change. Until then, judge by the site's named conversion events, or write unknown.
