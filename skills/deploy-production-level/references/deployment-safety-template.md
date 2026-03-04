# Deployment Safety Template

Create this file as `DEPLOYMENT-SAFETY.md` at the repo root. This is the **single source of truth** for AI agents. Customize the placeholders marked with `<...>`.

---

```markdown
# DEPLOYMENT SAFETY -- Single Source of Truth

> **Audience**: LLM agents (Claude Code, Codex, Cursor, etc.) working on this codebase.
> **Rule**: If you are an AI agent, you MUST read and follow this file before pushing code or modifying CI/CD.

---

## Golden Rules

1. **NEVER push directly to `main`** -- All changes go through a feature branch + pull request.
2. **NEVER deploy manually** -- Do NOT run `wrangler deploy`, `npm run deploy:*`, or any deploy command. All deployments happen automatically via GitHub Actions after merging to `main`.
3. **NEVER modify `.github/workflows/` without explicit human approval** -- These are the safety gates.
4. **NEVER commit secrets** -- No `.env` files, API keys, tokens, or credentials.
5. **NEVER use `git push --force` on `main`** -- This can destroy deploy history and tags.
6. **NEVER skip the quality gate** -- Do not add `--no-verify`, do not comment out CI steps.
7. **ALWAYS build shared/common packages before app packages** -- Build order matters in monorepos.

---

## How Deployment Works

Feature Branch -> Pull Request -> Quality Gate (CI) -> Merge to main -> Quality Gate again -> Deploy -> Tag Release

### Pipeline: `.github/workflows/deploy.yml`

Triggered on: push to `main`, manual dispatch.

| Job | Depends On | What It Does |
|---|---|---|
| `quality-gate` | -- | `npm ci` -> build shared -> typecheck -> tests |
| `deploy-worker` | quality-gate | Build + deploy API |
| `deploy-pages` | quality-gate | Build + deploy frontend |
| `tag-release` | deploy-worker + deploy-pages | Creates git tag `deploy-YYYYMMDD-HHMMSS-<sha>` |

**If `quality-gate` fails, nothing deploys.**

### Pipeline: `.github/workflows/preview.yml`

Triggered on: pull request to `main`.
Runs the same quality gate, then deploys a preview and comments the URL on the PR.

### Pipeline: `.github/workflows/rollback.yml`

Triggered on: manual dispatch only.
Inputs: `target_tag` (optional), `component` (`both`, `pages-only`, `worker-only`).

---

## Branch Strategy

| Branch | Purpose | Deploys To |
|---|---|---|
| `main` | Production | Live site (auto-deploy) |
| `feature/*`, `fix/*` | Development work | Preview URL via PR |

---

## Pre-Push Checklist (for AI agents)

Before creating a PR or pushing any code:

1. Build shared packages (must pass)
2. Typecheck everything (must pass)
3. Run tests (must pass)
4. Build frontend (must pass)

If ANY of these fail, DO NOT push. Fix the issue first.

---

## Version Tracking

Every production deploy is tagged: `deploy-YYYYMMDD-HHMMSS-<short-sha>`

To check latest deploy:
git tag --list 'deploy-*' --sort=-creatordate | head -1

---

## Rollback Procedure

### Automated (preferred)
1. GitHub -> Actions -> "Rollback Production"
2. Click "Run workflow"
3. Choose component (`both`, `pages-only`, `worker-only`)
4. Optionally specify a deploy tag

### Manual Emergency
1. Go to your hosting dashboard (Cloudflare, Vercel, etc.)
2. Find the last working deployment
3. Click "Rollback to this deployment"

---

## Secrets Management

Secrets are set via CLI, never committed:
- Worker/API secrets: via platform CLI (e.g. `wrangler secret put <NAME>`)
- CI secrets: GitHub repo Settings -> Secrets and variables -> Actions

---

## Environment Reference

| Environment | Frontend URL | API URL |
|---|---|---|
| Production | `<PROD_FRONTEND_URL>` | `<PROD_API_URL>` |
| Development | `http://localhost:<PORT>` | `http://localhost:<API_PORT>` |
| PR Preview | `pr-<N>.<project>.pages.dev` | Uses production API |
```
