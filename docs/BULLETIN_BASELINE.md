# The requirements sidebar: Bulletin baseline, Department layer, student edits

_2026-10-06. Builds on [`REQUIREMENTS_SOURCE.md`](./REQUIREMENTS_SOURCE.md) (provider boundary, stable keys, student edits) and
[`DEGREE_CHECKSHEETS.md`](./DEGREE_CHECKSHEETS.md). Written after the professor's latest review._

## The model

```
BULLETIN                 the structural baseline: the latest Undergraduate Bulletin CampusVal has loaded
  + DEPARTMENT LAYER     notes and global planning overrides an authorized department maintains
  + STUDENT LAYER        the student's own notes, hides and requirements, scoped to one plan
  = what the sidebar shows

APR (Workday)            separate: the comparison point and the definitive reference for degree completion
DEGREE CHECKSHEETS       separate: private reference documents a student uploads; never a source of global Department Notes
```

These stay conceptually and physically separate. Nothing collapses them into one record:

| Layer | Where it lives | Who can change it | Student sees it as |
| --- | --- | --- | --- |
| Bulletin | compiled into the API (`data/degree-requirements.ts`, `data/graduation-paths.ts`), frozen per edition in `data/bulletin-snapshots/` | engineers, through a reviewed change | the requirement |
| Department Note | `department_requirement_notes` | the program's department administrators (or an import that a person has not yet reviewed) | **Department Note** (amber, read-only) |
| Department override | `department_requirement_overrides` | the program's department administrators | wording marked **Department edit**; an added requirement marked **Added by \<department\>** |
| Student layer | `requirement_customizations` (plan-scoped) | the plan's owner | **My Note**, **My edit**, **Hidden from my plan**, **My requirement** |
| APR | the student's own upload | the student | the right-hand column, unchanged |

The sidebar is **planning language**: it never says "your official degree requirement list". The APR/Workday remains the
record of whether a requirement is met.

### Precedence

1. **Bulletin** (the base)
2. **Department global override** (retitle, hide, add)
3. **Student plan override** (rename, My Note, hide, own requirements)

Each later layer sits on the earlier ones and never rewrites them. Every layer's source value stays recoverable:

- a student's **Reset** restores Bulletin + the department's *current* configuration, not the raw Bulletin;
- an admin's **Reset to Bulletin** deletes the override row and the Bulletin requirement is exactly as imported;
- a Department Note update reaches every plan at once and leaves every student's My Note alone;
- a department **hide** removes the requirement from every student's view and recounts that group; the admin page still shows it (with Reset);
- a student's edit is anchored to the **Bulletin** fingerprint, so a department note or retitle never makes it look "source changed".

Notes never change status: a note that says a course also satisfies a Core area is advising context only. Completion still comes from the
existing resolution (`lib/core-cross-satisfaction.ts`, the profile, the plan).

## Bulletin baseline and editions

`lib/requirements-source/editions.ts` registers the editions CampusVal can build from (today: `2026-27`, the Bulletin published at
scu.edu/bulletin/undergraduate, verified 2026-07-23). The sidebar defaults to the **latest registered edition**; nothing is hardcoded in the UI.

- A requirement's full identity is **(edition, stable key)**. The stable key is edition-independent (`major:biology#chem-12`), so notes,
  overrides and student edits survive an edition change; each row records its edition, and a changed Bulletin requirement is surfaced by fingerprint.
- `REQUIREMENTS_BULLETIN_EDITION` (server environment) selects a registered edition; an unknown value falls back to the latest with a warning.
- A request that names an edition that is not loaded fails (`BulletinEditionNotLoadedError`); it is never answered with another edition.
- Provenance per group: `sourceType`, `bulletinEdition`, `sourceVersion` (as the data states it), `sourceProgram`, `sourceSection`,
  source address, `lastVerified`, `importedAt` (null: the data is compiled in, not imported).
- Students do **not** choose an edition yet. A student on an older curriculum hides, adds and annotates in their own plan. A selector needs
  no sidebar change: pass `context.bulletinEdition`.

### Adding another edition

