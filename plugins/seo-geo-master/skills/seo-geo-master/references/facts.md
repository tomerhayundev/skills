# Facts ledger

Verified 2026-10-02 against primary sources unless a line says otherwise. Each fact ends with its source and that source's date. A fact older than about six months that drives a recommendation is re-checked against the live page first. When a session finds a fact wrong, fix it here first, with the new source.

## Google: how AI features work

- Google says AI Overviews and AI Mode are rooted in its core Search ranking and quality systems, retrieve pages from the Search index, and that optimizing for generative AI search is still SEO. Source: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (published 2026-05-15, updated 2026-07-10).
- To appear in AI features a page must be indexed and eligible to show with a snippet; Google lists no other technical requirement. Source: https://developers.google.com/search/docs/appearance/ai-features (2025-12-10).
- Google lists these as not needed for AI features: llms.txt or other AI text files, special schema or markup, chunking content, writing specially for AI, and seeking inauthentic mentions. Source: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (2026-07-10).
- Query fan-out: AI Mode issues several related searches at once across subtopics and combines the results. Source: https://blog.google/products/search/ai-mode-search/ (2025-03-05).
- Writing a separate page for every fan-out variation mainly to manipulate rankings or AI answers is scaled content abuse. Source: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (2026-07-10).
- AI features are controlled with the normal Search controls: robots.txt for Googlebot, noindex, nosnippet, data-nosnippet and max-snippet. Source: https://developers.google.com/search/docs/appearance/ai-features (2025-12-10).
- Google-Extended controls Gemini training and grounding only; it does not affect inclusion or ranking in Search, AI Overviews or AI Mode. Source: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers (2026-07-14).
- Since 2026-08-31 every Search Console property has a Search generative AI setting that can exclude the site from AI Overviews, AI Mode and Discover generative features; it is not a ranking signal and does not affect training. Source: https://blog.google/products-and-platforms/products/search/new-controls-website-owners/ (2026-06-03).
- AI Mode has over 1 billion monthly users and uses Gemini 3.5 Flash by default. Source: https://blog.google/products-and-platforms/products/search/search-io-2026/ (2026-05-19).
- Preferred sources, where users pick sites they want to see more of, works in all languages; Google reported it in AI Overviews and AI Mode from 2026-05-27. Sources: https://blog.google/products-and-platforms/products/search/preferred-sources-language-expansion/ (2026-04-30); https://blog.google/products-and-platforms/products/search/personalize-search-discover-news/ (2026-08-20).
- Google says no third-party tool has access to its internal ranking data or AI systems. Source: https://developers.google.com/search/docs/fundamentals/third-party-seo (2026-06-05).

## Google: spam and quality

- Google's spam policies cover attempts to manipulate generative AI responses in Google Search. Source: https://developers.google.com/search/docs/essentials/spam-policies (2026-05-15).
- Buying or selling links that pass ranking credit is link spam; paid links must carry rel="sponsored" or rel="nofollow". Source: https://developers.google.com/search/docs/essentials/spam-policies (2026-08-28).
- Google's spam policies list cloaking, sneaky redirects, keyword stuffing and link spam, among others; link spam covers buying or selling links, link exchanges and other links made mainly to manipulate rankings; PBNs and tiered links are not named; they fall under that general clause (an inference from the policy text); the heading formerly called "site reputation abuse" is now "site reputation policy". Source: https://developers.google.com/search/docs/essentials/spam-policies (2026-08-28).
- Scaled content abuse is producing many pages mainly to manipulate rankings with little added value, by any method, AI included. Source: https://developers.google.com/search/docs/essentials/spam-policies (2026-08-28).
- Back-button hijacking is a malicious-practices violation enforced from 2026-06-15, and it can come from third-party or ad scripts. Source: https://developers.google.com/search/blog/2026/04/back-button-hijacking (2026-04-13).
- User spam reports can now lead to manual actions. Source: https://developers.google.com/search/updates (2026-04-14).
- Site reputation manual actions work differently inside the EEA from 2026-08-30; outside the EEA, Israel included, the earlier enforcement applies. Source: https://developers.google.com/search/blog/2026/08/update-site-reputation-policy (2026-08-28).
- AI-generated content is allowed when it helps people; producing many pages with it without added value can be scaled content abuse; fact-check everything, including titles, meta descriptions, structured data and alt text. Source: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content (2026-10-01).
- E-E-A-T is not itself a ranking factor; raters use it, and trust matters most. Source: https://developers.google.com/search/docs/fundamentals/seo-starter-guide (2025-12-10).
- The claim that a December 2025 update extended E-E-A-T to all competitive queries is false; the dashboard lists a regular core update. Source: https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (2025-12-29).
- The live Search Quality Rater Guidelines are the edition of 2025-09-11. Source: https://guidelines.raterhub.com/searchqualityevaluatorguidelines.pdf (2025-09-11).
- Google has no notion of an optimal keyword density, and there is no such thing as LSI keywords. Source: https://www.seroundtable.com/google-search-optimal-keyword-density-34826.html (2023-01-31).
- Review snippet guidelines say not to include fake reviews or undisclosed incentivized reviews, on the page or in structured data. Source: https://developers.google.com/search/docs/appearance/structured-data/review-snippet (2026-07-24).
- Google's helpful content guidance asks whether content shows effort, originality, skill and accuracy; mass text without manual oversight is little to no effort. Source: https://developers.google.com/search/docs/fundamentals/creating-helpful-content (2026-10-01).

