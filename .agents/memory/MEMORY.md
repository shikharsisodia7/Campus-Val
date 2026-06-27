# Memory index

- [CampusVal logo asset](logo-asset.md) — Logo.tsx/favicon/prerender must use the bronco PNG in public/, not the crude /logo.svg (SEO passes keep reverting it).
- [SPA route registration](spa-routes.md) — new client routes must be added to SPA_ROUTES in api-server/src/app.ts or direct nav 404s.
- [No fabricated data](no-fabricated-data.md) — CampusVal must show only real data; missing data = explicit empty state, never invented placeholders (ratings, sections, grad plans, sample paste).
