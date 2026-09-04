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

## Minors and concentrations — known incomplete

The bulletin audit found roughly 35 minors not cross-checkable against the
app's exact existing 52-minor list (interdisciplinary minors, department
minors like Journalism/Creative Writing/Real Estate, and several newer
minors like Responsible Artificial Intelligence and Healthcare Innovation
and Design), plus 33 real concentrations/tracks/emphases across majors
like Bioengineering (Biomolecular / Medical Device / Pre-Med), Anthropology,
Communication, Mathematics, Computer Science, Philosophy, Political
Science, and Public Health — **none of which are modeled in code yet.**

This was intentionally deferred rather than rushed: each minor and
concentration needs the same course-code verification discipline applied
to the 8 majors above, and concentrations have no data model in
`graduation-paths.ts` at all yet (would need a new `concentrations` field
on `MajorRecipe` plus UI in the program picker). Doing this properly for
~35 minors and 33 concentrations is a substantial follow-up pass, not a
same-session addition.

## Program coverage (honest count)

- Majors: 54 of ~54 bulletin-confirmed majors represented (46 existing + 8
  added), modulo the 4 flagged-for-review discrepancies above.
- Minors: 52 represented; ~35 bulletin-confirmed gaps remain, documented
  above, not yet added.
- Concentrations/tracks: 0 of 33 bulletin-confirmed ones modeled.

**This is not 100% coverage.** It should not be reported as complete until
the minors and concentrations gaps above are closed.
