import type { CourseScheduleStatus } from "@workspace/api-client-react";

/**
 * Wording for course components (lecture, lab, discussion, recitation), shared
 * by every Quarter Plan surface. The component of a section comes from the API,
 * which applies one rule to every course; nothing here knows about a
 * department or a course code.
 */
export const COMPONENT_LABEL: Record<string, string> = {
  lecture: "Lecture",
  lab: "Lab",
  discussion: "Discussion",
  recitation: "Recitation",
  unknown: "Other",
};

export const COMPONENT_ORDER = ["lecture", "lab", "discussion", "recitation", "unknown"];

export const componentLabel = (type: string | null | undefined): string =>
  COMPONENT_LABEL[type ?? "unknown"] ?? "Section";

/**
 * One line saying where a course stands, in words (never colour alone):
 *   "Lecture selected · Lab required"
 *   "Lecture + Lab selected"
 *   "Lecture selected · Lab times not yet published"
 */
export function courseStatusText(status: Pick<CourseScheduleStatus, "scheduled" | "missing" | "notYetPublished">): string {
  const parts: string[] = [];
  if (status.scheduled.length > 0) {
    parts.push(`${status.scheduled.map(componentLabel).join(" + ")} selected`);
  }
  if (status.missing.length > 0) {
    parts.push(`${status.missing.map(componentLabel).join(" + ")} required`);
  }
  if (status.notYetPublished.length > 0) {
    parts.push(`${status.notYetPublished.map(componentLabel).join(" + ")} times not yet published`);
  }
  return parts.join(" · ");
}
