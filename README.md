# Claude Code plugins and skills

Plugins and skills for [Claude Code](https://code.claude.com/docs), each one
extracted from a real project so the next project starts from what worked.

## Install

Add the marketplace once, then install what you need:

```bash
claude plugin marketplace add tomerhayundev/skills
claude plugin install remotion-video-pipeline@tomerhayundev-skills
```

The `owner/repo` shorthand prefers SSH. On a machine without a GitHub SSH key, set
`CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` or add the HTTPS URL instead:
`claude plugin marketplace add https://github.com/tomerhayundev/skills.git`.

Inside a Claude Code session the same thing is `/plugin marketplace add tomerhayundev/skills`
and `/plugin install <name>@tomerhayundev-skills`. A plugin's skill then runs as
`/<plugin>:<skill>`, or triggers on its own when the task matches.

For other agents that support [Agent Skills](https://agentskills.io) (Codex, Cursor,
opencode, and more):

```bash
npx skills add tomerhayundev/skills --skill remotion-video-pipeline
```

## What's here

| Name | Type | What it does |
| --- | --- | --- |
| [remotion-video-pipeline](skills/remotion-video-pipeline/SKILL.md) | skill | A production Remotion pipeline for product promo videos: clips as manifest rows, four aspect ratios, RTL locales, a beat-locked music bed whose lift lands on the payoff, measured verification, publishing. Ships a beat-grid fitter, an audio checker and a CC BY 4.0 120 BPM track. |
| [deploy-production-level](skills/deploy-production-level/SKILL.md) | skill | Production deploy pipeline on GitHub Actions and Cloudflare: quality-gate CI, PR previews, automated production deploys, git-tag releases, one-click rollback, a human setup guide. Invoke it explicitly. |
| [codex-loop](plugins/codex-loop/README.md) | plugin | An iterative Codex CLI loop with Claude as orchestrator: a Stop hook keeps state across rounds and Claude judges each result. `/codex-loop "task" --completion-promise "DONE"` |
| [stitch-sdk](skills/stitch-sdk/SKILL.md) | skill | Generate UI screens with the Google Stitch SDK: from text prompts, edits, variants, HTML and screenshot export. |
| [wix-app-dev](skills/wix-app-dev/SKILL.md) | skill | Design, build and ship Wix App Market apps: architecture, instance-token auth, webhooks, Blocks widgets, a Cloudflare Workers + D1 backend, billing, submission. |
| [publish-skill](skills/publish-skill/SKILL.md) | skill | Publish a skill or plugin to your Claude Code marketplace repos: routes public vs private, scaffolds the entry and README row, scans for secrets and private content, validates, test-installs in a throwaway config, and keeps a local copy. Includes a history-purge recipe for leaks. |

## Layout

```
.claude-plugin/marketplace.json   the catalog: one entry per installable plugin
skills/<name>/SKILL.md            a skill (+ references/, scripts/, assets/)
plugins/<name>/                   a plugin with commands and hooks
scripts/check-skills.mjs          repo checks CI runs on every push
```

Skill-only plugins point at their folder with `"source": "./"` and
`"skills": ["./skills/<name>"]`, the same shape as
[anthropics/skills](https://github.com/anthropics/skills).

## Adding a skill

The [publish-skill](skills/publish-skill/SKILL.md) skill runs this whole flow (scaffold,
scan, checks, test install, push, local copy). By hand:

1. Create `skills/<name>/SKILL.md`. Frontmatter on line 1, `name` equal to the
   folder name, a `description` under 1024 characters that says what it does and
   when to use it. Keep the body under ~500 lines; put detail in `references/`.
2. Add an entry to `.claude-plugin/marketplace.json`.
3. Run the checks:

```bash
node scripts/check-skills.mjs
claude plugin validate . --strict
```

## License

[MIT](LICENSE), except the bundled music track in
`skills/remotion-video-pipeline/assets/music/`, which is Sascha Ende's work under
CC BY 4.0 (see its [CREDITS.md](skills/remotion-video-pipeline/assets/music/CREDITS.md)).