1. Load that edition's data (the recipes in `data/`), add it to `BULLETIN_EDITIONS`, and make the provider select data by edition.
2. `pnpm --filter @workspace/api-server run snapshot:bulletin -- --edition <id>` writes `data/bulletin-snapshots/<id>.json`.
   A snapshot of a non-latest edition is history and is never overwritten.
3. `pnpm --filter @workspace/api-server run diff:bulletin -- --from 2026-27 --to <id>` lists added / removed / changed requirements, changed
   course lists and changed unit text. A developer proofreading aid, not student-facing policy.

Only the 2026-27 edition has data today; no older edition is invented.

### Snapshots

A snapshot records each Core item's school annotations, and stores a shared group once per distinct content: when the program
changes it (the Leavey core's information-systems route for Accounting or MIS, a program-specific Core statement), the variant
is stored as `<stable key>|<program key>` and that program's `groupKeys` point to it.

`data/bulletin-snapshots/2026-27.json` freezes every program's normalized tree (groups, requirements, stable keys, provenance; no student data).
A unit test fails if the file is not what the data produces: run `pnpm run snapshot:bulletin` after a Bulletin data change and commit the result.

### Structured majors: every major as the Bulletin writes it

_2026-10-09._ **Every major** (all 50) is written as a `MajorStructure` transcribed from the 2026-27 Bulletin's "Requirements for
the Major" (`data/majors/*.ts`; the engine is `data/major-structures.ts`). The Bulletin's text is stored word for word beside each
structure (`data/majors/bulletin-text-2026-27.json`, read on 2026-10-09). The old flat recipe lists (lower/upper division) are gone:
they invented fixed course lists the Bulletin never stated. Proofing notes per major:
[audits/all-majors-proofing-2026-10-09.md](./audits/all-majors-proofing-2026-10-09.md) (Biology:
[audits/biology-proofing-2026-10-09.md](./audits/biology-proofing-2026-10-09.md)).

Rules (`data/majors/model.ts`):

- **each**: every listed course is required (one sidebar item per course);
- **choose N** from named course lists, optionally **from at least K lists** ("one course from at least four of the five areas"),
  with **at most N from a list** caps ("either CSEN 79 or CSCI 163 may be substituted for one"), or as an **overlay** that reads
  courses other requirements counted ("at least one course must be an Electronic Music course");
- **alternatives**: complete one of the listed course sets ("PHYS 11-13 or PHYS 31-33");
- **manual**: a requirement CampusVal cannot count from course codes (a department's approved list the Bulletin does not print, units
  of ensemble, an internship, a course attribute such as "before 1800"). Shown in the Bulletin's words, marked "you track this one";
  never counted complete. It may carry course lists to browse.

A list is explicit codes the Bulletin names and/or a **range** it states ("ANTH 140–149", "any upper-division chemistry course of 3
units or more"), read against the catalog (with exclusions, excluded suffixes such as Psychology's "AT", and unit floors). A
student's own course inside a stated range counts even when the catalog lacks it (except under a unit floor, which the catalog must
vouch for). Lists derived from course-listing headings (Political Science subfields, History fields) keep the headings and numbers
as `listingText`.

**Tracks / emphases / concentrations** are `variants`: required (Bioengineering's tracks, Classics' tracks, Computer Science's
emphases, Public Health's and Theatre's emphases) or optional (Mathematics, Communication, Political Science, Philosophy, Art
History, Studio Art emphases; Economics concentrations). The student chooses one (`PUT /profile/major-track`,
`student_profiles.major_tracks`, migration 0009); the sidebar shows only that track, or a "Choose your track" item when the
Bulletin requires one. A track is resolved after the shared sections, starting again from the courses the shared sections REQUIRE,
so an emphasis's "specifications" can be the same electives. Department program trees, the audit and the Bulletin snapshot resolve
every track. Planning intent only: nothing is declared with SCU.

Allocation is deterministic: requirements resolve in Bulletin order; a course counts toward one requirement only (overlays read
without taking); a course an each-rule requires never fills a choice (an option may still name it); completed courses are taken
before planned ones, and for a "from at least K lists" rule the spread is filled first (a planned course that completes the spread
is counted instead of a completed course from a list already covered).

Tests: `major-structures.all.test.ts` holds every structure to its text (every course it names is named there), to the catalog
(or the recorded list of 77 codes the Bulletin names but its course listings do not attribute), and to well-formedness (lists used
and non-empty, keys unique across tracks, tracks complete); `major-structures.engine.test.ts` covers the rules.
`pnpm run diff:bulletin-source -- --out docs/audits` re-reads every page live and reports drift (all 50 unchanged on 2026-10-09).

**Keys.** Item keys: a required course keeps its course slug (`major:biology#biol-1a`; a track's course is prefixed with its section
key, `major:bioengineering#pre-med-science-chem-11`); a choice uses its requirement key (`#theme-cmb`). A department note or student
edit saved on a pre-restructure course key (`major:chemistry-b-a#math-11`) **follows the course** to the requirement that now holds
it (`#mathematics`): `currentTargetKey` in `stable-keys.ts`, used by the department layer and the customization overlay. Program
keys come from the major's title, so titles are unchanged (e.g. "Women's & Gender Studies" keeps its key; the structure's source
label carries the Bulletin's current name).

**Catalog corrections.** `import:bulletin-courses` added the courses the structures name that the 2025-26 catalog snapshot lacked
(attributed only where the Bulletin states the subject: neighbouring courses, a "(SCTR)" section heading, the page's own text naming
the code, or a department heading), and re-coded 50 catalog entries the snapshot filed under a stale subject (SCTR/TESP filed as
RSOC; GNSX filed as WGST). The old codes stay in `data/course-code-aliases.json`: `findCourse` and requirement resolution accept
them, so a plan, profile or note that saved "RSOC 15" still means SCTR 15. Cross-listed courses (ETHN 55 / POLI 55) keep both codes.

To change a major: edit its structure beside the Bulletin text, run the tests, `pnpm run snapshot:bulletin`, and check
`audit:requirements --db` for notes or edits anchored to keys the change removes.

## Categories and the Core/Major classification

Canonical categories (`lib/requirements-source/category.ts`): `UNIVERSITY`, `CORE`, `SCHOOL`, `MAJOR`, `MINOR`, `CONCENTRATION`, `OTHER`.
The server sends `category` on every group, derived from the **Bulletin group** the requirement is in, never from where a checksheet lists it.

- UNIVERSITY: degree-level rules (175 units, 60 upper-division, GPA, residency, transfer cap): the new *University Degree Requirements* group (read-only, no course placement).
- CORE: the University Core Curriculum (CTW, C&I, RTC, Foundations / Explorations / Integrations, Pathways).
- SCHOOL: the school's own requirements (Leavey Common Curriculum, SOE units, CAS units).
- CONCENTRATION: named on the major (46 names in 15 majors); no course lists are loaded for them yet.

**Root cause of Core appearing under Major.** `getMajorRequirements` ends with an informational "University Core (areas)" group whose entries are
Core area *names* with a made-up course code ("Critical Thinking & Writing 1"). It exists for the graduation-paths page. The sidebar flattened every
group of the recipe into the major group, so all 50 majors listed 18 or 19 Core areas that no course could satisfy (about 2,260 of the first audit's 2,393
findings). It was fixed at the route in the earlier pass; this pass adds the canonical `category`, the University group, the audit's classification
checks (below) and regression tests: CTW and the Core areas are asserted to be CORE for Biology, Psychology, Computer Science and Engineering and two Leavey
majors, and absent from every MAJOR group.

### The audit

```
pnpm run audit:requirements                 # summary + findings
pnpm run audit:requirements --out docs/audits   # + JSON and two CSVs
pnpm run audit:requirements --db            # + department notes, overrides, student-edit keys, sample plans (DATABASE_URL)
pnpm run audit:requirements --strict        # exit 1 on any error
```

It reports, and never edits: duplicate ids and stable keys, empty labels, courses not in the catalog, empty groups, malformed rules, missing
provenance, and the classification errors `core_requirement_under_major`, `university_rule_under_major`, `major_requirement_under_core`,
`core_item_without_phase`, `university_rule_with_courses`. With `--db`: notes mapped to a requirement that no longer exists, notes outside their program,
unmapped notes, overrides with a missing target or group, duplicate overrides, student customization keys that exist in no program's tree (keys only: no student
content is read), and sample-plan courses that are not in the catalog. The `course_not_in_catalog` warnings are real: the course catalog is the 2025-26 scrape and
the requirement data names courses of the 2026-27 Bulletin. 30 of the original 108 were closed from the 2026-27 Bulletin's own course listings
(`pnpm run import:bulletin-courses`); 70 remain, each listed in [audits/catalog-gaps-2026-10-06.md](./audits/catalog-gaps-2026-10-06.md).

