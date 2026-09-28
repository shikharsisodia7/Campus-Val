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
 *   5. A row is offered only if it NAMES something in the columns that belong
 *      to that student column. Real checklists put two tables side by side (the
 *      requirements, and a four-year grid); a row that has text only in the
 *      other table is not a requirement of this one.
 *
 * What a student column holds is decided per TABLE, among the columns that are
 * really offered: a table with a status column and a quarter column gives each
 * its own value; a table left with one student column gives it both.
 */
import { createHash } from "node:crypto";
import type { TrackingCell, TrackingColumn, TrackingField, TrackingLayout } from "./model";

export interface LayoutCell {
  c: number;
  text: string;
  /** Bold: how a section heading is set. Shading is not a sign; real checklists shade every cell. */
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
/**
 * The longest any cell of a header row may be. The first cell is often the
 * table's title ("Classical Languages and Literatures Minor"); a sentence is
 * not a header.
 */
const MAX_HEADER_ROW_CELL_LENGTH = 80;
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

interface HeaderColumn extends TrackingColumn {
  strict: boolean;
  /**
   * The columns whose text names what this student column is about: those
   * between the previous student column and this one. Empty when the student
   * column comes first, in which case the labels are to its right.
   */
  labels: number[];
}

interface Header {
  row: number;
  columns: HeaderColumn[];
}

function readHeader(row: LayoutRow): Header | null {
  const filled = row.cells.filter((cell) => cell.text.trim() !== "");
  if (filled.length < 2) return null;
  if (filled.some((cell) => cell.text.trim().length > MAX_HEADER_ROW_CELL_LENGTH)) return null;
  if (!filled.some((cell) => SUBJECT_HEADERS.has(normalizeHeader(cell.text)))) return null;

  const columns: Header["columns"] = [];
  let previous = -1;
  for (const cell of filled) {
    const kind = trackingHeaderKind(cell.text.trim());
    if (!kind) continue;
    const labels = filled.filter((other) => other.c > previous && other.c < cell.c && !trackingHeaderKind(other.text.trim())).map((o) => o.c);
    columns.push({ c: cell.c, field: kind.field, header: cell.text.trim(), headerRow: row.r, strict: kind.strict, labels });
    previous = cell.c;
  }
  if (columns.length === 0) return null;
  return { row: row.r, columns };
}

/**
 * The student columns of one table: a column with labels of its own starts a
 * table, and a column right after another ("Status", "Quarter") shares it.
 */
function tablesOf<T extends { labels: number[] }>(columns: T[]): T[][] {
  const tables: T[][] = [];
  for (const column of columns) {
    const last = tables[tables.length - 1];
    if (last && column.labels.length === 0) last.push(column);
    else tables.push([column]);
  }
  return tables;
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
    // Columns that name things for SOME student column; one table's are not another's.
    const labelled = new Set(header.columns.flatMap((column) => column.labels));

    const candidates = rows.slice(i + 1, end).filter((row) => {
      const content = row.cells.filter((cell) => !tracked.has(cell.c) && cell.text.trim() !== "");
      if (content.length === 0) return false;
      // A lone emphasized cell is a section heading ("Upper Division"), not an item.
      return !(content.length === 1 && row.cells.length === 1 && content[0]!.emphasized);
    });
    if (candidates.length === 0) continue;

    const offered: { column: HeaderColumn; cells: TrackingCell[] }[] = [];
    for (const column of header.columns) {
      // Rows that name something for THIS column (rule 5). A column that shares
      // its table with the one before it is about the same rows.
      const table = tablesOf(header.columns).find((columns) => columns.includes(column))!;
      const labels = new Set(table[0]!.labels);
      const named = candidates.filter(
        (row) => labels.size === 0 || row.cells.some((cell) => labels.has(cell.c) && cell.text.trim() !== ""),
      );
      if (named.length === 0) continue;
      const filled = named.filter((row) => row.cells.some((cell) => cell.c === column.c && cell.text.trim() !== ""));
      const share = filled.length / named.length;
      if (column.strict ? filled.length > 0 : share > MAX_FILLED_SHARE) continue;

      const cells: TrackingCell[] = [];
      for (const row of named) {
        if (covered.has(`${row.r}:${column.c}`)) continue;
        if (row.cells.some((cell) => cell.c === column.c && cell.text.trim() !== "")) continue;
        // A lone emphasized label is a section heading of this table.
        const own = row.cells.filter((cell) => labels.has(cell.c) && cell.text.trim() !== "");
        const others = row.cells.filter((cell) => !labelled.has(cell.c) && !tracked.has(cell.c) && cell.text.trim() !== "");
        if (labels.size > 0 && own.length === 1 && own[0]!.emphasized && others.length === 0) continue;
        const rowText = row.cells
          .filter((cell) => (labels.size === 0 ? !tracked.has(cell.c) : labels.has(cell.c)))
          .map((cell) => `${cell.c}=${cell.text.trim()}`);
        cells.push({
          r: row.r,
          c: column.c,
          field: column.field,
          fingerprint: fingerprintOf([scope, normalizeHeader(column.header), ...rowText]),
        });
      }
      if (cells.length === 0) continue;
      offered.push({ column, cells });
    }

    for (const table of tablesOf(header.columns)) {
      const columns = offered.filter((entry) => table.includes(entry.column));
      const kinds = new Set(columns.map((entry) => entry.column.field));
      for (const { column, cells } of columns) {
        const field: TrackingField = kinds.size === 1 ? "both" : column.field;
        layout.columns.push({ c: column.c, field, header: column.header, headerRow: column.headerRow });
        layout.cells.push(...cells.map((cell) => ({ ...cell, field })));
      }
    }
  }
  return layout;
}
