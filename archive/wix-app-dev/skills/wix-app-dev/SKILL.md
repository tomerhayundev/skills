---
name: wix-app-dev
description: >
  Expert guide for designing, building, and shipping production-grade Wix apps for the Wix App Market.
  Covers the full lifecycle: architecture decisions, project setup, Wix integration (instance tokens,
  webhooks, Wix Blocks widgets, dashboard pages), self-hosted backend (Cloudflare Workers + D1 + KV),
  billing/tier enforcement, and App Market submission. Use this skill whenever someone is:
  - Starting a new Wix app idea
  - Setting up the tech stack or folder structure for a Wix app
  - Implementing Wix authentication, webhooks, or widget embedding
  - Adding billing/subscriptions via Wix Billing API
  - Preparing to submit to the Wix App Market
  - Debugging Wix-specific issues (instance token, CORS, iframes, editor preview)
  - Building any kind of app for Wix (reviews, bookings, analytics, integrations, etc.)
  Always trigger this skill for any Wix app development work -- Wix Blocks, Wix CLI,
  Wix marketplace, Wix instance tokens, Wix webhooks, Wix billing.
---

# Wix App Development Guide

You are helping build a production-grade Wix app -- the kind that gets published on the Wix App Market,
earns recurring revenue, and serves thousands of sites reliably. This guide covers the full lifecycle.

## Quick Mental Model

Every Wix app has three distinct parts:

```
+----------------------------------------------------------+
|  1. WIX LAYER (what Wix hosts)                           |
|     +-- Widget  -- embeddable on site pages (Wix Blocks) |
|     +-- Dashboard Page  -- settings in Wix editor        |
+----------------------------------------------------------+
|  2. YOUR BACKEND (what you host)                         |
|     +-- API  -- business logic, integrations, auth       |
|     +-- Widget frontend  -- iframe served by your CDN    |
|     +-- Settings frontend  -- iframe for dashboard page  |
+----------------------------------------------------------+
|  3. WIX INTEGRATION GLUE                                 |
|     +-- Instance tokens  -- identify which site          |
|     +-- Webhooks  -- install/uninstall/billing events    |
+----------------------------------------------------------+
```

The Wix layer is thin -- a widget shell that loads your iframe, and a dashboard page that shows your
settings iframe. All real logic lives in your backend.

---

## Architecture: Which Wix Framework?

| Framework | Best for | Hosting |
|-----------|----------|---------|
| **Wix Blocks** | Widgets + simple dashboard pages (visual builder) | Wix-hosted |
| **Wix CLI** | Dashboard pages and extensions in React | Wix-hosted (thin shell) |
| **Self-hosted iframe** | Full control, external services | You host |

**Recommended stack:**
- **Wix Blocks** for the site widget
- **Wix CLI** for the dashboard page
- **Cloudflare Workers** for your backend API (free, fast, global)
- **Cloudflare Pages** for widget + settings frontends

See `references/architecture.md` for detailed diagrams and trade-offs.

---

## Project Structure

```
your-app/
+-- worker/          <- Cloudflare Worker  (Hono + TypeScript)
|   +-- src/
|       +-- index.ts         <- router + entry point
|       +-- auth/
|       |   +-- wix.ts       <- Instance token + webhook JWT verifier
|       |   +-- tokens.ts    <- Encrypt third-party OAuth tokens
|       +-- api/
|       |   +-- webhooks.ts  <- Install, billing, lifecycle events
|       |   +-- widget.ts    <- Public API for widget rendering
|       |   +-- settings.ts  <- Settings panel API
|       +-- middleware/
|       |   +-- auth.ts      <- Verify Wix tokens on every request
|       |   +-- rateLimit.ts <- Per-site rate limiting
|       +-- db/
|           +-- schema.sql   <- D1 schema
|           +-- queries.ts   <- DB helpers
+-- widget/          <- Cloudflare Pages  (iframe on sites)
+-- settings/        <- Cloudflare Pages  (iframe in Wix dashboard)
+-- wix/             <- Wix CLI project   (dashboard page shell)
+-- privacy/         <- Static HTML       (required for App Market)
```

