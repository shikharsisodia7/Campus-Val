# Multi-school Planning Requirements and the Leavey Business Core

_2026-10-20. Professor review: "Any Leavey School of Business major must bring the Business Core into the left Planning
Requirements sidebar, including as a second / additional / Tentative major, and with CAS or Engineering majors."_

Planning Requirements is a planning view. Workday's Academic Progress Report is the definitive reference for degree completion.

## The rule

1. **Any selected Leavey (LSB) major activates the Leavey School of Business requirements** (the business core), whether it is
   the primary major, `secondMajor`, an additional major, a plan's scenario major, or a Tentative Degree Plan's major.
2. **Schools compose; one never replaces another.** A plan's schools are the SET of schools its MAJORS belong to, primary
   first, each once. Each school has exactly one SCHOOL group. Biology + Finance shows the College of Arts and Sciences
   requirements AND the Leavey requirements.
3. **University Core is singular.** One `university_core` group for every plan. A school's statements about how its students
   fulfil a Core area are **annotations on the Core item** (category stays `CORE`), not a second Core.
4. **Minors never add a school.** A business minor (MIS, Marketing, Real Estate, ...) does not bring the Leavey core; the
   Bulletin requires the core of business majors.
5. **School identity comes from the program catalog** (`getMajorCollege`), never from a course prefix or a list of major
   names: Leavey Economics (`ECON`) brings the core; CAS Economics (`ECON_CAS`) does not. Every current and future LSB major
   inherits the core automatically.
6. **An unknown major's school is never guessed.** An additional major missing from the catalog adds no school and the
   response carries a `schoolWarnings` entry; an unknown *primary* major keeps the school chosen at onboarding (the student's
   own record, `basis: "profile_college"`), with a warning, and the event is logged (`requirements_major_school_unknown`).

## Root cause of the reported bug

`buildRequirementsResponse` (`artifacts/api-server/src/routes/requirements.ts`) derived ONE `collegeCode` from the effective
primary major (or the profile's college), and `buildRequirementGroups(collegeCode)` returned `{ university, universityCore,
college }`: exactly one school group, and a University Core whose Leavey mappings were written in only when
`college === "LSB"`. Second, additional and scenario majors never influenced the schools, so a Biology profile with Finance as
an additional (or tentative scenario) major got CAS requirements only: the Leavey core and every Leavey Core mapping were
missing, and Finance looked like four courses.

## The new composition

```
buildRequirementsResponse(profile, scenarioMajors, scenarioMinors, goals, plannedCourses, primaryMajor)
  majors   = [effective primary, secondMajor, additionalMajors..., scenario majors...]  (deduped, primary first)
  schools  = majors.map(getMajorCollege) -> distinct, primary first            -> response.schools
  programs = { majors: canonical codes, minors: canonical codes }             (program-specific routes)
  buildRequirementGroups(collegeCode, schools, programs)
    -> university (one)
    -> universityCore(collegeCode)              ONE group; collegeCode only decides the Core's own school rules
    -> schools.map(collegeGroup(school, programs))   one SCHOOL group per school
    -> schoolCoreFulfillments(schools, programs)     overlays for the one Core
```

Group order keeps the professor's earlier ordering (fundamentals first, extras last):
primary major, University Core, the school groups (primary school first), University Degree Requirements, additional majors,
minors, Professional Preparation.

`collegeCode` keeps its old derivation (the primary major's school): it keys the Core's stable key
(`university-core:<code>`) and manual completions, so no student customization or completion moved.

### API (`DegreeRequirementsResponse`)

| Field | Meaning |
| --- | --- |
| `schools[]` | `{ code, name, majors, primary, basis }`, one per school, primary first |
| `schoolWarnings[]` | a plan major whose school CampusVal does not know |
| `groups[].school` | SCHOOL groups only: `{ code, name, activatedBy: [major titles] }`; null elsewhere |
| `groups[].items[].annotations[]` | Core items only: a school's fulfillment statement (below) |

Every consumer reads `groups`, so all of them pick up the extra SCHOOL group with no change: Degree Plan and Tentative Degree
Plan sidebars (`Palette.tsx`), placeholder eligibility (`POST /plans/:id/items/:itemId/replace` finds the item by id in any
group), the department layer and Program Requirements Admin trees, Degree Checksheets "Add to Planning" (web and mobile
pickers list every group), advisor plan shares (same plan request; no APR or checksheet is exposed), and the audit. Quarter
Planning does not read the sidebar: a business core course placed in the Degree Plan is an ordinary plan course.

## The Leavey business core (SCHOOL group `college-lsb`)

**Source:** SCU 2026-27 Undergraduate Bulletin, Chapter 4, "Leavey School of Business Core Curriculum" (lower division,
upper-division Common Core of Knowledge, MGMT 162 capstone). Verbatim text is stored in
`artifacts/api-server/src/data/majors/bulletin-text-2026-27.json` under `LSB`. Not from any student-uploaded or department
checksheet.

19 requirements, stable ids `lsb-busn70`, `lsb-omis15`, `lsb-busn85`, `lsb-econ1`, `lsb-econ2`, `lsb-econ3`, `lsb-mgmt71`,
`lsb-mgmt72`, `lsb-actg11`, `lsb-actg12`, `lsb-omis40`, `lsb-omis41`, `lsb-omis34`, `lsb-mgmt196`, `lsb-fnce121`,
`lsb-mgmt160`, `lsb-mktg181`, `lsb-omis108`, `lsb-mgmt162` (stable keys `college-lsb#<id>`).

