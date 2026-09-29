# Academic Progress Reports — Workday is the definitive reference

_2026-09-26 pass. Supersedes `APR_SIDEBAR_AND_RECONCILIATION.md` and
`APR_FIXTURE_COVERAGE_MATRIX.md`, which describe the earlier design in which
CampusVal parsed and interpreted the report._

## Design principle

**Workday is the definitive reference for degree completion. CampusVal displays
the Academic Progress Report a student exported from it, for comparison; it
does not independently certify academic requirements.**

_Wording, 2026-09-28._ The professor asked that the app not call the APR the
"single source of truth": an uploaded APR is a copy from the day it was
exported, and only Workday itself is current. The APR page now reads "Workday
is the definitive reference for degree completion — CampusVal displays each
report as of the date you uploaded it and does not re-evaluate it." Nothing
about how the APR works changed.

CampusVal is a planning workspace that sits _beside_ the official record. A
student (or an advisor sitting with the student) looks at the Workday APR on the
right and the CampusVal plan on the left and decides what to do. CampusVal does
not decide for them.

So CampusVal does **not**:

- match APR courses to CampusVal requirements or catalog courses;
- decide whether a requirement is complete;
- summarise, rename, merge or reword anything Workday wrote;
- recalculate units or GPA, or alter a grade;
- mark courses on the Degree Plan from the APR;
- flag a "mismatch" between the APR and the plan.

The status shown next to a requirement ("Satisfied", "Not Satisfied",
"In Progress") is Workday's own cell text.

## How it works

```
Student exports the report from Workday to Excel (.xlsx)
        │  manual — CampusVal has no connection to Workday
        ▼
Upload  ──►  validate bytes  ──►  copy the workbook's STRUCTURE  ──►  store
             (type, size,         (sheets, rows, cells, merges,       original file (private)
              zip sanity)          bold / indent / fill)              + structural copy (jsonb)
        │
        ├──►  FULL APR page      every sheet, row and column, as exported
        └──►  PLANNING SIDEBAR   same rows, grouped; three columns left out
```

There is no real-time or scheduled synchronisation with Workday. An APR is as
current as the day the student exported it, which is why every APR shows its
upload date.

## Input format

| Format | Support |
| --- | --- |
| `.xlsx` (Workday Excel export) | Full APR and sidebar, read from the spreadsheet's cells. |
| `.pdf` (Workday PDF export) | The original PDF is shown embedded on the APR page. Its table is read for the sidebar (see below). A PDF whose table cannot be read is still kept as an original. |
| `.xls`, `.xlsm`, `.csv`, anything else | Rejected with a message explaining which exports work. |

### Reading the table out of a PDF

`lib/apr/pdf-table-reader.ts`. A PDF has no cells, only pieces of text at
positions. Workday typesets the report as a strict table, so the table is
recovered from **where the text sits**, without reading what it says:

| | How it is found |
| --- | --- |
| Columns | Every cell is left-aligned, so all text in a column starts at the same x. The seven header labels say which x is which. |
| Rows | Wrapped lines inside a cell are one line-height apart; between two rows there is cell padding too. A larger step starts a new row. |
| Blocks | Text that does not start at a column's x is not in the table: it is a program title or a summary line. |
| Page chrome | The title, clock, date and "Page 3 of 12" printed on every page are dropped; the header repeated on each page is kept once per block. |
| Fused cells | When a requirement's text reaches the next column, the PDF stores both cells as one piece of text. It is cut at the word boundary nearest that column's x. |

The result is the same structural workbook an Excel upload produces, so
grouping and the omitted columns work identically.

It refuses rather than guesses. If the header is not found, a column cannot be
located, or the recovered Units column does not look like numbers (the sign of
misaligned columns), the PDF is kept as an original only and the sidebar says so.

**Checked against a real report.** A real 12-page Workday export was read by
this code and, independently, by a different tool that uses the PDF's drawn
cell borders. The two agreed on all 202 table rows and all 781 non-empty cells.
The real file was never committed; `build-pdf.ts` writes synthetic PDFs with the
same geometry for the tests.

