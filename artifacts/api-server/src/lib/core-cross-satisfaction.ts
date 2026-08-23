import { findCourse } from "../data/courses";

/**
 * University Core / major cross-satisfaction.
 *
 * The professor's correction: Core and major requirements were treated as
 * independent lists, so a student planning MATH 11 for their engineering major
 * still saw an unmet Mathematics Core requirement and was pushed toward adding
 * a duplicate course. Many major courses genuinely carry a Core designation,
 * and the Core requirement should recognise them.
 *
 * Two signals are used, in priority order:
 *
 *  1. The requirement's own explicit `courses` list. When SCU names the
 *     satisfying courses (e.g. Leavey Mathematics = MATH 30 or MATH 11) that
 *     list is authoritative and needs no further verification.
 *
 *  2. The catalog's Core-area tagging for a course. SCU's bulletin scrape did
 *     not capture per-course Core designations, so data/courses.ts derives
 *     them from department and course-number ranges. That is a documented
 *     heuristic, NOT an official designation — so anything matched this way is
 *     returned with `needsVerification: true` and the UI must say the student
 *     should confirm it. We never silently upgrade a heuristic match into a
 *     satisfied requirement.
 *
 * Planned courses never count as "completed": a course the student intends to
 * take reports status "planned", and only verified completion provenance
 * yields "completed".
 */

/** Core requirement id -> the catalog Core-area tag it corresponds to. */
const CORE_AREA_BY_ITEM_ID: Record<string, string> = {
  math: "Mathematics",
  natsci: "Natural Science",
  socsci: "Social Science",
  arts: "Arts",
  ethics: "Ethics",
  diversity: "Diversity",
  civic: "Civic Engagement",
  lang: "Second Language",
  sts: "Science, Technology & Society",
  ctw1: "Critical Thinking & Writing",
  ctw2: "Critical Thinking & Writing",
  advwriting: "Advanced Writing",
  ci1: "Cultures & Ideas",
  ci2: "Cultures & Ideas",
  rtc1: "Religion, Theology & Culture",
  rtc2: "Religion, Theology & Culture",
  rtc3: "Religion, Theology & Culture",
};

export type RequirementStatus = "completed" | "planned" | "open";

export interface CrossSatisfaction {
  /** Completed courses that satisfy this requirement. */
  satisfiedBy: string[];
  /** Planned-but-not-yet-completed courses that would satisfy it. */
  plannedBy: string[];
  /**
   * Courses matched through the catalog's derived Core-area tagging rather
   * than an explicit SCU course list. Always needs student verification.
   */
  crossSatisfiedBy: string[];
  status: RequirementStatus;
  /** True when the only evidence is a derived Core-area match. */
  needsVerification: boolean;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

/** The Core areas a course carries, per the catalog's derived tagging. */
export function coreAreasFor(courseCode: string): string[] {
  return findCourse(courseCode)?.coreAreas ?? [];
}

/**
 * Resolve one requirement item against what the student has completed and
 * what they have planned.
 *
 * `itemCourses` is the requirement's explicit course list (may be empty).
 * `itemId` is used to look up the Core area for list-less Core requirements.
 */
export function resolveCrossSatisfaction(
  itemId: string,
  itemCourses: string[],
  completed: Set<string>,
  planned: Set<string>,
): CrossSatisfaction {
  const explicit = itemCourses.map(normalizeCode);

  // 1. Explicit, authoritative course list.
  const satisfiedBy = itemCourses.filter((c) => completed.has(normalizeCode(c)));
  const plannedBy = itemCourses.filter(
    (c) => !completed.has(normalizeCode(c)) && planned.has(normalizeCode(c)),
  );

  // 2. Derived Core-area match, only for requirements that have one and only
  //    for courses not already accounted for by the explicit list.
  const area = CORE_AREA_BY_ITEM_ID[itemId];
  const crossSatisfiedBy: string[] = [];
  let crossCompleted = false;
  let crossPlanned = false;

  if (area) {
    const consider = (code: string, isCompleted: boolean) => {
      const norm = normalizeCode(code);
      if (explicit.includes(norm)) return;
      if (!coreAreasFor(code).includes(area)) return;
      if (!crossSatisfiedBy.includes(norm)) crossSatisfiedBy.push(norm);
      if (isCompleted) crossCompleted = true;
      else crossPlanned = true;
    };
    for (const code of completed) consider(code, true);
    for (const code of planned) {
      if (!completed.has(code)) consider(code, false);
    }
  }

  let status: RequirementStatus = "open";
  if (satisfiedBy.length > 0 || crossCompleted) status = "completed";
  else if (plannedBy.length > 0 || crossPlanned) status = "planned";

  // A requirement resting only on derived Core-area tagging must be verified.
  const restsOnlyOnDerivedMatch =
    satisfiedBy.length === 0 &&
    plannedBy.length === 0 &&
    crossSatisfiedBy.length > 0;

  return {
    satisfiedBy,
    plannedBy,
    crossSatisfiedBy,
    status,
    needsVerification: restsOnlyOnDerivedMatch,
  };
}
