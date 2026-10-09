# Biology proofing (Provost demo), 2026-10-09

## Source

SCU **2026-27 Undergraduate Bulletin**, Chapter 3, Department of Biology, "Requirements for the Major"
(<https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html>), fetched 2026-10-09. This is
the edition CampusVal's requirements baseline is registered for (`REQUIREMENTS_BULLETIN_EDITION` default `2026-27`). The
requirement paragraph is kept word for word in `BIOLOGY_STRUCTURE.sourceText` (`artifacts/api-server/src/data/major-structures.ts`)
and every course list is checked against it by a test.

## What the Bulletin requires

- BIOL 1A, 1B, and 1C
- CHEM 11, 12, 31, 32, and 33
- PHYS 11, 12, 13 **or** PHYS 31, 32, 33
- MATH 35 and 36 (recommended) **or** MATH 11 and 12
- BIOL 101
- Seven approved upper-division biology courses, including five with a laboratory component: one course from each Upper
  Division Theme (CMB, EEB, MOD), all with laboratory, plus at least four electives, at least two with laboratory, from the
  Theme or Specialty courses. A Justice and Equity in Science (JES) course is strongly recommended for one elective.
- Theme courses: CMB 110, 112, 113, 115, 122, 174, 175 · EEB 120, 134, 151, 156, 158, 165, 173, 180, 181 · MOD 117, 160, 170,
  172, 178 · JES 102, 169, 171
- Specialty courses with lab: 104, 114AW, 116, 123, 124, 142AW, 144, 176, 177, 191, 198 (faculty mentor)
- Specialty courses, lecture only: 105, 106, 111, 119, 145, 153, 164, 179, 189, CHEM 141, 142

The course listings confirm every CMB, EEB and MOD course is lecture-and-laboratory ("L&L"), so "one from each theme, all with
laboratory" holds; BIOL 102 is the only JES course with a laboratory.

## Bulletin vs. CampusVal before this pass

| | Bulletin 2026-27 | CampusVal (flat recipe) |
| --- | --- | --- |
| Chemistry | CHEM 11, 12, 31, 32, 33 | CHEM 11, 12, 31, 32 — **CHEM 33 missing** |
| Physics | PHYS 11-13 **or** PHYS 31-33 | PHYS 11, 12 — **PHYS 13 and the 31-33 alternative missing** |
| Mathematics | MATH 35+36 (recommended) or MATH 11+12 | a generic "Math sequence" MATH 35, 36 — **no alternative** |
| BIOL 101 | required | **missing** |
| Upper division | 3 theme courses (CMB/EEB/MOD, lab) + 4 electives (2 with lab) from the Theme/Specialty lists | six fixed courses BIOL 172, 174, 178, 180, **184, 188** — no themes, no electives, no lab rule |
| Course lists | named per theme and per specialty group | none |

BIOL 184 is not in the Bulletin or the catalog (it was silently filtered out of the sidebar); BIOL 188 is in the 2025-26 catalog
but no 2026-27 Biology requirement names it. Neither appears now.

**Why the themes were missing:** the major recipes (`graduation-paths.ts`) can only say "these lower-division courses, these
upper-division courses". Choice structures could not be expressed, so the Biology recipe was a hand-picked list. The department's
own Biology checklist rows "UD BIOL CMB THEME w/ Lab", "EEB THEME w/ Lab", "MOD THEME w/ Lab", "ELECT/THEME w/ Lab" ×2 and
"Elective (any UD BIOL, CHEM 141, 142)" could not be anchored by the note importer for the same reason; they sit in the unmapped
queue (their text is only "Theme" / "With Lab", which the structure now states, so they can be archived).

## What CampusVal shows now

A generic structured form for majors (`MajorStructure`: each / choose N from named lists / alternatives) with deterministic
allocation, so a course counts toward one requirement only (a second CMB course becomes an elective). Biology is the first
program in it; every other major is unchanged.

