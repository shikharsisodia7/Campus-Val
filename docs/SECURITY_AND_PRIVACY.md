# Security and Privacy Overview

Written for a skeptical IT reviewer deciding whether to allow controlled
testing. Every claim below is backed by a real check — grep the referenced
file/test if you want to verify it yourself.

## Authentication

- Clerk-based session auth (`artifacts/api-server/src/middlewares/requireAuth.ts`).
  `req.userId`/`req.userEmail` are derived server-side from a verified
  session — never trusted from client-supplied request bodies.
- Access is gated to `@scu.edu` email addresses plus an explicit invited-
  reviewer allowlist (`GUEST_REVIEWER_EMAILS` env var — see
  `docs/EXTERNAL_REVIEWERS.md`). No email is hardcoded in source; the
  allowlist is verified empty in the repo (`.env.example`) and only ever
  set via Vercel environment variables.
- Random unauthenticated or unauthorized users get a 401/403, not a
  degraded view.

## Ownership and isolation

- Every plan-scoped API route (`routes/plans.ts`) verifies
  `academicPlansTable.userId === req.userId` before returning or mutating
  anything (`ownedPlan()` helper) — a student can never read or write
  another student's plan.
- The APR (Workday Academic Progress Report) upload/read/delete paths
  (`routes/progress-reports.ts`) are gated the same way, plus a path-level
  ownership check (`storage.isUploadPathOwnedBy`/`canRead`) before any file
  content is touched.

## Advisor sharing

Read `docs/ADVISOR_SHARING.md` for the full model. Summary: a student
explicitly grants a specific advisor's email read-only access to a scoped
subset of their planning data (Degree Plan and/or Tentative Degree Plan);
every advisor-facing read re-checks an active, correctly-scoped grant
server-side on every request; Workday APR is never shareable through this
feature at all (no scope for it, no route reads it); revocation is
immediate. Covered by tests against a real database
(`routes/plan-shares.test.ts`).

## Usage analytics

Deliberately minimal (`docs/USAGE_ANALYTICS.md`): which high-level product
feature a signed-in user visited, and when. Never course codes, grades,
APR/report contents, uploaded file content, or free-text query strings —
enforced server-side by a closed feature allowlist
(`USAGE_FEATURES` in `routes/usage.ts`), not just client discipline.

The admin summary dashboard (`GET /api/admin/usage/summary`) is gated by a
server-side `ADMIN_EMAILS` allowlist (`lib/admin.ts`) — being an admin does
**not** grant access to any student's plan or APR; those are separate
permission systems.

## Report Error / Suggest Changes

Full detail in `docs/FEEDBACK_AND_ERROR_REPORTING.md`. Security-relevant
points: `POST /api/feedback` requires the same `requireAuth` gate as every
other route (no separate, weaker auth path for this feature); the admin
review queue (`GET`/`PATCH /api/admin/feedback`) is gated by the same
`ADMIN_EMAILS` allowlist as usage analytics, and a non-admin gets a 403
rather than an empty list (no enumeration signal). The server never
auto-captures APR content, Degree Plan contents, grades, cookies, or auth
tokens — only what a reporter explicitly typed, plus their verified
identity. Field lengths and the official-source URL are validated
server-side; unrecognized request fields are dropped, not stored (see the
"ignores client-supplied identity and any unrecognized/sensitive fields"
test in `routes/feedback.test.ts`).

## Tester feature gating

`GET /api/me/role` exposes a single `isAdmin` boolean derived from the same
`ADMIN_EMAILS` allowlist. The frontend uses it only to decide nav
prominence (reduced core nav vs. full nav) — it carries no authorization
weight of its own; every actual data access is still independently
enforced server-side as described above.

## Clerk Development vs. Production mode (deliberate, current choice)

CampusVal's Clerk auth instance is currently a **Development** instance
(`pk_test_...`, frontend API on a `*.accounts.dev` domain), not a Production
instance. This is a deliberate decision for the current controlled
undergraduate-testing phase, not an oversight:

