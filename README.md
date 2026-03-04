# Claude Code Skills

A collection of reusable skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Available Skills

### deploy-production-level

Production-grade deployment pipeline setup for web applications. Implements quality gate CI, PR preview deployments, automated production deploys, git-tag release tracking, one-click rollback, and human setup guides.

**Install:**

```bash
claude skill add --url https://github.com/tomerhayundev/skills/tree/main/deploy-production-level
```

### codex-loop

Iterative Codex CLI loop with Claude as orchestrator. Runs `codex exec` across multiple iterations — Claude evaluates each result and loops until the task is genuinely complete.

**Install:**

```bash
claude plugin install https://github.com/tomerhayundev/skills/tree/main/codex-loop
```

---

## What are Skills?

Skills are modular packages that extend Claude Code with specialized knowledge, workflows, and tools. They turn Claude from a general-purpose agent into a domain expert.

## Adding a Skill

```bash
claude skill add --url https://github.com/tomerhayundev/skills/tree/main/<skill-name>
```
