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

## 2026-09-19 pass — the APR as a verifiable text copy, beside the plan

The professor's follow-up: the APR should be **readily visible while planning**
(Degree Plan, Tentative Degree Plan, Quarter Plan), presented as a conservative,
structured *copy of what Workday says* the student can check against the
original — not an opaque CampusVal verdict — and never with grades by default.

### What the student sees (`AprStructuredView`, one component for the sidebar AND the APR page)

1. A four-number tally — **Completed · In progress · Remaining · Verify in Workday** —
   and an **All / Still needed** toggle (the "what do I still need?" view).
2. Requirements in planning order: **University Core → Major → Minor → Other
   requirements**, each group under Workday's *own* heading (the kind is only used to
   order them; names are never rewritten). The sidebar opens only groups that still
   have something outstanding.
3. **Other university requirements** — the GPA/etc. rows Workday repeats under every
   program, shown once.
4. **Units** — the total-units and upper-division-units rows *when the report states
   them*, in Workday's words ("Workday requires 180", "Workday shows: Minimum 40.0
   Unit(s)" — the trailing text is quoted, not interpreted). If the report prints
   none, the panel says so instead of inventing a figure.
5. **Courses listed on your report** — completed and in-progress, code + title only.
6. **N items to verify in Workday** — anything the parser could not classify, and
   course-like tokens not in the catalog. These are *not* treated as completed or
   remaining. The APR page also shows the line as Workday printed it.

Status is always an icon **and** a text label; color only reinforces it.
Grades: absent from the sidebar, absent by default on the APR page (explicit "Show
grades" toggle). See `SECURITY_AND_PRIVACY.md` for why the sidebar cannot receive them.

### Data model (parser `hierarchical-v3`)

Additive and backward compatible; every new field is optional.

| Field | Meaning |
| --- | --- |
| `groups[].kind` | `core \| major \| minor \| other`, from the heading (display order only) |
| `groups[].order`, `requirements[].order` | Position in the source document |
| `requirements[].scope` | `university` (repeated under every program) or `program` |
| `requirements[].unit`, `requiredUnits`, `detail` | Only when the row itself states a units requirement |
| `requirements[].sourceText` | The source line (full view only; stripped from the planning view) |
| `summary.totalUnits` / `upperDivisionUnits` / `creditsEarned` | Lifted from those rows / an exact "Cumulative Credits Earned" label; **absent when the report does not print them** |

**Existing uploads need no migration script.** A record stored by an older parser
version is reparsed from its still-stored original file on the next read
(`reparseIfStale`), transparently and best-effort; if the original is gone the old
parse is served as-is and the UI degrades gracefully (all new fields optional). This
is tested with a real upload, a doctored legacy row, and a deleted original.

### States (every one renders something useful — never blank)

None uploaded · loading · uploads not configured · processing (`pending`) · failed ·
unsupported format · read but nothing recognizable · ready · ready **with items to
verify** · ready but **the original file is no longer readable** (server-checked with
`?checkSource=true`) · load error (retry + link to the APR page) · unauthorized viewer.
Replace is confirmed before it discards the old report, and the page shows the upload
phases ("Preparing… Uploading… Processing…").

### Where it lives

- Desktop (`xl` and up): a permanent right-hand column on all three planning pages.
- Below `xl`: one shared drawer, `AprReferenceSheet` (Radix dialog: labelled trigger,
  focus trap, Escape closes, focus returns to the trigger, scrolls inside the drawer so
  the plan behind it is untouched). Degree Plan, Tentative Degree Plan and Quarter Plan
  all use this same component and the same `WorkdayAprPanel`.
- Both the panel and the page derive their state from `deriveAprState`
  (`apr-model.ts`), so they cannot disagree about what "processed" means.

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
