/**
 * Degree Completion Assessment — the deterministic rule engine.
 *
 * CampusVal's PLANNING interpretation of an uploaded Workday Academic Progress
 * Report: "what appears to remain?". It is not Workday, it is not an official
 * degree audit, and it never writes anything back into the APR. Workday is the
 * definitive reference for degree completion.
 *
 *   APR workbook (read-only, the student's upload)
 *     -> structural rows (sidebar-projection.ts: no grades, periods or units)
 *     -> normalized APR model (apr-normalized.ts: requirements, course rows,
 *        hierarchy, status detail, minimum-combination statements)
 *     -> THIS ENGINE: one assessment item per APR requirement, with the rule
 *        applied, a confidence state, a rule code and the exact source row
 *     -> student corrections (stored separately; the automatic result stays)
 *
 * The rules are conservative on purpose. Only Workday's explicit words decide:
 *
 *   "Not Satisfied"  -> CLEAR_REMAINING   (Workday says it is not met)
 *   "Satisfied"      -> LIKELY_COMPLETE   (Workday says it is met, as of the export)
 *   "In Progress"    -> AMBIGUOUS (Needs Review), always, unless a
 *                       Registrar-confirmed subrule is switched on (see
 *                       `inProgressRemainingIsAdditional`). A requirement that
 *                       needs several courses can show "In Progress" with one
 *                       course registered and more still owed; a single
 *                       in-progress course is not complete until it is graded;
 *                       "Minimum combination not met" does not say how many
 *                       more. CampusVal does not guess which. "In Progress" is
 *                       NEVER complete.
 *   anything else    -> AMBIGUOUS (unknown status, missing status)
 *
 * The Registrar's answers (what "In Progress" means, whether a stated remaining
 * amount excludes in-progress courses, one-row-per-course exports) are pending.
 * They plug in as AssessmentOptions and rule codes here, without a UI change.
 *
 * No LLM, no heuristics about course content, no reading of grades. Pure and
 * deterministic: the same workbook always gives the same result.
 */
import type { AprWorkbook } from "../apr/workbook-model";
import type { SidebarGroupKind } from "../apr/sidebar-projection";
import {
  normalizeApr,
  readRemaining,
  readStatusCell,
  type NormalizedAprRequirement,
  type RemainingInfo,
  type StatusWord,
} from "./apr-normalized";

export { readRemaining, type RemainingInfo, type RemainingKind } from "./apr-normalized";

/** Bumped whenever a rule changes meaning, so a trace says which rules produced it. */
export const ASSESSMENT_RULE_VERSION = "2026-10-20.1";

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
  /** "In Progress" with a minimum-combination statement ("Minimum Combination Required" / "not met"). */
  | "in_progress_combination"
  /** "In Progress" with neither a remaining amount nor a registration listed. */
  | "in_progress_no_detail"
  /** A status word CampusVal does not recognise (or a status with words beside it CampusVal cannot read). */
  | "unknown_status"
  /** A requirement row with no status but other content. */
  | "missing_status";

/**
 * The rule that decided, as a stable code a Registrar decision can be tested
 * against. USER_OVERRIDE is set by the service when a student's correction applies.
 */
export type AssessmentRuleCode =
  | "SATISFIED_EXPLICIT"
  | "NOT_SATISFIED_EXPLICIT"
  /** "In Progress" whose only course row is the one in progress: the last course appears scheduled. Still Needs Review. */
  | "IN_PROGRESS_SINGLE_FINAL_COURSE"
  /** "In Progress" with a minimum-combination statement. */
  | "IN_PROGRESS_MINIMUM_NOT_MET"
  /** "In Progress" needing more than CampusVal can count from the source. */
  | "MULTI_COURSE_AMBIGUOUS"
  | "UNKNOWN_STATUS"
  | "USER_OVERRIDE";

/**
 * How many courses remain, ONLY when the source states it deterministically.
 * SOURCE_COUNT_AVAILABLE: Workday's own words give the number (a "Not
 * Satisfied" row's "Minimum N Course(s)", or "Satisfied" = 0).
 * SOURCE_COUNT_UNAVAILABLE: the source does not say, or says it ambiguously
 * (an "In Progress" row's remaining amount, while the Registrar has not
 * confirmed whether it excludes in-progress courses).
 */
