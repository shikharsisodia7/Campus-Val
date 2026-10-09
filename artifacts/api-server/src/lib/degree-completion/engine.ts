/**
 * Degree Completion Assessment — the deterministic rule engine.
 *
 * CampusVal's PLANNING interpretation of an uploaded Workday Academic Progress
 * Report: "what appears to remain?". It is not Workday, it is not an official
 * degree audit, and it never writes anything back into the APR. Workday is the
 * definitive reference for degree completion.
 *
 *   APR workbook (read-only, the student's upload)
 *     -> compact projection (sidebar-projection.ts: no grades, periods or units)
 *     -> THIS ENGINE: one assessment item per APR requirement row, with the
 *        rule applied, a confidence state and the exact source row
 *     -> student corrections (stored separately; the automatic result stays)
 *
 * The rules are conservative on purpose. Only Workday's explicit words decide:
 *
 *   "Not Satisfied"  -> CLEAR_REMAINING   (Workday says it is not met)
 *   "Satisfied"      -> LIKELY_COMPLETE   (Workday says it is met, as of the export)
 *   "In Progress"    -> AMBIGUOUS, always, unless a Registrar-confirmed subrule
 *                       is switched on (see `inProgressRemainingIsAdditional`).
 *                       A requirement that needs several courses can show
 *                       "In Progress" with one course registered and more still
 *                       owed; and a single in-progress course is not complete
 *                       until it is graded. CampusVal does not guess which.
 *   anything else    -> AMBIGUOUS (unknown status, missing status)
 *
 * No LLM, no heuristics about course content, no reading of grades. Pure and
 * deterministic: the same workbook always gives the same result.
 */
import { createHash } from "node:crypto";
import type { AprWorkbook } from "../apr/workbook-model";
import { projectForSidebar, type SidebarGroupKind } from "../apr/sidebar-projection";

/** Bumped whenever a rule changes meaning, so a trace says which rules produced it. */
export const ASSESSMENT_RULE_VERSION = "2026-10-09.1";

export type AssessmentState = "CLEAR_REMAINING" | "LIKELY_COMPLETE" | "AMBIGUOUS";

export type AssessmentReason =
  /** Workday: "Not Satisfied". */
  | "apr_not_satisfied"
  /** Workday: "Satisfied". */
  | "apr_satisfied"
  /** "In Progress", nothing stated as remaining, a registration still in progress: not complete until graded. */
  | "in_progress_pending_grade"
  /** "In Progress" with a stated remaining amount: it is not known whether the in-progress course is counted in it. */
  | "in_progress_with_remaining"
  /** Registrar-confirmed subrule ON: "In Progress" with a stated remaining amount is remaining. */
  | "in_progress_remaining_stated"
  /** "In Progress" with "Minimum Combination Required": the combination still owed is not stated. */
  | "in_progress_combination"
  /** "In Progress" with neither a remaining amount nor a registration listed. */
  | "in_progress_no_detail"
  /** A status word CampusVal does not recognise. */
  | "unknown_status"
  /** A requirement row with no status but other content. */
  | "missing_status";

export const REASON_TEXT: Record<AssessmentReason, string> = {
  apr_not_satisfied: "Your APR marks this Not Satisfied.",
  apr_satisfied: "Your APR marks this Satisfied.",
  in_progress_pending_grade:
    "Your APR marks this In Progress with a course still in progress. It is not complete until that course is finished and graded.",
  in_progress_with_remaining:
    "Your APR marks this In Progress and also lists an amount remaining. CampusVal cannot tell whether the in-progress course is already counted, so check Workday.",
  in_progress_remaining_stated: "Your APR marks this In Progress and lists an amount still remaining.",
  in_progress_combination:
    "Your APR marks this In Progress and says a combination is still required, without saying which. Check Workday.",
  in_progress_no_detail: "Your APR marks this In Progress without saying what remains. Check Workday.",
  unknown_status: "CampusVal does not recognise the status Workday shows for this row. Check Workday.",
  missing_status: "Your APR shows no status for this row. Check Workday.",
};

export type RemainingKind = "courses" | "units" | "gpa" | "combination" | "activities" | "other";

export interface RemainingInfo {
  /** Workday's words, verbatim ("Minimum 3 Course(s)"). */
  text: string;
  kind: RemainingKind;
  /** The number Workday states, when it states one (3 courses, 20 units, 2.000 GPA). */
  amount: number | null;
}

