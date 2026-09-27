/**
 * The compact APR shown in the planning sidebar.
 *
 * This is the ONLY processing CampusVal applies to an APR, and it is
 * presentation processing:
 *
 *   1. find the table's header row ("Requirement | Status | …");
 *   2. leave out the Academic Period, Units and Grade columns — here, on the
 *      server, so a planning page is never sent them;
 *   3. file each row under a collapsible heading taken from Workday's own
 *      wording ("University Requirement: …" -> University Requirements,
 *      "Core: …" -> Core, "Finance Major : …" -> "Finance Major");
 *   4. keep each PROGRAM BLOCK apart. One Workday export can hold several
 *      programs ("Finance Major Requirements", "Mathematics Major Requirements",
 *      each minor…), every one with its own title, summary lines and table. A
 *      block's University and Core rows are its own: the Finance block lists
 *      "Core: LSB: …" and the Mathematics block "Core: CAS: …".
 *
 * Cell text is passed through untouched. Rows are never reordered within a
 * group, never merged, never dropped because they look unimportant, and no row
 * is ever judged complete or incomplete: the Status cell is Workday's.
 *
 * When the structure is not recognised the projection says so and sends no
 * rows for that sheet (it cannot tell which columns hold grades), while the
 * full APR page still shows the whole file.
 */
import type { AprRow, AprSheet, AprWorkbook } from "./workbook-model";

export type SidebarGroupKind = "university" | "core" | "major" | "minor" | "program" | "other";

export interface SidebarColumn {
  /** Source column index. */
  index: number;
  /** Workday's header text for the column, as written. */
  header: string;
}

export interface SidebarRow {
  /** Source row index, for traceability back to the full APR. */
  r: number;
  /** One entry per kept column, "" where the source cell was empty. */
  cells: string[];
  bold?: true;
  indent?: number;
}

export interface SidebarGroup {
  key: string;
  kind: SidebarGroupKind;
  /** The accordion heading. Generic for University/Core/Other, literal otherwise. */
  label: string;
  /**
   * The program block this group sits in, exactly as Workday titled it
   * ("Finance Major Requirements"), or null when the export has no block title.
   */
  block: string | null;
  /** Position of that block in the sheet (0-based), so blocks stay in source order. */
  blockIndex: number;
  rows: SidebarRow[];
}

export type SidebarSheetWarning =
  | "header_not_found"
  | "rows_without_heading"
  | "preamble_rows_in_full_view_only";

export interface SidebarSheet {
  name: string;
  index: number;
  /** False when no header row was recognised; `groups` is then empty. */
  structured: boolean;
  columns: SidebarColumn[];
  /** Headers of the columns left out, so the UI can say exactly what is omitted. */
  omittedColumns: string[];
  groups: SidebarGroup[];
  /** Rows above the table (title, run date…): counted, shown only in the full APR. */
  preambleRowCount: number;
  warnings: SidebarSheetWarning[];
}

