/**
 * Pure presentation rules for section availability — what the Quarter Plan
 * section list may SAY about seats, and when. Kept out of the component so the
 * honesty rules ("Live" only for a live feed; stale never looks current;
 * unknown is never hidden as if it were closed) are unit-tested directly.
 *
 * The server decides status and freshness (api-server lib/availability); this
 * file only phrases it. It never derives open/closed on the client.
 */

export type AvailabilityStatus = "open" | "waitlist" | "full" | "unknown";
export type AvailabilityView = "all" | "open";

export type SectionAvailabilityLike = {
  availabilityStatus: AvailabilityStatus;
  lastUpdatedAt?: string | null;
  sourceType: string;
  sourceLabel: string;
  isLive?: boolean;
  freshness?: "live" | "cached" | "stale" | "unavailable";
};

/**
 * "Open Sections" hides only what CampusVal KNOWS is not open (full or
 * waitlisted). A section whose availability is unknown is kept — hiding it
 * could hide a section that is actually open — and is labelled UNKNOWN.
 */
export function passesAvailabilityView(status: AvailabilityStatus, view: AvailabilityView): boolean {
  if (view === "all") return true;
  return status === "open" || status === "unknown";
}

export function countByStatus(sections: { availabilityStatus: AvailabilityStatus }[]) {
  const counts = { open: 0, waitlist: 0, full: 0, unknown: 0 };
  for (const s of sections) counts[s.availabilityStatus] += 1;
  return counts;
}

/** "just now", "5 minutes ago", "3 hours ago", else a date. Future/invalid timestamps read as a date, never "in the future". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.round((now.getTime() - t) / 1000);
  if (s < 0) return new Date(t).toLocaleString();
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
}

export type BannerState =
  | "live"
  | "cached"
  | "stale"
  | "unavailable"
  | "not_connected"
  | "sample"
  | "manual_snapshot";

export interface Banner {
  tone: "good" | "neutral" | "warn";
  text: string;
}

/** What the header may truthfully say about the seat data for a quarter. */
export function bannerFor(
  state: BannerState,
  lastUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): Banner {
  const when = relativeTime(lastUpdatedAt, now);
  switch (state) {
    case "live":
      return { tone: "good", text: when ? `Live availability · updated ${when}` : "Live availability" };
    case "cached":
      return {
        tone: "neutral",
        text: `Availability updated ${when || "recently"} — not live right now.`,
      };
    case "stale":
      return {
        tone: "warn",
        text: `Availability is out of date${when ? ` (last updated ${when})` : ""}, so seat status is shown as unknown.`,
      };
    case "unavailable":
      return {
        tone: "warn",
        text: "Availability currently unavailable. Sections are listed without seat data — check Workday before you register.",
      };
    case "sample":
      return { tone: "warn", text: "SAMPLE DATA for development — these are not real seat counts." };
    case "manual_snapshot":
      return {
        tone: "neutral",
        text: `Seat data is a manual snapshot${when ? ` from ${when}` : ""} — not live. Check Workday before you register.`,
      };
    case "not_connected":
    default:
      return {
        tone: "neutral",
        text: "Live seat availability isn't connected yet. Sections come from the SCU Registrar schedule and their availability is unknown — check Workday.",
      };
  }
}

/** A short chip that qualifies a section's badge, or null. "LIVE" only when the server says it is. */
export function sourceChip(s: SectionAvailabilityLike): { label: string; tone: "good" | "neutral" | "warn" } | null {
  if (s.isLive) return { label: "LIVE", tone: "good" };
  if (s.sourceType === "fixture") return { label: "SAMPLE DATA", tone: "warn" };
  if (s.freshness === "stale") return { label: "OUT OF DATE", tone: "warn" };
  if (s.sourceType === "workday_self_paste" && s.availabilityStatus !== "unknown") {
    return { label: "SNAPSHOT", tone: "neutral" };
  }
  return null;
}

/** The freshness line under a section. */
export function freshnessLine(s: SectionAvailabilityLike, now: Date = new Date()): string {
  if (!s.lastUpdatedAt) return s.sourceLabel;
  const when = relativeTime(s.lastUpdatedAt, now);
  if (s.freshness === "stale") return `Out of date — last updated ${when} (${s.sourceLabel})`;
  return `Updated ${when} (${s.sourceLabel})`;
}
