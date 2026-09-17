/**
 * Section-availability provider/interface layer (professor feedback,
 * 2026-09 pass): status logic lives here, once, instead of being wired
 * directly into UI components or duplicated across routes.
 *
 * CampusVal has exactly one source of live-ish seat data today: a student
 * voluntarily pastes their own Workday "Find Course Sections" table, which
 * is stored per-section with a `syncedAt` timestamp (see
 * `lib/db/src/schema/sections.ts`). The official Registrar schedule
 * (`data/offered-sections.ts`) lists what is offered and when, but never
 * carries seat counts. This module derives an honest `AvailabilityStatus`
 * from whichever of those two sources actually has data for a section —
 * it never fabricates a status, and a tentative-term section (Winter/Spring
 * before the Registrar publishes real sections) is always "unknown".
 *
 * See docs/SECTION_AVAILABILITY.md for the full LIVE/REFRESHED/TENTATIVE/
 * UNKNOWN semantics this backs, and for what an authorized SCU data source
 * would need to provide to replace the self-paste overlay with something
 * that refreshes automatically.
 */

export type AvailabilityStatus = "open" | "waitlist" | "full" | "unknown";
export type AvailabilitySourceType = "workday_self_paste" | "registrar_schedule";

export interface SectionAvailability {
  availabilityStatus: AvailabilityStatus;
  lastUpdatedAt: string | null;
  sourceType: AvailabilitySourceType;
  sourceLabel: string;
}

/**
 * `seatsKnown` must already reflect whether a live paste-in overlaid this
 * section (see routes/courses.ts) — this function does not re-derive it, to
 * keep exactly one place that decides "do we actually know the seat count."
 */
export function deriveAvailability(input: {
  seatsKnown: boolean;
  seatsOpen: number;
  waitlist: number;
  syncedAt: Date | string | null | undefined;
}): SectionAvailability {
  if (!input.seatsKnown) {
    return {
      availabilityStatus: "unknown",
      lastUpdatedAt: null,
      sourceType: "registrar_schedule",
      sourceLabel: "SCU Registrar schedule (no live seat data)",
    };
  }

  const availabilityStatus: AvailabilityStatus =
    input.seatsOpen > 0 ? "open" : input.waitlist > 0 ? "waitlist" : "full";

  const syncedAtIso =
    input.syncedAt instanceof Date
      ? input.syncedAt.toISOString()
      : (input.syncedAt ?? null);

  return {
    availabilityStatus,
    lastUpdatedAt: syncedAtIso,
    sourceType: "workday_self_paste",
    sourceLabel: "Your own Workday paste-in",
  };
}
