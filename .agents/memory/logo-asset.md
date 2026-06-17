---
name: CampusVal logo asset
description: Which logo file Logo.tsx must use and why, to avoid a recurring revert.
---

# CampusVal Bronco logo

`Logo.tsx` must render `src="/logo-bronco.png"` (an optimized ~23KB 256px raster
in `artifacts/scu-advising/public/`). The favicon uses `/favicon-bronco.png`, and
the server-side `LANDING_PRERENDER` in `artifacts/api-server/src/app.ts` must use
`/logo-bronco.png` too (it has two `<img>` refs).

**Why:** A hand-coded `/logo.svg` was introduced by an SEO/bundle-size pass to
shrink the JS bundle, but it renders as a crude shield blob that users call "a
mess." Referencing a PNG from `public/` (NOT importing it into JS) keeps the
bundle just as small while looking like an actual bronco. Do not "optimize" this
back to an inline SVG.

**How to apply:** If asked to fix/restore the logo, point all four references
(Logo.tsx, index.html favicon, two app.ts prerender imgs) at the bronco PNGs.
