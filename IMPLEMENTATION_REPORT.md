# Implementation Report — SCU Migration Readiness

*October 5, 2026. Branch `scu/gcp-migration-readiness` in both repositories. This same report is in both repositories.*

## Repositories Audited

| Repository | Local path | Base | Stack found |
|---|---|---|---|
| `shikharsisodia7/Campus-Val` (CampusVal) | `Desktop/Campus-Val` | `main` @ `25a94d6` | pnpm 11 monorepo; React 19 + Vite web; Express 5 + TypeScript API (esbuild); Drizzle + PostgreSQL (Neon) with versioned migrations; Clerk; Vercel Blob; OpenAI via Replit proxy (unconfigured in prod); Expo mobile; Vitest + Playwright; GitHub Actions CI; existing hardened Dockerfile |
| `shikharsisodia7/prehealth-Advisor` (PeerHeld Educator) | `Desktop/prehealth-Advisor` | `main` @ `c5dc47a` | pnpm monorepo; React 19 + Vite web; Express 5 API; Drizzle + PostgreSQL (Neon) via `drizzle-kit push`; Clerk; no file storage; no AI in the app (offline research pipeline uses LLMs on public pages); Vitest; no CI, no lint script, no Dockerfile |

## Files Added

**CampusVal**
- AI layer: `artifacts/api-server/src/lib/ai/{types,index,gemini,anthropic,sse,student-context}.ts`, `ai.test.ts`
- Auth interface: `artifacts/api-server/src/lib/auth/{types,clerk,policy,index}.ts`, `auth.test.ts`
- Storage: `artifacts/api-server/src/lib/storage/gcsProvider.ts`, `gcsProvider.test.ts`, `uploadToken.ts`
- Tests: `lib/uploadPath.test.ts`, `routes/ai-routes.test.ts`, `routes/profile.delete-account.test.ts`, `app.error-handling.test.ts`
- `cloudbuild.yaml`
- Docs: `docs/SCU_TECHNICAL_HANDOFF.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/architecture/{CAMPUSVAL_ARCHITECTURE,CAMPUSVAL_DATA_FLOW,CURRENT_VS_TARGET,SCU_BULLETIN_DATA_FLOW}.md`, `docs/architecture/generated/*.svg` (6), `docs/security/{APR_STORAGE_AUDIT,FERPA_DATA_INVENTORY,ACCESS_CONTROL,TRUST_BOUNDARIES,DATA_RETENTION,LOGGING,FILE_UPLOAD_HARDENING,SCU_SECURITY_CHECKLIST}.md`, `docs/migration/{SCU_SSO_MIGRATION,SSO_INFORMATION_NEEDED,AI_PROVIDER_MIGRATION,CLOUD_SQL,CLOUD_STORAGE,SECRET_MANAGER,NETWORK_ACCESS,GCP_MIGRATION_CHECKLIST}.md`, `SCU_MIGRATION_README.md`, `IMPLEMENTATION_REPORT.md`

**PeerHeld Educator**
- `artifacts/api-server/src/lib/auth.ts`, `lib/config.ts`
- Tests: `artifacts/api-server/src/app.security.test.ts`, `routes/ownership.integration.test.ts`
- `Dockerfile`, `.dockerignore`, `cloudbuild.yaml`
- `docs/migration/sql/2026-10-planner-owner.sql`
- Docs: `docs/SCU_TECHNICAL_HANDOFF.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/architecture/{PEERHELD_EDUCATOR_ARCHITECTURE,CURRENT_VS_TARGET}.md`, `docs/architecture/generated/*.svg` (5), `docs/security/{FERPA_DATA_INVENTORY,ACCESS_CONTROL,TRUST_BOUNDARIES,DATA_RETENTION,LOGGING,SCU_SECURITY_CHECKLIST}.md`, `docs/migration/{SCU_SSO_MIGRATION,SSO_INFORMATION_NEEDED,AI_PROVIDER_MIGRATION,CLOUD_SQL,CLOUD_STORAGE,SECRET_MANAGER,NETWORK_ACCESS,GCP_MIGRATION_CHECKLIST}.md`, `SCU_MIGRATION_README.md`, `IMPLEMENTATION_REPORT.md`

## Files Modified

**CampusVal:** `artifacts/api-server/src/{app.ts, lib/config.ts, lib/uploadPath.ts, lib/storage/index.ts, lib/storage/localProvider.ts, middlewares/requireAuth.ts, data/advisor-prompt.ts}`, `routes/{openai,voice,evaluation,profile,storage,usage,feedback}.ts`, `routes/{progress-reports,degree-checksheets}.access-control.test.ts`, `artifacts/api-server/{package.json,tsconfig.json}`, `tsconfig.json`, `pnpm-lock.yaml` (−152 lines, nothing added), `Dockerfile`, `.env.example`.
**Deleted:** `lib/integrations-openai-ai-server/`, `lib/integrations-openai-ai-react/`, `lib/integrations/openai_ai_integrations/`.

