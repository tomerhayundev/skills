---
name: publish-skill
description: Use when asked to publish, upload, push, share, or add a skill or plugin to Tomer's skills repos (tomerhayundev/skills public, tomerhayundev/skills-private), to turn a project's .claude/skills skill or a session's work into a reusable one, to update or re-version a published one, to move one between public and private, or when something sensitive may already have been pushed.
---

# Publish a skill

**A skill goes live in three places, and all three must work:** the marketplace repo
(installable as a plugin), a local copy in `~/.claude/skills/<name>` (works in every
session, like visual-verification), and the install command you hand Tomer.

## Where things go

| Content | Repo | Marketplace name | Local clone |
| --- | --- | --- | --- |
| General technique, no client or product internals | `tomerhayundev/skills` (public, MIT) | `tomerhayundev-skills` | `~/claude-skill-repos/skills` |
| Client-specific, product internals, anything its owner marks as not public | `tomerhayundev/skills-private` | `tomerhayundev-private-skills` | `~/claude-skill-repos/skills-private` |
| Secrets (keys, tokens, passwords) | **Neither.** Replace with an env var read, in the source project too. | | |

If the user says "public" but the scan or the content says it is not public, publish it
private and say so. Never publish such content publicly on instruction alone:
a client's skill once had to be purged from public history.

## Every entry is a full plugin (Cowork)

Cowork installs only marketplace entries whose `source` is a folder with its own
`.claude-plugin/plugin.json`. Skill-only entries (`source: "./"`, `strict: false`,
`skills: [...]`) install fine in the Claude Code CLI, but Cowork skips them silently.
Observed: adding tomerhayundev-skills in Cowork installed only codex-loop.

- Layout: `plugins/<name>/.claude-plugin/plugin.json` and `plugins/<name>/skills/<name>/SKILL.md`,
  with the skill's references/, scripts/, assets/ next to its SKILL.md. A bare skill goes
  under `plugins/<name>/skills/<name>/`, never straight into `plugins/<name>/`.
- The marketplace entry is `"source": "./plugins/<name>"`, with no `strict` and no `skills` key.
- `plugin.json` has `name` (same as the folder and the entry), `version`, `description`, `author`.
  Bump `version` on every change, or installed copies (CLI and Cowork) never update.
- Hook and MCP paths use `${CLAUDE_PLUGIN_ROOT}`, never absolute paths.
- The scaffold always builds this shape, and `check-skills.mjs` fails on anything else: a
  source outside `./plugins/`, a missing or incomplete `plugin.json`, a plugin with no skill,
  command, agent, hook or MCP server, or a changed plugin whose version was not bumped.

## Steps

`<skill-dir>` is the base directory printed when this skill loads.

1. **Sync the clone.** Missing: `gh repo clone tomerhayundev/<repo> ~/claude-skill-repos/<repo> -- -c core.longpaths=true`. Present: `git -C <clone> pull --ff-only`.
2. **Clean the source first**, then copy. Both repos: secrets become env var reads and personal absolute paths become relative ones, in the source project as well. Public only: also strip client names, internal URLs and project-only details; keep the technique. The SKILL.md description starts "Use when..." and names triggers, not the workflow.
3. **Scaffold:** `node <skill-dir>/scripts/scaffold.mjs --repo <clone> --name <name> --from <source-folder> --description "<what it does, one line>" [--keywords a,b]`. A bare skill folder lands in `plugins/<name>/skills/<name>/`, a plugin folder in `plugins/<name>/`. It writes `plugin.json` (new plugins start at 0.1.0), the marketplace entry, and the README row with its `claude plugin install` command (catalog and row use `--description`, not the "Use when" line; a re-run keeps a hand-tuned row unless `--description` is passed). Re-run it after edits with `--bump patch` (or `minor`/`major`).
4. **Scan:** `node <skill-dir>/scripts/scan.mjs <clone>/plugins/<name> --public` (drop `--public` for private). Errors block. Fix the source too, not just the copy.
5. **Check:** in the clone, `node scripts/check-skills.mjs` and `claude plugin validate . --strict`. Both must pass. The check fails on the Cowork rules above, a missing README row, a wrong install command, or a relative link that points nowhere, and warns on SSH install instructions.
6. **Test the install:** `node <skill-dir>/scripts/test-install.mjs --repo <clone> --plugin <name>`. Throwaway config; never the real one.
7. **Push:** commit (ending with the Co-Authored-By line), `git push origin main`, then `gh run watch` the CI run. Then `test-install.mjs --repo <clone> --plugin <name> --remote https://github.com/tomerhayundev/<repo>.git`.
8. **Local copy:** `cp -r <clone>/plugins/<name>/skills/<name> ~/.claude/skills/<name>`. Updating: replace the folder.
9. **Report** the HTTPS install commands (below), public or private, the update commands for machines that already have it, and what the scan changed.