## Google: updates (full list in data/updates.json)

- 2026 updates: Discover core (Feb 5 to 27, US English), spam (Mar 24 to 25), core (Mar 27 to Apr 8), core (May 21 to Jun 2), spam (Jun 24 to 26), spam (Aug 18 to 21), spam from Sep 24, still rolling out on 2026-10-02. Source: https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (2026-10-02).
- Smaller core updates also happen without an announcement. Source: https://developers.google.com/search/updates (2025-12-09).
- Judge an update's effect only after it has finished, comparing about a week after with the period before it began. Source: https://developers.google.com/search/docs/appearance/core-updates (2025-12-10).

## Rich results and structured data (status list in data/schema-status.json)

- FAQ rich results were limited to well-known government and health sites on 2023-08-08 and ended for all sites on 2026-05-07; FAQPage stays valid schema.org markup. Source: https://developers.google.com/search/updates (2026-05-07).
- HowTo rich results were removed in September 2023. Source: https://developers.google.com/search/blog/2023/08/howto-faq-changes (2023-09-14).
- Google retired several structured data features in 2025 (Course Info, ClaimReview, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing; Book Actions was later kept) and said this does not affect ranking. Source: https://developers.google.com/search/blog/2025/06/simplifying-search-results (2025-06-12).
- Practice problem markup was retired (deprecation notice 2025-11-05, docs removed 2026-01-06), and Google clarified on 2025-11-05 that Dataset markup serves Dataset Search only, not Google Search. Source: https://developers.google.com/search/updates (entries of 2025-11-05 and 2026-01-06; read 2026-10-03).
- Google needs no special schema for AI features; structured data still matters for rich results and must match the visible content. Source: https://developers.google.com/search/docs/appearance/ai-features (2025-12-10).
- Google uses both the schema.org image and og:image when choosing a page's thumbnail. Source: https://developers.google.com/search/updates (2026-03-02).

## Crawling and technical

- Googlebot fetches the first 2 MB of an HTML file, headers included; bytes past that are not rendered or indexed, so put the title, canonical and key structured data early. Source: https://developers.google.com/search/blog/2026/03/crawler-blog-post (2026-03-31).
- robots.txt (RFC 9309): the longest matching rule wins and allow wins a tie; a 4xx answer means no restrictions; an unreachable file (5xx) means crawlers assume they may crawl nothing; crawlers parse at least the first 500 KiB. Google also treats 429 like a 5xx and, after a long outage, may fall back to a cached copy. Sources: https://www.rfc-editor.org/rfc/rfc9309 (2022-09-09); https://developers.google.com/crawling/docs/changelog (read 2026-10-02).
- Core Web Vitals are good at the 75th percentile with LCP of 2.5 s or less, INP of 200 ms or less and CLS of 0.1 or less; INP replaced FID on 2024-03-12. Source: https://web.dev/articles/vitals (2024-10-31).
- Google removed its warning that loading content with JavaScript makes it harder for Google Search. Source: https://developers.google.com/search/updates (2026-03-04).
- "Read more" deep links in snippets need the content visible (not collapsed or in tabs), no forced scroll position and no stripped URL hash. Source: https://developers.google.com/search/docs/appearance/snippet (2026-04-20).
- Since 2026-07-01 Google links straight to publishers' AMP pages and the AMP cache is no longer needed. Source: https://developers.google.com/search/updates (2026-07-01).

