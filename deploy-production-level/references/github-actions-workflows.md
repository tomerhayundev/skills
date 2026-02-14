# GitHub Actions Workflow Templates

Complete, production-ready workflow files. Adapt the project names, build commands, and deploy targets to your specific stack.

## Table of Contents
- [deploy.yml -- Production Pipeline](#deployyml)
- [preview.yml -- PR Preview Deployments](#previewyml)
- [rollback.yml -- Manual Rollback](#rollbackyml)
- [Customization Guide](#customization-guide)

---

## deploy.yml

Place at `.github/workflows/deploy.yml`.

Triggered on: push to `main`, manual dispatch.

```yaml
name: Deploy Production

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

# Required GitHub Secrets:
# - CLOUDFLARE_API_TOKEN: API token with Workers Scripts Edit + Pages Edit + D1 Edit
# - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID

jobs:
  # --- QUALITY GATE --- must pass before any deploy
  quality-gate:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci

      # If monorepo: build shared packages first
      - name: Build shared package
        run: npm run build --workspace=packages/shared

      - name: Typecheck all workspaces
        run: npm run typecheck

      - name: Run tests
        run: npm test --workspace=apps/worker

  # --- DEPLOY API --- only after quality gate
  deploy-worker:
    name: Deploy API
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci

      - name: Validate secrets
        run: |
          if [ -z "${{ secrets.CLOUDFLARE_API_TOKEN }}" ]; then
            echo "CLOUDFLARE_API_TOKEN is not set"
            exit 1
          fi

      - name: Build shared package
        run: npm run build --workspace=packages/shared

      - name: Deploy Worker
        run: npx wrangler deploy
        working-directory: apps/worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      # If using D1 database migrations:
      - name: Apply D1 migrations
        run: npx wrangler d1 migrations apply <DB_NAME> --remote
        working-directory: apps/worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  # --- DEPLOY FRONTEND --- only after quality gate
  deploy-pages:
    name: Deploy Frontend
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy Pages
        run: npx wrangler pages deploy <DIST_DIR> --project-name=<PROJECT_NAME>
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  # --- TAG RELEASE --- after both deploys succeed
  tag-release:
    name: Tag Release
    needs: [deploy-worker, deploy-pages]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Create deploy tag
        run: |
          TAG="deploy-$(date -u +%Y%m%d-%H%M%S)-${GITHUB_SHA::7}"
          git tag "$TAG"
          git push origin "$TAG"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## preview.yml

Place at `.github/workflows/preview.yml`.

Triggered on: pull request to `main`.

```yaml
name: PR Preview

on:
  pull_request:
    branches: [main]

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  quality-gate:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci

      - name: Build shared package
        run: npm run build --workspace=packages/shared
      - name: Typecheck all workspaces
        run: npm run typecheck
      - name: Run tests
        run: npm test --workspace=apps/worker

  preview-deploy:
    name: Deploy Preview
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - name: Build
        run: npm run build

      - name: Deploy Preview
        id: deploy
        run: |
          DEPLOY_OUTPUT=$(npx wrangler pages deploy <DIST_DIR> \
            --project-name=<PROJECT_NAME> \
            --branch=pr-${{ github.event.pull_request.number }} 2>&1)
          echo "$DEPLOY_OUTPUT"
          PREVIEW_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^\s]+\.<PROJECT_NAME>\.pages\.dev' | head -1)
          echo "preview_url=$PREVIEW_URL" >> "$GITHUB_OUTPUT"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Comment preview URL on PR
        if: steps.deploy.outputs.preview_url != ''
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Preview Deployment\n\nPreview URL: ${{ steps.deploy.outputs.preview_url }}\n\nCommit: \`${context.sha.substring(0, 7)}\``
            })
```

---

## rollback.yml

Place at `.github/workflows/rollback.yml`.

Triggered on: manual dispatch only (GitHub Actions -> Run workflow).

```yaml
name: Rollback Production

on:
  workflow_dispatch:
    inputs:
      target_tag:
        description: 'Deploy tag to rollback to (e.g. deploy-20260211-143022-abc1234). Leave empty for previous deploy.'
        required: false
        type: string
      component:
        description: 'What to rollback'
        required: true
        type: choice
        options:
          - both
          - pages-only
          - worker-only

jobs:
  rollback:
    name: Rollback to ${{ inputs.target_tag || 'previous deploy' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # full history for tags

      - name: Find rollback target
        id: target
        run: |
          if [ -n "${{ inputs.target_tag }}" ]; then
            TARGET="${{ inputs.target_tag }}"
            if ! git rev-parse "$TARGET" >/dev/null 2>&1; then
              echo "ERROR: Tag $TARGET not found"
              exit 1
            fi
          else
            TARGET=$(git tag --list 'deploy-*' --sort=-creatordate | sed -n '2p')
            if [ -z "$TARGET" ]; then
              echo "ERROR: No previous deploy tag found"
              exit 1
            fi
          fi
          echo "tag=$TARGET" >> "$GITHUB_OUTPUT"
          echo "Rolling back to: $TARGET"

      - uses: actions/checkout@v4
        with:
          ref: ${{ steps.target.outputs.tag }}

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci

      - name: Build shared package
        run: npm run build --workspace=packages/shared

      - name: Rollback Worker
        if: inputs.component == 'both' || inputs.component == 'worker-only'
        run: npx wrangler deploy
        working-directory: apps/worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Rollback Pages
        if: inputs.component == 'both' || inputs.component == 'pages-only'
        run: |
          npm run build --workspace=apps/web
          npx wrangler pages deploy <DIST_DIR> --project-name=<PROJECT_NAME>
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Create rollback tag
        run: |
          TAG="rollback-$(date -u +%Y%m%d-%H%M%S)-to-${{ steps.target.outputs.tag }}"
          git tag "$TAG"
          git push origin "$TAG"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Customization Guide

### Placeholders to Replace

| Placeholder | Replace With | Example |
|------------|-------------|---------|
| `<DB_NAME>` | Your D1 database name | `my-app-db` |
| `<DIST_DIR>` | Build output directory | `apps/web/dist`, `dist`, `build` |
| `<PROJECT_NAME>` | Cloudflare Pages project name | `my-app` |

### Monorepo vs Single Package

**Monorepo** (default in templates): Keep `--workspace=` flags and shared package build step.

**Single package**: Remove `--workspace=` flags, remove "Build shared package" step, simplify build command.

### Adding More Quality Checks

Add steps to the `quality-gate` job:

```yaml
      - name: Lint
        run: npm run lint

      - name: E2E tests
        run: npm run test:e2e

      - name: Bundle size check
        run: npm run build && npx bundlesize
```

### Non-Cloudflare Deploys

Replace the deploy steps with your platform's CLI:

**Vercel:**
```yaml
      - name: Deploy
        run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

**AWS S3 + CloudFront:**
```yaml
      - name: Deploy
        run: |
          aws s3 sync dist/ s3://${{ secrets.S3_BUCKET }} --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
```

**Netlify:**
```yaml
      - name: Deploy
        run: npx netlify deploy --prod --dir=dist --site=${{ secrets.NETLIFY_SITE_ID }}
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
```
