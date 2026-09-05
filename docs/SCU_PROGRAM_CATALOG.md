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

## Resolved: 4 flagged discrepancies (previously "not changed", now corrected)

These were real discrepancies found between the catalog and the live
bulletin. Each was independently re-verified against a live SCU Bulletin
fetch (not just the earlier nav-menu-level check) before acting, since
changing/removing an existing major code is a backward-compatibility-
sensitive decision:

- **`AMTH` (Applied Mathematics)** — confirmed via the live Bulletin
  (Ch. 5, School of Engineering, Applied Mathematics) and the Graduate
  Engineering Bulletin (Ch. 7): the Department of Applied Mathematics
  offers only graduate degrees; undergraduate Applied Mathematics is an
  emphasis within the Mathematics major. **Fixed:** removed the fake
  standalone `AMTH` major entry. The "Applied Mathematics Emphasis" was
  already correctly represented as a `MATH` concentration.
- **`CHIN` (Chinese Studies)** and **`JAPN` (Japanese Studies)** — confirmed
  via the live Modern Languages and Literatures bulletin page: "there are
  no standalone majors in Chinese or Japanese Studies; only minors are
  offered." **Fixed:** removed the fake `CHIN`/`JAPN` major entries.
  `JAPN-MIN` already existed; **`CHIN-MIN` ("Chinese and Sinophone
  Studies") was actually missing from the minor catalog entirely** (an
  error in this document's earlier "already present" assumption) and has
  been added.
- **`DANC` (Dance)** — the bulletin shows one Theatre Arts major (`THTR`)
  with a Dance emphasis inside it, not a standalone Dance major. **Fixed:**
  removed the fake standalone `DANC` major entry. The "Emphasis in Dance"
  concentration on `THTR` and the standalone `DANC-MIN` minor were already
  correctly represented and are unaffected.
- **`CHEM` and `PHYS`** referenced course codes not found in the course
  catalog. Verified against the live Chemistry & Biochemistry bulletin
  page: `CHEM 113` and `CHEM 124` **do not exist in the current SCU
  Bulletin at all** (not just missing from the scrape) — `CHEM`'s
  upperDiv sequence was stale. **Fixed:** replaced with the real B.S.
  Chemistry core (`CHEM 102, 111, 141, 151, 152, 154`). `MATH 22`
  ("Ordinary Differential Equations") *is* a real, current course that was
  genuinely just missing from `courses-data.json` — added it there instead
  of touching `PHYS`'s (correct) requirement.

Regression coverage: `graduation-paths.catalog-discrepancies.test.ts`
locks in that none of the four fake majors are selectable, that the real
underlying programs remain represented (MATH/THTR concentrations,
CHIN-MIN/JAPN-MIN minors), and that CHEM/PHYS reference only real catalog
courses.

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

**Update (2026-09-04 closeout pass): all 22 (these 21 + `CHIN-MIN`) now
have real, Bulletin-researched requirement structures** — see "22 minors:
exact requirements completed" below. This section is left as the original
historical record of what this pass added by name.

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

- Majors: 50 of ~50 bulletin-confirmed standalone majors represented (54
  previously counted, minus the 4 fake entries — AMTH/CHIN/JAPN/DANC —
  removed after live-bulletin re-verification; those programs remain
  represented correctly as emphases/minors, not majors).
- Minors: 74 of ~74 bulletin-confirmed minors represented (73 previously
  present + CHIN-MIN "Chinese and Sinophone Studies", which was missing
  entirely and has been added). **All 74 now have a real, Bulletin-sourced
  requirement structure** (see "22 minors: exact requirements completed"
  below) — none are blank placeholders.
- Concentrations/tracks: 46 bulletin-confirmed real concentrations
  represented as metadata (name + official source), across 15 majors. Four
  items found during the original audit were deliberately excluded as
  explained above (informal Marketing emphases, unnamed Sociology
  concentrations, procedural Chinese minor tracks, a track nested in a
  minor) — those aren't a gap, they're a documented decision not to
  represent something the Bulletin itself doesn't name as a real
  concentration.

**Majors, minors, and concentrations are now both name-complete and
requirement-complete against this audit, and the 4 previously-flagged
major discrepancies are resolved.**

## 22 minors: exact requirements completed (2026-09-04 closeout pass)

Each of the 22 minors flagged above (the 21 originally added + `CHIN-MIN`)
was individually researched against its live SCU Bulletin department page
(the same `sourceUrl` already on file for each) and its `MINOR_RECIPES`
entry replaced with the real requirement structure — required courses,
choice groups ("choose N from [...]"), and unit minimums, exactly as
published. Where the Bulletin itself only describes a generic pool (a
large rotating elective list, an open "any ARTH course except X/Y/Z"
rule, or an externally-maintained course list not itself part of the
Bulletin page), that is represented as a generic count/unit requirement
with `needsVerification: true` — honest about what wasn't reduced to
specific codes, never a fabricated list. Examples: Biotechnology (13
courses across 5 groups, fully specific), the three Ethnic Studies minors
(required courses + bounded choice lists, fully specific), Construction
Management (fully specific with a documented double-dip allowance),
Responsible Artificial Intelligence (three alternative computing-foundation
tracks), Medical and Health Humanities (kept generic — the Bulletin's own
40+ course, 14-department list is intentionally open-ended, with
program-director approval allowed for courses outside it).

**Known follow-up, not blocking**: encoding this pass surfaced ~35 elective-
list course codes (e.g. several `ETHN`/`BUSN`/`MGMT` electives, `CHIN
100-103`, language codes like `ARAB 23`/`ITAL 100`) that are cited in a
minor's requirement group but not yet present in `courses-data.json`. This
does not break the requirement display (`requirements.ts` renders a course
code directly from the group's own list; catalog membership is only needed
for click-through course details), so it's a separate, lower-priority
catalog-population task rather than a defect in the requirement structures
themselves.

Also added `graduation-paths.minor-completeness.test.ts`, a sweep across
**every** minor in the catalog (all 74, not just these 22) checking:
official provenance, a non-empty requirement structure, no invalid/empty
requirement group, no duplicate requirement labels within one minor, and
internally-consistent choice groups (a "choose N" group must actually list
at least N distinct options, unless it's a single repeatable course).
This surfaced and fixed several small **pre-existing** label collisions in
majors unrelated to this pass (`ENGL-MIN`, `PHIL-MIN`, `CSEN-MIN`,
`CSCI-MIN-SOE` each had two requirement groups sharing an identical label,
e.g. two groups both called "Programming foundations" with different
course choices) — cosmetic-but-confusing UI bugs, now given distinct
labels.