## Search Console and Bing

- The Search Console Generative AI performance report shows impressions only, by page, country, device and date, for AI Overviews and AI Mode together; no queries, clicks or CTR. It reached all sites on 2026-08-31. Source: https://support.google.com/webmasters/answer/16984139 (2026-08-31).
- AI Overviews and AI Mode traffic also counts inside the normal Performance report under Web and cannot be separated there. Source: https://developers.google.com/search/docs/appearance/ai-features (2025-12-10).
- Search Console impressions, CTR and position were wrong from 2025-05-13 to 2026-04-27 because of a logging error; clicks were not affected. Source: https://support.google.com/webmasters/answer/6211453 (2026-04-03).
- Around mid-September 2025 impressions and ranking-query counts fell for most sites when Google stopped supporting 100 results per page; it is a measurement change, not lost visibility (trade-press analysis, a secondary source). Source: https://searchengineland.com/google-num100-impact-data-462231 (read 2026-10-02).
- Search Console added a Web multimodal filter (Lens, Circle to Search, image uploads) to the Performance and Generative AI reports. Source: https://developers.google.com/search/blog/2026/09/web-multimodal-in-sc (2026-09-24).
- In the Search Console Page indexing report, "Crawled - currently not indexed" means Google fetched the page and chose not to index it for now, with no need to resubmit it; "Discovered - currently not indexed" means Google found the URL but has not crawled it yet, usually rescheduled to avoid overloading the site. Source: https://support.google.com/webmasters/answer/7440203 (read 2026-10-03).
- Bing Webmaster Tools has an AI Performance report: citations, cited pages and grounding queries across Copilot and Bing AI summaries, from a sample, without clicks. Source: https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview (2026-02-10).
- Bing added Intents, Topics, Citation Share and Compare to AI Performance. Source: https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/ (2026-06-16).
- IndexNow is used by Bing, Yandex, Naver, Seznam and Yep; Google does not participate. Source: https://www.indexnow.org/faq (read 2026-10-02).
- Bing limits how Copilot uses a page through NOARCHIVE or NOCACHE, not through blocking Bingbot. Source: https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat (2023-09-22).

## AI crawlers and platforms (full list in data/crawlers.json)

