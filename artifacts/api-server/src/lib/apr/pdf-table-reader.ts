/**
 * Reads the table out of a Workday "View My Academic Progress" PDF, by geometry.
 *
 * A PDF has no cells — only pieces of text at positions. But Workday typesets
 * the report as a strict table, so the table can be recovered from where the
 * text sits, without reading what it says:
 *
 *   COLUMNS  Every cell is left-aligned, so all the text in one column starts
 *            at the same x. The seven column headers tell which x is which.
 *   ROWS     Inside a cell, wrapped lines are one line-height apart. Between
 *            two table rows there is cell padding as well, so the gap is
 *            larger. A gap above the wrap spacing starts a new row.
 *   BLOCKS   Text that does not start at a column's x is not in the table: it
 *            is a program title ("Finance Major Requirements") or one of its
 *            summary lines, and it ends the table above it.
 *
 * This is structure only. No course is recognised, no status is interpreted,
 * nothing is matched to a catalog. The result is the same structural workbook
 * an Excel upload produces, so the sidebar treats both alike.
 *
 * It refuses rather than guesses: if the header is not found, a column cannot
 * be located, or the recovered Units column does not look like a column of
 * numbers (the sign of misaligned columns), it reports the PDF as unreadable
 * and the document is kept as an original only.
 */
import { getDocumentProxy } from "unpdf";
import { APR_LIMITS } from "./limits";
import { cleanCellText } from "./cell-text";
import {
  APR_WORKBOOK_VERSION,
  AprImportError,
  type AprCell,
  type AprRow,
  type AprWorkbook,
} from "./workbook-model";

const MAX_PAGES = 80;
const COLUMN_COUNT = 7;
/** How far a text start may sit from its column's x and still belong to it (points). */
const X_TOLERANCE = 1.5;
const Y_TOLERANCE = 0.75;

interface Piece {
  x: number;
  /** Distance of the text baseline from the TOP of the page. */
  y: number;
  width: number;
  size: number;
  text: string;
}

interface Header {
  /** Baseline of the lowest header line; the table body starts below it. */
  bottom: number;
  top: number;
  /** x where each of the 7 header labels starts. */
  anchors: number[];
}

const HEADER_LABELS = ["Requirement", "Status", "Remaining", "Registrations Used", "Academic", "Units", "Grade"] as const;

function sameLine(a: number, b: number): boolean {
  return Math.abs(a - b) <= Y_TOLERANCE;
}

function findHeaders(pieces: Piece[]): Header[] {
  const headers: Header[] = [];
  for (const start of pieces.filter((p) => p.text === "Requirement")) {
    const near = pieces.filter((p) => p.y >= start.y - 20 && p.y <= start.y + 20);
    const found: Piece[] = [];
    for (const label of HEADER_LABELS) {
      const hit = near.find((p) => p.text === label);
      if (hit) found.push(hit);
    }
    if (found.length !== COLUMN_COUNT) continue;
    const anchors = found.map((p) => p.x);
    // The labels must run left to right in the expected order.
    if (!anchors.every((x, i) => i === 0 || x > anchors[i - 1]!)) continue;
    const all = near.filter(
      (p) => (HEADER_LABELS as readonly string[]).includes(p.text) || p.text === "Satisfied With" || p.text === "Period",
    );
    headers.push({
      top: Math.min(...all.map((p) => p.y)),
      bottom: Math.max(...all.map((p) => p.y)),
      anchors,
    });
  }
  return headers.sort((a, b) => a.top - b.top);
}

/**
 * Where each column's text starts: the most common text-start x that lies to
 * the left of (or at) that column's header label and to the right of the
 * previous column's.
 */