export interface AssessmentRegistration {
  /** Workday's words for the registration ("FNCE 121 - Corporate Finance"). */
  text: string;
  inProgress: boolean;
}

export interface AssessmentSource {
  sheet: string;
  sheetIndex: number;
  /** Zero-based source row of the requirement in the workbook (row r + 1 in Excel). */
  row: number;
  /** The program block as Workday titled it ("Finance Major Requirements"). */
  block: string | null;
  blockIndex: number;
  /** The compact-APR heading the row sits under ("Core", "Finance Major"). */
  group: string;
  groupKind: SidebarGroupKind;
}

export interface AssessmentItem {
  /** Stable across re-exports of the same report: block + requirement text + occurrence. */
  key: string;
  /** What the row said (status, remaining, registrations): a change flags a student's correction for review. */
  fingerprint: string;
  source: AssessmentSource;
  /** The requirement as Workday wrote it. */
  label: string;
  aprStatus: string | null;
  remaining: RemainingInfo | null;
  registrations: AssessmentRegistration[];
  derived: { state: AssessmentState; reason: AssessmentReason };
}

export interface AssessmentProgram {
  /** "b0", "b1": the program block's position in its sheet. */
  key: string;
  sheet: string;
  block: string | null;
  items: AssessmentItem[];
}

export interface WorkbookAssessment {
  ruleVersion: string;
  programs: AssessmentProgram[];
  /** Sheets the engine could not read as a requirements table (counted, never guessed at). */
  unassessableSheets: { sheet: string; reason: "header_not_found" | "status_column_not_found" }[];
}

export interface AssessmentOptions {
  /**
   * REGISTRAR-DEPENDENT, off by default. When Workday shows "In Progress" with a
   * stated remaining amount, does that amount EXCLUDE the in-progress
   * registrations (so it is still owed)? Until the Registrar confirms, CampusVal
   * treats the row as Needs Review.
   */
  inProgressRemainingIsAdditional: boolean;
}

export const DEFAULT_ASSESSMENT_OPTIONS: AssessmentOptions = { inProgressRemainingIsAdditional: false };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => squash(s).toLowerCase();
const hash = (parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

/** Workday's Remaining cell, read for its kind and number. The text is always kept verbatim. */
export function readRemaining(text: string): RemainingInfo | null {
  const t = squash(text);
  if (!t) return null;
  const number = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };
  if (/combination required/i.test(t)) return { text: t, kind: "combination", amount: null };
  if (/course\(?s?\)?/i.test(t) && /\d/.test(t)) return { text: t, kind: "courses", amount: number(/(\d+(?:\.\d+)?)\s*course/i) };
  if (/unit\(?s?\)?/i.test(t) && /\d/.test(t)) return { text: t, kind: "units", amount: number(/(\d+(?:\.\d+)?)\s*unit/i) };
  if (/\bgpa\b/i.test(t)) return { text: t, kind: "gpa", amount: number(/(\d+(?:\.\d+)?)\s*gpa/i) };
  if (/activit/i.test(t)) return { text: t, kind: "activities", amount: number(/activities?\s*:?\s*(\d+)/i) };
  return { text: t, kind: "other", amount: null };
}

type StatusWord = "satisfied" | "not_satisfied" | "in_progress" | "unknown" | "missing";

export function readStatus(text: string | null): StatusWord {
  const t = norm(text ?? "");
  if (!t) return "missing";
  if (t === "satisfied") return "satisfied";
  if (t === "not satisfied") return "not_satisfied";
  if (t === "in progress") return "in_progress";
  return "unknown";
}

