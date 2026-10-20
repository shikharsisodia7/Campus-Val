# The requirements sidebar: where it comes from, and how a student can annotate it

_2026-09-30. Read with [`DATA_PROVENANCE.md`](./DATA_PROVENANCE.md) and [`DEGREE_CHECKSHEETS.md`](./DEGREE_CHECKSHEETS.md)._

> **Update 2026-10-06.** The professor's latest direction is that the sidebar's structural baseline is the **latest Undergraduate Bulletin**, with
> Department Notes from the departments, global overrides by authorized department administrators, and the student's own plan-scoped edits on top;
> the APR stays the separate Workday reference. That is implemented, and described in [`BULLETIN_BASELINE.md`](./BULLETIN_BASELINE.md). Still open and still
> the professor's: whether a student's matriculation-year Bulletin should ever replace the latest one, and what the departments confirm (see that document).
> The rest of this page describes the provider boundary, stable keys and student edits, which that work builds on unchanged.

## The decision is the professor's, and it is not made

The Degree Plan has a list of requirements on its left ("Planning Requirements").
What that list should be benchmarked against has not been decided:

| Candidate | Code name | Built? |
| --- | --- | --- |
| The current Undergraduate Bulletin | `current_bulletin` | **Yes**: this is what CampusVal already did |
| The Bulletin of the student's matriculation (cohort) year | `cohort_bulletin` | No |
| The department checksheet for the student's curriculum year | `degree_checksheet` | No |
| The Workday Academic Progress Report | `apr` | No |
| A controlled combination of these | `composite` | No |

