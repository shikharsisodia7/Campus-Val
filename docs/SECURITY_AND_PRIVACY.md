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
  (`routes/progress-report.ts`) are gated the same way, plus a path-level
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
