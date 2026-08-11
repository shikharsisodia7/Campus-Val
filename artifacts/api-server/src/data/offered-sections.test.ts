import { describe, expect, it } from "vitest";
import { scheduleFreshness } from "./offered-sections";

describe("scheduleFreshness", () => {
  const now = new Date("2026-08-11T12:00:00Z");

  it("marks recently verified published data as fresh", () => {
    expect(scheduleFreshness({ status: "published", lastVerified: "2026-08-01" }, now)).toBe("fresh");
  });

  it("asks for verification before published schedule data becomes stale", () => {
    expect(scheduleFreshness({ status: "published", lastVerified: "2026-07-17" }, now)).toBe("verify_soon");
  });

  it("marks old tentative schedule data as stale sooner", () => {
    expect(scheduleFreshness({ status: "tentative", lastVerified: "2026-07-20" }, now)).toBe("stale");
  });
});
