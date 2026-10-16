# Requirements audit

`pnpm run audit:requirements --out docs/audits` walks every supported major and
minor through the requirements source in use and writes:

| File | Contents |
| --- | --- |
| `requirements-audit.md` | concise review summary: coverage counts, source/normalized parity, upper-division evidence, and findings by kind. |
| `requirements-audit-requirements.csv` | one row per requirement (or per empty group): program, group, requirement, stable key, courses, provider, source, source address, edition, last verified, provenance status, structured section/variant, choice rule/minimum/list coverage, and warning codes. Open it in a spreadsheet to proofread. |
| `requirements-audit-findings.csv` | one row per finding: category, severity, code, program, requirement, message |
| `requirements-audit.json` | the counts and the findings |

The audit **only reports**. It never edits, fixes or substitutes academic content,
and it runs on synthetic profiles (no student data). The results of the run on
2026-10-06 (classification checks, the University group, the department layer) are in [`requirements-audit-2026-10-06.md`](./requirements-audit-2026-10-06.md); the earlier run is in
[`requirements-audit-2026-09-30.md`](./requirements-audit-2026-09-30.md). `--db` adds the department layer and Sample Plans (never written to this folder: it reads a database).
Re-run it after any change to `data/degree-requirements.ts` or
`data/graduation-paths.ts`, `data/major-structures.ts`, or `data/majors/`.

For majors with a stored structured Bulletin source, the audit also compares the
normalized API representation with the source structure (requirement keys,
eligible courses, choice mechanics, manual tracking, and provenance) and
checks that each explicitly represented course is named by the stored Bulletin
text or an explicit correction. It flags a major with no enumerated
upper-division course evidence for human review; this is a proofing signal, not
an automatic academic-policy change. Choice-list coverage is included in both
the summary and the requirements CSV, and an empty list/option is a structural
error.

## Categories

- **data_integrity**: objectively wrong or unresolvable in the data or code
  (duplicate id, a course code not in the catalog, malformed rule). Engineering fixes
  these unless the fix would be a guess.
- **missing_provenance**: the data does not state its source address, edition or
  verification date.
- **academic_content**: may be right or wrong depending on SCU policy. Reported for
  the professor; never changed by a script.

Severity: `error` (the audit exits non-zero under `--strict`), `warning`, `info`.
