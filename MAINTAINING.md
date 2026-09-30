# Maintaining this repo

Tomer does not maintain this repo by hand. The [skills-maintainer](.claude/agents/skills-maintainer.md)
agent does, by the rules below, whenever a skill is added, changed, renamed or retired, and when
asked for a health check. This file is its rulebook: anything that changes how the repo works is
written here in the same commit.

## Rules that never bend

1. **Every catalog entry is a full plugin.** `plugins/<name>/.claude-plugin/plugin.json` (name, version,
   description, author) and `plugins/<name>/skills/<name>/SKILL.md`; the entry's `source` is
   `./plugins/<name>`, with no `strict` or `skills` key. Cowork installs nothing else and says nothing
   about what it skips.
2. **Every change to a plugin bumps its version**, or installed copies (CLI and Cowork) never update.
3. **The master is the single source of truth.** A specialist (its `SKILL.md` opens with
   `<!-- Generated from ...`) is never edited: change the master, then run the sync.
4. **Never just delete a catalog entry.** Rename with `"renames": { "old": "new" }`, retire with
   `"old": null` and move the folder to `archive/`.
5. **Nothing secret or private in this public repo.** Keys and tokens live in environment variables,
   never in a skill (not even a private one). Product internals and internal URLs go to
   `tomerhayundev/skills-private`. Run the scan before every push.
6. **No real company names, ever.** Not the client a lesson came from, not its competitors, not
   Tomer's own products as examples: not in a skill, a test prompt, a commit message or any file.
   Describe the case by category. `scripts/blocked-names.txt` lists names that must never appear, as
   salted hashes; add one with `node scripts/names.mjs add "<name>"` (it prints where the name already
   appears). `check-skills.mjs` fails on any of them on every push, and the scan does with `--public`;
   both print the place, never the name. A name that is also an ordinary word goes in only with the
   rest of its full name.
7. **House style.** No em dashes. A `SKILL.md` description starts "Use when..." and names triggers, not
   the workflow. Install commands use the HTTPS URL. Every entry has a README row with its install command.
8. **Nothing is pushed red.** The sync, the checks, the tests, the scan and a test install pass
   locally first, and a failing CI run is fixed before the work is reported done.

## How the repo is laid out

```
.claude-plugin/marketplace.json            the catalog; renames lives here too
plugins/<name>/                            one plugin per entry
plugins/remotion-video-<format>/           specialists, generated from remotion-video-master
archive/<name>/                            retired plugins, out of the catalog
scripts/sync.mjs                           versions, specialists, catalog entries, README family tables
scripts/sync.test.mjs                      its tests
scripts/check-skills.mjs                   every repo check (CI runs it; it also runs sync --check and the names check)
scripts/names.mjs, blocked-names.txt       names that must never appear, kept as salted hashes
.github/workflows/validate.yml             CI: sync on push to main, then every check and test
.claude/agents/skills-maintainer.md        the agent that follows this file
CLAUDE.md                                  points any session in this repo here
```

The README's catalog sits between `<!-- catalog -->` markers: a section per family, whose master
has its own hand-written card (the MASTER badge, what it does, its install command) followed by a
diagram and the specialists' table that the sync generates between `<!-- family:<master> -->`
markers; then "More skills", one table row per plugin. The banner is `.github/readme/banner.svg`.

## Families: a master and its specialists

`remotion-video-master` is a **master**: one skill that covers every kind of Remotion video, with one
module per kind in `formats/<id>/FORMAT.md`. Each module is also published on its own as a
**specialist**, `remotion-video-<id>`, for users who want one kind only. `node scripts/sync.mjs`
builds every specialist from the master:

- its `SKILL.md` is the master's, with `<!-- master-only -->` ... `<!-- /master-only -->` blocks removed
  and each `<!-- specialist ... -->` comment turned into text (`{{name}}`, `{{module}}`, `{{kind}}`,
  `{{Kind}}`, `{{path}}`, `{{master}}` filled in), under the module's own `name` and `description`;
- it ships the master's references, assets and scripts (the same markers apply to every `.md`), its
  own module, and for a stub the module it builds on; never the other modules or `_template.md`;
- its `plugin.json` and catalog entry take the module's `summary`, the master's author, license and
  keywords, and **the master's version**: a new master version releases every specialist with it;
- the master's `SKILL.md` says "This is version x.y.z of the skill" (in a master-only block), and the
  sync keeps that line equal to its `plugin.json`, so a session can say which copy it loaded; a
  specialist says the same in its generated first line;
- its `SKILL.md` records a fingerprint of what was generated. A hand edit makes the sync (and CI)
  stop with an error instead of overwriting it: move the edit into the master, run the sync again.
  `--force` exists only to throw a hand edit away.

Markers go on their own lines, exactly as written:

```markdown
<!-- master-only -->
Text only the master has.
<!-- /master-only -->
<!-- specialist
Text only the specialists have, for the {{kind}} specialist of {{master}}.
-->
```

Where a change goes:

| The change | Edit | Version |
| --- | --- | --- |
| A rule for every kind of video | the master's `SKILL.md`, or a shared file in `references/`, `assets/`, `scripts/` | patch (the sync does it) |
| A rule for one kind | `formats/<id>/FORMAT.md` | patch |
| A specialist's trigger or catalog line | the module's frontmatter: `description` (its "Use when"), `summary` | patch |
| Text for the master only, or for specialists only | the markers above | patch |
| A new kind of video | copy `formats/_template.md` to `formats/<id>/FORMAT.md`, fill it, add a row to the master's formats table (row order is catalog order) | minor: set it by hand first |
| A stub made full | fill every section, `Status: full` | minor |
| A kind removed | delete `formats/<id>/`; the sync removes the specialist and renames it to the master, so installs keep working | minor |
| An engine change that breaks existing projects | as above | major; ask Tomer first |

