import { describe, it, expect } from "vitest";
import { deriveAvailability } from "./section-availability";

describe("deriveAvailability", () => {
  it("returns unknown, with no fabricated timestamp, when seats are not known", () => {
    const result = deriveAvailability({
      seatsKnown: false,
      seatsOpen: 0,
      waitlist: 0,
      syncedAt: null,
    });
    expect(result.availabilityStatus).toBe("unknown");
    expect(result.lastUpdatedAt).toBeNull();
    expect(result.sourceType).toBe("registrar_schedule");
  });

  it("returns open when seats are known and seatsOpen > 0", () => {
    const result = deriveAvailability({
      seatsKnown: true,
      seatsOpen: 3,
      waitlist: 0,
      syncedAt: new Date("2026-09-17T12:00:00Z"),
    });
    expect(result.availabilityStatus).toBe("open");
    expect(result.sourceType).toBe("workday_self_paste");
    expect(result.lastUpdatedAt).toBe("2026-09-17T12:00:00.000Z");
  });

  it("returns waitlist when seats are exhausted but a waitlist exists", () => {
    const result = deriveAvailability({
      seatsKnown: true,
      seatsOpen: 0,
      waitlist: 12,
      syncedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(result.availabilityStatus).toBe("waitlist");
  });

  it("returns full when seats are exhausted and there is no waitlist", () => {
    const result = deriveAvailability({
      seatsKnown: true,
      seatsOpen: 0,
      waitlist: 0,
      syncedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(result.availabilityStatus).toBe("full");
  });

  it("never claims a source or timestamp when the status is unknown, even if stray numbers are passed", () => {
    const result = deriveAvailability({
      seatsKnown: false,
      seatsOpen: 5, // should be ignored — seatsKnown is the gate
      waitlist: 2,
      syncedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.availabilityStatus).toBe("unknown");
    expect(result.lastUpdatedAt).toBeNull();
  });
});
