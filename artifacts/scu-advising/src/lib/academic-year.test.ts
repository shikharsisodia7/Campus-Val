import { describe, it, expect } from "vitest";
import {
  academicYearLabel,
  anchorYearFor,
  calendarYearFor,
} from "./academic-year";

/**
 * REGRESSION: Winter and Spring Degree Plan courses did not show up correctly
 * in Quarter Plan, and Winter/Spring term columns never picked up their
 * schedule status — both reported by the professor.
 *
 * Both came from the same root cause: plan items store `academicYear` as the
 * academic-year ANCHOR (2026-winter = calendar Winter 2027), while SCU
 * schedule data is keyed by CALENDAR year. Fall is the one term where the two
 * numbers coincide, which is why only Fall ever worked and the bug looked
 * cosmetic.
 */
describe("calendarYearFor", () => {
  it("leaves Fall on the anchor year", () => {
    expect(calendarYearFor("fall", 2026)).toBe(2026);
  });

  it("rolls Winter into the next calendar year", () => {
    expect(calendarYearFor("winter", 2026)).toBe(2027);
  });

  it("rolls Spring into the next calendar year", () => {
    expect(calendarYearFor("spring", 2026)).toBe(2027);
  });

  it("rolls Summer into the next calendar year", () => {
    expect(calendarYearFor("summer", 2026)).toBe(2027);
  });
});

describe("anchorYearFor", () => {
  it("leaves Fall on its own year", () => {
    expect(anchorYearFor("fall", 2026)).toBe(2026);
  });

  it("maps calendar Winter 2027 back to the 2026-27 academic year", () => {
    expect(anchorYearFor("winter", 2027)).toBe(2026);
  });

  it("maps calendar Spring 2027 back to the 2026-27 academic year", () => {
    expect(anchorYearFor("spring", 2027)).toBe(2026);
  });
});

describe("the two conversions are exact inverses", () => {
  for (const term of ["fall", "winter", "spring", "summer"]) {
    it(`round-trips ${term}`, () => {
      for (const anchor of [2024, 2026, 2029]) {
        expect(anchorYearFor(term, calendarYearFor(term, anchor))).toBe(anchor);
      }
    });
  }
});

describe("the whole 2026-27 academic year maps to the real SCU terms", () => {
  it("matches the Registrar's Fall 2026 / Winter 2027 / Spring 2027", () => {
    const anchor = 2026;
    expect({
      fall: calendarYearFor("fall", anchor),
      winter: calendarYearFor("winter", anchor),
      spring: calendarYearFor("spring", anchor),
    }).toEqual({ fall: 2026, winter: 2027, spring: 2027 });
  });

  it("keeps the next academic year distinct from this one", () => {
    // The bug made Quarter Plan's Winter show the NEXT year's Winter courses.
    expect(calendarYearFor("winter", 2027)).toBe(2028);
    expect(anchorYearFor("winter", 2028)).toBe(2027);
    expect(anchorYearFor("winter", 2027)).not.toBe(2027);
  });
});

describe("academicYearLabel", () => {
  it("formats an academic year the way the board heading does", () => {
    expect(academicYearLabel(2026)).toBe("2026–27");
  });
});
