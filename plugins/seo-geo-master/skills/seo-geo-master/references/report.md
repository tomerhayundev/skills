# The report

One report per ask, in the user's language, in plain words. Every term of art (canonical, crawl, CTR, schema) is explained in a few words the first time.

1. **Verdict** in one line: what is going on and the single most important thing to do.
2. **Actions** (1 to 3). Each: Do this (specific: page, element, the new text or setting) / Why (the mechanism) / Evidence (what we saw, labelled measured, estimate or inferred, with source and date) / Effort (small, medium, large) / How we will know (the metric, the date to judge, the revert rule).
3. **What else we checked**: a table of the other candidates: what we found, the fix in one line (do this, written in the report itself even when a proposals file holds the exact edits), and why each is not first. A defect that may be deliberate gets both branches ("if X is a separate product, do this; if not, do that"), never only "decide later". Include anything the user asked about that we decided against, and why.
4. **How this was made**: tools and scripts run, data used with date ranges, live checks with their conditions (query, country, language, device, date), what was not checked and why, and the facts relied on with their dates.

Rules: verdict first, no preamble. Numbers only with a label and a source. No single score out of 100 for a site or for AI visibility. Nothing longer than one screen in chat: the full report goes to `seo/reports/YYYY-MM-DD-<topic>.md` (to the scratch folder when the user declined the project file, and the chat says where), or an artifact when the user wants to share it. Never tell the user to do work the skill can do itself.
