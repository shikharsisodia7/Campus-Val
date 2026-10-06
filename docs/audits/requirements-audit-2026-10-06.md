# Requirements audit, 2026-10-06

Run at the head of the Bulletin-baseline branch with `pnpm run audit:requirements --out docs/audits` (and `--db` against the QA database).
Source in use: `current_bulletin`, edition **2026-27**. Nothing here was changed to make a warning go away.

## What was audited

| | |
| --- | --- |
| Majors | 50 |
| Minors | 71 |
| Concentrations (names on the major; no course lists are loaded for them) | 46, in 15 majors |
| University / Core / school groups (once per school) | 9 (UNIVERSITY, CORE and SCHOOL for each of CAS, LSB, SOE) |
| Requirement groups | 130 |
| Requirements | 1,009 |
| Groups missing provenance | 0 |

## Result

**0 errors. 125 findings: 110 warnings, 15 info. 0 classification errors.**

| Category | Code | Count | Severity |
| --- | --- | ---: | --- |
| data_integrity | `course_not_in_catalog` | 108 (89 distinct codes) | warning |
| academic_content | `course_listed_twice_in_group` | 7 | info |
| academic_content | `listed_in_school_and_major_groups` | 8 | info |
| academic_content | `group_has_no_requirements` | 1 | warning |
| academic_content | `minimum_exceeds_listed_courses` | 1 | warning |
| missing_provenance | (any) | 0 | |

### Core/Major classification

New checks this pass: `core_requirement_under_major`, `university_rule_under_major`, `major_requirement_under_core`, `core_item_without_phase`,
`university_rule_with_courses`. Across all 50 majors, the University Core, the three schools and the new University Degree Requirements group:
**0 classification errors found**. The defect the professor demonstrated (Critical Thinking & Writing and the Core areas listed under Major) was fixed at
its root in the 2026-09-30 pass (see `REQUIREMENTS_SOURCE.md`, "Defects found along the way"); this pass makes it permanent: the server sends a canonical
`category`, a unit test asserts CTW and the Foundations / Explorations / Integrations areas are CORE and absent from the MAJOR group for Biology, Psychology,
Computer Science and Engineering and two Leavey majors, and a planted CTW item and a planted "175 quarter units" item are proven to be caught.
No major recipe lists a CTW course (`ctw_course_in_major`: 0).

### The 108 `course_not_in_catalog` warnings

Real, and not new (triage with evidence in [`catalog-gaps-2026-10-06.md`](./catalog-gaps-2026-10-06.md): 57 codes the 2026-27 Bulletin mentions, 32 it does not mention at all): the course catalog is the **2025-26** Bulletin scrape; the requirement data names courses of the **2026-27** Bulletin. Codes such as CHIN 100-103,
ETHN 31/35/52/55, FNCE 127-129, MKTG 175-194 are absent from the catalog snapshot. They need either a catalog refresh from the 2026-27 Bulletin or a correction
of the recipe; neither is guessed here. They are why the Sample Plan importer reports PHYS 20, and why French & Francophone Studies shows an honest empty group.

### Department layer and Sample Plans (QA database, `--db`)

| | |
| --- | --- |
| Department Notes | 225 published, 2 draft, 179 unmapped (406 imported from 30 of the 40 real CAS checklists) |
| Findings | 225 `note_published_unreviewed` (info: students see them labelled "not yet reviewed"), 179 `note_unmapped` (info: waiting for a person) |
| Global overrides | 0 |
| Sample plans | 157 plans, 2,107 items; 2 `sample_plan_course_not_in_catalog` (PHYS 20) |
| Errors | 0 |

## For the professor and the departments (academic content)

Unchanged from 2026-09-30 (French catalog gap, Creative Writing minor "asks for 2, lists 1", the Mathematics and Computer Science double listing, the Leavey
Common Curriculum listed in both the school and major groups), plus:

1. **145 unmapped note candidates** (e.g. Biology's "UD BIOL CMB THEME w/ Lab 1: Theme"): rows with no course the recipe can match. They need a person to place them
   or discard them (Program Requirements Admin > Needs review).
2. **15 checklists not imported**: titles that match no CampusVal major exactly (Studio Arts / Studio Art, Gender and Sexuality Studies / Women's & Gender Studies,
   Ancient Studies, Classical Studies, French and Francophone Studies, Dance), checklists with no "<Program> Major Requirements" table (Biochemistry, the two Chemistry degrees,
   the two Public Health checklists, Classics Minors) and two for earlier curricula. Whether a name is the same program is the department's to confirm.
3. **Imported notes** are published unreviewed and labelled so; each department should review its own.
