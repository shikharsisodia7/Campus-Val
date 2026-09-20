import { OFFERED_SECTIONS } from "../../../data/offered-sections";
import type {
  AvailabilityQuery,
  CourseAvailabilityProvider,
  ProviderResult,
  SectionAvailabilityRecord,
} from "../types";

export const STATIC_CATALOG_SOURCE: SectionAvailabilityRecord["source"] = {
  id: "static_catalog",
  label: "SCU Registrar schedule (no live seat data)",
  isLive: false,
};

/**
 * The official Registrar schedule: it says WHAT is offered and WHEN, and
 * nothing at all about seats. Every record it produces is `unknown` with no
 * timestamp — this provider exists so "we only have the static schedule" is
 * an explicit, testable state rather than an absence.
 */
export class StaticCatalogAvailabilityProvider implements CourseAvailabilityProvider {
  readonly id = "static_catalog" as const;
  readonly label = STATIC_CATALOG_SOURCE.label;
  readonly isLiveSource = false;

  async getAvailability(query: AvailabilityQuery): Promise<ProviderResult> {
    const records: SectionAvailabilityRecord[] = OFFERED_SECTIONS.filter(
      (s) => s.term === query.term && s.year === query.year,
    ).map((s) => ({
      courseCode: s.courseCode.toUpperCase(),
      sectionNumber: s.sectionNumber,
      term: s.term,
      year: s.year,
      instructor: s.instructor || null,
      meetingDays: s.meetingDays,
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      location: s.location || null,
      capacity: null,
      enrolled: null,
      seatsAvailable: null,
      waitlistCount: null,
      status: "unknown",
      lastUpdatedAt: null,
      source: STATIC_CATALOG_SOURCE,
    }));
    return { ok: true, records, fetchedAt: new Date().toISOString() };
  }
}
