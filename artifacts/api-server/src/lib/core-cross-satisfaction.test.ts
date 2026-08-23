import { describe, it, expect } from "vitest";
import {
  coreAreasFor,
  resolveCrossSatisfaction,
} from "./core-cross-satisfaction";

/**
 * The professor's requirement: "If a planned major course satisfies
 * Mathematics Core, Natural Science Core, or another verified Core category,
 * the Core requirement must recognize it." MATH 11 and CHEM 11 are named as
 * examples, not as the only cases — several Core areas are exercised here.
 */

const set = (...codes: string[]) =>
  new Set(codes.map((c) => c.trim().toUpperCase().replace(/\s+/g, " ")));

describe("catalog Core-area tagging", () => {
  it("tags MATH 11 as Mathematics", () => {
    expect(coreAreasFor("MATH 11")).toContain("Mathematics");
  });

  it("tags CHEM 11 as Natural Science", () => {
    expect(coreAreasFor("CHEM 11")).toContain("Natural Science");
  });

  it("tags PHYS 31 as Natural Science too — not special-cased to CHEM", () => {
    expect(coreAreasFor("PHYS 31")).toContain("Natural Science");
  });

  it("returns nothing for an unknown course rather than guessing", () => {
    expect(coreAreasFor("ZZZZ 999")).toEqual([]);
  });
});

describe("a planned major course satisfies the matching Core requirement", () => {
  it("marks Mathematics Core planned when MATH 11 is planned for the major", () => {
    const result = resolveCrossSatisfaction(
      "math",
      [],
      set(),
      set("MATH 11"),
    );
    expect(result.status).toBe("planned");
    expect(result.crossSatisfiedBy).toContain("MATH 11");
  });

  it("marks Natural Science Core planned when CHEM 11 is planned", () => {
    const result = resolveCrossSatisfaction(
      "natsci",
      [],
      set(),
      set("CHEM 11"),
    );
    expect(result.status).toBe("planned");
    expect(result.crossSatisfiedBy).toContain("CHEM 11");
  });

  it("works for a third Core area — Social Science via ECON 1", () => {
    const result = resolveCrossSatisfaction("socsci", [], set(), set("ECON 1"));
    expect(result.status).toBe("planned");
  });

  it("leaves an unrelated Core requirement open", () => {
    const result = resolveCrossSatisfaction(
      "natsci",
      [],
      set(),
      set("MATH 11"),
    );
    expect(result.status).toBe("open");
    expect(result.crossSatisfiedBy).toEqual([]);
  });
});

describe("planned is never reported as completed", () => {
  it("reports planned, not completed, for a future course", () => {
    const result = resolveCrossSatisfaction("math", [], set(), set("MATH 11"));
    expect(result.status).toBe("planned");
    expect(result.status).not.toBe("completed");
    expect(result.satisfiedBy).toEqual([]);
  });

  it("reports completed once the course has completion provenance", () => {
    const result = resolveCrossSatisfaction(
      "math",
      [],
      set("MATH 11"),
      set(),
    );
    expect(result.status).toBe("completed");
  });

  it("prefers completed when a course is both completed and still listed as planned", () => {
    const result = resolveCrossSatisfaction(
      "math",
      [],
      set("MATH 11"),
      set("MATH 11"),
    );
    expect(result.status).toBe("completed");
  });
});

describe("removing the cross-satisfying course reverses the status", () => {
  it("returns to open when the planned course is removed", () => {
    const planned = resolveCrossSatisfaction("math", [], set(), set("MATH 11"));
    expect(planned.status).toBe("planned");

    const removed = resolveCrossSatisfaction("math", [], set(), set());
    expect(removed.status).toBe("open");
    expect(removed.crossSatisfiedBy).toEqual([]);
  });

  it("returns to open for Natural Science when CHEM 11 is removed", () => {
    expect(
      resolveCrossSatisfaction("natsci", [], set(), set()).status,
    ).toBe("open");
  });
});

describe("explicit SCU course lists stay authoritative", () => {
  it("uses the requirement's own course list without demanding verification", () => {
    const result = resolveCrossSatisfaction(
      "math",
      ["MATH 30", "MATH 11"],
      set(),
      set("MATH 30"),
    );
    expect(result.plannedBy).toContain("MATH 30");
    expect(result.needsVerification).toBe(false);
  });

  it("does not double-count a course that is already on the explicit list", () => {
    const result = resolveCrossSatisfaction(
      "math",
      ["MATH 11"],
      set(),
      set("MATH 11"),
    );
    expect(result.plannedBy).toEqual(["MATH 11"]);
    expect(result.crossSatisfiedBy).toEqual([]);
  });
});

describe("derived Core-area matches are flagged for verification", () => {
  it("asks the student to verify a match that rests only on derived tagging", () => {
    const result = resolveCrossSatisfaction("math", [], set(), set("MATH 11"));
    expect(result.needsVerification).toBe(true);
  });

  it("does not flag verification when nothing matched at all", () => {
    const result = resolveCrossSatisfaction("math", [], set(), set());
    expect(result.needsVerification).toBe(false);
  });
});
