/**
 * The STRUCTURAL copy of an uploaded Workday Academic Progress Report workbook.
 *
 * This is the only thing CampusVal keeps about an APR's content, and it is a
 * copy of the spreadsheet — sheets, rows, cells, merges, a little formatting —
 * not a reading of it. There is deliberately no field here for "completed",
 * "matched course", "requirement met": Workday's own words are in the cells,
 * and the student compares them against the plan.
 *
 * Indexes are zero-based and refer to the SOURCE sheet, so a rendered cell can
 * always be traced back to where it sat in the file.
 */

export const APR_WORKBOOK_VERSION = 1;

export interface AprCell {
  /** Source column index (0 = column A). */
  c: number;
  /** The cell as Excel displayed it. Never a formula, never markup. */
  text: string;
  bold?: true;
  italic?: true;
  /** Excel's indent level — Workday uses it for requirement hierarchy. */
  indent?: number;
  align?: "left" | "center" | "right";
  /** The cell had a background fill (a heading band). The colour is not kept. */
  filled?: true;
}

export interface AprRow {
  /** Source row index (0 = row 1). */
  r: number;
  /** Only non-empty cells, in column order. */
  cells: AprCell[];
}

export interface AprMerge {
  r: number;
  c: number;
  rowSpan: number;
  colSpan: number;
}

export interface AprSheet {
  name: string;
  index: number;
  /** "hidden" sheets are kept (nothing is dropped) and labelled as such. */
  visibility: "visible" | "hidden";
  rowCount: number;
  columnCount: number;
  /** Relative column widths (Excel character units), when the file had them. */
  columnWidths: (number | null)[];
  rows: AprRow[];
  merges: AprMerge[];
}

/** Non-sensitive codes describing what the importer could not do. Never cell text. */
export type AprStructureWarning =
  | "hidden_sheet"
  | "empty_sheet"
  | "formula_without_cached_value"
  | "cell_text_truncated"
  | "macros_ignored"
  /** The table was recovered from a PDF's text positions, not read from cells. */
  | "reconstructed_from_pdf";

export interface AprWorkbook {
  version: typeof APR_WORKBOOK_VERSION;
  sourceFormat: "xlsx" | "pdf";
  sheets: AprSheet[];
  warnings: AprStructureWarning[];
}

/** Why an upload could not be turned into a workbook. Safe to log and to show. */
export type AprImportErrorCode =
  | "unsupported_type"
  | "legacy_xls_or_encrypted"
  | "not_a_workbook"
  | "malformed_workbook"
  | "empty_workbook"
  | "too_large"
  | "unrecognized_pdf"
  | "storage_failure"
  | "processing_failed";

export const APR_IMPORT_ERROR_MESSAGE: Record<AprImportErrorCode, string> = {
  unsupported_type:
    "This file type isn't supported. Upload the Excel (.xlsx) file exported from Workday's Academic Progress report.",
  legacy_xls_or_encrypted:
    "This file is password-protected or in the older .xls format, which CampusVal cannot read. Export the report from Workday as .xlsx without a password.",
  not_a_workbook: "This file is not an Excel workbook. Upload the .xlsx file exported from Workday.",
  malformed_workbook: "This workbook is damaged and could not be opened. Export it from Workday again and re-upload.",
  empty_workbook: "This workbook has no content. Export your Academic Progress report from Workday again.",
  too_large: "This workbook is larger than CampusVal can display.",
  unrecognized_pdf:
    "CampusVal could not find the Academic Progress table in this PDF. It is kept as an original file; upload the Excel (.xlsx) export to compare while planning.",
  storage_failure: "The file could not be read from storage. Try uploading it again.",
  processing_failed: "The workbook could not be processed. Your file is stored safely — try again, or re-export it from Workday.",
};

export class AprImportError extends Error {
  constructor(public readonly code: AprImportErrorCode) {
    super(code);
    this.name = "AprImportError";
  }
}
