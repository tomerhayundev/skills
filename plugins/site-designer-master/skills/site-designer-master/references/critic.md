# The critic

```
node ${CLAUDE_SKILL_DIR}/scripts/critic-pack.mjs <site> --brief=<src>/brief.json --meter=<meter-report.txt> --out=<work>/_critic
```

The pack holds the first screen at 375 and 1440, every page in full at both widths, and `index.md`: the
critic's brief (`assets/critic-prompt.md`), the site brief with the user's picks, and the meter's report.

Give that folder to a **fresh sub-agent** with no other context: "Read index.md and judge the site as it
says." When the host cannot start a sub-agent, run the critic yourself as a separate pass that reads only
that folder, and say so to the user.

What the critic does (from the prompt):
1. The 5-second test on the first screens: what it is, for whom, what to do next.
2. Judges the site against the user's picks: what it took, where it went its own way, and whether it copied.
3. Reviews every page at both widths.
4. Scores out of 10 with caps: any meter failure caps at 6; a failed 5-second test caps at 5; a page the
   nearest competitor could use caps at 7; a copied pick caps at 4.
5. Lists at most 5 fixes, each with the screenshot and region as evidence.

Fix what has evidence, rebuild, run the meter and the critic again. Stop when the meter has no failures and the
critic scores 8 or more with no uncapped fix left, or after three rounds; then tell the user what stayed open.