Program-specific routes, from the Bulletin's own words, chosen from the plan's programs:

| Requirement | Everyone | Only for |
| --- | --- | --- |
| Information Systems (`lsb-omis34`) | OMIS 34 | + ACTG 134 for Accounting majors; + OMIS 30 / OMIS 31 for MIS majors or minors and AIS majors |
| Data Analysis 2 (`lsb-omis41`) | OMIS 41 | Leavey Economics majors: OMIS 41, **or ECON 41 and ECON 42** (both); a lone ECON 41 does not complete it |

Finance Major Requirements contain only Finance's own requirements (the major structures already leave the Leavey core out;
the audit's `school_requirement_categorized_as_major` check fails if an `lsb-*` item appears in a major group). The Economics
major lists ECON 1, 2, 3 itself because its Bulletin text does ("ECON 1, 2, AND 3"); the audit reports that overlap as
information. The FNCE 186 count-once rule in the Finance major is unchanged (department question, below).

## University Core: Leavey fulfillment annotations

**Source:** the Leavey School of Business Core Curriculum page, https://www.scu.edu/business/undergraduates/core/ (the page
states no academic year), read and compared with this data on **2026-10-20**. Data: `LEAVEY_CORE_FULFILLMENTS` in
`artifacts/api-server/src/data/degree-requirements.ts`. Each carries source label, URL, year statement and verification date.

Verified statements: **8 Core areas** carry a Leavey annotation, 7 of them naming courses (Natural Science is guidance only):

| Core area | Leavey statement | Course routes | Also a Leavey requirement |
| --- | --- | --- | --- |
| Mathematics | MATH 30 or MATH 11 (MATH 35 for business majors with a second major in the life sciences) | MATH 30; MATH 11 | — |
| — Finance majors | MATH 11 or MATH 30, and MATH 12 or MATH 31 or FNCE 186 (the second course is in the Finance major) | text only | — |
| — Economics majors | MATH 11 or MATH 30, and MATH 12 or MATH 31 | text only | — |
| Civic Engagement | MGMT 162 and MGMT 136 (or MGMT 6) or PHIL 109 | MGMT 162 **with** one of MGMT 136 / MGMT 6 / PHIL 109 | MGMT 162 (`lsb-mgmt162`) |
| Cultures & Ideas 3 | MGMT 80 on the SCU campus; otherwise the approved list | MGMT 80 | — |
| Ethics | MGMT 136 (preferred, or MGMT 6) or PHIL 109 | each | — |
| Natural Science | with lab, from the approved list | text only | — |
| Science, Technology & Society | OMIS 34 | OMIS 34 | `lsb-omis34` |
| — Accounting majors | ACTG 134 | ACTG 134 | `lsb-omis34` |
| — MIS majors and minors | OMIS 30 / 31 for the business core; STS from the approved list | text only | — |
| Social Science | ECON 1 | ECON 1 | `lsb-econ1` |
| Advanced Writing | BUSN 179 | BUSN 179 | — |