export interface SidebarProjection {
  sheets: SidebarSheet[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[:*]+$/, "").trim();

/** Header text that marks a column the sidebar must not carry. */
const OMIT_HEADER_RE = /\b(academic periods?|grades?|units?|credits?)\b/;

export function isOmittedHeader(header: string): boolean {
  return OMIT_HEADER_RE.test(norm(header));
}

interface HeaderInfo {
  rowPosition: number;
  /** column index -> header text (from the header row, or the row beside it). */
  headers: Map<number, string>;
  omitted: Set<number>;
  requirementColumn: number;
  /** Row positions that are part of this header (1 or 2 rows). */
  headerPositions: Set<number>;
}

function cellAt(row: AprRow | undefined, c: number): string {
  return row?.cells.find((cell) => cell.c === c)?.text ?? "";
}

function isHeaderRow(row: AprRow): { requirementColumn: number } | null {
  let requirementColumn = -1;
  let hasStatus = false;
  for (const cell of row.cells) {
    const t = norm(cell.text);
    if (requirementColumn < 0 && /^requirements?$/.test(t)) requirementColumn = cell.c;
    if (/^status$/.test(t)) hasStatus = true;
  }
  return requirementColumn >= 0 && hasStatus ? { requirementColumn } : null;
}

const HEADER_LABELS = new Set([
  "requirement",
  "requirements",
  "status",
  "remaining",
  "satisfied with",
  "registration used",
  "registrations used",
  "academic period",
  "academic periods",
  "unit",
  "units",
  "credit",
  "credits",
  "grade",
  "grades",
]);

/**
 * Workday sometimes prints a two-row header ("Satisfied With" spanning
 * "Registrations Used | Academic Period | Units | Grade"). A neighbouring row is
 * part of the header only when EVERY one of its cells is exactly a known column
 * label — a data row such as "Minimum 4 Unit(s)" must never be mistaken for one.
 */
function isHeaderCompanion(row: AprRow | undefined): boolean {
  if (!row || row.cells.length === 0) return false;
  return row.cells.every((c) => HEADER_LABELS.has(norm(c.text)));
}

function readHeader(sheet: AprSheet, position: number, requirementColumn: number): HeaderInfo {
  const row = sheet.rows[position]!;
  const headerPositions = new Set<number>([position]);
  const companions: AprRow[] = [];
  const above = sheet.rows[position - 1];
  const below = sheet.rows[position + 1];
  if (above && above.r === row.r - 1 && isHeaderCompanion(above)) {
    companions.push(above);
    headerPositions.add(position - 1);
  }
  if (below && below.r === row.r + 1 && isHeaderCompanion(below) && !isHeaderRow(below)) {
    companions.push(below);
    headerPositions.add(position + 1);
  }

  const headers = new Map<number, string>();
  const omitted = new Set<number>();
  for (let c = 0; c < sheet.columnCount; c++) {
    const own = cellAt(row, c).trim();
    const beside = companions.map((r) => cellAt(r, c).trim()).filter(Boolean);
    // A column is omitted if ANY of its header cells names an omitted field.
    if ([own, ...beside].some(isOmittedHeader)) omitted.add(c);
    // Prefer the most specific label: the sub-header when the main row is blank
    // or is a spanning label such as "Satisfied With".
    const specific = beside.find((t) => !/^satisfied with$/i.test(t));
    const label = own && !/^satisfied with$/i.test(own) ? own : (specific ?? own ?? beside[0] ?? "");
    if (label) headers.set(c, label);
  }
  return { rowPosition: position, headers, omitted, requirementColumn, headerPositions };
}

function groupFor(requirementText: string): { key: string; kind: SidebarGroupKind; label: string } {
  const text = requirementText.replace(/\s+/g, " ").trim();
  if (/^university requirements?\b/i.test(text)) {
    return { key: "university", kind: "university", label: "University Requirements" };
  }
  if (/^core\b/i.test(text)) return { key: "core", kind: "core", label: "Core" };

  const colon = text.indexOf(":");
  // Only a short leading phrase is a heading; a long sentence that happens to
  // contain a colon is not.
  let prefix = colon > 0 && colon <= 70 ? text.slice(0, colon).trim() : "";
  if (!prefix) {
    // Workday writes some rows without the colon: "Mathematics Major GPA",
    // "Healthcare Innovation Minor GPA". The heading is the text up to and
    // including the word Major / Minor.
    const named = /^(.{2,70}?\b(?:Major|Minor))\b\s+\S/i.exec(text);
    if (named) prefix = named[1]!.trim();
  }
  if (prefix) {
    const kind: SidebarGroupKind = /\bmajor\b/i.test(prefix)
      ? "major"
      : /\bminor\b/i.test(prefix)
        ? "minor"
        : "program";
    // Keyed on the normalised prefix so "Finance Major :" and "Finance Major:" share a group,
    // labelled with the text exactly as Workday first wrote it.
    return { key: `p:${norm(prefix)}`, kind, label: prefix };
  }
  return { key: "other", kind: "other", label: "Other" };
}

/**
 * A row that belongs to a requirements table: a requirement with Workday's
 * status beside it, or a further registration listed under the requirement
 * above (empty requirement cell).
 *
 * The lines Workday prints around a table — a block title, "Program of Study
 * GPA 3.000", "Requirements Effective 09/10/2025", "Requirements Not Assigned
 * 14" — are not: they have a label and either nothing beside it or a value
 * containing digits.
 */
function isTableRow(row: AprRow, header: HeaderInfo, statusColumn: number): boolean {
  const requirement = cellAt(row, header.requirementColumn).trim();
  if (!requirement) return true;
  const status = cellAt(row, statusColumn).trim();
  return status !== "" && !/\d/.test(status);
}

const BLOCK_TITLE_RE = /\bRequirements\s*$/i;

function projectSheet(sheet: AprSheet): SidebarSheet {
  const base: SidebarSheet = {
    name: sheet.name,
    index: sheet.index,
    structured: false,
    columns: [],
    omittedColumns: [],
    groups: [],
    preambleRowCount: 0,
    warnings: [],
  };
  if (sheet.rows.length === 0) return base;

  // Pass 1: locate every header (a combined export repeats it per program block).
  const headerAt = new Map<number, HeaderInfo>();
  const headerPositions = new Set<number>();
  sheet.rows.forEach((row, position) => {
    const hit = isHeaderRow(row);
    if (!hit) return;
    const info = readHeader(sheet, position, hit.requirementColumn);
    headerAt.set(position, info);
    for (const p of info.headerPositions) headerPositions.add(p);
  });
  if (headerAt.size === 0) return { ...base, warnings: ["header_not_found"] };

  const statusColumnOf = (info: HeaderInfo): number => {
    for (const [c, text] of info.headers) if (norm(text) === "status") return c;
    return info.requirementColumn + 1;
  };

  // Pass 1b: the lines directly ABOVE each header that are not table rows are
  // that block's title and summary. They are shown on the full APR only, and
  // the title names the block.
  const blockLead = new Set<number>();
  const blockTitleAt = new Map<number, string>();
  const headerList = [...headerAt.keys()].sort((a, b) => a - b);
  headerList.forEach((position, i) => {
    const info = headerAt.get(position)!;
    const previous = i > 0 ? headerAt.get(headerList[i - 1]!)! : null;
    let top = Math.min(...info.headerPositions);
    let title: string | null = null;
    for (let q = top - 1; q >= 0; q--) {
      if (headerPositions.has(q)) break;
      const row = sheet.rows[q]!;
      // Above the first header everything is preamble; between two tables only
      // the lines that are not table rows are.
      if (previous && isTableRow(row, previous, statusColumnOf(previous))) break;
      blockLead.add(q);
      const text = row.cells.map((c) => c.text.trim()).filter(Boolean);
      if (text.length === 1 && BLOCK_TITLE_RE.test(text[0]!)) title = text[0]!.replace(/\s+/g, " ");
      top = q;
    }
    if (title) blockTitleAt.set(position, title);
  });

  // Pass 2: file the data rows, in source order.
  const groups = new Map<string, SidebarGroup>();
  const order: string[] = [];
  let columns: SidebarColumn[] = [];
  const omittedColumns = new Set<string>();
  let header: HeaderInfo | null = null;
  let current: { key: string; kind: SidebarGroupKind; label: string } | null = null;
  let sawRowWithoutHeading = false;
  let preambleRowCount = 0;
  let block: string | null = null;
  let blockIndex = -1;

  for (let position = 0; position < sheet.rows.length; position++) {
    const row = sheet.rows[position]!;

    const found = headerAt.get(position);
    if (found) {
      header = found;
      // A titled header opens a new block. An untitled one is the same table
      // continuing (a repeated header), unless it is the very first.
      const title = blockTitleAt.get(position);
      if (title !== undefined || blockIndex < 0) {
        block = title ?? null;
        blockIndex += 1;
      }
      for (const c of found.omitted) {
        const h = found.headers.get(c);
        if (h) omittedColumns.add(h);
      }
      if (columns.length === 0) {
        columns = [...found.headers.entries()]
          .filter(([c]) => !found.omitted.has(c))
          .sort((x, y) => x[0] - y[0])
          .map(([index, text]) => ({ index, header: text }));
      }
      current = null;
      continue;
    }
    if (headerPositions.has(position)) continue;
    if (!header || blockLead.has(position)) {
      // Title, run date, program summary (GPA lines): the full APR shows them.
      preambleRowCount += 1;
      continue;
    }

    const active: HeaderInfo = header;
    // A column is shown only if the header named it AND did not mark it omitted.
    const cells = columns.map(({ index }) => (active.omitted.has(index) ? "" : cellAt(row, index)));
    if (cells.every((t) => t.trim() === "")) continue; // only period/units/grade content

    const requirementText = cellAt(row, active.requirementColumn).trim();
    if (requirementText) current = groupFor(requirementText);
    else if (!current) {
      current = { key: "other", kind: "other", label: "Other" };
      sawRowWithoutHeading = true;
    }

    const key = `b${blockIndex}:${current.key}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, kind: current.kind, label: current.label, block, blockIndex, rows: [] };
      groups.set(key, group);
      order.push(key);
    }
    const lead = row.cells.find((cell) => cell.c === active.requirementColumn);
    const out: SidebarRow = { r: row.r, cells };
    if (lead?.bold) out.bold = true;
    if (lead?.indent) out.indent = lead.indent;
    group.rows.push(out);
  }

  const warnings: SidebarSheetWarning[] = [];
  if (sawRowWithoutHeading) warnings.push("rows_without_heading");
  if (preambleRowCount > 0) warnings.push("preamble_rows_in_full_view_only");

  return {
    ...base,
    structured: true,
    columns,
    omittedColumns: [...omittedColumns],
    groups: order.map((k) => groups.get(k)!),
    preambleRowCount,
    warnings,
  };
}

export function projectForSidebar(workbook: AprWorkbook): SidebarProjection {
  return {
    sheets: workbook.sheets.filter((s) => s.visibility === "visible" || s.rows.length > 0).map(projectSheet),
  };
}

/** Counts only — safe to log. Never includes cell text. */
export function projectionStats(p: SidebarProjection): {
  sheets: number;
  structuredSheets: number;
  blocks: number;
  groups: number;
  rows: number;
} {
  return {
    sheets: p.sheets.length,
    structuredSheets: p.sheets.filter((s) => s.structured).length,
    blocks: p.sheets.reduce((n, s) => n + new Set(s.groups.map((g) => g.blockIndex)).size, 0),
    groups: p.sheets.reduce((n, s) => n + s.groups.length, 0),
    rows: p.sheets.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.rows.length, 0), 0),
  };
}
