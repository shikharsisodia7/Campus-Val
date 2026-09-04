# CampusVal — Controlled Testing Rollout

CampusVal is rolling out to a small, trusted cohort — not a general SCU
release. This document describes what that cohort actually sees, how
access is controlled, and what "done" looks like for this phase.

## Who gets in

Two populations, enforced server-side in
`artifacts/api-server/src/middlewares/requireAuth.ts`:

- **`@scu.edu` accounts** — any current SCU student/faculty/staff Clerk
  account.
- **Invited external reviewers** — email addresses listed in the
  `GUEST_REVIEWER_EMAILS` environment variable (comma-separated, matched
  case/whitespace-insensitively). See
  [docs/EXTERNAL_REVIEWERS.md](EXTERNAL_REVIEWERS.md) for the runbook to
  add or remove one. No reviewer email is ever hardcoded in source —
  the env var is the single place they live.

Everyone else is denied with a generic message that doesn't reveal who is
or isn't on the allowlist.

## What the cohort sees: reduced nav, not reduced product

Deleting an unfinished feature is worse than hiding it — you lose the work
and can't come back to it later. Instead, `AppShell.tsx` exposes exactly
four items in the primary nav for everyone: **Dashboard, Degree Plan,
Quarter Plan, Tentative Degree Plan**. Every other feature (Excel export,
advisor sharing, catalog browsing, admin analytics, etc.) still exists and
still works — it collapses into a de-emphasized **"More tools"** disclosure
one click away, rather than disappearing.

Admin accounts (`ADMIN_EMAILS` env allowlist, checked server-side in
`lib/admin.ts`) always see the full nav under **"Additional Features"**
instead of the reduced set — there's no separate "tester cohort" concept
to manage beyond admin vs. everyone else. The signal driving this is a
single `GET /api/me/role` call (`isAdmin: boolean`), consumed by the
`useIsAdmin()` hook, which **defaults to the reduced/non-admin view** on a
slow request or any error — a failure mode never accidentally over-exposes
a feature.

This is a role/allowlist model, not dozens of hardcoded per-person checks:
adding a trusted tester who needs the full nav means adding their email to
`ADMIN_EMAILS`; adding a reviewer who should get the reduced/core
experience means adding them to `GUEST_REVIEWER_EMAILS` only.

## Suggested initial cohort

Per the product spec that drove this phase: Thom Hines (external reviewer,
`thines@pdx.edu` — set via `GUEST_REVIEWER_EMAILS`, never hardcoded),
selected forward-thinking faculty, the peer advising team, and a small
number of selected students/advisors. Do not open broad, unannounced
`@scu.edu`-wide access during this phase — every `@scu.edu` account is
technically allowed in by the auth check, but the intent of this phase is
a small, informed cohort who know they're testing a prototype, not a
public launch.

## What "controlled testing ready" means here

- **Core workflows are stable enough to demo without caveats**: Degree
  Plan, Quarter Plan (Fall/Winter/Spring), APR upload/comparison,
  Tentative Degree Plan, advisor sharing. See the root `README.md` test/
  build commands and `docs/SECURITY_AND_PRIVACY.md` for how these are
  verified.
- **Nothing shown to testers claims more certainty than the underlying
  data supports** — course-offering warnings, the program-catalog status
  tiers (`prescribed`/`recommended`/`example`), and the top-of-Degree-Plan
  guidance banner all exist specifically so testers understand what
  CampusVal does and doesn't guarantee. See
  [docs/DATA_PROVENANCE.md](DATA_PROVENANCE.md).
- **Feedback loop**: this is a prototype under active development, not a
  finished product. Suggested questions for testers (from the product
  spec): Can you tell what Degree Plan is for? Can you find the official
  verification links? Do the offering warnings make sense? Can you build a
  Winter/Spring schedule? Do you know what CampusVal does *not* guarantee?
  Is the Workday APR comparison useful? Is anything overwhelming? What
  would you hide? What would you need as an advisor?

## Explicitly out of scope for this phase

- **Graduate-student planning** — a later phase, not started. Every major/
  minor/concentration represented is undergraduate-only.
- **General/public `@scu.edu` rollout** — the auth check technically
  allows any `@scu.edu` account, but this phase is scoped to the cohort
  above; a wider announcement is a separate, later decision.
- **Institution-wide advisor dashboards / proactive monitoring** — advisor
  access is intentionally limited to plans a student has explicitly
  shared with them (see [docs/ADVISOR_SHARING.md](ADVISOR_SHARING.md)).