See `references/cloudflare.md` for wrangler.toml templates and CI/CD setup.

---

## Database Design (Cloudflare D1)

Minimal schema every app needs:

```sql
CREATE TABLE sites (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL DEFAULT 'wix',
  instance_id   TEXT NOT NULL UNIQUE,
  tier          TEXT NOT NULL DEFAULT 'free',
  widget_config TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id    INTEGER NOT NULL REFERENCES sites(id),
  event      TEXT NOT NULL,
  details    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Add a `subscriptions` table when you monetize. See `references/billing.md`.

---

## Wix Authentication

### Instance Token Verification

Every request from your widget or settings panel includes a Wix instance token.
Verify it to identify which site is making the request.

**Token format:** two parts separated by `.` -- `<hmac-signature>.<base64url-payload>`

```typescript
export async function verifyWixInstanceToken(token: string, appSecret: string) {
  const [sig, payload] = token.split('.');
  if (!sig || !payload) throw new Error('invalid_token');

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  );
  // ALWAYS use constant-time comparison -- never === for signatures
  if (!constantTimeEqual(expected, base64urlDecode(sig))) throw new Error('invalid_signature');

  const data = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
  // instanceId may be in multiple field names -- check all
  const instanceId = data.instanceId ?? data.siteId ?? data.metaSiteId
    ?? (typeof data.data === 'string' ? JSON.parse(data.data)?.instanceId : data.data?.instanceId);

  if (!instanceId) throw new Error('no_instance_id');
  return { instanceId };
}
```

See `references/auth.md` for complete implementation (constantTimeEqual, base64urlDecode,
webhook RS256 JWT verification, and a local dev test token generator).

### Auth Flow

```
Wix passes instance token in URL: ?instance=<token>
Your iframe reads it, sends it as: Authorization: Bearer <token>
Your Worker verifies it -> extracts instanceId -> looks up site in D1
```

---

## Wix Lifecycle Webhooks

Register in Wix Dev Center under **Webhooks**:

| Event | When | What to do |
|-------|------|------------|
| `app_instance_installed` | App installed | Create `sites` record |
| `app_instance_removed` | App uninstalled | Mark site, clean up |
| `app_instance_updated` | Billing/tier changed | Update tier from `vendorProductId` |

```typescript
app.post('/webhooks/wix', async (c) => {
  const jwt = await verifyWixWebhookJWT(await c.req.text(), c.env.WIX_PUBLIC_KEY);
  const eventType = jwt.data?.eventType ?? jwt.eventType;
  const instanceId = jwt.data?.instanceId ?? jwt.instanceId;

  if (eventType === 'app.instance_installed') await upsertSite(c.env.DB, instanceId);
  if (eventType === 'app.instance_removed')   await markUninstalled(c.env.DB, instanceId);
  if (eventType === 'app.instance_updated') {
    const vpid = extractVendorProductId(jwt);
    await updateTier(c.env.DB, instanceId, /pro|paid|premium/i.test(vpid ?? '') ? 'pro' : 'free');
  }
  return c.json({ ok: true });
});
```

---

## Widget (Wix Blocks)

Build in Wix Blocks at manage.wix.com. Use an HTML Embed element that loads your iframe:

```javascript
// Velo code inside your Wix Blocks widget
import wixWindow from 'wix-window';