- **Why Development is appropriate right now:** the current cohort is a
  small, controlled group of invited SCU students and reviewers (see
  `docs/TESTING_ROLLOUT.md`). Clerk's Development instance has no
  functional limitation that affects this cohort — sign-in, OAuth
  (Apple/GitHub/Google), sessions, and the advisor-sharing/APR/plan
  features all work identically to Production. The only differences are a
  visible "Development mode" badge on the auth UI and Clerk's own
  higher-volume rate limits, neither of which matters at this scale.
- **Why NOT to migrate yet:** creating a Clerk Production instance requires
  binding a **custom domain** (Clerk does not let a Production instance run
  on a shared `*.accounts.dev`/Vercel preview-style domain the way
  Development does) and provisions an **entirely separate, initially empty
  user database** — every existing account, including real testers, would
  need to sign up again from zero. That is a real migration event with real
  user-facing disruption, not a config flag, and shouldn't be triggered
  incidentally.
- **Exact migration trigger:** migrate to a Clerk Production instance
  *before* any rollout beyond the current controlled-testing cohort (i.e.
  before opening CampusVal to the broader SCU student body, or any
  audience whose accounts must be treated as durable/institutional). At
  that point: acquire/confirm a custom domain for the Production frontend
  API, create the Production instance in the Clerk Dashboard, configure
  `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`VITE_CLERK_PUBLISHABLE_KEY` in
  Vercel for the Production instance's keys, and plan for existing testers
  to re-authenticate once.
- **Sign-in strategy note for anyone extending auth-adjacent code:** this
  Clerk instance has only OAuth (Apple/GitHub/Google) and the `ticket`
  strategy enabled for sign-in — no password or email-code strategy. Any
  tooling that assumes password-based sign-in (e.g. a script or test) will
  fail against this instance regardless of credentials; see
  `artifacts/e2e/README.md` for how the E2E harness authenticates instead.

## Academic Progress Report (APR) access audit — 2026-09-19

The APR is a student record. This is what was checked, what was found, and what
was changed. Every "checked" line is enforced by a test that fails if it regresses.

| Question | Finding | Evidence |
| --- | --- | --- |
| Can only the owner list / upload / rename / replace / delete / read? | **Yes.** Every APR route is `requireAuth`; the owner is only ever `req.userId`, derived from the verified session. No route reads a client-sent user id. Every query against the APR table is scoped to that owner, so another student's document id returns the same 404 as one that does not exist. | `progress-reports.access-control.test.ts` (structural + behavioural); `qa-flows` spec F |
| Can user A reach user B's APR by changing an id? | **No** — list, metadata, workbook, original file, rename, replace and delete were each tried with B's real document ids and with malformed ids. | same |
| Can a student claim another student's uploaded object? | **No.** An upload path is bound to its owner when it is minted; registering or replacing with a path minted for someone else is refused (403). | same |
| Is the file reachable by anyone else, or by a public URL? | **No.** The only read paths are the owner-checked routes. Cloud providers use per-object signed URLs (≤ 15 min); the local provider has no URL at all. Nothing is served statically. | `progress-reports.access-control.test.ts` ("storage stays private"); `localProvider.ts` |
| Does a shared plan disclose the APR? | **No.** `routes/progress-reports.ts` is the only module that touches the APR table; the sharing routes cannot read it, `apr` is not a valid share scope (silently dropped), and an advisor with a valid share gets an empty APR list of their own. | same; `qa-flows` spec F; `multi-account-security.spec.ts` |
| Is the storage path / owner id exposed to clients? | **No.** The DTO carries neither. | `documentDto`; structural guard |
| Are grades, units or academic periods sent to planning pages? | **No.** The sidebar endpoint drops those columns on the server by header name. If the header cannot be recognised it sends no rows at all rather than guess. | `sidebar-projection.test.ts`; `progress-reports.test.ts`; `qa-flows` spec B (checks the DOM and the payload) |
| Can workbook content run as script or markup? | **No.** Cell text is stored as plain text and rendered as a text node. Formulas are never evaluated (cached values only), macros never run, hyperlinks contribute text only. | `workbook-reader.test.ts` ("untrusted content"); `AprWorkbookTable.test.tsx` |
| Can a malformed or hostile file harm the server? | The bytes are checked before any library reads them (signature, zip directory, declared inflated size), and sheets/rows/columns/cells/text length are capped while reading. A rejected file is deleted and leaves no document. | `workbook-reader.test.ts`; `progress-reports.test.ts` ("file validation") |
| Could an uploaded file be rendered as HTML/script in our origin? | **No.** Downloads echo only PDF/XLSX types (anything else is forced to an `octet-stream` download), with `nosniff`, a sandbox CSP on downloads, and a fixed generic file name. | `private-file-response.ts`; `progress-reports.test.ts` |
| Can the cache leak a report on a shared machine? | **No.** Every APR response is `private, no-store`. | same |
| Does a failed replacement destroy the previous file? | **No.** The new file is validated and processed before the document is touched. | `progress-reports.test.ts` ("REPLACE with a bad file…") |
| Are APR contents in logs? | **No.** Routes log event names, error categories and document ids — never cell text, grades, file names or storage paths. A test captures everything logged during a full lifecycle and searches it. | `progress-reports.test.ts` ("what the server writes to its log"); structural guard |
| Are secrets in the client bundle or error responses? | **No.** Only `VITE_*` public keys reach the bundle; `STORAGE_SIGNING_SECRET`, `WORKDAY_AVAILABILITY_AUTH_TOKEN`, `CLERK_SECRET_KEY` are server-only. Startup errors name variables, never values. | `config.test.ts` |
| Is CORS open? | **No.** Production is an allowlist (`PUBLIC_APP_URL` + `CORS_ALLOWED_ORIGINS`). The bundled app is same-origin and needs none. | `config.test.ts` |

Other hardening added with the SCU-hosting work: baseline security headers
(`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS on
HTTPS), `x-powered-by` removed, configurable `trust proxy`, a redirect-refusing
availability client, and startup validation that refuses to run with a storage
directory the server cannot write.

