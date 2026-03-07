# Wix Authentication Reference

## Instance Token Verification (Complete Implementation)

```typescript
// worker/src/auth/wix.ts

export interface WixTokenPayload {
  instanceId?: string;
  siteId?: string;
  metaSiteId?: string;
  applicationId?: string;
  data?: string | { instanceId?: string; siteId?: string; metaSiteId?: string };
  exp?: number;
  iat?: number;
}

export async function verifyWixInstanceToken(
  token: string,
  appSecret: string
): Promise<{ instanceId: string; payload: WixTokenPayload }> {
  if (!token) throw new Error('missing_token');

  const parts = token.split('.');
  if (parts.length === 3) {
    // 3-part = standard JWT (RS256) -- use verifyWixWebhookJWT instead
    throw new Error('use_verifyWixWebhookJWT_for_3part_tokens');
  }
  if (parts.length !== 2) throw new Error('invalid_token_format');

  const [sig, payload] = parts;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const payloadBytes = new TextEncoder().encode(payload);
  const expectedBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  const actualBytes = base64urlDecode(sig);

  if (!constantTimeEqual(expectedBytes, actualBytes)) {
    throw new Error('invalid_signature');
  }

  const decoded: WixTokenPayload = JSON.parse(
    new TextDecoder().decode(base64urlDecode(payload))
  );

  // Check expiry if present (with 60s clock skew tolerance)
  if (decoded.exp && Date.now() / 1000 > decoded.exp + 60) {
    throw new Error('token_expired');
  }

  const instanceId = extractInstanceId(decoded);
  if (!instanceId) throw new Error('no_instance_id_in_token');

  return { instanceId, payload: decoded };
}

function extractInstanceId(payload: WixTokenPayload): string | undefined {
  if (payload.instanceId) return payload.instanceId;
  if (payload.siteId) return payload.siteId;
  if (payload.metaSiteId) return payload.metaSiteId;
  if (payload.applicationId) return payload.applicationId;
  if (payload.data) {
    const data = typeof payload.data === 'string'
      ? (() => { try { return JSON.parse(payload.data as string); } catch { return null; } })()
      : payload.data;
    if (data?.instanceId) return data.instanceId;
    if (data?.siteId) return data.siteId;
    if (data?.metaSiteId) return data.metaSiteId;
  }
  return undefined;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}
```

---

## Webhook JWT Verification (RS256)

Webhooks from Wix are signed with RS256. Get the public key from your app dashboard.

```typescript
export async function verifyWixWebhookJWT(rawBody: string, publicKeyPem: string): Promise<any> {
  const parts = rawBody.trim().split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt_format');

  const [headerB64, payloadB64, sigB64] = parts;

  const keyData = pemToArrayBuffer(publicKeyPem);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(sigB64);
  const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, dataToVerify);
  if (!isValid) throw new Error('invalid_webhook_signature');

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));

  if (payload.exp && Date.now() / 1000 > payload.exp + 60) {
    throw new Error('webhook_jwt_expired');
  }

  return payload;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return base64urlDecode(b64).buffer;
}
```

---

## Auth Middleware (Hono)

```typescript
// worker/src/middleware/auth.ts

export async function requireWixAuth(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.query('instance'); // widget may pass as URL query param

  if (!token) return c.json({ error: 'unauthorized' }, 401);

  try {
    const { instanceId } = await verifyWixInstanceToken(token, c.env.WIX_APP_SECRET);
    c.set('instanceId', instanceId);
    await next();
  } catch (err: any) {
    return c.json({ error: 'unauthorized', detail: err.message }, 401);
  }
}
```

Usage:
```typescript
app.use('/api/widget/*', requireWixAuth);
app.use('/api/settings/*', requireWixAuth);
app.post('/webhooks/wix', handleWixWebhook); // uses its own JWT verification
```

---

## Storing OAuth Tokens for Third-Party Services

Never store refresh tokens in plaintext. Use AES-GCM encryption:

```typescript
// worker/src/auth/tokens.ts

export async function encryptToken(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function decryptToken(ciphertext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const data = base64urlDecode(ciphertext);
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
```

---

## Security Checklist

- [ ] All signature comparisons use constant-time equality (not ===)
- [ ] Webhook JWT verified before processing any event
- [ ] Third-party OAuth tokens encrypted at rest (AES-GCM)
- [ ] App secret never exposed in logs, errors, or responses
- [ ] CORS allows only trusted origins (never * for authenticated endpoints)
- [ ] Rate limiting applied per instanceId
- [ ] Token expiry checked with +/-60s clock skew tolerance
- [ ] Admin endpoints protected by separate secret key
- [ ] All SQL queries use parameterized statements
- [ ] OAuth callback validates state nonce (prevents CSRF)

---

## Generating Test Tokens for Local Dev

```typescript
// scripts/gen-test-token.ts  (run with: npx ts-node scripts/gen-test-token.ts)
import { createHmac } from 'crypto';

const APP_SECRET = process.env.WIX_APP_SECRET!;
const TEST_INSTANCE_ID = 'test-instance-123';

const payload = Buffer.from(JSON.stringify({
  instanceId: TEST_INSTANCE_ID,
  iat: Math.floor(Date.now() / 1000),
})).toString('base64url');

const sig = createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
console.log('Test token:', `${sig}.${payload}`);
// Use as: Authorization: Bearer <token>  OR  ?instance=<token>
```