> The same sidebar is also shown on the Degree Checksheets and Academic Progress Report pages, and a student can add a My Note or My requirement to it from a checksheet: [CROSS_REFERENCE_WORKSPACE.md](./CROSS_REFERENCE_WORKSPACE.md).

## Department Notes

A Department Note is advising guidance a department stands behind, shown beside a requirement (or a whole program), for every student whose plan includes that program. It is created only by a scoped department administrator or imported from a canonical department resource through the review/publish workflow; it is never promoted from a student's private upload.

- Table `department_requirement_notes`: program key, target stable key (a requirement, a group, or null = the program), Bulletin edition, text, kind
  (requirement / sequence / core_overlap / advising), `status` (**draft**, **published**, **archived**, **unmapped**), origin (imported / admin), source label, source URL,
  source academic year/document version, provenance status, source reference ("Biology!D40"), reviewer, creator, updater, timestamps. Imported rows link to a
  `department_canonical_resources` row; legacy/admin rows deliberately do not. A note on a **Core** requirement belongs to the program that wrote it (a Biology note about RTC 3)
  and shows only on plans that include Biology.
- Table `department_canonical_resources`: the controlled source registry. It records a program and school, public HTTPS source URL, exact offline package file name,
  academic year and document version plus separate **provenance** (`documented` / `verified` / `superseded` / `rejected`), **review** (`pending` / `approved` /
  `rejected`) and **publication** (`draft` / `published` / `archived`) states. Only an administrator can change those states; a resource is importable only when it is
  `verified`, `approved`, and `published`. Archiving or superseding a resource hides every linked imported note from students immediately, without deleting its audit trail.
