# Official department source register

This register records the public Santa Clara University sources checked during the pilot-readiness pass. It is intentionally separate from the canonical department-resource importer: a URL is not treated as canonical CampusVal content until an administrator has verified the document, academic year, and deterministic mappings.

Checked 2026-10-16 against official `scu.edu` pages.

| Program | Source | Status | CampusVal use |
| --- | --- | --- | --- |
| Biology | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html) | Public and current | Bulletin baseline for structural requirements; not Department Notes. |
| Biology | [Biology Academic Programs](https://www.scu.edu/cas/biology/academic-programs/) | Login required | The current checklist is behind the SCU account gate. It is not imported or represented as public Department Notes. |
| Biology | [CAS Academic Advising](https://www.scu.edu/cas/academics/academic-advising/) → Biology Requirements Checklist / Sample First-Year Course Plans | Login required (Google documents returned 401 without an authenticated SCU session) | Links are recorded for an authorized administrator to verify and import later. No private document was bypassed or copied. |
| Finance | [Finance Academic Programs](https://www.scu.edu/business/finance/academics/) | Public and current | Official major overview and current major course list; use for human review and source provenance. |
| Finance | [2026-27 Undergraduate Bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/finance.html) | Public and current | Bulletin baseline; keeps Leavey/school requirements separate from Finance major requirements. |
| Finance | [2025 Finance Info Sheet](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/Finance-Info-Sheet-%5BUPDATED-5_25%5D.pdf) | Public, dated 2025 | Supplemental reference only; requires administrator review before canonical import. |
| Finance | [Legacy Finance checklist](https://www.scu.edu/media/leavey-school-of-business/undergraduates/pdfs-x2f-docs/FINAL_UPDATED_FINANCE_CHECKLIST.pdf) | Stale (revised 2018) and no longer downloadable from the current site | Not imported. It must not override the current bulletin or current Finance academic-program page. |

## Acquisition boundary

The importer accepts administrator-registered canonical workbook packages and requires provenance, review, and publication gates. The current Biology checklist/sample-plan documents are account-gated, so this pass does not fabricate a checklist, scrape a private account, or promote a student upload into global content. An authorized SCU administrator can later download the official files and register them through Program Requirements Admin with their academic year/version and source URL.

No generated documents, student records, credentials, or private files are included in this repository.
