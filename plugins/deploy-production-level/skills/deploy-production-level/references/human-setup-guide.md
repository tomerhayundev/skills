# DEPLOYMENT-GUIDE.md template

Copy everything below the line into `DEPLOYMENT-GUIDE.md` at the repo root. Replace `my-app`, the URLs and the D1 names with the project's real ones, and delete the sections that do not apply (Previews, D1). It is written for the human who owns the project; agents read it too.

---

# Deployment Guide

Nothing reaches production without passing the Quality Gate twice, running on staging, and being promoted by you. Every production deploy is tagged, and rolling back takes one click.

| Environment | URL | Deploys when |
|---|---|---|
| Production | `https://my-app.example.com` | a promotion PR is merged into `production` |
| Staging | `https://my-app-staging.<subdomain>.workers.dev` | a PR is merged into `main` |
| PR preview | `https://pr-<N>-my-app.<subdomain>.workers.dev` | a PR is opened or updated (link posted on the PR) |
| Local | `http://localhost:8787` | `npm run dev` |

## Contents
- [One-time GitHub setup](#one-time-github-setup)
- [One-time Cloudflare setup](#one-time-cloudflare-setup)
- [Daily workflow](#daily-workflow)
- [What is live right now](#what-is-live-right-now)
- [Rolling back](#rolling-back)
- [When an AI agent asks you](#when-an-ai-agent-asks-you)

---

## One-time GitHub setup

### 1. Create the `production` branch

Do this after the PR that adds the pipeline is merged into `main`, so `production` starts with the new workflows. On the repo page, open the branch dropdown, type `production`, and choose **Create branch production from main**.

### 2. Protect `main` and `production`

Rulesets (and classic branch protection) work on public repos on every plan, and on private repos with GitHub Pro, Team or Enterprise. On a private repo on the Free plan nothing on GitHub can block a push to `main`: only the Claude Code hook in `.claude/hooks/` does, and it only stops Claude.

1. **Settings** > **Rules** > **Rulesets** > **New ruleset** > **New branch ruleset**.
2. Name: `main`. Enforcement status: **Active**. Leave the **Bypass list** empty, so the rules bind admins too.
3. **Target branches** > **Add target** > **Include by pattern** > `main`.
4. Turn on:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging**. Required approvals: `0` if you work alone (you cannot approve your own PR), `1` or more with a team.
   - **Require status checks to pass** > **Add checks** > `Quality Gate`. It only appears after CI has run once, so open a first PR before this step. Leave "Require branches to be up to date" off: the deploy re-runs the gate on the merged code anyway.
5. **Create**.
6. Repeat for a ruleset named `production` targeting `production`, with one difference: under **Require a pull request before merging** > **Allowed merge methods**, keep only **Merge**. Squash or rebase would make `main` and `production` diverge, and every later promotion would conflict.
7. If **Settings** > **Branches** still lists an old classic protection rule, delete it. Its "require branches to be up to date" setting blocks every promotion PR, because `production` always holds merge commits that `main` lacks.

**Who can deploy:** a PR from a branch in this repo runs its own copy of the preview workflow with the Cloudflare token, before review. So anyone (or any agent) with write access to the repo can reach Cloudflare. Give write access only to those you would let deploy.

### 3. Secrets and variables

**Settings** > **Secrets and variables** > **Actions**.

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | the token from the Cloudflare setup below |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard > Workers & Pages > Account details, or `npx wrangler whoami` |
| Variable | `STAGING_URL` | the staging URL, no trailing slash |
| Variable | `PRODUCTION_URL` | the production URL, no trailing slash |

Or from a terminal: `gh secret set CLOUDFLARE_API_TOKEN` (it prompts for the value) and `gh variable set PRODUCTION_URL --body "https://my-app.example.com"`.

### 4. Check the PR template

Open any PR and confirm the checklist from `.github/pull_request_template.md` appears.

---

## One-time Cloudflare setup

### API token

1. https://dash.cloudflare.com > profile icon > **My Profile** > **API Tokens** > **Create Token**.
2. **Edit Cloudflare Workers** template > **Use template**.
3. **Add more** permissions: **Account** > **D1** > **Edit** (if the app uses D1), and **Account** > **Cloudflare Pages** > **Edit** (if any site still deploys to Pages).
4. **Account Resources**: your account. **Zone Resources**: the app's zone if it has a custom domain, otherwise all zones.
5. **Continue to summary** > **Create Token**. Copy it now; it is shown once. Save it as the `CLOUDFLARE_API_TOKEN` secret.

### Staging and preview resources

Every resource the Worker binds needs a staging copy and a preview copy (plus the production one, in a new project), so neither environment can touch production data. Previews share one copy, so a PR never needs its own:

```bash
npx wrangler d1 create my-app-db-staging
npx wrangler d1 create my-app-db-preview
npx wrangler kv namespace create my-app-cache-staging     # one pair per KV namespace
npx wrangler kv namespace create my-app-cache-preview
npx wrangler r2 bucket create my-app-uploads-staging      # one pair per R2 bucket
npx wrangler r2 bucket create my-app-uploads-preview
```

Put the IDs and names into the Wrangler config: staging under `env.staging`, preview under `previews`, and the preview D1 also into `wrangler.preview-migrations.jsonc`. Put the config change in a PR like any other.

### OAuth and CORS

If the app signs in with Google, GitHub or similar, register the staging URL's callback with the provider (per-PR preview hostnames change, so test sign-in on staging). If the API has a CORS allowlist, add the staging and preview origins.

### Worker secrets

Set each runtime secret once per environment. Agents are blocked from this on purpose, so run these yourself:

```bash
npx wrangler secret put STRIPE_SECRET_KEY                              # production
npx wrangler secret put STRIPE_SECRET_KEY --env staging                # staging
npx wrangler preview base-config secret put STRIPE_SECRET_KEY          # every new PR preview
```

Use test-mode keys for staging and previews.

### Preview URLs

Previews live on your `workers.dev` subdomain (**Workers & Pages** > **Account details** > **Subdomain**). They are public by default. To require a login, put them behind Cloudflare Access (Cloudflare docs: Previews, custom domains, protect preview content).

---

## Daily workflow

```bash
# 1. Branch from the latest main
git switch main && git pull
git switch -c feature/my-change

# 2. Commit, run the gate locally, push
npm run typecheck && npm run lint && npm test && npm run build
git push -u origin feature/my-change

# 3. Open a PR to main. CI runs the Quality Gate; a bot comments the preview URL
gh pr create --base main --fill

# 4. Test the preview, then merge. This deploys to STAGING
gh pr merge --squash --delete-branch

# 5. Check staging. When you are happy, open a promotion PR
gh pr create --base production --head main --title "Release $(date +%F)" --body "What is going live: see the commit list."

# 6. Read the PR's commit list: that is exactly what goes live. Merge with a merge commit
gh pr merge <NUMBER> --merge
```

After step 6 the pipeline deploys production, smoke-tests it, rolls back by itself if the smoke test fails, and tags the release. Watch it under **Actions** > **Deploy Production**.

**Urgent fix while `main` holds unreleased work:** branch from `production`, open the PR into `production` (the gate still runs), merge, then open a PR from `production` into `main` so the fix is not lost.

---

## What is live right now

```bash
npx wrangler deployments status                    # production: version ID and message
npx wrangler deployments status --env staging      # staging
git fetch --tags && git tag --list 'deploy-*' --sort=-creatordate | head -1   # last production release
git log origin/production..origin/main --oneline   # on staging, not yet in production
```

---

## Rolling back

### Option A: GitHub Actions (normal)

1. **Actions** > **Rollback Production** > **Run workflow**.
2. Leave **target** empty to go back to the release before the latest one, or paste a `deploy-...` tag or a Worker version ID. Tags made before this pipeline existed hold no version ID: for those, paste the ID from `npx wrangler deployments list`.
3. **Run workflow**. It switches production to that version in seconds (no rebuild) and smoke-tests it.

### Option B: Cloudflare dashboard (GitHub is down)

**Workers & Pages** > `my-app` > **Deployments** > the last good version > **...** > **Rollback**. Instant.

### Afterwards

A rollback buys time; it does not fix anything. Revert the bad PR on `main` (the **Revert** button on the merged PR), let staging confirm, and promote again.

A rollback does **not** undo D1 migrations. That is why migrations must keep the old code working. If a migration itself destroyed data, D1 Time Travel can restore the database to a moment before it (`npx wrangler d1 time-travel restore my-app-db --timestamp=<unix time>`). This also drops every write made after that moment, so it is your call, never an agent's.

---

## When an AI agent asks you

| The agent asks | Answer |
|---|---|
| "Can I push to main?" | No. Branch and PR. The hook blocks it anyway |
| "Can I deploy / roll back / run the migration?" | No. The pipeline does it. For a rollback, you press the button |
| "Can I merge the promotion PR?" | No. You read the commit list and merge it |
| "Can I change a workflow?" | Only after you have read the diff |
| "Tests fail, can I skip them?" | No. Fix them |
| "Can I set this secret?" | No. You run `wrangler secret put` yourself |
| "Can I drop or rename this column?" | Only in a later release, after no deployed code reads it |

Their rulebook is the "Deployment rules" section of `CLAUDE.md` / `AGENTS.md`.
