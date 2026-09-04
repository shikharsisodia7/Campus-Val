/**
 * Verifies the 15 majors with bulletin-confirmed concentrations
 * (docs/SCU_PROGRAM_CATALOG.md) expose them with real official provenance
 * and no invented concentration names.
 */
import { describe, it, expect } from "vitest";
import { getMajorRequirements } from "./graduation-paths";

const MAJORS_WITH_CONCENTRATIONS: Record<string, number> = {
  ANTH: 3,
  ARTH: 1,
  ARTS: 2,
  CLAS: 3,
  COMM: 6,
  ECON_CAS: 2,
  ECON: 2,
  WGST: 3,
  MATH: 5,
  CSCI: 4,
  PHIL: 5,
  POLI: 3,
  PHSC: 2,
  THTR: 2,
  BIOE: 3,
};

function catalogLookup(code: string) {
  return { code, title: code, units: 4, description: "" };
}

describe("major concentrations", () => {
  it("every listed major exposes the expected concentration count with real bulletin URLs", () => {
    for (const [major, count] of Object.entries(MAJORS_WITH_CONCENTRATIONS)) {
      const reqs = getMajorRequirements(major, [], catalogLookup);
      expect(reqs, `${major} should resolve`).toBeTruthy();
      expect(reqs!.concentrations.length, `${major} concentration count`).toBe(count);
      for (const c of reqs!.concentrations) {
        expect(c.title.length).toBeGreaterThan(0);
        expect(c.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\/bulletin\//);
      }
    }
  });

  it("a major with no known concentrations returns an empty array, not undefined", () => {
    const reqs = getMajorRequirements("BIOL", [], catalogLookup);
    expect(reqs!.concentrations).toEqual([]);
  });
});
