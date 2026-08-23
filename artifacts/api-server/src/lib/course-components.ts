import { findCourse } from "../data/courses";

/**
 * Multi-component course scheduling (lecture + lab + recitation).
 *
 * SCU's published schedule data has no explicit "component type" column, and
 * the bulletin does not publish which lab section pairs with which lecture.
 * We therefore derive component information from two INDEPENDENT real
 * sources and are explicit about which one spoke:
 *
 *   1. The bulletin course description ("Laboratory 3 hours per week",
 *      "Recitation is offered by placement...") tells us a course HAS a
 *      separately-scheduled component. This is published SCU text.
 *   2. The published meeting pattern of an individual section tells us what
 *      that section most likely IS. A single 170-minute weekly block is a
 *      lab; a 3x65-minute or 2x100-minute block is a lecture.
 *
 * Signal 2 is an inference, not a Registrar field, so every classification
 * carries `inferred: true` and the UI labels it accordingly. Crucially, the
 * scheduling behaviour does NOT depend on the classification being right:
 * components are stored per (courseCode, sectionNumber), so adding a lab can
 * never silently replace a lecture even when both classify as "unknown".
 *
 * We never invent a lecture/lab PAIRING. SCU does not publish linkage in the
 * data we have, so the UI tells the student to verify linked components in
 * Workday rather than guessing for them.
 */

export type ComponentType = "lecture" | "lab" | "recitation" | "unknown";

export interface SectionComponent {
  componentType: ComponentType;
  /** True when derived from the meeting pattern rather than a published field. */
  inferred: boolean;
}

/** A course's separately-scheduled components, per the SCU bulletin text. */
export interface RequiredComponents {
  /** Every scheduled course has instruction time. */
  lecture: true;
  lab: boolean;
  recitation: boolean;
  /** The bulletin sentence(s) the non-lecture components came from. */
  evidence: string[];
}

const LAB_RE =
  /\b(?:laboratory|lab)\b[^.]{0,80}?\b(?:\d+\s*hours?|hours?\s*per\s*week|is\s+an\s+integral|weekly)/i;
const INCLUDES_LAB_RE = /\bincludes?\s+(?:a\s+)?weekly\s+laborator/i;
const RECITATION_RE = /\brecitation\b/i;

function sentencesMentioning(description: string, re: RegExp): string[] {
  return description
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && re.test(s));
}

/**
 * Which separately-scheduled components a course has, per its bulletin
 * description. Returns lab/recitation false when the bulletin is silent —
 * we under-claim rather than invent a lab requirement.
 */
export function requiredComponentsFor(courseCode: string): RequiredComponents {
  const course = findCourse(courseCode);
  const description = course?.description ?? "";
  const hasLab = LAB_RE.test(description) || INCLUDES_LAB_RE.test(description);
  const hasRecitation = RECITATION_RE.test(description);
  const evidence: string[] = [];
  if (hasLab) evidence.push(...sentencesMentioning(description, /laborator/i));
  if (hasRecitation)
    evidence.push(...sentencesMentioning(description, RECITATION_RE));
  return {
    lecture: true,
    lab: hasLab,
    recitation: hasRecitation,
    evidence: Array.from(new Set(evidence)),
  };
}

function durationMinutes(startTime: string, endTime: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/;
  const s = m.exec(startTime);
  const e = m.exec(endTime);
  if (!s || !e) return null;
  const mins =
    (parseInt(e[1]!, 10) * 60 + parseInt(e[2]!, 10)) -
    (parseInt(s[1]!, 10) * 60 + parseInt(s[2]!, 10));
  return mins > 0 ? mins : null;
}

/**
 * Classify one published section from its meeting pattern.
 *
 * A single weekly meeting of 2.5 hours or more is SCU's standard lab/studio
 * block (verified against CHEM 11 Fall 2026, where sections split cleanly
 * into 25 one-day 170-minute labs and 12 MWF/TR lecture sections). Anything
 * meeting on multiple days, or for a short single block, is instruction time.
 *
 * Returns "unknown" when days or times are missing (common on tentative
 * Registrar rows) — we never guess from a section number alone.
 */
export function classifySection(section: {
  courseCode: string;
  meetingDays: string[];
  startTime: string;
  endTime: string;
}): SectionComponent {
  const duration = durationMinutes(section.startTime, section.endTime);
  const dayCount = section.meetingDays?.length ?? 0;
  if (duration === null || dayCount === 0) {
    return { componentType: "unknown", inferred: true };
  }

  const required = requiredComponentsFor(section.courseCode);
  const looksLikeLabBlock = dayCount === 1 && duration >= 150;

  if (looksLikeLabBlock) {
    // Only call it a lab when the bulletin agrees the course HAS one.
    // Otherwise it is simply a long single-block meeting (seminars, studios,
    // military-science leadership labs) and we say so honestly.
    if (required.lab) return { componentType: "lab", inferred: true };
    if (required.recitation)
      return { componentType: "recitation", inferred: true };
    return { componentType: "unknown", inferred: true };
  }

  return { componentType: "lecture", inferred: true };
}

/**
 * Group a course's sections by component so the UI can show "Lecture
 * sections" and "Lab sections" separately instead of one flat list.
 */
export function groupSectionsByComponent<
  T extends {
    courseCode: string;
    meetingDays: string[];
    startTime: string;
    endTime: string;
  },
>(sections: T[]): Array<{ componentType: ComponentType; sections: T[] }> {
  const order: ComponentType[] = ["lecture", "lab", "recitation", "unknown"];
  const buckets = new Map<ComponentType, T[]>();
  for (const section of sections) {
    const { componentType } = classifySection(section);
    const list = buckets.get(componentType);
    if (list) list.push(section);
    else buckets.set(componentType, [section]);
  }
  return order
    .filter((componentType) => buckets.has(componentType))
    .map((componentType) => ({
      componentType,
      sections: buckets.get(componentType)!,
    }));
}

/**
 * What the student still has to schedule for a course. Adding a lecture must
 * not make CampusVal claim the course is fully scheduled when the bulletin
 * says it also has a lab.
 */
export function missingComponentsFor(
  courseCode: string,
  scheduledComponents: ComponentType[],
): ComponentType[] {
  const required = requiredComponentsFor(courseCode);
  const have = new Set(scheduledComponents);
  const missing: ComponentType[] = [];
  // An "unknown" selection could be satisfying any component, so we do not
  // claim anything is missing rather than nag the student incorrectly.
  if (have.has("unknown")) return [];
  if (!have.has("lecture")) missing.push("lecture");
  if (required.lab && !have.has("lab")) missing.push("lab");
  if (required.recitation && !have.has("recitation")) missing.push("recitation");
  return missing;
}
