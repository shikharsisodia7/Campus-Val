/**
 * The normalized APR model: the layer between an Academic Progress Report's
 * structural rows and the Degree Completion Assessment rules.
 *
 *   raw workbook (workbook-reader / pdf-table-reader)
 *     -> structural rows (sidebar-projection: header, program blocks, groups)
 *     -> THIS: one NormalizedAprRequirement per requirement row, with the
 *        course rows under it, its place in the hierarchy, and every source
 *        field CampusVal recognises, kept verbatim
 *     -> rules (engine.ts)
 *
 * A change in Workday's export (one row per course, a new status-detail column)
 * is absorbed here; the rules and the UI read this model, not the sheet.
 *
 * Nothing is invented: a field the source does not have is null. Academic
 * Period, Units and Grade are withheld from the planning projection on
 * purpose; this layer only reads them when a caller asks for them explicitly
 * (`includeWithheldColumns`), and the assessment never does.
 */
import { createHash } from "node:crypto";
import type { AprRow, AprWorkbook } from "../apr/workbook-model";
import { isOmittedHeader, projectForSidebar, type SidebarGroupKind } from "../apr/sidebar-projection";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => squash(s).toLowerCase();
const hash = (parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

export type StatusWord = "satisfied" | "not_satisfied" | "in_progress" | "unknown" | "missing";

export interface StatusReading {
  word: StatusWord;
  /**
   * Text Workday printed WITH the status in the same cell ("In Progress -
   * Minimum combination not met"), verbatim. Null when the cell holds only the
   * status word.
   */
  detail: string | null;
}

/** Workday's Status cell: the status word, and any detail printed beside it. */
export function readStatusCell(text: string | null): StatusReading {
  const t = squash(text ?? "");
  if (!t) return { word: "missing", detail: null };
  const m = /^(not satisfied|satisfied|in progress)\b\s*(?:[-–—:;,]\s*|\(\s*)?(.*?)\)?\s*$/i.exec(t);
  if (!m) return { word: "unknown", detail: null };
  const word: StatusWord = /^not/i.test(m[1]!) ? "not_satisfied" : /^in/i.test(m[1]!) ? "in_progress" : "satisfied";
  const detail = squash(m[2] ?? "");
  return { word, detail: detail || null };
}

export type RemainingKind = "courses" | "units" | "gpa" | "combination" | "activities" | "other";

export interface RemainingInfo {
  /** Workday's words, verbatim ("Minimum 3 Course(s)"). */
  text: string;
  kind: RemainingKind;
  /** The number Workday states, when it states one (3 courses, 20 units, 2.000 GPA). */
  amount: number | null;
  /**
   * For a minimum-combination statement: what its number counts, when the text
   * says ("Minimum combination not met: 2 Course(s)" -> courses). Null otherwise.
   */
  unit?: "courses" | "units" | null;
}

/**
 * A remaining / status-detail statement, read for its kind and number. The
 * text is always kept verbatim; a number is taken only when the text states it.
 */
export function readRemaining(text: string): RemainingInfo | null {
  const t = squash(text);
  if (!t) return null;
  const number = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };
  if (/\bcombination\b/i.test(t)) {
    const courses = number(/(\d+(?:\.\d+)?)\s*course/i);
    const units = courses === null ? number(/(\d+(?:\.\d+)?)\s*unit/i) : null;
    const unit = courses !== null ? "courses" : units !== null ? "units" : null;
    return { text: t, kind: "combination", amount: courses ?? units, ...(unit ? { unit } : {}) };
  }
  if (/course\(?s?\)?/i.test(t) && /\d/.test(t)) return { text: t, kind: "courses", amount: number(/(\d+(?:\.\d+)?)\s*course/i) };
  if (/unit\(?s?\)?/i.test(t) && /\d/.test(t)) return { text: t, kind: "units", amount: number(/(\d+(?:\.\d+)?)\s*unit/i) };
  if (/\bgpa\b/i.test(t)) return { text: t, kind: "gpa", amount: number(/(\d+(?:\.\d+)?)\s*gpa/i) };
  if (/activit/i.test(t)) return { text: t, kind: "activities", amount: number(/activities?\s*:?\s*(\d+)/i) };
  return { text: t, kind: "other", amount: null };
}

