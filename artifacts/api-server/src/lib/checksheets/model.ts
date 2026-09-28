/**
 * The DISPLAY copy of an uploaded Degree Checksheet.
 *
 * A render is what CampusVal needs in order to show a department document
 * inside the app: a grid for a workbook, blocks for a Word document, page
 * sizes for a PDF, dimensions for a picture. It is derived once, when the file
 * is uploaded, and thrown away when the file is replaced.
 *
 * It is a copy, not a reading. There is no field here for a requirement, a
 * course, a unit count or a rule, and nothing in this folder imports the
 * catalog or the degree requirements. `tracking` records only WHERE a
 * spreadsheet left room for the student to write.
 */
import type { AprSheet } from "../apr/workbook-model";

export const CHECKSHEET_RENDER_VERSION = 1;

export type ChecksheetFormat = "pdf" | "xlsx" | "xls" | "docx" | "png" | "jpg";

export const CHECKSHEET_MIME: Record<ChecksheetFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
};

/** A column the department left for the student to fill in. */
export interface TrackingColumn {
  /** Source column index (0 = column A). */
  c: number;
  field: "status" | "term";
  /** The header text, as the file has it. */
  header: string;
  /** Source row index of the header row this column was found in. */
  headerRow: number;
}

/** One empty cell, under a tracking column, where the student may enter tracking. */
export interface TrackingCell {
  r: number;
  c: number;
  field: "status" | "term";
  /** Hash of the row this cell sits in. Compared on replacement; never the text. */
  fingerprint: string;
}

export interface TrackingLayout {
  columns: TrackingColumn[];
  cells: TrackingCell[];
}

export interface ChecksheetSheet extends AprSheet {
  tracking: TrackingLayout;
}

export interface SpreadsheetRender {
  version: typeof CHECKSHEET_RENDER_VERSION;
  kind: "spreadsheet";
  sheets: ChecksheetSheet[];
  warnings: string[];
}

export interface PdfPageInfo {
  /** Page size in PDF points, at no rotation beyond the page's own. */
  width: number;
  height: number;
  /** Hash of the page's text. Compared on replacement; never the text itself. */
  textHash: string | null;
}

export interface PdfRender {
  version: typeof CHECKSHEET_RENDER_VERSION;
  kind: "pdf";
  pages: PdfPageInfo[];
}

export interface ImageRender {
  version: typeof CHECKSHEET_RENDER_VERSION;
  kind: "image";
  width: number;
  height: number;
}

export interface DocTextRun {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  /** An http(s) link from the document. Shown as a link, opened in a new tab. */
  href?: string;
}

export interface DocTableCell {
  runs: DocTextRun[];
  header?: true;
  colSpan?: number;
  rowSpan?: number;
}

export type DocBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: DocTextRun[] }
  | { type: "paragraph"; runs: DocTextRun[] }
  | { type: "list-item"; ordered: boolean; depth: number; runs: DocTextRun[] }
  | { type: "table"; rows: DocTableCell[][]; tracking: TrackingLayout }
  | { type: "image"; mime: "image/png" | "image/jpeg" | "image/gif"; data: string; alt: string }
  | { type: "image-omitted"; alt: string };

export interface DocumentRender {
  version: typeof CHECKSHEET_RENDER_VERSION;
  kind: "document";
  blocks: DocBlock[];
  warnings: string[];
}

export type ChecksheetRender = SpreadsheetRender | PdfRender | ImageRender | DocumentRender;

/** Why an upload was refused, or why it has no preview. Safe to log and to show. */
export type ChecksheetErrorCode =
  | "unsupported_type"
  | "type_mismatch"
  | "empty_file"
  | "too_large"
  | "encrypted"
  | "malformed_pdf"
  | "malformed_workbook"
  | "empty_workbook"
  | "malformed_document"
  | "malformed_image"
  | "legacy_xls_no_preview"
  | "preview_unavailable"
  | "storage_failure"
  | "processing_failed";

export const CHECKSHEET_ERROR_MESSAGE: Record<ChecksheetErrorCode, string> = {
  unsupported_type:
    "This file type isn't supported. Upload a PDF, an Excel workbook (.xlsx or .xls), a Word document (.docx), or a PNG or JPEG image.",
  type_mismatch:
    "This file's contents don't match its file type. Download the document again from the department and upload that copy.",
  empty_file: "This file is empty.",
  too_large: "This file is larger than CampusVal can display.",
  encrypted:
    "This file is password-protected, so CampusVal cannot open it. Save a copy without a password and upload that.",
  malformed_pdf: "This PDF is damaged and could not be opened. Download it again and re-upload.",
  malformed_workbook: "This workbook is damaged and could not be opened. Download it again and re-upload.",
  empty_workbook: "This workbook has no content.",
  malformed_document: "This Word document is damaged and could not be opened. Download it again and re-upload.",
  malformed_image: "This image is damaged or is not a PNG or JPEG.",
  legacy_xls_no_preview:
    "This is the older Excel format (.xls). It is stored and you can open the original, but CampusVal cannot preview it. Save it as .xlsx and use Replace to see it here.",
  preview_unavailable:
    "CampusVal could not build a preview of this file. It is stored and you can open the original.",
  storage_failure: "The file could not be read from storage. Try uploading it again.",
  processing_failed: "The file could not be processed. Try uploading it again.",
};

export class ChecksheetError extends Error {
  constructor(public readonly code: ChecksheetErrorCode) {
    super(code);
    this.name = "ChecksheetError";
  }
}

export const CHECKSHEET_CATEGORIES = [
  "major_checksheet",
  "minor_checksheet",
  "four_year_plan",
  "flowchart",
  "advising_resource",
  "other",
] as const;
export type ChecksheetCategory = (typeof CHECKSHEET_CATEGORIES)[number];

/** Display order of the library: checksheets first, other resources last. */
export const CHECKSHEET_CATEGORY_RANK: Record<ChecksheetCategory, number> = {
  major_checksheet: 0,
  minor_checksheet: 1,
  four_year_plan: 2,
  flowchart: 3,
  advising_resource: 4,
  other: 5,
};

export const CHECKSHEET_PROGRAM_ROLES = ["major", "additional_major", "minor", "additional_minor", "general"] as const;
export type ChecksheetProgramRole = (typeof CHECKSHEET_PROGRAM_ROLES)[number];

export const TRACKING_STATUSES = ["not_started", "planned", "in_progress", "completed"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** CampusVal's term names, as used by plans and schedules. */
export const TRACKING_TERMS = ["fall", "winter", "spring", "summer"] as const;
export type TrackingTerm = (typeof TRACKING_TERMS)[number];

export const TRACKING_YEAR_RANGE = { min: 2000, max: 2100 } as const;