The original PDF remains the record. On the APR page the embedded PDF is what is
shown; the table read from it can be opened beneath it to check, and the sidebar
states that it was read from the PDF.

Validation, in order (`lib/apr/file-guard.ts`, `routes/progress-reports.ts`):

1. extension **and** declared type must agree on a supported format;
2. declared size, then the storage backend's own size, against the limit
   (`APR_MAX_UPLOAD_MB`, default 10);
3. the upload path must have been minted for the signed-in student;
4. signature: a zip (`PK`), not an OLE2 file (legacy `.xls` / password-protected);
5. the zip's own directory: entry count and declared inflated size (zip-bomb
   guard), and the parts every workbook has (`[Content_Types].xml`,
   `xl/workbook.xml`);
6. while reading: caps on sheets, rows, columns, cells and cell text length;
7. a workbook with no content at all is rejected.

Macros are never executed. Formulas are never evaluated: only the value Excel
cached in the file is shown, and a formula with no cached value is shown blank.
A hyperlink cell contributes its visible text only.

## Several APRs per student

A student uploads **one file per academic plan** — primary major, second major,
additional majors, minors, other — and never has to combine Excel files.

Each document has a stable id, a label the student chooses ("Finance Major"), a
category, a display order, the original file name, its upload time, the file's
import state, and a SHA-256 of the file. Documents are listed majors first, then
minors, then other. Any number of documents may share a category; the cap is 12
documents per student.

The label and category are the student's. CampusVal does not infer them from
the workbook.

| Action | Effect |
| --- | --- |
| Upload another APR | Adds a document. Nothing else changes. |
| Rename | Changes label/category only. File and upload date unchanged. |
| Replace | Replaces **that document's** file. The new file is validated and processed first; only then is the document switched to it and the old file removed. If the new file cannot be read, the previous file stays. |
| Delete | Removes that document and its file, after confirmation. |
| Original file | Streams the uploaded file to its owner. |

## Freshness

Every APR shows **"Uploaded Sep 26, 2026"** — in the sidebar header and on the
APR page (with the time). Replacing a file moves the date to the replacement.

It is always worded "Uploaded". CampusVal never says "last updated by Workday":
it cannot know when Workday last evaluated the record.

## The two presentations

Both read the same stored structural copy.

### Full APR — `/progress-report`

A read-only rendering of the workbook: every worksheet (tabs when there are
several, including empty or hidden ones, labelled), every row in source order,
every column — **Academic Period, Units and Grade included** — with merged
cells, bold headings, fills, indentation and relative column widths. Row numbers
and column letters match Excel. It scrolls vertically and horizontally inside its
own region; columns are never squeezed to fit.

Each APR is a collapsible container. With several APRs none is opened
automatically, and a collapsed APR's workbook is not even requested.

### Planning sidebar — right column of Degree Plan, Tentative Degree Plan, Quarter Plan

One shared component (`WorkdayAprPanel`). Below the `xl` breakpoint it opens as
a drawer (`AprReferenceSheet`).

The **only** processing CampusVal applies (`lib/apr/sidebar-projection.ts`):