const IN_PROGRESS_RE = /\(\s*in\s*progress\s*\)/i;

/** One course (registration) row under a requirement. */
export interface NormalizedCourseRow {
  /** Workday's words ("FNCE 121 - Corporate Finance (In Progress)"). */
  text: string;
  inProgress: boolean;
  /** Source row (0-based). */
  row: number;
  /** Only with `includeWithheldColumns`; otherwise always null. */
  academicPeriod: string | null;
  units: string | null;
  grade: string | null;
}

export interface NormalizedAprRequirement {
  /** Stable across re-exports of the same report: block + requirement text + occurrence. */
  key: string;
  /** What the row said (status, details, course rows): a change flags a student's correction for review. */
  fingerprint: string;
  label: string;
  /** Workday's Status cell, verbatim. */
  status: string | null;
  statusWord: StatusWord;
  /** Text printed with the status in its cell, verbatim. */
  statusDetail: string | null;
  /** Workday's Remaining cell, verbatim, read for kind and number. */
  remaining: RemainingInfo | null;
  /** The minimum-combination statement, from the Remaining cell or the status detail, when there is one. */
  minimumCombination: RemainingInfo | null;
  courseRows: NormalizedCourseRow[];
  /** Workday's indent level of the requirement cell (its place in the hierarchy). */
  depth: number;
  /** The requirement this one sits under (a lower indent above it in the same group), or null. */
  parentKey: string | null;
  childKeys: string[];
  /** Position among the requirements of its sheet, in source order. */
  rowOrder: number;
  source: {
    sheet: string;
    sheetIndex: number;
    /** Zero-based source row of the requirement (row r + 1 in Excel). */
    row: number;
    block: string | null;
    blockIndex: number;
    group: string;
    groupKind: SidebarGroupKind;
    /** The uploaded document the report came from, when the caller names it. */
    documentId: number | null;
  };
}

export interface NormalizedAprReport {
  requirements: NormalizedAprRequirement[];
  /** Sheets that could not be read as a requirements table (counted, never guessed at). */
  unreadableSheets: { sheet: string; reason: "header_not_found" | "status_column_not_found" }[];
}

export interface NormalizeOptions {
  sourceDocumentId?: number | null;
  /** Read Academic Period, Units and Grade into course rows. Off by default; never used by the assessment. */
  includeWithheldColumns?: boolean;
}

/** Column index of each withheld field, from the raw header row nearest above `row`. */
function withheldColumns(rows: AprRow[], row: number): { period: number; units: number; grade: number } {
  const out = { period: -1, units: -1, grade: -1 };
  const header = [...rows].reverse().find((r) => r.r < row && r.cells.some((c) => /^status$/i.test(squash(c.text))));
  for (const cell of header?.cells ?? []) {
    const t = norm(cell.text);
    if (!isOmittedHeader(t)) continue;
    if (/period/.test(t)) out.period = cell.c;
    else if (/unit|credit/.test(t)) out.units = cell.c;
    else if (/grade/.test(t)) out.grade = cell.c;
  }
  return out;
}

