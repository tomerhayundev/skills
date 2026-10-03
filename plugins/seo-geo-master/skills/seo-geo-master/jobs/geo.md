# GEO

## When

Any ask about AI answers: "show up in ChatGPT", AI Overviews, AI Mode, Gemini, Perplexity, Claude, Copilot, AI crawlers, llms.txt (not a ranking or citation lever), "AI visibility". `jobs/audit.md` runs steps 1 to 4 below as its GEO basics.

## Read and run

`<skill>` is this skill's folder. `<out>` is `seo` when the owner agreed to the project file, else the scratch folder. In Git Bash, start any command whose path begins with `/` with `MSYS_NO_PATHCONV=1`.

- `seo/brief.md`: the buyers' questions, the languages, and who competes in search against who competes in business.
- `node <skill>/scripts/robots-check.mjs <url> --paths /,<money page>,<money page> --out <out>/robots`. Read the table by purpose (search, training, user, agent), then `CORE_SEARCH_BLOCKED`, `SEARCH_CRAWLER_BLOCKED`, `SEARCH_BLOCKED_TRAINING_ALLOWED`, `CLOUDFLARE_MANAGED`, `ROBOTS_IS_HTML`. `ROBOTS_NOT_CHECKED` is a limit of the check, not a finding about the site.
- The crawl (`node <skill>/scripts/crawl.mjs <url> --max 60 --out <out>/crawl`, or the one from intake or audit) for `CONTENT_NEEDS_JS`, `HTML_OVER_2MB` and `KEY_TAGS_AFTER_2MB`; `node <skill>/scripts/schema-check.mjs --from-crawl <out>/crawl/crawl.json --out <out>/schema` for Organization and LocalBusiness markup.
- `references/measurement.md` for the sampling protocol, `references/facts.md` for every date below, `references/spam-guard.md` before any off-site advice, and whenever the owner asks about FAQ markup or llms.txt: give the reason with its date (FAQ rich results ended 2026-05-07; Google Search ignores llms.txt, per a note Google added on 2026-06-15; a study of about 300,000 domains found no effect of llms.txt on AI citations, 2025-11-07; facts.md). The crawler list is `data/crawlers.json`.

## Steps

1. **Google's position first.** Google says AI Overviews and AI Mode are rooted in core Search ranking, retrieve from the Search index, and that optimizing for them is still SEO. A page is eligible when it is indexed and can show a snippet; Google lists no other technical requirement (facts.md, 2025-12-10 and 2026-07-10). Fix indexing and ranking first (`jobs/audit.md`, `jobs/page.md`).
2. **Access.**
   - Search crawlers must be allowed on the pages that matter: Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot, Meta-WebIndexer. A change to robots.txt takes about 24 hours to reach ChatGPT search.
   - Training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, CCBot) are the owner's choice and do not decide citations. Google-Extended controls Gemini training and grounding only.
   - Edge rules: Cloudflare's AI Crawl Control "Block" also blocks Googlebot, Bingbot and Applebot since 2026-09-15; "Disallow AI Training" keeps search open. `robots-check` reads robots.txt only, and the crawler identifies as seo-geo-master, so CDN or firewall rules aimed at other bots cannot be seen from here. When `CLOUDFLARE_MANAGED` shows, or the crawl hit `RATE_LIMITED` or `SITE_UNAVAILABLE`, put the edge setting and the value to use in the proposal for the owner to approve; otherwise write "edge rules not checked" in "How this was made".
   - Search Console's Search generative AI setting (since 2026-08-31): default advice is to stay included. If the site is excluded, absence from AI Overviews, AI Mode and Discover generative features is a choice, not a defect. Without access, its state is unknown.
   - Snippet controls limit AI use too: `nosnippet`, `max-snippet`, `data-nosnippet`. The robots meta tokens and `X-Robots-Tag` are saved per page in `crawl.json`; look for `data-nosnippet` in the raw HTML.