export interface RemainingCourses {
  count: number | null;
  basis: "SOURCE_COUNT_AVAILABLE" | "SOURCE_COUNT_UNAVAILABLE";
}

export const REASON_TEXT: Record<AssessmentReason, string> = {
  apr_not_satisfied: "Your APR marks this Not Satisfied.",
  apr_satisfied: "Your APR marks this Satisfied.",
  in_progress_pending_grade:
    "Your APR marks this In Progress with a course still in progress. It is not complete until that course is finished and graded.",
  in_progress_with_remaining:
    "Your APR marks this In Progress and also lists an amount remaining. CampusVal cannot tell whether the in-progress course is already counted, so check Workday.",
  in_progress_remaining_stated: "Your APR marks this In Progress and lists an amount still remaining.",
  in_progress_combination:
    "Your APR marks this In Progress and says a minimum combination is not yet met. CampusVal does not interpret that until the Registrar confirms what it means. Check Workday.",
  in_progress_no_detail: "Your APR marks this In Progress without saying what remains. Check Workday.",
  unknown_status: "CampusVal does not recognise the status Workday shows for this row. Check Workday.",
  missing_status: "Your APR shows no status for this row. Check Workday.",
};

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
  /** Text Workday printed with the status in the same cell, verbatim. */
  statusDetail: string | null;
  remaining: RemainingInfo | null;
  /** The minimum-combination statement, when the row has one (Remaining cell or status detail). */
  minimumCombination: RemainingInfo | null;
  registrations: AssessmentRegistration[];
  /** Parent requirement key (Workday's indent), when the row sits under another. */
  parentKey: string | null;
  derived: { state: AssessmentState; reason: AssessmentReason };
  rule: { code: AssessmentRuleCode; remainingCourses: RemainingCourses };
}

