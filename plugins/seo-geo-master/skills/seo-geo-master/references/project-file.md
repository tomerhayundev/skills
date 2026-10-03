# The project file

Kept in the user's project as `seo/` (or `~/.seo-geo/<domain>/`). Ask once before creating it. Update it as the last step of every job. Plain Markdown; dates as YYYY-MM-DD.

## Folders the jobs create

Beside the four files below, jobs add folders to `seo/` when they need them: `reports/` (one dated report per job, `YYYY-MM-DD-<job>.md`), `briefs/` (content briefs, `<slug>.md`), `migration/` (the inventory, the redirect map and the redirect checks), `monitor/` (one dated folder per monitor run), `originals/` (the text as it was, saved before an approved batch is applied), `batches/` (the new text for an approved batch), and the file `content-plan.md`. Script runs write their own folders (`crawl`, `robots`, `schema`, `gsc`, `cwv-*`, `page` and similar), one per run: a run replaces what its folder holds, so give separate runs separate folders. When the owner declined the project file, the same folders live in the scratch folder.

## brief.md

    # <site> brief
    Updated: YYYY-MM-DD
    - Business: what it sells, to whom, where (countries, cities, languages)
    - Offer and difference, in the brand's own words (quote the site)
    - Audience and the questions they ask before buying (with where each came from)
    - Money pages (role: money / hub / supporting): URL, what a conversion is, its tracking event name or "none yet"
    - Competitors in search (who ranks or gets cited) vs competitors in business (who customers compare); keep them apart
    - Voice: words they use, words they never use
    - Data access: Search Console (yes/no, property type), Bing Webmaster Tools, analytics, keyword tool, CMS and how changes are made
    - Stage: new / growing / mature / in trouble, and why

## baseline.md

    | Date | Page | Clicks (28 d) | Impressions (28 d) | CTR | Position | Conversions (28 d) | Source |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    Rows are added before a change, never edited later. "unknown" is a valid value.

## changelog.md

    ## YYYY-MM-DD <page or site area>
    - Change: what exactly changed (old and new text for titles or copy)
    - Why: the evidence, and the decision it came from (link to decisions.md)
    - Baseline: link to the baseline row
    - Judge on: date (at least 2 weeks later; usually 4 to 6)
    - Revert if: the rule written before the change
    - Result: filled in on the judge date (search and business)

## decisions.md

    ## YYYY-MM-DD <decision>
    - Chose: X over Y and Z
    - Because: the reason and the evidence
    - Review when: a date or a trigger
    - Open flags: anything not confirmed, written as a flag, never as a guess
