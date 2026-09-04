# Data Provenance

CampusVal is a planning tool, not an official university system. Every piece
of academic data it shows traces back to one of three official SCU sources,
and every dataset records where it came from and when it was last checked.
Nothing here is invented — where SCU's own source says "choose from an
approved list" instead of naming exact courses, CampusVal says so rather
than fabricating a list.

## Source authority

| Source | Authoritative for |
| --- | --- |
| **Workday Student** (`myworkday.com/scu`) | A student's actual academic record: completed courses, grades, registration, live seat counts, the official degree audit. |
| **SCU Registrar** (published + tentative schedules) | Which sections exist in a given quarter, meeting times, and (once published) instructors/rooms. |
| **SCU Undergraduate Bulletin** (`scu.edu/bulletin`) | Course descriptions, prerequisites, and program (major/minor/concentration) requirements. |
| **CampusVal** | None of the above — a planning workspace that reads and cites the three sources above. It never overrides them. |

## Where provenance is recorded in code

- **Course catalog** — `artifacts/api-server/src/data/courses.ts` /
  `courses-data.json`. Header comment records the Bulletin source and the
  scrape date for the whole file.
- **University Core / College requirements** —
  `artifacts/api-server/src/data/degree-requirements.ts`. Every
  `RequirementGroupDef` carries `sourceUrl`, `sourceLabel`, `academicYear`,
  and `lastVerified`. Items SCU itself only describes generically (not an
  exact course list) are marked `needsVerification: true` with an empty
  `courses` array — the UI lets the student check them off manually instead
  of CampusVal guessing.
- **Major/minor/concentration catalog** —
  `artifacts/api-server/src/data/graduation-paths.ts`
  (`MAJOR_RECIPES`/`MINORS`/`MINOR_RECIPES`, plus per-major `concentrations`
  metadata). Every record carries a `GraduationPathProvenance`
  (`sourceUrl`, `catalogYear`, `lastVerified`, `verificationNote`) and a
  `sequenceTrust` tier:
  - `prescribed` — reconciled course-by-course against an official SCU
    four-year plan; eligible for one-click preload.
  - `recommended` — an official source is linked, but CampusVal's generated
    sequence hasn't been reconciled line-by-line; reference only.
  - `example` — no major-specific official source; a generic
    template-generated sequence, illustration only.
  See `docs/SCU_PROGRAM_CATALOG.md` for the current completeness audit and
  open discrepancies.
- **Term-by-term offering evidence** —
  `artifacts/scu-advising/src/lib/course-offering.ts` is the single
  canonical resolver used by both Degree Plan and Tentative Degree Plan (no
  parallel/duplicate offering-check logic). It grades evidence as
  `published` (SCU's published schedule for that exact term — absence is
  real evidence a course isn't offered), `tentative` (Registrar's tentative
  schedule for that exact term), `projected` (no schedule yet for that term;
  falls back to the most recent same-season verified schedule — shown to
  students as "Tentative schedule", never as a confirmed offering, and never
  carrying invented section numbers/instructors/times), or `unknown` (no
  basis at all — said plainly rather than guessed). Academic-year → calendar-
  year conversion goes through the single shared
  `artifacts/scu-advising/src/lib/academic-year.ts`, not ad-hoc `year ± 1`
  arithmetic.
- **Official resource links** (Bulletin, Workday, Registrar, advising
  centers) — `artifacts/scu-advising/src/data/advising-resources.ts`
  (`SCU_BULLETIN_URL`, `OFFICIAL_RESOURCES`), each with `lastVerified`. No
  third-party academic source is ever linked.

## Refreshing data

- **Registrar tentative schedules**:
  `artifacts/api-server/scripts/import-registrar-tentatives.ts` — a
  deterministic importer for Registrar-supplied tentative-schedule
  spreadsheets. Dry-run by default (parses, validates, and prints a report);
  pass `--apply` to write `offered-sections.json`. It never invents
  instructor, room, or an official section number where the source doesn't
  have one. **Known limitation**: it is currently wired to a specific
  term pair (Winter/Spring 2027) rather than being fully year-agnostic —
  extending it to accept an arbitrary target term is a reasonable next
  step, not yet done.
- **Course catalog / program catalog**: no automated refresh pipeline exists
  yet; both are hand-maintained against the live Bulletin, with each change
  keeping the `lastVerified`/`catalogYear` fields honest. This is
  process discipline, not tooling — a future maintainer script that diffs
  the live Bulletin against the catalog would reduce the manual burden.

## Honesty rules this codebase follows

1. If SCU's source doesn't give a concrete answer, CampusVal doesn't invent
   one — it says "needs verification" / "unknown" / points at the official
   source instead.
2. A future term with no SCU schedule yet is never shown as if it were
   confirmed; it's labeled "Tentative schedule" with an explanation, backed
   by the most recent verified same-season data, and never carries
   fabricated section numbers, instructors, or meeting times.
3. Changing or removing an existing major/minor code is treated as a
   backward-compatibility decision (a student may already have selected it)
   requiring deliberate review, not a blind data edit.
4. See `docs/SCU_PROGRAM_CATALOG.md` for the current honest count of
   majors/minors/concentrations represented and any open discrepancies
   pending review.
