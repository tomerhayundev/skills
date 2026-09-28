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

### Remotion video: one master skill, or only the part you need

**[remotion-video-master](plugins/remotion-video-master/skills/remotion-video-master/SKILL.md) is the
master: every kind of Remotion video in one skill.** It opens with a short brainstorm (what the video
is for, where it runs, a recommended length), writes the story and the script, then builds and
measures the video with one engine: the brand's own motif in every transition, beat-locked music,
platform safe zones, a critique loop. Install it and you have every format below.

**The specialists are the master broken out, one kind of video each,** for when you only ever make
that one: the same engine and the same checks, with the goal already set. They are generated from
the master, so every improvement to the master reaches all of them. Install the master, or only the
specialists you need; with the master installed you need none of them. An early specialist builds on
the nearest full module until it gets its own.

<!-- family:remotion-video-master -->
| Skill | Role | What it does | Install |
| --- | --- | --- | --- |
| [remotion-video-master](plugins/remotion-video-master/skills/remotion-video-master/SKILL.md) | **Master**: every format, all in one | The master Remotion video skill, every format in one: a guided brief (what the video is for, where it runs, a recommended length), the story and script, then one engine for promos, demos, tutorials, explainers and more, with the brand motif in every transition, platform safe zones and measured verification. | `claude plugin install remotion-video-master@tomerhayundev-skills` |
| [remotion-video-promo](plugins/remotion-video-promo/skills/remotion-video-promo/SKILL.md) | Specialist: promo | Promo videos with Remotion: bumpers, 15 and 30 s ads, teasers, launch films and landing page loops. Seamless, beat-locked, every transition made of the brand's motif, four aspects and RTL locales from one manifest. | `claude plugin install remotion-video-promo@tomerhayundev-skills` |
| [remotion-video-product-demo](plugins/remotion-video-product-demo/skills/remotion-video-product-demo/SKILL.md) | Specialist: product demo | Product demo and product tour videos with Remotion: the real product, feature by feature, driven by a cursor with smooth zooms, voiced or caption-led, with cuts only inside screen recordings. | `claude plugin install remotion-video-product-demo@tomerhayundev-skills` |
| [remotion-video-tutorial](plugins/remotion-video-tutorial/skills/remotion-video-tutorial/SKILL.md) | Specialist: tutorial | Tutorial and how-to videos with Remotion: step by step, chaptered by the brand's motif, a voiceover or word-synced subtitles, cursor zooms, checked so a stranger can repeat every step. | `claude plugin install remotion-video-tutorial@tomerhayundev-skills` |
| [remotion-video-explainer](plugins/remotion-video-explainer/skills/remotion-video-explainer/SKILL.md) | Specialist: explainer | Explainer videos with Remotion: one idea made clear with diagrams and the brand's motif, voiced or caption-led, checked for one-sentence recall. | `claude plugin install remotion-video-explainer@tomerhayundev-skills` |
| [remotion-video-feature-announcement](plugins/remotion-video-feature-announcement/skills/remotion-video-feature-announcement/SKILL.md) | Specialist: feature announcement (early, built on promo) | Feature announcement videos with Remotion: one new feature or release, before and after on the same screen, in a short seamless film. | `claude plugin install remotion-video-feature-announcement@tomerhayundev-skills` |
| [remotion-video-social-organic](plugins/remotion-video-social-organic/skills/remotion-video-social-organic/SKILL.md) | Specialist: social clip (early, built on promo) | Organic social clips with Remotion for Reels, TikTok, Shorts and LinkedIn: the hook in the first second, captions inside every platform's safe zone, made to loop and be shared. | `claude plugin install remotion-video-social-organic@tomerhayundev-skills` |
| [remotion-video-event-recap](plugins/remotion-video-event-recap/skills/remotion-video-event-recap/SKILL.md) | Specialist: event recap (early, built on promo) | Event recap and conference highlight videos with Remotion, cut from real footage and photos on the beat. | `claude plugin install remotion-video-event-recap@tomerhayundev-skills` |
| [remotion-video-app-store-preview](plugins/remotion-video-app-store-preview/skills/remotion-video-app-store-preview/SKILL.md) | Specialist: app store preview (early, built on product demo) | App Store previews and Google Play videos with Remotion: in-app footage only, 15 to 30 s, caption-led for muted autoplay, at the store's exact size. | `claude plugin install remotion-video-app-store-preview@tomerhayundev-skills` |
| [remotion-video-onboarding](plugins/remotion-video-onboarding/skills/remotion-video-onboarding/SKILL.md) | Specialist: onboarding (early, built on tutorial) | Onboarding and first-run videos with Remotion: a series of short tutorials, one task each, caption-led for in-product playback. | `claude plugin install remotion-video-onboarding@tomerhayundev-skills` |
| [remotion-video-testimonial](plugins/remotion-video-testimonial/skills/remotion-video-testimonial/SKILL.md) | Specialist: testimonial (early, built on explainer) | Customer testimonial and case study videos with Remotion, built from a real customer's quote, interview or numbers. | `claude plugin install remotion-video-testimonial@tomerhayundev-skills` |
<!-- /family:remotion-video-master -->

