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

## Concentrations added this pass (46 entries across 15 majors)

`MajorRecipe` now has an optional `concentrations: MajorConcentration[]`
field (`{ title, sourceUrl }`) — metadata only, deliberately no
per-concentration course list (that would need the same page-by-page
Bulletin verification already applied to each major's own lowerDiv/upperDiv,
not attempted here). Populated for the 15 majors the audit confirmed have
real official concentrations/tracks/emphases:

| Major | Concentrations |
|---|---|
| Anthropology (`ANTH`) | Applied Anthropology, Archaeology, Biological Emphasis |
| Art History (`ARTH`) | Arts Management Emphasis |
| Studio Art (`ARTS`) | Graphic Design Emphasis, Animation and Illustration Emphasis |
| Classics and Ancient Studies (`CLAS`) | Classical Languages and Literatures Track, Classical Studies Track, Ancient Studies Track |
| Communication (`COMM`) | Global Media/Culture/Technology, Org/Professional/Business Communication, Communication/Diversity/Culture, Digital Filmmaking, Journalism, Strategic Communication |
| Economics — CAS (`ECON_CAS`) | Data Analysis for Economics, Mathematical Economics |
| Economics — Business (`ECON`) | Data Analysis for Economics, Mathematical Economics |
| Women's & Gender Studies (`WGST`) | Cultural Politics of Representation, Power/Rights/Society, Sexualities/Body Politics/Social Structures |
| Mathematics (`MATH`) | Applied Mathematics, Data Science, Financial Mathematics, Mathematical Economics, Mathematics Education (emphases) |
| Computer Science — CAS (`CSCI`) | Algorithms and Complexity, Data Science, Security, Software (emphases) |
| Philosophy (`PHIL`) | Pre-Law and Justice, Ethics and Values, Science and Analysis, History of Philosophy, International & Comparative Philosophy |
| Political Science (`POLI`) | Pre-Law, Public Sector, International Relations (emphases) |
| Public Health Science (`PHSC`) | Health Science, Health and Society (emphases) |
| Theatre (`THTR`) | Emphasis in Theatre, Emphasis in Dance |
| Bioengineering (`BIOE`) | Biomolecular track, Medical-device track, Pre-med track |

Surfaced in the Planning Requirements sidebar as a note on the major's
requirement group ("This major has official concentrations/tracks: …"),
pointing at the real source URL for exact requirements.

Deliberately excluded (per the original audit, not oversight): Marketing's
three "emphases" (the Bulletin states these are informal/non-transcript,
unlike Bioengineering's real tracks), Sociology's unnamed concentrations
(the Bulletin defers naming them to the department website, so nothing
concrete to represent), the Chinese and Sinophone Studies minor's Track
A/Track B (placement-based/procedural, not a curricular concentration),
and General Engineering's BioInnovation and Design track (nested inside a
*minor*, not a major).

Note: the earlier audit's own summary line said "33 total" but its own
itemized per-major list — reproduced faithfully above — sums to 46 once
Economics (CAS) and Economics (Business) are each counted separately (they
share concentration names but are two different majors). Reporting the
actual per-major counts here rather than repeating an inconsistent summary
figure from the source research.

## Program coverage (honest count)

- Majors: 54 of ~54 bulletin-confirmed majors represented (46 existing + 8
  added), modulo the 4 flagged-for-review discrepancies above.
- Minors: 73 of ~73 bulletin-confirmed minors represented (52 existing +
  21 added). The 21 new ones need their exact approved-course lists filled
  in (see above) — the minor itself is real and selectable, but its
  requirement detail is honestly marked unverified rather than complete.
- Concentrations/tracks: 46 bulletin-confirmed real concentrations
  represented as metadata (name + official source), across 15 majors. Four
  items found during the original audit were deliberately excluded as
  explained above (informal Marketing emphases, unnamed Sociology
  concentrations, procedural Chinese minor tracks, a track nested in a
  minor) — those aren't a gap, they're a documented decision not to
  represent something the Bulletin itself doesn't name as a real
  concentration.

**Majors, minors, and concentrations are now name-complete against this
audit.** What remains for full production-grade completeness: the 21 new
minors' exact approved-course lists, and the 4 flagged major discrepancies
pending your review.
