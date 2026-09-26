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

## Steps

`<skill-dir>` is the base directory printed when this skill loads.

1. **Sync the clone.** Missing: `gh repo clone tomerhayundev/<repo> ~/claude-skill-repos/<repo> -- -c core.longpaths=true`. Present: `git -C <clone> pull --ff-only`.
2. **Clean the source first**, then copy. Both repos: secrets become env var reads and personal absolute paths become relative ones, in the source project as well. Public only: also strip client names, internal URLs and project-only details; keep the technique. The SKILL.md description starts "Use when..." and names triggers, not the workflow.
3. **Scaffold:** `node <skill-dir>/scripts/scaffold.mjs --repo <clone> --name <name> --from <source-folder> --description "<what it does, one line>" [--plugin] [--keywords a,b]`. Copies the files, adds the marketplace entry and the README row with its `claude plugin install` command (both use `--description`, not the "Use when" line). Re-run it after edits to refresh them. `--plugin` (or a source with `.claude-plugin/plugin.json`) makes a full plugin under `plugins/` for hooks, agents, commands or MCP.
4. **Scan:** `node <skill-dir>/scripts/scan.mjs <clone>/skills/<name> --public` (drop `--public` for private). Errors block. Fix the source too, not just the copy.
5. **Check:** in the clone, `node scripts/check-skills.mjs` and `claude plugin validate . --strict`. Both must pass. The check fails when an entry has no README row or its install command is wrong, and warns on SSH install instructions.
6. **Test the install:** `node <skill-dir>/scripts/test-install.mjs --repo <clone> --plugin <name>`. Throwaway config; never the real one.
7. **Push:** commit (ending with the Co-Authored-By line), `git push origin main`, then `gh run watch` the CI run. Then `test-install.mjs --repo <clone> --plugin <name> --remote https://github.com/tomerhayundev/<repo>.git`.
8. **Local copy:** `cp -r <clone>/skills/<name> ~/.claude/skills/<name>` (plugin: its `skills/<name>` folder). Updating: replace the folder.
9. **Report** the HTTPS install commands (below), public or private, and what the scan changed.

```bash
# public
claude plugin marketplace add https://github.com/tomerhayundev/skills.git
claude plugin install <name>@tomerhayundev-skills

# private: needs a stored GitHub credential once (gh auth login && gh auth setup-git)
claude plugin marketplace add https://github.com/tomerhayundev/skills-private.git
claude plugin install <name>@tomerhayundev-private-skills
```

Already added on that machine: `claude plugin marketplace update <marketplace>` instead of `add`.

## Keep the instructions current

A publish is done when a new user can install from the README alone:

- The skill's README row carries its exact install command (scaffold writes it, the check enforces it).
- Prerequisites it needs (a CLI, an npm package, an env var) go in its row and in its own README, with the setup steps.
- Every install instruction in the repo uses the HTTPS URL, never the SSH `owner/repo` shorthand.
- Changing how installs work (new repo, renamed marketplace, new auth step): update the repo README's Install section and every skill README that repeats install steps, in the same commit.

## Updating a published skill

- Skill-only entries track the commit: push, then users run `claude plugin marketplace update tomerhayundev-skills`.
- Full plugins with a `version` in `plugin.json`: **bump it**, or installed copies never update (codex-loop's jq fix reached no installed copy until 1.1.0). Users then run `claude plugin update <name>@<marketplace>`.
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
| Em dashes | Tomer's house style: none. The scan flags them |

## Red flags

- Pushing without running the scan, the checks, or the test install
- Adding `scan:allow` to silence a finding (it exists only for rule definitions that must spell the words)
- "It's his own private repo, the key can stay": secrets go in env vars, even private
- Editing unrelated catalog text, README sections or other skills while publishing
- Handing over the `owner/repo` install command (SSH) instead of the HTTPS URL
- Skipping the local `~/.claude/skills` copy
