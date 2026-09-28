# Working in this repo

Tomer's public Claude Code skill marketplace. It is kept by the rules in
[MAINTAINING.md](MAINTAINING.md), usually through the skills-maintainer agent
(`.claude/agents/skills-maintainer.md`). Read MAINTAINING.md before changing anything.

- Never edit a plugin whose `SKILL.md` opens with `<!-- Generated from`: change its master
  (`remotion-video-master`), then run `node scripts/sync.mjs`.
- Never write a real company, client, product or competitor name anywhere here, commit messages
  included: describe the case by category. `node scripts/names.mjs add "<name>"` blocks one.
- After any change: `node scripts/sync.mjs`, `node scripts/check-skills.mjs`,
  `claude plugin validate . --strict`, and the tests listed in MAINTAINING.md.
