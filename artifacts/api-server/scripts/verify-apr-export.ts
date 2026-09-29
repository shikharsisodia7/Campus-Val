/**
 * Verifies that CampusVal reads an Academic Progress Report export completely.
 *
 *   pnpm --filter @workspace/api-server run verify-apr -- <file.xlsx | file.pdf> [--json]
 *
 * Prints STRUCTURE ONLY: counts, column headers from a fixed list, and codes.
 * It never prints a cell, a name, a course, a grade or a date, so it can be run
 * on a real export and its output shared. The file is read where it is; it is
 * not copied, uploaded or stored.
 *
 * Exit code 0 when the file was read completely, 1 when something needs a look.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyAprExport, type AprVerification } from "../src/lib/apr/verify-export";

function print(report: AprVerification): void {
  const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(34)} ${String(value)}`);
  console.log(`Academic Progress Report export (${report.format}, ${report.bytes} bytes)`);
  if (report.error) {
    line("imported", `NO (${report.error})`);
    return;
  }
  line("imported", "yes");
  line("worksheets", report.sheets.length);
  line("macros present (never run)", report.macros ? "yes" : "no");
  if (report.formulas) {
    line("formula cells", report.formulas.total);
    line("  with a stored result", report.formulas.withStoredResult);
    line("  without one (shown blank)", report.formulas.withoutStoredResult);
  }
  line("importer warnings", report.warnings.length ? report.warnings.join(", ") : "none");
  for (const sheet of report.sheets) {
    console.log(`\nSheet ${sheet.index + 1} (${sheet.visibility})`);
    line("rows with a value, in the file", sheet.rowsInFile ?? "not counted");
    line("rows kept by CampusVal", sheet.rowsKept);
    line("rows not kept", sheet.rowsNotKept ?? "not counted");
    line("columns / cells / merged cells", `${sheet.columns} / ${sheet.cells} / ${sheet.mergedCells}`);
    line("Workday table recognised", sheet.sidebarRecognised ? "yes" : "NO");
    line("columns shown while planning", sheet.sidebarColumns.join(" | ") || "none");
    line("columns withheld", sheet.withheldColumns.join(" | ") || "none");
    line("program blocks", sheet.programBlocks);
    line(
      "groups",
      Object.entries(sheet.groups)
        .filter(([, n]) => n > 0)
        .map(([kind, n]) => `${kind} ${n}`)
        .join(", ") || "none",
    );
    line("rows in the planning sidebar", sheet.sidebarRows);
    line("rows above a table (full APR only)", sheet.preambleRows);
    line("sidebar warnings", sheet.sidebarWarnings.join(", ") || "none");
  }
  console.log(`\n${report.findings.length === 0 ? "Nothing needs a look." : "To look at:"}`);
  for (const finding of report.findings) console.log(`  - ${finding}`);
  console.log(`\nResult: ${report.ok ? "read completely" : "NEEDS A LOOK"}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("Usage: verify-apr <file.xlsx | file.pdf> [--json]");
    process.exit(2);
  }
  const extension = path.extname(file).toLowerCase();
  if (extension !== ".xlsx" && extension !== ".pdf") {
    console.error("Give the .xlsx or .pdf exported from Workday's Academic Progress report.");
    process.exit(2);
  }
  const report = await verifyAprExport(readFileSync(file), extension === ".pdf" ? "pdf" : "xlsx");
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else print(report);
  process.exit(report.ok ? 0 : 1);
}

main().catch(() => {
  // The error could quote the file: only the fact is reported.
  console.error("The file could not be read.");
  process.exit(1);
});