- Students cannot edit one; the sidebar renders it as plain text (never markup), collapses very long text without losing it, and says where it came from and, for an
  imported note, that the department has not reviewed it yet.
- **Not the same as My Note.** Different label, colour, icon and markup, tested.
- Program Requirements Admin makes provenance explicit: **Department Admin** for staff-authored guidance, **Canonical resource** for a registered source, and
  **Legacy / needs review** for older rows whose canonical origin has not been verified. Legacy rows are not silently re-attributed.

### Import from department checklists

Layout guard (2026-10-20): the extractor reads labels from column A and one Notes column. A table whose header row has more
than one Notes column, nothing in column A, or a second table's title before its Notes column (Leavey-style side-by-side
sheets) is not interpreted: each Notes cell becomes an unmapped candidate, verbatim, with no guessed label. A Notes-less grid
beside the table (the four-year grid on every CAS checklist) is fine. Checked on all 41 CAS checklists: 542 candidates, 0
diverted.

Source: a **registered canonical department resource**, supplied as an offline package to the import workflow — never from the student upload store. A super admin first
registers the program, school, public HTTPS URL, exact `.xlsx` file name, academic year, and document revision in Program Requirements Admin; they then verify provenance,
approve review, and publish the source. This supports any CampusVal program in CAS, Leavey, or Engineering rather than assuming a CAS-only file-name alias list.
`scripts/import-department-notes.ts` reads only files with one active, import-ready registry record:

```
pnpm --filter @workspace/api-server run import:department-notes -- --dir <folder of .xlsx> [--apply] [--out report.json]
```

A table with a header cell "Notes" is read; the row label and the Notes cell are taken **verbatim**. The resource's reviewed program association permits official document
titles that differ from the CampusVal display title; the anchor is still decided only by exact rules
(`lib/department/checklist-notes.ts`): a University Core row whose label is a known Core label (the note keeps its row label: "RTC 3: Can overlap...") and whose
Core requirement exists in the program's tree; or a program row whose course codes **all** belong to exactly one requirement of the program. Anything else goes to the
**unmapped** queue with the label it sat beside; a note that is only course codes ("CHEM 14") is anchored but stays a **draft**. Nothing is paraphrased, summarized or
guessed. An unregistered file, duplicate active registration, resource with any non-ready lifecycle state, school/program mismatch, or checklist for an earlier
curriculum ("Prior to ...") is reported and skipped. Re-running is idempotent; a note a person has edited, reviewed or archived is never overwritten.
A student's private upload is never a source of global notes.

