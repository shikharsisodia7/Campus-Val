# Memory index

- [CampusVal logo asset](logo-asset.md) — Logo.tsx/favicon/prerender must use the bronco PNG in public/, not the crude /logo.svg (SEO passes keep reverting it).
- [Professors directory data source](professors-directory.md) — /api/professors builds from OFFERED_SECTIONS (PDF) + Workday DB merge, not the empty course_sections table alone.
- [Live data refresh policy](live-data-refresh.md) — only DB-backed data (professors, course sections/seats) polls every 1s; static PDF catalog stays on default cadence (no fake "live").
- [SPA route registration](spa-routes.md) — new client routes must be added to SPA_ROUTES in api-server/src/app.ts or direct nav 404s.
- [Degree Plan workspace](degree-plan-workspace.md) — one degree plan per user, server-side position reindexing on moves, orval query-key predicate invalidation, schedule-availability endpoint is sole term-status source.
- [Schedule Planner conventions](schedule-planner.md) — DB-backed quarter scheduler: server-validated sections only, layered duplicate protection, warn-only conflicts, honest data gaps.
- [Requirement check-offs](requirement-checkoffs.md) — manual degree-requirement check-offs live server-side (requirement_completions) with student-asserted provenance; never localStorage.
- [No fabricated data](no-fabricated-data.md) — CampusVal must show only real data; missing data = explicit empty state, never invented placeholders (ratings, sections, grad plans, sample paste).
