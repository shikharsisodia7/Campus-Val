# APR sidebar and reconciliation (2026-09 professor-feedback pass)

## What changed

The professor's correction: the right-hand APR column in Degree Plan and
Quarter Plan should be a **simple, read-only completion benchmark** —
"look left/center at CampusVal planning, look right at what Workday says
you must complete" — not a grade report, and not a place that silently
assumes CampusVal's plan and Workday's record agree.

## One shared component, two call sites

`WorkdayAprPanel` (`artifacts/scu-advising/src/components/progress-report/WorkdayAprPanel.tsx`)
is the only APR sidebar renderer. It is used identically in:

- Degree Plan / Tentative Degree Plan, via `ContextPanel.tsx`
- Quarter Plan, via `pages/planner.tsx`

There is no second, divergent renderer — this was already true before this
pass (see `planner.apr-shared.test.tsx`) and stayed true.

## Grouped completed/remaining, no grades

`RequirementGroupList` renders the parsed APR's own group hierarchy — group
names come from the document itself (e.g. "Finance Major Requirements",
"University Core Requirements"), never a hardcoded Core/Major/Minor
taxonomy, so double majors, minors, and any other group the student's real
APR contains all render correctly and independently. Each requirement shows
a real status (`Completed` / `In Progress` / `Remaining` / `Verify in
Workday`), a completed/total count per group, and is expandable/collapsible.

`RequirementGroupList` now takes a `showGrades` prop (default `true`):

- **Sidebar usage** (`WorkdayAprPanel`) passes `showGrades={false}` — no
  per-course grade or "(in progress)" marker clutters the completion
  benchmark.
- **Full detail page** (`ReportCard.tsx`, `/progress-report`) keeps the
  default `true` — grades remain available there, per the professor's own
  instruction that they may stay in the private detail view.

## Reconciliation warning — comparison only, never a silent merge

`lib/apr-major-reconciliation.ts` (`reconcileMajor`) compares the APR's
extracted `program` text against the student's current CampusVal planning
major, and returns `"match"` / `"mismatch"` / `"unknown"`. It is
deliberately conservative — long or noisy APR program lines, or very short
fragments, return `"unknown"` rather than guessing a mismatch that could
wrongly alarm a student. `WorkdayAprPanel` shows a neutral warning banner
only on `"mismatch"`:

> Your CampusVal planning requirements differ from the uploaded Workday
> APR. Workday is the university-record reference — review your CampusVal
> planning major/catalog year and verify with your advisor. CampusVal will
> not change your plan for you.

This is comparison-only: nothing in this pass writes to the profile, the
plan, or the APR as a result of a mismatch. `ContextPanel.tsx` only passes a
`planningMajorTitle` when the active plan is the real Degree Plan
(`planType === "degree"`) — a Tentative Degree Plan's whole purpose is
exploring a possibly-different major, so that intentional divergence is
never flagged. Quarter Plan compares against the student's declared
`profile.major` (it has no single "active plan" concept the way Degree Plan
does).

## What was already correct and untouched

- The parser (`progress-report-parser.ts`) already never fabricates: unknown
  codes get `inCatalog: false` with raw extracted text; status is only ever
  `"completed"` on an affirmative signal, otherwise `"needs_review"`.
- APR upload/parse never writes to `academicPlansTable`/`planItemsTable` —
  the Degree Plan is never overwritten by an APR upload.
- APR storage and retrieval are owner-scoped; advisor sharing never includes
  APR content (`plan-shares.ts` — "apr" is not a valid share scope).
- Usage analytics logs only the feature name (`apr_upload`), never file
  content.

See `docs/APR_FIXTURE_COVERAGE_MATRIX.md` for the parser test coverage this
pass added, and `docs/WORKDAY_INTEGRATION.md` for why there is no automated
Workday feed behind any of this — the APR is always the student's own
uploaded file.
