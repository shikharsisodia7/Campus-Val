/**
 * Builds the display copy of an uploaded Degree Checksheet.
 *
 * Every format ends in one of two outcomes:
 *   - a render, and the document is "ready"; or
 *   - no render, and the document is "original_only": stored, downloadable and
 *     trackable through the My Tracking list, with a plain statement that it
 *     has no preview. (A Word file with nothing to show.)
 * A file that is not what it claims to be, is damaged, or is password
 * protected is refused outright and nothing is stored.
 */
import JSZip from "jszip";
import { readAprWorkbook } from "../apr/workbook-reader";
import { AprImportError, type AprImportErrorCode } from "../apr/workbook-model";
import { jpegContentHash, pngContentHash } from "./content-hash";
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
import { readLegacyWorkbook } from "./xls-reader";
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

/** What a spreadsheet shows in a cell whose formula could not be calculated. */
const FORMULA_ERROR = /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!|CALC!|SPILL!)$/;

/**
 * Excel reserves the worksheet name "History", and the workbook library
 * refuses to open a file that has one. A History department's checklist is
 * named exactly that. The name is changed in a COPY of the file held in
 * memory, only so the library will read it; the stored original is untouched
 * and the sheet is shown under its real name.
 */
const RESERVED_SHEET_NAME = /(<sheet\b[^>]*\bname=")(history)(")/gi;
const STAND_IN_SUFFIX = "\u200b";

async function withReadableSheetNames(buf: Buffer): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file("xl/workbook.xml");
    if (!entry) return null;
    const xml = await entry.async("string");
    if (!RESERVED_SHEET_NAME.test(xml)) return null;
    RESERVED_SHEET_NAME.lastIndex = 0;
    zip.file("xl/workbook.xml", xml.replace(RESERVED_SHEET_NAME, `$1$2${STAND_IN_SUFFIX}$3`));
    return await zip.generateAsync({ type: "nodebuffer" });
  } catch {
    return null;
  }
}

type StructuralWorkbook = Pick<Awaited<ReturnType<typeof readAprWorkbook>>, "sheets" | "warnings">;

export async function readModernWorkbook(buf: Buffer): Promise<StructuralWorkbook> {
  let workbook: Awaited<ReturnType<typeof readAprWorkbook>>;
  try {
    // The APR's workbook reader is a structural copier with no APR-specific
    // behaviour: sheets, rows, cells, merges. It is reused as it is.
    workbook = await readAprWorkbook(buf);
  } catch (err) {
    const readable = err instanceof AprImportError && err.code === "malformed_workbook" ? await withReadableSheetNames(buf) : null;
    if (!readable) {
      if (err instanceof AprImportError) throw new ChecksheetError(WORKBOOK_ERROR[err.code]);
      throw new ChecksheetError("malformed_workbook");
    }
    try {
      workbook = await readAprWorkbook(readable);
    } catch (again) {
      if (again instanceof AprImportError) throw new ChecksheetError(WORKBOOK_ERROR[again.code]);
      throw new ChecksheetError("malformed_workbook");
    }
    for (const sheet of workbook.sheets) sheet.name = sheet.name.replace(STAND_IN_SUFFIX, "");
  }
  return workbook;
}

/** The display copy of a workbook, whichever Excel format it was read from. */
function spreadsheetRender(workbook: StructuralWorkbook): SpreadsheetRender {
  // A formula the export could not calculate leaves an error value ("#N/A")
  // where the spreadsheet itself shows a result or nothing. It is not the
  // department's text, so it is not shown; the preview says that calculated
  // cells are missing. The cell is the spreadsheet's own, though: it is
  // never offered to the student as a place to write.
  let hiddenErrors = 0;
  const calculated = new Map<number, Set<string>>();
  for (const sheet of workbook.sheets) {
    const hidden = new Set<string>();
    for (const row of sheet.rows) {
      const kept = row.cells.filter((cell) => !FORMULA_ERROR.test(cell.text.trim()));
      for (const cell of row.cells) if (!kept.includes(cell)) hidden.add(`${row.r}:${cell.c}`);
      row.cells = kept;
    }
    sheet.rows = sheet.rows.filter((row) => row.cells.length > 0);
    hiddenErrors += hidden.size;
    calculated.set(sheet.index, hidden);
  }

  const sheets: ChecksheetSheet[] = workbook.sheets.map((sheet) => {
    const covered = new Set<string>(calculated.get(sheet.index));
    for (const merge of sheet.merges) {
      for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
        for (let c = merge.c; c < merge.c + merge.colSpan; c++) {
          if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
        }
      }
    }
    const rows: LayoutRow[] = sheet.rows.map((row) => ({
      r: row.r,
      cells: row.cells.map((cell) => ({ c: cell.c, text: cell.text, emphasized: !!cell.bold })),
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
    warnings: [
      ...workbook.warnings.filter((w) => w !== "reconstructed_from_pdf"),
      ...(hiddenErrors > 0 ? ["calculated_cells_not_shown"] : []),
    ].sort(),
  };
}

/** Throws ChecksheetError when the file must be refused. */
export async function buildChecksheetRender(buf: Buffer, format: ChecksheetFormat): Promise<RenderOutcome> {
  assertBytesMatchFormat(buf, format);

  switch (format) {
    case "pdf":
      return { status: "ready", note: null, render: await readChecksheetPdf(buf) };
    case "xlsx":
      return { status: "ready", note: null, render: spreadsheetRender(await readModernWorkbook(buf)) };
    case "xls":
      // Read like any other workbook; a damaged one is refused like any other.
      return { status: "ready", note: null, render: spreadsheetRender(readLegacyWorkbook(buf)) };
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
      return {
        status: "ready",
        note: null,
        render: { version: CHECKSHEET_RENDER_VERSION, kind: "image", ...size, contentHash: pngContentHash(buf) },
      };
    }
    case "jpg": {
      const size = readJpegSize(buf);
      return {
        status: "ready",
        note: null,
        render: { version: CHECKSHEET_RENDER_VERSION, kind: "image", ...size, contentHash: jpegContentHash(buf) },
      };
    }
  }
}
