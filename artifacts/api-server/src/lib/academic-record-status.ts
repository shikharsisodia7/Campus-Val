/**
 * Central domain rule for deciding whether an academic record (a course row
 * from an Academic Progress Report or similar history document) counts as
 * COMPLETED, NOT completed, or NEEDS REVIEW.
 *
 * Every parser/import path must use this single rule — never scatter
 * status-string comparisons around the codebase.
 */

/** Lifecycle classification of one academic record. */
export type AcademicRecordCompletion =
  | "completed"
  | "not_completed"
  | "needs_review";

/**
 * Section-level status inferred from an APR section header
 * (e.g. "In Progress - FALL 2025-2026", "Transfer Credit", "WINTER 2022-2023").
 */
export type ReportSectionStatus =
  | "completed_term" // a past term section listing graded coursework
  | "transfer_credit" // accepted transfer/AP/IB/test credit
  | "in_progress" // currently enrolled, not finished
  | "not_completed" // withdrawn / dropped / planned / registered sections
  | "unknown";

/** Grades that prove successful completion / earned credit. */
const COMPLETED_GRADES = new Set([
  "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-",
  "P", // pass
  "CR", // credit (incl. transfer/AP/IB accepted credit)
]);

/** Grades that prove the course was NOT successfully completed. */
const NOT_COMPLETED_GRADES = new Set([
  "F",
  "NP", // no pass
  "NC", // no credit
  "W", // withdrawn
  "I", // incomplete — not automatically completed
  "AU", // audit — no credit earned
]);

const IN_PROGRESS_HEADER = /\bIN[\s-]?PROGRESS\b/;
const TRANSFER_HEADER = /\bTRANSFER\s+CREDIT\b|\bTEST\s+CREDIT\b|\bAP\/IB\b|\bADVANCED\s+PLACEMENT\b/;
const NOT_COMPLETED_HEADER = /\bWITHDRAWN\b|\bDROPPED\b|\bPLANNED\b|\bREGISTERED\b|\bNOT\s+COMPLETED\b/;
const COMPLETED_TEXT = /\bCOMPLETED\b/;
const TERM_HEADER = /^(FALL|WINTER|SPRING|SUMMER)\s+\d{4}([-–/]\d{2,4})?\s*$/;

/**
 * Classify an APR section header line (already uppercased/trimmed).
 * Returns null when the line is not a section header.
 */
export function classifySectionHeader(upperLine: string): ReportSectionStatus | null {
  // "In Progress - FALL 2025-2026" must win over the term-header match.
  if (IN_PROGRESS_HEADER.test(upperLine)) return "in_progress";
  if (NOT_COMPLETED_HEADER.test(upperLine)) return "not_completed";
  if (TRANSFER_HEADER.test(upperLine)) return "transfer_credit";
  if (TERM_HEADER.test(upperLine)) return "completed_term";
  // "Completed Courses" style headers (checked after the negative statuses so
  // "Not Completed" can never be mistaken for completed).
  if (COMPLETED_TEXT.test(upperLine)) return "completed_term";
  return null;
}

/**
 * THE central completion rule.
 *
 * A record is completed only when its section or grade affirmatively proves
 * successful completion / accepted credit. In-progress, withdrawn, dropped,
 * registered, planned, incomplete, and unknown states are never completed.
 * Records without any affirmative signal are "needs_review" — conservative,
 * never silently treated as completed.
 */
export function classifyAcademicRecordCompletion(input: {
  sectionStatus: ReportSectionStatus;
  grade: string | null;
}): AcademicRecordCompletion {
  const grade = input.grade?.toUpperCase().trim() || null;

  // An explicit final grade is the strongest evidence and wins over section
  // text: PDF extraction often collapses lines, letting "In Progress" header
  // text bleed into graded rows. A W/F/NP grade proves not-completed; a
  // passing grade proves completion. In-progress rows never carry a final
  // grade ("---" / blank), so they still fall through to the section rules.
  if (grade && NOT_COMPLETED_GRADES.has(grade)) return "not_completed";
  if (grade && COMPLETED_GRADES.has(grade)) return "completed";

  if (input.sectionStatus === "in_progress") return "not_completed";
  if (input.sectionStatus === "not_completed") return "not_completed";

  // No usable grade ("---", blank, unrecognized): rely on the section.
  if (input.sectionStatus === "transfer_credit") return "completed";
  if (input.sectionStatus === "completed_term") return "completed";

  return "needs_review";
}

/**
 * Row-level status override: a course row whose own status column says
 * "In Progress" / "Withdrawn" / "Registered" etc. must never be counted as
 * completed, regardless of which section it appears in.
 */
export function classifyRowStatusText(upperLine: string): ReportSectionStatus | null {
  if (IN_PROGRESS_HEADER.test(upperLine)) return "in_progress";
  if (NOT_COMPLETED_HEADER.test(upperLine)) return "not_completed";
  if (COMPLETED_TEXT.test(upperLine)) return "completed_term";
  return null;
}

/** Grade-token pattern shared with the parser (Workday letter grades). */
export const KNOWN_GRADE_TOKEN = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|NP|W|I|CR|NC|AU)$/;
