# Engineering four-year-plan matrix

Professor feedback (2026-09 pass): "ALL undergraduate Engineering degrees that
have an official SCU department/school four-year plan or prescribed/
recommended sequence" should be preloadable into Degree Plan, and CampusVal
must never fabricate a plan for a major that doesn't publish one.

This is the complete matrix of every current undergraduate School of
Engineering major CampusVal exposes (`getAvailableMajors()` filtered to
`college: "SOE"`), whether SCU publishes an official four-year plan for it,
and whether CampusVal has reconciled that plan closely enough to preload it.
Code: `artifacts/api-server/src/data/graduation-paths.ts`. Tests:
`artifacts/api-server/src/data/graduation-paths.engineering-matrix.test.ts`.

| Major (code) | Official SCU 4-year source? | `sequenceTrust` | Preloadable? | Source | Last verified |
| --- | --- | --- | --- | --- | --- |
| Computer Science & Engineering (`CSE`) | Yes | `prescribed` | **Yes** | [CSE Course Plan](https://www.scu.edu/media/school-of-engineering/pdfs/CSECoursePlan-Standard.pdf) | 2026-08-16 |
| Electrical and Computer Engineering (`ECEN`) | Yes | `prescribed` | **Yes** | [ECEN 4-Year Plan](https://www.scu.edu/media/school-of-engineering/ECEN-4-YR-Plan-2026.pdf) (dated 4/30/26) | 2026-09-17 |
| Electrical Engineering (`EE` / SCU "ELEN") | Yes | `prescribed` | **Yes** | [ELEN 4-Year Plan](https://www.scu.edu/media/school-of-engineering/ELEN-4-YR-Plan-2026.pdf) (dated 4/30/26) | 2026-09-17 |
| Civil, Environmental and Sustainable Engineering (`CENG`) | Yes | `prescribed` | **Yes** (MATH 11 track) | [CESE 4-Year Planning Guide](https://www.scu.edu/media/school-of-engineering/pdfs/civil-engineering/CESE_4yearPlan_MATH11_2026.pdf) | 2026-09-17 |
| Bioengineering (`BIOE`) | Yes | `prescribed` | **Yes** (Biomolecular track) | [BIOE 4-Year Plan — Biomolecular](https://www.scu.edu/media/school-of-engineering/pdfs/bioengineering/BIOE-4-Year-Plan_Biomolecular-track_2027-1.pdf) (Rev. 5/24/2024) | 2026-09-17 |
| Web Design and Engineering (`WDE`) | Yes | `prescribed` | **Yes** | [WDE Course Plan](https://www.scu.edu/media/school-of-engineering/pdfs/WDECoursePlan-Standard.pdf) (last modified 1/16/2024) | 2026-09-17 |
| Mechanical Engineering (`MECH`) | Yes | `prescribed` (2026-10-06) | **Yes** | [MECH Curriculum Flow Chart](https://www.scu.edu/media/school-of-engineering/pdfs/current-student-resources/undergraduate/2023-24-Four-Year-Plan-MECH.pdf) (AY23-24) | 2026-09-17 |
| General Engineering (`GENR`) | Yes | `prescribed` (2026-10-06) | **Yes** | [General Engineering Sample 4-Year Plan (MATH 11+)](https://www.scu.edu/media/school-of-engineering/pdfs/current-student-resources/undergraduate/GENG_4-yrPlans_AY24-25--Math-11.pdf) | 2026-09-17 |

**Result: 8/8 current undergraduate School of Engineering majors have an
identified official SCU source; 6/8 are fully preloadable (`prescribed`);
2/8 have an official source linked but are honestly marked not-yet-preloadable
(`recommended`).**

> **Update 2026-10-06.** MECH and GENR are now `prescribed`. Their official PDFs, rendered and read, are grids whose rows are the quarters of each year, so every course
> sits in a stated quarter (arrows only show prerequisites); they were transcribed course by course (ENGR 193, ENGR 163A/B and MECH 142 are printed by the sources but absent
> from the 2025-26 catalog snapshot, and load as placeholders). All 8 School of Engineering majors are now official and preloadable. The section below is the earlier reasoning.

## Why MECH and GENR were "recommended" and not "prescribed"

Every other Engineering major's official source is a per-quarter *table*
(row = quarter, column = course) that can be transcribed unambiguously. MECH's
and GENR's official sources are prerequisite **flow charts** — boxes connected
by prerequisite/corequisite arrows, without a simple row-per-quarter layout.
Course *placement into a specific quarter* in a flow chart requires judgment
calls that a table doesn't, and getting that judgment call wrong would mean
CampusVal auto-inserting a course into the wrong quarter of a real student's
Degree Plan. Per the no-fabrication rule, CampusVal keeps these two as
`recommended` (their official source is linked and shown to the student, and
the major's page states plainly that no preloadable sequence is available yet)
rather than guessing a quarter-by-quarter placement from the chart. A
maintainer who carefully reconciles a flow chart against a specific admit-year
class (matching the precedent already set by CSE, ECEN, EE, CENG, and BIOE)
can promote either one to `prescribed` — that is a data change in
`graduation-paths.ts`, not an architecture change.

MECH and GENR also each have additional official variants at the same source
directory (a MATH 9 track for both, plus a transfer-student track for GENR and
a study-abroad variant for MECH) that are not separately encoded.

## Majors with no official four-year-plan source at all

`ENGPHYS` (Engineering Physics) is listed under the College of Arts and
Sciences, not the School of Engineering, despite the name — it is out of
scope for this SOE matrix. Every other CAS/LSB major without a linked source
(e.g. `BCHM`, `BCHM_ACS`, `CHEM_BA`, `ENSC`) uses the generic recipe generator
and is truthfully labeled `sequenceTrust: "example"` — an illustration, never
offered as preloadable. `AMTH` (Applied Mathematics) is deliberately **not** a
standalone major in this catalog: SCU's Department of Applied Mathematics
offers only graduate degrees and a combined B.S./M.S. option; there is no
standalone undergraduate B.S. in Applied Mathematics (re-verified 2026-09-17
against the live SCU Bulletin and the department's own program page — do not
re-add it without a Bulletin citation showing SCU created one).

## How preloading works (unchanged, verified during this pass)

`FourYearPreload.tsx` is major-agnostic — it renders whatever
`/api/graduation-paths/four_year_index` returns and only offers the one-click
"Add N courses" action when `sequenceTrust === "prescribed"`. Adding the five
new prescribed majors required **zero frontend changes**; the existing
provider/consumer split already generalizes correctly. Preloading:

- is a deliberate, confirmed action (a dialog showing the source, catalog
  year, and last-verified date before the student clicks "Add N courses"),
- never duplicates existing plan items (the add-item API reports duplicates
  as `skipped`, not overwritten),
- maps each quarter to `profile.startYear + (year - 1)` so term/year mapping
  follows the student's own entry year, and
- never fills open Core/elective placeholder slots with an invented specific
  course (see the `Core: ...` / `<X> Elective` / `Free Elective` strings in
  each plan, filtered out by `FourYearPreload`'s `isRealCourseCode` regex).