Improvements often happen in a project session that edited the local copy in
`~/.claude/skills/remotion-video-master`. To bring them home: `diff -r` that copy against the repo's,
move each change into the right place from the table above, run the sync, and publish.

## Versions

Semantic versions in each `plugin.json`: patch for a fix or a clarified rule, minor for a new
capability (a new module, a new script, a stub made full), major for a change that breaks what
users already built. `node scripts/sync.mjs` gives a patch bump to every plugin whose files differ
from `origin/main` while its version does not; it never touches a version that already moved, so
set a minor or major one in `plugin.json` before running it. `check-skills.mjs` fails on a change
with no bump.

## Procedures

`<ps>` below is `plugins/publish-skill/skills/publish-skill` in this repo.

**Update a skill (the usual job)**

1. `git pull --ff-only` (CI commits to `main` too).
2. Edit the source: for a family member, the master (see the table above).
3. A minor or major change: set the version in `plugin.json` first.
4. `node scripts/sync.mjs`
5. `node scripts/check-skills.mjs`, `claude plugin validate . --strict`, and the tests:
   `node --test scripts/*.test.mjs plugins/remotion-video-master/skills/remotion-video-master/scripts/*.test.mjs`
   (the second set needs ffmpeg).
6. `node <ps>/scripts/scan.mjs plugins/<name> --public` for every plugin you changed by hand.
7. `node <ps>/scripts/test-install.mjs --repo . --plugin <name>` for each changed plugin (for a
   master change: the master and one specialist).
8. Commit `feat(<name>): ...` or `fix(<name>): ...` (why, not what), push, `gh run watch`, then
   `test-install.mjs --repo . --plugin <name> --remote https://github.com/tomerhayundev/skills.git`.
9. Refresh the local copies that exist: `~/.claude/skills/<name>` for every changed skill that has
   one. Tomer keeps the master there, not the specialists: both would trigger on the same asks.
10. Report: what changed and why, the new versions, the CI result, and for installed copies
    `claude plugin marketplace update tomerhayundev-skills` plus `claude plugin update <name>@tomerhayundev-skills`.

**Add a skill.** The [publish-skill](plugins/publish-skill/skills/publish-skill/SKILL.md) flow:
clean the source, `node <ps>/scripts/scaffold.mjs --repo . --name <name> --from <folder> --description "<what it does>"`
(it adds the plugin, the catalog entry and a "More skills" row), then steps 4 to 10 above. A new
kind of video is not a new skill: it is a new module in the master.

**Rename.** `git mv plugins/<old> plugins/<new>` and its `skills/<old>`; update the frontmatter
`name`, `plugin.json`, the catalog entry and README row; add `"<old>": "<new>"` to `renames`; add a
note under the README row. Tested on Claude Code 2.1.205: after `marketplace update`, the installed
plugin's enabled key moves to the new name on its own, while `claude plugin update <old>@...` fails
with "not found"; so the note tells users to run `claude plugin install <new>@tomerhayundev-skills`.
A specialist is renamed through its module's `name`; add the `renames` entry by hand.

**Retire** (ask Tomer first). `git mv plugins/<name> archive/<name>`, remove the catalog entry,
add `"<name>": null` to `renames`, move its README row to the Archived table.

**Move between public and private** (ask Tomer first). Publish in the other repo with publish-skill,
then retire here with `"<name>": null`. Anything already pushed publicly by mistake follows
[purge-history](plugins/publish-skill/skills/publish-skill/references/purge-history.md): rotate the
secret first, then rewrite history.

## CI

`.github/workflows/validate.yml` runs on every push to `main` and every pull request.

- **Push to main:** `node scripts/sync.mjs --since=<the commit before the push>`. If anything changed
  (a master edited on github.com, a forgotten bump), CI commits `chore: sync generated skills and
  versions` as github-actions[bot] and pushes it; your clone is then one commit behind. A
  hand-edited specialist fails the run instead of being overwritten.
- **Pull request:** `node scripts/sync.mjs --check`; nothing is committed.
- Then, on both: `check-skills.mjs`, `claude plugin validate . --strict`, the script tests, and
  the beat fitter against the bundled track.

## Health check

Asked to "check the skills repo", or when a scheduled run asks:

- `node scripts/sync.mjs --check`, the checks, the tests, and `test-install.mjs --remote` for every plugin.
- `node plugins/remotion-video-master/skills/remotion-video-master/scripts/recommend.mjs --format=promo --platforms=reels`:
  a warning that the platform specs are over 6 months old means re-verifying `assets/specs.json` from
  the sources in `references/platforms.md`, then a minor release.
- Remotion's latest release notes against the API names the skills use (`Html5Audio`, `trimBefore`,
  `calculateMetadata`) and their `compatibility` line.
- `diff -r` each `~/.claude/skills/<name>` against the repo: newer local edits come home (above),
  stale copies are refreshed.
- The private repo's `scripts/check-skills.mjs` is identical to this one.

## The maintainer agent

It lives in `.claude/agents/skills-maintainer.md`, with an identical copy in `~/.claude/agents/`
so any session can hand it work ("add this skill to my repo", "update the master with what we
learned"). When the agent file changes here, the maintainer copies it there in the same job.

It acts without asking on everything above, including pushes to `main`. It asks Tomer first
before it retires or deletes a skill, moves one between public and private, makes a major
release, force-pushes or rewrites history, or when it is unclear whether content is public.

## The private repo

`tomerhayundev/skills-private` (`tomerhayundev-private-skills`) follows the same rules. Its
`scripts/check-skills.mjs` is a copy of this one: after changing it here, copy it there and push
both.