1. **Find the header row** — the row containing "Requirement" and "Status".
   A two-row header ("Satisfied With" spanning "Registrations Used | Academic
   Period | Units | Grade") is handled.
2. **Leave out three columns** — those whose header names Academic Period,
   Units/Credits or Grade. This happens **on the server**: a planning page is
   never sent those cells.
3. **Group rows under collapsible headings** taken from the text before the
   first colon in Workday's requirement cell:

   | Workday text begins | Sidebar heading |
   | --- | --- |
   | `University Requirement…` | University Requirements |
   | `Core…` | Core |
   | `Finance Major : …` | Finance Major _(literal)_ |
   | `Data Science Minor: …` | Data Science Minor _(literal)_ |
   | `<anything else>: …` | that text, literally |
   | no heading | Other |

   A row with an empty requirement cell (a further registration under the same
   requirement) stays with the requirement above it. Workday writes some rows
   without a colon ("Mathematics Major GPA"); the heading is then the text up
   to and including the word Major or Minor.
4. **Keep each program block apart.** One Workday export can hold several
   programs — in the real report this was checked against, ten: two majors,
   seven minors and a special program — each titled "<Program> Requirements",
   followed by summary lines ("Program of Study GPA", "Requirements Effective",
   "Last Evaluated", "Requirements Not Assigned") and its own table. Each block
   is its own collapsible section, titled as Workday titles it. A block's
   University and Core rows are its own and are never merged with another's
   (the Finance block lists `Core: LSB: …`, the Mathematics block
   `Core: CAS: …`). The summary lines — GPA values included — are shown on the
   full APR only.

Rows keep their source order and their exact text. No row is dropped for being
unrecognised. Rows above the table (title, run date) are counted and shown on the
full APR only.

Opening or closing a section changes what is visible. It records nothing and
means nothing academically.

### When Workday changes its layout

If no header row is found, the sidebar **fails visibly**: it says the layout was
not recognised, sends no rows for that sheet (it cannot tell which columns hold
grades), and links to the full APR — which still shows the entire file. A
structural warning (`apr_structure_warning`, code only) is logged.

## File states

`processing` · `ready` · `unsupported` · `failed`. These describe the **file**,
not the student's academic standing. "Ready" means "this file can be displayed".

One broken document never affects the others: each is reported on its own, on
both surfaces.

## Data model

Table `progress_reports` — many rows per student.

| Column | Meaning |
| --- | --- |
| `id` | stable document id |
| `user_id` | owner (indexed with `display_order`) |
| `label`, `category`, `display_order` | student-chosen metadata |
| `file_name`, `file_size`, `content_type`, `source_format` | the uploaded file |
| `file_hash` | SHA-256 of the file the stored copy was made from |
| `object_path` | private storage location (never sent to a client) |
| `uploaded_at` | when the **current** file was added |
| `workbook` | structural copy: `sheets[] → rows[] → cells[]`, `merges[]`, column widths |
| `parse_status`, `import_error` | file-import state and error category |
| `parsed` | **legacy** — the earlier interpreted parse. Not written, not served. |

`progress_report_mappings` is a **legacy** table from the retired
course-mapping feature. It has no routes; a student's rows are removed when their
last APR is deleted.

### Migration `0002_apr_documents`

Additive and data-preserving. Drops the one-row-per-user constraint, adds the
columns above, and back-fills `source_format`. Every existing report becomes that
student's first document, labelled **"Academic Progress Report"** (the major is
not guessed) and keeping its original upload date. A pre-existing `.xlsx` is
imported from its stored original the first time it is read.

Apply it **before** deploying the new code (old code keeps working against the new
schema):

```bash
node artifacts/api-server/dist/migrate.mjs --status
node artifacts/api-server/dist/migrate.mjs
```

## API

All under `/api`, all behind sign-in, all scoped to the caller.

| Method | Path | |
| --- | --- | --- |
| GET | `/progress-reports` | list documents (metadata only) |
| POST | `/progress-reports` | add an uploaded file as a new document |
| GET | `/progress-reports/sidebar` | compact reference for all documents |
| GET | `/progress-reports/:id` | one document's metadata |
| PATCH | `/progress-reports/:id` | label / category / order |
| DELETE | `/progress-reports/:id` | delete one document and its file |
| GET | `/progress-reports/:id/workbook` | full structural copy |
| GET | `/progress-reports/:id/file` | the original file |
| PUT | `/progress-reports/:id/file` | replace one document's file |

## Security and privacy

- **Owner only.** The owner is always the authenticated session; every query is
  scoped `WHERE user_id = <session user>`. Another student's document id returns
  the same 404 as one that does not exist.
- **Sharing a plan does not share an APR.** The advisor-sharing routes do not
  touch APR data or storage, and "apr" is not a grantable scope.
