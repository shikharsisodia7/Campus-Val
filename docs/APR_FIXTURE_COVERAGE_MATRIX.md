# APR parser fixture coverage matrix

> **Superseded (2026-09-26).** This document describes the earlier design, in which
> CampusVal parsed the Academic Progress Report and interpreted it (matched courses,
> requirement statuses, tallies, a major-mismatch warning, student course mappings).
> That design was retired at the professor's direction: the Workday APR is now shown
> as exported and is not re-evaluated. The code this document refers to has been
> removed. See [APR_SOURCE_FIDELITY.md](APR_SOURCE_FIDELITY.md). Kept for history only.

Professor feedback (2026-09 pass): the APR parser needs synthetic/redacted
fixtures exercising a real spread of Workday shapes, not just one golden
sample. This is the matrix of every case exercised, split across the two
parser test files.

All fixtures are synthetic or anonymized — none contain real student data
(see `docs/SECURITY_AND_PRIVACY.md`).

| Case | Covered by | Format |
| --- | --- | --- |
| Primary major only | `progress-report-parser.fixture.test.ts` (golden text, hierarchical) | PDF-equivalent text, PDF |
| Primary major + minor | `workday-apr-hierarchical.txt` / `.pdf` (CSE major + Math minor) | text, PDF |
| Double major, no minor | `progress-report-parser.coverage-matrix.test.ts` (Finance + Economics) | text |
| Major + a separate University Core requirement group | `progress-report-parser.coverage-matrix.test.ts` | text |
| Completed courses (grade present) | all fixtures | text, PDF, XLSX |
| In-progress courses (no grade yet) | `workday-apr-hierarchical.*`, `workday-apr-anonymized.*`, coverage-matrix (double major) | text, PDF, XLSX |
| Remaining / "Not Satisfied" / "Not Started" requirements | `workday-apr-hierarchical.*`, coverage-matrix | text, PDF |
| Requirement-choice pools (e.g. "Minimum 1 Course(s)") | `workday-apr-hierarchical.*`, coverage-matrix | text |
| Transfer/AP/IB credit recognition | `workday-apr-anonymized.txt` / `.xlsx` (`XFER` codes, transfer-credit section header) | text, XLSX |
| Older / renamed program name (catalog-year-agnostic) | `progress-report-parser.coverage-matrix.test.ts` ("Computer Engineering" legacy name) | text |
| Malformed / unrecognized rows mixed into a well-formed document | `progress-report-parser.coverage-matrix.test.ts` (`ZXQW 999`, garbage line) | text |
| Fully malformed/corrupt file | `progress-report-parser.fixture.test.ts` (corrupt PDF/xlsx buffers) | PDF, XLSX |
| Unsupported file type | `progress-report-parser.fixture.test.ts` (`.docx`) | other |
| XLSX with a layout different from the flowing-text PDF shape | `progress-report-parser.coverage-matrix.test.ts` (column-per-field spreadsheet) | XLSX |
| Space-collapsed PDF text extraction (no space between subject/number) | `workday-apr-spacecollapsed.txt` | text |
| Multi-page PDF | `progress-report-parser.fixture.test.ts` (`multiPagePdf` helper) | PDF |
| Real `unpdf`-extracted PDF (not just hand-typed text) | `workday-apr-hierarchical.pdf` | PDF |
| No student ID confidently present | `progress-report-parser.fixture.test.ts` | text |
| No `<Program> Requirements` heading at all (flat fallback) | `progress-report-parser.fixture.test.ts`, coverage-matrix | text, XLSX |
| No console/log leakage of file content during parsing | `progress-report-parser.fixture.test.ts` (logging-guard suite) | PDF, XLSX, text |

## What every case proves, structurally

- **Never fabricates.** Every `completedCourses`/group-nested course entry
  with `inCatalog: true` has its title/units pulled from the real course
  catalog, never from the document text; an unrecognized code gets
  `inCatalog: false` and keeps the raw extracted text verbatim.
- **Never guesses a status.** `classifyAcademicRecordCompletion` (the single
  central rule) only returns `"completed"` on an affirmative grade or
  section signal; anything ambiguous is `"needs_review"`, never silently
  treated as completed.
- **Group names are the document's own**, never CampusVal's canonical
  major/minor titles — see the "legacy/renamed program name" case, which
  specifically proves the parser doesn't overlay today's Bulletin naming
  onto an older document.
- **A malformed row degrades gracefully.** A course-code-shaped-but-unknown
  row becomes a `needs_review`/`inCatalog: false` entry; a row with no
  code-like structure at all is silently skipped without throwing or
  fabricating a requirement.

## Real Workday table layout (parser v4)

`progress-report-parser.workday-table.test.ts` runs the whole text-to-report pipeline
over `__fixtures__/progress-report/workday-apr-table-layout.txt` — a **synthetic** APR
(invented student, terms and grades) that reproduces the layout of a real Workday PDF:

| Layout feature | Asserted |
| --- | --- |
| Page furniture and "Page N of M" glued to the next cell | stripped; page breaks mid-block do not split rows |
| Status word on the same line as the name and first course | row name, status and course all read |
| "(In / Progress)" split across two lines | `inProgress`, clean title, no grade |
| Title beginning on the next line (`ENVS 131 -`) | course read whole |
| Remaining cell in all four shapes (Course(s), Unit(s), GPA, Combination Required, Activities) | verbatim, never swallows the next row |
| Transfer-credit rows (no period) | `transfer`, never a "possible course" |
| University Core rows repeated by blocks in the same school | present per block; shown once by `regroupForDisplay` (frontend test) |
| A second school's Core (`Core: CAS: …` beside `Core: LSB: …`) | kept as its own group, never merged (frontend test) |
| Header `(… Major/… Minor/…)` | `declaredMajors` / `declaredMinors`; a declared minor with no block still listed |
| "a minimum 60 Upper Division Units" / "175 units. Limit of 20 units 198/199" | `unit`, `requiredUnits`, `remaining` |
| Simple (non-table) reports | unchanged: still on the line-based reader |

The parser was also run, locally and once, against a real student's APR while it was
being written; nothing from that file is committed.

## Student mappings (the professor's optional "map this unrecognized item")

Built: on the APR page each item the parser could not match to the catalog has a
**Match to a catalog course** control (catalog search → pick one). See
`APR_SIDEBAR_AND_RECONCILIATION.md` § "Student mappings" for behavior and
`SECURITY_AND_PRIVACY.md` for the access rules. The constraints the professor set
are enforced, not just documented:

| Constraint | Where it is enforced / tested |
| --- | --- |
| Stored as a separate annotation, never in the uploaded file or its parse | own table `progress_report_mappings`; `progress-report.mappings.test.ts` asserts the stored report and its `updatedAt` are byte-identical after a mapping |
| Never presented as Workday truth | every place it appears says "matched by you" / "your note, not Workday's"; `UnmatchedCourseMapper.test.tsx` |
| Never changes what counts as completed | mapped items stay in `possibleCourses`; completed count and the completed list are asserted unchanged (server and UI) |
| Only maps what the report actually lists as unmatched, onto a real catalog course | 400 otherwise (recognized course, code not on the report, non-catalog target, oversize/missing target) |
| Owner-scoped, never shared | `requireAuth` + `req.userId` only; a second student's identical code is a separate row; not a share scope |
| Deleted with the report | `DELETE /progress-report` removes the student's mappings; a re-upload keeps them |

Still not done, on purpose: a mapping is **not** propagated into the Degree Plan
or the completed-course list. Turning a student's guess into plan state is a
different feature with different risks; this one is an honest annotation only.