```bash
# public
claude plugin marketplace add https://github.com/tomerhayundev/skills.git
claude plugin install <name>@tomerhayundev-skills

# private: needs a stored GitHub credential once (gh auth login && gh auth setup-git)
claude plugin marketplace add https://github.com/tomerhayundev/skills-private.git
claude plugin install <name>@tomerhayundev-private-skills
```

Already added on that machine: `claude plugin marketplace update <marketplace>` instead of `add`.

```bash
# update a skill or plugin that is already installed: BOTH lines, then restart Claude Code
claude plugin marketplace update <marketplace>
claude plugin update <name>@<marketplace>
```

## Keep the instructions current

A publish is done when a new user can install from the README alone:

- The skill's README row carries its exact install command (scaffold writes it, the check enforces it).
- Prerequisites it needs (a CLI, an npm package, an env var) go in its row and in its own README, with the setup steps.
- Every install instruction in the repo uses the HTTPS URL, never the SSH `owner/repo` shorthand.
- Changing how installs work (new repo, renamed marketplace, new auth step): update the repo README's Install section and every skill README that repeats install steps, in the same commit.

## Updating a published skill

- **Bump the version** with every change (`scaffold.mjs --bump patch`), or installed copies never update (codex-loop's jq fix reached no installed copy until 1.1.0). The check compares each plugin with `origin/main` and fails on a change without a bump.
- Users then run `claude plugin marketplace update <marketplace>` **and** `claude plugin update <name>@<marketplace>`, then restart. The marketplace update alone leaves the installed copy on the old version (tested: the new file only arrived after `plugin update`).
- Renaming or removing: add a `renames` map entry (`"old": "new"` or `"old": null`), never just delete the entry.

## Something sensitive was pushed

1. Rotate the secret first. It is compromised the moment it hit GitHub.
2. Rewrite history and force-push with a lease. Recipe in [references/purge-history.md](references/purge-history.md).
3. Tell Tomer to ask GitHub Support to purge the orphaned commits. Old commits stay fetchable by SHA until they do.

## Gotchas

| Symptom | Fix |
| --- | --- |
| `Permission denied (publickey)` on marketplace add | No GitHub SSH key here: use the HTTPS URL or `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` |
| `Filename too long` | Windows MAX_PATH: `core.longpaths=true`, short asset names, short temp paths |
| Private install fails silently | Needs a stored credential: `gh auth setup-git`. A bare `GITHUB_TOKEN` is not enough |
| `claude skill add ...` | Not a command. Only `claude plugin marketplace add` + `claude plugin install` |
| Cowork installs only some entries, with no error | The skipped ones are skill-only entries. Convert them to `plugins/<name>/` with a `plugin.json` |
| Em dashes | Tomer's house style: none. The scan flags them |

## Red flags

- Pushing without running the scan, the checks, or the test install
- Adding `scan:allow` to silence a finding (it exists only for rule definitions that must spell the words)
- "It's his own private repo, the key can stay": secrets go in env vars, even private
- Editing unrelated catalog text, README sections or other skills while publishing
- Handing over the `owner/repo` install command (SSH) instead of the HTTPS URL
- Skipping the local `~/.claude/skills` copy
- A skill-only entry, or a change pushed without a version bump