**PeerHeld Educator:** `artifacts/api-server/src/{app.ts, index.ts, middlewares/requireAuth.ts}`, `routes/{target-schools,prereq-courses,dashboard}.ts`, `lib/db/src/{index.ts, schema/targetSchools.ts, schema/prereqCourses.ts}`, `.env.example`.

## Security Fixes

| # | App | Problem found | Fix | Test |
|---|---|---|---|---|
| 1 | CampusVal | Upload ownership checked with `startsWith`; `/objects/uploads/<mine>/../<other>/<uuid>` passed and resolves to another student's object once turned into a Blob URL | Exact-shape regex in `lib/uploadPath.ts` (shared by APR + checksheets, all providers) | `lib/uploadPath.test.ts` |
| 2 | CampusVal | "Delete account" deleted only the profile and AI chats; APR rows (grades), APR files, checksheets, plans, schedules, shares, feedback and usage records remained | One transaction deletes all 16 data categories, then stored files | `routes/profile.delete-account.test.ts` |
| 3 | CampusVal | Student name, cumulative GPA and major GPA sent to the AI provider | Minimized context (`lib/ai/student-context.ts`) | `lib/ai/ai.test.ts`, `routes/ai-routes.test.ts` |
| 4 | CampusVal | Raw provider/env error text streamed to the browser (AI chat, voice, evaluation) | Fixed public messages; category-only logs | `routes/ai-routes.test.ts` |
| 5 | CampusVal | No final error handler (Express default) | Generic JSON 4xx/500 | `app.error-handling.test.ts` |
| 6 | CampusVal | Voice converted audio through ffmpeg temp files in `/tmp` | Removed; audio held in memory only | `routes/ai-routes.test.ts` |
| 7 | PeerHeld | `prereq_courses` (incl. grades) and `target_schools` had no owner — every signed-in user could read, edit and delete everyone's rows; dashboard aggregated all users | `owner_user_id` column + every query scoped; legacy rows fail closed | `routes/ownership.integration.test.ts` (real PostgreSQL) |
| 8 | PeerHeld | `cors()` allowed any origin | Allowlist (`PUBLIC_APP_URL`, `CORS_ALLOWED_ORIGINS`) | `app.security.test.ts` |
| 9 | PeerHeld | No security headers, no error handler, no startup validation | Added | `app.security.test.ts` |

