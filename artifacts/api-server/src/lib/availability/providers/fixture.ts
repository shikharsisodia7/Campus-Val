import { createHash } from "crypto";

import { OFFERED_SECTIONS } from "../../../data/offered-sections";
import type {
  AvailabilityQuery,
  AvailabilityStatus,
  CourseAvailabilityProvider,
  ProviderResult,
  SectionAvailabilityRecord,
} from "../types";

export const FIXTURE_SOURCE: SectionAvailabilityRecord["source"] = {
  id: "fixture",
  label: "SAMPLE DATA for development — not real seat counts",
  isLive: false,
};

/**
 * DEVELOPMENT/TEST ONLY. Produces deterministic, obviously-fake seat data for
 * the real Registrar sections so the open/full UI can be exercised end to end
 * without an upstream feed.
 *
 * Hard guarantees:
 *   - it refuses to construct when NODE_ENV=production (no invented seat
 *     counts can ever reach a real student);
 *   - every record carries the `fixture` source, `isLive: false` and the
 *     label "SAMPLE DATA…", so the UI cannot mistake it for the real thing.
 */
export class FixtureAvailabilityProvider implements CourseAvailabilityProvider {
  readonly id = "fixture" as const;
  readonly label = FIXTURE_SOURCE.label;
  readonly isLiveSource = false;

  constructor(private readonly now: () => Date = () => new Date()) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("FixtureAvailabilityProvider must never be constructed in production.");
    }
  }

  async getAvailability(query: AvailabilityQuery): Promise<ProviderResult> {
    const stamp = this.now().toISOString();
    const only = query.courseCode?.toUpperCase().replace(/\s+/g, " ");
    const records: SectionAvailabilityRecord[] = OFFERED_SECTIONS.filter(
      (s) =>
        s.term === query.term &&
        s.year === query.year &&
        (!only || s.courseCode.toUpperCase().replace(/\s+/g, " ") === only),
    ).map((s) => {
      const h = createHash("sha256")
        .update(`${s.courseCode}|${s.sectionNumber}|${s.term}|${s.year}`)
        .digest();
      const bucket = h[0]! % 20;
      const capacity = 20 + (h[1]! % 21); // 20–40
      let status: AvailabilityStatus;
      let enrolled: number;
      let waitlistCount: number;
      if (bucket < 11) {
        status = "open";
        enrolled = Math.max(capacity - 1 - (h[2]! % 12), 0);
        waitlistCount = 0;
      } else if (bucket < 15) {
        status = "waitlist";
        enrolled = capacity;
        waitlistCount = 1 + (h[2]! % 8);
      } else if (bucket < 19) {
        status = "full";
        enrolled = capacity;
        waitlistCount = 0;
      } else {
        status = "unknown";
        enrolled = 0;
        waitlistCount = 0;
      }
      const known = status !== "unknown";
      return {
        courseCode: s.courseCode.toUpperCase(),
        sectionNumber: s.sectionNumber,
        term: s.term,
        year: s.year,
        instructor: s.instructor || null,
        capacity: known ? capacity : null,
        enrolled: known ? enrolled : null,
        seatsAvailable: known ? Math.max(capacity - enrolled, 0) : null,
        waitlistCount: known ? waitlistCount : null,
        status,
        lastUpdatedAt: stamp,
        source: FIXTURE_SOURCE,
      };
    });
    return { ok: true, records, fetchedAt: stamp };
  }
}
