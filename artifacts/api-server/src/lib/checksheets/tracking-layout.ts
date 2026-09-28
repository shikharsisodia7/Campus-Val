/**
 * Finds the cells of a table that the department left for the STUDENT to fill
 * in ("Status", "Quarter Completed" ...), so CampusVal can put its own
 * tracking control there.
 *
 * This is about where to draw a control. It reads column HEADERS and whether a
 * cell is empty; it never reads a requirement, a course or a rule.
 *
 * It is deliberately hard to satisfy, because being wrong in one direction is
 * much worse than the other. If a student column is missed, the student uses
 * the My Tracking list instead. If an official column is mistaken for a
 * student column, CampusVal would be inviting the student to write over what
 * the department published. So:
 *
 *   1. The header must be one of a short list of exact phrases. A blank column
 *      is never assumed to be a tracking column.
 *   2. The same row must also name what is being tracked ("Requirement",
 *      "Course", "Units" ...). That is what makes it a header row rather than
 *      a data row that happens to contain the word "Completed".
 *   3. A column that already holds content in more than a fifth of its rows is
 *      the department's, not the student's, and is left alone entirely.
 *   4. A cell that holds any source text is never offered for tracking.
 */
import { createHash } from "node:crypto";
import type { TrackingCell, TrackingColumn, TrackingLayout } from "./model";

export interface LayoutCell {
  c: number;
  text: string;
  /** Bold or filled: how a section heading is usually set. */
  emphasized?: boolean;
}

export interface LayoutRow {
  r: number;
  cells: LayoutCell[];
}

const STATUS_HEADERS = new Set([
  "status",
  "my status",
  "complete",
  "completed",
  "completion",
  "done",
  "check",
  "check off",
  "taken",
]);

const TERM_HEADERS = new Set([
  "quarter",
  "quarter completed",
  "quarter taken",
  "quarter planned",
  "quarter year",
  "quarter and year",
  "qtr",
  "qtr taken",
  "qtr completed",
  "term",
  "term completed",
  "term taken",
  "term planned",
  "term year",
  "when taken",
  "year taken",
  "year completed",
]);

/** Accepted only when its column is completely empty: "Year" is often official. */
const STRICT_TERM_HEADERS = new Set(["year"]);

/** Words that say WHAT a table lists. A header row must contain one of them. */
const SUBJECT_HEADERS = new Set([
  "requirement",
  "requirements",
  "course",
  "courses",
  "course number",
  "course no",
  "course title",
  "course name",
  "class",
  "classes",
  "title",
  "subject",
  "description",
  "area",
  "category",
  "units",
  "unit",
  "credits",
  "notes",
  "note",
  "prerequisite",
  "prerequisites",
  "prereq",
  "prereqs",
  "grade",
]);

const MAX_HEADER_LENGTH = 40;
/** Above this share of filled cells a column is official content. */
const MAX_FILLED_SHARE = 0.2;

export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type HeaderKind = { field: "status" | "term"; strict: boolean } | null;

function trackingHeaderKind(text: string): HeaderKind {
  if (text.length > MAX_HEADER_LENGTH) return null;
  const header = normalizeHeader(text);
  if (STATUS_HEADERS.has(header)) return { field: "status", strict: false };
  if (TERM_HEADERS.has(header)) return { field: "term", strict: false };
  if (STRICT_TERM_HEADERS.has(header)) return { field: "term", strict: true };
  return null;
}

interface Header {
  row: number;
  columns: (TrackingColumn & { strict: boolean })[];
}

function readHeader(row: LayoutRow): Header | null {
  const filled = row.cells.filter((cell) => cell.text.trim() !== "");
  if (filled.length < 2) return null;
  if (filled.some((cell) => cell.text.trim().length > MAX_HEADER_LENGTH)) return null;
  if (!filled.some((cell) => SUBJECT_HEADERS.has(normalizeHeader(cell.text)))) return null;

  const columns: Header["columns"] = [];
  for (const cell of filled) {
    const kind = trackingHeaderKind(cell.text.trim());
    if (kind) columns.push({ c: cell.c, field: kind.field, header: cell.text.trim(), headerRow: row.r, strict: kind.strict });
  }
  return columns.length > 0 ? { row: row.r, columns } : null;
}

function fingerprintOf(parts: string[]): string {
  return createHash("sha256").update(parts.join("␟")).digest("hex").slice(0, 32);
}

/**
 * @param rows     non-empty rows in source order, each with its non-empty cells
 * @param covered  "r:c" of every cell hidden under a merged range
 * @param scope    what makes this table distinct (a sheet name, a block index);
 *                 part of every fingerprint
 */
export function detectTrackingLayout(rows: LayoutRow[], covered: ReadonlySet<string>, scope: string): TrackingLayout {
  const headers = rows.map(readHeader);
  const layout: TrackingLayout = { columns: [], cells: [] };

  for (let i = 0; i < rows.length; i++) {
    const header = headers[i];
    if (!header) continue;

    // The region runs to the next header row, or to the end of the table.
    let end = rows.length;
    for (let j = i + 1; j < rows.length; j++) {
      if (headers[j]) {
        end = j;
        break;
      }
    }
    const tracked = new Set(header.columns.map((column) => column.c));

    const candidates = rows.slice(i + 1, end).filter((row) => {
      const content = row.cells.filter((cell) => !tracked.has(cell.c) && cell.text.trim() !== "");
      if (content.length === 0) return false;
      // A lone emphasized cell is a section heading ("Upper Division"), not an item.
      return !(content.length === 1 && row.cells.length === 1 && content[0]!.emphasized);
    });
    if (candidates.length === 0) continue;

    for (const column of header.columns) {
      const filled = candidates.filter((row) => row.cells.some((cell) => cell.c === column.c && cell.text.trim() !== ""));
      const share = filled.length / candidates.length;
      if (column.strict ? filled.length > 0 : share > MAX_FILLED_SHARE) continue;

      const cells: TrackingCell[] = [];
      for (const row of candidates) {
        if (covered.has(`${row.r}:${column.c}`)) continue;
        if (row.cells.some((cell) => cell.c === column.c && cell.text.trim() !== "")) continue;
        const rowText = row.cells.filter((cell) => !tracked.has(cell.c)).map((cell) => `${cell.c}=${cell.text.trim()}`);
        cells.push({
          r: row.r,
          c: column.c,
          field: column.field,
          fingerprint: fingerprintOf([scope, normalizeHeader(column.header), ...rowText]),
        });
      }
      if (cells.length === 0) continue;
      layout.columns.push({ c: column.c, field: column.field, header: column.header, headerRow: column.headerRow });
      layout.cells.push(...cells);
    }
  }
  return layout;
}
