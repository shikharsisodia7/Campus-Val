import { describe, it, expect } from "vitest";
import { reconcileMajor } from "./apr-major-reconciliation";

describe("reconcileMajor", () => {
  it("returns unknown when either side is missing", () => {
    expect(reconcileMajor(undefined, "Finance")).toBe("unknown");
    expect(reconcileMajor("Finance", undefined)).toBe("unknown");
    expect(reconcileMajor(null, null)).toBe("unknown");
  });

  it("matches identical major names", () => {
    expect(reconcileMajor("Finance", "Finance")).toBe("match");
  });

  it("matches despite case, punctuation, and & vs and differences", () => {
    expect(reconcileMajor("Electrical & Computer Engineering", "electrical and computer engineering")).toBe("match");
  });

  it("matches when one side includes noise words the other doesn't (Major/Program/B.S.)", () => {
    expect(reconcileMajor("Finance Major", "Finance")).toBe("match");
    expect(reconcileMajor("Computer Science and Engineering (BS)", "Computer Science and Engineering")).toBe("match");
  });

  it("flags a real mismatch between two clean, unrelated major names", () => {
    expect(reconcileMajor("Finance", "Computer Science & Engineering")).toBe("mismatch");
  });

  it("returns unknown (never guesses mismatch) for a long, noisy APR line rather than a clean major name", () => {
    const noisy =
      "Program: Finance  Expected Graduation: Spring 2027  Advisor: Someone  Catalog Year: 2023-24  Status: Active";
    expect(reconcileMajor(noisy, "Computer Science & Engineering")).toBe("unknown");
  });

  it("returns unknown for very short/ambiguous fragments instead of guessing", () => {
    expect(reconcileMajor("BS", "Computer Science & Engineering")).toBe("unknown");
  });
});