export function normalizeApr(workbook: AprWorkbook, options: NormalizeOptions = {}): NormalizedAprReport {
  const projection = projectForSidebar(workbook);
  const requirements: NormalizedAprRequirement[] = [];
  const unreadableSheets: NormalizedAprReport["unreadableSheets"] = [];

  for (const sheet of projection.sheets) {
    if (!sheet.structured) {
      unreadableSheets.push({ sheet: sheet.name, reason: "header_not_found" });
      continue;
    }
    const col = (re: RegExp) => sheet.columns.findIndex((c) => re.test(norm(c.header)));
    const requirementAt = col(/^requirements?$/);
    const statusAt = col(/^status$/);
    const remainingAt = col(/^remaining$/);
    const registrationsAt = col(/registrations? used|satisfied with/);
    if (statusAt < 0 || requirementAt < 0) {
      unreadableSheets.push({ sheet: sheet.name, reason: "status_column_not_found" });
      continue;
    }
    const raw = workbook.sheets.find((s) => s.index === sheet.index)?.rows ?? [];
    const rawRow = (r: number) => raw.find((x) => x.r === r);
    const rawCell = (r: number, c: number) => (c < 0 ? null : squash(rawRow(r)?.cells.find((x) => x.c === c)?.text ?? "") || null);

    const occurrences = new Map<string, number>();
    let rowOrder = 0;
    for (const group of sheet.groups) {
      type Draft = { row: number; label: string; status: string; remaining: string; depth: number; courseRows: NormalizedCourseRow[] };
      let current: Draft | null = null;
      // Open requirements of this group by depth, for the parent of the next one.
      const stack: { depth: number; key: string }[] = [];
      const flush = () => {
        if (!current) return;
        const entry: Draft = current;
        current = null;
        // A label with nothing beside it and nothing under it is a heading, not a requirement.
        if (!entry.status && !entry.remaining && entry.courseRows.length === 0) return;
        const identity = `${norm(group.block ?? "")}|${norm(entry.label)}`;
        const n = (occurrences.get(identity) ?? 0) + 1;
        occurrences.set(identity, n);
        const status = readStatusCell(entry.status || null);
        const remaining = readRemaining(entry.remaining);
        const detail = status.detail ? readRemaining(status.detail) : null;
        const key = hash([norm(group.block ?? ""), norm(entry.label), String(n)]);
        while (stack.length > 0 && stack[stack.length - 1]!.depth >= entry.depth) stack.pop();
        const parentKey = stack.length > 0 ? stack[stack.length - 1]!.key : null;
        stack.push({ depth: entry.depth, key });
        const item: NormalizedAprRequirement = {
          key,
          fingerprint: hash([norm(entry.status), norm(entry.remaining), ...entry.courseRows.map((r) => norm(r.text))]),
          label: entry.label,
          status: entry.status || null,
          statusWord: status.word,
          statusDetail: status.detail,
          remaining,
          minimumCombination: remaining?.kind === "combination" ? remaining : detail?.kind === "combination" ? detail : null,
          courseRows: entry.courseRows,
          depth: entry.depth,
          parentKey,
          childKeys: [],
          rowOrder: rowOrder++,
          source: {
            sheet: sheet.name,
            sheetIndex: sheet.index,
            row: entry.row,
            block: group.block,
            blockIndex: group.blockIndex,
            group: group.label,
            groupKind: group.kind,
            documentId: options.sourceDocumentId ?? null,
          },
        };
        if (parentKey) requirements.find((r) => r.key === parentKey)?.childKeys.push(key);
        requirements.push(item);
      };
      for (const row of group.rows) {
        const cell = (at: number) => (at >= 0 ? squash(row.cells[at] ?? "") : "");
        const label = cell(requirementAt);
        const registration = cell(registrationsAt);
        if (label) {
          flush();
          current = { row: row.r, label, status: cell(statusAt), remaining: cell(remainingAt), depth: row.indent ?? 0, courseRows: [] };
        }
        if (registration && current) {
          const withheld = options.includeWithheldColumns ? withheldColumns(raw, row.r) : null;
          (current as Draft).courseRows.push({
            text: registration,
            inProgress: IN_PROGRESS_RE.test(registration),
            row: row.r,
            academicPeriod: withheld ? rawCell(row.r, withheld.period) : null,
            units: withheld ? rawCell(row.r, withheld.units) : null,
            grade: withheld ? rawCell(row.r, withheld.grade) : null,
          });
        }
      }
      flush();
    }
  }
  return { requirements, unreadableSheets };
}