The earlier CAS proofing result (QA database) was **225 published**, **2 draft**, **179 unmapped** from the files then available. It is historical validation, not an
assertion that those files are still current. Imported notes retain their source-specific provenance and may be reviewed independently; the canonical source must remain
import-ready for its linked notes to be shown.

### Titles and course lists

_2026-10-09._ A Department Note can carry an optional **title** and a list of **catalog course codes** (migration `0008`): the
courses of a theme, an overlap list, a sequence. Admins enter them in the existing note editor (comma-separated codes); every code
must be a CampusVal catalog course and an unknown one is refused by name, never substituted. Students see the title, the text and
the codes as links into the course catalog. Structural requirements stay in the Bulletin data; a note is for guidance the
Bulletin does not state (do not repeat a list the requirement already shows).

Several programs can note the same Core requirement (a Biology major's note and a Chemistry minor's note on CTW 1): each is shown
with its program's name, neither replaces the other, and each appears only on plans that include that program.

## Department administration

### Roles and scope

- **Super admin**: an address in `ADMIN_EMAILS` (existing). Every program, the shared Core/school/university groups, scope management.
- **Department admin** (`department_admin`): a row in `program_admin_scopes` (email, program key, who granted it, when, revoked at). Exactly the programs of their rows.
  A program key is the stable key of the program's group: `major:biology`, `minor-biol-min`.
- Everyone else: nothing.

Authorization is on the server for every request (`lib/department/authz.ts`): identity is the verified address of the signed-in user, the scope is a database
row, and the browser sends neither. A client-supplied role, program, user or email changes nothing (tested). A non-scoped program, and a key that does not exist,
get the same 403. The shared Core, school and university groups can only be overridden by a super admin; a department may still write a *note* on a Core requirement
for its own program. Scopes are keyed by email so they can be granted before the first sign-in and mapped from an SSO group later by writing the same rows.

### Assigning roles (no personal emails in code or migrations)

```
pnpm --filter @workspace/api-server run admin:scope -- programs                                   # program keys
pnpm --filter @workspace/api-server run admin:scope -- grant  --email dept.chair@scu.edu --program major:biology
pnpm --filter @workspace/api-server run admin:scope -- revoke --email dept.chair@scu.edu --program major:biology
pnpm --filter @workspace/api-server run admin:scope -- list
```

or, as a super admin, *Program Requirements Admin > Administrators* (`POST/DELETE /api/admin/department/scopes`). Every grant and revoke is audited.

### What an admin can do (`/admin/program-requirements`)

