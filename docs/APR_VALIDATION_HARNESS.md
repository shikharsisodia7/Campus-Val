# Validating future APR examples, privately

_2026-10-20. The professor hopes to obtain Academic Progress Report examples for every major and minor. This is how they are
checked against CampusVal without putting a student record anywhere it does not belong._

An APR is a student education record (FERPA). Treat every real export as such, even an "anonymized" one.

## Rules

1. **Never in git.** Real APR files are never committed, attached to a PR or issue, pasted into a chat, or uploaded to a
   shared drive by CampusVal engineering. Source control holds only **synthetic** fixtures
   (`artifacts/api-server/src/__fixtures__/apr/build-workbooks.ts`), which are built in code with invented content.
2. **Outside the repository.** Keep an authorized file in a private folder outside the checkout. The harness refuses a path
   inside the repository (`--allow-in-repo` exists only for synthetic fixtures).
3. **Structure only.** Use the harness below. It never prints a cell, a name, a student id, a course, a grade, a date or a
   requirement label; only counts, Workday's column headers from a fixed list, and codes. Its output can be shared.
4. **No screenshots** of a real APR or of CampusVal showing one. Describe a problem by row number and the harness's counts.
5. **No grades in logs.** The server logs APR counts only; the normalized model reads Academic Period, Units and Grade only on
   explicit request, and the assessment never requests them.
6. **Delete when done.** Remove the file when the check is finished, and empty the trash.

## The harness

```
pnpm --filter @workspace/api-server run verify-apr -- "<private folder>/export.xlsx"
pnpm --filter @workspace/api-server run verify-apr -- "<private folder>/export.pdf" --json
```

It reports, per file:

- import: format, worksheets, macros (never run), formulas with / without stored results, importer warnings;
- per sheet: rows in the file vs rows kept (no row silently dropped), columns / cells / merged cells, whether Workday's table
  was recognised, the columns shown while planning and the columns withheld, program blocks, groups by kind, preamble rows;
- **Degree Completion Assessment (R&D) structure**: requirement rows, course rows under them, nested requirements (Workday's
  indent), status vocabulary as counts (satisfied / not satisfied / in progress / missing / unrecognized, the unrecognized
  values never printed), status cells with words beside the status, minimum-combination statements (and how many state a
  number), remaining kinds, rule codes, sheets without a table;
- findings to look at, e.g. an unrecognized status, words beside a status, or requirements with no course rows (a possible
  one-row-per-course layout).

Exit code 0 when the file was read completely, 1 when something needs a look, 2 for a usage error or a refused path.

## What to record

For each authorized example, record in a private log (not git): program(s), export date, format, and the harness output.
Bring structural surprises (an unknown status word, a new column, a new layout) to engineering as harness output only; a
synthetic fixture reproducing the structure is then added to source control, and the parser is extended against that fixture.

## Layering (so a format change is not a rewrite)

```
raw workbook / PDF       lib/apr/workbook-reader.ts, lib/apr/pdf-table-reader.ts
  -> structural rows      lib/apr/sidebar-projection.ts
  -> normalized APR model lib/degree-completion/apr-normalized.ts
  -> assessment rules     lib/degree-completion/engine.ts
```

If the Registrar moves the APR to one row per course, the normalized model is the layer to extend; the rules and the UI keep
reading the same `NormalizedAprRequirement`.
