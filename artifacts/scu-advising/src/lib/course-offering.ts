import type { ScheduleAvailability } from "@workspace/api-client-react";

/**
 * Course-term availability — one place that answers "can this course go in
 * this quarter?"
 *
 * The professor asked for two things here. First, CampusVal must flag a
 * course placed in a quarter where schedule data says it is not offered.
 * Second, the tentative/projected labelling must be CONSISTENT: some future
 * terms were showing as tentative and others were not.
 *
 * Evidence is graded, and the grade is always reported alongside the answer:
 *
 *   published  — SCU has published the official schedule for that term.
 *                Absence from it is real evidence the course is not offered.
 *   tentative  — the Registrar's tentative schedule exists for that term.
 *                Good evidence, but subject to change.
 *   projected  — the term itself has no SCU schedule yet, so we fall back to
 *                the seasonal pattern of the terms we DO have verified data
 *                for. This is a planning projection, never a fact, and never
 *                carries section numbers, instructors or times.
 *   unknown    — we have no basis at all. Say so rather than guessing.
 *
 * Nothing here invents sections. A projection only ever says "this course has
 * historically been offered in this season, per the verified schedules we
 * hold" — the caller must label it Tentative/Projected.
 */

export type OfferingEvidence =
  | "published"
  | "tentative"
  | "projected"
  | "unknown";

export type OfferingVerdict = "offered" | "not_offered" | "unknown";

export interface OfferingResult {
  verdict: OfferingVerdict;
  evidence: OfferingEvidence;
  /** Short, honest label for the term itself (not the course). */
  termLabel: string;
  /** Sentence explaining the verdict, safe to show to a student. */
  detail: string;
}

/** Longer explanation for a "projected" term label — shown as a tooltip, not inline, to avoid clutter. */
export const PROJECTED_TERM_EXPLANATION =
  "Based on the most recent SCU schedule for this quarter; future offerings may change.";

export function normalizeCourseCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, " ").trim();
}

const SEASON_LABEL: Record<string, string> = {
  fall: "Fall",
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

/**
 * The label for a term column, independent of any particular course.
 * Future terms with no SCU schedule are explicitly "Projected", so a student
 * never sees a bare unlabelled future quarter next to a tentative one.
 */
export function termOfferingLabel(
  term: string,
  year: number,
  availability: ScheduleAvailability | undefined,
): { label: string; evidence: OfferingEvidence } {
  const known = availability?.terms.find(
    (t) => t.term === term && t.year === year,
  );
  if (known?.status === "published") {
    return { label: "Published schedule", evidence: "published" };
  }
  if (known?.status === "tentative") {
    return { label: "Tentative schedule", evidence: "tentative" };
  }
  // No SCU schedule for this exact term. If we hold a verified schedule for
  // the same season in another year, we can benchmark from it. The professor
  // asked this NOT be called "Projected" — it's still shown as "Tentative
  // schedule" (same word as a real Registrar tentative schedule), just with
  // a distinct color and a longer tooltip (PROJECTED_TERM_EXPLANATION) so a
  // student can tell the two apart without a confusing third label.
  const sameSeason = availability?.terms.some((t) => t.term === term);
  if (sameSeason) {
    return { label: "Tentative schedule", evidence: "projected" };
  }
  return { label: "No SCU schedule for this quarter", evidence: "unknown" };
}

/**
 * Is `courseCode` offered in `term` `year`?
 *
 * Summer is deliberately never projected: CampusVal holds no verified Summer
 * schedule, so a Summer placement is honestly unknown rather than guessed.
 */
export function courseOffering(
  courseCode: string,
  term: string,
  year: number,
  availability: ScheduleAvailability | undefined,
): OfferingResult {
  const code = normalizeCourseCode(courseCode);
  const season = SEASON_LABEL[term] ?? term;
  const { label: termLabel, evidence: termEvidence } = termOfferingLabel(
    term,
    year,
    availability,
  );

  const exact = availability?.terms.find(
    (t) => t.term === term && t.year === year,
  );

  // 1. A real schedule exists for this exact term — published or tentative.
  if (exact && (exact.status === "published" || exact.status === "tentative")) {
    const offered = (exact.offeredCourseCodes ?? [])
      .map(normalizeCourseCode)
      .includes(code);
    const evidence: OfferingEvidence =
      exact.status === "published" ? "published" : "tentative";
    if (offered) {
      return {
        verdict: "offered",
        evidence,
        termLabel,
        detail:
          evidence === "published"
            ? `${code} appears in SCU's published ${season} ${year} schedule.`
            : `${code} appears in the Registrar's tentative ${season} ${year} schedule, which can still change.`,
      };
    }
    return {
      verdict: "not_offered",
      evidence,
      termLabel,
      detail:
        evidence === "published"
          ? `${code} is not in SCU's published ${season} ${year} schedule. Move it to a quarter where it is offered, or verify in Workday.`
          : `${code} is not in the Registrar's tentative ${season} ${year} schedule. That schedule can still change — verify before relying on it.`,
    };
  }

  // 2. No schedule for this term. Summer is never projected.
  if (term === "summer") {
    return {
      verdict: "unknown",
      evidence: "unknown",
      termLabel,
      detail: `CampusVal has no verified Summer schedule, so it cannot tell whether ${code} is offered in Summer ${year}. Check Workday.`,
    };
  }

  // 3. Project from the same season in the years we DO hold verified data for.
  const sameSeasonTerms = (availability?.terms ?? []).filter(
    (t) =>
      t.term === term &&
      (t.status === "published" || t.status === "tentative"),
  );
  if (sameSeasonTerms.length > 0) {
    const everOffered = sameSeasonTerms.some((t) =>
      (t.offeredCourseCodes ?? []).map(normalizeCourseCode).includes(code),
    );
    return {
      verdict: everOffered ? "offered" : "not_offered",
      evidence: "projected",
      termLabel,
      detail: everOffered
        ? `SCU has not published a ${season} ${year} schedule yet. Based on the most recent verified ${season} schedule CampusVal holds, ${code} is normally offered in ${season} — treat this as tentative and confirm when the schedule is published.`
        : `${code} was not offered in the most recent verified ${season} schedule CampusVal holds for benchmarking ${season} ${year}. Future offerings may change — verify in Workday.`,
    };
  }

  // 4. Nothing to go on.
  return {
    verdict: "unknown",
    evidence: termEvidence === "unknown" ? "unknown" : termEvidence,
    termLabel,
    detail: `CampusVal has no SCU schedule for ${season} ${year}, so it cannot tell whether ${code} is offered. Verify in Workday.`,
  };
}

/** Should this result be surfaced to the student as a warning? */
export function isOfferingWarning(result: OfferingResult): boolean {
  return result.verdict === "not_offered";
}

/** True when the result must be presented as tentative/projected, not fact. */
export function isProvisional(result: OfferingResult): boolean {
  return result.evidence === "tentative" || result.evidence === "projected";
}
