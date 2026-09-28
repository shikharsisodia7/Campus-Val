/**
 * Where a tracking entry sits in a document, and whether it may stay there.
 *
 * An anchor is a POSITION in one document: a worksheet cell, a table cell of a
 * Word document, a point on a page or picture. It is never the visible text:
 * the same course can be listed twice, and text is not a key.
 *
 * There are two kinds of cell anchor:
 *   sheet_cell / doc_cell   an EMPTY cell the department left for the student
 *                           (a Status or Quarter column), found by
 *                           tracking-layout.ts. It holds one kind of value.
 *   sheet_item / doc_item   a FILLED cell the student chose to track, for
 *                           documents that list items without leaving a column
 *                           for the student (a Fall / Winter / Spring grid of
 *                           courses). CampusVal never picks these itself:
 *                           deciding which cells are requirements would be
 *                           reading the document. The student points; the
 *                           position is remembered.
 *
 * Every anchor sent by a browser is checked against the document's own render
 * before it is stored, so an entry can only ever be placed somewhere the
 * document really offers. When the file is replaced, each anchor is checked
 * again against the NEW render (`reconcileAnchor`), and anything that cannot
 * be shown to mean the same thing is detached rather than left in place.
 */
import { createHash } from "node:crypto";
import { CHECKSHEET_LIMITS } from "./limits";
import type { ChecksheetRender, DocTextRun, TrackingCell, TrackingLayout } from "./model";

export type AnchorType = "sheet_cell" | "doc_cell" | "sheet_item" | "doc_item" | "point" | "manual";

export interface SheetCellAnchor {
  sheet: number;
  row: number;
  col: number;
}
export interface DocCellAnchor {
  block: number;
  row: number;
  col: number;
}
export interface PointAnchor {
  /** Zero-based page. Always 0 for a picture. */
  page: number;
  /** Fractions of the page width and height, from the top-left corner. */
  x: number;
  y: number;
}
export type Anchor = SheetCellAnchor | DocCellAnchor | PointAnchor | Record<string, never>;

export interface ResolvedAnchor {
  type: AnchorType;
  anchor: Anchor;
  /** Set for cell anchors: one entry per cell. */
  key: string | null;
  fingerprint: string | null;
  /** Set for cell anchors: which value that column holds. */
  field: "status" | "term" | null;
}

const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isFraction = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Four decimals locate a marker to well under a pixel on any page. */
const roundFraction = (value: number): number => Math.round(value * 10_000) / 10_000;

function findCell(layout: TrackingLayout | undefined, row: number, col: number): TrackingCell | undefined {
  return layout?.cells.find((cell) => cell.r === row && cell.c === col);
}

/** What a filled cell says, as a hash: compared on replacement, never shown. */
function itemFingerprint(scope: string, text: string): string {
  return createHash("sha256").update(`${scope}\u241f${text.replace(/\s+/g, " ").trim()}`).digest("hex").slice(0, 32);
}

function pageFingerprint(render: ChecksheetRender, page: number): string | null {
  if (render.kind !== "pdf") return null;
  const info = render.pages[page];
  if (!info?.textHash) return null;
  return `${info.width}x${info.height}:${info.textHash}`;
}

/**
 * Checks an anchor from a request against the document it is for.
 * Returns null when the document offers no such place.
 */
export function resolveAnchor(
  render: ChecksheetRender | null,
  type: unknown,
  raw: unknown,
): ResolvedAnchor | null {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  if (type === "manual") {
    return { type: "manual", anchor: {}, key: null, fingerprint: null, field: null };
  }
  if (!render) return null;

  if (type === "sheet_cell" && render.kind === "spreadsheet") {
    const { sheet, row, col } = input;
    if (!isIndex(sheet) || !isIndex(row) || !isIndex(col)) return null;
    const cell = findCell(render.sheets[sheet]?.tracking, row, col);
    if (!cell) return null;
    return {
      type: "sheet_cell",
      anchor: { sheet, row, col },
      key: `sheet:${sheet}:${row}:${col}`,
      fingerprint: cell.fingerprint,
      field: cell.field,
    };
  }

  if (type === "doc_cell" && render.kind === "document") {
    const { block, row, col } = input;
    if (!isIndex(block) || !isIndex(row) || !isIndex(col)) return null;
    const target = render.blocks[block];
    if (target?.type !== "table") return null;
    const cell = findCell(target.tracking, row, col);
    if (!cell) return null;
    return {
      type: "doc_cell",
      anchor: { block, row, col },
      key: `block:${block}:${row}:${col}`,
      fingerprint: cell.fingerprint,
      field: cell.field,
    };
  }

  if (type === "sheet_item" && render.kind === "spreadsheet") {
    const { sheet, row, col } = input;
    if (!isIndex(sheet) || !isIndex(row) || !isIndex(col)) return null;
    const source = render.sheets[sheet];
    const text = source?.rows.find((candidate) => candidate.r === row)?.cells.find((cell) => cell.c === col)?.text;
    // Only a cell that says something can be tracked as an item.
    if (!source || !text || text.trim() === "") return null;
    return {
      type: "sheet_item",
      anchor: { sheet, row, col },
      key: `sheetitem:${sheet}:${row}:${col}`,
      fingerprint: itemFingerprint(`sheet:${source.index}:${source.name}`, text),
      field: null,
    };
  }

  if (type === "doc_item" && render.kind === "document") {
    const { block, row, col } = input;
    if (!isIndex(block) || !isIndex(row) || !isIndex(col)) return null;
    const target = render.blocks[block];
    if (target?.type !== "table") return null;
    const cell = target.rows[row]?.[col];
    const text = cell ? runsText(cell.runs) : "";
    if (text.trim() === "") return null;
    return {
      type: "doc_item",
      anchor: { block, row, col },
      key: `blockitem:${block}:${row}:${col}`,
      fingerprint: itemFingerprint(`block:${block}`, text),
      field: null,
    };
  }

  if (type === "point" && (render.kind === "pdf" || render.kind === "image")) {
    const { page, x, y } = input;
    if (!isIndex(page) || !isFraction(x) || !isFraction(y)) return null;
    const pageCount = render.kind === "pdf" ? render.pages.length : 1;
    if (page >= pageCount) return null;
    return {
      type: "point",
      anchor: { page, x: roundFraction(x), y: roundFraction(y) },
      key: null,
      fingerprint: pageFingerprint(render, page),
      field: null,
    };
  }

  return null;
}

