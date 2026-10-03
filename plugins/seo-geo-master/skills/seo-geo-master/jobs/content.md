# Content

## When

Keywords, a content plan, a brief, "what should we write about", or writing or rewriting an article or page. One page that will not rank is `jobs/page.md`; growing queries and pages that already rank, from Search Console data, is `jobs/grow.md`.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md` (with no project file, build the brief from the site's own words, SKILL.md section 1), `decisions.md` for topics already chosen or rejected, and `content-plan.md` if it exists.
- Real queries, when a Search Console export exists: `node <skill>/scripts/gsc-analyze.mjs <export dir> --brand "<brand names>" --out <out>/gsc`. Add `--query-page <file>` when a query and page export exists, to see pages that share a query.
- A keyword tool export, only if the owner already has one. Volume and difficulty are tool estimates: label the tool and the date; difficulty from different tools is not comparable.
- The crawl, from intake or audit, wherever it is (the scratch folder or `<out>/crawl`): `pages.csv` titles and word counts and `DUPLICATE_INTENT_CANDIDATE`, to know what the site already says. When no crawl exists, run `node <skill>/scripts/crawl.mjs <url> --max 60 --out <out>/crawl` first.
- Customer language: the site's own reviews, public forums and groups, and support messages already in the project. Note where each phrase came from. Never ask the owner to collect it.
- The live results for each target query, with query, country, language, device and date.
- `references/writing.md` for every text written; `references/spam-guard.md` before any plan that adds many pages.

## Steps

1. **Real data only for demand.** Search Console queries, a tool the owner already pays for, customer language. When tools show zero (common in Hebrew, where prefixes attach to words and split one phrase into many forms), group the variants first (`references/data-sources.md`), then let Search Console queries and customer language decide.
2. **Intent and stage.** Classify each query: learn, compare, buy or find a brand, and its funnel stage. Flag ambiguous intent and read the live results before choosing a page type.
3. **Three lists.** A: quick wins sized to the site's authority (queries it nearly ranks for, buyer questions with weak results). B: authority builders, harder topics worth building toward. C: not now, each with its reason. A new site starts with one offer page plus one supporting page that answers a close question (SKILL.md section 5).
4. **Topical map.** A few pillars (the offers and the core problems) with clusters under them. If the same URLs rank for two queries, the queries belong on one page.
5. **Rework or build.** Run the duplicate-intent check first: `DUPLICATE_INTENT_CANDIDATE` from the crawl, then by hand the reversed pairs ("A vs B" and "B vs A") and naming drift (one thing under two names or spellings). Prefer reworking a thin page that already ranks 8 to 20 over a new page. Build only when no existing page can honestly hold the intent.
6. **Brief from the live results.** Per target, write: what every top result covers (table stakes); what one or two cover (angles); what none cover that a buyer wants (the gap); the questions people ask (results, related searches, customer language); the format and length that rank, observed and never a target; the first-hand items to ask the owner for, as `[ADD: ...]` placeholders.
7. **Write** by `references/writing.md`: answer first, specifics with sources, owner-only experience as placeholders, protected fields true to the body.
8. **Editor pass.** The four questions and the 5 to 10 quoted edits of writing.md rule 8, before handing anything over.
9. **Publish checklist.**
   - Duplicate check done.
   - Every fact traced to a primary source.
   - One element a reader cannot get from the top results (first-hand experience, original data, a worked example).
   - Honest attribution and disclosures; affiliate links disclosed at the link.
   - Title and meta description true to the body; schema matching the visible content.
   - Inbound internal links added at publish time; a new page nothing links to is an orphan.
   - A person fact-checks AI-assisted text before it goes live, titles, descriptions, structured data and alt text included (Google, 2026-10-01).

## Decide

- Buying-intent topics before curiosity topics. Fewer, better pages.
- Size each target to the site's authority: where the live results are all large, established sites, a small site's entry goes to list C with that reason.
- When every live result is a page type the site cannot honestly offer, the topic goes to list C.
- A priority without Search Console or tool data is labelled inferred, and the order is a proposal.
- A new topic that overlaps an existing page is a rework of that page, not a second page.

## Output

- The lists and the map in `seo/content-plan.md` (scratch folder when the project file was declined); each brief in `seo/briefs/<slug>.md`; drafts only on request, saved beside their brief.
- The report (`references/report.md`) stays short: 1 to 3 actions, the first topic or page to do and why. The full plan is the file; the chat says where it is.
- Project file, when agreed: a `decisions.md` entry (chose these topics over those, because, review when). For a page published or reworked: a `baseline.md` row first, a `changelog.md` entry after the owner approves.

## Never

<!-- myths -->
- Invented search volumes or difficulty scores: unknown is written as unknown, with what would fill it.
- A page per keyword variant, or per query fan-out variation.
- Mass AI pages, or any batch of pages written without a person checking each.
- Word-count targets, keyword density or "LSI keywords".
- Filling an `[ADD: ...]` placeholder with a guess, or inventing an expert, quote, study or review.
<!-- /myths -->

## Without data

Use customer language and the live results, and label every priority as inferred. Say once, in "How this was made", that Search Console queries would replace the guesses with measured demand. The plan still ships: a proposal the owner can approve, with the first brief written.
