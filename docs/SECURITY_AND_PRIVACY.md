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
subset of their planning data; every advisor-facing read re-checks an
active, correctly-scoped grant server-side on every request; APR access is
never bundled in automatically; revocation is immediate. Covered by 14
tests against a real database (`routes/plan-shares.test.ts`).

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
