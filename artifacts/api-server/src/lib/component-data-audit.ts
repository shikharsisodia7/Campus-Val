/**
 * DATA-QUALITY audit for course components.
 *
 * Looks across every course and term for patterns that suggest the component
 * data is wrong or incomplete. These are warnings for the people who maintain
 * the data — they are never shown to students as fact and never change how a
 * section is classified.
 *
 *   mixed_pattern_no_evidence   sections of a course split into several-day and
 *                               once-a-week groups, but no published text says
 *                               the course has a lab/recitation. The once-a-week
 *                               sections are shown as "Other", not as lectures.
 *   lab_required_none_listed    published text says the course has a lab, but
 *                               the term lists no lab section (typical of the
 *                               Registrar's tentative schedules).
 *   all_sections_one_component  published text says lecture + lab, the term has
 *                               several sections, and every one classified the
 *                               same — the exact shape of the bug this guards.
 *   conflicting_published_label the same section carries two different
 *                               published component labels.
 *   truncated_description       the catalog description was cut off ("…"), so a
 *                               lab sentence may be missing from the evidence.
 */
import { COURSES } from "../data/courses";
import { OFFERED_SECTIONS, type OfferedSection } from "../data/offered-sections";
import {
  classifyCourseSections,
  normalizeComponentLabel,
  requiredComponentsFor,
  type ComponentType,
  type SectionLike,
} from "./course-components";

export type ComponentAuditCode =
  | "mixed_pattern_no_evidence"
  | "lab_required_none_listed"
  | "all_sections_one_component"
  | "conflicting_published_label"
  | "truncated_description";

export interface ComponentAuditFinding {
  code: ComponentAuditCode;
  courseCode: string;
  term: string;
  year: number;
  detail: string;
}

type AuditSection = SectionLike & { sectionNumber: string; term: string; year: number };

export function auditCourseComponents(
  sections: AuditSection[] = OFFERED_SECTIONS as OfferedSection[],
): ComponentAuditFinding[] {
  const findings: ComponentAuditFinding[] = [];
  const groups = new Map<string, AuditSection[]>();
  for (const s of sections) {
    const key = `${s.courseCode}|${s.term}|${s.year}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }

  const descriptions = new Map(COURSES.map((c) => [c.code.toUpperCase(), c.description ?? ""]));

  for (const [key, group] of groups) {
    const [courseCode, term, yearText] = key.split("|") as [string, string, string];
    const year = Number(yearText);
    const at = { courseCode, term, year };
    const required = requiredComponentsFor(courseCode);
    const classified = classifyCourseSections(group);
    const tally = new Map<ComponentType, number>();
    for (const c of classified.values()) tally.set(c.componentType, (tally.get(c.componentType) ?? 0) + 1);

    const timed = group.filter((s) => s.meetingDays.length > 0 && s.startTime && s.endTime);
    const severalDays = timed.filter((s) => s.meetingDays.length >= 2).length;
    const onceAWeek = timed.filter((s) => s.meetingDays.length === 1).length;

    if (severalDays > 0 && onceAWeek > 0 && !required.lab && !required.recitation) {
      findings.push({
        ...at,
        code: "mixed_pattern_no_evidence",
        detail: `${severalDays} section(s) meet several days a week and ${onceAWeek} meet once; no published text names a lab or recitation.`,
      });
    }
    if (required.lab && (tally.get("lab") ?? 0) === 0) {
      findings.push({
        ...at,
        code: "lab_required_none_listed",
        detail: `Published text says this course has a lab; the ${term} ${year} schedule lists ${group.length} section(s) and none is a lab.`,
      });
    }
    if (required.lab && severalDays > 0 && onceAWeek > 0 && tally.size === 1) {
      findings.push({
        ...at,
        code: "all_sections_one_component",
        detail: `All ${group.length} sections classified as ${[...tally.keys()][0]} although the course has a lab and its sections meet in two different patterns.`,
      });
    }

    const labels = new Map<string, Set<ComponentType>>();
    for (const s of group) {
      const n = normalizeComponentLabel(s.component);
      if (!n) continue;
      const set = labels.get(s.sectionNumber) ?? new Set<ComponentType>();
      set.add(n);
      labels.set(s.sectionNumber, set);
    }
    for (const [sectionNumber, set] of labels) {
      if (set.size > 1) {
        findings.push({
          ...at,
          code: "conflicting_published_label",
          detail: `Section ${sectionNumber} is published as ${[...set].join(" and ")}.`,
        });
      }
    }

    const description = descriptions.get(courseCode.toUpperCase()) ?? "";
    if (/…\s*$/.test(description) && severalDays > 0 && onceAWeek > 0 && !required.lab) {
      findings.push({
        ...at,
        code: "truncated_description",
        detail: "The catalog description is cut off, so a sentence naming a lab may be missing.",
      });
    }
  }

  return findings.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.courseCode.localeCompare(b.courseCode, "en", { numeric: true }) ||
      a.term.localeCompare(b.term),
  );
}

export function summarizeAudit(findings: ComponentAuditFinding[]): Record<ComponentAuditCode, number> {
  const out: Record<ComponentAuditCode, number> = {
    mixed_pattern_no_evidence: 0,
    lab_required_none_listed: 0,
    all_sections_one_component: 0,
    conflicting_published_label: 0,
    truncated_description: 0,
  };
  for (const f of findings) out[f.code] += 1;
  return out;
}
