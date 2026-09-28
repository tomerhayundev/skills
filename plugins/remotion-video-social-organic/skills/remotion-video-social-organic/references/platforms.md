# Platforms

Verified 2026-09-28. The numbers live in `assets/specs.json`, which `scripts/recommend.mjs`
reads; this page is the reasoning and the sources. Platform specs change several times a year:
re-check the official page for every deliverable before shipping, and update `specs.json` (with
its `verified` date) when something moved. Anything marked unverified came from a third party.

## Placements

| Placement | Aspect (first = recommended) | Length | Keep text out of | Sound and captions |
| --- | --- | --- | --- | --- |
| Instagram Reels | 9:16, 1080x1920 | up to 20 min; over 3 min is not recommended to non-followers; engagement peaks at 45-60 s | top 14%, bottom 35%, sides 6% | captions recommended |
| Instagram Stories | 9:16 | long videos split into cards | same as Reels | |
| Instagram / Facebook feed | 4:5, 1080x1350 | up to 60 min (IG), 241 min (FB) | | design for sound off; captions add 12% view time |
| Facebook Reels | 9:16 | no limit since June 2025 (every FB video is a Reel) | same as Reels | |
| TikTok | 9:16 (also 1:1, 16:9) | ads up to 10 min; organic cap per account (3 min for all) | no single box: use TikTok's templates (approximation in specs.json) | sound-on platform; proposition in the first 3 s |
| YouTube | 16:9 | 15 min until the channel is verified | | feeds autoplay muted with captions on; SRT |
| YouTube Shorts | 9:16 or 1:1 | up to 3 min; Shorts ads under 60 s | no official zone (third-party approximation) | |
| LinkedIn | 16:9, 1:1, 4:5, 9:16 | 3 s to 30 min (ads); 15-30 s fits every ad placement | | autoplays muted; SRT; under 30 fps for ads |
| X | 16:9, 1:1, 9:16, 4:5 (plus 2:3, 1.91:1 for ads) | 2:20 free; ads 15 s or less recommended | | captions strongly advised; muted autoplay unverified |
| Pinterest | 9:16 | 4 s to 5 min organic; ads 6-15 s recommended | top 270, bottom 790, left 65, right 195 px | |
| Threads | 9:16 | up to 5 min, 23-60 fps | | |
| Product Hunt | a YouTube link; gallery 1270x760 | no guidance (30-60 s is practice, unverified) | | |
| Apple App Store preview | iPhone 886x1920 (or 1920x886); iPad 1200x1600 | **15-30 s**, up to 3 per locale, 30 fps or less | | autoplays muted; in-app footage only |
| Google Play | a YouTube link, ads and monetization off | only the first 30 s autoplay | | muted |
| Landing page hero | match the layout | 6-15 s loop (practice) | | `muted playsinline`, MP4 + WebM, no audio track, a pause control if over 5 s (WCAG 2.2.2) |
| Email | GIF under 1 MB | a few seconds | | the first frame must stand alone (Outlook shows only frame 1); link to the full video |

## What holds everywhere

- The key message lands in the first 3 s: over 63% of the highest-click TikTok ads show it by then,
  and 65% of people who watch 3 s of a Meta video watch 10.
- Anything that autoplays muted (LinkedIn, feeds, YouTube feeds, app stores, landing pages) needs
  burned-in captions; the story must work with the sound off.
- Vertical 9:16 is now accepted almost everywhere (LinkedIn and X added it in 2025-2026), but each
  placement still hides a different band of the frame: test text against every safe zone you ship to.
- Reframe for each aspect; never crop a 16:9 render to vertical (the engine's camera windows do this).

## Sources

Meta ads guide: facebook.com/business/ads-guide/update/video (instagram-reels, instagram-story,
instagram-feed, facebook-feed, facebook-facebook-reels) · about.fb.com/news/2025/06/making-it-easier-create-videos-facebook
· TikTok: ads.tiktok.com/help/article/tiktok-auction-in-feed-ads, ads.tiktok.com/help/article/creative-best-practices
· YouTube: support.google.com/youtube/answer/15424877 (Shorts), /71673 (length), /7640367 (captions)
· Google Ads: support.google.com/google-ads/answer/2375464 (bumpers), /16041697 (Shorts ads)
· LinkedIn: linkedin.com/help/lms/answer/a424737 (ads), linkedin.com/help/linkedin/answer/a1311816
· X: business.x.com/en/blog/x-expands-aspect-ratio-support-for-ad-creatives-replacement
· Pinterest: help.pinterest.com/en/article/review-pin-specs, help.pinterest.com/en/business/article/pinterest-product-specs
· Threads: developers.facebook.com/docs/threads/overview
· Apple: developer.apple.com/help/app-store-connect/reference/app-preview-specifications
· Google Play: support.google.com/googleplay/android-developer/answer/9866151
· Autoplay: developer.chrome.com/blog/autoplay, webkit.org/blog/6784/new-video-policies-for-ios
· Email: litmus.com/blog/a-guide-to-animated-gifs-in-email, caniemail.com/features/html-video
· Lengths: wistia.com/blog/optimal-video-length, vidyard.com/business-video-benchmarks, socialinsider.io/blog/instagram-reels-length
