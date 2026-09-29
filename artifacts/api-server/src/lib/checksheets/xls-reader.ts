/**
 * Reads a legacy Excel workbook (.xls, the binary format Excel used until
 * 2007) into the same structural copy an .xlsx becomes: sheets, rows, cells,
 * merged ranges, column widths.
 *
 * Safety. The reader (SheetJS) parses bytes into values and does nothing else:
 *   - macros are not read (`bookVBA: false`) and cannot run: nothing here
 *     executes anything a file contains;
 *   - formulas are not evaluated and not kept (`cellFormula: false`); a formula
 *     cell contributes the result the file stored for it, as it does in .xlsx;
 *   - links, comments and embedded objects are not read;
 *   - nothing is fetched: an external reference is a stored value like any other;
 *   - every limit that bounds an .xlsx bounds this too.
 * The bytes are checked to be an OLE2 workbook before this is called
 * (formats.ts), and the stored original is never written to.
 *
 * Bold and italics are read from the file's own font records (xls-styles.ts),
 * so a section heading is told from a requirement as it is in an .xlsx. Fills,
 * alignment and indentation are not read: they change how a cell looks, not
 * what is offered or what it says.
 */
import * as XLSX from "xlsx";
import { cleanCellText } from "../apr/cell-text";
import { APR_LIMITS } from "../apr/limits";
import type { AprCell, AprMerge, AprRow, AprSheet, AprStructureWarning } from "../apr/workbook-model";
import { ChecksheetError } from "./model";
import { readLegacyStyles, type LegacyCellStyle } from "./xls-styles";

export interface LegacyWorkbook {
  sheets: AprSheet[];
  warnings: AprStructureWarning[];
}

/** The VBA project of a legacy workbook lives in a storage with this name. */
const VBA_STORAGE = Buffer.from("_VBA_PROJECT_CUR", "utf16le");

interface LegacyCell {
  /** b boolean, e error, n number, d date, s text, z stub (no value). */
  t?: string;
  v?: unknown;
  /** The value as the workbook's number format displays it. */
  w?: string;
}

const ERROR_TEXT: Record<number, string> = {
  0x00: "#NULL!",
  0x07: "#DIV/0!",
  0x0f: "#VALUE!",
  0x17: "#REF!",
  0x1d: "#NAME?",
  0x24: "#NUM!",
  0x2a: "#N/A",
};

function displayText(cell: LegacyCell): string {
  if (!cell || cell.t === "z" || cell.v === undefined || cell.v === null) return "";
  if (typeof cell.w === "string") return cell.w;
  if (cell.t === "e") return typeof cell.v === "number" ? (ERROR_TEXT[cell.v] ?? "") : "";
  if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
  if (typeof cell.v === "number") return Number.isFinite(cell.v) ? String(Number(cell.v.toPrecision(11))) : "";
  return typeof cell.v === "string" ? cell.v : "";
}

