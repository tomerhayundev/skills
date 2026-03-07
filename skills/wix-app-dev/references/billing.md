# Wix Billing Reference

## Overview

If your app charges money, you **must** use the Wix Billing API (required for App Market approval).
Wix collects payments and pays you. You integrate with billing webhooks to know when tiers change.

---

## Setup in Wix Dev Center

1. Go to your app -> **Pricing Plans**
2. Create plan entries. The `vendorProductId` you set here arrives in webhook payloads:
   ```
   Plan: Free   -> vendorProductId: "free"
   Plan: Pro    -> vendorProductId: "pro"
   ```
3. Set pricing (monthly/yearly) and what each plan includes
4. Add an "Upgrade" button in your settings panel linking to the Wix upgrade URL

---

## Database Schema

```sql
-- Add tier tracking to your sites table
ALTER TABLE sites ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE sites ADD COLUMN tier_updated_at DATETIME;

-- Detailed subscription tracking (optional)
CREATE TABLE subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id             INTEGER NOT NULL REFERENCES sites(id),
  tier                TEXT NOT NULL,
  vendor_product_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  started_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at          DATETIME,
  cancelled_at        DATETIME
);
```

---

## Billing Webhook Handling

All billing changes arrive as `app_instance_updated` webhooks. The key field is `vendorProductId`.
Wix nests this inconsistently -- check multiple locations:

```typescript
// worker/src/api/webhooks.ts

function extractVendorProductId(payload: any): string | null {
  return (
    payload?.data?.changes?.vendorProductId?.newValue ??
    payload?.data?.vendorProductId ??
    payload?.vendorProductId ??
    null
  );
}

function tierFromVendorProductId(vpid: string | null): 'free' | 'pro' {
  if (!vpid) return 'free';
  if (/pro|premium|paid|growth|enterprise/i.test(vpid)) return 'pro';
  return 'free';
}

// In your webhook handler:
case 'app.instance_updated': {
  const vpid = extractVendorProductId(jwtPayload);
  const newTier = tierFromVendorProductId(vpid);
  await env.DB.prepare(
    'UPDATE sites SET tier = ?, tier_updated_at = CURRENT_TIMESTAMP WHERE instance_id = ?'
  ).bind(newTier, instanceId).run();
  await logEvent(env.DB, instanceId, 'tier_changed', { vpid, newTier });
  break;
}
```

**Events to handle:**

| Event | When | Action |
|-------|------|--------|
| `app.instance_updated` | Any plan change | Update tier from `vendorProductId` |
| `app.instance_installed` | First install | Create record with `tier: 'free'` |
| `app.instance_removed` | Uninstall | Mark as uninstalled |

---

## Tier Limits Config

Define limits in one place and enforce them via middleware:

```typescript
// worker/src/config/tiers.ts
export const TIER_LIMITS = {
  free: {
    maxItems: 15,
    cacheHours: 24,
    customColors: false,
    analyticsRetentionDays: 7,
  },
  pro: {
    maxItems: 999,
    cacheHours: 12,
    customColors: true,
    analyticsRetentionDays: 90,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;
export const getLimits = (tier: Tier) => TIER_LIMITS[tier] ?? TIER_LIMITS.free;
```

```typescript
// worker/src/middleware/tier.ts
export function requirePro(c: Context, next: Next) {
  const site = c.get('site');
  if (site.tier !== 'pro') {
    return c.json({
      error: 'upgrade_required',
      upgradeUrl: `https://www.wix.com/upgrade/${YOUR_APP_ID}?instance=${site.instance_id}`,
    }, 402);
  }
  return next();
}
```

---

## Widget Endpoint with Tier Enforcement

```typescript
app.get('/api/widget/:instanceId/data', requireWixAuth, async (c) => {
  const site = await getSiteByInstanceId(c.env.DB, c.get('instanceId'));
  const limits = getLimits(site.tier as Tier);

  const allItems = await getData(c.env, site.id);
  const items = allItems.slice(0, limits.maxItems);

  return c.json({
    items,
    totalItems: allItems.length,
    showing: items.length,
    isLimited: allItems.length > items.length,
    tier: site.tier,
  });
});
```

---

## Free Tier Degradation

When a subscription expires or is cancelled:
1. Keep their data (don't delete -- they may re-upgrade)
2. Enforce limits immediately
3. Show a clear message: "Upgrade to Pro to see all items"
4. Keep the widget functional (show free-tier content, not a blank screen)

---

## Upgrade URL

```
https://www.wix.com/upgrade/<YOUR_APP_ID>?instance=<INSTANCE_TOKEN>
```

Or use the Wix SDK in Velo/Wix CLI:
```typescript
import { dashboard } from '@wix/dashboard';
dashboard.navigate({ pageId: 'UPGRADE_PAGE' });
```
