import type { AvailabilityFreshness, AvailabilityStatus } from "./types";

export interface FreshnessPolicy {
  /** A live source's data younger than this is "live". */
  liveWithinMs: number;
  /** Data older than this is "stale" and its status is not trusted. */
  staleAfterMs: number;
}

export const DEFAULT_LIVE_POLICY: FreshnessPolicy = {
  liveWithinMs: 2 * 60 * 1000,
  staleAfterMs: 15 * 60 * 1000,
};

/** A hand-pasted snapshot is never "live"; after a day it should no longer drive a student's decision. */
export const MANUAL_PASTE_POLICY: FreshnessPolicy = {
  liveWithinMs: 0,
  staleAfterMs: 24 * 60 * 60 * 1000,
};

/**
 * Freshness of a timestamped observation. A missing/invalid timestamp is
 * `unavailable` — a source that cannot say WHEN it was true has said nothing
 * we may present as current.
 */
export function classifyFreshness(
  lastUpdatedAt: string | null | undefined,
  now: Date,
  policy: FreshnessPolicy,
): AvailabilityFreshness {
  if (!lastUpdatedAt) return "unavailable";
  const t = Date.parse(lastUpdatedAt);
  if (Number.isNaN(t)) return "unavailable";
  const age = now.getTime() - t;
  if (age <= policy.liveWithinMs) return "live"; // includes small clock skew ahead of us
  if (age <= policy.staleAfterMs) return "cached";
  return "stale";
}

/**
 * The status a student may be shown. A stale observation is downgraded to
 * `unknown`: we do not present a 3-day-old "open" as open.
 */
export function trustedStatus(
  status: AvailabilityStatus,
  freshness: AvailabilityFreshness,
): AvailabilityStatus {
  return freshness === "stale" || freshness === "unavailable" ? "unknown" : status;
}

/** Derive open / waitlist / full from raw seat numbers, or `unknown` when they aren't known. */
export function statusFromSeats(input: {
  capacity?: number | null;
  seatsAvailable?: number | null;
  enrolled?: number | null;
  waitlistCount?: number | null;
}): AvailabilityStatus {
  const { capacity, enrolled, waitlistCount } = input;
  let seats = input.seatsAvailable;
  if ((seats === null || seats === undefined) && capacity != null && enrolled != null) {
    seats = Math.max(capacity - enrolled, 0);
  }
  if (seats === null || seats === undefined) return "unknown";
  if (seats > 0) return "open";
  return (waitlistCount ?? 0) > 0 ? "waitlist" : "full";
}
