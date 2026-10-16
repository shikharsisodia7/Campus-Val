# Degree Completion Assessment

_2026-10-09. Professor feedback: "derive an editable planning assessment from APR information without altering the APR."_

**Degree Completion Assessment** is CampusVal's editable, clearly non-authoritative interpretation of what may remain before a
student completes a degree, generated from the APRs the student uploaded. It is private R&D work, not a normal pilot feature. It is a planning aid. It is not Workday, not an
official degree audit and not a graduation certification. **Workday is the definitive reference for degree completion.**

Every place it appears says so in one line:

> CampusVal's Degree Completion Assessment is a planning aid generated from your uploaded APR. Verify all requirements against
> Workday. Workday is the definitive reference for degree completion.

## The model

```
APR (the student's upload)              read-only, the Workday reference; never written by the assessment
  -> compact projection                 lib/apr/sidebar-projection.ts: grade, period and unit columns left out
  -> rule engine                        lib/degree-completion/engine.ts: one item per APR requirement row
       = automatic result               recomputed on every request, never stored
  + student corrections                 degree_completion_overrides: remaining / complete for planning / note / hide
  = what the student sees               both values, side by side; "Reset to APR-based assessment" deletes the correction
```

One model, one endpoint (`GET /api/progress-reports/assessment`), one component (`DegreeCompletionAssessment`), shown only in the protected experimental workspace:

| Page | Where | Form |
| --- | --- | --- |
| APR + Degree Completion Assessment — Experimental | `/experimental/apr-assessment`, behind an admin allowlist and explicit R&D flag | full section beside the source APR |

It is intentionally absent from normal Academic Progress Reports, Degree Planning (including Tentative Degree Plans), Quarter Planning, navigation, the dashboard, landing page, and standard Additional Features.

Several APRs are tabs ("Biology · Primary Major", "Chemistry · Minor"), one assessment per APR and per program block inside it.
They are never merged.

## The rules (deterministic, no LLM)

Only Workday's explicit words decide. Rule version `2026-10-09.1`.

| Workday row | Internal state | Student sees | Reason code |
| --- | --- | --- | --- |
| Status **Not Satisfied** | `CLEAR_REMAINING` | **Remaining** (with Workday's Remaining words, verbatim) | `apr_not_satisfied` |
| Status **Satisfied** | `LIKELY_COMPLETE` | **Appears complete** | `apr_satisfied` |
| **In Progress**, nothing stated as remaining, a registration still "(In Progress)" | `AMBIGUOUS` | **Needs review** (complete only once graded) | `in_progress_pending_grade` |
| **In Progress** with a stated remaining amount ("Minimum 2 Course(s)") | `AMBIGUOUS` | **Needs review** | `in_progress_with_remaining` |
| **In Progress** with "Minimum Combination Required" | `AMBIGUOUS` | **Needs review** | `in_progress_combination` |
| **In Progress** with no remaining amount and no registration | `AMBIGUOUS` | **Needs review** | `in_progress_no_detail` |
| Any other status word | `AMBIGUOUS` | **Needs review** | `unknown_status` |
| No status but other content | `AMBIGUOUS` | **Needs review** | `missing_status` |
| A label with nothing beside or under it | — | a heading, not an item | — |
| Student correction applied | `USER_CORRECTED` | **Remaining** or **Complete for planning**, marked **Adjusted** | — |

`In Progress` is never treated as complete. A requirement that needs several courses can show In Progress with one course
registered and more still owed, and a single in-progress course is not complete until it is graded.

### Registrar-dependent subrule (off)

Whether Workday's Remaining amount on an In Progress row already counts the in-progress registrations is not documented. Until
the Registrar confirms it, such rows are Needs Review. `DEGREE_COMPLETION_IN_PROGRESS_REMAINING_IS_ADDITIONAL=true` turns
them into Remaining (`in_progress_remaining_stated`). Do not switch it on without the Registrar's answer.

### Multi-course requirements

For every item the engine keeps: Workday's Remaining words and their kind and number (courses / units / GPA / combination /
activities), every registration listed under the requirement, and whether each is "(In Progress)". It does not compute "N left"
itself when Workday does not say: the student sees Workday's own words.

