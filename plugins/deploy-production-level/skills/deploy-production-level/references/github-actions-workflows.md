# Workflow and Config Templates

Copy-paste templates. Replace the placeholders listed in [Customization](#customization); everything else is deliberate (see the rules table in SKILL.md).

## Contents
- [Wrangler config](#wrangler-config)
- [ci.yml: the Quality Gate](#ciyml)
- [deploy-staging.yml](#deploy-stagingyml)
- [deploy-production.yml](#deploy-productionyml)
- [rollback.yml](#rollbackyml)
- [preview.yml (optional)](#previewyml)
- [dependabot.yml](#dependabotyml)
- [Customization](#customization)

---

## Wrangler config

`wrangler.jsonc`. Production at the top level, the staging Worker under `env.staging`, PR previews under `previews`. Bindings are not inherited: repeat every binding in each section, pointed at that environment's resource.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "vars": { "APP_ENV": "production" },
  "d1_databases": [
    { "binding": "DB", "database_name": "my-app-db", "database_id": "<PROD_DB_ID>", "migrations_dir": "migrations" }
  ],
  "env": {
    "staging": {
      "name": "my-app-staging",
      "vars": { "APP_ENV": "staging" },
      "d1_databases": [
        { "binding": "DB", "database_name": "my-app-db-staging", "database_id": "<STAGING_DB_ID>", "migrations_dir": "migrations" }
      ]
    }
  },
  "previews": {
    "vars": { "APP_ENV": "preview" },
    "d1_databases": [
      { "binding": "DB", "database_name": "my-app-db-preview", "database_id": "<PREVIEW_DB_ID>" }
    ]
  }
}
```

`wrangler.preview-migrations.jsonc`, used only to migrate the shared preview database (Cloudflare's documented pattern). It must point at the same database as `previews.d1_databases`:

```jsonc
{
  "d1_databases": [
    { "binding": "PREVIEW_DB", "database_name": "my-app-db-preview", "database_id": "<PREVIEW_DB_ID>", "migrations_dir": "migrations" }
  ]
}
```

No D1? Delete the `d1_databases` blocks, the migration steps below, and this second file. Keep an empty `"previews": {}` if you use previews: the block is required.

Health route for the smoke tests. It should touch what a broken deploy would break:

```ts
if (url.pathname === "/api/health") {
  await env.DB.prepare("SELECT 1").first();
  return Response.json({ ok: true });
}
```

---

## ci.yml

`.github/workflows/ci.yml`. Runs on every PR (its `Quality Gate` job is the required check) and is called by both deploy workflows.

```yaml
name: CI

on:
  pull_request:
  workflow_call:

permissions:
  contents: read

concurrency:
  # One run per PR: a new push cancels the stale run. When a deploy calls this
  # workflow the group is the unique run ID, so it never cancels anything.
  group: ci-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true

jobs:
  quality-gate:
    name: Quality Gate
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      # Monorepo: build shared packages before anything that imports them.
      # - run: npm run build --workspace=packages/shared
      - run: npm run typecheck
      - run: npm run lint --if-present
      - run: npm test
      - run: npm run build
      - name: Bundle check (needs no credentials)
        run: npx wrangler deploy --dry-run --outdir "$RUNNER_TEMP/bundle"
        # working-directory: worker # wherever wrangler.jsonc lives, if not the repo root
```

---

## deploy-staging.yml

`.github/workflows/deploy-staging.yml`. Every push to `main` goes to the staging Worker.

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  gate:
    uses: ./.github/workflows/ci.yml

  deploy:
    name: Deploy Staging
    needs: gate
    runs-on: ubuntu-latest
    timeout-minutes: 20
    # Public repos, or GitHub Pro and up: shows deploys in the repo sidebar.
    # environment:
    #   name: staging
    #   url: ${{ vars.STAGING_URL }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Build (before migrating, so a failed build never leaves a migrated schema behind old code)
        run: npm run build
      - name: Apply D1 migrations (staging)
        run: npx wrangler d1 migrations apply DB --remote --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Deploy
        run: npx wrangler deploy --env staging --tag "${GITHUB_SHA::7}" --message "staging ${GITHUB_SHA::7}, run ${GITHUB_RUN_NUMBER}"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Smoke test
        run: curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --output /dev/null "$STAGING_URL/api/health"
        env:
          STAGING_URL: ${{ vars.STAGING_URL }}
```

Cloudflare credentials are set per step, not per job, so `npm ci` install scripts never see them.

---

## deploy-production.yml

`.github/workflows/deploy-production.yml`. Every push to `production` (a merged promotion PR) goes live, gets smoke-tested, and is tagged with its Worker version ID.

```yaml
name: Deploy Production

on:
  push:
    branches: [production]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false # never stop a production deploy halfway

jobs:
  gate:
    uses: ./.github/workflows/ci.yml

  deploy:
    name: Deploy Production
    needs: gate
    runs-on: ubuntu-latest
    timeout-minutes: 20
    # environment:
    #   name: production
    #   url: ${{ vars.PRODUCTION_URL }}
    outputs:
      version_id: ${{ steps.deploy.outputs.version_id }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Build (before migrating, so a failed build never leaves a migrated schema behind old code)
        run: npm run build
      - name: Record the live version (the automatic rollback target)
        id: live
        run: |
          id=$(npx wrangler deployments status --json 2>/dev/null | jq -r '.versions | max_by(.percentage) | .version_id // empty' || true)
          echo "Live before this deploy: ${id:-none (first deploy)}"
          echo "version_id=$id" >> "$GITHUB_OUTPUT"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Apply D1 migrations
        run: npx wrangler d1 migrations apply DB --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Deploy
        id: deploy
        run: |
          npx wrangler deploy --tag "${GITHUB_SHA::7}" --message "production ${GITHUB_SHA::7}, run ${GITHUB_RUN_NUMBER}"
          id=$(jq -r 'select(.type == "deploy") | .version_id // empty' "$WRANGLER_OUTPUT_FILE_PATH" | tail -n 1)
          if [ -z "$id" ]; then echo "::error::Deployed, but found no version_id in Wrangler's output"; exit 1; fi
          echo "version_id=$id" >> "$GITHUB_OUTPUT"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_OUTPUT_FILE_PATH: ${{ runner.temp }}/wrangler-output.ndjson
      - name: Smoke test
        id: smoke
        run: curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --output /dev/null "$PRODUCTION_URL/api/health"
        env:
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}
      - name: Roll back automatically (smoke test failed)
        if: failure() && steps.smoke.outcome == 'failure' && steps.live.outputs.version_id != ''
        run: |
          npx wrangler rollback "$PREVIOUS" --message "auto-rollback: smoke test failed for ${GITHUB_SHA::7}"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          PREVIOUS: ${{ steps.live.outputs.version_id }}

  tag:
    name: Tag Release
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7 # keeps its credentials on purpose: this job pushes the tag
      - name: Tag the deployed commit with its Worker version
        run: |
          tag="deploy-$(date -u +%Y%m%d-%H%M%S)-${GITHUB_SHA::7}"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag -a "$tag" -m "worker_version=$VERSION_ID" "$GITHUB_SHA"
          git push origin "refs/tags/$tag"
          echo "Tagged \`$tag\` (Worker version \`$VERSION_ID\`)" >> "$GITHUB_STEP_SUMMARY"
        env:
          VERSION_ID: ${{ needs.deploy.outputs.version_id }}
```

The auto-rollback only reverts the Worker. The migration already ran, which is why migrations must be backward-compatible.

---

## rollback.yml

`.github/workflows/rollback.yml`. Manual button: Actions, Rollback Production, Run workflow.

```yaml
name: Rollback Production

on:
  workflow_dispatch:
    inputs:
      target:
        description: "Deploy tag (deploy-...) or Worker version ID. Empty: the deploy before the latest one."
        required: false
        type: string

permissions:
  contents: read

concurrency:
  group: deploy-production # same lock as deploys, so a rollback never races one
  cancel-in-progress: false

jobs:
  rollback:
    name: Rollback Production
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # all tags
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Resolve the version to roll back to
        id: target
        run: |
          set -euo pipefail
          if [ -z "$TARGET" ]; then
            TARGET=$(git tag --list 'deploy-*' --sort=-creatordate | sed -n 2p)
            if [ -z "$TARGET" ]; then echo "::error::No earlier deploy tag to roll back to"; exit 1; fi
          fi
          if [[ "$TARGET" == deploy-* ]]; then
            if ! git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null; then echo "::error::Tag $TARGET not found"; exit 1; fi
            VERSION=$(git tag --list --format='%(contents)' "$TARGET" | sed -n 's/^worker_version=//p' | head -n 1)
          else
            VERSION="$TARGET"
          fi
          if ! [[ "$VERSION" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
            echo "::error::No Worker version ID for '$TARGET'. Pass one from 'npx wrangler deployments list'."
            exit 1
          fi
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "label=$TARGET" >> "$GITHUB_OUTPUT"
        env:
          TARGET: ${{ inputs.target }}
      - name: Roll back (instant, no rebuild)
        run: npx wrangler rollback "$VERSION" --message "rollback to $LABEL by $ACTOR"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          VERSION: ${{ steps.target.outputs.version }}
          LABEL: ${{ steps.target.outputs.label }}
          ACTOR: ${{ github.actor }}
      - name: Smoke test
        run: curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --output /dev/null "$PRODUCTION_URL/api/health"
        env:
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}
      - name: Summary
        run: echo "Production rolled back to \`$LABEL\` (Worker version \`$VERSION\`). Now fix forward on main." >> "$GITHUB_STEP_SUMMARY"
        env:
          VERSION: ${{ steps.target.outputs.version }}
          LABEL: ${{ steps.target.outputs.label }}
```

`wrangler rollback` reaches the last 100 versions and refuses if a Durable Object class or a bound KV, R2 or queue resource was removed since. For anything older, run **Deploy Production** with "Use workflow from" set to the old `deploy-*` tag: that rebuilds and redeploys the tagged commit.

---

## preview.yml

`.github/workflows/preview.yml`. Optional. One Preview per PR at `pr-<N>-my-app.<subdomain>.workers.dev`, one PR comment edited in place, deleted when the PR closes. Needs Wrangler 4.135.0+ and the `previews` block. It does not wait for the gate: previews are isolated, and the gate is still required to merge.

```yaml
name: Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  preview:
    name: Deploy Preview
    # Fork and Dependabot PRs get no Cloudflare secrets; never run their code with them.
    if: >-
      github.event.action != 'closed' &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      github.event.pull_request.user.login != 'dependabot[bot]'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Migrate the shared preview database
        run: npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Create or update the Preview
        id: preview
        run: |
          npx wrangler preview --name "pr-$PR" --message "PR #$PR at ${HEAD_SHA::7}"
          url=$(jq -r 'select(.type == "preview") | .preview_urls[0] // empty' "$WRANGLER_OUTPUT_FILE_PATH" | tail -n 1)
          if [ -z "$url" ]; then echo "::error::No preview URL in Wrangler's output"; exit 1; fi
          echo "url=$url" >> "$GITHUB_OUTPUT"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_OUTPUT_FILE_PATH: ${{ runner.temp }}/wrangler-output.ndjson
          PR: ${{ github.event.pull_request.number }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
      - name: Probe the Preview
        run: curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --output /dev/null "$URL/api/health"
        env:
          URL: ${{ steps.preview.outputs.url }}
      - name: Comment the Preview URL (one comment, edited in place)
        run: |
          gh pr comment "$PR" --repo "$GITHUB_REPOSITORY" --edit-last --create-if-none --body "Preview for \`${HEAD_SHA::7}\`: $URL"
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
          URL: ${{ steps.preview.outputs.url }}

  cleanup:
    name: Delete Preview
    if: github.event.action == 'closed' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.base.ref }} # the PR's merge ref may be gone
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Delete the Preview
        run: npx wrangler preview delete --name "pr-$PR" --skip-confirmation
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          PR: ${{ github.event.pull_request.number }}
```

The shared preview database means a PR's migration is visible to every other open preview. Backward-compatible migrations keep that harmless. A PR that needs its own database overrides the binding in both config files on its branch (Cloudflare "Previews: Resources and isolation").

---

## dependabot.yml

`.github/dependabot.yml`. Keeps actions and Wrangler current, so the pipeline does not silently age the way the first version of this skill did.

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ["*"]
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      cloudflare:
        patterns: ["wrangler", "@cloudflare/*"]
```

---

## Customization

### Placeholders

| In the templates | Replace with |
|---|---|
| `my-app`, `my-app-staging` | The Worker names |
| `DB` / `PREVIEW_DB` | Your D1 binding names (`PREVIEW_DB` only lives in the preview-migrations file) |
| `<PROD_DB_ID>`, `<STAGING_DB_ID>`, `<PREVIEW_DB_ID>` | IDs from `npx wrangler d1 create <name>` |
| `./dist` | The build output directory |
| `/api/health` | Your health route |
| `npm run typecheck` / `lint` / `test` / `build` | The project's real script names. A missing `typecheck` or `test` script gets added, not deleted from the gate; `lint` runs only if the script exists |

### wrangler.toml

Keep the project's format; the keys are the same. `[env.staging]` with `[[env.staging.d1_databases]]`, and `[previews]` with `[[previews.d1_databases]]`. The preview-migrations file becomes `wrangler.preview-migrations.toml` with a top-level `[[d1_databases]]`.

### Pages sites next to the Worker

Static sites that stay on Pages follow the same three stages. Put these steps after the Worker deploy in the matching job:

| Stage | Command |
|---|---|
| Preview (`preview.yml`) | `npx wrangler pages deploy <dir> --project-name <p> --branch "pr-$PR"`, URL `pr-<N>.<p>.pages.dev` |
| Staging (`deploy-staging.yml`) | `--branch staging`, URL `staging.<p>.pages.dev` |
| Production (`deploy-production.yml`) | `--branch <the project's production branch> --commit-hash "$GITHUB_SHA"` |

The production branch is set per Pages project (Settings, Builds, Branch control), and old pipelines deployed it from `main`. A `--branch` that does not match it silently produces a preview instead of a production deploy, so the production step checks what Wrangler reports:

```yaml
      - name: Deploy the widget site (Pages)
        run: |
          npx wrangler pages deploy widget/dist --project-name my-widget --branch main --commit-hash "$GITHUB_SHA"
          jq -e 'select(.type == "pages-deploy-detailed") | .environment == "production"' "$WRANGLER_OUTPUT_FILE_PATH" >/dev/null \
            || { echo "::error::Pages made a preview deploy: --branch does not match the project's production branch"; exit 1; }
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_OUTPUT_FILE_PATH: ${{ runner.temp }}/wrangler-pages.ndjson
```

Roll Pages back from its dashboard (Deployments, the last good one, Rollback), or rerun **Deploy Production** on the old tag. Add **Account: Cloudflare Pages: Edit** to the API token.

### pnpm

Add `- uses: pnpm/action-setup@v4` before `setup-node`, set `cache: pnpm`, use `pnpm install --frozen-lockfile`, and `pnpm exec wrangler` in place of `npx wrangler`.

### Monorepo

Build shared packages first in every job, and give Wrangler steps `working-directory: apps/<worker>`. Two Workers: one deploy job each, both `needs: gate`; the tag job `needs` both and writes one `worker_version_<name>=<id>` line per Worker; rollback takes a `component` choice input and rolls back each selected Worker with `--name <worker>`.

### Post-deploy end-to-end tests on staging

```yaml
  e2e:
    name: E2E on staging
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
```

### Pinning actions to commit SHAs

If the repo or org enables "Require actions to be pinned to a full-length commit SHA", write `uses: actions/checkout@<40-char SHA> # v7.0.1`. Dependabot keeps both the SHA and the comment current.
