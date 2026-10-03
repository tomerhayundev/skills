# Grow

## When

The site already ranks and the ask is to grow it, or Search Console data exists: page-two queries, low click-through, pages that slowly lose clicks, two pages competing for one query. A sudden drop goes to `jobs/drop.md` first; a slow decline over months stays here.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, write export paths without a leading `/`, or start the command with `MSYS_NO_PATHCONV=1`.

- `node <skill>/scripts/gsc-analyze.mjs <export dir> [--compare <older export dir>] [--query-page <file>] [--brand "<brand names>"] --out <out>/gsc`. The export is the unzipped Performance export folder (`references/data-sources.md`). The older folder for `--compare` covers an equal period. `--brand` keeps brand queries out of the CTR curve.
- Read `<out>/gsc/gsc.md` in this order: data breaks, drop check, striking distance, the site's own CTR curve, low CTR, decay, cannibalization. An export of 1,000 rows or more is incomplete: say so in the report.
- `seo/brief.md` (money pages, conversion events), `baseline.md`, `changelog.md` and `decisions.md` for what was already tried.
- Before any rewrite: the page itself (`node <skill>/scripts/crawl.mjs <url> --max 1 --out <out>/page`) and the live results for each query a change targets, with query, country, language, device and date.
- `references/measurement.md` for change windows and the data breaks.

## Steps

1. **Data first.** Read the data breaks.
   - Impressions, CTR and position are wrong from 2025-05-13 to 2026-04-27 (clicks are fine). Impressions fell around mid-September 2025 as a measurement change, not lost visibility (`data/data-breaks.json`). The newest 2 to 3 days are incomplete. Across a break, judge by clicks and say so.
   - Drop check, as `gsc.md` prints its verdict (the value in `gsc.json` follows in parentheses): "a possible real drop" (`drop.verdict` is `possible-drop`) stops this job and goes to `jobs/drop.md`; "no sustained drop in clicks" (`no-sustained-drop`) continues here, also when it adds "a dip that recovered" (`drop.recovered` is true); "Early drop" (`drop.early` is true) means the last complete week is down but the window is not yet: check again in a week.
2. **Striking distance.** Positions 4 to 7: title and snippet work. Positions 8 to 20: content depth and internal links (`jobs/links.md`). Choose by impressions, above the floor the script states. Positions 1 to 3 wait for a diagnosis.
3. **Low CTR against the site's own curve**, ranked by clicks lost. Check why in the live results before rewriting:
   - Google rewrote the title: fix the cause (usually a title that disagrees with the H1 or the body, or is generic; judgment), do not just reword it.
   - An AI answer or another feature absorbs the click: position holds while clicks fall. Watch it; do not rewrite.
   - Intent mismatch: the page answers a different question than the query asks (`jobs/page.md` step 2).
   - A generic or truncated title (judge on the live result) or a stale year in the title or snippet.
4. **Decay**, with `--compare` on equal periods. The other columns point to the cause: impressions falling means demand or lost visibility, position falling means ranking, clicks falling alone means CTR or the result page.
   - Hypotheses: outdated content, a stronger competitor, an intent shift, cannibalization, an AI answer now answering the query.
   - Check each before acting: dates and figures on the page, who moved up and why, whether the result format changed, the query and page data, whether an AI answer now shows.
   - A "gone" page may only be renamed; the script warns when URL forms changed.
5. **Cannibalization**, only from query and page evidence (`--query-page`). Different URLs on one query can serve different intent, so read both pages first. Where two pages split one intent, keep the stronger page on merit (clicks, position, conversions, links in), move what is useful from the other into it, and 301 the other after the owner approves.
6. **Title and snippet changes follow the safety protocol.** A handful of comparable pages (judgment), lowest impressions first, one variable, a control group of comparable unchanged pages, 4 to 6 weeks (judgment), then keep, iterate once, or revert to the logged text. Write the revert rule and take the baseline before the change.

## Decide

- A click gain with a position drop, or a CTR rise from falling impressions, is not a win. Judge search and business together: a page that rose without more conversions did not win.
- Work in order of measured clicks at stake. Shortlist from at least three kinds when the data allows (SKILL.md section 7) and recommend 1 to 3.
- Do not judge a change under 2 weeks; rankings usually move in 2 to 4 weeks and settle in 4 to 6 (judgment, SKILL.md section 6). Compare equal periods with the same weekdays, never the newest 2 to 3 days.
- A move smaller than the site's normal week-to-week swing, from the weekly table in the drop check, is noise (judgment).

## Output

- The report (`references/report.md`): verdict, 1 to 3 actions, each with the metric, the date to judge and the revert rule. "What else we checked" names every section of `gsc.md` that gave nothing to act on and every candidate deferred, with the reason.
- Every change is logged with its baseline. Project file, when agreed: a `baseline.md` row before the change; a `changelog.md` entry after the owner approves, with the old and new text, the pages in the pilot and in the control group, the judge-on date and the revert rule; `decisions.md` for what was chosen over what, and open flags.

## Never

<!-- myths -->
- Touch pages in positions 1 to 3, or pages with steady clicks, without a diagnosis that says why.
- Batch-rewrite titles.
- Compare periods across a data break without saying so, or read impressions, CTR or position inside one as fact.
- Import an outside CTR benchmark: the site's own curve is the yardstick.
- Merge or redirect pages on a title resemblance alone.
- Count a drop in impressions in mid-September 2025 as lost visibility.
<!-- /myths -->

## Without data

This job needs Search Console. Say so, and switch to `audit` (crawl and live checks) or `content` (customer language and live results). Do not guess positions, CTR or clicks.