function locateColumns(bodyStarts: number[], anchors: number[]): number[] | null {
  const counts = new Map<number, number>();
  for (const x of bodyStarts) {
    const key = Math.round(x * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const edges: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const lower = i === 0 ? -Infinity : anchors[i - 1]!;
    const upper = anchors[i]! + X_TOLERANCE;
    let best: { x: number; n: number } | null = null;
    for (const [x, n] of counts) {
      if (x > lower + X_TOLERANCE && x <= upper && (!best || n > best.n)) best = { x, n };
    }
    if (best) edges.push(best.x);
    else if (i === 0) return null; // no requirement text at all: not this kind of table
    else edges.push((Math.max(lower, edges[i - 1]!) + anchors[i]!) / 2); // an empty column
  }
  return edges.every((x, i) => i === 0 || x > edges[i - 1]!) ? edges : null;
}

function columnOf(x: number, edges: number[]): number {
  for (let c = 0; c < edges.length; c++) if (Math.abs(x - edges[c]!) <= X_TOLERANCE) return c;
  return -1;
}

/**
 * When a cell's text runs right up to the next column, the PDF stores both
 * cells as ONE piece of text ("Healthcare Innovation Minor GPA Satisfied").
 * Such a piece starts in one column and extends past the start of the next. It
 * is cut at the word boundary that falls nearest that column's x, and the
 * remainder is placed in the next column.
 */
function splitAcrossColumns(piece: Piece, edges: number[]): Piece[] {
  const out: Piece[] = [];
  let rest = piece;
  for (let guard = 0; guard < edges.length; guard++) {
    const c = columnOf(rest.x, edges);
    const next = c >= 0 ? edges[c + 1] : undefined;
    if (next === undefined || rest.width <= 0 || rest.x + rest.width <= next + X_TOLERANCE) break;
    const text = rest.text;
    let best: { at: number; distance: number } | null = null;
    for (let i = 1; i < text.length - 1; i++) {
      if (text[i] !== " ") continue;
      // Where the character after this space sits, assuming even character widths.
      const x = rest.x + (rest.width * (i + 1)) / text.length;
      const distance = Math.abs(x - next);
      if (!best || distance < best.distance) best = { at: i, distance };
    }
    // Proportional type makes the estimate rough, never wild.
    if (!best || best.distance > 24) break;
    const left = text.slice(0, best.at).trim();
    const right = text.slice(best.at + 1).trim();
    if (!left || !right) break;
    out.push({ ...rest, text: left, width: next - rest.x - 4 });
    rest = { ...rest, x: next, text: right, width: rest.x + rest.width - next };
  }
  out.push(rest);
  return out;
}

function lineText(pieces: Piece[]): string {
  return pieces
    .sort((a, b) => a.x - b.x)
    .map((p) => p.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Page chrome Workday prints on every page: the title, clock, date, "Page 3 of 12". */
function withoutPageFurniture(pieces: Piece[]): Piece[] {
  const marker = pieces.find((p) => /^Page \d+ of \d+$/.test(p.text));
  if (!marker) return pieces;
  return pieces.filter((p) => p.y > marker.y + Y_TOLERANCE);
}

interface OutRow {
  cells: AprCell[];
}

function headerRows(): OutRow[] {
  const cell = (c: number, text: string): AprCell => ({ c, text, bold: true, filled: true, align: "center" });
  return [
    { cells: [cell(0, "Requirement"), cell(1, "Status"), cell(2, "Remaining"), cell(3, "Satisfied With")] },
    { cells: [cell(3, "Registrations Used"), cell(4, "Academic Period"), cell(5, "Units"), cell(6, "Grade")] },
  ];
}

export async function readAprPdf(buf: Buffer): Promise<AprWorkbook> {
  if (buf.length === 0) throw new AprImportError("empty_workbook");
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AprImportError("unsupported_type");

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  } catch {
    throw new AprImportError("malformed_workbook");
  }
  if (pdf.numPages > MAX_PAGES) throw new AprImportError("too_large");

  // Pass 1: every page's text pieces, and the headers on it.
  const pages: { pieces: Piece[]; headers: Header[] }[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        const text = (item.str ?? "").trim();
        if (!text || !item.transform) continue;
        pieces.push({
          x: item.transform[4]!,
          y: height - item.transform[5]!,
          width: item.width ?? 0,
          size: item.height ?? 0,
          text,
        });
      }
      const body = withoutPageFurniture(pieces);
      pages.push({ pieces: body, headers: findHeaders(body) });
    }
  } catch {
    throw new AprImportError("malformed_workbook");
  }

  const firstHeader = pages.flatMap((p) => p.headers)[0];
  if (!firstHeader) throw new AprImportError("unrecognized_pdf");

  // Column positions are a property of the whole document.
  const bodyStarts: number[] = [];
  for (const page of pages) {
    for (const header of page.headers) {
      for (const p of page.pieces) if (p.y > header.bottom + Y_TOLERANCE) bodyStarts.push(p.x);
    }
  }
  const edges = locateColumns(bodyStarts, firstHeader.anchors);
  if (!edges) throw new AprImportError("unrecognized_pdf");

  // The wrap spacing is the type size; a larger step means a new row.
  const typeSize = median(pages.flatMap((p) => p.pieces.map((x) => x.size)).filter((s) => s > 0)) || 9;
  const rowBreak = typeSize * 1.12;

  // Pass 2: walk the document top to bottom.
  const out: OutRow[] = [];
  let inTable = false;
  let headerPending = true; // emit a header when a table (re)starts after non-table text
  let current: Map<number, string[]> | null = null;
  let lastY = -Infinity;
  let cellBudget = 0;

  const flush = () => {
    if (!current) return;
    const cells: AprCell[] = [];
    for (const [c, lines] of [...current.entries()].sort((a, b) => a[0] - b[0])) {
      const { text } = cleanCellText(lines.join(" ").replace(/\s+/g, " ").trim(), APR_LIMITS.maxCellTextLength);
      if (text) cells.push({ c, text });
    }
    if (cells.length > 0) {
      out.push({ cells });
      cellBudget += cells.length;
      if (out.length > APR_LIMITS.maxRows || cellBudget > APR_LIMITS.maxCells) throw new AprImportError("too_large");
    }
    current = null;
  };

  for (const page of pages) {
    const ys = [...new Set(page.pieces.map((p) => Math.round(p.y * 4) / 4))].sort((a, b) => a - b);
    // A new page never continues a row's line spacing.
    lastY = -Infinity;
    for (const y of ys) {
      const raw = page.pieces.filter((p) => sameLine(p.y, y));
      if (raw.length === 0) continue;
      const line = inTable ? raw.flatMap((p) => splitAcrossColumns(p, edges)) : raw;

      const header = page.headers.find((h) => y >= h.top - Y_TOLERANCE && y <= h.bottom + Y_TOLERANCE);
      if (header) {
        flush();
        if (headerPending) out.push(...headerRows());
        headerPending = false;
        inTable = true;
        lastY = -Infinity;
        continue;
      }

      const columns = line.map((p) => columnOf(p.x, edges));
      const tabular = inTable && columns.every((c) => c >= 0);
      if (!tabular) {
        // A title or a summary line: label, and a value beside it if there is one.
        flush();
        inTable = false;
        headerPending = true;
        const sorted = [...line].sort((a, b) => a.x - b.x);
        const gapAt = sorted.findIndex((p, i) => i > 0 && p.x - (sorted[i - 1]!.x + sorted[i - 1]!.width) > 8);
        const label = lineText(gapAt > 0 ? sorted.slice(0, gapAt) : sorted);
        const value = gapAt > 0 ? lineText(sorted.slice(gapAt)) : "";
        const cells: AprCell[] = [];
        if (label) cells.push({ c: 0, text: cleanCellText(label, APR_LIMITS.maxCellTextLength).text });
        if (value) cells.push({ c: 1, text: cleanCellText(value, APR_LIMITS.maxCellTextLength).text });
        if (cells.length > 0) out.push({ cells });
        continue;
      }

      if (!current || y - lastY > rowBreak) {
        flush();
        current = new Map();
      }
      const byColumn = new Map<number, Piece[]>();
      line.forEach((p, i) => {
        const c = columns[i]!;
        const list = byColumn.get(c);
        if (list) list.push(p);
        else byColumn.set(c, [p]);
      });
      for (const [c, pieces] of byColumn) {
        const lines = current.get(c);
        const text = lineText(pieces);
        if (lines) lines.push(text);
        else current.set(c, [text]);
      }
      lastY = y;
    }
    flush();
  }

  // Self-check: recovered columns must look like the columns they claim to be.
  const dataRows = out.filter((r) => !r.cells.some((c) => c.bold));
  const units = dataRows.flatMap((r) => r.cells.filter((c) => c.c === 5).map((c) => c.text));
  const grades = dataRows.flatMap((r) => r.cells.filter((c) => c.c === 6).map((c) => c.text));
  const statuses = dataRows.flatMap((r) => r.cells.filter((c) => c.c === 1 && r.cells.some((x) => x.c === 0 && x.text.length > 25)).map((c) => c.text));
  const share = (values: string[], ok: (v: string) => boolean) =>
    values.length === 0 ? 1 : values.filter(ok).length / values.length;
  const aligned =
    share(units, (v) => /^\d+(\.\d+)?$/.test(v)) >= 0.98 &&
    share(grades, (v) => v.length <= 3) >= 0.98 &&
    share(statuses, (v) => v.length <= 20 && !/\d/.test(v)) >= 0.98;
  const tableRows = dataRows.filter((r) => r.cells.some((c) => c.c >= 2)).length;
  if (!aligned || tableRows === 0) throw new AprImportError("unrecognized_pdf");

  const rows: AprRow[] = out.map((r, i) => ({ r: i, cells: r.cells }));
  // Merges for each emitted header pair, as the Excel export has them.
  const merges = rows
    .filter((row) => row.cells.some((c) => c.bold && c.text === "Satisfied With"))
    .flatMap((row) => [
      { r: row.r, c: 3, rowSpan: 1, colSpan: 4 },
      { r: row.r, c: 0, rowSpan: 2, colSpan: 1 },
      { r: row.r, c: 1, rowSpan: 2, colSpan: 1 },
      { r: row.r, c: 2, rowSpan: 2, colSpan: 1 },
    ]);

  return {
    version: APR_WORKBOOK_VERSION,
    sourceFormat: "pdf",
    sheets: [
      {
        name: "View My Academic Progress",
        index: 0,
        visibility: "visible",
        rowCount: rows.length,
        columnCount: COLUMN_COUNT,
        columnWidths: [40, 13, 18, 34, 14, 7, 7],
        rows,
        merges,
      },
    ],
    warnings: ["reconstructed_from_pdf"],
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
