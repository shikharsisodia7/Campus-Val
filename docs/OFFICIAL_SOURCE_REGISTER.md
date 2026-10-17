# Official department source register

This register records the public Santa Clara University sources checked during the pilot-readiness pass. It is intentionally separate from the canonical department-resource importer: a URL is not treated as canonical CampusVal content until an administrator has verified the document, academic year, and deterministic mappings.

Checked 2026-10-16 against official `scu.edu` pages; Biology re-checked 2026-10-17.

| Program | Source | Status | CampusVal use |
| --- | --- | --- | --- |
| Biology | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html) | Public and current | Bulletin baseline for structural requirements; not Department Notes. |
| Biology | [Biology Academic Programs](https://www.scu.edu/cas/biology/academic-programs/) | SCU account required; authorized session retrieved the current workbook | The workbook stays registered in production as a draft/pending canonical resource (provenance `documented`, review `pending`). Nothing imports from it until an administrator verifies and approves it, and the importer will not apply it while the same cells exist as legacy notes (see below). |
| Biology | [CAS Academic Advising](https://www.scu.edu/cas/academics/academic-advising/) → Biology Requirements Checklist / Sample First-Year Course Plans | Retrieved through the authorized SCU session | The 2026–27 workbook was exported for deterministic review and its rows were resolved against the current Bulletin on 2026-10-17 (below). |
| Finance | [Finance Academic Programs](https://www.scu.edu/business/finance/academics/) | Public and current | Official major overview and current major course list; use for human review and source provenance. |
| Finance | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/finance.html) | Public and current | Bulletin baseline; keeps Leavey/school requirements separate from Finance major requirements. |
| Finance | [2025 Finance Info Sheet](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/Finance-Info-Sheet-%5BUPDATED-5_25%5D.pdf) | Public, dated 2025 | Supplemental reference only; requires administrator review before canonical import. |
| Finance | [Legacy Finance checklist](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/FINAL_UPDATED_FINANCE_CHECKLIST.pdf) | Stale (revised 2018) and no longer downloadable from the current site | Not imported. It must not override the current bulletin or current Finance academic-program page. |

## Biology workbook review (2026-10-17)

The same 2026–27 accessible workbook had already been imported on 2026-10-06, before the canonical-resource registry existed, as legacy notes 39–54 in production. Those are the notes Biology students see. Each row was compared with the current [Biology Bulletin page](https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html) ("Requirements for the Major" and its theme lists), the [Chemistry and Biochemistry Bulletin page](https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/chemistry-and-biochemistry.html) (degree footnotes and the CHEM 12 / 14 / 31 course listings), and CampusVal's requirement tree for `major:biology`.

| Cell | Row (label · note) | Decision | Evidence |
| --- | --- | --- | --- |
| C21, C25 | RTC 3, Pathway 1 · "Can overlap with another Core or a Major requirement (as of 10/23)" | Published → **draft** | The note is dated. The importer has held dated notes for review since `285c098`, but these two legacy rows were still live. |
| D44 | UD BIOL CMB THEME w/ Lab 1 · "Theme" | Unmapped → **published** on `theme-cmb` | The row's course list (BIOL 110, 112, 113, 115, 122, 174, 175) is exactly the Bulletin's CMB list and exactly the courses of one requirement. |
| D45 | UD BIOL EEB THEME w/ Lab 2 · "Theme" | Unmapped → **published** on `theme-eeb` | The course list equals the Bulletin's EEB list (the source types "180. 181" for "180, 181"). |
| D46 | UD BIOL MOD THEME w/ Lab 3 · "Theme" | Unmapped → **published** on `theme-mod` | The course list equals the Bulletin's MOD list. |
| D50 | UD BIOL Elective (any UD BIOL, CHEM 141, 142) · "With or without lab" | Unmapped → **published** on `electives-any` | CHEM 141 is a Bulletin specialty (lecture-only) course, and only the "electives, with or without laboratory" requirement lists it. |
| D31 | CHEM 12 · "CHEM 14" | **Stays draft** | The Biology Bulletin never mentions CHEM 14. The Chemistry Bulletin says "students may take CHEM 14 as a replacement for CHEM 11 and 12", but that footnote belongs to the Chemistry degrees. The workbook puts no note on the CHEM 11 row. Whether CHEM 14 satisfies Biology's CHEM 11/12 requirement is a Biology department decision. |
| D32 | CHEM 31 · "CHEM 14" | **Stays draft** | The CHEM 31 listing reads "Prerequisite: CHEM 11 or 14", which supports reading the note as an alternative prerequisite, not a substitute course. The same two-word text beside two rows has two plausible meanings, so CampusVal does not choose one. |
| D47, D48 | UD BIOL ELECT/THEME w/ Lab 4 / 5 · "With Lab" | **Stays unmapped** | The row names no course and lists none. The label reads like the Bulletin's "at least two [electives] with laboratory", but that is an interpretation of wording, not an exact anchor. The note adds nothing to that requirement's own text. |

Changes were made with `reconcile:legacy-notes`, which re-applies the current extractor only to importer-owned legacy rows whose cell still says what was imported. It records no reviewer, so students still see "imported, not yet reviewed by the department", and it writes each change to the department audit log. The CHEM 14 rows need the Biology department to say what the note means. The D47/D48 rows need an administrator to place them, or to leave them unplaced.

Before the canonical resource is approved, archive legacy notes 39–54. Otherwise the importer refuses to apply the file, because the same cells already exist as notes.

## Acquisition boundary

The importer accepts administrator-registered canonical workbook packages and requires provenance, review, and publication gates. The current Biology workbook was accessed through the authorized SCU session and registered in production, but remains draft/pending. Its rows have been resolved against the current Bulletin as far as official sources prove (above). Approving the resource itself is an administrator decision. No student upload was promoted into global content.

No generated documents, student records, credentials, or private files are included in this repository.
