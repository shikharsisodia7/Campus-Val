/**
 * Checks that CampusVal reads an Academic Progress Report export completely,
 * and says so in numbers only.
 *
 * It exists for one purpose: to verify the importer against a REAL Workday
 * export without anyone having to look at, print or store a student's record.
 * Give it the file; it reports structure. Nothing it returns contains a cell's
 * text, a name, a course, a grade or a date. The only words it can return are
 * Workday's own column headers, and only those on a fixed list.
 *
 * What it verifies:
 *   - the file opens, and how many worksheets, rows, columns and merged cells
 *     it has;
 *   - NO ROW IS SILENTLY DROPPED: the rows CampusVal keeps are compared with
 *     the rows the file itself holds, counted independently from the file;
 *   - formulas: how many there are, how many carry a stored result, how many
 *     have none (shown blank, never calculated);
 *   - the planning sidebar: whether Workday's table was recognised, how many
 *     program blocks and groups of each kind it found, and which columns are
 *     withheld (Academic Period, Units, Grade);
 *   - anything the importer could not do.
 */
import JSZip from "jszip";
import { decodeXmlText } from "./formula-cache";
import { readAprPdf } from "./pdf-table-reader";
import { isOmittedHeader, projectForSidebar, type SidebarGroupKind } from "./sidebar-projection";
import { AprImportError, type AprImportErrorCode, type AprWorkbook } from "./workbook-model";
import { readAprWorkbook } from "./workbook-reader";

/** Workday's column headers. Anything else is reported as "(other)". */
const KNOWN_HEADERS = new Set([
  "requirement",
  "requirements",
  "status",
  "remaining",
  "satisfied with",
  "registration used",
  "registrations used",
  "academic period",
  "academic periods",
  "unit",
  "units",
  "credit",
  "credits",
  "grade",
  "grades",
]);

const headerName = (text: string): string => {
  const plain = text.toLowerCase().replace(/\s+/g, " ").replace(/[:*]+$/, "").trim();
  return KNOWN_HEADERS.has(plain) ? plain : "(other)";
};

export interface SheetVerification {
  index: number;
  visibility: "visible" | "hidden";
  /** Rows the FILE holds that have at least one value, counted from the file itself. */
  rowsInFile: number | null;
  /** Rows CampusVal kept. */
  rowsKept: number;
  /** rowsInFile - rowsKept. Rows whose every cell is empty text are not kept. */
  rowsNotKept: number | null;
  columns: number;
  cells: number;
  mergedCells: number;
  /** The planning sidebar recognised Workday's table on this sheet. */
  sidebarRecognised: boolean;
  sidebarColumns: string[];
  /** Columns withheld from planning pages. */
  withheldColumns: string[];
  programBlocks: number;
  groups: Record<SidebarGroupKind, number>;
  sidebarRows: number;
  /** Rows above a table (title, run date, GPA lines): shown on the full APR only. */
  preambleRows: number;
  sidebarWarnings: string[];
}

export interface AprVerification {
  ok: boolean;
  /** Set when the file could not be imported at all. */
  error: AprImportErrorCode | null;
  format: "xlsx" | "pdf";
  bytes: number;
  sheets: SheetVerification[];
  formulas: { total: number; withStoredResult: number; withoutStoredResult: number } | null;
  /** True when the file carries macros. They are never read or run. */
  macros: boolean;
  warnings: string[];
  /** Plain statements of anything a person should look at. Never cell text. */
  findings: string[];
}

interface FileCounts {
  rowsBySheet: Map<string, number>;
  formulas: { total: number; withStoredResult: number; withoutStoredResult: number };
}

/** Counts rows and formulas straight from the file, without the workbook library. */
async function countFromFile(buf: Buffer): Promise<FileCounts | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const workbook = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (!workbook || !rels) return null;
    const attribute = (tag: string, name: string) => {
      const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
      return match ? decodeXmlText(match[1]!) : null;
    };
    const targets = new Map<string, string>();
    for (const rel of rels.match(/<Relationship\s[^>]*>/g) ?? []) {
      const id = attribute(rel, "Id");
      const target = attribute(rel, "Target");
      if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
    const shared = await zip.file("xl/sharedStrings.xml")?.async("string");
    const sharedEmpty = new Set<number>();
    const items: string[] = shared?.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? [];
    items.forEach((item, i) => {
      const parts: string[] = item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
      const text = parts.map((part) => part.replace(/<[^>]+>/g, "")).join("");
      if (decodeXmlText(text).trim() === "") sharedEmpty.add(i);
    });

    const counts: FileCounts = { rowsBySheet: new Map(), formulas: { total: 0, withStoredResult: 0, withoutStoredResult: 0 } };
    for (const sheet of workbook.match(/<sheet\s[^>]*>/g) ?? []) {
      const name = attribute(sheet, "name");
      const entry = zip.file(targets.get(attribute(sheet, "r:id") ?? "") ?? "");
      if (!name || !entry) continue;
      const xml = await entry.async("string");
      let rows = 0;
      for (const row of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
        let hasValue = false;
        for (const cell of row.match(/<c\s[^>]*[^/]>[\s\S]*?<\/c>/g) ?? []) {
          const formula = /<f[\s>/]/.test(cell);
          const value = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
          const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1];
          if (formula) {
            counts.formulas.total += 1;
            if (value !== undefined) counts.formulas.withStoredResult += 1;
            else counts.formulas.withoutStoredResult += 1;
          }
          const type = /\bt="(\w+)"/.exec(cell.slice(0, cell.indexOf(">")))?.[1] ?? "n";
          const shown =
            type === "s" ? value !== undefined && !sharedEmpty.has(Number(value)) : (value ?? inline ?? "").trim() !== "";
          if (shown) hasValue = true;
        }
        if (hasValue) rows += 1;
      }
      counts.rowsBySheet.set(name, rows);
    }
    return counts;
  } catch {
    return null;
  }
}

