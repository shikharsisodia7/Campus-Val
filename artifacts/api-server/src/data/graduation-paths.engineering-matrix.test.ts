/**
 * Regression coverage for the 2026-09-17 professor-feedback pass: "every
 * undergraduate Engineering major with an official SCU four-year plan should
 * be preloadable; majors without one must never fabricate a sequence."
 *
 * This is the complete School of Engineering four-year-plan matrix:
 *   CSE, ECEN, EE, CENG, BIOE, WDE -> prescribed (reconciled, preloadable)
 *   MECH, GENR                    -> recommended (official source linked,
 *                                     flow-chart format not yet safely
 *                                     reconciled into quarters — reference
 *                                     only, never preloadable)
 * See docs/ENGINEERING_FOUR_YEAR_PLAN_MATRIX.md for the source-by-source
 * writeup this test locks in.
 */
import { describe, it, expect } from "vitest";
import {
  getAvailableMajors,
  getGraduationPath,
  getFourYearIndex,
} from "./graduation-paths";
import { findCourse } from "./courses";

const SOE_MAJORS = ["CSE", "ECEN", "EE", "CENG", "BIOE", "WDE", "MECH", "GENR"];
// MECH and GENR were transcribed from their official flow charts on 2026-10-06 (rows are quarters),
// so every School of Engineering major is now prescribed.
const PRESCRIBED_SOE_MAJORS = ["CSE", "ECEN", "EE", "CENG", "BIOE", "WDE", "MECH", "GENR"];
const RECOMMENDED_SOE_MAJORS: string[] = [];

// Placeholder text that stands in for an open elective/Core slot — never a
// specific fabricated course. Matched by prefix so every "Core: ..." variant
// and named Note-reference placeholder is recognized without listing each.
const PLACEHOLDER_PREFIXES = [
  "Core:",
  "ECEN Elective",
  "CENG Technical Elective",
  "Technical Elective",
  "Computer Engineering Elective",
  "Math Science Elective",
  "Professional Development",
  "Optional Elective",
  "Free Elective",
  "Concentration Elective",
  "Educational Enrichment Elective",
];
// Courses an official plan lists that the 2025-26 catalog snapshot does not carry. They are kept as the
// source printed them (and load as placeholders in Sample Plans) rather than dropped or replaced.
const OFFICIAL_COURSES_MISSING_FROM_CATALOG = new Set(["MECH 142", "ENGR 193", "ENGR 163A", "ENGR 163B"]);
const isPlaceholder = (course: string) =>
  PLACEHOLDER_PREFIXES.some((p) => course.startsWith(p)) || / or /.test(course);

describe("Engineering four-year-plan matrix — every current SOE major CampusVal exposes", () => {
  it("getAvailableMajors includes every School of Engineering major in the matrix, and only those are college SOE among them", () => {
    const majors = getAvailableMajors();
    for (const code of SOE_MAJORS) {
      const entry = majors.find((m) => m.code === code);
      expect(entry, `${code} should be a known major`).toBeTruthy();
      expect(entry!.college, `${code} should be college SOE`).toBe("SOE");
    }
  });

  it("prescribed majors are preloadable: sequenceTrust prescribed, complete provenance, 12 quarters, real term/year mapping", () => {
    for (const code of PRESCRIBED_SOE_MAJORS) {
      const path = getGraduationPath("four_year", code);
      expect(path.sequenceTrust, `${code} should be prescribed`).toBe("prescribed");
      expect(path.provenance.sourceUrl, `${code} needs a sourceUrl`).toMatch(/^https:\/\/www\.scu\.edu\//);
      expect(path.provenance.sourceLabel, `${code} needs a sourceLabel`).toBeTruthy();
      expect(path.provenance.catalogYear, `${code} needs a catalogYear`).toBeTruthy();
      expect(path.provenance.lastVerified, `${code} needs a lastVerified date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(path.quarters.length, `${code} should have 12 quarters (4 years x 3 terms)`).toBe(12);
      const years = new Set(path.quarters.map((q) => q.year));
      expect(years, `${code} should span years 1-4`).toEqual(new Set([1, 2, 3, 4]));
      for (const year of [1, 2, 3, 4]) {
        const terms = path.quarters.filter((q) => q.year === year).map((q) => q.term);
        expect(terms.sort(), `${code} year ${year} should have fall/winter/spring exactly once each`).toEqual(
          ["fall", "spring", "winter"],
        );
      }
    }
  });

  it("recommended majors have a real source but are never preloadable", () => {
    for (const code of RECOMMENDED_SOE_MAJORS) {
      const path = getGraduationPath("four_year", code);
      expect(path.sequenceTrust, `${code} should be recommended, not prescribed`).toBe("recommended");
      expect(path.provenance.sourceUrl, `${code} needs a sourceUrl`).toMatch(/^https:\/\/www\.scu\.edu\//);
      expect(
        path.provenance.verificationNote,
        `${code} should explain why it isn't preloadable yet`,
      ).toMatch(/not.*(reconcil|preload)/i);
    }
  });

  it("every prescribed major's real (non-placeholder) course codes exist in the CampusVal catalog", () => {
    for (const code of PRESCRIBED_SOE_MAJORS) {
      const path = getGraduationPath("four_year", code);
      for (const quarter of path.quarters) {
        for (const course of quarter.courses) {
          if (isPlaceholder(course) || OFFICIAL_COURSES_MISSING_FROM_CATALOG.has(course)) continue;
          expect(findCourse(course), `${code} ${quarter.label}: "${course}" should exist in the course catalog`).toBeTruthy();
        }
      }
    }
  });

  it("no prescribed plan silently duplicates a course across quarters", () => {
    for (const code of PRESCRIBED_SOE_MAJORS) {
      const path = getGraduationPath("four_year", code);
      const seen = new Set<string>();
      for (const quarter of path.quarters) {
        for (const course of quarter.courses) {
          if (isPlaceholder(course)) continue; // placeholders legitimately repeat
          expect(seen.has(course), `${code}: "${course}" appears in more than one quarter`).toBe(false);
          seen.add(course);
        }
      }
    }
  });

  it("getFourYearIndex ('Load Four-Year Plan' picker) contains exactly the 8 SOE majors, never an 'example' one", () => {
    const index = getFourYearIndex();
    const codes = index.map((m) => m.code).sort();
    expect(codes).toEqual([...SOE_MAJORS].sort());
    expect(index.every((m) => m.sequenceTrust !== "example")).toBe(true);
  });

  it("only officially-sourced (prescribed) plans are ever eligible for preload — recommended/example never are", () => {
    for (const code of getAvailableMajors().map((m) => m.code)) {
      const path = getGraduationPath("four_year", code);
      const eligibleForPreload = path.sequenceTrust === "prescribed";
      expect(eligibleForPreload).toBe(PRESCRIBED_SOE_MAJORS.includes(code));
    }
  });
});
