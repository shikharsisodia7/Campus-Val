import { describe, it, expect } from "vitest";
import { WORKDAY_STUDENT_URL } from "./workday";

describe("Workday handoff URL", () => {
  it("points at the valid Workday Student home page (no trailing typo)", () => {
    expect(WORKDAY_STUDENT_URL).toBe("https://www.myworkday.com/scu/d/home.html");
    expect(WORKDAY_STUDENT_URL.endsWith(".html")).toBe(true);
    expect(WORKDAY_STUDENT_URL.endsWith(".htmld")).toBe(false);
  });
});
