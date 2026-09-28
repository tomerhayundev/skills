---
name: remotion-video-app-store-preview
description: Use when making an Apple App Store app preview or a Google Play promo video with Remotion.
summary: >-
  App Store previews and Google Play videos with Remotion: in-app footage only, 15 to 30 s, caption-led for muted autoplay, at the store's exact size.
---

# App store preview

Status: stub (nearest: product-demo). Read [product-demo](../product-demo/FORMAT.md), then apply the deltas below.

## Fits when

"App Store preview", "app preview", "Play Store video". Hard platform rules apply.

## Lengths and platforms

25 s default, 15-30 s hard (Apple). iPhone 886x1920 portrait (or 1920x886), 30 fps or less, up to 3 per locale; Google Play is a YouTube link whose first 30 s autoplay muted.

## Story shape

The app's best moment in the first 3 s (it autoplays muted in the store) · 3 core actions · the brand at the end.

## Assets and voice

In-app footage only: what a user sees inside the app, no device frames, no people using the device, no footage from outside the app (Apple's rules; re-read them before submitting). Caption-led: it autoplays muted.

## Engine profile

The product-demo profile, except durations: the grid inside a hard 15-30 s total; the reason: Apple rejects anything outside it.

## Build notes

Render at the exact store size (`appstore` aspect); keep captions large for a phone-sized preview. No cursor: a phone has none, so taps show as the app's own touch feedback. The music leads (about -16 LUFS, its lift on the strongest action): the store autoplays it muted, and whoever unmutes hears a bed, not a reading track.

## Verification

Length between 15 and 30 s and fps at 30 or less, checked on the file with ffprobe; the phone sheet.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Marketing footage that is not in the app | In-app footage only |
