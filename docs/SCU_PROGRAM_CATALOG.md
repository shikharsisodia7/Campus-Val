# SCU Program Catalog — Completeness Audit (2026-09-04)

Source of truth: `artifacts/api-server/src/data/graduation-paths.ts`
(`MAJOR_RECIPES`, `MINORS`, `MINOR_RECIPES`). Every record's four-year
sequence is only as trustworthy as its `sequenceTrust`:

- **`prescribed`** — reconciled course-by-course against an official SCU
  four-year plan; eligible for one-click preload. Only CSE currently.
- **`recommended`** — an official SCU source is linked (`provenance`), but
  CampusVal's generated quarters have not been reconciled against it
  line-by-line. Reference only. ECEN, MECH, CENG, BIOE.
- **`example`** — no major-specific official source; a generic
  template-generated sequence, illustration only. Every other major,
  including all 8 added below.

This document was produced by cross-referencing the live SCU Undergraduate
Bulletin (`https://www.scu.edu/bulletin/undergraduate/`) against the
catalog as it stood before this pass (46 majors, 52 minors, 0
concentrations modeled).

## Majors added this pass (bulletin-confirmed, previously entirely missing)

| Code | Title | College | Status |
|---|---|---|---|
| `BCHM` | Biochemistry | CAS | example |
| `BCHM_ACS` | Biochemistry, ACS Certified | CAS | example |
| `CHEM_BA` | Chemistry (B.A.) | CAS | example |
| `ENSC` | Environmental Science | CAS | example |
| `WDE` | Web Design and Engineering | SOE | example |
| `EE` | Electrical Engineering | SOE | example |
| `GENR` | General Engineering | SOE | example |
| `ENGPHYS` | Engineering Physics | CAS | example |

Every course code referenced by these 8 recipes was verified against the
real course catalog (`artifacts/api-server/src/data/courses-data.json`);
see `graduation-paths.new-majors.test.ts`. No curriculum was invented.

## Flagged for review — NOT changed this pass

These are real discrepancies found between the current catalog and the
live bulletin, but changing or removing an existing major code is a
backward-compatibility risk (a student may already have selected it) that
needs deliberate review, not a blind edit made while unattended:

- **`AMTH` (Applied Mathematics)** — the bulletin currently shows no
  standalone Applied Mathematics major. It exists only as an emphasis
  within the Mathematics major (`MATH`), and the School of Engineering's
  Applied Mathematics department explicitly states it offers no
  undergraduate major or minor.
- **`CHIN` (Chinese Studies)** and **`JAPN` (Japanese Studies)** — the
  bulletin currently shows these only as minors ("Chinese and Sinophone
  Studies", "Japanese Studies"), not majors.
- **`DANC` (Dance)** — the bulletin shows one Theatre Arts major (`THTR`)
  with a Dance emphasis inside it, not a standalone Dance major. A
  standalone Dance *minor* does exist separately.
- Pre-existing majors `CHEM` and `PHYS` reference course codes not found in
  the current course catalog (`CHEM 113`, `CHEM 124`, `MATH 22`) — likely
  stale, unrelated to this pass's additions.

**Recommended next step:** decide with the product owner whether to
recode/relabel these four majors or add a data migration for any existing
student profiles that reference them, then update this document.

## Minors added this pass (bulletin-confirmed, previously entirely missing)

Once the real MINORS list was inspected directly (rather than estimated),
most of the audit's suspected gaps turned out to already exist (Real
Estate, Business Analytics, MIS, Aerospace Engineering, Creative Writing,
Japanese Studies, Dance, and more were already present). The following 21
were genuinely absent and have been added, each with a real
`scu.edu/bulletin` source URL:

Journalism, Digital Filmmaking, Organizational/Business/Professional
Communication, Professional Writing, Geospatial Analysis, African American
Studies, Asian American Studies, Latina/o/x Studies, Animation and
Illustration, Arts Management, Graphic Design, Theatre Design and
Technology, Gerontology, Medical and Health Humanities, Biotechnology,
Musical Theatre, Responsible Artificial Intelligence, Healthcare
Innovation and Design, Construction Management, International Business,
Sustainable Food Systems.

**Honesty note on requirement detail**: none of these 21 have their exact
approved-course lists encoded — every requirement group is marked
`needsVerification: true` with an empty course list, exactly like several
pre-existing minors already in the catalog before this pass (e.g. the
"Additional lower-division anthropology course" group). This is a
deliberate choice, not a shortcut: encoding a specific course list without
having actually read and confirmed it against the Bulletin page would be
fabrication. A follow-up pass should visit each of the 21 source URLs
above and fill in the real approved-course groups.

## Concentrations — known incomplete

The bulletin audit found 33 real concentrations/tracks/emphases across
majors like Bioengineering (Biomolecular / Medical Device / Pre-Med),
Anthropology, Communication, Mathematics, Computer Science, Philosophy,
Political Science, and Public Health — **none of which are modeled in
code yet.** `graduation-paths.ts` has no `concentrations` field on
`MajorRecipe` at all; adding this needs both a data-model change and UI in
the program picker, which is a substantial follow-up pass, not a
same-session addition.

## Program coverage (honest count)

- Majors: 54 of ~54 bulletin-confirmed majors represented (46 existing + 8
  added), modulo the 4 flagged-for-review discrepancies above.
- Minors: 73 of ~73 bulletin-confirmed minors represented (52 existing +
  21 added). The 21 new ones need their exact approved-course lists filled
  in (see above) — the minor itself is real and selectable, but its
  requirement detail is honestly marked unverified rather than complete.
- Concentrations/tracks: 0 of 33 bulletin-confirmed ones modeled.

**This is not 100% coverage.** Majors and minors are now name-complete
against this audit; concentrations remain a real, documented gap.
