# SCU Migration Readiness

*Prepared October 2026 for Santa Clara University IT / Information Security. This same summary is in both repositories.*

## Applications

| | **CampusVal** | **PreHealth Advisor** |
|---|---|---|
| What it is | SCU degree & quarter planning; shows the student's Workday Academic Progress Report (APR); AI planning advisor | Health-professions prerequisite lookup + personal planner for SCU Health Professions Peer Advisors |
| Repository | `shikharsisodia7/Campus-Val` (private) | `shikharsisodia7/prehealth-Advisor` (private) |
| Sensitive data | **FERPA:** APRs (with grades), completed courses, GPA/student ID if entered, plans | Self-reported prerequisite grades + application plans (per user); no health data, no files, no AI |
| Start here | [docs/SCU_TECHNICAL_HANDOFF.md](docs/SCU_TECHNICAL_HANDOFF.md) | `prehealth-Advisor/docs/SCU_TECHNICAL_HANDOFF.md` |

## What Was Completed
- Full audit of both codebases; every statement in the documentation cites the code that implements it.
- **Security fixes** (each with tests): APR ownership check hardened against path traversal; CampusVal "Delete account" now deletes all of a student's data and files (it previously left APRs, grades and plans behind); PreHealth Advisor planner data made private per user (it was shared by every signed-in user, including self-reported grades); generic error messages; CORS allowlist for PreHealth Advisor.
- **AI migration** (CampusVal): OpenAI removed entirely; Gemini (API or Vertex AI) or Claude behind one interface; student name, ID, GPA and grades no longer sent to the model.
- **SSO readiness:** both apps now depend on an internal auth interface with Clerk behind it, ready for an SCU OIDC adapter.
- **GCP readiness:** production Dockerfiles, Cloud Build pipelines, a private Google Cloud Storage provider (CampusVal), Cloud SQL guidance; both images built and smoke-tested.
- Architecture, data-flow and trust-boundary diagrams; FERPA inventory; access-control matrix; retention, logging, secrets, network, SSO and checklists.
- All tests, type checks, lint (CampusVal) and builds pass — see [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

## CampusVal APR Storage Answer
- **Where is an APR stored today?** The original file is in a **private Vercel Blob** store (name `progress-reports/<owner fingerprint>/<random ID>`); a structured copy of its table, **including grades**, is in PostgreSQL (`progress_reports.workbook`, Neon today).
- **Does the original persist?** **Yes**, until the student deletes/replaces it or deletes their account — it is needed for "open original" and PDFs kept as original-only. Never written to the server's disk or `/tmp`.
- **Where are grades stored?** Only inside that structured APR copy (and the original file). Not sent to AI, not logged, not visible to advisors or admins; hidden in the sidebar.
- **Who technically has access?** In the app: only the student. Outside the app: whoever holds the production database and Blob credentials — today the developer; after migration, controlled by SCU IAM.
- **What happens after upload?** Validated in memory (type, size, real spreadsheet/PDF, same student) → structured copy saved → original kept privately → student can view, replace or delete.
- **Target:** a private Cloud Storage bucket + Cloud SQL in SCU's project. Details: [docs/security/APR_STORAGE_AUDIT.md](docs/security/APR_STORAGE_AUDIT.md).

## Current Authentication
Clerk (a third-party sign-in service) for both apps. Both production deployments run Clerk **development** instances. CampusVal admits only `@scu.edu` accounts and invited reviewers; PreHealth Advisor admits any account that can sign in.

## Target Authentication
SCU SSO over OpenID Connect, with Duo handled by SCU's identity provider. The apps already call an internal interface (`getCurrentUser`, `requireUser`, `getUserId`, `requireRole`), so only one adapter file changes. Building it needs SCU's details: [docs/migration/SSO_INFORMATION_NEEDED.md](docs/migration/SSO_INFORMATION_NEEDED.md) (ready to send to SCU's identity team). No password store exists or will be created.

## Current Hosting
Vercel (serverless) + Neon PostgreSQL for both; Vercel Blob for CampusVal files; secrets in Vercel environment variables; public internet.

## Target Hosting
Google Cloud Run (one container per app) → Cloud SQL for PostgreSQL (private IP) + Cloud Storage (CampusVal only) + Secret Manager + Cloud Logging; built by Cloud Build into Artifact Registry; reachable only from the SCU network/VPN through an SCU-designed load balancer. See [docs/architecture/CURRENT_VS_TARGET.md](docs/architecture/CURRENT_VS_TARGET.md).

## AI Migration
- **Which AI provider is used?** CampusVal: **Gemini** (Vertex AI recommended — no API key, stays under SCU's Google Cloud agreement) or **Claude**, chosen by `AI_PROVIDER`; off until SCU sets it. PreHealth Advisor's web app uses **no AI**.
- **Is OpenAI still called?** **No.** OpenAI code and packages are removed; `AI_PROVIDER=openai` refuses to start. (Production never had OpenAI credentials configured, so the AI advisor was not working there.) PreHealth Advisor's offline data-research scripts can use OpenAI if a key is set — for SCU use, run them with Gemini only.
- **What is sent?** Program, timeline, units, completed course codes and the conversation. Never name, IDs, GPA, grades, APRs or schedules. [docs/migration/AI_PROVIDER_MIGRATION.md](docs/migration/AI_PROVIDER_MIGRATION.md)

## FERPA / Security Changes

| Change | App | Test |
|---|---|---|
| Exact object-path ownership check (path-traversal fix) | CampusVal | `lib/uploadPath.test.ts`, `lib/storage/gcsProvider.test.ts` |
| "Delete account" deletes every row + stored file of the student | CampusVal | `routes/profile.delete-account.test.ts` |
| Name/ID/GPA removed from AI prompts; provider errors hidden from browser | CampusVal | `lib/ai/ai.test.ts`, `routes/ai-routes.test.ts` |
| Generic JSON error handler (no SQL/stack/paths to clients) | both | `app.error-handling.test.ts` / `app.security.test.ts` |
| Planner rows (incl. grades) owned per user; dashboard scoped | PreHealth Advisor | `routes/ownership.integration.test.ts` (real Postgres) |
| CORS allowlist, security headers, startup config validation | PreHealth Advisor | `app.security.test.ts` |
| Startup refuses `AUTH_PROVIDER=oidc` (until built) and `AI_PROVIDER=openai` | both / CampusVal | `lib/auth/auth.test.ts` |

FERPA inventory: [docs/security/FERPA_DATA_INVENTORY.md](docs/security/FERPA_DATA_INVENTORY.md). Who can access what: [docs/security/ACCESS_CONTROL.md](docs/security/ACCESS_CONTROL.md).

**⚠ Open owner action:** a production database password exists in PreHealth Advisor's git history (`scripts/run-chain.sh`, commit `9077bf8`) and has **not been rotated yet** (it is shared with ResumeForge). Rotate it before sharing the repository. [docs/migration/SECRET_MANAGER.md](docs/migration/SECRET_MANAGER.md)

## Architecture Diagrams
- CampusVal: [docs/architecture/CAMPUSVAL_ARCHITECTURE.md](docs/architecture/CAMPUSVAL_ARCHITECTURE.md), [docs/architecture/CAMPUSVAL_DATA_FLOW.md](docs/architecture/CAMPUSVAL_DATA_FLOW.md), [docs/security/TRUST_BOUNDARIES.md](docs/security/TRUST_BOUNDARIES.md), [docs/architecture/SCU_BULLETIN_DATA_FLOW.md](docs/architecture/SCU_BULLETIN_DATA_FLOW.md)
- PreHealth Advisor: `prehealth-Advisor/docs/architecture/PREHEALTH_ADVISOR_ARCHITECTURE.md`, `prehealth-Advisor/docs/security/TRUST_BOUNDARIES.md`
- Both: [docs/architecture/CURRENT_VS_TARGET.md](docs/architecture/CURRENT_VS_TARGET.md), [docs/migration/NETWORK_ACCESS.md](docs/migration/NETWORK_ACCESS.md)
- Rendered SVGs: `docs/architecture/generated/` in each repository.

## Items Waiting on SCU
GCP project + IAM · Cloud SQL instance · Cloud Storage bucket (CampusVal) · Secret Manager values · Artifact Registry + Cloud Build trigger · DNS + TLS · SCU network/VPN routing and load balancer · SCU OIDC client registration, callback URLs and identity claims · AI provider choice and approval · retention periods · Workday availability endpoint (optional). Full list: [docs/migration/GCP_MIGRATION_CHECKLIST.md](docs/migration/GCP_MIGRATION_CHECKLIST.md).

## How To Run Each Application
- CampusVal: [docs/SCU_TECHNICAL_HANDOFF.md](docs/SCU_TECHNICAL_HANDOFF.md) §5
- PreHealth Advisor: `prehealth-Advisor/docs/SCU_TECHNICAL_HANDOFF.md` §5

## How To Test
Each handoff document §6. No test calls a paid AI API, sends email, or touches production data.

## How To Deploy To GCP
Create the resources in [docs/migration/GCP_MIGRATION_CHECKLIST.md](docs/migration/GCP_MIGRATION_CHECKLIST.md), set the trigger substitutions in each `cloudbuild.yaml`, run the trigger. PreHealth Advisor: run `pnpm --filter @workspace/db run migrate` against its database first.

## Final Status
- **Code-side work: complete** for everything that does not need SCU-controlled values.
- **Tests/builds: passing** — CampusVal lint, typecheck, 1,039 API + 556 web + 26 mobile tests, builds, Docker build; PreHealth Advisor typecheck, 32 API + 127 web + 107 scripts tests, builds, Docker build.
- **Not yet done (needs SCU):** SSO adapter, GCP provisioning, network restriction, AI provider approval and a live AI smoke test, data migration.
- **Merged and deployed** to production on Vercel for both apps (CampusVal PR #65, PreHealth Advisor PR #7, plus a follow-up PR each) and verified in a browser.
- PreHealth Advisor additionally gained **"Delete my data"** and **versioned database migrations** (production baselined).
- **Open owner action:** rotate the leaked Neon password (see above).
