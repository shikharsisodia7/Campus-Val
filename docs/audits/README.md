# Requirements audit

`pnpm run audit:requirements --out docs/audits` walks every supported major and
minor through the requirements source in use and writes:

| File | Contents |
| --- | --- |
| `requirements-audit-requirements.csv` | one row per requirement (or per empty group): program, group, requirement, stable key, courses, provider, source, source address, edition, last verified, provenance status, warning codes. Open it in a spreadsheet to proofread. |
| `requirements-audit-findings.csv` | one row per finding: category, severity, code, program, requirement, message |
| `requirements-audit.json` | the counts and the findings |

The audit **only reports**. It never edits, fixes or substitutes academic content,
and it runs on synthetic profiles (no student data). The results of the run on
2026-09-30 are in [`requirements-audit-2026-09-30.md`](./requirements-audit-2026-09-30.md).
Re-run it after any change to `data/degree-requirements.ts` or
`data/graduation-paths.ts`.

## Categories

- **data_integrity**: objectively wrong or unresolvable in the data or code
  (duplicate id, a course code not in the catalog, malformed rule). Engineering fixes
  these unless the fix would be a guess.
- **missing_provenance**: the data does not state its source address, edition or
  verification date.
- **academic_content**: may be right or wrong depending on SCU policy. Reported for
  the professor; never changed by a script.

Severity: `error` (the audit exits non-zero under `--strict`), `warning`, `info`.
