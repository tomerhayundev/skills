---
name: deploy-production-level
description: Use when the user explicitly asks for a production-grade deployment pipeline, release process, staging to production promotion, per-PR preview environments, or one-click rollback for a web app on GitHub Actions and Cloudflare Workers, or asks to upgrade a repo that already has a deploy.yml / preview.yml / rollback.yml pipeline from an earlier version of this method. Not for projects where a single manual deploy is enough.
---

# Production-Level Deployment Pipeline

Nothing reaches production without passing a quality gate twice, running on staging first, and being promoted by a human. Every production deploy is tagged with its Worker version ID, so rollback is instant and needs no rebuild. AI agents are blocked from deploying by a hook, not just by a rule they are asked to follow.

Last verified against the tooling on 2026-09-27. Check the version table before copying anything.

## The pipeline

```
feature/* --PR--> main --PR (promotion)--> production
                   |                            |
 every PR:         | push to main:              | push to production:
 CI Quality Gate   | gate, build,               | gate, build, record live version,
 (required check)  | migrate staging D1,        | migrate prod D1, deploy, smoke test
 + Preview URL     | deploy --env staging,      | (smoke fails: auto-rollback),
 (optional)        | smoke test                 | tag deploy-<ts>-<sha> with version ID

Rollback Production (manual button): wrangler rollback <version ID>. Instant.
```

If any step fails, nothing after it runs. If the production smoke test fails, the job rolls back to the version that was live before it started.

## Current versions (update this table whenever you touch the skill)

| Tool | Use | Notes |
|---|---|---|
| `actions/checkout` | `@v7` | node24 runtime. Actions on Node 20 (`checkout@v4` and friends) lost runner support on 2026-09-23 |
| `actions/setup-node` | `@v7` | with `cache: npm` |
| Node.js | `24` | Active LTS. Node 26 becomes LTS on 2026-10-28. Node 20 is EOL |
| Wrangler | `^4.135.0` or newer, pinned in `package.json` | `wrangler preview` needs 4.135.0+. CI runs `npx wrangler`, so it uses the project's pinned version. Bump it with `npm install -D wrangler@latest` (in the Worker's workspace), never by editing `package.json` alone: a stale lockfile fails `npm ci` |
| `cloudflare/wrangler-action` | `@v4` (4.1.2+), only if you prefer the wrapper | 4.1.0 is broken |

## Implementation steps

1. **Inspect first.** Read `package.json` scripts, the Wrangler config (and which folder it lives in), the build output directory, every binding (D1, KV, R2, queues), `migrations/`, existing `.github/workflows/`, `CLAUDE.md` and `AGENTS.md`, and how the frontend finds the API (absolute URL, CORS list, OAuth redirect URIs). If the repo has the old pipeline (Pages deploys, `@v4` actions, a `rollback.yml` that rebuilds a tag), also follow "Upgrading an old pipeline" below.
2. **Shape the Worker config.** Production at the top level, `env.staging` for the persistent staging Worker, a `previews` block for PR previews. Every binding needs its own staging and preview resource. Keep the project's format (`wrangler.toml` works the same way). Template: [Wrangler config](references/github-actions-workflows.md#wrangler-config).
3. **Write the workflows** from [references/github-actions-workflows.md](references/github-actions-workflows.md): `ci.yml` (the gate, also callable), `deploy-staging.yml`, `deploy-production.yml`, `rollback.yml`, optional `preview.yml`, and `.github/dependabot.yml` so versions stay current.
4. **Add the PR template** from [assets/pull_request_template.md](assets/pull_request_template.md) as `.github/pull_request_template.md`.
5. **Install the agent guardrails** from [references/agent-guardrails.md](references/agent-guardrails.md): the rules block (in `AGENTS.md` imported by `CLAUDE.md` when other agents such as Codex or Cursor work in the repo, otherwise in `CLAUDE.md`), and [assets/deploy-guard.mjs](assets/deploy-guard.mjs) as a PreToolUse hook in `.claude/settings.json`.
6. **Write `DEPLOYMENT-GUIDE.md`** at the repo root from [references/human-setup-guide.md](references/human-setup-guide.md), with the project's real names and URLs filled in.
7. **Give the human the one-time setup list** (below). These steps need their accounts; do not attempt them.
8. **Verify before calling it done:** run the gate commands locally, `npx wrangler deploy --dry-run` and `npx wrangler deploy --dry-run --env staging`, lint the workflows (`actionlint` if available), and pipe sample commands through the hook (see agent-guardrails.md). Then open the first PR and watch `Quality Gate` go green.

## Rules the workflows keep

These are why the templates look the way they do. Do not simplify them away.

| Rule | Why |
|---|---|
| The gate runs on the PR **and** again inside each deploy (`uses: ./.github/workflows/ci.yml`) | Two green PRs can merge into a red `main` |
| Build, then migrate D1, then deploy | A failed build must not leave a migrated schema behind old code |
| Migrations are backward-compatible: add and backfill now, drop in a later release | Neither `wrangler rollback` nor a revert undoes a D1 migration, so the old code must run on the new schema |
| Production `concurrency` uses `cancel-in-progress: false` | Cancelling halfway can leave a migrated DB behind an old Worker |
| Record the live version ID before deploying; store the new one in the deploy tag | Rollback becomes `wrangler rollback <id>`: instant, no rebuild, no guessing what "previous" means |
| Top-level `permissions: contents: read`, widened per job | Least privilege for `GITHUB_TOKEN` |
| `inputs.*`, PR titles and branch names reach `run:` through `env:`, never inline `${{ }}` | Script injection |
| Previews run on `pull_request`, skip fork PRs, never use `pull_request_target` | Fork code must never run with Cloudflare secrets. GitHub's default policy starts blocking `pull_request_target` in public repos on 2026-11-02 |
| Previews bind to one shared preview D1 (and KV, R2): not production, not one per PR | Keeps production data out of previews; a database per PR hits the account's D1 limit |

