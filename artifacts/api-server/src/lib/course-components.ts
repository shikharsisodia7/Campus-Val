import { findCourse } from "../data/courses";
import rawMarkers from "../data/registrar-component-markers.json";

/**
 * Multi-component course scheduling (lecture + lab + discussion + recitation).
 *
 * This is the ONE place that decides what component a section is and which
 * components a course needs. There is no per-department or per-course rule in
 * here or anywhere else: Chemistry, Biology, Physics and every other subject
 * go through the same three steps.
 *
 * 1. WHAT THE SOURCE SAYS WINS. When a section arrives with an instructional
 *    format ("Lecture", "Laboratory", "Discussion" — Workday's Find Course
 *    Sections has that column), it is used as-is and marked `published`.
 *
 * 2. DOES THE COURSE HAVE A LAB? From published SCU text, never from a list of
 *    course codes:
 *      - the Registrar's own schedule title ends in "L&L" (lecture & lab);
 *      - or the bulletin description says so ("Laboratory 3 hours per week",
 *        "Includes weekly lab").
 *    The bulletin was extracted from a PDF and carries stray spaces inside
 *    words ("Inclu des weekly lab"), so its text is compared with whitespace
 *    removed.
 *
 * 3. WHICH SECTION IS THE LAB? SCU's Registrar schedules have no component
 *    column, so this is read from how the course's OWN sections meet in that
 *    term: when a course that has a lab offers both sections meeting several
 *    days a week and sections meeting once a week, the once-a-week sections
 *    are the labs. It is relative to the course, not an absolute duration —
 *    a 90-minute weekly lab is still a lab.
 *    This step is an inference, is always labelled `inferred`, and the UI says
 *    "verify in Workday".
 *
 * What is never done: invent a section, a meeting time, or a lecture/lab
 * PAIRING. When a term's schedule lists a course's lectures but not its labs
 * (the Registrar's tentative schedules), the lab is reported as required but
 * not yet published.
 */

export type ComponentType = "lecture" | "lab" | "discussion" | "recitation" | "unknown";

export const COMPONENT_ORDER: ComponentType[] = ["lecture", "lab", "discussion", "recitation", "unknown"];

export type ComponentSource = "published" | "meeting_pattern" | "undetermined";

export interface SectionComponent {
  componentType: ComponentType;
  /** True when derived from the meeting pattern rather than a published field. */
  inferred: boolean;
  source: ComponentSource;
  /** The source's own label ("Laboratory"), when it published one. */
  sourceLabel: string | null;
}

/** A course's separately-scheduled components, per published SCU text. */
export interface RequiredComponents {
  /** Every scheduled course has instruction time. */
  lecture: true;
  lab: boolean;
  recitation: boolean;
  /** The published text each non-lecture component came from. */
  evidence: string[];
}

export interface SectionLike {
  courseCode: string;
  sectionNumber?: string;
  meetingDays: string[];
  startTime: string;
  endTime: string;
  /** Instructional format as the source published it, if it did. */
  component?: string | null;
}

// ─── 1. published component labels ───────────────────────────────────────────

/**
 * Normalizes an instructional-format label. Returns null for text that is not
 * a component label at all (so a stray word is never taken for one).
 */
export function normalizeComponentLabel(label: string | null | undefined): ComponentType | null {
  const t = (label ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(lec|lecture|lecture\s*\/\s*discussion|seminar|studio|lecture\s*&\s*seminar)$/.test(t)) return "lecture";
  if (/^(lab|laboratory|lab(oratory)?\s+section)$/.test(t)) return "lab";
  if (/^(dis|disc|discussion|discussion\s+section)$/.test(t)) return "discussion";
  if (/^(rec|recitation)$/.test(t)) return "recitation";
  return null;
}

// ─── 2. does the course have a lab? ──────────────────────────────────────────

const REGISTRAR_LAB_TITLES = new Map<string, string>(
  (rawMarkers as { courseCode: string; title: string }[]).map((m) => [normalizeCode(m.courseCode), m.title]),
);

const TITLE_LAB_MARKER_RE = /\bL\s?&\s?L\s*$/i;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, " ").trim();
}

/** Lowercase letters and digits only, so "Inclu des weekly lab" reads "includesweeklylab". */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

const SQUASHED_LAB_PATTERNS = [
  /laboratory\d+hours/, // "Laboratory 3 hours per week"
  /lab\d+hours/,
  /includesa?weekly(?:online)?lab/, // "Includes (a) weekly lab(oratory)"
  /laboratoryisanintegral/,
  /weeklylab(?:oratory)?(?:session|section)s?/,
];

