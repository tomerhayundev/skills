# Claude Code plugins and skills

Plugins and skills for [Claude Code](https://code.claude.com/docs), each one
extracted from a real project so the next project starts from what worked.

## Install

**1. Add the marketplace** (once per machine):

```bash
claude plugin marketplace add https://github.com/tomerhayundev/skills.git
```

The `tomerhayundev/skills` shorthand also works, but it clones over SSH, so it fails
on a machine without a GitHub SSH key unless `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` is set.

**2. Install what you need.** Every row in [What's here](#whats-here) has its
command, for example:

```bash
claude plugin install visual-verification@tomerhayundev-skills
```

Restart Claude Code (or run `/reload-plugins`). A skill then triggers on its own
when a task matches, or runs as `/<name>`. Inside a session the same steps are
`/plugin marketplace add <url>` and `/plugin install <name>@tomerhayundev-skills`.

**3. Get updates:**

```bash
claude plugin marketplace update tomerhayundev-skills
claude plugin update <name>@tomerhayundev-skills
```

Run both, then restart Claude Code: the first only refreshes the catalog, the second
moves the installed copy to the latest version.

Or turn on auto-update once: `/plugin` > Marketplaces > tomerhayundev-skills >
Enable auto-update. Remove one with `claude plugin uninstall <name>@tomerhayundev-skills`.

**Without the plugin system**, copy a skill into your personal skills folder; it
loads in every session:

```bash
git clone https://github.com/tomerhayundev/skills.git
cp -r skills/plugins/<name>/skills/<name> ~/.claude/skills/<name>
```

**Other agents** that support [Agent Skills](https://agentskills.io) (Codex, Cursor,
opencode, and more):

```bash
npx skills add https://github.com/tomerhayundev/skills --skill <name>
```

## What's here

| Name | Type | What it does | Install |
| --- | --- | --- | --- |
| [remotion-video-pipeline](plugins/remotion-video-pipeline/skills/remotion-video-pipeline/SKILL.md) | skill | A production Remotion pipeline for product promo videos: clips as manifest rows, four aspect ratios, RTL locales, no visible cuts (shared elements and a flood that turns each scene into the next), a beat-locked music bed whose lift lands on the payoff, one-take launch films (one element travels through every moment and the camera follows it), measured verification, publishing. Ships a beat-grid fitter, an audio checker, a frame-pop checker and a CC BY 4.0 120 BPM track. | `claude plugin install remotion-video-pipeline@tomerhayundev-skills` |
| [deploy-production-level](plugins/deploy-production-level/skills/deploy-production-level/SKILL.md) | skill | Production deploy pipeline on GitHub Actions and Cloudflare Workers: a required quality gate, PR preview environments, staging on every merge, human-promoted production releases tagged with their Worker version, instant rollback, and a hook that stops AI agents from deploying. Invoke it explicitly. | `claude plugin install deploy-production-level@tomerhayundev-skills` |
| [publish-skill](plugins/publish-skill/skills/publish-skill/SKILL.md) | skill | Publish a skill or plugin to your Claude Code marketplace repos: routes public vs private, scaffolds the entry and README row, scans for secrets and private content, validates, test-installs in a throwaway config, and keeps a local copy. Includes a history-purge recipe for leaks. | `claude plugin install publish-skill@tomerhayundev-skills` |
| [visual-verification](plugins/visual-verification/skills/visual-verification/SKILL.md) | skill | Makes the agent prove an output works before calling it done: screenshot it, use it (click, submit, run, open every page), judge it against the goal, in a strict tool order (real Chrome, in-app browser, computer use), with a rationalization table and red flags. | `claude plugin install visual-verification@tomerhayundev-skills` |

## Layout

```
.claude-plugin/marketplace.json                 the catalog: one entry per plugin
plugins/<name>/.claude-plugin/plugin.json       name, version, description, author
plugins/<name>/skills/<name>/SKILL.md           a skill (+ references/, scripts/, assets/)
plugins/<name>/commands/, hooks/                commands and hooks, when a plugin has them
archive/<name>/                                 retired plugins, kept as they were, not in the catalog
scripts/check-skills.mjs                        repo checks CI runs on every push
```

Every entry is a full plugin: `"source": "./plugins/<name>"`, with its own
`plugin.json`, and no `strict` or `skills` key. Cowork installs only entries shaped
like that; it silently skips skill-only entries (`"source": "./"` plus a `skills`
list), which the Claude Code CLI would accept.

## Adding a skill

The [publish-skill](plugins/publish-skill/skills/publish-skill/SKILL.md) skill runs this
whole flow: scaffold (files, `plugin.json`, catalog entry, README row with its install
command), scan, checks, test install, push, local copy. By hand:

1. Create `plugins/<name>/skills/<name>/SKILL.md`. Frontmatter on line 1, `name`
   equal to the folder name, a `description` under 1024 characters that says when
   to use it. Keep the body under ~500 lines; put detail in `references/`.
2. Create `plugins/<name>/.claude-plugin/plugin.json` with `name`, `version`,
   `description` and `author`.
3. Add an entry to `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.
4. Add a row to [What's here](#whats-here), with its install command.
5. Run the checks (CI runs them too; a skill-only entry, a missing `plugin.json`, a
   missing row or install command fails):

```bash
node scripts/check-skills.mjs
claude plugin validate . --strict
```

A change only reaches installed copies (CLI and Cowork) when the plugin's `version` in
`plugin.json` is bumped. The check fails when a plugin's files differ from `origin/main`
but its version does not.

## Archived

No longer maintained. Kept as they were, but out of the catalog, so `claude plugin install`
no longer finds them. Copies already installed keep working and get no updates. To use
one anyway, copy its skill folder into `~/.claude/skills/`.

| Name | What it does |
| --- | --- |
| [wix-app-dev](archive/wix-app-dev/skills/wix-app-dev/SKILL.md) | Design, build and ship Wix App Market apps: architecture, instance-token auth, webhooks, Blocks widgets, a Cloudflare Workers + D1 backend, billing, submission. |

## License

[MIT](LICENSE), except the bundled music track in
`plugins/remotion-video-pipeline/skills/remotion-video-pipeline/assets/music/`, which is
Sascha Ende's work under CC BY 4.0 (see its
[CREDITS.md](plugins/remotion-video-pipeline/skills/remotion-video-pipeline/assets/music/CREDITS.md)).
