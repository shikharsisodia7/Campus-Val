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
- [x] No secrets in git (Gitleaks over the full history, 255 commits, 2026-10-07: 9 hits, all placeholders: the `dummy.clerk.accounts.dev` publishable key, a `sk_test_dumm…` test value, a test upload token, and localStorage key names)
- [x] `.env*` git-ignored and docker-ignored; images verified to contain no `.env`
- [x] Secret inventory + Secret Manager names ([SECRET_MANAGER.md](../migration/SECRET_MANAGER.md))
- [ ] Secrets created in Secret Manager — **SCU**
- [ ] Neon / Blob credentials (stored as non-sensitive Vercel vars) rotated at cut-over

## Dependencies
- [x] `pnpm audit --prod` (2026-10-06; re-run 2026-10-17 with the same result): 2 advisories, both with **no fixed release published** and both **unreachable** in CampusVal:
  - `braces` ≤3.0.3 (high), via `http-proxy-middleware` → `micromatch`. micromatch/braces run only for a glob `pathFilter`; the Clerk proxy (`middlewares/clerkProxyMiddleware.ts`) sets none, so every request takes the plain string-prefix match.
  - `sprintf-js` ≤1.1.3 (moderate), via `mammoth` → `argparse`. argparse is used only by mammoth's command-line tool (`bin/mammoth`); CampusVal imports the library, which never loads it.
  Re-check when braces 3.0.4 / sprintf-js 1.1.4 are published and pin them in `pnpm-workspace.yaml` overrides. On 2026-10-17 the registry's newest releases were still braces 3.0.3 and sprintf-js 1.1.3, so no override can point at a fix. The newest `http-proxy-middleware` (4.2.0) still requires `micromatch` ^4.0.8, and the newest `mammoth` (1.13.0) still requires `argparse` ~1.0.3, so no upgrade removes either path. Re-verified in the installed code: `micromatch` is called only from `path-filter.js`'s glob branch, and `argparse` is required only by `bin/mammoth`.
