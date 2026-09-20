import { describe, it, expect } from "vitest";
import {
  bannerFor,
  countByStatus,
  freshnessLine,
  passesAvailabilityView,
  relativeTime,
  sourceChip,
} from "./availability-ui";

const NOW = new Date("2026-09-19T20:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("Open Sections / All Sections", () => {
  it("All Sections shows everything", () => {
    for (const s of ["open", "waitlist", "full", "unknown"] as const) expect(passesAvailabilityView(s, "all")).toBe(true);
  });

  it("Open Sections hides only what is KNOWN not to be open", () => {
    expect(passesAvailabilityView("open", "open")).toBe(true);
    expect(passesAvailabilityView("unknown", "open")).toBe(true);
    expect(passesAvailabilityView("waitlist", "open")).toBe(false);
    expect(passesAvailabilityView("full", "open")).toBe(false);
  });

  it("counts sections by status", () => {
    expect(countByStatus([{ availabilityStatus: "open" }, { availabilityStatus: "full" }, { availabilityStatus: "full" }, { availabilityStatus: "unknown" }])).toEqual({ open: 1, waitlist: 0, full: 2, unknown: 1 });
  });
});

describe("relative time", () => {
  it.each([
    [10_000, "just now"],
    [2 * 60_000, "2 minutes ago"],
    [60_000, "1 minute ago"],
    [3 * 3_600_000, "3 hours ago"],
  ])("%ims → %s", (ms, text) => expect(relativeTime(ago(ms), NOW)).toBe(text));

  it("falls back to a date for old timestamps, and to empty for missing/invalid", () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW)).toMatch(/\d/);
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime("nonsense", NOW)).toBe("");
  });

  it("never says 'in the future' for a timestamp ahead of the clock", () => {
    expect(relativeTime(new Date(NOW.getTime() + 3_600_000).toISOString(), NOW)).not.toMatch(/ago|in /);
  });
});

describe("banner wording per state", () => {
  it("live is only ever 'Live availability'; every other state must NOT claim it", () => {
    expect(bannerFor("live", ago(60_000), NOW).text).toBe("Live availability · updated 1 minute ago");
    for (const st of ["cached", "stale", "unavailable", "not_connected", "sample", "manual_snapshot"] as const) {
      expect(bannerFor(st, ago(60_000), NOW).text).not.toMatch(/^Live availability/);
    }
  });

  it("stale and unavailable are warnings; not-connected is neutral (nothing is wrong, it just isn't built)", () => {
    expect(bannerFor("stale", ago(3_600_000), NOW).tone).toBe("warn");
    expect(bannerFor("unavailable", null, NOW).tone).toBe("warn");
    expect(bannerFor("sample", null, NOW).tone).toBe("warn");
    expect(bannerFor("not_connected", null, NOW).tone).toBe("neutral");
  });

  it("'Availability currently unavailable' tells the student what to do instead", () => {
    expect(bannerFor("unavailable", null, NOW).text).toMatch(/currently unavailable.*Workday/);
  });
});

describe("source chip", () => {
  const base = { availabilityStatus: "open" as const, sourceLabel: "x" };

  it("LIVE only when the server says isLive", () => {
    expect(sourceChip({ ...base, sourceType: "workday_live", isLive: true })).toEqual({ label: "LIVE", tone: "good" });
    expect(sourceChip({ ...base, sourceType: "workday_live", isLive: false, freshness: "cached" })).toBeNull();
  });

  it("fixture is SAMPLE DATA even if it claimed isLive", () => {
    expect(sourceChip({ ...base, sourceType: "fixture", isLive: false })?.label).toBe("SAMPLE DATA");
  });

  it("stale → OUT OF DATE; manual snapshot → SNAPSHOT; registrar-only unknown → no chip", () => {
    expect(sourceChip({ ...base, sourceType: "workday_self_paste", freshness: "stale" })?.label).toBe("OUT OF DATE");
    expect(sourceChip({ ...base, sourceType: "workday_self_paste", freshness: "cached" })?.label).toBe("SNAPSHOT");
    expect(sourceChip({ availabilityStatus: "unknown", sourceType: "registrar_schedule", sourceLabel: "x" })).toBeNull();
  });
});

describe("freshness line", () => {
  it("source only when nothing was ever reported", () => {
    expect(freshnessLine({ availabilityStatus: "unknown", sourceType: "registrar_schedule", sourceLabel: "SCU Registrar schedule (no live seat data)", lastUpdatedAt: null }, NOW)).toBe("SCU Registrar schedule (no live seat data)");
  });

  it("'Updated N minutes ago' for fresh data, 'Out of date' for stale", () => {
    expect(freshnessLine({ availabilityStatus: "open", sourceType: "workday_live", sourceLabel: "Workday", lastUpdatedAt: ago(120_000), freshness: "live" }, NOW)).toBe("Updated 2 minutes ago (Workday)");
    expect(freshnessLine({ availabilityStatus: "unknown", sourceType: "workday_self_paste", sourceLabel: "Snapshot", lastUpdatedAt: ago(3 * 3_600_000), freshness: "stale" }, NOW)).toMatch(/^Out of date — last updated 3 hours ago/);
  });
});
