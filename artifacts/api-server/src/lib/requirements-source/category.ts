/**
 * The canonical requirement categories. A requirement's category comes from
 * the Bulletin-derived GROUP it is in, never from where it happens to appear in
 * a department checksheet: a checksheet lists Critical Thinking & Writing under
 * the department's own heading, but CTW is still University Core.
 *
 *   UNIVERSITY     degree-level rules (175 units, residency, GPA...)
 *   CORE           the University Core Curriculum (Foundations, Explorations,
 *                  Integrations: CTW, C&I, RTC, Pathways...)
 *   SCHOOL         a school's own requirements (Leavey Common Curriculum, SOE
 *                  units, CAS units)
 *   MAJOR          a major's courses
 *   MINOR          a minor's courses
 *   CONCENTRATION  a concentration / track of a major (named on the major, no
 *                  course list is loaded for it yet)
 *   OTHER          anything else, e.g. a student's Professional Preparation goal
 */
export const REQUIREMENT_CATEGORIES = [
  "UNIVERSITY",
  "CORE",
  "SCHOOL",
  "MAJOR",
  "MINOR",
  "CONCENTRATION",
  "OTHER",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

/** Group kinds the builders emit. */
export type RequirementGroupKind =
  | "university"
  | "university_core"
  | "college"
  | "major"
  | "minor"
  | "concentration"
  | "professional_prep";

const CATEGORY_OF_KIND: Record<RequirementGroupKind, RequirementCategory> = {
  university: "UNIVERSITY",
  university_core: "CORE",
  college: "SCHOOL",
  major: "MAJOR",
  minor: "MINOR",
  concentration: "CONCENTRATION",
  professional_prep: "OTHER",
};

export function categoryOfGroupKind(kind: string): RequirementCategory {
  return (CATEGORY_OF_KIND as Record<string, RequirementCategory | undefined>)[kind] ?? "OTHER";
}

/**
 * Words that name University Core areas. A MAJOR requirement whose wording is
 * one of these is a Core area standing in the wrong place (this is how Core
 * content once showed up under every major). Matches on whole-label shape, so
 * a real course whose title merely contains a phase word is not matched.
 */
const CORE_AREA_LABEL =
  /^(critical thinking (?:and|&) writing\s*\d?|ctw\s*\d|cultures? (?:and|&) ideas\s*\d?|c&i\s*\d|religion,? theology (?:and|&) culture\s*\d?|rtc\s*\d|pathway\s*\d?|advanced writing|experiential learning for social justice|elsj|ethics|civic engagement|diversity|science,? technology (?:and|&) society|natural science|social science|arts|second language|mathematics)$/i;

/** Course codes the Core uses as its CTW sequence. */
const CTW_COURSE_CODES = new Set(["ENGL 1A", "ENGL 1B", "ENGL 1AH", "ENGL 1BH"]);

export function looksLikeCoreAreaLabel(label: string): boolean {
  const bare = label
    .replace(/^[A-Z]{2,5}\s?\d+[A-Z]*\s+[—-]\s+/, "")
    .trim();
  return CORE_AREA_LABEL.test(bare);
}

export function isCtwCourseCode(code: string): boolean {
  return CTW_COURSE_CODES.has(code.trim().toUpperCase().replace(/\s+/g, " "));
}
