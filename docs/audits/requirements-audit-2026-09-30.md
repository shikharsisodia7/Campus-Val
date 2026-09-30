# Requirements audit, 2026-09-30

Run at the head of the customization branch with `pnpm run audit:requirements --out docs/audits`.
Source in use: `current_bulletin`. Nothing here was changed to make a warning go
away.

## What was audited

| | |
| --- | --- |
| Majors | 50 |
| Minors | 71 |
| University Core / school groups (once per school, not once per major) | 6 |
| Requirement groups | 127 |
| Requirements | 994 |
| Groups missing provenance (no address, edition or date) | 0 |

## Result

**0 errors. 125 findings: 110 warnings, 15 info.** Every finding is either a data-coverage
gap or an academic-content question. None is a code or data-integrity defect.

| Category | Code | Count | Severity |
| --- | --- | ---: | --- |
| data_integrity | `course_not_in_catalog` | 108 (89 distinct codes) | warning |
| academic_content | `course_listed_twice_in_group` | 7 | info |
| academic_content | `listed_in_school_and_major_groups` | 8 | info |
| academic_content | `group_has_no_requirements` | 1 | warning |
| academic_content | `minimum_exceeds_listed_courses` | 1 | warning |
| missing_provenance | (any) | 0 | |

## Fixed because it was objectively wrong