- [x] `pnpm audit --prod` does not see the web app's bundle: Vite apps list what they bundle under `devDependencies`. GitHub's Dependabot (which reads `pnpm-lock.yaml`) does, and on 2026-10-06 flagged `pdfjs-dist` 5.7.284 (GHSA-hq66-cqwq-w95j, high: a malicious PDF runs script when the PDF.js **viewer** loads it with `enableScripting` on). **Unreachable** in CampusVal: `ChecksheetPdfView.tsx` uses only the core `getDocument` / render / text-layer API, never the viewer or its scripting manager (`pdf.scripting.mjs` is never imported), so no PDF script can run; the server reads and renders pages with `unpdf`'s core calls (`getDocumentProxy`, `renderPageAsImage`), which do not run PDF scripts either and are not in a browser origin. **Upgraded 2026-10-07** to `pdfjs-dist` 6.3.289 anyway (it is the code students run): `getDocument`'s options, `render`, `TextLayer`, the worker path and the asset folders `vite.config.ts` copies are unchanged in 6.x (checked against its own types and files); the one API change, `PDFDocumentProxy.destroy()` removed, is handled by releasing through the loading task.
- [x] The rest of Dependabot's lockfile alerts (92 open on 2026-10-07), each traced to the web app's and the server's own dependencies (`pnpm --filter <app> why <package>`):
  - **Fixed** (shipped code; `pnpm-workspace.yaml` overrides, same major version): `lodash` 4.17.23 → 4.18.1, bundled into the web app by `recharts` (`_.template` code injection, `_.unset`/`_.omit` prototype pollution); `fast-copy` 4.0.2 → 4.1.2, in the server via `pino-pretty` (stack exhaustion on deeply nested values).
  - **Also fixed the same day** (developer, build, test and code-generation tooling, every fix in the same major version): `orval` 8.5.3 → 8.22.0 (its 11 critical advisories need a malicious OpenAPI spec; the generated client was checked to be request-for-request identical, see the codegen commit), `shell-quote` 1.11.0, `@xmldom/xmldom` 0.9.12, `fast-uri` 3.1.8, `undici` 7.30.0, `vite` 7.3.6, `vitest`/`@vitest/mocker` 4.1.11, `brace-expansion` 5.0.12, `compression` 1.8.2, `js-yaml` 3.15.2 / 4.3.2, `nanoid` 3.3.19, `picomatch` 4.0.7, `postcss` 8.5.28, `source-map-js` 1.2.2, `@babel/core` 7.29.7; `linkify-it` and `markdown-it` are gone (only old orval used them).
  - **Left open, each for a stated reason** (none is in the web app, the server or the mobile binary):
    - no fixed release published: `node-forge` ≤1.4.0 and `http-cache-semantics` ≤4.2.0 (Expo CLI), `braces` and `sprintf-js` (above);
    - fixed only in a new major version that the tool using it does not support: `image-size` (2.x; Metro, which sizes the app's own image assets, calls the 1.x API), `decode-uri-component` 0.5 (Expo CLI), `postcss-selector-parser` 7 (`@tailwindcss/typography` uses 6.x, on CampusVal's own CSS), `esbuild` 0.28 (Vite 7.3 requires `^0.27`; the advisory concerns esbuild's own dev server on Windows, which CampusVal does not use).
  - The server's `brace-expansion` (via `exceljs`) is the 1.x/2.x line already held at fixed releases above.
- [x] Supply-chain install policy (`pnpm-workspace.yaml`): `minimumReleaseAge` 7 days (a version must have been public a week before it can be installed), `blockExoticSubdeps: true` (no transitive git/tarball dependencies), `trustPolicy: no-downgrade` (a version whose publishing evidence is weaker than an earlier one is refused). Eight locked versions from release lines that predate their maintainers' provenance are excluded by exact version; any other version of them is still checked. pnpm 11 verifies the whole lockfile against these on every install (1,532 entries pass), Vercel's frozen-lockfile install included.
- [x] Static analysis (2026-10-07): Semgrep `p/default` + `p/typescript` + `p/react` over the committed tree (956 files): 45 findings. Fixed: mutable GitHub Action tags (pinned to commit SHAs) and the pnpm policies above. The rest are false positives, each checked: every server `path.join` takes either server configuration, one of three exact routes (`/robots.txt`, `/sitemap.xml`, `/llms.txt`) or the groups of `UPLOAD_OBJECT_PATH_RE` (16 hex digits and a UUID, so no `/` or `..`); the two `new RegExp` calls in the APR reader are only given literal attribute names; `/voice/speak` returns audio with a fixed `audio/*` type and `nosniff`; the only `http://` request is the Replit sidecar on loopback; the remaining hits are test fixtures, mobile build scripts and a `data:` favicon. 14 files were only partly parsed (newer TypeScript syntax; `tsc` compiles them).

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

## Static scan, 2026-10-09 (Provost-demo pass, PR #80, and PreHealth PR #18)

`semgrep scan --metrics=off --config p/typescript --config p/javascript --config p/security-audit --config p/secrets` (official
`semgrep/semgrep` Docker image) over every non-generated, non-test TypeScript file the pass changed:

- CampusVal, 43 files: **0 findings in application code.** 2 warnings (`unknown-value-with-script-tag`) are in
  `artifacts/e2e/tests/degree-checksheets.spec.ts` test F, pre-existing and deliberate: hostile HTML written to disk to prove the
  checksheet upload refuses it. 2 partial-parse notices (a literal `&` in JSX text in `admin-program-requirements.tsx` and
  `courses.tsx`); the rest of those files was scanned.
- PreHealth Advisor (Program Explorer trusted resources), 7 files: **0 findings.**

New attack surface reviewed by hand: the Degree Completion Assessment routes are owner-scoped like every APR route (structural and
behavioural tests); `POST /api/internal/availability/refresh` is off unless a 24+ character secret is set and compares it in
constant time; `POST /api/section-availability/refresh` needs a session and is rate-limited per student and per term; Department
Note course codes are validated against the catalog and rendered as text; the PreHealth trusted-resource importer accepts https
URLs only and writes only to `EXPLORER_ALLOW_DATABASE`.