For their programs: write, edit, publish, unpublish and archive Department Notes; place an unmapped imported note; **edit wording** of a Bulletin requirement;
**hide** it from the planning view; **add** a requirement the Bulletin does not list (catalog courses only, marked as the department's); **Reset to Bulletin**;
publish / unpublish the program's Sample Plans; read the change history; open the provenance inspector (Base / Department / Student) for any requirement.
The Bulletin data is never written: every action is an override row, and deleting the row restores the Bulletin.

### Audit trail

`department_audit_log` (append-only): who, when, program, entity (note / override / sample_plan / scope), action, target key, and the effective value **before**
(the Bulletin's own wording when there was no override) and **after**. It holds department content only, never student data. Log lines carry the entity, action and
program, never note text.

### Safety

Admin text is untrusted: control characters are removed, lengths are capped, it is stored as plain text and rendered as text nodes (a unit test and a browser test
cover `<img onerror>`). Added requirements accept catalog course codes only.

## Sample Plans

Published planning templates a student loads into a **new Tentative Degree Plan** (`Load Sample Plan` beside `Load Four-Year Plan`).

- Flow: school > program > plan > **preview** > Create Tentative Degree Plan. The preview shows every term, course (with its catalog title), placeholders, the source, the version,
  validation warnings, and says it is a planning template, not a guarantee.
- **Source gate.** A normal student can list, preview, or load only a **published** `official_department` template with its school, program, source version (and academic year when
  stated), source label, a valid HTTPS URL or canonical document reference, and its recorded import timestamp. Drafts, staff-authored entries, generated plans, and legacy/incomplete
  rows fail closed in both the API and client picker.
- **Safe by default.** The default creates a new plan and changes nothing existing. "Add to this plan" skips courses already present, removes nothing, and adding to the
  **Degree Plan** needs an explicit confirmation (server-enforced: 409 without it). The new plan's major is set to the sample's program (planning only; the profile and the APR are untouched).
- **Independent copy.** A loaded plan records only provenance (`metadata.sampleSource`: template, version, source). Editing, re-publishing or archiving the template never touches it,
  and a published template that differs is refused: a change is a **new version**.
- Tables: `sample_plans` (school, program, program key, title, plan length first_year / two_year / four_year / other, version, academic year, source type / label / URL / reference,
  status draft / published / archived, import warnings) and `sample_plan_items` (year, term, position, course or placeholder, verbatim wording, the title the source printed).
- **Validation** (on import and live in the preview): course not in catalog (loaded as a placeholder with the source's wording, never substituted), course renamed (the source's title differs
  from the catalog's), invalid term or year, duplicate course. Prerequisite and conflict warnings come from the existing plan checks once the courses are in the plan; the template is never altered to hide them.
- A cell that is exactly one course becomes a course; "CHEM 11, 14, Core or Elective" or "CTW 1" stays a placeholder with the department's own words. Nothing is invented.

### Import

```
pnpm --filter @workspace/api-server run import:sample-plans -- --engineering --cas-dir <folder of .docx> [--apply] [--publish] [--version <label>]
```

`--engineering`: the eight School of Engineering four-year plans CampusVal carries as **prescribed** (reconciled against SCU's published plans; the source link travels with each; General Engineering and Mechanical were transcribed from their official quarter grids on 2026-10-06).
`--generated`: a **private R&D-only** deterministic sequence generator. It requires `ENABLE_GENERATED_PLAN_RND=true`, stores records as `campusval_generated`, and never feeds public `Load Sample Plan`, its preview/load endpoints, or the normal department-admin inventory. Authorized R&D administrators may inspect the inventory only through `GET /api/admin/rnd/generated-sample-plans` while the flag is enabled. It is not an SCU plan and must not be used as course-timing advice for pilot students.
`--cas-dir`: the College of Arts and Sciences first-year course plans (Fall / Winter / Spring grids; every "Option" is its own plan). The Leavey School of Business publishes no sample plan, so none is
loaded. "Recommended" and "example" sequences are never sample plans. Result in the QA database: **157 plans** (6 four-year, 151 first-year), 2 items with a course not in the catalog (PHYS 20).
Publish and unpublish with the admin page, or `--publish` at import.

## Deploying

1. Apply migration `0006_department_layer_and_sample_plans` **before** the code that uses it (`node dist/migrate.mjs`, see [SCU_DEPLOYMENT.md](./SCU_DEPLOYMENT.md#3-database)). If the code is live first, the sidebar
   still loads (the department layer is skipped), admin routes answer 503 "isn't available yet", and nothing else changes.
2. `pnpm run snapshot:bulletin -- --check` (the committed snapshot matches).
3. Import notes and sample plans (above) against the production database **after** reviewing the dry runs.
4. Grant scopes with `admin:scope`.

Environment: `REQUIREMENTS_BULLETIN_EDITION` (optional), `ADMIN_EMAILS` (existing, the super admins). No secrets are added.

## Future

- **Registrar / APR notes.** If Workday's APR can carry notes, they are a *new source* mapped to the same note model; today nothing is faked and the Department Note architecture does
  not depend on it.
- **Checksheets.** They stay as uploaded private reference documents. Important advising guidance should increasingly live as Department Notes sourced from canonical department resources or deliberate administrator entry; a private upload is never a Department Note source, structural authority, or definition of anyone else's requirements.
- **Cohort-year selection** needs the older editions' data and a policy; the architecture (editions, snapshots, diff, edition on every override) is ready.
