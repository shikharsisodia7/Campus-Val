/**
 * Builds the display copy of an uploaded Degree Checksheet.
 *
 * Every format ends in one of two outcomes:
 *   - a render, and the document is "ready"; or
 *   - no render, and the document is "original_only": stored, downloadable and
 *     trackable through the My Tracking list, with a plain statement that it
 *     has no preview.
 * A file that is not what it claims to be, is damaged, or is password
 * protected is refused outright and nothing is stored.
 */
import { readAprWorkbook } from "../apr/workbook-reader";
import { AprImportError, type AprImportErrorCode } from "../apr/workbook-model";
import { readChecksheetDocx } from "./docx-reader";
import { assertBytesMatchFormat } from "./formats";
import { readJpegSize, readPngSize } from "./image-info";
import {
  CHECKSHEET_RENDER_VERSION,
  ChecksheetError,
  type ChecksheetErrorCode,
  type ChecksheetFormat,
  type ChecksheetRender,
  type ChecksheetSheet,
  type SpreadsheetRender,
} from "./model";
import { readChecksheetPdf } from "./pdf-info";
import { detectTrackingLayout, type LayoutRow } from "./tracking-layout";

export interface RenderOutcome {
  status: "ready" | "original_only";
  /** Why there is no preview, when the file itself was accepted. */
  note: ChecksheetErrorCode | null;
  render: ChecksheetRender | null;
}

const WORKBOOK_ERROR: Record<AprImportErrorCode, ChecksheetErrorCode> = {
  unsupported_type: "unsupported_type",
  legacy_xls_or_encrypted: "encrypted",
  not_a_workbook: "type_mismatch",
  malformed_workbook: "malformed_workbook",
  empty_workbook: "empty_workbook",
  too_large: "too_large",
  unrecognized_pdf: "preview_unavailable",
  storage_failure: "storage_failure",
  processing_failed: "processing_failed",
};

async function readSpreadsheet(buf: Buffer): Promise<SpreadsheetRender> {
  let workbook: Awaited<ReturnType<typeof readAprWorkbook>>;
  try {
    // The APR's workbook reader is a structural copier with no APR-specific
    // behaviour: sheets, rows, cells, merges. It is reused as it is.
    workbook = await readAprWorkbook(buf);
  } catch (err) {
    if (err instanceof AprImportError) throw new ChecksheetError(WORKBOOK_ERROR[err.code]);
    throw new ChecksheetError("malformed_workbook");
  }

  const sheets: ChecksheetSheet[] = workbook.sheets.map((sheet) => {
    const covered = new Set<string>();
    for (const merge of sheet.merges) {
      for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
        for (let c = merge.c; c < merge.c + merge.colSpan; c++) {
          if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
        }
      }
    }
    const rows: LayoutRow[] = sheet.rows.map((row) => ({
      r: row.r,
      cells: row.cells.map((cell) => ({ c: cell.c, text: cell.text, emphasized: !!cell.bold || !!cell.filled })),
    }));
    const tracking = detectTrackingLayout(rows, covered, `sheet:${sheet.index}:${sheet.name}`);
    // A control is only drawn inside the grid that is shown.
    tracking.cells = tracking.cells.filter((cell) => cell.c < sheet.columnCount);
    return { ...sheet, tracking };
  });

  return {
    version: CHECKSHEET_RENDER_VERSION,
    kind: "spreadsheet",
    sheets,
    warnings: workbook.warnings.filter((w) => w !== "reconstructed_from_pdf"),
  };
}

/** Throws ChecksheetError when the file must be refused. */
export async function buildChecksheetRender(buf: Buffer, format: ChecksheetFormat): Promise<RenderOutcome> {
  assertBytesMatchFormat(buf, format);

  switch (format) {
    case "pdf":
      return { status: "ready", note: null, render: await readChecksheetPdf(buf) };
    case "xlsx":
      return { status: "ready", note: null, render: await readSpreadsheet(buf) };
    case "xls":
      // No maintained, safe reader for the legacy binary format is in use here,
      // so the file is kept as an original rather than parsed.
      return { status: "original_only", note: "legacy_xls_no_preview", render: null };
    case "docx":
      try {
        return { status: "ready", note: null, render: await readChecksheetDocx(buf) };
      } catch (err) {
        if (err instanceof ChecksheetError && err.code === "preview_unavailable") {
          return { status: "original_only", note: "preview_unavailable", render: null };
        }
        throw err;
      }
    case "png": {
      const size = readPngSize(buf);
      return { status: "ready", note: null, render: { version: CHECKSHEET_RENDER_VERSION, kind: "image", ...size } };
    }
    case "jpg": {
      const size = readJpegSize(buf);
      return { status: "ready", note: null, render: { version: CHECKSHEET_RENDER_VERSION, kind: "image", ...size } };
    }
  }
}