function sentences(description: string): string[] {
  return description
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function labSentences(description: string): string[] {
  return sentences(description).filter((s) => {
    const q = squash(s);
    return SQUASHED_LAB_PATTERNS.some((re) => re.test(q));
  });
}

/**
 * Which separately-scheduled components a course has, per published SCU text.
 * Returns lab/recitation false when the sources are silent — CampusVal
 * under-claims rather than invent a lab requirement.
 */
export function requiredComponentsFor(courseCode: string): RequiredComponents {
  const course = findCourse(courseCode);
  const code = normalizeCode(course?.code ?? courseCode);
  const description = course?.description ?? "";
  const evidence: string[] = [];

  const registrarTitle = REGISTRAR_LAB_TITLES.get(code);
  if (registrarTitle) {
    evidence.push(`The Registrar's schedule titles this course “${registrarTitle}” (L&L = lecture and lab).`);
  } else if (course && TITLE_LAB_MARKER_RE.test(course.title)) {
    evidence.push(`The catalog titles this course “${course.title}” (L&L = lecture and lab).`);
  }

  const fromBulletin = labSentences(description);
  evidence.push(...fromBulletin);
  const hasLab = evidence.length > 0;

  const hasRecitation = /recitation/.test(squash(description));
  if (hasRecitation) evidence.push(...sentences(description).filter((s) => /recitation/.test(squash(s))));

  return {
    lecture: true,
    lab: hasLab,
    recitation: hasRecitation,
    evidence: Array.from(new Set(evidence)),
  };
}

// ─── 3. which section is which? ──────────────────────────────────────────────

export function durationMinutes(startTime: string, endTime: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/;
  const s = m.exec(startTime);
  const e = m.exec(endTime);
  if (!s || !e) return null;
  const mins =
    parseInt(e[1]!, 10) * 60 + parseInt(e[2]!, 10) - (parseInt(s[1]!, 10) * 60 + parseInt(s[2]!, 10));
  return mins > 0 ? mins : null;
}

const UNDETERMINED: SectionComponent = {
  componentType: "unknown",
  inferred: true,
  source: "undetermined",
  sourceLabel: null,
};

const inferred = (componentType: ComponentType): SectionComponent => ({
  componentType,
  inferred: true,
  source: "meeting_pattern",
  sourceLabel: null,
});

function hasMeeting(s: SectionLike): boolean {
  return (s.meetingDays?.length ?? 0) > 0 && durationMinutes(s.startTime, s.endTime) !== null;
}

/**
 * Classify one section, given the other sections the SAME course offers in the
 * SAME term (`siblings` — it may or may not include the section itself).
 */
export function classifySection(section: SectionLike, siblings: SectionLike[] = []): SectionComponent {
  const published = normalizeComponentLabel(section.component);
  if (published) {
    return { componentType: published, inferred: false, source: "published", sourceLabel: section.component!.trim() };
  }
  if (!hasMeeting(section)) return UNDETERMINED;

  const required = requiredComponentsFor(section.courseCode);
  const dayCount = section.meetingDays.length;
  const duration = durationMinutes(section.startTime, section.endTime)!;
  if (dayCount >= 2) return inferred("lecture");

  // A once-a-week section. What it is depends on what else the course offers.
  const others = [section, ...siblings].filter(hasMeeting);
  const courseAlsoMeetsSeveralDays = others.some((s) => s.meetingDays.length >= 2);
  const weekly = others.filter((s) => s.meetingDays.length === 1);

  if (courseAlsoMeetsSeveralDays) {
    if (required.lab && required.recitation) {
      // Both exist: when the weekly sections fall into two clearly different
      // lengths, the long ones are labs and the short ones recitations.
      const durations = weekly.map((s) => durationMinutes(s.startTime, s.endTime)!);
      const longest = Math.max(...durations);
      const shortest = Math.min(...durations);
      if (longest - shortest >= 45 && duration <= shortest + 15) return inferred("recitation");
      return inferred("lab");
    }
    if (required.lab) return inferred("lab");
    if (required.recitation) return inferred("recitation");
    // The course mixes meeting patterns but no published text says why
    // (a support session, a leadership lab, a studio). Say so honestly.
    return UNDETERMINED;
  }

  // Every section of the course meets once a week.
  if (duration >= 150 && required.lab && weekly.length > 0) {
    // A long weekly block in a lab course with no separate lecture rows: this
    // is how a term that lists ONLY the labs (or a combined block) looks.
    return inferred("lab");
  }
  return inferred("lecture");
}

/**
 * Classify every section of one course in one term. Keyed by section number.
 */
export function classifyCourseSections<T extends SectionLike & { sectionNumber: string }>(
  sections: T[],
): Map<string, SectionComponent> {
  const out = new Map<string, SectionComponent>();
  for (const s of sections) out.set(s.sectionNumber, classifySection(s, sections));
  return out;
}

/**
 * Group a course's sections by component so the UI can show "Lecture
 * sections" and "Lab sections" separately instead of one flat list.
 */
export function groupSectionsByComponent<T extends SectionLike>(
  sections: T[],
): Array<{ componentType: ComponentType; sections: T[] }> {
  const buckets = new Map<ComponentType, T[]>();
  for (const section of sections) {
    const { componentType } = classifySection(section, sections);
    const list = buckets.get(componentType);
    if (list) list.push(section);
    else buckets.set(componentType, [section]);
  }
  return COMPONENT_ORDER.filter((c) => buckets.has(c)).map((componentType) => ({
    componentType,
    sections: buckets.get(componentType)!,
  }));
}

// ─── what a course needs in a given term ─────────────────────────────────────

export interface CourseComponentRequirement {
  componentType: ComponentType;
  /** True when published text or the term's own sections show the course needs it. */
  required: boolean;
  /** Sections of this component the term's data actually lists. */
  sectionCount: number;
  /**
   * False when the course needs this component but the term's schedule does
   * not list any section for it yet. Nothing is invented to fill the gap.
   */
  sectionsPublished: boolean;
  evidence: string[];
}

export interface CourseComponentPlan {
  courseCode: string;
  components: CourseComponentRequirement[];
  /** More than one component must be scheduled. */
  multiComponent: boolean;
}

/**
 * The components a course needs in a term, combining what is published about
 * the course with what the term's sections actually contain.
 */
export function courseComponentPlan(courseCode: string, sections: SectionLike[]): CourseComponentPlan {
  const required = requiredComponentsFor(courseCode);
  const counts = new Map<ComponentType, number>();
  for (const s of sections) {
    const { componentType } = classifySection(s, sections);
    counts.set(componentType, (counts.get(componentType) ?? 0) + 1);
  }

  const needed = new Set<ComponentType>(["lecture"]);
  if (required.lab) needed.add("lab");
  // A recitation "offered by placement" is not required of every student; it is
  // listed only when the term actually has recitation sections.
  for (const type of counts.keys()) if (type !== "unknown") needed.add(type);

  const labEvidence = required.evidence.filter((e) => !/recitation/i.test(e));
  const components: CourseComponentRequirement[] = COMPONENT_ORDER.filter((t) => needed.has(t)).map((type) => {
    const sectionCount = counts.get(type) ?? 0;
    return {
      componentType: type,
      required: true,
      sectionCount,
      sectionsPublished: sectionCount > 0,
      evidence:
        type === "lab"
          ? labEvidence
          : type === "recitation"
            ? required.evidence.filter((e) => /recitation/i.test(e))
            : [],
    };
  });

  // A term whose sections could not be told apart at all (no times published)
  // still offers the course; the lecture is then "published" as those sections.
  const lecture = components.find((c) => c.componentType === "lecture")!;
  if (lecture.sectionCount === 0 && (counts.get("unknown") ?? 0) > 0) {
    lecture.sectionCount = counts.get("unknown")!;
    lecture.sectionsPublished = true;
  }

  return { courseCode: normalizeCode(courseCode), components, multiComponent: components.length > 1 };
}

export interface CourseScheduleStatus {
  courseCode: string;
  scheduled: ComponentType[];
  /** Required, sections exist, none chosen yet. */
  missing: ComponentType[];
  /** Required, but the term's schedule lists no section for it yet. */
  notYetPublished: ComponentType[];
  /** Every component that CAN be scheduled has been. */
  complete: boolean;
}

/**
 * What the student still has to schedule for a course. Adding a lecture must
 * not make CampusVal claim the course is fully scheduled when it also has a lab.
 */
export function courseScheduleStatus(
  courseCode: string,
  termSections: SectionLike[],
  scheduledComponents: ComponentType[],
): CourseScheduleStatus {
  const plan = courseComponentPlan(courseCode, termSections);
  const have = new Set(scheduledComponents);
  // A selection CampusVal could not classify might be any component, so it is
  // not used to claim something is missing.
  const ambiguous = have.has("unknown");
  const missing: ComponentType[] = [];
  const notYetPublished: ComponentType[] = [];
  for (const c of plan.components) {
    if (have.has(c.componentType)) continue;
    if (!c.sectionsPublished) notYetPublished.push(c.componentType);
    else if (!ambiguous) missing.push(c.componentType);
  }
  return {
    courseCode: plan.courseCode,
    scheduled: COMPONENT_ORDER.filter((c) => have.has(c)),
    missing,
    notYetPublished,
    complete: missing.length === 0 && have.size > 0,
  };
}

/** Kept for callers that only know what is scheduled, not the term's sections. */
export function missingComponentsFor(courseCode: string, scheduledComponents: ComponentType[]): ComponentType[] {
  const required = requiredComponentsFor(courseCode);
  const have = new Set(scheduledComponents);
  if (have.has("unknown")) return [];
  const missing: ComponentType[] = [];
  if (!have.has("lecture")) missing.push("lecture");
  if (required.lab && !have.has("lab")) missing.push("lab");
  return missing;
}