$w.onReady(async function () {
  const instance = await wixWindow.getAppInstance();
  const isEditor = wixWindow.viewMode === 'Editor';
  const params = new URLSearchParams({ instance, platform: 'wix' });
  if (isEditor) params.set('preview', '1'); // show placeholder, don't call real API
  $w('#htmlWidget').src = `https://your-app-widget.pages.dev/?${params}`;
});
```

After publishing in Blocks, save the Widget Component ID for your app config.

See `references/architecture.md` for widget patterns and iframe height auto-resize.

---

## Dashboard Page (Wix CLI)

```typescript
// wix/src/dashboard/pages/page.tsx
export default function SettingsPage() {
  useEffect(() => {
    const instance = new URLSearchParams(window.location.search).get('instance') ?? '';
    const iframe = document.getElementById('settings-iframe') as HTMLIFrameElement;
    iframe.src = `https://your-app-settings.pages.dev/?instance=${encodeURIComponent(instance)}`;
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'resize') iframe.style.height = `${e.data.height}px`;
    });
  }, []);
  return (
    <iframe
      id="settings-iframe"
      style={{ width: '100%', border: 'none', minHeight: '600px' }}
    />
  );
}
```

---

## Billing Integration

If your app has paid tiers, you **must** use Wix Billing (required for App Market approval).

Create pricing plans in Wix Dev Center. Set `vendorProductId` values (e.g., "free", "pro").

```typescript
async function enforceTierLimit(c: Context, next: Next) {
  const site = await getSiteFromToken(c);
  if (site.tier === 'free' && isBeyondFreeLimit(c)) {
    return c.json({ error: 'upgrade_required' }, 402);
  }
  return next();
}
```

See `references/billing.md` for full billing setup, webhook events, and tier enforcement.

---

## CORS Setup

```typescript
const ALLOWED_ORIGINS = [
  'https://your-widget.pages.dev',
  'https://your-settings.pages.dev',
  'https://manage.wix.com',
  'https://editor.wix.com',
];
app.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
  allowHeaders: ['Authorization', 'Content-Type'],
}));
```

---

## Rate Limiting (per site)

```typescript
async function rateLimit(c: Context, next: Next, limit = 60, windowSecs = 60) {
  const key = `rate:${c.get('instanceId')}:${Math.floor(Date.now() / windowSecs / 1000)}`;
  const count = parseInt(await c.env.KV.get(key) ?? '0') + 1;
  await c.env.KV.put(key, String(count), { expirationTtl: windowSecs });
  if (count > limit) return c.json({ error: 'too_many_requests' }, 429);
  return next();
}
```

---

## App Market Submission Checklist

- [ ] App startup time < 400ms (Wix will reject you without this)
- [ ] Privacy policy + Terms of Service at public URLs
- [ ] Widget renders correctly on mobile
- [ ] App icon: 200x200px square
- [ ] All webhook events handled (install, remove, update)
- [ ] Billing via Wix Billing API (if monetized)
- [ ] Tested on a real Wix dev site
- [ ] iframe height auto-adjusts (no internal scrollbars)
- [ ] CORS properly configured (no wildcard * in production)

**Submission timeline:** Up to 15 business days first app, 7 days for updates.

See `references/submission.md` for full checklist, app profile tips, and common rejection reasons.

---

## Common Gotchas

**Token format:** Instance token = 2-part HMAC. Webhook JWTs = 3-part RS256. Handle both.

**instanceId field:** May be `instanceId`, `siteId`, `metaSiteId`, or nested under `data`. Check all.

**Editor preview:** When site owner is in Wix Editor, widget is in preview mode.
Check `wixWindow.viewMode === 'Editor'` -- show a placeholder, do not run OAuth or fetch live data.

**iframe height:** Wix iframes do not auto-resize. Send height from inside your iframe:

```javascript
window.parent.postMessage({ type: 'resize', height: document.body.scrollHeight }, '*');
```

**D1 migrations:** Always use migration files, never ad-hoc CREATE TABLE in production.

**Wix Blocks publish lag:** Changes take a few minutes to propagate after publishing.

---

## Reference Files

- `references/architecture.md` -- Architecture diagrams, multi-platform strategy, iframe communication, SWR caching
- `references/auth.md` -- Complete token verification, webhook JWT, OAuth token encryption, security checklist
- `references/billing.md` -- Wix Billing setup, tier enforcement, subscription webhook events
- `references/cloudflare.md` -- Workers setup, D1/KV/Pages config, wrangler.toml templates, CI/CD
- `references/submission.md` -- App Market submission guide, checklist, common rejection reasons
