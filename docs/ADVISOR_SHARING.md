# Advisor Sharing

Student-controlled, read-only sharing of a Degree Plan (and optionally the
Tentative Degree Plan) with a specific advisor. This is **not** a campus-wide
directory — an advisor only ever sees a student who explicitly granted them
access, and access is enforced server-side on every request.

## Model

Table: `plan_shares` (`lib/db/src/schema/plan-shares.ts`)

| Column | Meaning |
|---|---|
| `studentUserId` | The sharing student's Clerk user id. |
| `advisorEmail` | Normalized (lowercase) email of the advisor being granted access. Matched against the advisor's own verified sign-in email — never client-supplied identity. |
| `scopes` | Subset of `degree_plan`, `tentative_degree_plan`, `apr`. Defaults to `["degree_plan"]`. `apr` is **never** included unless the client explicitly requests it. |
| `createdAt` / `revokedAt` | A share is active while `revokedAt` is null. Revoking sets the timestamp rather than deleting the row, so history is auditable. |
| `lastViewedAt` | Updated when the advisor successfully loads the shared plan — the minimal "advisor viewed shared plan" audit signal the product spec asked for. |

One row per `(studentUserId, advisorEmail)` pair — re-sharing with the same
advisor updates the existing row (including un-revoking it) instead of
creating a duplicate.

## API (`artifacts/api-server/src/routes/plan-shares.ts`)

Student-side (identity always taken from the verified session, never the
request body):

- `POST /api/plan-shares` — grant/update a share. Rejects self-sharing and
  malformed emails.
- `GET /api/plan-shares` — list the caller's own grants (who currently has
  access).
- `DELETE /api/plan-shares/:id` — revoke. 404s if the share doesn't belong
  to the caller.

Advisor-side (identity always the caller's own verified email):

- `GET /api/advisor/shared-students` — students who granted **this**
  advisor access. Never a directory of all students.
- `GET /api/advisor/shared-students/:studentUserId/plan?planType=tentative` —
  read-only plan data. Every request re-checks an active, correctly-scoped
  share; nothing is cached across requests.

## Security properties

- Every advisor-facing read re-verifies the share server-side — never a
  hidden button or route obscurity.
- APR access is opt-in per share, never bundled into a default
  "share my plan" call.
- Revoking is immediate: the very next advisor request 403s.
- Admin (`ADMIN_EMAILS`) status does **not** grant plan/APR access — the
  usage-analytics admin role and advisor sharing are unrelated permission
  systems.
- Reuses the plan's existing serialization (`itemDto`/`itemsOf` from
  `routes/plans.ts`) rather than a second, potentially-diverging read path.

Full permission matrix (grant/view/revoke/scope/cross-student isolation) is
covered by `artifacts/api-server/src/routes/plan-shares.test.ts` (14 tests)
against a real database.

## Frontend

- `AdvisorSharingPanel.tsx` (opened from the Degree Plan toolbar's **Share**
  button) — grant, list, revoke.
- `pages/shared-with-me.tsx` (advisor-facing, nav: Resources & feedback →
  "Shared with Me (Advisors)") — list of students who shared, and a
  read-only, category-colored plan view (no drag/drop, no edit controls).

## Known limitations (by design, this pass)

- No advisor-editing capability — read-only only, per the product spec's
  "Read-only first" requirement.
- No proactive advisor dashboard scanning assigned students — a future,
  separate institutional-permissions discussion, explicitly out of scope
  for this pass.
- Sharing is per-plan-type (Degree Plan / Tentative Degree Plan), not
  per-academic-year or per-term — start conservative, narrow later if
  needed.
