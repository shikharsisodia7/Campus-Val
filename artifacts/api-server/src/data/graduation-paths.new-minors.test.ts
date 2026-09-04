/**
 * Verifies the 21 newly-added minors (docs/SCU_PROGRAM_CATALOG.md) appear
 * in the catalog with real official provenance and honest, non-fabricated
 * requirement data (needsVerification, not invented course lists).
 */
import { describe, it, expect } from "vitest";
import { getAvailableMinors, getMinorRequirements } from "./graduation-paths";

const NEW_MINOR_CODES = [
  "JOUR-MIN",
  "DFLM-MIN",
  "OBPC-MIN",
  "PWRT-MIN",
  "GEOA-MIN",
  "AFAM-MIN",
  "ASAM-MIN",
  "LATX-MIN",
  "ANIM-MIN",
  "ARTM-MIN",
  "GRDS-MIN",
  "TDTC-MIN",
  "GERO-MIN",
  "MHUM-MIN",
  "BTEC-MIN",
  "MUTH-MIN",
  "RAI-MIN",
  "HCID-MIN",
  "CNST-MIN",
  "INTB-MIN",
  "SFS-MIN",
];

describe("newly-added minors", () => {
  it("all appear in getAvailableMinors", () => {
    const minors = getAvailableMinors();
    for (const code of NEW_MINOR_CODES) {
      expect(minors.find((m) => m.code === code)).toBeTruthy();
    }
  });

  it("every new minor has a real official scu.edu bulletin source URL", () => {
    for (const code of NEW_MINOR_CODES) {
      const recipe = getMinorRequirements(code);
      expect(recipe, `${code} should have a MINOR_RECIPES entry`).toBeTruthy();
      expect(recipe!.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\/bulletin\//);
    }
  });

  it("does not fabricate specific course requirements it hasn't verified", () => {
    for (const code of NEW_MINOR_CODES) {
      const recipe = getMinorRequirements(code)!;
      for (const group of recipe.groups) {
        // Every group for these 21 minors is honestly marked unverified with
        // no invented course codes — see docs/SCU_PROGRAM_CATALOG.md.
        expect(group.needsVerification).toBe(true);
        expect(group.courses).toEqual([]);
      }
    }
  });
});