## Traceability and the inspector

Every item carries `trace`: sheet name and index, source row (Excel row = row + 1), program block, the rule applied, the rule
version and the row fingerprint. Administrators see it under **Source inspector** on each item (`useIsAdmin`). Students do
not see internal ids.

To proofread a real APR without uploading it anywhere, run the engine in a test or a local script against
`assessWorkbook(await readAprWorkbook(buffer))`. Never commit a real APR.

## Student corrections

Mark as remaining, mark complete for planning, add a note, hide from the assessment, reset to the APR-based assessment. A
correction never changes the APR (tested: the workbook and its `updated_at` are byte-identical afterwards).

Stored in `degree_completion_overrides` (migration `0008`): user, APR document id (`ON DELETE CASCADE`), item key, source
fingerprint, the requirement's wording, status override, hidden, note. Only corrections are stored; the automatic result is
always derived.

### When the APR is replaced

Replacing the file keeps the document id, so the assessment is recomputed and each correction looks for its row by the row's
stable key (program block + requirement text + occurrence):

- row found, unchanged: the correction applies;
- row found, changed (status, remaining or registrations): the correction is kept but **not applied**; the student sees the
  APR-based result and "Keep my correction" / "Use the APR-based result";
- row gone: listed as "corrections whose requirement is no longer in this APR", with Remove.

## Privacy

The assessment is derived from a private APR and is exactly as private:

- every route is under `requireAuth`, the user is `req.userId` (never a client value), and a document id is accepted only for
  a document that user owns (someone else's is 404, the same as a missing one);
- `routes/plan-shares.ts` never reads it: an advisor with a valid plan share sees no assessment (tested);
- corrections are read and written only in `lib/degree-completion/service.ts`, every query scoped to the owner (a structural
  test fails if another module touches the table);
- logs carry counts only, never requirement text.

## Tentative Degree Plans

The APR describes the programs declared in Workday. A Tentative Degree Plan can describe programs that no APR covers, so on a
Tentative Degree Plan the assessment says it does not assess that plan's programs. Tentative planning itself keeps using the
generic Bulletin-based requirements.

## Pilot access switch

`ENABLE_DEGREE_COMPLETION_RND=true` is required **and** the signed-in email must be in `ADMIN_EMAILS`. The switch is off by default. If either check fails, the experimental route is gated in the client and all assessment API endpoints return a non-disclosing `404`; ordinary pilot users cannot discover or operate it by URL. The normal APR route remains source-focused and stable.

The engine still uses conservative rules: it states only what Workday states, treats ambiguity as Needs Review, and keeps every correction/private APR owner-scoped. Registrar terminology remains an external decision before any pilot exposure can be considered.

## Tests

- `lib/degree-completion/engine.test.ts`: explicit Not Satisfied, single-course In Progress, multi-course In Progress (and the
  subrule), minimum combination, partially and fully complete groups, unknown and missing status, unreadable sheet, no grades
  read, traceability, stable keys across exports, the multi-block synthetic Workday export.
- `routes/degree-completion.test.ts`: per-APR results, correction and reset, complete for planning / note / hide, invalid input,
  the APR untouched, replacement (kept / flagged / orphaned), cascade delete, normal-pilot denial, and the R&D switch.
- `routes/progress-reports.access-control.test.ts`: user B cannot read, correct or reset user A's; an advisor with a share sees
  none; structural guards.
- `components/progress-report/DegreeCompletionAssessment.test.tsx`: textual statuses, disclaimer, basis, tabs, Tentative note,
  Adjusted beside the automatic result, inspector for admins only, the switch, changed-row actions.