function readSheet(
  ws: XLSX.WorkSheet,
  name: string,
  index: number,
  hidden: boolean,
  budget: { rows: number; cells: number },
  warnings: Set<AprStructureWarning>,
  styles: Map<string, LegacyCellStyle> | undefined,
): AprSheet {
  const merges: AprMerge[] = [];
  const covered = new Set<string>();
  for (const range of ws["!merges"] ?? []) {
    const merge: AprMerge = {
      r: range.s.r,
      c: range.s.c,
      rowSpan: range.e.r - range.s.r + 1,
      colSpan: range.e.c - range.s.c + 1,
    };
    if (merge.rowSpan < 1 || merge.colSpan < 1 || merge.rowSpan * merge.colSpan > APR_LIMITS.maxCells) continue;
    merges.push(merge);
    for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
      for (let c = merge.c; c < merge.c + merge.colSpan; c++) {
        if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
      }
    }
  }

  // Only the cells the file holds are visited; an absurd declared range costs nothing.
  const byRow = new Map<number, AprCell[]>();
  let maxColumn = 0;
  for (const address of Object.keys(ws)) {
    if (address.startsWith("!")) continue;
    const at = XLSX.utils.decode_cell(address);
    if (covered.has(`${at.r}:${at.c}`)) continue;
    const cleaned = cleanCellText(displayText(ws[address] as LegacyCell), APR_LIMITS.maxCellTextLength);
    if (cleaned.truncated) warnings.add("cell_text_truncated");
    if (cleaned.text.trim() === "") continue;
    if (at.c >= APR_LIMITS.maxColumns) throw new ChecksheetError("too_large");

    budget.cells += 1;
    if (budget.cells > APR_LIMITS.maxCells) throw new ChecksheetError("too_large");
    const cells = byRow.get(at.r) ?? [];
    if (cells.length === 0) {
      budget.rows += 1;
      if (budget.rows > APR_LIMITS.maxRows) throw new ChecksheetError("too_large");
      byRow.set(at.r, cells);
    }
    const style = styles?.get(`${at.r}:${at.c}`);
    cells.push({
      c: at.c,
      text: cleaned.text,
      ...(style?.bold ? { bold: true as const } : {}),
      ...(style?.italic ? { italic: true as const } : {}),
    });
    if (at.c + 1 > maxColumn) maxColumn = at.c + 1;
  }

  const rows: AprRow[] = [...byRow]
    .sort(([a], [b]) => a - b)
    .map(([r, cells]) => ({ r, cells: cells.sort((a, b) => a.c - b.c) }));
  const lastRow = rows.length > 0 ? rows[rows.length - 1]!.r + 1 : 0;

  for (const merge of merges) {
    maxColumn = Math.max(maxColumn, Math.min(merge.c + merge.colSpan, APR_LIMITS.maxColumns));
  }

  const columnWidths: (number | null)[] = [];
  for (let c = 0; c < maxColumn; c++) {
    const width = ws["!cols"]?.[c]?.wch;
    columnWidths.push(typeof width === "number" && width > 0 ? Math.round(width * 10) / 10 : null);
  }

  if (hidden) warnings.add("hidden_sheet");
  if (rows.length === 0) warnings.add("empty_sheet");

  return {
    name: cleanCellText(name, 100).text,
    index,
    visibility: hidden ? "hidden" : "visible",
    rowCount: lastRow,
    columnCount: maxColumn,
    columnWidths,
    rows,
    merges: merges.filter((m) => m.c < maxColumn && m.r < Math.max(lastRow, 1)),
  };
}

/** Throws ChecksheetError when the workbook must be refused. */
export function readLegacyWorkbook(buf: Buffer): LegacyWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      cellText: true,
      cellDates: false,
      // Column widths come with the style records; no other style is kept.
      cellStyles: true,
      bookVBA: false,
      bookFiles: false,
      bookDeps: false,
      WTF: false,
    });
  } catch (err) {
    // The library's message can quote file content; only the category leaves here.
    if (err instanceof Error && /password|encrypt/i.test(err.message)) throw new ChecksheetError("encrypted");
    throw new ChecksheetError("malformed_workbook");
  }

  const names = workbook.SheetNames ?? [];
  if (names.length === 0) throw new ChecksheetError("empty_workbook");
  if (names.length > APR_LIMITS.maxSheets) throw new ChecksheetError("too_large");

  const warnings = new Set<AprStructureWarning>();
  if (buf.includes(VBA_STORAGE)) warnings.add("macros_ignored");

  const styles = readLegacyStyles(buf);
  const budget = { rows: 0, cells: 0 };
  let sheets: AprSheet[];
  try {
    sheets = names.map((name, index) => {
      const hidden = (workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0) !== 0;
      return readSheet(workbook.Sheets[name] ?? {}, name, index, hidden, budget, warnings, styles.get(index));
    });
  } catch (err) {
    if (err instanceof ChecksheetError) throw err;
    throw new ChecksheetError("malformed_workbook");
  }

  if (sheets.every((sheet) => sheet.rows.length === 0)) throw new ChecksheetError("empty_workbook");
  return { sheets, warnings: [...warnings].sort() };
}
