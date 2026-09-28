# Wix App Market Submission Guide

## Timeline

| Stage | Duration |
|-------|---------|
| First app submission | Up to **15 business days** |
| Updates to live apps | Up to **7 business days** |

Plan accordingly -- don't promise a launch date without accounting for review time.

---

## Hard Requirements (Will Reject Without)

- **App startup time < 400ms** -- Wix measures this automatically
- **Privacy policy** at a public URL (must explain what data you collect)
- **Terms of service** at a public URL
- **Wix Billing** for any monetized features (no direct Stripe/PayPal links)
- **No misleading claims** -- every feature you describe must actually work

---

## App Profile Checklist

Fill these out in Wix Dev Center -> your app -> Marketing:

```
[ ] App name (short, memorable, searchable -- include a keyword)
[ ] Tagline / teaser (max ~80 chars -- shows in search results)
[ ] Short description (1-2 sentences)
[ ] Full description (benefits-focused, not feature-focused)
[ ] App icon (200x200px, square, no text, professional)
[ ] Up to 4 feature highlights (title + description + icon each)
[ ] Screenshots (min 3, show real functionality)
[ ] Support email
[ ] Help documentation URL
[ ] Demo site URL (optional but recommended)
```

**Description tip:** Lead with the benefit, not the feature.
- Good: "Grow trust with authentic customer reviews"
- Bad: "Displays Google reviews from your business"

---

## Technical Submission Checklist

### Auth & Security
- [ ] Instance token verification working on all request paths
- [ ] Webhooks verified (install, uninstall, billing)
- [ ] No secrets in client-side code
- [ ] Admin endpoints protected

### Widget
- [ ] Widget renders on a real Wix site (not just Blocks preview)
- [ ] Widget works on mobile (responsive)
- [ ] Widget shows sensible onboarding state on first install
- [ ] Widget loads in < 400ms (measure with Chrome DevTools Network tab)
- [ ] iframe height auto-adjusts (no scrollbar within widget)

### Dashboard Page
- [ ] Settings page loads inside Wix editor
- [ ] Settings save and persist on page reload
- [ ] OAuth flows complete successfully (if applicable)
- [ ] Error states handled (wrong account, expired token, etc.)

### Lifecycle
- [ ] Install webhook creates DB record
- [ ] Uninstall webhook handled (graceful cleanup)
- [ ] Billing webhook updates tier

### Infrastructure
- [ ] Privacy policy live at the URL in your app profile
- [ ] Terms of service live
- [ ] Support email works (send a test)
- [ ] No 500 errors under normal usage

---

## Getting a Wix Dev Test Site

Wix provides free premium test sites for developers:
1. Go to devs.wix.com -> Test Sites -> Create Test Site
2. Install your unpublished app on the test site
3. Test the complete flow: install -> settings -> widget -> visitor view

---

## Common Rejection Reasons

**Performance:**
- Widget takes > 400ms to start (optimize iframe JS, defer non-critical code)
- Widget causes layout shift (set explicit height or use postMessage resize)

**Functionality:**
- OAuth flow doesn't complete (always test on real site, not localhost)
- Widget shows error on first install instead of an onboarding state
- Settings don't save correctly

**Content:**
- App description makes claims the app doesn't actually support
- Missing or broken privacy policy link
- Screenshots don't match the actual app

**Billing:**
- App charges users outside Wix Billing system

---

## Post-Approval

1. **Monitor errors** -- Wix Workers logs are in Cloudflare dashboard
2. **Respond to reviews** quickly in the App Market (affects ranking)
3. **Keep privacy policy updated** -- update and re-notify if data practices change
4. **Update regularly** -- apps updated frequently rank higher in the marketplace

---

## Re-submission After Rejection

1. Read the rejection email carefully -- Wix gives specific reasons
2. Fix ALL issues mentioned, not just the one you think is the main one
3. Test again on a fresh test site
4. Reply to the rejection email describing what you fixed before resubmitting

Do not resubmit immediately without fixing issues -- it just resets the review clock.
