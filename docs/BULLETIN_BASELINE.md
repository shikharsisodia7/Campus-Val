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
DEGREE CHECKSHEETS       separate: reference documents a student uploads (private), plus a source of Department Notes
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

`data/bulletin-snapshots/2026-27.json` freezes every program's normalized tree (groups, requirements, stable keys, provenance; no student data).
A unit test fails if the file is not what the data produces: run `pnpm run snapshot:bulletin` after a Bulletin data change and commit the result.

### Structured majors: themes, choices and alternatives

_2026-10-09._ A major whose Bulletin entry is built from choices ("one course from each theme", "four electives, at least two with
laboratory", "PHYS 11-13 or PHYS 31-33") is written in `data/major-structures.ts` as a `MajorStructure`: sections of requirements,
each one of three rules (**each** course required, **choose N** from named course lists, **alternatives**), with the Bulletin's
paragraph kept verbatim beside it. Allocation is deterministic: requirements resolve in Bulletin order and a course counts toward
one requirement only. The sidebar receives each item's `section` (sub-heading) and `choice` (named lists, counts, alternatives);
every requirement with a long course list can be opened in full, for any program. Majors without a structure keep their recipe.

Biology is the first structured major (Provost demo): see [audits/biology-proofing-2026-10-09.md](./audits/biology-proofing-2026-10-09.md).
To add another: transcribe the Bulletin section into a `MajorStructure`, add it to `MAJOR_STRUCTURES`, write a semantic fixture
test like `major-structures.test.ts`, run `pnpm run snapshot:bulletin`, and check `audit:requirements --db` for notes or student
edits anchored to keys the change removes.

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

A Department Note is advising guidance a department stands behind, shown beside a requirement (or a whole program), for every student whose plan includes that program.

- Table `department_requirement_notes`: program key, target stable key (a requirement, a group, or null = the program), Bulletin edition, text, kind
  (requirement / sequence / core_overlap / advising), `status` (**draft**, **published**, **archived**, **unmapped**), origin (imported / admin), source label, source URL,
  source reference ("Biology!D40"), reviewer, creator, updater, timestamps. A note on a **Core** requirement belongs to the program that wrote it (a Biology note about RTC 3)
  and shows only on plans that include Biology.
- Students cannot edit one; the sidebar renders it as plain text (never markup), collapses very long text without losing it, and says where it came from and, for an
  imported note, that the department has not reviewed it yet.
- **Not the same as My Note.** Different label, colour, icon and markup, tested.

### Import from department checklists

Source: the Requirements Checklists the College of Arts and Sciences publishes (spreadsheets, 40 of them). `scripts/import-department-notes.ts`:

```
pnpm --filter @workspace/api-server run import:department-notes -- --dir <folder of .xlsx> [--apply] [--out report.json]
```

A table with a header cell "Notes" is read; the row label and the Notes cell are taken **verbatim**. The anchor is decided only by exact rules
(`lib/department/checklist-notes.ts`): a University Core row whose label is a known Core label (the note keeps its row label: "RTC 3: Can overlap...") and whose
Core requirement exists in the program's tree; or a program row whose course codes **all** belong to exactly one requirement of the program. Anything else goes to the
**unmapped** queue with the label it sat beside; a note that is only course codes ("CHEM 14") is anchored but stays a **draft**. Nothing is paraphrased, summarized or
guessed. A file is matched to a program by the exact title of its "<Program> Major Requirements" table; a file that matches no program exactly ("Studio Arts" is not "Studio Art"; "Gender and Sexuality Studies" is not "Women's & Gender Studies": that is the department's to confirm, not a guess) or is a checklist for an earlier
curriculum ("Prior to ...") is reported and skipped. Re-running is idempotent; a note a person has edited, reviewed or archived is never overwritten.
A student's private upload is never a source of global notes.

Result on the 40 real CAS checklists (QA database): 30 programs matched, 10 files skipped (each with its reason in the report), **225 published**, **2 draft**, **179 unmapped**.
Imported notes are published *unreviewed* and labelled so; the department's own administrators review them in Program Requirements Admin.

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
`--generated`: for every major with **no** official four-year plan (the 42 Arts and Sciences and Leavey majors), the example sequence CampusVal builds from the major's own requirements, stored as `campusval_generated`, listed after official plans, badged **"Example, not an SCU plan"** in the picker and warned in the preview. With it, **all 50 majors have a four-year plan to load**; only 8 are official.
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
- **Checksheets.** They stay as uploaded reference documents and as a *source of notes*. Important advising guidance should increasingly live as Department Notes; a checksheet
  is never the structural authority for requirements, and a private upload never defines anyone else's requirements.
- **Cohort-year selection** needs the older editions' data and a policy; the architecture (editions, snapshots, diff, edition on every override) is ready.
