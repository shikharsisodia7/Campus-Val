# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run dev:all` — build frontend then run combined server
- `pnpm --filter @workspace/scu-advising run build` — rebuild frontend after changes

## CampusVal — SCU AI Advising

AI academic advising web app for Santa Clara University undergraduates.

- Frontend: `artifacts/scu-advising` (React + Vite + Tailwind + shadcn/ui), built to `dist/public`
- Backend: `artifacts/api-server` (Express) — serves both `/api/*` and the built SPA on port 8080
- Pages: onboarding wizard (all fields required), dashboard, courses (catalog browser with detail drawer; sections grouped by term with prominent professor/time/LAB-badge cards; "Plan in Schedule Planner" links to /schedule), planner (class-standing-aware unit caps), Schedule Planner (see below), GPA calc/sim, transfer (ASSIST.org articulation lookup), policies, AI advisor (SSE), graduation paths (3-yr & 4-yr for 46 majors with full requirements list + completed-course filtering), AI evaluation (risk-weighted benchmark)
- Schedule Planner (`/schedule`, DB-backed; the old localStorage schedule-store is deleted): `quarter_schedules` + `schedule_events` in `lib/db/src/schema/schedules.ts` (partial unique index prevents duplicate sections per schedule); routes in `api-server/src/routes/schedules.ts` (ownership enforced on every endpoint; section adds/swaps validated against the official offered-sections dataset, snapshots stored server-side; duplicate/delete transactional). Multiple named schedules per quarter (Fall 2026 published; Winter/Spring 2027 tentative with honest notices). Frontend in `scu-advising/src/components/schedule-planner/`: Mon–Fri proportional calendar (weekend toggle, hidden-weekend-event notice), debounced Quick Add with explicit section selection (never auto-adds), deterministic conflict detection via pure `src/lib/conflicts.ts` (warns, never removes), commitments (work/athletics/student org/special program/external course/personal/other — external courses never presented as SCU catalog courses), Advanced Search (`GET /api/core-areas`, `GET /api/course-search` with Match ALL/ANY and distinct zero-states: no_matching_courses vs no_sections_this_quarter; Pathways honestly unavailable — no dataset), Registration Summary with copy-sections + Open Workday link (no fake registration). Unit tests: `api-server/src/lib/course-search.test.ts`, `scu-advising/src/lib/conflicts.test.ts` (`pnpm --filter <pkg> run test`).
- Class-standing rules: First/Second-year cap 20 standard / 22 with overload; Third/Fourth-year cap 22 standard / 24 with overload. Overload requires GPA ≥ 3.0 + priority registration; advisor approval required when planned units exceed standard cap.
- Major/college restrictions: CSEN/ECEN/MECH/CENG/BIOE/ENGR/AMTH courses gated to School of Engineering students (enforced server-side in `/planner/check`, surfaced as "Engineering only" badge in catalog). Note: SCU renamed COEN → CSEN in 2024-2025.
- Course catalog data: ~2,308 courses scraped from SCU's 2025-2026 undergraduate bulletin (`artifacts/api-server/src/data/courses-data.json`). All ~58 undergraduate departments. Per-quarter section/instructor/seat data is sourced separately via the Workday paste-in feature (below) — never via stored Workday credentials.
- Workday section sync: `/sync-workday` page lets the user paste section rows from SCU Workday's "Find Course Sections" view (no SSO ever stored). The parser (`artifacts/api-server/src/lib/workday-parser.ts`) tolerates spaced day tokens (`T R`, `M W F`, `Th`), 12/24h times, and `N/N` seat formats. Rows go into the `course_sections` DB table (unique on courseCode+sectionNumber+term+year). `POST /api/sections/sync` runs delete+upsert in a transaction and refuses to wipe a term if 0 rows parsed. The course drawer's "Live sections" panel queries `/api/courses/:code/sections` and shows whatever's been synced (each row tagged with its term).
- Articulation data: 116 California Community Colleges (`artifacts/api-server/src/data/community-colleges.json`) with per-CC ASSIST.org deep-links exposed via `GET /api/articulation { colleges: [{name, assistUrl}] }`. Hand-verified equivalency tables cached for 5 high-traffic feeders (De Anza, Foothill, West Valley, Mission, Santa Monica); for all other CCs the UI directs users to ASSIST.org.
- Professor lookup: RateMyProfessor is fully removed (no deep links, ratings, or RMP schemas anywhere). `components/ProfessorLookup.tsx` and the professors page show SCU-directory data only, plus an honest "No SCU course evaluation data available" card linking to the SSO-gated official portal https://evaluations.scu.edu/. Never fabricate professor ratings or evaluation metrics.
- Degree requirements: college-aware (CAS/LSB/SOE) via `GET /api/requirements` backed by `api-server/src/data/degree-requirements.ts` (University Core + college + major groups, official scu.edu source URLs + lastVerified dates). Items with approved-list fulfillment (`needsVerification: true`) support manual check-off in `core-reqs.tsx` (localStorage `campusval.reqs.manual.v1.<CODE>`); items with known course lists auto-check from `completedCourseCodes`. Hybrid items (e.g. Leavey C&I 3: MGMT 80 or approved list) are auto + manual.
- Evaluation: 12-scenario benchmark with risk-weighted scoring (critical=4x weight, ≥0.9 pass bar; low=1x, ≥0.6 pass bar) and forbidden-keyword penalties. Uses model `gpt-5.2` via Replit OpenAI integration (no API key needed).
- Degree Plan workspace (`/degree-plan`, primary planning surface): DB-persisted plans (`academic_plans` + `plan_items` in `lib/db/src/schema/plans.ts`; routes in `api-server/src/routes/plans.ts`). One Degree Plan per user (auto-created on first `GET /api/plans`, cannot be deleted) plus unlimited independent tentative plans (create blank or deep-copy, rename, duplicate, delete with confirm, promote to Degree Plan — old one is kept as tentative "… (previous, <date>)"). Items are real catalog courses (validated against `courses-data.json`) or requirement placeholders (dashed cards, excluded from unit totals, replaceable with a chosen eligible course). Three-panel UI in `scu-advising/src/components/degree-plan/` with @dnd-kit drag-drop + accessible "Move to…" menu; server reindexes positions transactionally on moves. `.xlsx` advisor export via exceljs at `GET /api/plans/:id/export`. `GET /api/schedule-availability` is the single source of truth for published vs tentative quarter schedules. All plan endpoints enforce ownership.
- Terminology: no "4-Year Plan" framing in the planner. Graduation Paths page is labeled reference-only sample sequences; `/tentative-plans` page is the "What-If Explorer" (ephemeral cost scenarios), distinct from saved tentative plans in the Degree Plan workspace.
- Brand: cardinal `#8C1515`, gold `#B08850`
- DB: Drizzle schemas in `lib/db/src/schema/{profile,conversations,messages,sections}`
- AI: OpenAI integration via `@workspace/integrations-openai-ai-server`
- Note: Replit only proxies ports listed in `.replit` (`8080`, `8081`). Frontend is built and served as static by the API server because the platform port allocator can't expose a separate Vite dev port.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