Nothing in this document, and nothing in the code, chooses one. **What a student
sees in the sidebar is what they saw before**, apart from the three defects in
[Defects found along the way](#defects-found-along-the-way).

Everything below is _engineering_ that makes the decision cheap to carry out:
the source is named in one place, every requirement has a stable identity and
provenance, students can annotate their own planning view without touching the
source, and a script audits all of it.

## Implemented, and still a policy question

| Implemented | Still the professor's |
| --- | --- |
| The current source runs behind a provider interface | Which source the sidebar is benchmarked against |
| A normalized tree with stable keys and provenance | Whether curriculum rights follow the cohort year |
| Plan-scoped, non-destructive planning edits (rename, note, hide, own requirements) | Whether a student may ever change the _structure_ of a requirement (today: never) |
| Detection of edits whose source has since changed | Which source wins where sources disagree, if combined |
| Reset to source, per requirement and for a whole plan | Whether a per-program edition must be recorded (see [What provenance showed](#what-provenance-showed)) |
| `pnpm run audit:requirements` and an admin provenance inspector | The academic-content questions the audit lists |

## A. The source map (facts from the code)

The sidebar renders `GET /api/plans/:id/requirements` (a student's plan) and, when
there is no plan at all, `GET /api/requirements`. Both are built by
`buildRequirementsResponse` in `artifacts/api-server/src/routes/requirements.ts`.
Requirements are **compiled into the API**, not stored in the database: nothing
about a requirement can be edited at runtime by anyone.

| Sidebar content | Enters the system at | Transformation | Kind / id | Edition and date it states | Fallback |
| --- | --- | --- | --- | --- | --- |
| **University Core** (one per plan) | `data/degree-requirements.ts`, `universityCore(primaryCollege)`: 20 areas, universal; the primary school decides only the Core's own school rule (Engineering's Pathway count). Schools' fulfillment statements are an overlay: `LEAVEY_CORE_FULFILLMENTS` / `schoolCoreFulfillments(schools, programs)` (see `MULTI_SCHOOL_REQUIREMENTS.md`) | `resolveCoreItem`: explicit school routes first (completed only when every part has a completed course), then the catalog Core-area match (`lib/core-cross-satisfaction.ts`, flagged for verification); items carry `annotations` | `university_core`, id `university-core`, key `university-core:<primary school>` | Core: `2025-26 / 2026-27 Undergraduate Bulletin`, verified `2026-07-23`; Leavey statements: scu.edu/business/undergraduates/core, verified `2026-10-20` | none: always built |
| **School** (one group per school of the plan's MAJORS: LSB business core, SOE, CAS) | `collegeGroup(school, programs)` in the same file, for every school in `response.schools` (from `getMajorCollege` of every plan major, primary first, deduped; minors never add one) | as above; `routes` (course sets) for the Economics OMIS 41 alternative | `college`, ids `college-lsb` / `college-soe` / `college-cas`, `group.school.activatedBy` | LSB: 2026-27 Bulletin Ch. 4, verified `2026-10-09`; others as University Core | an unknown additional major adds no school (`schoolWarnings`) |
| **University rules** (175 units, 60 upper-division, 2.0 GPA, residency, transfer cap) | `UNIVERSITY_DEGREE_RULES` in the same file | returned as `universityRules`; **not** a sidebar group. Shown on the Core requirements page (`pages/core-reqs.tsx`) | — | Bulletin Ch. 8, no date | — |
| **Major** (50 programs) | `MAJOR_RECIPES` in `data/graduation-paths.ts` → `getMajorRequirements` | the route turns each recipe course into an item; completion from the profile; "planned" from the plan | `major`, id `major-primary` or `major-extra-N` (positional) | **the University Core's** edition and date: the major data states none of its own (see below) | a program with no loadable course (French: every course is missing from the catalog) becomes an honest empty group with a note pointing to the Bulletin |
| **Minor** (71 offered) | `MINORS` (list) and `MINOR_RECIPES` (the verified recipe) in `data/graduation-paths.ts` → `getMinorRequirements` | choose-N groups become one item; fixed lists one item per course | `minor`, id `minor-<code>` | its own `catalogYear` and `lastVerified` (`2026-08-11`, `2026-09-04`) | a minor with no recipe becomes an empty group: CampusVal does not invent eligible courses |
| **Concentrations / tracks** | `MajorConcentration` on a recipe | only their names appear, in a note on the major group | — | — | — |
| **Professional Preparation** | the plan's own `programs.professionalGoals` (student-authored) | goals become groups; its courses items | `professional_prep` | none, and it says so: "Student planning goal — not an official SCU graduation requirement" | — |
| **Manual "choose from an approved list" check-offs** | `requirement_completions` table (`POST /requirements/completions`) | used by the Core requirements page, **not** by this sidebar | — | — | — |

### What provenance showed

- The Bulletin edition and verification date are stated **once**, on the University
  Core, and every major group repeats them. The major recipes carry no edition of
  their own. `academicYearBasis: "inherited_from_university_core"` records that.
  Until a per-major edition is recorded, a cohort-year source cannot be
  compared with the current data program by program.
- The University Core group has one id (`university-core`); its stable key includes the
  PRIMARY school's code (`university-core:cas`), unchanged since before multi-school
  composition so existing customizations keep their anchors. A plan has one Core
  whatever the number of schools.
- Quarter Plan does not read the sidebar. The Degree Plan and Tentative Degree
  Plan share it (one component, `components/degree-plan/Palette.tsx`, mounted in
  both workspaces). The mobile app does not show this sidebar.

## B. Architecture

```
GET /api/plans/:id/requirements
   │  owner-only (404 otherwise); request assembled from the plan on the server
   ▼
requirementsRequestForPlan ──► selectRequirementsProvider(context) ──► provider.build(request)
                                        │                                  │
                                config.ts (server env only)         current_bulletin provider
                                                                           │ response + provenance
                                                                           ▼
                                                                normalizeRequirements()   (stable keys, fingerprints)
                                                                           │
                                       plan's rows ──► composeRequirementOverlay() ──► response
```

| Piece | File (`artifacts/api-server/src/lib/requirements-source/`) |
| --- | --- |
| Provider interface, provenance record | `model.ts` |
| The one provider that exists | `current-bulletin.ts` |
| Source selection (server configuration) | `config.ts`, `index.ts` |
| Stable keys and fingerprints | `stable-keys.ts` |
| Normalized tree | `normalize.ts` |
| Overlay composition, conflicts, orphans | `overlay.ts` |
| Audit | `audit.ts` |
| Admin inspector | `inspect.ts` |

### Provenance

Each group carries, on the server: `sourceType` (the provider), `sourceIdentifier`
(the address the data names), `sourceLabel`, `sourceVersion` and `academicYear`
(the edition as stated), `academicYearBasis`, `lastVerified`, `sourceDocumentId`
(null: the current data is code, not a document), `sourceSection`, `importedAt`
(null: nothing is imported) and `provenanceStatus`:

`documented` (address, edition and date all stated) · `partial` · `unknown` ·
`student_authored`. Nothing is invented: a missing value is `null`, and an item
takes its group's provenance.

The provenance record is **not** sent to students. What they can see is the group's
existing `sourceLabel`, `academicYear`, `lastVerified` and `sourceUrl` (shown as
"Source data" under each group) and a one-sentence description of the source that says
the data was loaded in CampusVal from Bulletin sources and must be confirmed
against the Bulletin, the department and Workday. It never says "official".

### Stable keys

An override is anchored to a requirement by its **stable key**, never by array
position, visible text or DOM index:

- group: `university-core:<school>`, `major:<program-slug>`, or the group id for
  school, minor and professional-prep groups;
- item: `<group key>#<item id without the group prefix>`.

`major:computer-science-engineering#math-11` is the same requirement whether that
major is the plan's primary major or an added one. Keys are derived only from
identifiers the source data already carries. A guard test asserts they are unique
and identical across builds.

### Configuration

`REQUIREMENTS_BENCHMARK_PROVIDER` (server environment, unset = the current source)
selects among providers that **exist**. A value that is not a known source, or a
source that has not been built, falls back to the current source and logs a
warning that does not echo the value. A request, a query string or a student
cannot choose the source. Per-program / school / curriculum-year selection has a
seam (`selectRequirementsProvider(context)`) but no rule: every request currently
gets the configured source, and the student's entry year is deliberately **not**
used to pick anything.

## C. Planning customizations (the editable sidebar)

**Edit requirements** (a button on the sidebar header) opens an explicit edit mode.
Outside it the sidebar looks as it always did; an edited or student-added
requirement is marked ("My edit", "My requirement") even then.

### What a student can and cannot do

| Can | Cannot |
| --- | --- |
| Give a source requirement their own wording (the source wording stays one click away) | Change which courses satisfy a requirement, how many are needed, or any rule |
| Add their own note to a requirement | Make a requirement complete, or change its status |
| **Hide from my plan** a requirement, and restore it | Delete a source requirement (hiding never deletes it) |
| Add **their own requirement** to a group (title, note, up to 8 catalog course codes as add-to-plan shortcuts, a "done" tick for their own tracking) and move it up or down within the group | Edit the source data, another plan, another student's plan, the APR or a Degree Checksheet |
| Reset one requirement, or every customization in the plan, to the source | Change what CampusVal treats as official |

Wording is chosen not to overstate: "My edit", "My note", "My requirement",
"Hide from my plan". CampusVal never says a student changed their degree
requirements. A custom requirement is always `open`, has no courses, is never
marked satisfied or planned (its courses are shortcuts, not evidence), and its tick reads "my own tracking — not an SCU record".

### The overlay

```
SOURCE REQUIREMENT  +  PLAN-SPECIFIC ROW  =  DISPLAYED REQUIREMENT
```

Table `requirement_customizations` (migration `0005_requirement_customizations`):
`plan_id` (FK to `academic_plans`, **ON DELETE CASCADE**), `user_id`, `entry_type`
(`source_edit` | `custom`), `target_key` (stable key, or a random id for custom),
`group_key`, `course_codes` and `position` (custom rows), `title`, `note`, `hidden`, `done`, and the base the
student edited: `base_fingerprint`, `base_title`, `base_source_version`,
`base_source_type`, plus `created_at`, `updated_at`, `updated_by`. Typed columns,
no free-form blobs. Unique on `(plan_id, entry_type, target_key)`.

Migration `0007_note_source_provenance` adds four nullable columns for a note the
student took from one of their own Degree Checksheets: `note_source_type`
(`DEGREE_CHECKSHEET`), `note_source_document_id` (no foreign key: deleting the
document keeps the note), `note_source_label` (the document's title, read on the
server) and `note_source_anchor` (a safe pointer such as `Biology!row 40`). No file
content is stored. The API returns it as `customization.noteSource` with
`documentAvailable`. See [CROSS_REFERENCE_WORKSPACE.md](./CROSS_REFERENCE_WORKSPACE.md).

`composeRequirementOverlay` is pure and never touches `status`, `complete`,
`satisfiedBy`, `plannedBy`, `courses` or any count. Tests assert those are equal
with and without a customization.

### Scope

- **Plan-scoped.** The Degree Plan and every Tentative plan customize independently.
- **Duplicate / "copy into a new tentative plan"**: copies the rows (independent
  copies; editing the copy never changes the original).
- **Delete a plan** (and the previous Degree Plan when a tentative plan is
  promoted over it): rows go with it by cascade. Nothing is orphaned.
- **Promote**: the plan keeps its id, so it keeps its rows.
- **Sharing**: advisor shares are read-only and do not reach these routes. Only the
  plan owner can read or change a plan's customizations. Nothing about them is
  included in what an advisor sees.

### When the source changes after an edit

Each row records the fingerprint of the source requirement (text, courses, edition
and provider; **not** status) when it was made. If that no longer matches, the edit
is **not applied**: the updated source is shown with "This source requirement
changed since you customized it. Your edit is not applied." and a **Review**
dialog showing the wording then, the wording now, and the student's edit, with
**Keep my edit** (re-bases it onto the updated source) or **Use updated source**
(discards it). Nothing is silently overwritten. A change of provider counts as a
change of source. An edit whose requirement, or whose program, is no longer in the
plan is listed in edit mode as "Edits that no longer match anything" with a Remove
button, and reported by the audit.

### Analytics

Opening edit mode records one privacy-preserving usage event, `requirement_customization`
(the existing feature allowlist; no requirement text, course or plan content).

### API (`routes/requirement-customizations.ts`, OpenAPI in `lib/api-spec`)

| | |
| --- | --- |
| `GET /plans/:id/requirements` | requirements + overlay + summary + orphans |
| `PUT /plans/:id/requirement-customizations` | rename / note / hide one source requirement (by stable key); server checks the key is in this plan's sidebar |
| `DELETE /plans/:id/requirement-customizations?sourceKey=` or `?all=true` | reset |
| `POST /plans/:id/requirement-customizations/resolve` | `keep_mine` / `use_source`, one or all |
| `POST/PATCH/DELETE /plans/:id/custom-requirements[/:customId]` | the student's own requirements |

### Security

- Every route: sign-in required, user taken from the session, plan loaded only if
  `academic_plans.user_id` equals that user (else 404). A `userId`/`planId` in the
  body is ignored (tested).
- **Row-level security is not used in this project** (Drizzle over a plain
  Postgres connection, no Supabase); authorization is these server-side checks,
  consistent with every other plan route. The FK cascade is the only
  database-level guarantee.
- Text is plain: control characters stripped, lengths capped (title 160, note 600),
  rendered escaped. Caps per plan: 400 edits, 60 own requirements.
- Log lines carry counts and provider names only, never plan or requirement text.

### Deploying

Migration `lib/db/drizzle/0005_requirement_customizations.sql` adds one table and
touches nothing else; apply it (`node dist/migrate.mjs`, see
[SCU_DEPLOYMENT.md](./SCU_DEPLOYMENT.md#3-database)) **before** the code
that uses it. If the code is live first, nothing breaks: the sidebar loads without
customizations, an edit answers "Requirement edits aren't available yet" (503), and
duplicating a plan still works. The migration is not applied to production by this
change.

## D. The audit and the inspector

```
pnpm run audit:requirements                      # summary + findings
pnpm run audit:requirements --out docs/audits    # + JSON and two CSVs
pnpm run audit:requirements --strict             # exit 1 on any error
```

It builds every supported major and minor (synthetic profiles; no student data),
runs the checks, and only **reports**. Categories: `data_integrity` (engineering
fixes it), `missing_provenance`, `academic_content` (the professor's to settle;
never auto-changed). Checks: duplicate item ids and stable keys, empty labels,
course codes not normalized / not in the catalog / duplicated, empty groups,
malformed rules, requirement groups missing an address, edition or date, a Core
area name standing where a course should be, courses listed in both the school
and major groups. `auditPlanCustomizations` (used by tests, never by the catalog
audit) reports a plan's overrides that point at a missing or changed requirement.

Results and the reading guide are in [`audits/`](./audits/README.md).

`GET /api/admin/requirements-inspector?major=CSE&minor=ANTH-MIN` (administrators
only) returns every group and requirement for a program with its stable key,
fingerprint and provenance. It runs on a synthetic profile.

## E. To act on the decision

1. Implement `RequirementsBenchmarkProvider` beside `current-bulletin.ts`. Return
   the same response shape and one `RequirementProvenance` per group (real
   `sourceDocumentId`, `sourceVersion`, `importedAt`). Keep group ids stable per
   program and edition so the stable-key rules produce stable keys.
2. Add it to `PROVIDERS` in `index.ts`; select it with
   `REQUIREMENTS_BENCHMARK_PROVIDER` or a rule in `selectRequirementsProvider`;
   set `POLICY_DECIDED`.
3. Update `routes/requirements.golden.test.ts` in the same commit and say what
   changed for students.
4. Run the audit. Students' edits whose requirement changed are flagged for review
   by the overlay; none is overwritten.

Notes for each candidate:

- **Bulletin / cohort Bulletin.** Return the tree for a program and edition, with
  the exact edition in `sourceVersion`. Two editions of one program can coexist
  (`Biology 2024`, `Biology 2026`) because the edition is data, not part of the
  UI. Do not choose the edition from the student's entry year without an explicit
  policy: curriculum rights can be more involved.
- **Degree Checksheet.** Reference a canonical, published checksheet by
  `sourceDocumentId` and record its curriculum year. A student's private upload
  must never define anyone else's requirements. Checksheets and the sidebar stay
  separate systems (annotations are not touched).
- **APR.** May become comparison or status data. It is not a structural definition
  unless the professor says so; the contract does not prevent that later.
- **Composite.** Provenance is per item, so different items can come from
  different sources without changing the sidebar.

## Defects found along the way

The audit, and reading the code to write the source map, found three real defects.
Each is fixed at its root, tested, and listed here because it changes something:

1. **University Core area names appeared inside every major.** `getMajorRequirements`
   deliberately ends with an informational "University Core (areas)" group whose
   entries are area _names_ with a fake course code ("Critical Thinking &
   Writing 1"). It exists for the graduation-paths page, and the function's own
   totals already exclude it. The sidebar flattened it into every major group, so
   all 50 majors listed 18 or 19 Core "requirements" (19 when the program needs the
   language sequence) that no course could satisfy, duplicating the real University
   Core group above. They are no longer put in the major group. This is the
   Core-among-major-requirements the professor noticed. The golden snapshots were
   updated; the diff is exactly those lines and nothing else (nothing added,
   nothing reordered).
2. **Duplicate requirement ids.** Mathematics and Computer Science (B.S. Arts &
   Sciences) list MATH 11–14 under two headings, so two items in one group shared an
   id (a React key collision and an ambiguous anchor). The first keeps its id (no
   saved plan is affected); the second gets `-2`. The double listing itself is an
   academic question and is in the audit.
3. **Only ten planned courses counted.** The list of planned courses was parsed with
   the helper meant for the short list of proposed majors and minors, which stops at
   ten. A plan with more than ten courses had every later course ignored when
   marking Core requirements "planned". Now up to 500. (Completion was never
   affected: only "planned".)

## The decision that remains

> Which source is the requirements sidebar benchmarked against: the current
> Bulletin, the Bulletin of the student's matriculation year, the department
> checksheet for the student's curriculum year, the Academic Progress Report, or a
> controlled combination? If a combination, which source wins where they disagree?
> And: should each major record its own edition, since today a major's group takes
> the University Core's?