**Found, not changed (needs the owner's decision):** a real Neon production database password in prehealth-Advisor git history (`scripts/run-chain.sh` @ `9077bf8`) — **rotate it**; PeerHeld privacy page claims planner selections are saved to the account (they are not — page memory only); both production apps run Clerk *development* instances; CampusVal's Neon/Blob credentials are stored as non-sensitive Vercel variables.

## APR Storage Findings
Original file: **private Vercel Blob**, kept until the student deletes/replaces it or deletes their account; never on server disk or `/tmp`. Structured copy incl. grades: `progress_reports.workbook` (PostgreSQL). Access: owner only through the app (every route signed-in + `WHERE user_id`); advisors and admins cannot read APRs; technically, holders of production DB/Blob credentials (today the developer). No public or browser-visible storage URLs. Full trace: [docs/security/APR_STORAGE_AUDIT.md](docs/security/APR_STORAGE_AUDIT.md).

## AI Migration
OpenAI → **Gemini** (Gemini API or **Vertex AI**, recommended) or **Claude**, via `AI_PROVIDER`; no fallback; OpenAI packages deleted. Covers advisor chat (streaming), voice (Gemini speech-to-text and text-to-speech, WAV), evaluation bench. No new dependencies (REST via `fetch`; Vertex auth via existing `google-auth-library`). Verified with mocked responses only — no paid API calls. [docs/migration/AI_PROVIDER_MIGRATION.md](docs/migration/AI_PROVIDER_MIGRATION.md)

## Auth/SSO Preparation
Internal interface in both apps (`getCurrentUser`, `requireUser`, `getUserId`, plus `requireRole` in CampusVal); Clerk confined to one adapter file per app; `AUTH_PROVIDER` selection; OIDC deliberately refused at startup until SCU supplies issuer/client/claims; `SCU_OIDC_*` placeholders; mapping plan for Clerk user IDs (14 CampusVal columns, 3 PeerHeld columns). [docs/migration/SSO_INFORMATION_NEEDED.md](docs/migration/SSO_INFORMATION_NEEDED.md)

## GCP Preparation
Dockerfiles (multi-stage, non-root UID 10001, no dev deps, `PORT`/`0.0.0.0`, health checks; CampusVal now ships its one native module so PDF page rendering works in the container); `cloudbuild.yaml` for both (no hardcoded project; ingress `internal-and-cloud-load-balancing`; `--no-allow-unauthenticated`; secrets by name; CampusVal runs migrations as a Cloud Run Job first); `gcs` storage provider; Cloud SQL socket guidance (no code change); PeerHeld container now serves the web app and validates config at startup.

## Architecture Documentation
11 Mermaid diagrams (all rendered to SVG with Mermaid CLI 11 — which also validated their syntax): CampusVal architecture, deployment, data flow, Bulletin flow, trust boundaries; PeerHeld architecture, deployment, data flow, trust boundaries; network access (both).

## Tests Run
Exact results from the final runs on this branch (Windows 11, Node 24.19, pnpm 11.20; database tests against a throwaway local PostgreSQL 16 — never production):

```text
CampusVal
  Lint (eslint --max-warnings 0):   PASS
  TypeScript (all packages):        PASS
  API tests:                        1039/1039 PASS (66 files)   [baseline before changes: 992/992]
  Web tests:                        556/556 PASS (49 files)
  Mobile tests:                     26/26 PASS
  Web build:                        PASS
  API build:                        PASS
  Docker build:                     PASS — image runs as UID 10001, contains no .env;
                                    /api/healthz 200, /api/readyz 200 (DB ok), protected routes 401,
                                    AUTH_PROVIDER=oidc and AI_PROVIDER=openai refuse to start,
                                    migrations --status against Postgres: all applied

PeerHeld Educator
  Lint:                             N/A (no lint script exists in this repository)
  TypeScript (all packages):        PASS
  API tests:                        31/31 PASS (5 files, incl. ownership test on real PostgreSQL)   [baseline: 20/20]
  Web tests:                        127/127 PASS (6 files)
  Scripts tests:                    107/107 PASS (4 files)
  Web build:                        PASS
  API build:                        PASS
  Docker build:                     PASS — UID 10001, no .env; /api/healthz 200, SPA served,
                                    API 401 signed-out, foreign Origin gets no CORS grant,
                                    AUTH_PROVIDER=oidc refuses to start
```
Not run: Playwright end-to-end suites (they need a deployed environment with Clerk test keys; no staging on GCP exists yet).

## Remaining External Dependencies

```text
Need: GCP project(s), IAM service accounts and roles
Who provides it: SCU IT / Cloud team
Where it is used: cloudbuild.yaml (_SERVICE_ACCOUNT), ACCESS_CONTROL.md §3
What happens after receiving it: create Artifact Registry + Cloud Build trigger; deploy staging
```
```text
Need: Cloud SQL for PostgreSQL 16 instance(s), private IP, backups
Who provides it: SCU IT
Where it is used: DATABASE_URL secret; _CLOUDSQL_INSTANCE substitution
What happens after receiving it: restore data from Neon, verify migration status, deploy
```
```text
Need: Private Cloud Storage bucket (CampusVal)
Who provides it: SCU IT
Where it is used: GCS_BUCKET / _GCS_BUCKET; PRIVATE_STORAGE_PROVIDER=gcs
What happens after receiving it: copy existing Vercel Blob objects under the same names; test upload in staging
```
```text
Need: Secret Manager secrets (DB URLs, signing key, Clerk keys; later OIDC secret; AI key if not Vertex)
Who provides it: SCU IT (values), developer (names — SECRET_MANAGER.md)
Where it is used: _SECRETS substitution in each cloudbuild.yaml
What happens after receiving it: deploy; rotate all old-platform credentials
```
```text
Need: SCU OIDC registration — issuer/discovery URL, client IDs, client secret delivery, callback URIs, scopes, user-ID/email/affiliation claims, MFA/acr, session/logout policy, test accounts
Who provides it: SCU Identity (IdP) team — SSO_INFORMATION_NEEDED.md
Where it is used: the OIDC adapter in each app's lib/auth; SCU_OIDC_* variables
What happens after receiving it: build + test the adapter in staging, map existing users, switch AUTH_PROVIDER=oidc, retire Clerk
```
```text
Need: DNS hostnames, TLS, SCU network/VPN routing, load balancer / Cloud Armor
Who provides it: SCU IT Networking
Where it is used: PUBLIC_APP_URL, TRUST_PROXY, _INGRESS, NETWORK_ACCESS.md
What happens after receiving it: confirm campus/VPN-only reachability and that *.run.app is not directly reachable
```
```text
Need: AI provider decision + approval of its data terms (Vertex AI recommended)
Who provides it: SCU IT / Privacy Office
Where it is used: AI_PROVIDER (+ roles/aiplatform.user or an API key)
What happens after receiving it: live smoke test in staging (chat + voice in Chrome and Safari), then enable
```
```text
Need: Retention periods for APRs, conversations, usage events, backups
Who provides it: SCU Registrar / Privacy Office
Where it is used: DATA_RETENTION.md; optional purge job + bucket lifecycle rule
What happens after receiving it: implement the scheduled purge using the existing account-deletion code
```
```text
Need: Owner decisions — rotate the Neon password in prehealth-Advisor history; fix the PeerHeld privacy page wording; review and merge branch scu/gcp-migration-readiness (PeerHeld: apply docs/migration/sql/2026-10-planner-owner.sql BEFORE deploying)
Who provides it: Application owner
Where it is used: SECRET_MANAGER.md, PeerHeld privacy page, both repositories
What happens after receiving it: production on Vercel picks up the fixes; SCU receives the repositories
```
