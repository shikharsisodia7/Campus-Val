/**
 * Validation of a sample plan against the CampusVal catalog. Reports; never
 * substitutes. A course that is not in the catalog stays what the source said
 * and is flagged: when a plan is loaded it becomes a placeholder carrying the
 * source's own wording, not another course.
 */
import { findCourse } from "../../data/courses";

export const SAMPLE_TERMS = ["fall", "winter", "spring", "summer"] as const;
export type SampleTerm = (typeof SAMPLE_TERMS)[number];
export const SAMPLE_PLAN_LENGTHS = ["first_year", "two_year", "four_year", "other"] as const;
export type SamplePlanLength = (typeof SAMPLE_PLAN_LENGTHS)[number];

export interface SampleItemInput {
  year: number;
  term: string;
  itemType: "course" | "placeholder";
  courseCode?: string | null;
  label?: string | null;
  sourceTitle?: string | null;
  note?: string | null;
}

export type SampleWarningCode = "course_not_in_catalog" | "course_renamed" | "invalid_term" | "invalid_year" | "duplicate_course" | "empty_item";

export interface SampleWarning {
  code: SampleWarningCode;
  year: number;
  term: string;
  courseCode: string | null;
  message: string;
}

export const normalizeCourseCode = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, " ");
const words = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function validateSampleItems(items: readonly SampleItemInput[], maxYears = 8): SampleWarning[] {
  const warnings: SampleWarning[] = [];
  const seen = new Map<string, string>();
  for (const item of items) {
    const code = item.courseCode ? normalizeCourseCode(item.courseCode) : null;
    const at = (c: SampleWarningCode, message: string) =>
      warnings.push({ code: c, year: item.year, term: item.term, courseCode: code, message });
    if (!(SAMPLE_TERMS as readonly string[]).includes(item.term)) at("invalid_term", `"${item.term}" is not a quarter.`);
    if (!Number.isInteger(item.year) || item.year < 1 || item.year > maxYears) at("invalid_year", `Year ${item.year} is outside the plan.`);
    if (item.itemType === "course") {
      if (!code) {
        at("empty_item", "A course entry has no course code.");
        continue;
      }
      const course = findCourse(code);
      if (!course) at("course_not_in_catalog", `${code} is not in the CampusVal catalog; it is loaded as a placeholder.`);
      else if (item.sourceTitle && words(item.sourceTitle) !== words(course.title)) {
        at("course_renamed", `${code} is "${item.sourceTitle}" in the source and "${course.title}" in the catalog.`);
      }
      const where = `${item.year}-${item.term}`;
      const earlier = seen.get(code);
      if (earlier) at("duplicate_course", `${code} appears twice (${earlier} and ${where}).`);
      else seen.set(code, where);
    } else if (!item.label?.trim()) {
      at("empty_item", "A placeholder has no wording.");
    }
  }
  return warnings;
}
