# Measurement

What to read, what each source can and cannot say, and how to judge a change. Label every number as measured, tool estimate or inferred (SKILL.md section 4). A rule of thumb or a number chosen for practicality is marked (judgment). Paths written `<skill>/...` are relative to this skill's folder.

## 1. Google Search Console

- **Performance.** Read clicks first. Impressions, CTR and position come with the breaks in `<skill>/data/data-breaks.json`: wrong from 2025-05-13 to 2026-04-27 (clicks were fine), and a measurement fall around mid-September 2025 when Google stopped serving 100 results per page. Treat the newest 2 to 3 days as incomplete. Query and page rows together drop data. AI Overviews and AI Mode traffic counts inside Web and cannot be separated there.
- **Generative AI performance report.** Impressions only, by page, country, device and date, for AI Overviews and AI Mode together. No queries, clicks or CTR. It under-counted from 2026-08-13 to 2026-08-17. Read two things: which pages appear, and which buying-journey pages never do. A Web multimodal filter (Lens, Circle to Search, image uploads) exists in this report and in Performance.
- **Also check:** Page indexing, Core Web Vitals, Manual actions, Security issues, and the state of the Search generative AI setting (it can exclude the site from AI Overviews, AI Mode and Discover generative features; if the site is excluded, absence from them is a choice, not a defect).
- Exports feed `<skill>/scripts/gsc-analyze.mjs` (see data-sources.md).

## 2. Bing Webmaster Tools: AI Performance

Citations, cited pages and grounding queries across Copilot and Bing AI summaries. It is a sample, and it has no clicks. The site must be verified in Bing Webmaster Tools to get it. Newer views: Intents, Topics, Citation Share and Compare.

## 3. GA4

- The default **AI Assistant** channel (since 2026-05-13) groups visits by referrer such as ChatGPT, Gemini and Claude.
- **Backstop channel: a proposal, not a setup.** Changing the owner's analytics is a live change, so it goes in the report as a proposal with the steps (in GA4 Admin, a custom channel group with a channel whose Source matches the regex below), and it is made only after the owner approves (SKILL.md section 6). Label it a backstop, not a complete list: `chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|meta\.ai|grok\.com`
- ChatGPT links carry `utm_source=chatgpt.com`.
- AI Overviews and AI Mode clicks are Google organic. They cannot be split out.
- An AI visit that arrives without a referrer lands in Direct, so GA4 undercounts AI traffic. Report it as a floor.

## 4. Server logs

Only when the owner already has log access, or the logs are already in the project. Never ask for them. Verify a bot by the operator's published IP list or by reverse DNS, never by the user agent alone: anyone can send any user agent. Google, OpenAI, Anthropic, Perplexity and Apple publish theirs (facts.md, AI crawlers and platforms, with the Google ranges moved to developers.google.com/crawling/ipranges/ on 2026-03-31); the pages are the `source` fields in `<skill>/data/crawlers.json`.

## 5. AI answer sampling

One answer from an AI engine is not a measurement: the same question gives different brands on different runs, while the share of runs that mention a brand is fairly stable in tight categories (vendor study, facts.md). So sample, never score.

**Three outcomes, logged separately for every run:**

- **Mentioned:** the answer names the brand or the site.
- **Cited:** the answer shows a link to the site.
- **Recommended:** the answer suggests choosing it.

A run can be mentioned without being cited, and cited without being recommended.

**Who runs it.** The agent does, never the user.

- When the agent has a browser or a connected tool, it runs the sample itself.
- Without one, the report says AI visibility was not sampled this time, and offers the question list and the log template (below) as an optional extra the owner may use. It is never a requirement, never blocks the job, and the agent never asks the user to paste answers. If the owner sends results anyway, treat them as a sample with the run count they give.
- Your own answer to a buyer question, as a model, is not a sample.

**The passes.** Always say which pass was run and its run count, for example "small pass: 10 questions, 3 engines, 7 runs each (210 runs)".

1. **Full pass.** A fixed list of 10 to 30 buyer questions (judgment), in the user's language(s), written from `brief.md` before looking at any answer. Each question runs 5 to 8 times (judgment; the 2026 survey in facts.md recommends 7 to 8) per engine: ChatGPT, Gemini or AI Mode, Perplexity, Copilot, Claude. Use a fresh session each time, logged out where possible.
2. **Small pass, for small sites (judgment).** For example 10 questions, 3 engines (the ones the site's buyers use), 7 runs each (a 2026 preprint survey of GEO studies recommends 7 to 8 runs per prompt; facts.md). Same rules, smaller list.
3. **A partial sample is never presented as a measurement.** If a pass stopped early, an engine was unavailable or a login wall blocked it, say "partial sample, N runs", show the counts as observations, and do not compare them with another month.

**Logging.** One block per run, so a long verbatim answer never breaks a table. Record the country and language the run actually used, and say so when they differ from the owner's market.

    ### Run <n>
    - Date: YYYY-MM-DD
    - Engine:
    - Country, language:
    - Question:
    - Mentioned: yes / no
    - Cited (a link to the site is shown): yes / no
    - Recommended: yes / no
    - Answer (verbatim):

      <the full answer as shown>

**Reporting.**

- Report the frequency per engine with the run count and the pass, for example "cited in 3 of 8 runs". Small differences at these run counts are noise (judgment).
- Repeat monthly with the same list. Never one score for the whole.
- Save the log as `seo/reports/YYYY-MM-DD-ai-sampling.md` (in the scratch folder when the user declined the project file) and link it from the changelog entry it will help judge.

## 6. Change windows

- Crawling and reprocessing take days.
- Rule of thumb (judgment, not a Google number): do not judge movement under 2 weeks; rankings usually move in 2 to 4 weeks and settle in 4 to 6.
- Compare equal periods, with the same weekdays, never including the newest 2 to 3 days.
- One variable per change. Use a control group of comparable unchanged pages when there is one.
- A Google update: judge it only after it has finished, comparing about a week after with the period before it began.

## 7. Business first

Each money page needs a named conversion event (form, call, WhatsApp, booking, purchase). Report search and conversions together. A page that rose without more conversions is not a win.