**Tell the human this trust boundary plainly:** a same-repo PR runs its own copy of `preview.yml` (and of the preview config) with the Cloudflare token, before anyone reviews it, and a Cloudflare token cannot be limited to one Worker. Write access to the repo is therefore deploy access. Grant it only to people and agents you would let deploy; on plans with environments, the token can live in a `preview` environment that needs approval.

## Human one-time setup (the agent lists it, the human does it)

1. Merge the pipeline PR into `main` first, then create the `production` branch from `main`, so it starts with the new workflows.
2. Protect `main` and `production` with rulesets: require a PR, require the `Quality Gate` check, block force pushes and deletions, empty bypass list, and on `production` allow only merge commits. Delete any old classic branch protection rule: its "require branches to be up to date" blocks every promotion PR. Private repos need GitHub Pro or higher for rulesets and branch protection. On Free, only the agent hook guards the branches: say so plainly.
3. Add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and repo variables `STAGING_URL` and `PRODUCTION_URL`.
4. Create the Cloudflare API token (plus Pages Edit if Pages sites remain), a staging and a preview copy of every resource the Worker binds (D1, KV, R2, queues), and each environment's Worker secrets (test-mode values outside production). Register staging redirect URIs with any OAuth provider.

Click-by-click steps are in [references/human-setup-guide.md](references/human-setup-guide.md).

## Adapting

| Situation | Change |
|---|---|
| Small project, no staging wanted | Drop `deploy-staging.yml`, trigger `deploy-production.yml` on `main`, skip the `production` branch. Keep previews so something is tested before production |
| Frontend and API are separate Workers | One deploy job per Worker (`working-directory:`), one `worker_version_<name>=` line per Worker in the tag, loop over them in rollback |
| Wrangler config in a subfolder (`worker/`, `apps/api/`) | Set `working-directory:` on every Wrangler step, including the gate's bundle check |
| Next.js on Workers (OpenNext) | Build with `npx opennextjs-cloudflare build`, deploy with `npx wrangler deploy`, same order |
| Static sites still on Cloudflare Pages | Cloudflare now starts new projects on Workers static assets; migrate with its "Migrate from Pages" guide when convenient. Until then see [Pages sites next to the Worker](references/github-actions-workflows.md#pages-sites-next-to-the-worker) |
| Frontend calls the API by an absolute production URL, or the API has a CORS allowlist | Staging and previews would talk to production. Derive the API base from `location.origin` or a build-time variable per environment, and add the staging and preview origins to CORS. OAuth rarely works on per-PR hostnames: test those flows on staging |
| Worker uses queue consumers, cron, or service bindings to other Workers | Previews do not isolate these: queue consumers and cron stay on production, and service bindings call the production Worker. Skip previews or accept it |
| Vercel, Netlify or AWS | Same method, different deploy step (`vercel deploy --prod`, `netlify deploy --prod`, `aws s3 sync` plus a CloudFront invalidation). Roll back with the host's instant rollback |

## Upgrading an old pipeline (from the early-2026 version of this skill)

- Bump every action to the version table; the `@v4` actions run on Node 20, which runners no longer have. Bump Wrangler through the package manager so the lockfile follows.
- `deploy.yml` becomes `deploy-production.yml` (on `production`) plus `deploy-staging.yml` (on `main`), both calling `ci.yml`.
- Move D1 migrations to after the build and before the deploy. A schema applied with `d1 execute --file schema.sql` becomes `migrations/0001_initial.sql`; keep it idempotent (`CREATE TABLE IF NOT EXISTS`) so the first `migrations apply` on the existing production database only records it.
- Set production `cancel-in-progress: false`.
- Replace the rebuild-a-tag `rollback.yml` with the `wrangler rollback` one, and write `worker_version=` into new deploy tags. Tags from before the upgrade carry no version ID, so the first rollback after the upgrade needs the ID passed by hand (from `npx wrangler deployments list`). Say so in the handover.
- Previews: the API Worker moves to `wrangler preview`. Static sites that stay on Pages keep `--branch pr-<N>` previews. Either way, post one PR comment and edit it in place instead of a new one per push.
- Move the rules from `DEPLOYMENT-SAFETY.md` into the rules block (step 5), add the hook, then delete `DEPLOYMENT-SAFETY.md` once nothing links to it. Remove `deploy` scripts from `package.json` so nobody runs one by habit.

## Common mistakes

| Mistake | Fix |
|---|---|
| `Quality Gate` does not appear in the ruleset's status check search | The search only lists checks that ran in the last 7 days. Open a PR first, then add it |
| Squash-merging the `main` to `production` promotion PR | Use a merge commit for promotions, or the branches diverge and every later promotion conflicts. Do not require linear history on `production` |
| Preview URL or version ID scraped from stdout with `grep` | Set `WRANGLER_OUTPUT_FILE_PATH` and read `preview_urls` / `version_id` from that file with `jq` |
| `wrangler rollback` without a version ID | It picks "the version uploaded before the latest", which may never have served traffic. Always pass the ID |
| Checking a secret with `if [ -z "${{ secrets.X }}" ]` | Map the secret into `env:` and test `"$X"` |
| Trusting `CLAUDE.md` alone to stop an agent from deploying | It is context, not enforcement. The hook blocks locally; the ruleset blocks on GitHub |
