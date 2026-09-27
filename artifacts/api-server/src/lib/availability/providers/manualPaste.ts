import { and, eq } from "drizzle-orm";
import { db, courseSectionsTable } from "@workspace/db";

import { statusFromSeats } from "../freshness";
import type {
  AvailabilityQuery,
  CourseAvailabilityProvider,
  ProviderResult,
  SectionAvailabilityRecord,
  Term,
} from "../types";

export const MANUAL_PASTE_SOURCE: SectionAvailabilityRecord["source"] = {
  id: "manual_workday_paste",
  label: "Workday paste-in by the CampusVal data steward (manual snapshot, not a live feed)",
  isLive: false,
};

/**
 * Seat counts pasted in from a Workday "Find Course Sections" table by the
 * authorized data steward (see routes/sections.ts — the sync endpoint is
 * restricted to WORKDAY_SYNC_ADMIN_EMAIL). It is a point-in-time snapshot:
 * accurate as of `syncedAt`, and only that. Never labelled live.
 */
export class ManualPasteAvailabilityProvider implements CourseAvailabilityProvider {
  readonly id = "manual_workday_paste" as const;
  readonly label = MANUAL_PASTE_SOURCE.label;
  readonly isLiveSource = false;

  async getAvailability(query: AvailabilityQuery): Promise<ProviderResult> {
    const conds = [
      eq(courseSectionsTable.term, query.term),
      eq(courseSectionsTable.year, query.year),
    ];
    if (query.courseCode) {
      conds.push(eq(courseSectionsTable.courseCode, query.courseCode.toUpperCase().replace(/\s+/g, " ")));
    }
    const rows = await db.select().from(courseSectionsTable).where(and(...conds));

    const records: SectionAvailabilityRecord[] = rows.map((r) => {
      // The paste stores 0/0/0 for "no seat data in that row" — that is
      // unknown, not "full".
      const known = r.seatsTotal > 0 || r.waitlist > 0;
      return {
        courseCode: r.courseCode.toUpperCase(),
        sectionNumber: r.sectionNumber,
        term: r.term as Term,
        year: r.year,
        instructor: r.instructor || null,
        meetingDays: r.meetingDays,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        location: r.location || null,
        component: r.component ?? null,
        capacity: known ? r.seatsTotal : null,
        enrolled: known ? Math.max(r.seatsTotal - r.seatsOpen, 0) : null,
        seatsAvailable: known ? r.seatsOpen : null,
        waitlistCount: known ? r.waitlist : null,
        status: known
          ? statusFromSeats({ seatsAvailable: r.seatsOpen, waitlistCount: r.waitlist })
          : "unknown",
        lastUpdatedAt: r.syncedAt.toISOString(),
        source: MANUAL_PASTE_SOURCE,
      };
    });
    return { ok: true, records, fetchedAt: new Date().toISOString() };
  }
}
