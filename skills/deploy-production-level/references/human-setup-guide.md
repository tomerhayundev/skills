# Human Setup Guide

This guide is for the **human developer/owner** of the project. An AI agent cannot complete these steps -- they require browser access to GitHub and Cloudflare dashboards.

## Table of Contents
- [One-Time GitHub Setup](#one-time-github-setup)
- [One-Time Cloudflare Setup](#one-time-cloudflare-setup)
- [Daily Workflow](#daily-workflow)
- [How to Know What is Live](#how-to-know-what-is-live)
- [Rollback Procedures](#rollback-procedures)
- [When AI Agents Ask You Things](#when-ai-agents-ask-you-things)
- [Quick Command Reference](#quick-command-reference)

---

## One-Time GitHub Setup

### 1. Enable Branch Protection on `main`

1. Go to your repo on GitHub
2. Click **Settings** (tab at the top)
3. Click **Branches** (left sidebar)
4. Click **"Add branch protection rule"** (or edit existing)
5. Set **Branch name pattern** to: `main`
6. Enable these checkboxes:
   - [x] **Require a pull request before merging**
   - [x] **Require status checks to pass before merging**
     - Click the search box and type `Quality Gate` -- select it
   - [x] **Require branches to be up to date before merging**
   - [x] **Do not allow bypassing the above settings**
     - This protects you from accidentally pushing to main, even as admin
7. Click **Save changes**

### 2. Add GitHub Actions Secrets

1. Go to your repo on GitHub
2. Click **Settings** -> **Secrets and variables** -> **Actions**
3. Click **"New repository secret"** for each:

| Secret Name | Where to Get It |
|------------|----------------|
| `CLOUDFLARE_API_TOKEN` | See Cloudflare setup below |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard -> right sidebar -> Account ID |

### 3. Verify the PR Template

After the AI agent creates `.github/pull_request_template.md`, open a test PR to confirm the checklist appears automatically.

---

## One-Time Cloudflare Setup

### Create an API Token

1. Go to https://dash.cloudflare.com
2. Click your profile icon (top right) -> **My Profile**
3. Click **API Tokens** (left sidebar)
4. Click **"Create Token"**
5. Click **"Create Custom Token"**
6. Configure permissions:
   - **Account** -> **Workers Scripts** -> **Edit**
   - **Account** -> **Cloudflare Pages** -> **Edit**
   - **Account** -> **D1** -> **Edit** (only if using D1 database)
7. Set **Account Resources** to your account
8. Click **Continue to summary** -> **Create Token**
9. **Copy the token immediately** -- you will not see it again
10. Paste it as the `CLOUDFLARE_API_TOKEN` GitHub secret

---

## Daily Workflow

### What Changed from Before

**Before**: Push to `main` -> deploys immediately. No tests. No reviews. One bad commit = broken site.

**After**: Every deploy must pass typecheck + tests. PRs get preview URLs. You can rollback in 30 seconds.

### Step-by-Step

```
1. Create a feature branch
   git checkout main && git pull
   git checkout -b feature/my-change

2. Make changes, push
   git add <files>
   git commit -m "what you changed"
   git push -u origin feature/my-change

3. Open a Pull Request
   Go to GitHub -> you will see a "Compare & pull request" banner
   Fill in the checklist

4. Wait for Quality Gate
   Green checks = safe to merge
   Red X = fix issues, push again

5. Check the Preview
   A bot comment will appear with a preview URL
   Open it and test your changes on a real deployment

6. Merge the PR (this deploys to production)
   Option A (terminal): gh pr merge <NUMBER> --merge
   Option B (GitHub UI): Click green "Merge pull request" button

7. Verify the deploy (~2 minutes after merge)
   Check the version in the dashboard sidebar
   or: git tag --list 'deploy-*' --sort=-creatordate | head -1
```

---

## How to Know What is Live

**In the app**: Look at the dashboard sidebar (bottom-left when expanded). You will see a version like `v abc1234`. Hover for the build timestamp.

**From terminal**:
```bash
# See all deploy tags
git tag --list 'deploy-*' --sort=-creatordate

# See the latest deploy
git tag --list 'deploy-*' --sort=-creatordate | head -1

# See what changed since last deploy
LAST_TAG=$(git tag --list 'deploy-*' --sort=-creatordate | head -1)
git log $LAST_TAG..main --oneline
```

---

## Rollback Procedures

### Option A: GitHub Actions (recommended)

1. Go to your repo on GitHub
2. Click **Actions** tab
3. Click **"Rollback Production"** in the left sidebar
4. Click **"Run workflow"** (top right)
5. Choose what to rollback:
   - `both` -- frontend + API (safest if unsure)
   - `pages-only` -- just the frontend
   - `worker-only` -- just the API
6. Leave "target_tag" empty for previous deploy, or paste a specific tag
7. Click the green **"Run workflow"** button
8. Wait ~2 minutes, verify the site

### Option B: Cloudflare Dashboard (emergency, no GitHub needed)

1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages**
3. Click your project name
4. Go to **Deployments** tab
5. Find the last deployment that worked
6. Click the three dots menu -> **"Rollback to this deployment"**

This is instant and works even if GitHub is down.

---

## When AI Agents Ask You Things

| They ask... | You say... |
|---|---|
| "Can I push to main?" | **No.** Create a branch and PR. |
| "Can I modify the CI pipeline?" | **Only if you reviewed the change.** |
| "Can I run `git push --force`?" | **No.** Never on main. |
| "Can I add a database migration?" | **Review the SQL first.** No DROP TABLE. |
| "Tests are failing, should I skip them?" | **No.** Fix the tests. |
| "Can I deploy manually?" | **No.** All deploys through GitHub Actions. |

Point them to `DEPLOYMENT-SAFETY.md` -- that file is their rulebook.

---

## Quick Command Reference

```bash
# Run locally before pushing (catch issues early)
npm run typecheck
npm test

# Start dev servers
npm run dev            # Frontend
npm run dev:worker     # API (if applicable)

# See deploy history
git tag --list 'deploy-*' --sort=-creatordate

# See what changed since last deploy
LAST_TAG=$(git tag --list 'deploy-*' --sort=-creatordate | head -1)
git log $LAST_TAG..main --oneline

# Create PR from terminal
gh pr create --title "My change" --body "Description"

# Merge PR from terminal
gh pr merge <NUMBER> --merge
```