- OpenAI: OAI-SearchBot decides whether ChatGPT search can show and cite a site; GPTBot is for training; blocking GPTBot does not remove a site from ChatGPT search. Source: https://developers.openai.com/api/docs/bots (read 2026-10-02).
- ChatGPT referrals carry utm_source=chatgpt.com, and robots.txt changes take about 24 hours to apply. Source: https://help.openai.com/en/articles/12627856-publishers-and-developers-faq (read 2026-10-02).
- Anthropic: Claude-SearchBot indexes for Claude search, Claude-User fetches pages for a user's question, ClaudeBot collects training data. Source: https://support.claude.com/en/articles/8896518 (2026-04-07).
- Perplexity: PerplexityBot indexes for Perplexity search and is not used for model training; Perplexity-User generally ignores robots.txt. Source: https://docs.perplexity.ai/guides/bots (read 2026-10-02).
- Apple: Applebot powers Siri, Spotlight and Safari search and follows the Googlebot rules when robots.txt has rules for Googlebot but none for Applebot; Applebot-Extended controls training only. Source: https://support.apple.com/en-us/119829 (read 2026-10-02).
- Meta: Meta-WebIndexer lets Meta AI cite and link a site; Meta-ExternalAgent is mostly training; Meta-ExternalFetcher may bypass robots.txt. Source: https://developers.facebook.com/docs/sharing/webmasters/web-crawlers (read 2026-10-02).
- Verify a crawler by the operator's published IP list or reverse DNS, not by user agent alone. Google's IP range files moved to developers.google.com/crawling/ipranges/ on 2026-03-31; OpenAI lists its bots' IP files on its bots page; Perplexity publishes perplexitybot.json and perplexity-user.json; Anthropic's crawler page says a crawler whose source IP address is on its list, claude.com/crawling/bots.json, is coming from Anthropic; Apple's bot IPs reverse-resolve to `*.applebot.apple.com`, and Apple also publishes its CIDR ranges as a JSON file. Sources: https://developers.google.com/search/blog/2026/03/crawler-ip-ranges (2026-03-31); https://developers.openai.com/api/docs/bots (read 2026-10-03); https://docs.perplexity.ai/guides/bots (read 2026-10-03); https://support.claude.com/en/articles/8896518 (updated 2026-04-07; read 2026-10-03); https://support.apple.com/en-us/119829 (published 2026-09-04; read 2026-10-03).
- Cloudflare's AI Crawl Control "Block" setting also blocks Googlebot, Bingbot and Applebot since 2026-09-15; "Disallow AI Training" keeps search open. Source: https://blog.cloudflare.com/accountable-mixed-use-ai-crawlers/ (2026-09-15).
- Google Search ignores llms.txt, so it neither helps nor harms visibility there; the crawler docs of OpenAI, Anthropic and Perplexity do not describe reading it either. Sources: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (note added 2026-06-15); https://developers.openai.com/api/docs/bots (read 2026-10-02).
- OpenAI moved from in-chat Instant Checkout to product discovery from merchant feeds under the Agentic Commerce Protocol, onboarding approved partners. Source: https://developers.openai.com/commerce/guides/get-started (change reported 2026-03-24; docs read 2026-10-02).
- Google's agentic checkout runs on the Universal Commerce Protocol and launched in the US; Canada, Australia and then the UK were announced later; Israel is not in the announced list. Sources: https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/ (2026-01-11); https://blog.google/products-and-platforms/products/shopping/shopping-updates-google-marketing-live/ (2026-05-20).

## Measurement

- GA4 has a default "AI Assistant" channel from 2026-05-13, based on referrers such as ChatGPT, Gemini and Claude; sessions without a referrer stay in Direct, and AI Overviews and AI Mode clicks count as Google organic. Source: https://support.google.com/analytics/answer/9164320 (2026-05-13).
- Pew Research (March 2025 data, 68,879 searches by 900 US adults): people clicked a regular result in 8% of visits with an AI summary against 15% without, and a link inside the summary in 1%. Source: https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/ (2025-07-22).
- AI answers rarely list the same brands twice in a row, but how often a brand appears over many runs is fairly stable in tight categories, so AI visibility has to be sampled with repeated runs (vendor study). Source: https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/ (read 2026-10-02).

## Research on AI citations (correlational unless stated)

- Brand mentions on the web and on YouTube correlate with AI visibility more strongly than backlinks do (75,000 brands; a correlation, not a cause). Source: https://ahrefs.com/blog/ai-brand-visibility-correlations/ (2025-12-12).
- About 38% of URLs cited in AI Overviews ranked in the top 10 for the query, down from about 76% in mid-2025. Source: https://ahrefs.com/blog/ai-overview-citations-top-10/ (2026-03-02).
- A study of about 300,000 domains found no effect of llms.txt on AI citations. Source: https://seranking.com/blog/llms-txt/ (2025-11-07).
- The GEO paper's "up to 40%" gains were relative, measured in a simulated engine, and its prompts asked the model to add invented quotes and statistics; it is not a traffic promise. Source: https://arxiv.org/abs/2311.09735 (2023-11-16).
- A 2026 survey of 45 GEO studies found relevance and position in the model's context to be the most reproducible levers, and no technique with a stable causal effect across platforms. Source: https://arxiv.org/abs/2607.14035 (2026-07-15).
- The same survey (a single-author preprint) recommends 7 to 8 repetitions per prompt when tracking AI answers, because answers vary from run to run. Source: https://arxiv.org/abs/2607.14035 (2026-07-15).
- Studies of AI Overview click-through disagree, and the Search Console impressions error overlaps their windows, so any single CTR figure is directional. Source: https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update (read 2026-10-02).

