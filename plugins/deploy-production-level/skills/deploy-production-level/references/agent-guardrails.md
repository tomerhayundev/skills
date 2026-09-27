# Agent Guardrails

Two layers, because instructions are context and hooks are enforcement:

1. **Rules** in `CLAUDE.md` (and `AGENTS.md` for Codex, Cursor, Copilot and others) tell agents how deploys work and what not to do.
2. **The `deploy-guard.mjs` PreToolUse hook** blocks the dangerous commands in Claude Code even when an agent forgets or rationalizes past the rules.

The GitHub ruleset is the third layer and the only real security boundary. It rejects the push on the server no matter who sends it.

## 1. The rules block

Where it goes:

- **Other agents (Codex, Cursor, Copilot) work in the repo, or it already has an `AGENTS.md`:** put the section in `AGENTS.md`, and make sure `CLAUDE.md` contains the line `@AGENTS.md`. Claude Code reads `AGENTS.md` on its own only when there is no `CLAUDE.md`.
- **Otherwise:** put it in `CLAUDE.md`.

```markdown
## Deployment rules

How deploys work: a PR to `main` runs the Quality Gate (and a preview, if enabled). Merging to `main` deploys **staging**. A promotion PR from `main` to `production` deploys **production**, tags it `deploy-<timestamp>-<sha>`, and rolls back automatically if the smoke test fails. Details: `DEPLOYMENT-GUIDE.md`.

1. Never push to `main` or `production`. Work on a branch (`feature/`, `fix/`, `refactor/`, `docs/`) and open a PR with `gh pr create`.
2. Never deploy, roll back or migrate a remote database by hand: no `wrangler deploy`, `wrangler rollback`, `wrangler versions deploy`, `wrangler d1 migrations apply --remote`, or `npm run deploy*`. GitHub Actions does all of it.
3. Never merge a PR into `production`. Opening the promotion PR is fine; a human merges it.
4. Never change `.github/workflows/` without the human approving that specific change.
5. Never weaken the Quality Gate: no `--no-verify`, no skipped or deleted tests, no commented-out CI steps. Fix the failure.
6. Never commit secrets or `.env` files, and never run `wrangler secret put`. Ask the human to set secrets.
7. D1 migrations must be backward-compatible: the currently deployed code has to keep working on the new schema. Add a column now and drop the old one in a later release, never both in one PR.
8. Before pushing, run the gate locally: `npm run typecheck && npm run lint && npm test && npm run build`.

A hook (`.claude/hooks/deploy-guard.mjs`) blocks the commands behind rules 1, 2 and 6 and makes you ask the human before merging a PR or editing workflows (rules 3 and 4). It cannot see what you commit, so rule 6's "no secrets in commits" is on you. If it blocks you, that is the answer: do not look for another way to run the command.
```

## 2. The hook

Copy [../assets/deploy-guard.mjs](../assets/deploy-guard.mjs) to `.claude/hooks/deploy-guard.mjs` and register it in the project's `.claude/settings.json`, committed so it applies to everyone's sessions. **Merge** this into the existing file; do not overwrite other settings.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/deploy-guard.mjs"]
          }
        ]
      }
    ]
  }
}
```

The exec form (`command` plus `args`) works the same on Windows, macOS and Linux. It needs Claude Code 2.1.139 or newer (`claude --version`): older versions start `node` without the script, and the guard silently does nothing. The in-session check in step 3 catches that.

What it does:

| Decision | Triggers |
|---|---|
| deny | `git push` to `main`/`production` (explicit refspec, `HEAD`, a bare `git push` while on those branches, `--all`, `--mirror`); `wrangler deploy` (not `--dry-run`), `rollback`, `versions deploy`, `triggers deploy`, `pages deploy`; any `secret put/delete/bulk`; `d1 migrations apply --remote`; `d1 time-travel restore`; deleting a Worker, Pages project, D1, KV namespace, R2 bucket or queue; `run deploy*` scripts in any package manager; `opennextjs-cloudflare deploy`; `vercel --prod`; `netlify deploy --prod` |
| ask | `gh pr merge`, `gh workflow run`, `wrangler d1 execute --remote`, and any edit to `.github/workflows/`, a Wrangler config file (`wrangler*.jsonc`/`.json`/`.toml`: production bindings, routes, database IDs), `.claude/settings*.json` or the guard itself |
| no opinion | everything else, including `wrangler preview`, `versions upload`, `deployments list`, `dev`, `tail`, local D1 commands, and text that only mentions these commands (commit messages, `grep`, `echo`, heredoc bodies) |

It understands `npx`, `pnpm exec`, `npm exec -w <ws> --`, `npm --prefix <dir> run`, `pnpm --filter`, `node_modules/.bin`, `VAR=x` prefixes, `cd x && ...` chains, `sh -c "..."` and PowerShell's `;`. It does not try to catch deliberate evasion; the ruleset covers that.

Protected branch names live in `PROTECTED_BRANCHES` at the top of the script. Change them if the project uses `master` or `staging`.

## 3. Verify the hook

Run these from the repo root. The first must print a JSON `deny`; the second must print nothing:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"npx wrangler deploy"},"cwd":"."}' | node .claude/hooks/deploy-guard.mjs
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"note: wrangler deploy is CI only\""},"cwd":"."}' | node .claude/hooks/deploy-guard.mjs
```

Then, in a new Claude Code session, ask the agent to run `npx wrangler deploy` and confirm it is refused with a `deploy-guard:` reason. Restart the session after changing `.claude/settings.json`.

## Other agents

Codex, Cursor and Copilot read the `AGENTS.md` rules but not Claude Code hooks. For them the ruleset is the enforcement: without GitHub Pro on a private repo there is none, so tell the human.

A local git pre-push hook (for example Husky, `.husky/pre-push`) that refuses pushes to `main` and `production` protects against every agent and human on that machine. It is optional and easy to skip with `--no-verify`, so it complements the ruleset rather than replacing it.
