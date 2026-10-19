# CampusVal — Controlled Testing Rollout

CampusVal is preparing for a small, invited pilot — not a general SCU
release, and not yet started: SCU hosting and security review come first
(see [PILOT_STATUS.md](PILOT_STATUS.md)). This document describes what the
cohort will see, how access is controlled, and what "done" looks like for
this phase.

## Who gets in

Pilot mode (`CAMPUSVAL_ACCESS_MODE=pilot`, the default) admits only named
people, enforced server-side by `requireUser` (`artifacts/api-server/src/lib/auth/policy.ts`):

- **Invited pilot testers** — `PILOT_TESTER_EMAILS` (comma-separated, matched
  case/whitespace-insensitively).
- **Invited external reviewers** — `GUEST_REVIEWER_EMAILS`. See
  [docs/EXTERNAL_REVIEWERS.md](EXTERNAL_REVIEWERS.md) for the runbook.
- **Administrators** — `ADMIN_EMAILS` — and **department administrators**
  holding a program scope.

An `@scu.edu` address alone is **not** enough during the pilot. No email is
ever hardcoded in source — the environment variables are the only place
they live. Everyone else who signs in sees "CampusVal is currently available
only to invited pilot participants while SCU reviews hosting, security, and
rollout." and every data API answers `403 pilot_access_required`; the
message does not reveal who is on any list.

## What the cohort sees: a pilot-focused nav, not a reduced product

Deleting an unfinished or risky feature is worse than hiding it — you lose
the work and can't come back to it later. Instead, every feature's pilot
visibility is defined in one place —
[`artifacts/scu-advising/src/lib/pilot-features.ts`](../artifacts/scu-advising/src/lib/pilot-features.ts)
— as `CORE`, `PILOT_VISIBLE`, or `PILOT_HIDDEN`. Desktop nav, mobile nav,
the Dashboard's Quick Actions, and route gating in `App.tsx` all read from
this single registry, so what a menu shows and what a direct URL renders
can never drift apart. See
[docs/PILOT_FEATURE_MATRIX.md](PILOT_FEATURE_MATRIX.md) for the full list,
the professor's rationale for each status, and re-enable criteria.

- **`CORE`** — always prominent, in the primary nav, for every signed-in
  user: **Dashboard, Degree Plan, Quarter Plan, Tentative Degree Plan**.
  Degree Plan is the central planning workflow.
- **`PILOT_VISIBLE`** — a conservative set of lower-risk utilities shown to
  every pilot user under **"Additional Features"** (next to the header's
  **"Report Error / Suggest Changes"** control): Course Catalog, Core
  Curriculum, GPA Calculator, Transfer Credit, the Workday Academic
  Progress Report (APR) upload, SCU Resources, and Shared with Me
  (Advisors).
- **`PILOT_HIDDEN`** — features the professor asked to keep out of this
  review because incorrect output could affect academic decisions, or
  because they'd distract from the three key workflows: Professors,
  Compare Courses, Graduation Paths, Advice Board, Planning Support, Voice
  Planning Support, SCU Policies, AI Evaluation, Sync Workday Sections, and
  the legacy Feedback page (superseded by "Report Error / Suggest
  Changes"). Nothing is deleted — the code, data, and routes still exist.

Admin accounts (`ADMIN_EMAILS` env allowlist, checked server-side in
`lib/admin.ts`) see `PILOT_HIDDEN` items too, in both nav and by direct
URL — in a clearly separated "Hidden during pilot" group — so nothing
requires a code change to inspect during development. The signal driving
this is a single `GET /api/me/role` call (`isAdmin: boolean`), consumed by
the `useIsAdmin()` / `useAdminStatus()` hooks, which **default to the
non-admin pilot view** on a slow request or any error — a failure mode
never accidentally over-exposes a feature. A non-admin who navigates
directly to a `PILOT_HIDDEN` route (e.g. typing `/advice` in the address
bar) is redirected to Dashboard with a concise toast rather than the
feature silently rendering — see `PilotGate` in `App.tsx`. This is a UI
contract only; the underlying API routes keep their own server-side
authorization regardless of pilot status.

This is a role/allowlist model, not dozens of hardcoded per-person checks:
adding a trusted tester who needs the full nav means adding their email to
`ADMIN_EMAILS`; adding a reviewer who should get the pilot experience means
adding them to `GUEST_REVIEWER_EMAILS` only.

## What to focus on during this pilot review

The professor's two review videos asked for feedback centered on a small
number of things — please prioritize these over exploring hidden or
secondary features:

1. **Degree Plan** — the central planning workflow. Does "Set or Change
   Primary Major" behave the way you'd expect? Is it clear that changing
   your planning major here does **not** formally declare a new major at
   SCU?
2. **Quarter Plan** — turning your degree plan into an actual Fall/Winter/
   Spring schedule.
3. **Tentative Degree Plan** — workshopping another major or scenario
   without touching your main plan, and how/when a scenario gets promoted.
4. **APR comparison** — upload your Workday Academic Progress Report
   (Dashboard → Progress Report, or the read-only panel next to Degree
   Plan) and compare it against what CampusVal shows. Does anything
   disagree with Workday?
5. **Official-source verification** — for anything CampusVal shows (Core
   Curriculum, Transfer Credit, SCU Resources), can you tell where the
   information comes from and how current it is? Does anything read as
   more authoritative than it should?
6. **Report Error / Suggest Changes** — the one feedback mechanism for
   this pilot, in the header next to "Additional Features". Use it for
   anything that looks wrong, outdated, or missing — see
   [docs/FEEDBACK_AND_ERROR_REPORTING.md](FEEDBACK_AND_ERROR_REPORTING.md).

## Suggested initial cohort

Decided by the professor, not by the engineering team: an invited external
reviewer (set via `GUEST_REVIEWER_EMAILS`, never in source), selected
faculty, the peer advising team, and a small number of selected
students/advisors (`PILOT_TESTER_EMAILS`). Broad `@scu.edu` access is
switched off in code during this phase (pilot mode), so a wider rollout
cannot happen by accident: it needs SCU approval and a deliberate change
to `CAMPUSVAL_ACCESS_MODE=institution`.

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
  would you hide? What would you need as an advisor? Use
  **"Report Error / Suggest Changes"** in the header when: information
  looks incorrect, a feature fails, a requirement seems outdated, or there
  is a suggested improvement — see
  [docs/FEEDBACK_AND_ERROR_REPORTING.md](FEEDBACK_AND_ERROR_REPORTING.md).
  Do not include student records or APR contents in a report.

## Explicitly out of scope for this phase

- **Graduate-student planning** — a later phase, not started. Every major/
  minor/concentration represented is undergraduate-only.
- **General/public `@scu.edu` rollout** — refused by the server in pilot
  mode; a wider rollout is a separate, later decision that needs SCU
  approval.
- **Institution-wide advisor dashboards / proactive monitoring** — advisor
  access is intentionally limited to plans a student has explicitly
  shared with them (see [docs/ADVISOR_SHARING.md](ADVISOR_SHARING.md)).
