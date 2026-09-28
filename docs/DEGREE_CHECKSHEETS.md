# Degree Checksheets

_2026-09-28. Added at the professor's request after the APR review._

## What it is

SCU departments publish advising documents: major and minor checksheets,
four-year plans, flowcharts, advising guides. They often hold information that
is not in the APR, the Bulletin or CampusVal's own requirements: recommended
sequencing, prerequisite reminders, first courses, Core overlaps, tracks.

Degree Checksheets lets a student **upload the documents they are following**
and **track their own progress on them**. It is two things at once:

- a **reference library** of department documents, shown as uploaded;
- a **progress tracker**: the student's own status and quarter for each item.

## Design principle

**The uploaded document stays intact as the reference. The student's tracking
is a separate layer stored by CampusVal.**

```
SOURCE DOCUMENT      the department's file           never edited
STUDENT TRACKING     status, quarter, notes          stored separately, drawn over or beside it
```

Marking an item Completed, choosing a quarter or writing a note never writes to
the uploaded file or to the display copy made from it. "Show original only" on
any document shows the source with nothing of the student's on it.

## What it deliberately does not do

| It does not | Why |
| --- | --- |
| Change the requirements sidebar beside the Degree Plan, or any requirement calculation | The professor has not decided what that sidebar should be benchmarked against. See [The open question](#the-open-question). |
| Decide which checksheet applies to a student, or pick a "latest" one | A student may be allowed to follow a different curriculum than their entry year suggests. The student chooses. |
| Add, complete or move a course on the Degree Plan, Quarter Plan or Tentative Degree Plan | Tracking is reference-only. |
| Read, change or appear in an Academic Progress Report | The APR feature is separate and unchanged. |
| Fetch, scrape or synchronise SCU's checksheet pages or Google Docs | Departments host documents differently, some behind sign-in, in several cohort versions. The student downloads the file and uploads it. |
| Interpret, summarise or compare the document, with or without AI | It is a reference. The wording is the department's. |
| Let the student edit the document's text | Only tracking values are editable. |
| Share checksheets with an advisor who can see a shared plan | Checksheets are owner-private. |

These are enforced by tests, not only by intent: see
`degree-checksheets.access-control.test.ts` ("scope guards").

## Where it is

Additional Features → Planning tools → **Degree Checksheets** (`/degree-checksheets`).
It is registered in `lib/pilot-features.ts` as `PILOT_VISIBLE`. It may later move
beside Degree Plan / Quarter Plan; nothing in the code depends on where it sits
in the menu.

The page links to the official SCU page,
<https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/>,
in a new tab. CampusVal only links to it.

## The student's workflow

1. Open Degree Checksheets. With nothing uploaded, an empty state offers
   **Upload Checksheet** and **Find SCU Degree Checksheets**.
2. Find the document on the SCU site. If it is a Google Doc or Sheet, download
   it (File → Download) as PDF, Word or Excel.
3. Upload it. Only the file and a **title** are required; the title starts as a
   tidied copy of the file name. Optional: type of document, program, which of
   the student's programs it is for, college/school, academic year/version,
   and a link to where it was found.
4. The document appears as a collapsible card showing its title, details and
   **"Uploaded Sep 28, 2026"**.
5. Expand it: the source is shown, with tracking controls.
6. Record a status and a quarter. They are saved automatically.
7. Later: rename, edit details, replace the file, open the original, delete.

## Supported files

Every upload is validated on the server before anything is saved. The
extension, the declared type **and the first bytes of the file** must agree.

| Format | Preview | Tracking |
| --- | --- | --- |
| PDF `.pdf` | Every page drawn in the app by PDF.js from the original file, with selectable text; zoom 50–300%; page navigation | Markers placed on the page + My Tracking list |
| Excel `.xlsx` | Every worksheet as a grid: source order, wording, merged cells, bold, fills, indentation; horizontal and vertical scrolling; sticky headers. Cells a formula fills in are left empty, and the preview says so | **In place**, in the document's own Status / Quarter columns + My Tracking list |
| Word `.docx` | Headings, paragraphs, lists, tables, links and embedded PNG/JPEG/GIF pictures, in order. Word's page layout is not reproduced | **In place** in a table's Status / Quarter columns + My Tracking list |
| PNG `.png`, JPEG `.jpg` `.jpeg` | The picture, with zoom and scrolling | Markers placed on the picture + My Tracking list |
| Excel `.xls` (legacy) | **None.** The file is stored and can be opened; the card says it has no preview and suggests saving as `.xlsx` | My Tracking list |

Refused, with a message saying why: anything else (`.html`, `.svg`, `.doc`,
`.xlsm`, `.zip` …), a file whose contents do not match its type, an empty or
oversized file, a damaged file, and a **password-protected** file.

Legacy `.xls` is not parsed because no maintained, safe reader for that binary
format is in use here. It is kept as an original rather than refused, so the
student can still store and track it.

Nothing in an uploaded file is ever executed: macros are never run, formulas are
never evaluated (the value Excel last showed is copied as text), scripts in a
PDF are never run (the PDF library's scripting engine is not shipped), and no
markup from a file reaches the page.

## Architecture

```
Browser ── POST /degree-checksheets/upload-url ─► signed, owner-bound link (15 min,
   │                                              one content type, size-capped)
   ├── PUT bytes ──────────────────────────────► private object storage
   └── POST /degree-checksheets ───────────────► validate bytes ─► build the display copy
                                                  ─► save the document     (nothing is saved
                                                                            if the file is refused)

Expanded card ── GET …/render ──────► display copy (jsonb)      spreadsheet / Word
              ── GET …/file ────────► the original bytes        PDF / picture / "Open original"
              ── GET …/annotations ─► the student's tracking
```

### Server

| File | Purpose |
| --- | --- |
| `routes/degree-checksheets.ts` | All 13 routes. The only module that touches the two tables. |
| `lib/checksheets/formats.ts` | Which format a file is: extension + declared type + first bytes. Detects password protection. |
| `lib/checksheets/render.ts` | Builds the display copy for each format. |
| `lib/checksheets/tracking-layout.ts` | Finds the cells a table left for the student (see below). |
| `lib/checksheets/docx-reader.ts` | Word → display blocks. |
| `lib/checksheets/pdf-info.ts` | PDF → page sizes and a hash of each page's text. |
| `lib/checksheets/image-info.ts` | PNG/JPEG → pixel size, read from the header. |
| `lib/checksheets/anchors.ts` | Validates where an entry sits; decides what survives a replacement. |
| `lib/checksheets/metadata.ts` | Cleans what the student types (titles, notes, links). |
| `lib/checksheets/file-response.ts` | Serves the original privately. |
| `lib/checksheets/limits.ts` | Upload and size limits. |
| `lib/checksheets/model.ts` | Types, error codes and messages. |

**Reuse of APR infrastructure.** Checksheets reuse, unchanged: private object
storage and its owner-bound upload links (`lib/storage`), the zip directory
guard (`lib/apr/file-guard.ts`) and the workbook reader
(`lib/apr/workbook-reader.ts`, a structural copier with no APR-specific
behaviour). The dependency runs one way: nothing under `lib/apr/`,
`routes/progress-reports.ts`, `routes/storage.ts` or
`lib/private-file-response.ts` was changed for checksheets, and tests assert
that they do not mention them.

### Web app

| File | Purpose |
| --- | --- |
| `pages/degree-checksheets.tsx` | The page: help text, actions, empty/loading/error states, library, filters. |
| `hooks/use-degree-checksheets.ts` | Queries, the upload flow, and a document's tracking state with autosave. |
| `components/degree-checksheets/ChecksheetDocumentCard.tsx` | One collapsible document and its actions. |
| `…/ChecksheetSpreadsheetView.tsx`, `ChecksheetDocumentView.tsx`, `ChecksheetPdfView.tsx`, `ChecksheetImageView.tsx` | The four source viewers. |
| `…/PointMarkerLayer.tsx`, `ViewerToolbar.tsx` | Markers on a page or picture; zoom, pages, placing a marker. |
| `…/MyTrackingPanel.tsx`, `TrackingControls.tsx` | The student's list; the status and quarter controls; the save indicator. |
| `…/ChecksheetUploadDialog.tsx`, `ChecksheetDetailsFields.tsx`, `ChecksheetFileZone.tsx` | Upload and details. |
| `…/tracking-save-queue.ts` | Autosave ordering (see below). |
| `…/tracking-geometry.ts` | Marker positions and zoom. |

A collapsed document loads only its metadata. Its preview and tracking are
requested the first time it is opened. The PDF viewer (and the PDF library) is a
separate bundle, downloaded only by a student who opens a PDF.

## Data model

Migration `lib/db/drizzle/0004_degree_checksheets.sql`. Two new tables; no
existing table or row is touched.

### `degree_checksheet_documents` — the source

| Column | Notes |
| --- | --- |
| `id`, `user_id` | Owner is always the signed-in user. |
| `title` | Required. The student's own name for the document. |
| `category` | `major_checksheet`, `minor_checksheet`, `four_year_plan`, `flowchart`, `advising_resource`, `other`. Stored as text so a new kind needs no migration. |
| `program_name`, `program_role`, `school`, `academic_year_label`, `source_url` | Optional, descriptive. Free text (roles: `major`, `additional_major`, `minor`, `additional_minor`, `general`). |
| `sort_order` | The student's order within a category. |
| `original_filename`, `file_size`, `mime_type`, `source_format`, `file_hash` (SHA-256) | About the stored file. The type is the one verified from the bytes. |
| `object_path` | Where the file is in private storage. Never sent to the browser. |
| `source_version` | 1, then +1 on each replacement. |
| `render_status`, `render_note` | `ready` / `original_only` / `failed`, and why. A file state, not an academic one. |
| `render` (jsonb) | The display copy. Replaced, never patched, when the file is replaced. |
| `tracking_cell_count` | How many cells of the display copy accept tracking in place. |
| `uploaded_at` | When the CURRENT file was added. A replacement moves it. |
| `created_at`, `updated_at` | |

Index: `(user_id, sort_order, id)`.

### `degree_checksheet_annotations` — the student's tracking

| Column | Notes |
| --- | --- |
| `id`, `document_id` → documents (`ON DELETE CASCADE`), `user_id` | `user_id` repeats the owner on purpose: every query is scoped by it directly. |
| `anchor_type`, `anchor` (jsonb) | Where the entry sits. See below. |
| `anchor_key` | Canonical text of a cell anchor. Unique per document: one cell, one entry. `NULL` for markers and list entries. |
| `anchor_fingerprint` | Hash of what the source showed at that place when the entry was made. Used only on replacement. |
| `source_version` | The file version the entry was made against. |
| `detached_at` | Set when a replacement could not confirm the entry's place. |
| `item_label` | The student's label (list entries), or what a detached entry referred to. |
| `status` | `not_started`, `planned`, `in_progress`, `completed`, or `NULL`. |
| `term`, `term_year` | `fall` / `winter` / `spring` / `summer` and the **calendar** year, or both `NULL`. |
| `note` | Optional, up to 500 characters. |
| `sort_order`, `revision`, `created_at`, `updated_at` | `revision` is +1 on every change. |

Indexes: `(document_id, sort_order, id)`, `(user_id)`, unique `(document_id, anchor_key)`.

**Row-level security.** CampusVal runs on plain Postgres through Drizzle, with
Clerk for sign-in; it does not use Supabase or database RLS policies anywhere.
Ownership is enforced in the application, in every query (see Security).

**Future-ready metadata.** `category`, `program_name`, `program_role`, `school`,
`academic_year_label` and `source_url` let a later feature tell a department
checksheet for a given program and curriculum year apart from other sources.
That is preparation only. Nothing reads these columns to decide anything today.

## Tracking

### Status

`Not Started`, `Planned`, `In Progress`, `Completed`, or no status. These are the
student's own. There is no "official", "verified", "waived" or "satisfied"
value, and the UI labels every control **My tracking** / **My status**.

### Quarter

CampusVal's existing term names (`fall`, `winter`, `spring`, `summer`) with a
calendar year, shown as "Fall 2026". Choosing a quarter fills in that quarter's
year in the academic year in progress (during 2026-27: Fall → 2026, Winter →
2027), using the same conversion the Degree Plan uses
(`lib/academic-year.ts`); the year can then be changed. Past years (completed
work) and future years (plans) are both offered. A quarter is a term **and** a
year; the server refuses one without the other.

### Where an entry can sit

| `anchor_type` | Used for | `anchor` |
| --- | --- | --- |
| `sheet_cell` | An EMPTY worksheet cell the document left for the student | `{ sheet, row, col }` |
| `doc_cell` | The same, in a table of a Word document | `{ block, row, col }` |
| `sheet_item` | A FILLED worksheet cell the student chose to track | `{ sheet, row, col }` |
| `doc_item` | The same, in a table of a Word document | `{ block, row, col }` |
| `point` | A marker on a PDF page or a picture | `{ page, x, y }`, `x`/`y` as fractions (0–1) of the page from its top-left |
| `manual` | An entry in the student's own list | `{}` |

An anchor is a **position**, never visible text: the same course can be listed
twice, and text is not a key. Every anchor a browser sends is checked against
the document's own display copy before it is stored, so an entry can only sit
where the document really offers a place.

Marker positions are fractions of the page, not pixels, and are drawn with CSS
percentages inside the page's own box. A marker therefore keeps its place at
any zoom, window size or screen.

### In-place tracking: which cells

`lib/checksheets/tracking-layout.ts` looks for columns a department left for the
student to fill in. It is deliberately hard to satisfy, because offering an
official column for editing is worse than missing a student column (in which
case the student uses the My Tracking list).

1. The header must be one of a short list of exact phrases (`Status`,
   `Completed`, `Done`, `Quarter`, `Quarter Completed`, `Term`, `Term Taken`,
   `When Taken` …). A blank column is never assumed to be a tracking column.
2. The same row must also name what is being tracked (`Requirement`, `Course`,
   `Units` …). That is what makes it a header row rather than a data row that
   contains the word "Completed".
3. A column already filled in more than a fifth of its rows is the department's
   and is left alone entirely. A bare `Year` column must be completely empty.
4. A cell holding any source text is never offered, and neither is a cell hidden
   under a merged range, a cell the spreadsheet calculates, or a section
   heading row.
5. A row is offered only if it names something in the columns that belong to
   that student column: the ones between the previous student column and it.
   Real checklists put two tables side by side (the requirements, and a
   year-by-year grid); a row with text only in the other table is not a row of
   this one.

A **section heading** is a row whose only label is **bold**. Shading is not a
sign of a heading: real checklists shade every cell.

**What a student column holds** is decided per table, among the columns that
are really offered. When a table has a status column *and* a quarter column,
each holds its own value. When it is left with one student column, which is how
the real checklists are built (a single "Status" or "Quarter" column), that
column holds **both** a status and a quarter, as one entry per cell
(`field: "both"`). A column right after another student column ("Status",
"Quarter") belongs to the same table; a column with labels of its own starts a
new one.

This reads column headers, whether a cell is empty, and whether a label is bold.
It does not read requirements.

### Tracking a cell the student chooses

Many real SCU documents list courses without leaving a column for the student:
the College of Arts and Sciences first-year course plans are Fall / Winter /
Spring grids in which each cell is a course ("RTC 1", "MUSC 1A"). Nothing in
them can be detected as a student column, and nothing should be.

For these, the student presses **Track a cell** and then clicks or taps the
cell they want. CampusVal stores an entry anchored to that cell and draws the
student's status and quarter **beneath the department's text**, which stays as
it is. Such an entry holds both a status and a quarter, is named after what the
cell says, and has a remove button.

CampusVal never chooses these cells itself. Deciding which cells are
requirements would be reading the document; the student points, and only the
position is remembered. Any cell that says something can be chosen; an empty
cell cannot. On replacement the entry stays only if that cell still says the
same thing.

### Every document has My Tracking

Inside each expanded document, **My Tracking** holds:

- the student's own list: item, status, quarter, note;
- the markers on the page, listed so each can be edited without a pointer;
- entries a replacement could not keep in place.

So a PDF, a flowchart, or a file with no preview is still usable as a
checksheet.

### Saving

There is no Save button. Choices are saved at once; typing is saved after a
700 ms pause. The card shows **Saving… / Saved / Could not save** (with **Try
again**), announced to screen readers.

- **Order.** At most one request per entry is in flight. Changes made meanwhile
  are merged and sent afterwards with the revision the server just returned, so
  an older request cannot overwrite a newer value.
- **Two windows.** Each save names the revision it was based on. If the server
  holds a newer one it refuses (409) and the page shows the server's version.
- **No loss.** Collapsing a document sends anything still waiting, and the
  tracking state lives on the card, which stays mounted while collapsed.
  Leaving the page with a change still on its way asks first.

## Replacing a file

1. The new file is validated and its display copy built **first**. If that
   fails, the document keeps its previous file, preview, date and tracking.
2. Otherwise the file, the display copy, the version and every entry's position
   are switched in one database transaction, and the old file is removed from
   storage.
3. Each placed entry is checked against the **new** display copy:

| Entry | Kept in place when |
| --- | --- |
| Cell entry | The new file offers the same cell, for the same kind of value, **and** the row there has the same content (fingerprints match). |
| Cell the student chose | The same cell exists and still says the same thing. |
| Marker on a PDF | The page exists, has the same size, and has the same text. A page with no text (a scan) cannot be verified. |
| Marker on a picture | Only when the very same file is uploaded again. |
| List entry | Always. |

Anything else is **detached**: kept, labelled with what it referred to, listed
under My Tracking, and **not drawn on the new document**. The card says how
many entries stayed and how many need review. No entry is ever left against a
different requirement. The student then decides, for each one:

| Choice | What happens |
| --- | --- |
| **Keep in my list** | It becomes an entry of the student's own list. |
| **Place on the document** (a marker) | The student clicks where it belongs on the new page or picture. |
| **Place in a cell** (a cell entry) | The preview shows **Place here** in every free cell that can hold the entry; the student picks the row it belongs to. For a cell the student had chosen, they click the cell it belongs to. |
| Remove | It is deleted. |

**Place in a cell** offers only cells that are free and that can hold
everything the entry has: an entry with a status and a quarter is never put in
a Status-only column, where half of it would be lost. The server makes the same
checks again (`PATCH … { anchor }`), and gives the entry the new file's
fingerprint for that row, so from then on it belongs to the new file. It is
CampusVal that offers the cells and the student who chooses; CampusVal never
moves an entry to a row by itself, because matching an old requirement to a new
one would be reading the document.

## Duplicate files

Before uploading, the browser compares the file's SHA-256 with the documents
already in the library. If it matches, the student sees "This file appears to
already be uploaded" with **Cancel** and **Upload Anyway**. Uploading the same
file twice is allowed (one checksheet can serve two plans); each copy has its
own tracking.

## Security

| Question | Answer | Proof |
| --- | --- | --- |
| Who can list, read, change or delete a document or its tracking? | Only its owner. Every route is `requireAuth`; the owner is only ever `req.userId`, from the verified session; no route reads a client-sent user id; every query against either table is scoped to that owner. Another student's id returns the same 404 as one that does not exist. | `degree-checksheets.access-control.test.ts`; browser spec H |
| Can an entry be reached through another document? | No. An entry is looked up by its id, its document **and** its owner together. | same |
| Is the file reachable by a public URL? | No. It is read only through the owner-checked route, which also asks the storage layer's own owner binding. Nothing is served statically. | same |
| Does a shared plan disclose checksheets? | No. The sharing routes cannot read these tables, and an advisor with a valid share sees an empty library of their own. | same; browser spec H |
| Can a file be served as HTML or script? | No. The content type comes from the format verified at upload. PDFs and pictures are served inline with `nosniff`; office files are downloads under a sandbox policy. The download name is fixed. | `degree-checksheets.test.ts` |
| Can file content become markup on the page? | No. Spreadsheet cells and Word text are rendered as text. Word is read into a fixed set of block types; links are kept only if they are plain `http(s)`. | `render.test.ts`; `checksheet-views.test.tsx`; browser spec E |
| Are links the student types safe? | Only `http(s)` addresses without credentials are stored, and they open in a new tab with `noopener noreferrer`. | `anchors.test.ts` |
| Can a hostile file harm the server? | Bytes are checked before any library reads them; zip size, pages, pixels, blocks, rows and text length are capped. A refused file is deleted. | `render.test.ts`; `degree-checksheets.test.ts` |
| Are document contents in logs? | No. Event names, error categories and document ids only. A test captures everything logged during a full lifecycle and searches it. | `degree-checksheets.test.ts` ("what is written to the log") |

Logged events: `checksheet_upload_started`, `checksheet_document_validated`,
`checksheet_preview_processed`, `checksheet_annotation_saved`,
`checksheet_annotation_deleted`, `checksheet_document_replaced`,
`checksheet_document_deleted`, `checksheet_processing_failed`,
`checksheet_replacement_failed`, `checksheet_orphaned_object`.

## Deleting

The database record is removed first (its tracking goes with it, `ON DELETE
CASCADE`; the display copy is a column of the record), then the stored file,
with one retry. If the file cannot be removed, the student's view is still
correct and `checksheet_orphaned_object` is logged with the document id so an
operator can clear it.

## Limits and configuration

| Setting | Default | Notes |
| --- | --- | --- |
| `CHECKSHEET_MAX_UPLOAD_MB` | `20` | 1–50. Larger than the APR's because flowcharts and scanned plans are bigger. A reverse proxy's body limit must be at least this. |
| Documents per student | 30 | |
| Tracking entries per document | 500 | |
| PDF pages / picture pixels | 200 / 80 million | |

Storage uses the existing private storage provider and its settings; there is
no new storage requirement. There is no native dependency and no background
worker: previews are built in the request that registers the upload.

New packages: `mammoth` and `htmlparser2` (Word), `jszip` (test fixtures) on
the server; `pdfjs-dist` in the web app. The web build copies PDF.js's fonts,
character maps and image decoders to `pdfjs/` in its output
(`vite.config.ts`), so they are served from CampusVal's own origin.

## The open question

What should the degree-requirements sidebar beside the Degree Plan be
benchmarked against: the current Undergraduate Bulletin, the Bulletin of the
student's matriculation year, the department checksheet for the student's
curriculum year, the APR, or a controlled combination?

**The professor has not decided.** This is a product decision, not a technical
gap. Until it is made, Degree Checksheets changes nothing about that sidebar.

## Tests

| Suite | What it covers |
| --- | --- |
| `lib/checksheets/tracking-layout.test.ts` | Which cells are offered, and which are not |
| `lib/checksheets/render.test.ts` | Every format; every way a file is refused; hostile content |
| `lib/checksheets/anchors.test.ts` | Anchor validation; what survives a replacement; typed input |
| `routes/degree-checksheets.test.ts` | Full lifecycle against the real database and storage |
| `routes/degree-checksheets.access-control.test.ts` | Cross-user access, plan sharing, scope guards |
| `components/degree-checksheets/*.test.ts(x)` | Autosave ordering, marker geometry, formatting, the viewers |
| `pages/degree-checksheets.test.tsx` | The page |
| `artifacts/e2e/tests/degree-checksheets.spec.ts` | The real app in a browser, desktop, tablet and phone |

Fixtures are synthetic (`api-server/src/__fixtures__/checksheets`): invented
programs and courses. No real department document or student file is committed.

### Real department documents

Checked on 2026-09-28 against files downloaded from scu.edu, kept outside the
repository:

| Document | Result |
| --- | --- |
| Mechanical Engineering curriculum flow chart (4 landscape pages, colour) | Drawn, text selectable, marker placed, stored byte for byte |
| Computer Science & Engineering four-year course plan (1 page) | Same |
| General Engineering four-year plans (2 pages) | Same |
| Music first-year course plans, downloaded from Google Docs as Word and as PDF | Both drawn; in the Word file a course cell is chosen and tracked, and survives a reload |
| Gender and Sexuality Studies first-year course plans, Word and PDF (2 pages) | Same |
| Leavey School of Business core curriculum, the web page saved as a PDF (6 pages) | Drawn, text selectable, marker placed, stored byte for byte |
| A saved sign-in page named `.pdf` | Refused: "contents don't match its file type" |
| **All 40** College of Arts and Sciences "Requirements Checklist" spreadsheets (Anthropology … Women's and Gender Studies) | All 40 shown; all 40 tracked **in place**, 1,708 cells in total; first cell of each given a status and a quarter in the browser; each stored byte for byte |
| **All 33** College of Arts and Sciences first-year course plans, Word | All 33 shown; a course cell chosen and tracked in each; each stored byte for byte |

The College of Arts and Sciences publishes its documents as Google Docs that
require an SCU sign-in. The two above were downloaded by the repository owner
with their own SCU account. The Leavey School of Business publishes its core
curriculum as a web page (scu.edu/business/undergraduates/core), not as a file.
A student saves that page as a PDF from the browser's Print dialog and uploads
it; CampusVal does not fetch it.

The 40 checklists and 33 course plans are Google Sheets and Google Docs behind
an SCU sign-in; they were downloaded through the repository owner's own signed-in
browser. That is every checklist and every course plan the College's page links.

What real files showed that synthetic ones had not:

- **They have no student columns.** They are grids of courses. This is why a
  student can choose any filled cell to track (above).
- **Google's Word export flags every table row as a header row.** Shown
  literally, the whole table would be styled as headings. The reader keeps the
  first row as the header when every row claims to be one
  (`header_rows_normalized`).
- **A checklist has ONE student column**, headed "Status" in 20 of them and
  "Quarter" in the other 20. One value alone cannot say "planned for winter", so
  a table's only student column holds both values. The header row also has a
  "Year" column, which the department filled in; it is not offered, and it does
  not count as the table's quarter column.
- **A checklist is two tables side by side**: the requirements on the left, a
  year-by-year grid on the right with its own column. Rows are matched to the
  table they name something in (rule 5 above). Before this, about 40% of
  requirement rows were not offered.
- **A header row often starts with the table's title**, which can be longer
  than a column header (41 characters in one minor's checklist). The other
  cells of a header row may be up to 80 characters; the student column's own
  header is still held to the short list of exact phrases.
- **Every cell is shaded.** Shading was being taken for a heading; only bold is
  now. Of 1,807 labelled rows, the 96 not offered are all headings
  ("Explorations", "Integrations", "Upper Division Requirements" …).
- **The History checklist's worksheet is named "History"**, a name Excel
  reserves and the workbook library refuses to open. The name is changed in a
  copy held in memory, only so the file can be read; the stored file is
  untouched and the sheet is shown under its real name.
- **39 of the 40 contain formulas Google could not export a value for**, shown
  by other programs as `#N/A`. That is not the department's text, so such a cell
  is left empty, the preview says that calculated cells are not shown
  (`calculated_cells_not_shown`), and the cell is never offered to the student.

To repeat the check, point the browser spec at a folder holding `eng-*.pdf`,
`lsb-*.pdf`, `cas-*.pdf` and `cas-*.docx` files, with the checklists in `checklists/*.xlsx`
and the course plans in `plans/*.docx` (tests R and S):

```
CHECKSHEET_REAL_DIR=<folder> E2E_BASE_URL=http://localhost:18080 \
  pnpm --filter @workspace/e2e exec playwright test degree-checksheets.spec.ts --project=checksheets
```

Without that folder the real-document tests skip themselves. The same layout
is covered without any real file by the synthetic `checklist-workbook`
fixtures and browser test J.

```
pnpm --filter @workspace/api-server exec tsx src/__fixtures__/checksheets/write-fixtures.ts <dir>
```

writes them to disk for manual QA.
