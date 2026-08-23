import { describe, it, expect } from "vitest";
import {
  courseOffering,
  isOfferingWarning,
  isProvisional,
  termOfferingLabel,
} from "./course-offering";
import type { ScheduleAvailability } from "@workspace/api-client-react";

/**
 * Course-offering intelligence. The professor asked that CampusVal flag a
 * course placed in a quarter where the schedule says it is not offered, and
 * that future terms be labelled tentative/projected CONSISTENTLY — some were
 * marked and others were not.
 *
 * These cases use the shape of the real dataset: a published Fall 2026 and
 * tentative Winter/Spring 2027, with several different courses rather than a
 * single hard-coded example.
 */

const term = (
  t: string,
  year: number,
  status: "published" | "tentative",
  codes: string[],
) =>
  ({
    term: t,
    year,
    status,
    sourceUrl: "https://www.scu.edu/registrar/",
    sourceLabel: "SCU Registrar",
    publishedDate: status === "published" ? "2026-05-07" : null,
    lastVerified: "2026-05-07",
    importedDate: "2026-05-07",
    freshness: "fresh",
    officialSectionCount: codes.length,
    syncedSectionCount: 0,
    offeredCourseCodes: codes,
  }) as any;

// CHEM 11: offered Fall and Winter, NOT Spring.
// MATH 11: offered in all three.
// ENGR 110: Fall only (senior design is fall-only at SCU).
const availability: ScheduleAvailability = {
  note: "test",
  terms: [
    term("fall", 2026, "published", ["CHEM 11", "MATH 11", "ENGR 110"]),
    term("winter", 2027, "tentative", ["CHEM 11", "MATH 11"]),
    term("spring", 2027, "tentative", ["MATH 11"]),
  ],
} as any;

describe("published schedule is treated as real evidence", () => {
  it("confirms a course that is in the published Fall schedule", () => {
    const r = courseOffering("CHEM 11", "fall", 2026, availability);
    expect(r.verdict).toBe("offered");
    expect(r.evidence).toBe("published");
  });

  it("flags a course missing from the published Fall schedule", () => {
    const r = courseOffering("BIOL 1A", "fall", 2026, availability);
    expect(r.verdict).toBe("not_offered");
    expect(r.evidence).toBe("published");
    expect(isOfferingWarning(r)).toBe(true);
  });

  it("does not mark a published verdict as provisional", () => {
    expect(isProvisional(courseOffering("CHEM 11", "fall", 2026, availability))).toBe(
      false,
    );
  });
});

describe("tentative Registrar schedule", () => {
  it("confirms a course present in the tentative Winter schedule", () => {
    const r = courseOffering("CHEM 11", "winter", 2027, availability);
    expect(r.verdict).toBe("offered");
    expect(r.evidence).toBe("tentative");
    expect(isProvisional(r)).toBe(true);
  });

  it("flags a course valid in Fall and Winter but not Spring", () => {
    // This is the professor's asked-for shape: valid in some terms, not others.
    expect(courseOffering("CHEM 11", "fall", 2026, availability).verdict).toBe(
      "offered",
    );
    expect(courseOffering("CHEM 11", "winter", 2027, availability).verdict).toBe(
      "offered",
    );
    const spring = courseOffering("CHEM 11", "spring", 2027, availability);
    expect(spring.verdict).toBe("not_offered");
    expect(spring.evidence).toBe("tentative");
  });

  it("says a tentative schedule can still change", () => {
    const r = courseOffering("CHEM 11", "spring", 2027, availability);
    expect(r.detail).toMatch(/can still change/);
  });

  it("confirms a course offered in every one of the three terms", () => {
    for (const [t, y] of [
      ["fall", 2026],
      ["winter", 2027],
      ["spring", 2027],
    ] as const) {
      expect(courseOffering("MATH 11", t, y, availability).verdict).toBe(
        "offered",
      );
    }
  });

  it("flags a fall-only course placed in Spring", () => {
    const r = courseOffering("ENGR 110", "spring", 2027, availability);
    expect(r.verdict).toBe("not_offered");
  });
});

describe("future terms with no SCU schedule are projected, consistently", () => {
  it("labels a future Fall as projected rather than leaving it unmarked", () => {
    const { label, evidence } = termOfferingLabel("fall", 2028, availability);
    expect(evidence).toBe("projected");
    expect(label).toMatch(/Projected/);
  });

  it("labels future Winter and Spring the same way as future Fall", () => {
    for (const t of ["fall", "winter", "spring"]) {
      expect(termOfferingLabel(t, 2029, availability).evidence).toBe(
        "projected",
      );
    }
  });

  it("projects a course forward from the verified schedule for that season", () => {
    const r = courseOffering("CHEM 11", "fall", 2028, availability);
    expect(r.verdict).toBe("offered");
    expect(r.evidence).toBe("projected");
    expect(isProvisional(r)).toBe(true);
  });

  it("projects a not-offered verdict forward too", () => {
    const r = courseOffering("CHEM 11", "spring", 2029, availability);
    expect(r.verdict).toBe("not_offered");
    expect(r.evidence).toBe("projected");
  });

  it("never presents a projection as a fact", () => {
    const r = courseOffering("CHEM 11", "fall", 2028, availability);
    expect(r.detail).toMatch(/[Pp]roject/);
    expect(r.detail).not.toMatch(/official/i);
  });

  it("does not invent sections, instructors or times in a projection", () => {
    const r = courseOffering("CHEM 11", "fall", 2028, availability);
    expect(r).not.toHaveProperty("sectionNumber");
    expect(r.detail).not.toMatch(/Section \d/);
  });
});

describe("honest unknown states", () => {
  it("reports Summer as unknown rather than projecting it", () => {
    const r = courseOffering("CHEM 11", "summer", 2027, availability);
    expect(r.verdict).toBe("unknown");
    expect(r.evidence).toBe("unknown");
    expect(r.detail).toMatch(/no verified Summer schedule/);
  });

  it("reports unknown when there is no availability data at all", () => {
    const r = courseOffering("CHEM 11", "fall", 2026, undefined);
    expect(r.verdict).toBe("unknown");
  });

  it("never warns on an unknown verdict", () => {
    expect(
      isOfferingWarning(courseOffering("CHEM 11", "summer", 2027, availability)),
    ).toBe(false);
  });

  it("labels a season it holds no schedule for honestly", () => {
    const { evidence } = termOfferingLabel("summer", 2027, availability);
    expect(evidence).toBe("unknown");
  });
});

describe("course-code normalization", () => {
  it("matches regardless of spacing and case", () => {
    expect(courseOffering("chem  11", "fall", 2026, availability).verdict).toBe(
      "offered",
    );
  });
});