- **Private storage.** Files live under an owner-bound path, are never served
  statically, and have no public or permanent URL. Upload links are signed and
  expire in 15 minutes. Downloads are `no-store`, `nosniff`, under a generic file
  name.
- **Untrusted content.** Cell text is stored as plain text and rendered as text;
  markup in a cell is displayed literally.
- **Logs** carry event names, error categories and document ids — never cell
  text, grades, file names or storage paths.

Tests: `routes/progress-reports.access-control.test.ts`,
`routes/progress-reports.test.ts`, `lib/apr/*.test.ts`.

## Test fixtures

`artifacts/api-server/src/__fixtures__/apr/build-workbooks.ts` builds **synthetic**
workbooks in memory (invented courses, grades and dates). No real student's APR
is, or may be, committed. To write them to disk for browser QA:

```bash
pnpm --filter @workspace/api-server exec tsx src/__fixtures__/apr/write-fixtures.ts ./apr-fixtures
```

### What the fixtures were checked against

The structure was checked against a real "View My Academic Progress" report (a
12-page PDF export; never committed and never used as a fixture): its program
blocks, two-row header, requirement wording and continuation rows. The
`workday-combined` fixture reproduces that structure with invented content. The
real report's tables were also converted to a workbook locally and run through
the importer: all nine tabled program blocks were recognised, every requirement
row was kept, and no Academic Period, Units, Grade or GPA value reached the
sidebar.

**Still not compared: a file produced by Workday's own "Export to Excel".**
Workday requires an SCU sign-in, so no Excel export could be obtained. The PDF
export is fully supported and was checked against a real report, so a student
does not need the Excel export. Workday's Excel export may place cells
differently (for example, where it puts the block title and summary lines). The
importer is header-driven rather than position-driven for that reason: a
different placement changes grouping at worst, and an unrecognised header fails
visibly rather than showing the wrong columns.

## Verifying a real Workday export

_2026-09-28._

The importer has been built and tested against synthetic workbooks that
reproduce Workday's layout, and against one real Workday **PDF**. It has **not**
been checked against a real Workday **Excel** export by anyone who could look at
the result: exporting one needs an SCU sign-in, and a student's record is not
something to pass around.

So there is a tool that checks an export and reports **structure only**:

```
pnpm --filter @workspace/api-server run verify-apr -- <file.xlsx | file.pdf> [--json]
```

It reads the file where it is. It prints counts, Workday's column headers from
a fixed list (any other header is printed as `(other)`), and codes. It never
prints a cell, a name, a course, a grade or a date, so its output can be shared.
A test runs it over every synthetic APR and searches the output for anything
from the file.

| It reports | Why |
| --- | --- |
| Worksheets, rows, columns, merged cells | The file opened, and how big it is |
| Rows with a value in the file, and rows kept | **No row is silently dropped.** The file's rows are counted from the file itself, without the workbook library |
| Formula cells, with and without a stored result | A formula with no stored result is shown blank, never calculated |
| Whether Workday's table was recognised; program blocks; groups by kind | The planning sidebar |
| Columns shown while planning, and columns withheld | Academic Period, Units and Grade must be withheld |
| Anything that needs a look | In words, without quoting the file |

Exit code 0: read completely. 1: something needs a look.

**What is known from production.** Of the three reports students have uploaded,
one `.xlsx` has been opened since the current importer was deployed (reports are
imported when first read). It imported with 1 worksheet, 63 rows kept of 63, 1
merged cell and no warnings. This was read from the counts in the database; the
report itself was not opened or read, so **whether it is a Workday export is not
known**.

**What remains.** One person with an SCU sign-in exports their own Academic
Progress report from Workday as Excel, runs the command above on it, and sends
the output (not the file).

## Stored formula results

Since 2026-09-28 a formula whose stored result is `0` shows `0`. The workbook
library reports such a result as missing; it is now read from the file
(`lib/apr/formula-cache.ts`). Nothing is calculated. See
`docs/DEGREE_CHECKSHEETS.md`, Formulas.