export interface StoredAnchor {
  anchorType: string;
  anchor: unknown;
  anchorFingerprint: string | null;
}

/**
 * After a replacement: may this entry stay where it is?
 *
 * Yes only when the new file offers the same place AND that place still holds
 * the same thing. A student's list entries (manual) have no place and always
 * stay. Anything else is detached.
 */
export function reconcileAnchor(
  stored: StoredAnchor,
  next: ChecksheetRender | null,
  sameFile: boolean,
): ResolvedAnchor | null {
  if (stored.anchorType === "manual") return resolveAnchor(next, "manual", {});
  const resolved = resolveAnchor(next, stored.anchorType, stored.anchor);
  if (!resolved) return null;
  // The identical file: every position means exactly what it meant.
  if (sameFile) return resolved;
  if (!stored.anchorFingerprint || !resolved.fingerprint) return null;
  return stored.anchorFingerprint === resolved.fingerprint ? resolved : null;
}

function runsText(runs: DocTextRun[]): string {
  return runs.map((run) => run.text).join("");
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > CHECKSHEET_LIMITS.itemLabelMaxLength
    ? `${flat.slice(0, CHECKSHEET_LIMITS.itemLabelMaxLength - 1)}…`
    : flat;
}

/**
 * A short description of the place an entry sat, taken from the file it was
 * made against. Used only when an entry is detached, so the student can see
 * what it referred to.
 */
export function describeAnchor(render: ChecksheetRender | null, stored: StoredAnchor): string {
  const anchor = (stored.anchor ?? {}) as Record<string, unknown>;
  if (stored.anchorType === "sheet_cell" && render?.kind === "spreadsheet") {
    const sheet = render.sheets[Number(anchor["sheet"])];
    const row = sheet?.rows.find((candidate) => candidate.r === Number(anchor["row"]));
    const tracked = new Set(sheet?.tracking.columns.map((column) => column.c));
    const label = row?.cells.find((cell) => !tracked.has(cell.c) && cell.text.trim() !== "")?.text;
    if (label) return clip(label);
    return sheet ? `${sheet.name}, row ${Number(anchor["row"]) + 1}` : "Worksheet row";
  }
  if (stored.anchorType === "doc_cell" && render?.kind === "document") {
    const block = render.blocks[Number(anchor["block"])];
    if (block?.type === "table") {
      const tracked = new Set(block.tracking.columns.map((column) => column.c));
      const row = block.rows[Number(anchor["row"])] ?? [];
      const label = row.map((cell) => runsText(cell.runs)).find((text, c) => !tracked.has(c) && text.trim() !== "");
      if (label) return clip(label);
    }
    return "Table row";
  }
  if (stored.anchorType === "sheet_item" && render?.kind === "spreadsheet") {
    const sheet = render.sheets[Number(anchor["sheet"])];
    const text = sheet?.rows
      .find((candidate) => candidate.r === Number(anchor["row"]))
      ?.cells.find((cell) => cell.c === Number(anchor["col"]))?.text;
    return text?.trim() ? clip(text) : "Worksheet cell";
  }
  if (stored.anchorType === "doc_item" && render?.kind === "document") {
    const block = render.blocks[Number(anchor["block"])];
    const cell = block?.type === "table" ? block.rows[Number(anchor["row"])]?.[Number(anchor["col"])] : undefined;
    const text = cell ? runsText(cell.runs) : "";
    return text.trim() ? clip(text) : "Table cell";
  }
  if (stored.anchorType === "point") {
    return render?.kind === "image" ? "Marker on the picture" : `Marker on page ${Number(anchor["page"] ?? 0) + 1}`;
  }
  return "Tracking entry";
}
