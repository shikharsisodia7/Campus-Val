/**
 * Regression coverage for the professor's four-year-preload correction:
 * only a plan CampusVal has actually reconciled against an official SCU
 * source may be "prescribed" (and therefore eligible for the "Load
 * Engineering Four-Year Plan" action) — every other major's generated
 * sequence must be truthfully labeled "recommended" or "example" and
 * carry provenance, never silently presented as equally authoritative.
 */
import { describe, it, expect } from "vitest";
import { getAvailableMajors, getGraduationPath, getFourYearIndex } from "./graduation-paths";

describe("graduation path sequence trust", () => {
  it("marks CSE's four-year plan as prescribed, with a real SCU source", () => {
    const path = getGraduationPath("four_year", "CSE");
    expect(path.sequenceTrust).toBe("prescribed");
    expect(path.provenance.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\//);
    expect(path.provenance.catalogYear).toBeTruthy();
    expect(path.provenance.lastVerified).toBeTruthy();
  });

  it("never marks the aggressive three-year compression as prescribed, for any major", () => {
    const cseThree = getGraduationPath("three_year", "CSE");
    expect(cseThree.sequenceTrust).not.toBe("prescribed");

    const otherThree = getGraduationPath("three_year", "ACTG");
    expect(otherThree.sequenceTrust).not.toBe("prescribed");
  });

  it("marks reconciled Engineering majors as prescribed, each with a real SCU source", () => {
    for (const major of ["ECEN", "EE", "CENG", "BIOE", "WDE"]) {
      const path = getGraduationPath("four_year", major);
      expect(path.sequenceTrust, `${major} should be prescribed`).toBe("prescribed");
      expect(path.provenance.sourceUrl, `${major} should link a real source`).toMatch(
        /^https:\/\/www\.scu\.edu\//,
      );
      expect(path.provenance.lastVerified, `${major} should record when it was verified`).toBeTruthy();
    }
  });

  it("MECH and GENR are prescribed: transcribed from their official quarter-by-quarter charts, each citing its source", () => {
    for (const major of ["MECH", "GENR"]) {
      const path = getGraduationPath("four_year", major);
      expect(path.sequenceTrust, `${major} should be prescribed`).toBe("prescribed");
      expect(path.provenance.sourceUrl, `${major} should link a real source`).toMatch(
        /^https:\/\/www\.scu\.edu\//,
      );
    }
  });

  it("marks non-engineering majors as example — no official source, never eligible for preload", () => {
    for (const major of ["ACTG", "PSYC", "ECON"]) {
      const recipeExists = getAvailableMajors().some((m) => m.code === major);
      expect(recipeExists, `${major} should be a known major for this test`).toBe(true);
      const path = getGraduationPath("four_year", major);
      expect(path.sequenceTrust).toBe("example");
      expect(path.provenance.sourceUrl).toBeUndefined();
    }
  });

  it("gives an unknown/unrecognized major an empty plan that is still explicitly not preloadable", () => {
    const path = getGraduationPath("four_year", "ZZZZ");
    expect(path.quarters).toEqual([]);
    expect(path.sequenceTrust).not.toBe("prescribed");
  });

  it("every four-year plan for every known major carries a provenance verificationNote (no silent fabrication)", () => {
    for (const m of getAvailableMajors()) {
      const path = getGraduationPath("four_year", m.code);
      expect(path.provenance.verificationNote, `${m.code} missing verificationNote`).toBeTruthy();
    }
  });
});

describe("getFourYearIndex — 'Load Four-Year Plan' dropdown source list", () => {
  it("includes CSE as prescribed (loadable)", () => {
    const index = getFourYearIndex();
    const cse = index.find((m) => m.code === "CSE");
    expect(cse).toBeDefined();
    expect(cse!.sequenceTrust).toBe("prescribed");
  });

  it("includes the reconciled Engineering majors as prescribed (loadable)", () => {
    const index = getFourYearIndex();
    for (const code of ["ECEN", "EE", "CENG", "BIOE", "WDE"]) {
      const entry = index.find((m) => m.code === code);
      expect(entry, `${code} should be in the index`).toBeDefined();
      expect(entry!.sequenceTrust).toBe("prescribed");
    }
  });

  it("includes MECH and GENR as prescribed, with their official source", () => {
    const index = getFourYearIndex();
    for (const code of ["MECH", "GENR"]) {
      const entry = index.find((m) => m.code === code);
      expect(entry, `${code} should be in the index`).toBeDefined();
      expect(entry!.sequenceTrust).toBe("prescribed");
    }
  });

  it("never includes an 'example' (generated-template) major — that is not a published departmental plan", () => {
    const index = getFourYearIndex();
    for (const major of ["ACTG", "PSYC", "ECON"]) {
      expect(index.find((m) => m.code === major)).toBeUndefined();
    }
    expect(index.every((m) => m.sequenceTrust !== "example")).toBe(true);
  });

  it("returns exactly the known real-plan majors, nothing more — the complete School of Engineering four-year-plan matrix", () => {
    const index = getFourYearIndex();
    expect(index.map((m) => m.code).sort()).toEqual(
      ["BIOE", "CENG", "CSE", "ECEN", "EE", "GENR", "MECH", "WDE"].sort(),
    );
  });
});