3. **Readable.** Main content in the raw HTML, key tags in the first 2 MB (Googlebot reads the first 2 MB of HTML, headers included), nothing important behind tabs or scripts. Google renders JavaScript; most AI crawlers do not (judgment, not in facts.md), so content that exists only after scripts run may be invisible to them. Confirm in a browser before concluding.
4. **Entity clarity.** One consistent name, address, phone, hours and description wherever the business appears: site, Business Profile, Bing Places, social profiles, directories. An about page that says who is behind the business. Organization or LocalBusiness markup with `sameAs` links to real profiles is optional clarity, not an AI lever (Google lists no special markup as needed, 2026-07-10); it must match the page.
5. **Citable content.** Specific facts with sources, original data, clear comparisons, prices where the business can state them, answer-first sections (`references/writing.md`). Cover the buying journey: problem, use cases, comparisons, pricing, alternatives, objections, case studies, implementation. One page per real question, never one per fan-out variant.
6. **Off-site presence engines draw on.** Real reviews, listings, genuine community answers under the real name, YouTube, earned media. For a small brand, be the best source in its language for one specific question. Mentions correlate with AI visibility; that is a correlation, not a cause (facts.md, 2025-12-12).
7. **Measure.**
   - Search Console Generative AI report: impressions only, by page, country, device and date; no queries, clicks or CTR. Read which pages appear and which buying-journey pages never do.
   - Bing Webmaster Tools AI Performance (verified site needed): citations, cited pages and grounding queries, a sample, no clicks.
   - GA4 "AI Assistant" channel: a floor, since a visit without a referrer lands in Direct. A backstop channel is a proposal for the owner, never a setup.
   - Server logs only when the owner already has them; verify a bot by the operator's IP list or reverse DNS, never by user agent.
   - Sampling, run by the agent, and only when it has a browser or a connected tool (otherwise see Without data): write 10 to 30 buyer questions (judgment) from `brief.md` before looking at any answer, run each 5 to 8 times (judgment; the 2026 survey in facts.md recommends 7 to 8) per engine the buyers use (ChatGPT, Gemini or AI Mode, Perplexity, Copilot, Claude; a small site: 10 questions, 3 engines, 7 runs, judgment), in a fresh session each time, logged out where possible (`references/measurement.md`), log mentioned, cited and recommended separately, report the frequency with the pass and run count ("cited in 3 of 8 runs"). Never one score.

## Decide

- Access and readability defects first: they are binary and block everything after them. Then entity consistency, then content, then off-site work last, and only real work.
- A block the owner chose (training opt-out, an excluded AI setting) is reported as a choice, not a defect.
- Frequencies are observations, not rankings. Differences at these run counts are noise (judgment); never compare a partial sample with another month.
- Promise the process, never a result: Google says no third-party tool has access to its internal ranking data or AI systems (facts.md, 2026-06-05).

## Output

- The report (`references/report.md`) in the owner's language; the evidence labelled measured, estimate or inferred.
- The question list and the first sample, as run blocks, saved in `seo/reports/YYYY-MM-DD-ai-sampling.md` (scratch folder when the project file was declined; the chat says where). Repeat monthly with the same list; link the file from the changelog entry it will help judge.
- A robots.txt or CDN change is a proposal with the old file saved first; log it in `changelog.md` only after the owner approves.

## Never

<!-- myths -->
- AI visibility scores or any single number for "GEO".
- llms.txt as a lever: optional and harmless if the owner wants the file for agents, never promised to help.
- FAQ markup for AI, special AI markup, or chunking rules for AI.
- Fan-out page farms: a page for every query variation.
- Astroturfing: manufactured mentions, fake forum answers, planted "best of" lists.
- Blocking Google-Extended to leave AI Overviews.
- Treating your own answer, or Claude's, as a sample of what ChatGPT or any engine shows.
- Promising citations, rankings or traffic.
<!-- /myths -->

## Without data

Access, readability and entity checks need no data. Sampling runs when the agent has a browser or a connected tool; without one, say AI visibility was not sampled this time and offer the question list and the log template as an optional extra, never a requirement and never a request to paste answers. Without Search Console or Bing Webmaster Tools, say once which AI reports were not read.
