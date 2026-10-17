# Official department source register

This register records the public Santa Clara University sources checked during the pilot-readiness pass. It is intentionally separate from the canonical department-resource importer: a URL is not treated as canonical CampusVal content until an administrator has verified the document, academic year, and deterministic mappings.

Checked 2026-10-16 against official `scu.edu` pages.

| Program | Source | Status | CampusVal use |
| --- | --- | --- | --- |
| Biology | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html) | Public and current | Bulletin baseline for structural requirements; not Department Notes. |
| Biology | [Biology Academic Programs](https://www.scu.edu/cas/biology/academic-programs/) | SCU account required; authorized session retrieved the current workbook | The workbook is registered in production as a draft/pending canonical resource; it is not student-visible. |
| Biology | [CAS Academic Advising](https://www.scu.edu/cas/academics/academic-advising/) → Biology Requirements Checklist / Sample First-Year Course Plans | Retrieved through the authorized SCU session | The 2026–27 workbook was exported for deterministic review. Its dry run produced 9 mapped notes, 2 ambiguous course-only notes, and 5 unmapped lab anchors; nothing was published. |
| Finance | [Finance Academic Programs](https://www.scu.edu/business/finance/academics/) | Public and current | Official major overview and current major course list; use for human review and source provenance. |
| Finance | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/finance.html) | Public and current | Bulletin baseline; keeps Leavey/school requirements separate from Finance major requirements. |
| Finance | [2025 Finance Info Sheet](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/Finance-Info-Sheet-%5BUPDATED-5_25%5D.pdf) | Public, dated 2025 | Supplemental reference only; requires administrator review before canonical import. |
| Finance | [Legacy Finance checklist](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/FINAL_UPDATED_FINANCE_CHECKLIST.pdf) | Stale (revised 2018) and no longer downloadable from the current site | Not imported. It must not override the current bulletin or current Finance academic-program page. |

## Acquisition boundary

The importer accepts administrator-registered canonical workbook packages and requires provenance, review, and publication gates. The current Biology workbook was accessed through the authorized SCU session and registered in production, but remains draft/pending because its deterministic output contains ambiguous and unmapped rows. An administrator must resolve those rows against the current Bulletin before publication. No student upload was promoted into global content.

No generated documents, student records, credentials, or private files are included in this repository.
