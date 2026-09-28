# Wix App Architecture Reference

## Full Stack Diagram

```
SITE VISITOR (browser)
  |
  | iframe loads
  v
YOUR WIDGET FRONTEND  (Cloudflare Pages)
https://your-app-widget.pages.dev
  - Reads ?instance= from URL
  - Calls backend API with Bearer token
  - Renders your app's UI
  |
  | API calls (Authorization: Bearer <instance-token>)
  v
YOUR BACKEND API  (Cloudflare Worker)
https://your-app.yourdomain.com/api
  - Verifies Wix instance token
  - Queries D1 database
  - Calls third-party APIs
  - Caches results in KV
  - Enforces tier limits
  |
  +-- D1 (SQLite) -- source of truth
  +-- KV (fast cache) -- widget data cache
  +-- External APIs (Google, Stripe, etc.)


SITE OWNER (Wix Dashboard)
  |
  | iframe loads
  v
YOUR SETTINGS FRONTEND  (Cloudflare Pages)
https://your-app-settings.pages.dev
  - Settings form, connect external services, live preview
  - Calls backend API

Wix Lifecycle Events (webhooks: Wix -> your backend):
  app_instance_installed  -> create DB record
  app_instance_removed    -> clean up
  app_instance_updated    -> update tier
```

---

## Multi-Platform Strategy

Your backend is platform-agnostic. The Wix integration is just one thin layer:

```
Your Backend API
+-- Wix       -> Wix Blocks widget + Wix CLI dashboard page
+-- Shopify   -> App extension + admin page
+-- WordPress -> Plugin + settings page
+-- Any site  -> JavaScript embed snippet
```

Add a `platform` column to your `sites` table from day one, even if you start with Wix only.

---

## iframe Communication (postMessage)

Your iframes need to communicate with the parent Wix page for height auto-resize.
Without this, your iframe shows a scrollbar inside Wix or gets clipped.

**Inside your iframe (widget or settings):**
```javascript
function reportHeight() {
  const height = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: 'resize', height }, '*');
}

window.addEventListener('load', reportHeight);
// Also report when content changes
const observer = new ResizeObserver(reportHeight);
observer.observe(document.body);
```

**Inside Wix CLI dashboard page (receives the message):**
```typescript
window.addEventListener('message', (e) => {
  if (e.data?.type === 'resize' && typeof e.data.height === 'number') {
    const iframe = document.getElementById('settings-iframe') as HTMLIFrameElement;
    iframe.style.height = `${e.data.height}px`;
  }
});
```

---

## Widget Design Patterns

### Pattern 1: Pure iframe (Recommended for most apps)

Your Wix Blocks widget has one HTML Embed element. All logic is in your iframe.

**Pros:** Full control, easy to update without republishing Blocks, works on any platform
**Cons:** Wix can't introspect widget internals

```javascript
// Wix Blocks Velo code -- that's all you need
import wixWindow from 'wix-window';
$w.onReady(async function () {
  const instance = await wixWindow.getAppInstance();
  $w('#htmlWidget').src = `${WIDGET_URL}/?instance=${instance}&platform=wix`;
});
```

### Pattern 2: Native Wix Blocks Elements + iframe

Mix Wix UI elements with an iframe. Good when site builders need to configure the widget
directly in the Wix Editor's "Settings" panel via widget properties.

```javascript
$w.onReady(async function () {
  const instance = await wixWindow.getAppInstance();
  const style = $w('#widget').style;       // widget property
  const count = $w('#widget').itemCount;   // another property
  const params = new URLSearchParams({ instance, style, count });
  $w('#htmlWidget').src = `${WIDGET_URL}/?${params}`;
});
```

### Pattern 3: Server-Side Rendered HTML

Your Worker returns complete HTML (not just JSON data). The Wix Blocks HTML element
loads a URL that your Worker serves as a full HTML page.

**Use case:** Very lightweight widgets where minimizing HTTP round-trips matters.

```typescript
app.get('/widget/:instanceId', async (c) => {
  const data = await getWidgetData(c.env, c.req.param('instanceId'));
  return c.html(renderWidgetHTML(data));
});
```

---

## SWR Caching (Stale-While-Revalidate)

Best pattern for widget data that doesn't need to be real-time:

```
Request arrives -> return cached data immediately (even if stale)
               -> if stale, refresh in background
Next request   -> gets fresh data
```

```typescript
async function getWithSWR(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<any>
) {
  const { value, metadata } = await kv.getWithMetadata<{ fetchedAt: number }>(key, 'json');
  const isStale = !value || (Date.now() - (metadata?.fetchedAt ?? 0)) > ttlSeconds * 1000;

  if (isStale) {
    // Background refresh -- don't block this response
    fetcher().then(async (fresh) => {
      await kv.put(key, JSON.stringify(fresh), {
        expirationTtl: ttlSeconds * 2,
        metadata: { fetchedAt: Date.now() },
      });
    }).catch(console.error);
  }

  return value ?? (await fetcher()); // synchronous fallback if nothing cached yet
}
```

---

## Third-Party OAuth Integration Flow

When your app connects a third-party service (Google, Stripe, etc.) on behalf of a site owner:

```
1. Settings panel shows "Connect [Service]" button
2. Click -> redirect to: /api/auth/[service]/start?instance=<token>
3. Worker verifies token -> stores pending state in KV with nonce
4. Worker redirects to third-party OAuth URL with state=nonce
5. User authorizes -> third-party redirects to /api/auth/[service]/callback?state=nonce&code=XXX
6. Worker looks up nonce in KV -> gets instanceId -> stores tokens in D1
7. Worker redirects back to settings panel with ?connected=1
```

Key: The OAuth callback does NOT get a Wix instance token (it comes from the third-party).
Use a nonce (stored in KV with short TTL) to link the callback to the correct site.

```typescript
// Start OAuth
app.get('/api/auth/google/start', requireWixAuth, async (c) => {
  const instanceId = c.get('instanceId');
  const nonce = crypto.randomUUID();
  await c.env.KV.put(`oauth:state:${nonce}`, instanceId, { expirationTtl: 600 });
  const authUrl = buildGoogleAuthUrl({ state: nonce, redirectUri: CALLBACK_URL });
  return c.redirect(authUrl);
});

// Handle callback (no Wix auth here -- request comes from Google)
app.get('/api/auth/google/callback', async (c) => {
  const { state, code } = c.req.query();
  const instanceId = await c.env.KV.get(`oauth:state:${state}`);
  if (!instanceId) return c.text('Invalid or expired state', 400);

  const tokens = await exchangeCodeForTokens(code, CALLBACK_URL);
  const encrypted = await encryptToken(tokens.refresh_token, c.env.TOKEN_ENCRYPTION_KEY);
  await saveTokenToDb(c.env.DB, instanceId, encrypted);

  return c.redirect(`${SETTINGS_URL}/?connected=1`);
});
```

---

## Error Handling

Design your widget to degrade gracefully:

```typescript
async function loadWidgetData() {
  try {
    const res = await fetch(`/api/widget/${siteId}/data`, {
      headers: { Authorization: `Bearer ${instance}` }
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    localStorage.setItem('widget_cache', JSON.stringify(data)); // save for offline fallback
    return data;
  } catch (err) {
    const cached = localStorage.getItem('widget_cache');
    return cached ? JSON.parse(cached) : null;
  }
}
```

Never show a broken or empty widget. Always fall back to cached data, a placeholder, or a
friendly message ("Check back soon!").