The first run (before the fixes) reported **2,393 findings, 15 of them errors**. The
root causes, all fixed and tested (details in [`../REQUIREMENTS_SOURCE.md`](../REQUIREMENTS_SOURCE.md#defects-found-along-the-way)):

- **University Core area names inside every major group.** All 50 majors listed 18 or 19
  Core area names as if they were major courses (with fake course codes): about 2,260
  of the 2,393 findings, from one cause. Fixed at the route; the golden snapshots were
  updated with exactly those lines removed and nothing else changed.
- **Duplicate requirement ids** (7, plus 7 duplicate stable keys, all MATH 11-14 in
  Mathematics and Computer Science B.S. Arts & Sciences): ids are now unique.
- **Malformed rule**: Creative Writing minor "asks for 2, lists 1" was first reported
  as an error. On reflection it is an SCU-policy question (repeatable workshop?), so it
  moved to `academic_content` and is unchanged.

## For the professor (academic content)

1. **`group_has_no_requirements`: French & Francophone Studies (FREN).** All 10
   required courses (FREN 1, 2, 3, 21A, 21B, 110, ...) are absent from the course
   catalog snapshot, so the major shows an honest empty group with a note. The catalog
   needs those courses, or the recipe needs correcting.
2. **`minimum_exceeds_listed_courses`: Creative Writing minor, "Creative writing
   workshops".** Requires 2 courses, lists 1. Is the workshop repeatable, or is the
   list incomplete?
3. **`course_listed_twice_in_group`: Mathematics and Computer Science (B.S. Arts &
   Sciences).** MATH 11, 12, 13, (14) appear under both "Math sequence" and "Major
   lower-division requirements". The recipe double-counts them in `totalListed`.
4. **`listed_in_school_and_major_groups`: the 8 Leavey majors.** The 12 Common
   Curriculum courses (BUSN 70, OMIS 15, ECON 1-3, ...) appear in both the school
   group and each major group. This looks intended (the Bulletin lists the Common
   Curriculum under each major) and is preserved.

## For catalog owners (course codes the catalog does not have)

`course_not_in_catalog`: the requirement names a course that is not in the course
catalog snapshot, so the sidebar shows a chip that cannot be added to a plan. These
are **not** renames or case mismatches that could be corrected mechanically; each is
either a real course missing from the snapshot or a code to verify against the
Bulletin. No substitution was made. (Majors do not appear below because
`getMajorRequirements` already drops a missing course and lists it in a note on the
group; the gaps below are in minors and in the Leavey Ethics item.)

- **Aerospace Engineering (AERO-MIN)**: MECH 121R
- **African American Studies (AFAM-MIN)**: ETHN 31, ETHN 35, ETHN 55
- **Arts Management (ARTM-MIN)**: MKTG 190
- **Asian American Studies (ASAM-MIN)**: ETHN 52, ETHN 55
- **Bioengineering (BIOE-MIN)**: CSEN 44, PHIL 27, TESP 157
- **Biotechnology (BTEC-MIN)**: BIOL 189A, BIOL 189B
- **Business Analytics (ANLY-MIN)**: OMIS 163, OMIS 164
- **Catholic Studies (CTHL-MIN)**: ASCI 150
- **Chinese and Sinophone Studies (CHIN-MIN)**: CHIN 100, CHIN 101, CHIN 102, CHIN 103, CHIN 23
- **Classics and Ancient Studies (CLAS-MIN)**: ARTH 106, ARTH 110
- **Computer Engineering (CSEN-MIN)**: CSEN 21
- **Computer Science and Engineering (CSCI-MIN-SOE)**: CSEN 21
- **Construction Management (CNST-MIN)**: CENG 189, FNCE 129
- **Creative Writing (CWRT-MIN)**: ENGL 179AW, ENGL 91
- **Digital Filmmaking (DFLM-MIN)**: COMM 130A, COMM 140B, COMM 140C, COMM 140Q, COMM 140W
- **Entrepreneurship (ENTR-MIN)**: BUSN 197, ENVS 148, HRNS 120A, MKTG 175, PHSC 157, SOCI 172
- **Ethnic Studies (ETHN-MIN)**: ETHN 20
- **French & Francophone Studies (FREN-MIN)**: FREN 101
- **General Engineering (GENG-MIN)**: ECEN 33
- **Geospatial Analysis (GEOA-MIN)**: ENVS 15
- **Gerontology (GERO-MIN)**: GERO 198
- **International Business (INTB-MIN)**: ACTG 11A, ARAB 23, CHIN 23, GERM 100, ITAL 100, MGMT 136, SPAN 23
- **International Studies (INTL-MIN)**: COMM 107A
- **Italian Studies (ITAL-MIN)**: ITAL 100
- **Japanese Studies (JAPN-MIN)**: JAPN 100, JAPN 101, JAPN 102
- **Journalism (JOUR-MIN)**: COMM 142, COMM 160
- **Latina/o/x Studies (LATX-MIN)**: ETHN 20, ETHN 55
- **Leavey School of Business**: MGMT 136
- **Management Information Systems (MIS-MIN)**: PSYC 40
- **Marketing (MKTG-MIN)**: MKTG 175, MKTG 188, MKTG 190, MKTG 194
- **Mechanical Engineering (MECH-MIN)**: MECH 142
- **Music (MUSC-MIN)**: MUSC 128, MUSC 133
- **Musical Theatre (MUTH-MIN)**: THTR 165
- **Organizational, Business, and Professional Communication (OBPC-MIN)**: COMM 129, COMM 153
- **Professional Writing (PWRT-MIN)**: ASCI 198, ENGL 106, ENGL 107
- **Public Health (PUBH-MIN)**: BIOL 11, PSYC 40
- **Real Estate (RLES-MIN)**: FNCE 127, FNCE 128, FNCE 129
- **Retail Studies (RTLM-MIN)**: ACTG 11A, BUSN 198R, COMM 20, MKTG 169, PSYC 40, SOCI 149
- **Spanish Studies (SPAN-MIN)**: SPAN 100, SPAN 101
- **Sustainable Food Systems (SFS-MIN)**: ANTH 5, BUSN 151B, BUSN 183B, BUSN 183C, ELSJ 134, ELSJ 135, MGMT 176, MGMT 40, MGMT 42, POLI 50
- **Theatre (THTR-MIN)**: THTR 41, THTR 42
- **Urban Education (URBN-MIN)**: HIST 182B, PSYC 185EL
Leavey School of Business, University Core: MGMT 136 (Ethics).