The Business Core courses that themselves satisfy a Core area are therefore ECON 1 (Social Science), OMIS 34 / ACTG 134
(STS) and MGMT 162 (part of Civic Engagement). The others (MATH 30/11, MGMT 80, MGMT 136 / MGMT 6 / PHIL 109, BUSN 179) are
courses Leavey prescribes for a Core area that are not in the business core list. No fixed count was assumed.

### Status: annotation is not completion

- A route completes the Core area only when **every part** has a completed course; it is **planned** when every part is
  completed or planned; otherwise the area stays **open** and shows the annotation. Choosing a Leavey major completes nothing.
- A completed or planned course that the statement names is an explicit SCU mapping: it is not repeated in
  `crossSatisfiedBy` ("confirm this Core designation"), and `needsVerification` is false where the statement is the area's
  requirement (Mathematics, Civic Engagement, Ethics, Social Science, Advanced Writing). C&I 3 and STS keep needing
  verification, as before (off-campus MGMT 80; MIS route).
- A course the statement does not name still gets the existing catalog-tag match, flagged for verification. A heuristic is
  never upgraded to an explicit mapping.
- One course can satisfy the Leavey requirement and the Core area at once (ECON 1) where SCU says so; that is why the Core
  item names it and the Leavey item is separate. The sidebar shows the route course under "Or add course", so a student who
  already has ECON 1 planned sees both as planned and is not pushed to a duplicate.

Civic Engagement changed: the old Leavey Core counted MGMT 162 alone; the page requires MGMT 162 together with an ethics course.

## Sidebar presentation

- SCHOOL groups use the existing School category (icon + violet tint; the label is now "School", was "College/School") and a
  one-line subtitle under the title: "Required for Leavey business majors · Finance (B.S. Commerce)", or
  "School requirements · Biology".
- Every group is its own accordion item (`aria-expanded`), collapsed by default.
- Core annotations render under the Core item in the Department Note idiom (quiet surface, solid left rule, building icon,
  school tint), status and overlap in words ("Completed on this route", "Also a Leavey School of Business requirement"), the
  source behind a "Source" disclosure button. Students have no control that edits them; they are not Department Notes and
  not in any student's edit set. A student's My Note / hide / custom requirement stays plan-scoped and keyed by stable key, so
  hiding a Biology item never touches Finance or the Leavey core (tested).

## Audit

`pnpm --filter @workspace/api-server run audit:requirements` builds every major alone, a cross-school matrix (BIOL+FNCE,
FNCE+BIOL, MECH+FNCE, FNCE+MECH, FNCE+MKTG, BIOL+MECH, CSCI+ACTG, ECON_CAS+ECON) and a business minor beside Biology, and
checks: `lsb_major_missing_school_group`, `lsb_group_without_lsb_major`, `school_groups_mismatch`, `duplicate_school_group`,
`university_core_duplicated`, `school_requirement_categorized_as_major`, `core_annotation_outside_core`,
`major_school_unknown`. Result on 2026-10-20: **59 plans, 0 errors**.

## Open questions for SCU (not decided in code)

- Which Pathway count applies to a student whose majors span Engineering and another school (the Core's school-dependent
  rule follows the primary major, as before).
- AIS majors' Science, Technology & Society route (the Leavey page names Accounting and MIS only).
- FNCE 186 counting toward two Finance requirements (counted once; the student is told to confirm).
- Whether MATH 35 applies for a particular life-science second major (shown as the page's words; not counted automatically).

## Tests

- `artifacts/api-server/src/routes/requirements.multi-school.test.ts` (55): Finance; Biology+Finance both orders;
  `secondMajor`; the composition matrix; two Leavey majors; SOE+LSB; Leavey vs CAS Economics; tentative primary and scenario
  majors; add / remove; business minors; every Leavey major and every non-Leavey major; completion (completed / planned / open);
  Core overlaps (ECON 1 completed, BUSN 179 planned and open, Civic Engagement parts); Accounting, MIS and Economics routes;
  unknown majors; stable keys; edit isolation; the audit (clean, and planted defects caught).
- `artifacts/scu-advising/src/components/degree-plan/Palette.multi-school.test.tsx`: both school groups and their subtitles,
  one Core, collapsed accordions, annotation text / status / source disclosure, no student edit controls.
- Golden snapshots (`requirements.golden.test.ts`) and the 2026-27 Bulletin snapshot were regenerated; the snapshot now
  records annotations and stores a program variant of a shared group (`college-lsb|<program>`) when its content depends on
  the program.
