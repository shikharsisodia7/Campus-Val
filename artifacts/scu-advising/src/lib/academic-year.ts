/**
 * The one place that converts between CampusVal's two year conventions.
 *
 * Plan items store `academicYear` as the ACADEMIC-YEAR ANCHOR: every term of
 * the 2026-27 year is stored as 2026, so a Winter item saved as
 * `{ academicYear: 2026, term: "winter" }` is calendar Winter 2027. The Degree
 * Plan board relies on this — it groups by that single number and renders the
 * heading "2026–2027" with fall/winter/spring beneath it.
 *
 * SCU schedule data uses CALENDAR years instead: the Registrar publishes
 * Fall 2026, Winter 2027 and Spring 2027 as three separate terms.
 *
 * Mixing the two silently breaks Winter and Spring, because Fall is the one
 * term where anchor and calendar year happen to be equal:
 *
 *   - Quarter Plan looked up carryover by calendar year, so Winter 2027 showed
 *     the NEXT academic year's Winter courses instead of the current one.
 *   - Term columns looked up schedule availability by anchor year, so Winter
 *     and Spring never matched a published/tentative term and were left
 *     unlabelled while Fall showed "Published schedule".
 *
 * Both were reported by the professor. Convert explicitly, always.
 */

/** Calendar year the term actually falls in, given its academic-year anchor. */
export function calendarYearFor(term: string, anchorYear: number): number {
  return term === "fall" ? anchorYear : anchorYear + 1;
}

/** Academic-year anchor a term belongs to, given its calendar year. */
export function anchorYearFor(term: string, calendarYear: number): number {
  return term === "fall" ? calendarYear : calendarYear - 1;
}

/** Human label for an academic year, e.g. 2026 -> "2026–27". */
export function academicYearLabel(anchorYear: number): string {
  return `${anchorYear}–${String(anchorYear + 1).slice(-2)}`;
}