`remotion-video-promo` was called `remotion-video-pipeline` until 2026-09-28. An installed copy moves
to the new name when the catalog updates; then install it once (updating the old name reports "not
found"):

```bash
claude plugin marketplace update tomerhayundev-skills
claude plugin install remotion-video-promo@tomerhayundev-skills
```

### More skills

| Name | Type | What it does | Install |
| --- | --- | --- | --- |
| [deploy-production-level](plugins/deploy-production-level/skills/deploy-production-level/SKILL.md) | skill | Production deploy pipeline on GitHub Actions and Cloudflare Workers: a required quality gate, PR preview environments, staging on every merge, human-promoted production releases tagged with their Worker version, instant rollback, and a hook that stops AI agents from deploying. Invoke it explicitly. | `claude plugin install deploy-production-level@tomerhayundev-skills` |
| [publish-skill](plugins/publish-skill/skills/publish-skill/SKILL.md) | skill | Publish a skill or plugin to your Claude Code marketplace repos: routes public vs private, scaffolds the entry and README row, scans for secrets and private content, validates, test-installs in a throwaway config, and keeps a local copy. Includes a history-purge recipe for leaks. | `claude plugin install publish-skill@tomerhayundev-skills` |
| [visual-verification](plugins/visual-verification/skills/visual-verification/SKILL.md) | skill | Makes the agent prove an output works before calling it done: screenshot it, use it (click, submit, run, open every page), judge it against the goal, in a strict tool order (real Chrome, in-app browser, computer use), with a rationalization table and red flags. | `claude plugin install visual-verification@tomerhayundev-skills` |

## Layout

```
.claude-plugin/marketplace.json                 the catalog: one entry per plugin
plugins/<name>/.claude-plugin/plugin.json       name, version, description, author
plugins/<name>/skills/<name>/SKILL.md           a skill (+ references/, scripts/, assets/)
plugins/<name>/commands/, agents/, hooks/       other components, when a plugin has them
plugins/remotion-video-<format>/                specialists, generated from remotion-video-master
archive/<name>/                                 retired plugins, kept as they were, not in the catalog
scripts/sync.mjs                                versions, specialists, catalog and README tables
scripts/check-skills.mjs                        repo checks CI runs on every push
MAINTAINING.md                                  how the repo is kept, and by whom
.claude/agents/skills-maintainer.md             the agent that keeps it
```

Every entry is a full plugin: `"source": "./plugins/<name>"`, with its own
`plugin.json`, and no `strict` or `skills` key. Cowork installs only entries shaped
like that; it silently skips skill-only entries (`"source": "./"` plus a `skills`
list), which the Claude Code CLI would accept.

## Adding or changing a skill

An agent keeps this repo: [skills-maintainer](.claude/agents/skills-maintainer.md) adds, updates,
renames and retires skills end to end (versions, specialists, catalog, README, checks, a test
install, the push, CI) by the rules in [MAINTAINING.md](MAINTAINING.md). In a Claude Code session,
ask for the change ("add this skill to my skills repo", "update the master with what we learned")
and it runs. The [publish-skill](plugins/publish-skill/skills/publish-skill/SKILL.md) skill holds the
publishing steps it follows.

Two rules hold even by hand:

- **A specialist is never edited.** Change `remotion-video-master` (its `SKILL.md`, a
  `formats/<format>/FORMAT.md`, or a shared file), then run `node scripts/sync.mjs`. A hand edit to a
  specialist stops the sync and fails CI.
- **Every change bumps the plugin's `version`**, or installed copies (CLI and Cowork) never update.
  `node scripts/sync.mjs` bumps the patch version of anything you changed, and CI does the same on
  every push to `main`.

```bash
node scripts/sync.mjs
node scripts/check-skills.mjs
claude plugin validate . --strict
```

## Archived

No longer maintained. Kept as they were, but out of the catalog, so `claude plugin install`
no longer finds them. Copies already installed keep working and get no updates. To use
one anyway, copy its skill folder into `~/.claude/skills/`.

| Name | What it does |
| --- | --- |
| [wix-app-dev](archive/wix-app-dev/skills/wix-app-dev/SKILL.md) | Design, build and ship Wix App Market apps: architecture, instance-token auth, webhooks, Blocks widgets, a Cloudflare Workers + D1 backend, billing, submission. |

## License

[MIT](LICENSE), except the bundled music track in
`plugins/remotion-video-master/skills/remotion-video-master/assets/music/` (and its copy in each
`remotion-video-*` specialist), which is Sascha Ende's work under CC BY 4.0 (see its
[CREDITS.md](plugins/remotion-video-master/skills/remotion-video-master/assets/music/CREDITS.md)).