**Not done / residual:** the stored *parse* (JSON in Postgres) still contains
per-course grades, because the APR page's optional grade toggle needs them;
they are exposed only to the owner over the `full` view. Encryption at rest is a
database/volume concern for the hosting environment (`docs/SCU_DEPLOYMENT.md`).
There is no malware scanning of uploads (PDF/XLSX are parsed, never executed).

## What CampusVal is not

- Not an official degree audit, registration system, or Workday
  replacement — Workday and the Registrar remain the authoritative
  sources, communicated in the Degree Plan guidance banner and footer.
- Does not register students for courses.
- Does not guarantee graduation, prerequisite eligibility, or course
  availability — course-offering warnings are evidence-graded
  (published / tentative / same-season benchmark / unknown), never a
  certification.

## Verifying this yourself

- Ownership/isolation: `routes/plans.test.ts`
- Advisor sharing: `routes/plan-shares.test.ts`
- Usage analytics: `routes/usage.test.ts`
- Role gating: `routes/role.test.ts`
- Auth allowlist: `middlewares/requireAuth.test.ts`
- Feedback/error reporting: `routes/feedback.test.ts`

## Degree Checksheets

Department documents a student uploads, and the student's own tracking on them,
follow the same rules as the APR: owner-only on every route, private storage
with no public URL, never disclosed by plan sharing, no content in logs, and no
file content rendered as markup. The full table of what was checked, with the
test that enforces each line, is in
[DEGREE_CHECKSHEETS.md](DEGREE_CHECKSHEETS.md#security).