## Local

- The Business Profile Q&A API was discontinued on 2025-11-03. Source: https://developers.google.com/my-business/content/sunset-dates (2025-11-03).
- Ask Maps, Gemini in Google Maps, launched in the US and India. Source: https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/ (2026-03-12).
- GA4 can link a Google Business Profile from the Admin panel (release note 2026-06-08): a Business Profile reporting collection shows interactions, calls, bookings, directions, website clicks, messages and menus, for a rolling 6-month window. Source: https://support.google.com/analytics/answer/9164320 (2026-06-08; read 2026-10-03).
- Google's contribution policies prohibit incentivized or biased reviews and rating manipulation; a 2026 policy update also bars asking only happy customers for reviews. Sources: https://support.google.com/contributionpolicy/answer/16597558 and https://support.google.com/contributionpolicy/answer/16597280 (read 2026-10-02); https://www.seroundtable.com/google-business-profile-review-policies-updated-40962.html (2026-02-20, secondary).

## International and site moves

- Google says to avoid automatically redirecting users from one language version of a site to a different language version (for example, based on what you think the user's language may be), because such redirects could prevent users and search engines from viewing all the versions; it suggests links so users can choose a version. Source: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (updated 2025-12-10; read 2026-10-03).
- If a site reroutes users or changes content by language settings, Google says it might not find and crawl all the variations, because Googlebot usually originates from the USA and sends requests without Accept-Language; it adds that IP location analysis is difficult and generally not reliable, and that most, but not all, Google crawls originate from the US and it does not try to vary the location. Source: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (updated 2025-12-10; read 2026-10-03).
- Google determines the language of a page from its visible content, not from lang attributes or the URL. Source: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites (updated 2025-12-10; read 2026-10-03).
- For hreflang, if two pages do not both point to each other, the tags are ignored, so every alternate must link back. Source: https://developers.google.com/search/docs/specialty/international/localized-versions (updated 2026-09-21; read 2026-10-03).
- The hreflang x-default value is the fallback for users whose language and region match none of the versions; it was designed for language selector pages, and Google also suggests it for auto-redirecting home pages. Source: https://developers.google.com/search/docs/specialty/international/localized-versions (updated 2026-09-21; read 2026-10-03).
- The HTML, HTTP header and sitemap methods for hreflang are equivalent from Google's perspective; using all three at once brings no benefit in Search and is harder to manage. Source: https://developers.google.com/search/docs/specialty/international/localized-versions (updated 2026-09-21; read 2026-10-03).
- For a site move with URL changes, Google says to keep the redirects for as long as possible, generally at least 1 year. Source: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes (updated 2026-08-20; read 2026-10-03).
- The Search Console Change of Address tool is needed only when moving from one domain or subdomain to another (example.com to example.net, a.example.com to b.example.com), not for HTTP to HTTPS moves, switching between www and non-www on the same domain, or moving paths within the same domain; for a domain move, Google says to submit it for every verified variant of the old domain. Source: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes (updated 2026-08-20; read 2026-10-03).
- Google expects temporary ranking fluctuation during a site move: a small to medium-sized site can take a few weeks for most pages to move and larger sites take longer; it suggests timing the move for lower traffic if possible. Source: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes (updated 2026-08-20; read 2026-10-03).
- If noindex rules are used during development, Google says to prepare the list of URLs to remove them from when the move starts, and to update noindex rules on the new site once the redirects are active. Source: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes (updated 2026-08-20; read 2026-10-03).

## Hebrew and Israel

- AI Overviews are available in Israel and in Hebrew. Source: https://support.google.com/websearch/answer/14901683 (read 2026-10-02).
- AI Mode is available in Israel and in Hebrew. Source: https://support.google.com/websearch/answer/16011537 (read 2026-10-02).
- Ask Maps (launched in the US and India), Google's agentic checkout and Merchant Center AI insights are not announced for Israel, so do not promise them to Israeli businesses. Sources: https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/ (2026-03-12); https://blog.google/products-and-platforms/products/shopping/shopping-updates-google-marketing-live/ (2026-05-20).
