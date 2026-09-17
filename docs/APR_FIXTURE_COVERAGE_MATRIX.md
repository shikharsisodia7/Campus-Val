# APR parser fixture coverage matrix

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

## Known gap, honestly stated

CampusVal does not yet have an interactive "map this unrecognized item to a
real course" UI — unrecognized/`possibleCourses` items are surfaced
read-only today (`ReportCard.tsx`'s "Needs your review" section). The
professor described this as an optional addition ("implement... only if it
fits the existing APR architecture"); it has not been built in this pass.
Any future implementation must store a correction as a separate
"Student mapping" / "Needs verification" annotation, never mutate the
uploaded file, and never be presented as Workday truth.
