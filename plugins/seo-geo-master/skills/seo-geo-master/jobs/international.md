# International

## When

A site in more than one language or country, hreflang, a translated or "global" version, a Hebrew or right-to-left site, "the wrong language shows in Google". Moving markets onto new domains is `jobs/migration.md` as well.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md`: the markets (country and language, not language alone), which are real targets, who writes each language.
- `node <skill>/scripts/crawl.mjs <url> --max 200 --out <out>/crawl`. Read the `HREFLANG_*` findings (`HREFLANG_BAD_CODE`, `HREFLANG_IW`, `HREFLANG_NO_SELF`, `HREFLANG_TARGET_NOT_200`, `HREFLANG_NO_RETURN`), then `CANONICAL_POINTS_ELSEWHERE`, `CANONICAL_TARGET_NOT_200`, `SITEMAP_URL_*` and `LANG_MISSING`. `crawl.json` holds each page's `lang`, `dir` and hreflang set (under `facts`). The crawl reads hreflang from HTML link tags only: when the site uses the sitemap or an HTTP header, read those by hand, and a clean crawl then proves nothing.
- A Search Console export (`gsc-analyze.mjs ... --brand`), plus the Countries file read by hand for clicks by country. Hebrew headers work as they are.
- The live results in each market: the query written in that language, with country, language, device and date; count positions by hand.
- `references/data-sources.md` section 4, `references/writing.md` rules 7 and 12, `references/facts.md` (International and site moves, and Hebrew and Israel).

## Steps

1. **Markets and versions.** From the brief and `pages.csv`, a table: language and country, URL pattern, audience, and whether each page exists in each version. A version is a real page with real content in that language, not a stub.
2. **Hreflang.**
   - Each page lists itself (`HREFLANG_NO_SELF`) and every alternate, and each alternate lists it back (`HREFLANG_NO_RETURN`: if two pages do not both point to each other, Google ignores the tags; facts.md, 2026-09-21).
   - Valid codes only: a language alone (`he`, `en`) unless a country variant really exists (`en-GB`). `x-default` is the fallback for visitors whose language matches no version: Google designed it for a language selector page and also suggests it for an auto-redirecting home page (facts.md, 2026-09-21). Hebrew is `he`, never `iw` (`HREFLANG_IW`).
   - Every alternate answers 200 with no redirect (`HREFLANG_TARGET_NOT_200`).
   - A translated page's canonical points to itself, never to another language (`CANONICAL_POINTS_ELSEWHERE`: Google will usually index the other URL instead).
   - One method per site, as a consistency practice (judgment): HTML link tags, an HTTP header or the sitemap. Google treats the three as equivalent and sees no benefit in using several (facts.md, 2026-09-21), so name the one in use and check that no other method says something different.
   - Where hreflang, canonical and sitemap disagree, decide what the owner means, then change the others to match (`jobs/audit.md` step 2).
3. **URL structure.** Subfolders on one domain by default (`/he/`, `/en/`). Subdomains or country domains only for a reason the owner names, such as legal, hosting or separate teams (judgment). Changing the structure of a working site is `jobs/migration.md`, never an edit.
4. **Localization, not translation.** Per market: keyword research from that language's Search Console queries and customer language (not a translated keyword list), local prices and currency, units, date and phone formats, local examples, shipping and legal details. Machine translation: treat it like other automated content (an inference from Google's AI-content guidance, since the multi-regional page does not mention translation): allowed when it helps people, a person fact-checks it before it goes live, and a whole site translated without added value risks scaled content abuse (facts.md, 2026-08-28 and 2026-10-01). A chooser or links may suggest a version; never force a redirect by location or browser language: Google says to avoid automatically redirecting users between language versions, since that could keep users and search engines from seeing all the versions, and that Googlebot usually crawls from the USA without Accept-Language (facts.md, 2025-12-10).
5. **Hebrew and right-to-left.**
   - `<html lang="he" dir="rtl">` on every Hebrew template; read `lang` and `dir` per page in `crawl.json`. An English page on the same site is `lang="en"` with `dir="ltr"`. These attributes are for browsers, screen readers and right-to-left layout; Google decides a page's language from its visible text (facts.md, multi-regional sites), so the text itself must be in the page's language.
   - Mixed Hebrew and English titles and snippets: check them in the live results, not in the source, because brand names, numbers and punctuation can flip at the line end. Prices, phone numbers, dates and units inside Hebrew text: check they read in the right order on the page; wrap a fragment that flips in an element with `dir="ltr"` (or `<bdi>`).
   - Prefixes: ו, ה, ב, ל, מ, ש and כ attach to the word, so one phrase splits into many forms and keyword tools undercount (the same noun as ספר, הספר and בספר). Group the variants before reading volume. Low or zero tool volume is not zero demand: Search Console queries and customer language decide (data-sources.md section 4).
   - Slugs: Hebrew slugs are valid and readable; transliterated Latin slugs are shorter to share. Pick one and stay consistent; changing later is a migration. In sitemaps, logs and pasted links a Hebrew URL appears percent-encoded, as a run of `%XX` groups per letter, so compare URLs in one form (both decoded or both encoded) before calling two of them different.
   - AI Overviews and AI Mode are available in Israel and in Hebrew (facts.md). Ask Maps, Google's agentic checkout and Merchant Center AI insights are not announced for Israel: do not promise them.
   - Hebrew copy is written naturally for the reader, not translated word by word (writing.md rule 12).
6. **Check each market live.** Search in each country and language: does the right version show. A wrong-language version ranking points first to hreflang and canonicals, then to a version that does not exist. Report clicks by country from the Countries file.

## Decide

- Signal conflicts first (missing return tags, canonicals to another language, redirected alternates): they sit on every page of a template. A new language comes only where a real audience and a person to maintain it exist (judgment); a version made of stubs is not published.
- Hreflang and canonical fixes are template changes: one proposal per template, judged on `references/measurement.md` section 6 windows, with the old tags saved first.
- Hreflang links equivalent pages in different languages or regions; it does not merge pages with different content.

## Output

- The report (`references/report.md`), in the owner's language. The hreflang map as a table (page, hreflang value, URL) and the exact tag block for one template, saved with the originals in `seo/reports/YYYY-MM-DD-international.md` (scratch folder when the project file was declined); the chat says where.
- Project file, when agreed: a `baseline.md` row for the pilot template's pages before the change; `changelog.md` after the owner approves; `decisions.md` for the URL structure, the slug choice and the one hreflang method.

## Never

<!-- myths -->
- `iw` instead of `he`, or a made-up language or country code.
- Hreflang pointing to a redirecting or erroring URL, or a canonical pointing to another language.
- Hreflang in more than one method on one site: Google sees no benefit in several, so keep one for consistency (judgment; facts.md, 2026-09-21).
- An automatic redirect between versions by IP address or browser language (Google says to avoid it; facts.md, 2025-12-10).
- A whole site machine-translated with no person checking it.
- English search volumes applied to Hebrew, or a zero in a keyword tool read as no demand.
- Promising Ask Maps, agentic checkout or Merchant Center AI insights to a business in Israel.
<!-- /myths -->

## Without data

The crawl and the live results carry steps 1 to 4 and 6. Say once that Search Console would add clicks by country and the query language people actually use, and that keyword tools in Hebrew undercount, so demand is written unknown rather than zero. Label priorities that rest on the crawl alone as inferred.