/** The one place a row becomes a derived state. Exported for the rule tests. */
export function deriveState(
  status: string | null,
  remaining: RemainingInfo | null,
  registrations: AssessmentRegistration[],
  options: AssessmentOptions = DEFAULT_ASSESSMENT_OPTIONS,
): { state: AssessmentState; reason: AssessmentReason } {
  switch (readStatus(status)) {
    case "not_satisfied":
      return { state: "CLEAR_REMAINING", reason: "apr_not_satisfied" };
    case "satisfied":
      return { state: "LIKELY_COMPLETE", reason: "apr_satisfied" };
    case "in_progress": {
      if (remaining?.kind === "combination") return { state: "AMBIGUOUS", reason: "in_progress_combination" };
      if (remaining) {
        return options.inProgressRemainingIsAdditional && remaining.amount !== null && remaining.amount > 0
          ? { state: "CLEAR_REMAINING", reason: "in_progress_remaining_stated" }
          : { state: "AMBIGUOUS", reason: "in_progress_with_remaining" };
      }
      if (registrations.some((r) => r.inProgress)) return { state: "AMBIGUOUS", reason: "in_progress_pending_grade" };
      return { state: "AMBIGUOUS", reason: "in_progress_no_detail" };
    }
    case "missing":
      return { state: "AMBIGUOUS", reason: "missing_status" };
    default:
      return { state: "AMBIGUOUS", reason: "unknown_status" };
  }
}

const IN_PROGRESS_RE = /\(\s*in\s*progress\s*\)/i;

/** Assess every structured sheet of an APR workbook. Never throws on odd content; it reports it. */
export function assessWorkbook(workbook: AprWorkbook, options: AssessmentOptions = DEFAULT_ASSESSMENT_OPTIONS): WorkbookAssessment {
  const projection = projectForSidebar(workbook);
  const programs: AssessmentProgram[] = [];
  const unassessableSheets: WorkbookAssessment["unassessableSheets"] = [];

  for (const sheet of projection.sheets) {
    if (!sheet.structured) {
      unassessableSheets.push({ sheet: sheet.name, reason: "header_not_found" });
      continue;
    }
    const col = (re: RegExp) => sheet.columns.findIndex((c) => re.test(norm(c.header)));
    const requirementAt = col(/^requirements?$/);
    const statusAt = col(/^status$/);
    const remainingAt = col(/^remaining$/);
    const registrationsAt = col(/registrations? used|satisfied with/);
    if (statusAt < 0 || requirementAt < 0) {
      unassessableSheets.push({ sheet: sheet.name, reason: "status_column_not_found" });
      continue;
    }

    const byBlock = new Map<number, AssessmentProgram>();
    const occurrences = new Map<string, number>();
    for (const group of sheet.groups) {
      let program = byBlock.get(group.blockIndex);
      if (!program) {
        program = { key: `s${sheet.index}b${group.blockIndex}`, sheet: sheet.name, block: group.block, items: [] };
        byBlock.set(group.blockIndex, program);
        programs.push(program);
      }
      let current: { row: number; label: string; status: string; remaining: string; registrations: AssessmentRegistration[] } | null = null;
      const flush = () => {
        if (!current) return;
        const entry = current;
        current = null;
        // A label with nothing beside it and nothing under it is a heading, not a requirement.
        if (!entry.status && !entry.remaining && entry.registrations.length === 0) return;
        const identity = `${norm(group.block ?? "")}|${norm(entry.label)}`;
        const n = (occurrences.get(identity) ?? 0) + 1;
        occurrences.set(identity, n);
        const remaining = readRemaining(entry.remaining);
        program!.items.push({
          key: hash([norm(group.block ?? ""), norm(entry.label), String(n)]),
          fingerprint: hash([norm(entry.status), norm(entry.remaining), ...entry.registrations.map((r) => norm(r.text))]),
          source: {
            sheet: sheet.name,
            sheetIndex: sheet.index,
            row: entry.row,
            block: group.block,
            blockIndex: group.blockIndex,
            group: group.label,
            groupKind: group.kind,
          },
          label: entry.label,
          aprStatus: entry.status || null,
          remaining,
          registrations: entry.registrations,
          derived: deriveState(entry.status || null, remaining, entry.registrations, options),
        });
      };
      for (const row of group.rows) {
        const cell = (at: number) => (at >= 0 ? squash(row.cells[at] ?? "") : "");
        const label = cell(requirementAt);
        const registration = cell(registrationsAt);
        if (label) {
          flush();
          current = { row: row.r, label, status: cell(statusAt), remaining: cell(remainingAt), registrations: [] };
        }
        if (registration && current) {
          current.registrations.push({ text: registration, inProgress: IN_PROGRESS_RE.test(registration) });
        }
      }
      flush();
    }
  }
  return { ruleVersion: ASSESSMENT_RULE_VERSION, programs, unassessableSheets };
}
