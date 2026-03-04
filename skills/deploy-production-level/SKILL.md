---
name: deploy-production-level
description: "Production-grade deployment pipeline setup for web applications using GitHub Actions, Cloudflare (Workers + Pages), and branch protection. Use this skill ONLY when explicitly invoked -- not all projects need this level of deployment rigor. Implements: quality gate CI (typecheck + tests), PR preview deployments, automated production deploys on merge, git-tag-based release tracking, one-click rollback, and a human setup guide. Covers the full method end-to-end: GitHub repo configuration, CI/CD workflows, branch strategy, secrets management, PR templates, rollback procedures, and deployment safety rules for both humans and AI agents."
---

# Production-Level Deployment Pipeline

A complete, battle-tested deployment method that ensures **zero broken deploys** through
automated quality gates, preview environments, and instant rollback capability.

## Architecture Overview

```
Developer writes code
       |
Push to feature branch (NEVER main)
       |
Open Pull Request to main
       |
GitHub Actions: Quality Gate (typecheck + tests + build)
       |
   Pass? --> Preview deployed to pr-<N>.<project>.pages.dev
       |
Human tests preview, approves
       |
Merge PR to main
       |
Quality Gate runs AGAIN on main
       |
   Pass? --> Deploy Worker (API) + Pages (Frontend) in parallel
       |
Git tag created: deploy-YYYYMMDD-HHMMSS-<sha>
```

**If any step fails, nothing deploys. The live site stays safe.**

## Core Principles

1. **Main is sacred** -- No direct pushes. All changes via feature branch + PR.
2. **Quality gate is mandatory** -- Typecheck + tests must pass before ANY deploy.
3. **Double verification** -- Gate runs on PR AND again on merge to main.
4. **Every deploy is tagged** -- Full audit trail with `deploy-*` git tags.
5. **Instant rollback** -- One-click revert via GitHub Actions or Cloudflare dashboard.
6. **Preview before production** -- Every PR gets a live preview URL.
7. **No manual deploys** -- All deploys through CI/CD only.

## Implementation Steps

### Step 1: Create the GitHub Actions Workflows

Create three workflow files. See [references/github-actions-workflows.md](references/github-actions-workflows.md) for complete, copy-paste-ready YAML for all three workflows:

1. **`deploy.yml`** -- Production pipeline (quality gate -> deploy -> tag)
2. **`preview.yml`** -- PR preview deployments with auto-comment
3. **`rollback.yml`** -- Manual rollback via workflow dispatch

### Step 2: Create the PR Template

Create `.github/pull_request_template.md`. See [assets/pull_request_template.md](assets/pull_request_template.md) for the template.

### Step 3: Create the Deployment Safety Doc (for AI agents)

Create `DEPLOYMENT-SAFETY.md` at the repo root. See [references/deployment-safety-template.md](references/deployment-safety-template.md) for the full template. This file is the **single source of truth** that all AI agents must follow.

### Step 4: Create the Human Deployment Guide

Create `DEPLOYMENT-GUIDE.md` at the repo root. See [references/human-setup-guide.md](references/human-setup-guide.md) for the full template. This guide walks the human through daily workflow, rollback procedures, and one-time GitHub setup.

### Step 5: Configure CLAUDE.md / Project Instructions

Add these rules to the project's CLAUDE.md or equivalent AI instructions file:

```markdown
## Critical Deployment Rules

1. **NEVER push directly to `main`** -- All changes must go through a feature branch + pull request.
2. **NEVER deploy manually** -- No `wrangler deploy`, no `npm run deploy:*`. All deploys via GitHub Actions only.
3. **NEVER modify `.github/workflows/` without explicit human approval**.
4. **NEVER skip the quality gate** -- No `--no-verify`, no commenting out CI steps.
5. **Read `DEPLOYMENT-SAFETY.md` before any deployment-related work**.
```

### Step 6: Human One-Time Setup

**IMPORTANT**: The following steps CANNOT be done by an AI agent. Instruct the human to complete them. See [references/human-setup-guide.md](references/human-setup-guide.md) for detailed walkthrough.

#### 6a. GitHub Branch Protection
1. Go to repo Settings -> Branches
2. Add branch protection rule for `main`
3. Enable: Require PR before merging, Require status checks (`Quality Gate`), Require up-to-date branches, Do not allow bypassing

#### 6b. GitHub Actions Secrets
Set these in repo Settings -> Secrets and variables -> Actions:
- `CLOUDFLARE_API_TOKEN` -- API token with Workers Scripts Edit + Pages Edit + D1 Edit
- `CLOUDFLARE_ACCOUNT_ID` -- Cloudflare account ID

#### 6c. Cloudflare API Token
Create at dash.cloudflare.com -> My Profile -> API Tokens with permissions:
- Account: Workers Scripts Edit
- Account: Cloudflare Pages Edit
- Account: D1 Edit (if using D1)

## Adapting to Your Stack

The reference workflows use Cloudflare (Workers + Pages). To adapt:

| Component | Cloudflare | Vercel | AWS | Netlify |
|-----------|-----------|--------|-----|---------|
| Frontend | `wrangler pages deploy` | `vercel deploy` | `aws s3 sync` + CloudFront | `netlify deploy` |
| API | `wrangler deploy` (Worker) | Vercel Functions | Lambda/ECS | Netlify Functions |
| Secrets | `wrangler secret put` | `vercel env add` | AWS Secrets Manager | `netlify env:set` |

The **method** (quality gate -> preview -> merge -> deploy -> tag -> rollback) is universal. Only the deploy commands change.

## Quality Gate Composition

At minimum, the quality gate must include:

```yaml
steps:
  - run: npm ci                    # Install dependencies
  - run: npm run build:shared      # Build shared packages first (if monorepo)
  - run: npm run typecheck         # TypeScript type checking
  - run: npm test                  # Unit/integration tests
```

Optionally add: lint, E2E tests, bundle size checks, security audit.

## Branch Naming Convention

| Prefix | Purpose |
|--------|---------|
| `feature/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `refactor/<name>` | Code cleanup |
| `docs/<name>` | Documentation |

## Rollback Decision Matrix

| Symptom | Action |
|---------|--------|
| Frontend broken, API fine | Rollback `pages-only` |
| API errors, frontend fine | Rollback `worker-only` |
| Both broken or unsure | Rollback `both` |
| GitHub is down | Use hosting dashboard directly |

## Secrets Management Rules

- **NEVER** commit secrets, `.env` files, API keys, or tokens
- Set worker/function secrets via CLI (`wrangler secret put`, `vercel env add`, etc.)
- Set CI secrets via GitHub repo Settings -> Secrets
- Frontend env files may be committed ONLY if they contain public URLs (no secrets)

## Daily Developer Workflow (Quick Reference)

```bash
# 1. Start from latest main
git checkout main && git pull

# 2. Create feature branch
git checkout -b feature/my-change

# 3. Make changes, test locally
npm run typecheck && npm test

# 4. Push and create PR
git push -u origin feature/my-change
gh pr create --title "Add my change" --body "Description"

# 5. Wait for Quality Gate + preview URL
# 6. Test preview, merge when green
gh pr merge <number> --merge

# 7. Verify deploy (~2 min after merge)
git tag --list 'deploy-*' --sort=-creatordate | head -1
```
