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
- Pages: onboarding wizard (all fields required), dashboard, courses (catalog browser with detail drawer; sections grouped by term with prominent professor/time/LAB-badge cards), planner (class-standing-aware unit caps), weekly schedule (visual M-F grid with real-time time-conflict detection, fed by "Add to Schedule" button on each section card; storage `campusval.schedule.v2`), GPA calc/sim, transfer (ASSIST.org articulation lookup), policies, AI advisor (SSE), graduation paths (3-yr & 4-yr for 46 majors with full requirements list + completed-course filtering), AI evaluation (risk-weighted benchmark)
- Class-standing rules: First/Second-year cap 20 standard / 22 with overload; Third/Fourth-year cap 22 standard / 24 with overload. Overload requires GPA ≥ 3.0 + priority registration; advisor approval required when planned units exceed standard cap.
- Major/college restrictions: CSEN/ECEN/MECH/CENG/BIOE/ENGR/AMTH courses gated to School of Engineering students (enforced server-side in `/planner/check`, surfaced as "Engineering only" badge in catalog). Note: SCU renamed COEN → CSEN in 2024-2025.
- Course catalog data: ~2,308 courses scraped from SCU's 2025-2026 undergraduate bulletin (`artifacts/api-server/src/data/courses-data.json`). All ~58 undergraduate departments. Per-quarter section/instructor/seat data is sourced separately via the Workday paste-in feature (below) — never via stored Workday credentials.
- Workday section sync: `/sync-workday` page lets the user paste section rows from SCU Workday's "Find Course Sections" view (no SSO ever stored). The parser (`artifacts/api-server/src/lib/workday-parser.ts`) tolerates spaced day tokens (`T R`, `M W F`, `Th`), 12/24h times, and `N/N` seat formats. Rows go into the `course_sections` DB table (unique on courseCode+sectionNumber+term+year). `POST /api/sections/sync` runs delete+upsert in a transaction and refuses to wipe a term if 0 rows parsed. The course drawer's "Live sections" panel queries `/api/courses/:code/sections` and shows whatever's been synced (each row tagged with its term).
- Articulation data: 116 California Community Colleges (`artifacts/api-server/src/data/community-colleges.json`) with per-CC ASSIST.org deep-links exposed via `GET /api/articulation { colleges: [{name, assistUrl}] }`. Hand-verified equivalency tables cached for 5 high-traffic feeders (De Anza, Foothill, West Valley, Mission, Santa Monica); for all other CCs the UI directs users to ASSIST.org.
- Professor lookup: RateMyProfessor is fully removed (no deep links, ratings, or RMP schemas anywhere). `components/ProfessorLookup.tsx` and the professors page show SCU-directory data only, plus an honest "No SCU course evaluation data available" card linking to the SSO-gated official portal https://evaluations.scu.edu/. Never fabricate professor ratings or evaluation metrics.
- Degree requirements: college-aware (CAS/LSB/SOE) via `GET /api/requirements` backed by `api-server/src/data/degree-requirements.ts` (University Core + college + major groups, official scu.edu source URLs + lastVerified dates). Items with approved-list fulfillment (`needsVerification: true`) support manual check-off in `core-reqs.tsx` (localStorage `campusval.reqs.manual.v1.<CODE>`); items with known course lists auto-check from `completedCourseCodes`. Hybrid items (e.g. Leavey C&I 3: MGMT 80 or approved list) are auto + manual.
- Evaluation: 12-scenario benchmark with risk-weighted scoring (critical=4x weight, ≥0.9 pass bar; low=1x, ≥0.6 pass bar) and forbidden-keyword penalties. Uses model `gpt-5.2` via Replit OpenAI integration (no API key needed).
- Brand: cardinal `#8C1515`, gold `#B08850`
- DB: Drizzle schemas in `lib/db/src/schema/{profile,conversations,messages,sections}`
- AI: OpenAI integration via `@workspace/integrations-openai-ai-server`
- Note: Replit only proxies ports listed in `.replit` (`8080`, `8081`). Frontend is built and served as static by the API server because the platform port allocator can't expose a separate Vite dev port.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
