/**
 * Every section CampusVal knows for ONE course in ONE term.
 *
 * A section's identity always includes its term and year: the Fall sections of
 * a course are never reused for Winter, because the component structure,
 * section numbers, instructors and times all differ by term.
 *
 * Sources, in order:
 *   1. the Registrar's schedule for that term (what is offered, and when);
 *   2. sections only an availability source knows (a section added after the
 *      schedule was published, or lab sections Workday lists for a term whose
 *      Registrar schedule is still tentative and lecture-only).
 *
 * Nothing is invented: a term with no lab rows in any source has no lab rows.
 */
import { offeredSectionsFor } from "../data/offered-sections";
import { getAvailabilityService, sectionKey, type Term, type TermAvailability } from "./availability";
import {
  classifySection,
  courseComponentPlan,
  type CourseComponentPlan,
  type SectionComponent,
} from "./course-components";

export interface TermSection {
  courseCode: string;
  sectionNumber: string;
  term: Term;
  year: number;
  instructor: string;
  meetingDays: string[];
  startTime: string;
  endTime: string;
  location: string;
  /** Instructional format as a source published it, or null. */
  component: string | null;
  origin: "registrar_schedule" | "availability_source";
}

export interface ClassifiedTermSection extends TermSection {
  classification: SectionComponent;
}

export interface CourseTermSections {
  sections: ClassifiedTermSection[];
  plan: CourseComponentPlan;
  availability: TermAvailability;
}

const normalizeCode = (code: string) => code.toUpperCase().replace(/\s+/g, " ").trim();

export async function courseTermSections(courseCode: string, term: Term, year: number): Promise<CourseTermSections> {
  const code = normalizeCode(courseCode);
  const availability = await getAvailabilityService().getTermAvailability(term, year, code);

  const seen = new Set<string>();
  const sections: TermSection[] = offeredSectionsFor(code, term, year).map((s) => {
    const key = sectionKey(s.courseCode, s.sectionNumber);
    seen.add(key);
    const rec = availability.bySection.get(key)?.record;
    return {
      courseCode: code,
      sectionNumber: s.sectionNumber,
      term,
      year,
      instructor: rec?.instructor || s.instructor,
      meetingDays: (rec?.meetingDays?.length ? rec.meetingDays : s.meetingDays) as string[],
      startTime: s.startTime || rec?.startTime || "",
      endTime: s.endTime || rec?.endTime || "",
      location: rec?.location || s.location,
      component: rec?.component ?? null,
      origin: "registrar_schedule",
    };
  });

  for (const [key, resolved] of availability.bySection) {
    if (seen.has(key)) continue;
    const rec = resolved.record;
    if (rec.source.id === "fixture") continue; // sample data only ever decorates real sections
    if (normalizeCode(rec.courseCode) !== code) continue;
    sections.push({
      courseCode: code,
      sectionNumber: rec.sectionNumber,
      term,
      year,
      instructor: rec.instructor ?? "",
      meetingDays: (rec.meetingDays ?? []) as string[],
      startTime: rec.startTime ?? "",
      endTime: rec.endTime ?? "",
      location: rec.location ?? "",
      component: rec.component ?? null,
      origin: "availability_source",
    });
  }

  return {
    sections: sections.map((s) => ({ ...s, classification: classifySection(s, sections) })),
    plan: courseComponentPlan(code, sections),
    availability,
  };
}
