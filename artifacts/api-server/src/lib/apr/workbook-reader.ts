/**
 * Reads an uploaded Workday Academic Progress Report (.xlsx) into the
 * structural AprWorkbook model.
 *
 * What this does: copy sheets, rows, cells, merged ranges and a little
 * formatting, in source order.
 * What this does NOT do: decide anything. No course is matched, no requirement
 * is judged, nothing is summarised or renamed.
 *
 * Safety: the bytes are checked first (file-guard.ts); ExcelJS parses XML and
 * never runs macros or evaluates formulas; every limit is enforced while
 * reading so an oversized file is refused rather than held in memory.
 *
 * Formulas: a formula cell shows the result the file STORED for it. Where the
 * library loses that result (it drops a stored 0), it is read from the file
 * itself (formula-cache.ts). Nothing is ever calculated.
 */
import ExcelJS from "exceljs";
import { guardXlsxBytes } from "./file-guard";
import { APR_LIMITS } from "./limits";
import { cellDisplayText, cleanCellText } from "./cell-text";
import { readFormulaCache, type FormulaCache } from "./formula-cache";
import {
  APR_WORKBOOK_VERSION,
  AprImportError,
  type AprCell,
  type AprMerge,
  type AprRow,
  type AprSheet,
  type AprStructureWarning,
  type AprWorkbook,
} from "./workbook-model";

function columnLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** "B3:D5" -> merge anchored at B3 spanning 3 rows x 3 columns. */
export function parseMergeRange(range: string): AprMerge | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$/.exec(range.trim().toUpperCase());
  if (!m) return null;
  const c1 = columnLettersToIndex(m[1]!);
  const r1 = Number(m[2]) - 1;
  const c2 = columnLettersToIndex(m[3]!);
  const r2 = Number(m[4]) - 1;
  if (r2 < r1 || c2 < c1) return null;
  return { r: r1, c: c1, rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 };
}

function hasFill(fill: ExcelJS.Fill | undefined): boolean {
  if (!fill || fill.type !== "pattern") return false;
  if (fill.pattern === "none") return false;
  const argb = fill.fgColor?.argb?.toUpperCase();
  // A white fill is indistinguishable from no fill on screen.
  return argb !== "FFFFFFFF" && argb !== "00FFFFFF";
}

function readSheet(
  ws: ExcelJS.Worksheet,
  index: number,
  budget: { rows: number; cells: number },
  warnings: Set<AprStructureWarning>,
  stored: FormulaCache,
): AprSheet {
  const storedHere = stored.get(ws.name);
  const merges: AprMerge[] = [];
  const rawMerges = (ws.model as { merges?: string[] }).merges ?? [];
  // Cells covered by a merge (other than its anchor) repeat the anchor's value
  // in ExcelJS; they are skipped so the text appears once, where Excel shows it.
  const covered = new Set<string>();
  for (const range of rawMerges) {
    const merge = parseMergeRange(range);
    if (!merge) continue;
    merges.push(merge);
    for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
      for (let c = merge.c; c < merge.c + merge.colSpan; c++) {
        if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
      }
    }
  }

  const rows: AprRow[] = [];
  let maxColumn = 0;
  let lastRow = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: AprCell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const r = rowNumber - 1;
      const c = colNumber - 1;
      if (covered.has(`${r}:${c}`)) return;
      if (c >= APR_LIMITS.maxColumns) throw new AprImportError("too_large");

      let display = cellDisplayText({ value: cell.value, numFmt: cell.numFmt });
      if (display.formulaWithoutValue) {
        const value = storedHere?.get(cell.address);
        if (value !== undefined) display = cellDisplayText({ value, numFmt: cell.numFmt });
        else warnings.add("formula_without_cached_value");
      }
      const cleaned = cleanCellText(display.text, APR_LIMITS.maxCellTextLength);
      if (cleaned.truncated) warnings.add("cell_text_truncated");
      if (cleaned.text.trim() === "") return;

      const out: AprCell = { c, text: cleaned.text };
      if (cell.font?.bold) out.bold = true;
      if (cell.font?.italic) out.italic = true;
      const indent = cell.alignment?.indent;
      if (typeof indent === "number" && indent > 0) out.indent = Math.min(indent, 15);
      const h = cell.alignment?.horizontal;
      if (h === "center" || h === "right" || h === "left") out.align = h;
      if (hasFill(cell.fill)) out.filled = true;
      cells.push(out);

      budget.cells += 1;
      if (budget.cells > APR_LIMITS.maxCells) throw new AprImportError("too_large");
      if (c + 1 > maxColumn) maxColumn = c + 1;
    });
    if (cells.length === 0) return;
    budget.rows += 1;
    if (budget.rows > APR_LIMITS.maxRows) throw new AprImportError("too_large");
    cells.sort((a, b) => a.c - b.c);
    rows.push({ r: rowNumber - 1, cells });
    lastRow = rowNumber;
  });

  for (const merge of merges) {
    maxColumn = Math.max(maxColumn, Math.min(merge.c + merge.colSpan, APR_LIMITS.maxColumns));
  }

  const columnWidths: (number | null)[] = [];
  for (let c = 0; c < maxColumn; c++) {
    const width = ws.getColumn(c + 1).width;
    columnWidths.push(typeof width === "number" && width > 0 ? Math.round(width * 10) / 10 : null);
  }

  const visibility = ws.state === "visible" ? "visible" : "hidden";
  if (visibility === "hidden") warnings.add("hidden_sheet");
  if (rows.length === 0) warnings.add("empty_sheet");

  return {
    name: cleanCellText(ws.name ?? `Sheet ${index + 1}`, 100).text,
    index,
    visibility,
    rowCount: lastRow,
    columnCount: maxColumn,
    columnWidths,
    rows,
    // Merges that start beyond the content or outside the limits carry nothing to show.
    merges: merges.filter((m) => m.c < maxColumn && m.r < Math.max(lastRow, 1)),
  };
}

export async function readAprWorkbook(buf: Buffer): Promise<AprWorkbook> {
  const guard = guardXlsxBytes(buf);

  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS's declared parameter type predates Node's generic Buffer.
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    // The library's message can quote file content; only the category leaves here.
    throw new AprImportError("malformed_workbook");
  }

  if (wb.worksheets.length === 0) throw new AprImportError("empty_workbook");
  if (wb.worksheets.length > APR_LIMITS.maxSheets) throw new AprImportError("too_large");

  const warnings = new Set<AprStructureWarning>();
  if (guard.hasMacros) warnings.add("macros_ignored");

  const stored = await readFormulaCache(buf);
  const budget = { rows: 0, cells: 0 };
  let sheets: AprSheet[];
  try {
    sheets = wb.worksheets.map((ws, i) => readSheet(ws, i, budget, warnings, stored));
  } catch (err) {
    if (err instanceof AprImportError) throw err;
    throw new AprImportError("malformed_workbook");
  }

  if (sheets.every((s) => s.rows.length === 0)) throw new AprImportError("empty_workbook");

  return {
    version: APR_WORKBOOK_VERSION,
    sourceFormat: "xlsx",
    sheets,
    warnings: [...warnings].sort(),
  };
}

/** Every cell's text, one row per line — used only to look for a "Student ID:" label. */
export function workbookPlainText(workbook: AprWorkbook, maxRowsPerSheet = 40): string {
  return workbook.sheets
    .flatMap((s) => s.rows.slice(0, maxRowsPerSheet).map((row) => row.cells.map((c) => c.text).join(" ")))
    .join("\n");
}