const NO_GROUPS: Record<SidebarGroupKind, number> = { university: 0, core: 0, major: 0, minor: 0, program: 0, other: 0 };

function verifyWorkbook(workbook: AprWorkbook, counts: FileCounts | null): { sheets: SheetVerification[]; findings: string[] } {
  const projection = projectForSidebar(workbook);
  const findings: string[] = [];
  const sheets = workbook.sheets.map((sheet): SheetVerification => {
    const projected = projection.sheets.find((candidate) => candidate.index === sheet.index);
    const groups = { ...NO_GROUPS };
    for (const group of projected?.groups ?? []) groups[group.kind] += 1;
    const rowsInFile = counts?.rowsBySheet.get(sheet.name) ?? null;
    // Rows hidden under a merged cell carry no text of their own and are not rows of content.
    const rowsNotKept = rowsInFile === null ? null : rowsInFile - sheet.rows.length;
    if (rowsNotKept !== null && rowsNotKept > 0) {
      findings.push(`Sheet ${sheet.index + 1}: the file holds ${rowsInFile} rows with a value and ${sheet.rows.length} were kept. Look at the ${rowsNotKept} that were not.`);
    }
    if (sheet.rows.length > 0 && !projected?.structured) {
      findings.push(`Sheet ${sheet.index + 1}: Workday's "Requirement | Status" header was not found, so the planning sidebar shows nothing for it. The full APR page still shows every row.`);
    }
    if ((projected?.groups ?? []).some((group) => group.kind === "other")) {
      findings.push(`Sheet ${sheet.index + 1}: some rows fell under "Other" because their requirement text named no program. Check the wording of those rows.`);
    }
    const withheld = projected?.omittedColumns.map(headerName) ?? [];
    if (projected?.structured && !withheld.some((header) => /grade/.test(header))) {
      findings.push(`Sheet ${sheet.index + 1}: no Grade column was recognised to withhold. Confirm the export has none.`);
    }
    return {
      index: sheet.index,
      visibility: sheet.visibility,
      rowsInFile,
      rowsKept: sheet.rows.length,
      rowsNotKept,
      columns: sheet.columnCount,
      cells: sheet.rows.reduce((n, row) => n + row.cells.length, 0),
      mergedCells: sheet.merges.length,
      sidebarRecognised: !!projected?.structured,
      sidebarColumns: (projected?.columns ?? []).map((column) => headerName(column.header)),
      withheldColumns: withheld,
      programBlocks: new Set((projected?.groups ?? []).map((group) => group.blockIndex)).size,
      groups,
      sidebarRows: (projected?.groups ?? []).reduce((n, group) => n + group.rows.length, 0),
      preambleRows: projected?.preambleRowCount ?? 0,
      sidebarWarnings: [...(projected?.warnings ?? [])],
    };
  });
  // A withheld column must never reach a planning page: prove it on this file.
  for (const sheet of projection.sheets) {
    if (sheet.columns.some((column) => isOmittedHeader(column.header))) {
      findings.push(`Sheet ${sheet.index + 1}: a column that must be withheld is among the sidebar's columns. This is a defect.`);
    }
  }
  return { sheets, findings };
}

export async function verifyAprExport(buf: Buffer, format: "xlsx" | "pdf"): Promise<AprVerification> {
  const base = { format, bytes: buf.length, macros: false, warnings: [] as string[] };
  let workbook: AprWorkbook;
  try {
    workbook = format === "xlsx" ? await readAprWorkbook(buf) : await readAprPdf(buf);
  } catch (err) {
    const error = err instanceof AprImportError ? err.code : "processing_failed";
    return { ...base, ok: false, error, sheets: [], formulas: null, findings: [`The file could not be imported: ${error}.`] };
  }
  const counts = format === "xlsx" ? await countFromFile(buf) : null;
  const { sheets, findings } = verifyWorkbook(workbook, counts);
  if (format === "xlsx" && !counts) findings.push("The file's own row count could not be read, so rows kept could not be compared with it.");
  if (counts && counts.formulas.withoutStoredResult > 0) {
    findings.push(`${counts.formulas.withoutStoredResult} formula cell(s) carry no stored result and are shown blank. CampusVal never calculates a formula.`);
  }
  return {
    ...base,
    ok: findings.every((finding) => !/defect|could not be imported|were not\.$/.test(finding)),
    error: null,
    sheets,
    formulas: counts?.formulas ?? null,
    macros: workbook.warnings.includes("macros_ignored"),
    warnings: [...workbook.warnings],
    findings,
  };
}
