/**
 * Regression coverage for minor-catalog discrepancies found during an
 * independent fresh re-verification pass (not carried over from
 * docs/SCU_PROGRAM_CATALOG.md, which had overstated completeness — many
 * "structured" minors turned out to still be generic placeholders, and
 * several minor codes turned out not to correspond to any real SCU minor).
 *
 * Resolved after direct verification against the live SCU Bulletin:
 *
 *  - COMM-MIN ("Communication") is not a real, standalone minor — the
 *    Communication department offers exactly three minors (Journalism,
 *    Digital Filmmaking, Organizational/Business/Professional
 *    Communication), each already separately modeled as JOUR-MIN/DFLM-MIN/
 *    OBPC-MIN. COMM-MIN duplicated and confused these.
 *  - MUSP-MIN ("Music Performance") is not a real, standalone minor — the
 *    Music department offers exactly one minor (Music, MUSC-MIN) plus the
 *    separately-modeled Musical Theatre minor (MUTH-MIN).
 *  - BIOC-MIN ("Biochemistry") is not a real, standalone minor — the
 *    Chemistry and Biochemistry department offers exactly one minor
 *    (Chemistry, CHEM-MIN).
 *  - LGBT-MIN duplicated WGST-MIN (same real program, modeled twice under
 *    two different names/codes) — merged into a single WGST-MIN entry.
 */
import { describe, it, expect } from "vitest";
import { getAvailableMinors, getMinorRequirements } from "./graduation-paths";

const RETIRED_FAKE_MINOR_CODES = ["COMM-MIN", "MUSP-MIN", "BIOC-MIN", "LGBT-MIN"];

describe("minor-catalog discrepancies (COMM-MIN/MUSP-MIN/BIOC-MIN/LGBT-MIN)", () => {
  it("never offers COMM-MIN, MUSP-MIN, BIOC-MIN, or LGBT-MIN as a selectable minor", () => {
    const minors = getAvailableMinors();
    for (const code of RETIRED_FAKE_MINOR_CODES) {
      expect(
        minors.find((m) => m.code === code),
        `${code} is not a real standalone SCU minor and must not be selectable`,
      ).toBeUndefined();
    }
  });

  it("still represents the real underlying programs via JOUR-MIN/DFLM-MIN/OBPC-MIN, MUSC-MIN/MUTH-MIN, CHEM-MIN, and WGST-MIN", () => {
    const minors = getAvailableMinors();
    for (const code of ["JOUR-MIN", "DFLM-MIN", "OBPC-MIN", "MUSC-MIN", "MUTH-MIN", "CHEM-MIN", "WGST-MIN"]) {
      expect(minors.find((m) => m.code === code), `${code} should still exist`).toBeTruthy();
    }
  });

  it("JOUR-MIN, DFLM-MIN, and OBPC-MIN now have real (non-generic) elective lists", () => {
    for (const code of ["JOUR-MIN", "DFLM-MIN", "OBPC-MIN"]) {
      const recipe = getMinorRequirements(code);
      expect(recipe, `${code} should have a recipe`).toBeTruthy();
      const hasRealElectives = recipe!.groups.some((g) => g.courses.length > 0);
      expect(hasRealElectives, `${code} should have at least one group with real course codes`).toBe(true);
    }
  });
});
