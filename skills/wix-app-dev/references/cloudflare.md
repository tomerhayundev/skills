# Cloudflare Stack Reference

## Why Cloudflare

- **$0/month** at launch through most growth stages (free tier is generous)
- **Global edge** -- Workers run in 300+ cities, widgets load fast everywhere
- **No cold starts** -- Workers stay warm, no Lambda-style delays
- **All primitives in one place:** compute (Workers), database (D1), cache (KV), hosting (Pages)

---

## wrangler.toml Template

```toml
# worker/wrangler.toml
name = "your-app-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

[[d1_databases]]
binding = "DB"
database_name = "your-app-db"
database_id = "your-d1-database-id"

[[routes]]
pattern = "your-app.yourdomain.com/*"
zone_name = "yourdomain.com"
```

**Set secrets (never put in wrangler.toml):**
```bash
wrangler secret put WIX_APP_SECRET
wrangler secret put WIX_PUBLIC_KEY
wrangler secret put TOKEN_ENCRYPTION_KEY
wrangler secret put ADMIN_SECRET_KEY
```

---

## D1 Database Setup

```bash
# Create the database
wrangler d1 create your-app-db

# Apply initial schema
wrangler d1 execute your-app-db --file=worker/src/db/schema.sql

# Run migrations
wrangler d1 migrations apply your-app-db
```

**Migration pattern** -- store in numbered files, never edit old ones:
```
worker/src/db/migrations/
+-- 0001_initial.sql
+-- 0002_add_subscriptions.sql
+-- 0003_add_analytics.sql
```

**Query helpers:**
```typescript
// worker/src/db/queries.ts
export async function getSiteByInstanceId(db: D1Database, instanceId: string) {
  return db.prepare('SELECT * FROM sites WHERE instance_id = ?')
    .bind(instanceId).first<Site>();
}

export async function upsertSite(db: D1Database, instanceId: string) {
  await db.prepare(`
    INSERT INTO sites (instance_id) VALUES (?)
    ON CONFLICT (instance_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  `).bind(instanceId).run();
  return getSiteByInstanceId(db, instanceId);
}

export async function logEvent(db: D1Database, instanceId: string, event: string, details?: unknown) {
  const site = await getSiteByInstanceId(db, instanceId);
  if (!site) return;
  await db.prepare('INSERT INTO event_log (site_id, event, details) VALUES (?, ?, ?)')
    .bind(site.id, event, details ? JSON.stringify(details) : null).run();
}
```

---

## KV Cache Patterns

```typescript
// Write with TTL
await env.KV.put(`widget:${siteId}`, JSON.stringify(data), { expirationTtl: 3600 });

// Read (null if expired or missing)
const cached = await env.KV.get<MyData>(`widget:${siteId}`, 'json');

// SWR: write with metadata to track freshness
await env.KV.put(`widget:${siteId}`, JSON.stringify(data), {
  expirationTtl: 86400,
  metadata: { fetchedAt: Date.now() },
});
const { value, metadata } = await env.KV.getWithMetadata<MyData, { fetchedAt: number }>(
  `widget:${siteId}`, 'json'
);
const isStale = !metadata || Date.now() - metadata.fetchedAt > 3_600_000;
```

**KV key naming conventions:**
```
widget:{siteId}          - cached widget data
rate:{siteId}:{window}   - rate limit counter
oauth:state:{nonce}      - pending OAuth state (short TTL: 600s)
token:{siteId}           - cached access token
```

---

## Cloudflare Pages Setup

```bash
# Create projects
wrangler pages project create your-app-widget
wrangler pages project create your-app-settings

# Deploy
cd widget && npm run build
wrangler pages deploy dist --project-name=your-app-widget
```

---

## Hono Worker Entry Point

```typescript
// worker/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  WIX_APP_SECRET: string;
  WIX_PUBLIC_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
  ADMIN_SECRET_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://your-widget.pages.dev',
      'https://your-settings.pages.dev',
      'https://manage.wix.com',
      'https://editor.wix.com',
    ];
    return allowed.includes(origin) ? origin : null;
  },
  allowHeaders: ['Authorization', 'Content-Type'],
}));

app.get('/health', (c) => c.json({ ok: true }));
app.route('/webhooks', webhooksRouter);
app.use('/api/*', requireWixAuth);
app.route('/api/widget', widgetRouter);
app.route('/api/settings', settingsRouter);

export default app;
```

---

## GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd worker && npm ci && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

  deploy-widget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd widget && npm ci && npm run build
      - run: npx wrangler pages deploy widget/dist --project-name=your-app-widget
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}

  deploy-settings:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd settings && npm ci && npm run build
      - run: npx wrangler pages deploy settings/dist --project-name=your-app-settings
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

**Required GitHub secrets:** `CF_API_TOKEN`, `CF_ACCOUNT_ID`

---

## Local Development

```bash
# Worker with local D1 + KV
cd worker && npm run dev   # runs at http://localhost:8787

# Widget frontend
cd widget && npm run dev   # runs at http://localhost:5173

# Settings frontend
cd settings && npm run dev # runs at http://localhost:5174
```

Add `http://localhost:5173` and `http://localhost:5174` to CORS origins in local dev.

---

## Performance Tips

- **D1 batching:** Use `db.batch([...])` for multiple reads in one round-trip
- **KV first:** KV reads are much faster than D1 -- use KV for hot widget data, D1 for source of truth
- **Cache-Control:** Set `Cache-Control: public, max-age=300` on public widget endpoints
- **CPU limit:** Worker free tier allows 10ms CPU per request. D1/KV I/O doesn't count toward it.