**Major Requirements — Biology** (category MAJOR; source line names the 2026-27 Bulletin, verified 2026-10-09)

- *Biology, chemistry, physics and mathematics*: BIOL 1A, 1B, 1C; CHEM 11, 12, 31, 32, 33; Physics (PHYS 11, 12, 13 or PHYS
  31, 32, 33); Mathematics (MATH 35 and 36 (recommended) or MATH 11 and 12); BIOL 101
- *Upper-division themes — one course from each, all with laboratory*: CMB theme (choose 1 of 7), EEB theme (choose 1 of 9),
  MOD theme (choose 1 of 5)
- *Upper-division electives — four, at least two with laboratory*: Electives with a laboratory component (choose 2 of 33),
  Electives, with or without laboratory (choose 2 of 46; JES strongly recommended)

Every choice requirement opens its full course list, grouped by the Bulletin's own list names, with catalog titles, units, an Add
button and "Counted (completed / planned)". Stable keys: `major:biology#theme-cmb`, `#theme-eeb`, `#theme-mod`,
`#electives-lab`, `#electives-any`, `#physics`, `#mathematics`, `#biol-101`, `#chem-33`, and the unchanged course keys
(`#biol-1a`, `#chem-12` …) that existing Department Notes anchor to.

**Core vs Major:** the University Core stays in its own CORE group; 0 Core items under Major (audit and browser check). The
Biology Department Notes on Core requirements (Arts, Natural Science, RTC 3, Pathways, Second Language, Mathematics) stay on
those Core requirements, labelled "Biology", and show only on plans that include Biology.

## Course existence (every Biology course reference)

| Code | Result |
| --- | --- |
| BIOL 114AW, BIOL 142AW | were missing; added from the Bulletin's own course listings by `import:bulletin-courses` (5 units each, title verbatim) |
| BIOL 115 | in the catalog under its 2025-26 title "Human Reproduction and Development L&L"; the 2026-27 Bulletin titles it "Animal Development L&L". Flagged on the CMB list; not silently changed |
| BIOL 181 | catalog title carries a "(NEW)" marker from the 2025-26 scrape; the Bulletin title is "Marine Biodiversity L&L". Cosmetic; flagged here |
| BIOL 189 | the specialty list names "189"; the course listings describe **189A** and **189B** (2 units each). CampusVal keeps "BIOL 189" as written and says so on the list. **Department to confirm.** |
| all other 60 codes | present in the catalog |

## Checksheet vs. Bulletin

The CAS Biology checklist describes the last two electives as "any UD BIOL, CHEM 141, 142". The Bulletin limits electives to
the Theme or Specialty courses. The Bulletin wins for structure; the checklist wording can be kept as a Department Note if the
department wants it shown.

## Regression tests

- `data/major-structures.test.ts`: semantic fixture `__fixtures__/requirements/biology-2026-27.semantic.json` (keys, rules, counts,
  course sets — not wording), each list parsed back out of the Bulletin text, 7 upper-division with 5 lab, catalog existence,
  allocation rules.
- `routes/requirements.biology.test.ts`: sections, theme course lists, Core kept out of Major, stable keys.
- `lib/department/department-layer.test.ts`: a "PHYS 11/31" checklist row now anchors to the physics alternatives requirement
  (both codes belong to exactly that requirement).

## Global audit after the change

`pnpm run audit:requirements`: 50 majors, 71 minors, 46 concentrations; **0 errors, 0 classification errors**; 72 warnings (70
`course_not_in_catalog` in other programs, unchanged from 2026-10-06 and listed in `catalog-gaps-2026-10-06.md`), 15 info. With
`--db` on the QA database: no note, override or student-customization key points at a requirement that no longer exists.

## Open items for the Biology department

1. BIOL 189 vs 189A/189B in the specialty list.
2. Whether the checklist's "any UD BIOL, CHEM 141, 142" electives should be shown as a Department Note.
3. Review the imported Biology notes (225 imported across programs are still marked "not yet reviewed by the department").
