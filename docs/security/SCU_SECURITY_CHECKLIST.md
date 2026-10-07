# SCU Security Review Checklist — CampusVal

`[x]` = done and verified in code/tests. `[ ]` = not done (planned items are **not** checked).

## Authentication
- [x] Every user-data API route requires sign-in (`requireUser`); signed-out → 401
- [x] Only `@scu.edu` accounts and explicitly invited reviewers admitted (`lib/auth/policy.ts`)
- [x] Server depends on an internal auth interface; Clerk isolated in one adapter file (`lib/auth/clerk.ts`)
- [x] No application password store exists; none added
- [x] `AUTH_PROVIDER=oidc` refuses to start until a real adapter exists (no half-working SSO)
- [ ] SCU SSO (OIDC) adapter built and tested — **needs SCU IdP details**
- [ ] Duo/MFA enforced — **at SCU's IdP**
- [ ] Production uses a Clerk *production* instance meanwhile (production currently runs Clerk's development instance)

## Authorization
- [x] Every query on student data is scoped to the session user ID (other users' IDs → 404)
- [x] User IDs come only from the session, never from request bodies
- [x] Admin dashboards gated by `requireRole("admin")` (`ADMIN_EMAILS`); admins cannot read student records
- [x] No default admin account; none created
- [x] Advisor access only by student-granted, revocable, scoped share; APR never shareable
- [x] Shared course-data replacement limited to one data-steward account (`WORKDAY_SYNC_ADMIN_EMAIL`)
- [x] Tests for cross-user access (progress reports, checksheets, plan shares, ownership tests)

## FERPA Data
- [x] Inventory of every sensitive field ([FERPA_DATA_INVENTORY.md](FERPA_DATA_INVENTORY.md))
- [x] Grades hidden in the sidebar server-side; full APR only to its owner
- [x] "Delete account" deletes **all** the student's rows and files (fixed this pass; tested)
- [ ] Retention periods set by SCU and an inactivity purge implemented
- [ ] Production data moved into SCU-controlled infrastructure

## APR Uploads
- [x] Type, extension, magic bytes, size, empty-file and zip-bomb checks; malformed files rejected and deleted
- [x] Exact object-path validation (path-traversal fix this pass; tested)
- [x] Fixed download filename, `nosniff`, sandbox CSP, `no-store`
- [x] Max 12 documents per student
- [ ] Request-rate limiting (recommend Cloud Armor at SCU's load balancer)

## Database
- [x] Parameterized queries via Drizzle ORM (no string-built SQL with user input)
- [x] Versioned migrations; CI rejects schema changes without a migration; migrations tested on empty Postgres
- [x] Cloud SQL connection documented (Unix socket, no code change) ([CLOUD_SQL.md](../migration/CLOUD_SQL.md))
- [ ] Cloud SQL instance (private IP, backups, PITR) created — **SCU**
- [ ] Data migrated from Neon; old credentials rotated

## File Storage
- [x] Private object storage only; no public URLs; reads stream through owner-checked routes
- [x] GCS provider implemented (no signed URLs, no key files) and tested with a mocked GCS API
- [ ] Private bucket created with public-access prevention + IAM binding — **SCU**
- [ ] Existing Vercel Blob files copied, Blob store deleted
- [ ] GCS provider exercised against a real bucket (staging)

## AI
- [x] OpenAI removed from code and dependencies; no fallback; `AI_PROVIDER=openai` refused at startup
- [x] Gemini (API or Vertex AI) and Claude supported behind one interface
- [x] Name, student ID, GPA, grades, APR, schedules never sent to the model (tested)
- [x] Provider errors never reach the browser; prompts/answers not logged
- [ ] SCU selects the provider and approves its data terms (Vertex AI recommended)
- [ ] Live smoke test with SCU's credentials (chat + voice in Chrome and Safari)

## Secrets
- [x] No secrets in git (full-history scan of this repo: one dummy test value only)
- [x] `.env*` git-ignored and docker-ignored; images verified to contain no `.env`
- [x] Secret inventory + Secret Manager names ([SECRET_MANAGER.md](../migration/SECRET_MANAGER.md))
- [ ] Secrets created in Secret Manager — **SCU**
- [ ] Neon / Blob credentials (stored as non-sensitive Vercel vars) rotated at cut-over

## Dependencies
- [x] `pnpm audit --prod` (2026-10-06): 2 advisories, both with **no fixed release published** and both **unreachable** in CampusVal:
  - `braces` ≤3.0.3 (high), via `http-proxy-middleware` → `micromatch`. micromatch/braces run only for a glob `pathFilter`; the Clerk proxy (`middlewares/clerkProxyMiddleware.ts`) sets none, so every request takes the plain string-prefix match.
  - `sprintf-js` ≤1.1.3 (moderate), via `mammoth` → `argparse`. argparse is used only by mammoth's command-line tool (`bin/mammoth`); CampusVal imports the library, which never loads it.
  Re-check when braces 3.0.4 / sprintf-js 1.1.4 are published and pin them in `pnpm-workspace.yaml` overrides.
- [x] `pnpm audit --prod` does not see the web app's bundle: Vite apps list what they bundle under `devDependencies`. GitHub's Dependabot (which reads `pnpm-lock.yaml`) does, and on 2026-10-06 flagged `pdfjs-dist` 5.7.284 (GHSA-hq66-cqwq-w95j, high: a malicious PDF runs script when the PDF.js **viewer** loads it with `enableScripting` on). **Unreachable** in CampusVal: `ChecksheetPdfView.tsx` uses only the core `getDocument` / render / text-layer API, never the viewer or its scripting manager (`pdf.scripting.mjs` is never imported), so no PDF script can run; the server reads and renders pages with `unpdf`'s core calls (`getDocumentProxy`, `renderPageAsImage`), which do not run PDF scripts either and are not in a browser origin. Upgrade to `pdfjs-dist` ≥6.2.108 when the PDF view is next touched (a major version: the worker, text layer and the asset-copy plugin in `vite.config.ts` need re-testing).
- [ ] The rest of Dependabot's lockfile alerts (about 90 on 2026-10-06) are in build, test, code-generation and mobile toolchains (`orval`, `vite`/`vitest` dev server, Expo's `@xmldom/xmldom`, `image-size`, `node-forge`, `undici`, `fast-uri`, ...). They are not individually triaged here; most are not shipped to users, but each needs its own reachability check before being dismissed.

## Logging
- [x] No request bodies, file content, grades, prompts or tokens in logs ([LOGGING.md](LOGGING.md))
- [x] Auth headers and upload tokens redacted
- [x] Generic error responses; detail stays server-side (tested)
- [ ] Data Access audit logs + alerts configured — **SCU**

## GCP
- [x] Production Dockerfile: multi-stage, non-root (UID 10001), no dev dependencies, `PORT`/`0.0.0.0`, health check
- [x] `cloudbuild.yaml`: build → Artifact Registry → migrations job → Cloud Run; no hardcoded project
- [x] Image built and smoke-tested locally (health, readiness, auth gates, config refusals)
- [ ] GCP project, service accounts, Artifact Registry, Cloud Build trigger — **SCU**

## Networking
- [x] Cloud Run deployed with `--ingress=internal-and-cloud-load-balancing` and `--no-allow-unauthenticated` by default
- [x] CORS allowlist; `TRUST_PROXY` support; HSTS over HTTPS
- [ ] Load balancer + campus/VPN restriction + DNS + TLS — **SCU**

## Testing
- [x] Lint, typecheck, API (1,039), web (556), mobile (26) tests pass; both builds pass
- [x] New tests: AI layer, AI routes, auth interface, config, upload paths, GCS provider, error handling, account deletion
- [x] Docker build + container smoke test
- [ ] Authenticated end-to-end (Playwright) run against a staging deployment on GCP
