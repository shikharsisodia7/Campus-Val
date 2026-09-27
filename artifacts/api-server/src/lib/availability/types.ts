/**
 * Normalized section-availability model (professor feedback, 2026-09 pass).
 *
 * The rest of CampusVal — the sections route, Quarter Planning, the "Open
 * Sections / All Sections" control — talks ONLY to this model. It never sees
 * a Workday payload. Connecting an SCU-approved source later means writing one
 * more `CourseAvailabilityProvider`; nothing downstream changes.
 */

export type Term = "fall" | "winter" | "spring" | "summer";

/** What a student is told about a section's seats. `unknown` is a first-class, honest state. */
export type AvailabilityStatus = "open" | "waitlist" | "full" | "unknown";

/**
 * Where a piece of availability came from. `fixture` and `static_catalog`
 * are NEVER live; `workday_live` is only ever produced by a real,
 * authorized upstream call.
 */
export type AvailabilityProviderId =
  | "workday_live"
  | "manual_workday_paste"
  | "fixture"
  | "static_catalog";

export interface AvailabilitySource {
  id: AvailabilityProviderId;
  /** Human wording shown to students, e.g. "SCU Registrar schedule (no live seat data)". */
  label: string;
  /** True ONLY for a real authorized upstream feed. Gates any "Live" badge. */
  isLive: boolean;
}

/**
 * How trustworthy the timestamp makes the status right now.
 *  - live:        from a live source, refreshed within the "live" window
 *  - cached:      from a live source (or a recent manual snapshot), older
 *                 than the live window but inside the stale limit — shown
 *                 with "Updated N min ago"
 *  - stale:       older than the stale limit; the status is NOT trusted
 *  - unavailable: no source could say anything about this section
 */
export type AvailabilityFreshness = "live" | "cached" | "stale" | "unavailable";

/** One section as reported by a provider. Optional fields stay optional: providers rarely have all of them. */
export interface SectionAvailabilityRecord {
  courseCode: string; // "CSCI 10"
  sectionNumber: string;
  term: Term;
  year: number;
  instructor?: string | null;
  meetingDays?: string[] | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  /**
   * Instructional format as the source states it ("Lecture", "Laboratory", ...).
   * Each component section is its own record with its own seats, so a course
   * can be "lecture open, lab 03 full, lab 04 open".
   */
  component?: string | null;
  capacity?: number | null;
  enrolled?: number | null;
  seatsAvailable?: number | null;
  waitlistCount?: number | null;
  status: AvailabilityStatus;
  /** ISO timestamp the UPSTREAM system says this was true. Null when the source can't say. */
  lastUpdatedAt: string | null;
  source: AvailabilitySource;
}

export type ProviderFailureReason =
  | "not_configured"
  | "upstream_error"
  | "timeout"
  | "unauthorized"
  | "invalid_payload"
  | "disabled";

export type ProviderResult =
  | { ok: true; records: SectionAvailabilityRecord[]; fetchedAt: string }
  | { ok: false; reason: ProviderFailureReason; message: string };

export interface AvailabilityQuery {
  term: Term;
  year: number;
  /**
   * Optional narrowing to one course ("CSCI 10"). A live provider still
   * fetches (and caches) the whole term — one upstream call serves every
   * course — while the database-backed provider uses it to avoid loading a
   * whole term to answer a single-course request.
   */
  courseCode?: string;
}

export interface CourseAvailabilityProvider {
  readonly id: AvailabilityProviderId;
  readonly label: string;
  /** True only for a real, authorized upstream feed. */
  readonly isLiveSource: boolean;
  getAvailability(query: AvailabilityQuery): Promise<ProviderResult>;
}

/** Availability as it is attached to one section in an API response. */
export interface ResolvedAvailability {
  availabilityStatus: AvailabilityStatus;
  lastUpdatedAt: string | null;
  sourceType: "workday_live" | "workday_self_paste" | "registrar_schedule" | "fixture";
  sourceLabel: string;
  isLive: boolean;
  freshness: AvailabilityFreshness;
}
