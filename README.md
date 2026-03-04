# Claude Code Plugins & Skills

A collection of plugins and skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Plugins

### codex-loop

Iterative Codex CLI loop with Claude as orchestrator. Runs `codex exec` across multiple iterations — Claude evaluates each result and loops until the task is genuinely complete.

**Install:**

```bash
claude plugin marketplace add tomerhayundev/skills
claude plugin install codex-loop@tomerhayundev-skills
```

**Usage:**

```bash
/codex-loop "Build a REST API with CRUD and tests" --completion-promise "ALL TESTS PASSING"
```

See [`plugins/codex-loop`](./plugins/codex-loop/README.md) for full documentation.

---

## Skills

### deploy-production-level

Production-grade deployment pipeline setup for web applications. Implements quality gate CI, PR preview deployments, automated production deploys, git-tag release tracking, one-click rollback, and human setup guides.

**Install:**

```bash
claude skill add --url https://github.com/tomerhayundev/skills/tree/main/skills/deploy-production-level
```

### stackgrid-packing-algorithm

Deep knowledge of the StackGrid packing algorithm system — the proprietary core of the container/pallet optimization engine.

**Install:**

```bash
claude skill add --url https://github.com/tomerhayundev/skills/tree/main/skills/stackgrid-packing-algorithm
```

---

## What are Plugins vs Skills?

- **Plugins** use Claude Code's plugin system (`claude plugin install`) and can include slash commands, hooks, and scripts
- **Skills** are markdown-based instruction sets loaded via the skills system (`claude skill add`)
