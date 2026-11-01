# Performance

Speed is part of the experience. The meter measures layout shift (CLS fails above 0.1) and the largest paint
(LCP warns above 2.5 s; local numbers are indicative, a real phone on a real network is slower).

| Budget (phone, mid device) | Floor |
| --- | --- |
| Largest contentful paint | under 2.5 s |
| Interaction to next paint | under 200 ms |
| Cumulative layout shift | under 0.1 (meter rule CLS) |
| Fonts | at most 2 families, at most 4 files above the fold, subset to the scripts used (fonts.mjs keeps only those) |
| JavaScript | at most 100 KB compressed for a brochure site; no framework runtime for static pages |
| Third parties | deferred; none blocks the first render; no chat widget covering the primary button on a phone |

| Rule | Check |
| --- | --- |
| The hero image is sized for its slot, in AVIF or WebP with a fallback, `fetchpriority="high"`, never lazy. | meter rule HERO_LAZY |
| Every image, video and embed has `width` and `height` or an `aspect-ratio`. | meter rule IMG_DIMENSIONS |
| Everything below the first screen loads lazily. | |
| Every image actually loads. | meter rule IMG_BROKEN |
| Fonts use `font-display: swap`; the face used above the fold is preloaded. | fonts.mjs writes the swap |
| A background video is muted, short, has a poster, pauses with reduced motion and does not autoplay on a phone. | |
| Budgets by weight: hero image at most 250 KB at 1440 wide, other images at most 150 KB, all images on first load at most 1.5 MB. | |
