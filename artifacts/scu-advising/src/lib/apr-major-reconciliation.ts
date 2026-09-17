/**
 * Neutral APR-vs-plan major reconciliation (professor feedback, 2026-09):
 * "If APR says the student has a different major/catalog requirement from
 * the active CampusVal plan, show a neutral comparison warning... Do not
 * automatically switch the student's CampusVal primary major or delete
 * planning content."
 *
 * Comparison only — this module never reads or writes plan/profile state,
 * and the caller must never act on its result beyond displaying a banner.
 * Deliberately conservative: matching the parser's own philosophy elsewhere
 * in this codebase, an ambiguous or noisy comparison returns "unknown"
 * (no warning shown) rather than guessing a mismatch that could wrongly
 * alarm a student.
 */

export type MajorReconciliation = "match" | "mismatch" | "unknown";

const NOISE_WORDS =
  /\b(major|minor|program|degree|bachelor of science|bachelor of arts|b\.?s\.?|b\.?a\.?)\b/g;

function normalizeMajorText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(NOISE_WORDS, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Anything longer than this is more likely a noisy multi-field APR line
 * (e.g. "Program: Finance  Expected Grad: Spring 2027") than a clean major
 * name — too risky to compare confidently. */
const MAX_COMPARABLE_LENGTH = 80;

export function reconcileMajor(
  aprProgramText: string | null | undefined,
  planMajorTitle: string | null | undefined,
): MajorReconciliation {
  if (!aprProgramText || !planMajorTitle) return "unknown";
  if (
    aprProgramText.length > MAX_COMPARABLE_LENGTH ||
    planMajorTitle.length > MAX_COMPARABLE_LENGTH
  ) {
    return "unknown";
  }

  const apr = normalizeMajorText(aprProgramText);
  const plan = normalizeMajorText(planMajorTitle);
  if (apr.length < 3 || plan.length < 3) return "unknown";
  if (apr === plan || apr.includes(plan) || plan.includes(apr)) return "match";
  return "mismatch";
}
