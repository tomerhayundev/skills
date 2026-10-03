# Data sources

Use the best data the user already has. Optional sources add precision; none is required, and the job never blocks on one.

## 1. Order of preference

1. **The owner's own data:** a Search Console export or access, Bing Webmaster Tools, analytics, CRM or sales records.
2. **Free public checks:** the live site, `robots.txt`, live results pages checked by hand with the conditions recorded (query, country, language, device, date), PageSpeed Insights, and the crawl (`<skill>/scripts/crawl.mjs`).
3. **Paid tools the user already has.** Never suggest buying one just for this.

The crawl reads raw HTML without JavaScript and obeys `robots.txt`. `--ignore-robots` is for the user's own site only; ask first (SKILL.md section 1).

## 2. Search Console exports

- In Performance: Export > CSV. The download is a zip; unzip it into a folder.
- The folder holds Queries, Pages, Countries, Devices, Search appearance and Chart (dates). `gsc-analyze.mjs` analyses Queries, Pages and Chart; it recognises but does not analyse the others.
- The export is capped at 1,000 rows. The script calls a 1,000-row export incomplete, so say so in the report. For query and page pairs, or for more rows, use the API, Looker Studio or a connector (section 3).
- Hebrew interface exports work as they are; do not translate the headers. Exports written with decimal commas or semicolon separators (some other locales) are not supported: have the owner export in English or Hebrew.
- Run: `node <skill>/scripts/gsc-analyze.mjs <export-folder> --brand "brand name"`. Add `--compare <older-export-folder>` to find decay.
- In Git Bash a path that starts with `/` is rewritten into a Windows path. Write it without the leading slash, or put `MSYS_NO_PATHCONV=1` in front.
- Data breaks and caveats: measurement.md.

## 3. Optional connectors

Never required, and never assumed connected: use one only after a call to it has succeeded, and say in the report which were used.

- **Chrome DevTools MCP:** the rendered page and performance traces. Use it when a page needs JavaScript, since the crawl sees raw HTML only.
- **A Search Console MCP:** read-only scope. It fills the gaps of the export (more rows, query and page pairs).
- **Ahrefs, Semrush or DataForSEO** (through OpenSEO or directly), when the user already pays. Their volume and difficulty numbers are tool estimates: label each with the tool and the date. Difficulty scores from different tools are not comparable. Google says no third-party tool has access to its internal ranking data or AI systems (2026-06-05).

## 4. Hebrew keyword data

Keyword tools undercount Hebrew. The prefixes ו, ה, ב, ל, מ, ש and כ attach to the word, so one phrase splits into many forms. Group the variants before reading volume. When volumes show zero, use Search Console queries and customer language (writing.md rule 7).

## 5. Keys

Never paste an API key into a file or into chat. `cwv.mjs` reads `PSI_API_KEY` and `CRUX_API_KEY` from environment variables only, and does not print or save them.

- Lab data (PageSpeed Insights) works without a key at low volume. INP has no lab value; the report shows total blocking time as a stand-in and never calls it INP.
- Field data (CrUX) needs `CRUX_API_KEY`. Without it the report says field data was not fetched and points to Search Console > Core Web Vitals.
- PageSpeed Insights tests from Google's servers, so it cannot reach localhost.