export interface AssessmentProgram {
  /** "s0b0", "s0b1": the program block's position in its sheet. */
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

/**
 * Registrar-dependent switches. Every one is OFF until the Registrar confirms
 * the semantics; switching one on is a policy change, not an engineering one.
 */
export interface AssessmentOptions {
  /**
   * When Workday shows "In Progress" with a stated remaining amount, does that
   * amount EXCLUDE the in-progress registrations (so it is still owed)? Until
   * the Registrar confirms, CampusVal treats the row as Needs Review and does
   * not report a remaining count.
   */
  inProgressRemainingIsAdditional: boolean;
}

export const DEFAULT_ASSESSMENT_OPTIONS: AssessmentOptions = { inProgressRemainingIsAdditional: false };

/** Workday's Status cell, as one word. */
export function readStatus(text: string | null): StatusWord {
  const reading = readStatusCell(text);
  // A status with words beside it that are not a remaining statement is not one CampusVal recognises.
  if ((reading.word === "satisfied" || reading.word === "not_satisfied") && reading.detail) return "unknown";
  return reading.word;
}

/** The one place a row becomes a derived state. Exported for the rule tests. */
export function deriveState(
  status: string | null,
  remaining: RemainingInfo | null,
  registrations: AssessmentRegistration[],
  options: AssessmentOptions = DEFAULT_ASSESSMENT_OPTIONS,
): { state: AssessmentState; reason: AssessmentReason } {
  const reading = readStatusCell(status);
  const detail = reading.detail ? readRemaining(reading.detail) : null;
  switch (readStatus(status)) {
    case "not_satisfied":
      return { state: "CLEAR_REMAINING", reason: "apr_not_satisfied" };
    case "satisfied":
      return { state: "LIKELY_COMPLETE", reason: "apr_satisfied" };
    case "in_progress": {
      if (remaining?.kind === "combination" || detail?.kind === "combination") return { state: "AMBIGUOUS", reason: "in_progress_combination" };
      const stated = remaining ?? detail;
      if (stated) {
        return options.inProgressRemainingIsAdditional && stated.amount !== null && stated.amount > 0
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

/** The rule code for a derived state, from the source fields (never the status text alone). */
export function ruleCodeOf(reason: AssessmentReason, registrations: AssessmentRegistration[]): AssessmentRuleCode {
  switch (reason) {
    case "apr_satisfied":
      return "SATISFIED_EXPLICIT";
    case "apr_not_satisfied":
      return "NOT_SATISFIED_EXPLICIT";
    case "in_progress_combination":
      return "IN_PROGRESS_MINIMUM_NOT_MET";
    case "in_progress_pending_grade":
      // Exactly one course row, and it is the one in progress: the final course appears scheduled.
      return registrations.length === 1 && registrations[0]!.inProgress ? "IN_PROGRESS_SINGLE_FINAL_COURSE" : "MULTI_COURSE_AMBIGUOUS";
    case "in_progress_with_remaining":
    case "in_progress_remaining_stated":
    case "in_progress_no_detail":
      return "MULTI_COURSE_AMBIGUOUS";
    default:
      return "UNKNOWN_STATUS";
  }
}

/**
 * Remaining courses, only when the source states it deterministically. Never
 * computed by counting course rows against an assumed minimum: a requirement's
 * qualifying-course rules (alternatives, overlaps) are not in the APR.
 */
export function remainingCoursesOf(
  derived: { state: AssessmentState; reason: AssessmentReason },
  remaining: RemainingInfo | null,
  minimumCombination: RemainingInfo | null,
): RemainingCourses {
  const unavailable: RemainingCourses = { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" };
  const courses = (info: RemainingInfo | null) =>
    info && info.amount !== null && (info.kind === "courses" || (info.kind === "combination" && info.unit === "courses")) ? info.amount : null;
  switch (derived.reason) {
    case "apr_satisfied":
      return { count: 0, basis: "SOURCE_COUNT_AVAILABLE" };
    case "apr_not_satisfied":
    case "in_progress_remaining_stated": {
      // Not Satisfied: Workday's Remaining column states what is still owed.
      // In Progress: only once the Registrar has confirmed the amount excludes in-progress courses.
      const n = courses(remaining) ?? courses(minimumCombination);
      return n === null ? unavailable : { count: n, basis: "SOURCE_COUNT_AVAILABLE" };
    }
    default:
      return unavailable;
  }
}

function assessRequirement(req: NormalizedAprRequirement, options: AssessmentOptions): AssessmentItem {
  const registrations = req.courseRows.map((r) => ({ text: r.text, inProgress: r.inProgress }));
  const derived = deriveState(req.status, req.remaining, registrations, options);
  return {
    key: req.key,
    fingerprint: req.fingerprint,
    source: {
      sheet: req.source.sheet,
      sheetIndex: req.source.sheetIndex,
      row: req.source.row,
      block: req.source.block,
      blockIndex: req.source.blockIndex,
      group: req.source.group,
      groupKind: req.source.groupKind,
    },
    label: req.label,
    aprStatus: req.status,
    statusDetail: req.statusDetail,
    remaining: req.remaining,
    minimumCombination: req.minimumCombination,
    registrations,
    parentKey: req.parentKey,
    derived,
    rule: { code: ruleCodeOf(derived.reason, registrations), remainingCourses: remainingCoursesOf(derived, req.remaining, req.minimumCombination) },
  };
}

/** Assess every structured sheet of an APR workbook. Never throws on odd content; it reports it. */
export function assessWorkbook(workbook: AprWorkbook, options: AssessmentOptions = DEFAULT_ASSESSMENT_OPTIONS): WorkbookAssessment {
  const normalized = normalizeApr(workbook);
  const programs: AssessmentProgram[] = [];
  const byBlock = new Map<string, AssessmentProgram>();
  for (const req of normalized.requirements) {
    const key = `s${req.source.sheetIndex}b${req.source.blockIndex}`;
    let program = byBlock.get(key);
    if (!program) {
      program = { key, sheet: req.source.sheet, block: req.source.block, items: [] };
      byBlock.set(key, program);
      programs.push(program);
    }
    program.items.push(assessRequirement(req, options));
  }
  return { ruleVersion: ASSESSMENT_RULE_VERSION, programs, unassessableSheets: normalized.unreadableSheets };
}
