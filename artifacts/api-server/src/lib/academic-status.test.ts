import { describe, it, expect } from "vitest";
import {
  gpaDisplayState,
  probationNotice,
  overloadEligibility,
} from "./academic-status";

describe("gpaDisplayState", () => {
  it("CASE A: no GPA yet is 'unknown', never 0.000", () => {
    const s = gpaDisplayState(null);
    expect(s.kind).toBe("unknown");
    expect(s).not.toHaveProperty("value");
  });
  it("CASE B/C: known GPA passes through", () => {
    expect(gpaDisplayState(1.9)).toEqual({ kind: "known", value: 1.9 });
    expect(gpaDisplayState(3.5)).toEqual({ kind: "known", value: 3.5 });
  });
  it("a real 0.00 GPA is still 'known' (distinct from missing)", () => {
    expect(gpaDisplayState(0)).toEqual({ kind: "known", value: 0 });
  });
});

describe("probationNotice", () => {
  it("CASE A: missing GPA produces NO probation warning", () => {
    expect(probationNotice(null)).toBeNull();
  });
  it("CASE B: confirmed GPA 1.90 produces a probation warning with source", () => {
    const n = probationNotice(1.9);
    expect(n).not.toBeNull();
    expect(n!.level).toBe("warning");
    expect(n!.message).toMatch(/below 2\.0/);
    expect(n!.source).toMatch(/Bulletin/);
  });
  it("CASE C: GPA 3.50 produces no warning", () => {
    expect(probationNotice(3.5)).toBeNull();
  });
});

describe("overloadEligibility", () => {
  it("first-year with no GPA: not eligible, but no 'below threshold' claim", () => {
    const r = overloadEligibility(null, false, "freshman");
    expect(r.canOverload).toBe(false);
    expect(r.reason).toMatch(/No SCU GPA yet/);
    expect(r.reason).not.toMatch(/below/i);
    expect(r.unitCap).toBe(20);
  });
  it("eligible returning student: GPA 3.5 + priority registration", () => {
    const r = overloadEligibility(3.5, true, "junior");
    expect(r.canOverload).toBe(true);
    expect(r.unitCap).toBeGreaterThan(22 - 1);
  });
  it("student below verified threshold: GPA 2.5 states the actual GPA", () => {
    const r = overloadEligibility(2.5, true, "sophomore");
    expect(r.canOverload).toBe(false);
    expect(r.reason).toMatch(/2\.50/);
    expect(r.reason).toMatch(/below the 3\.0/);
  });
  it("good GPA but no priority registration: names the real blocker", () => {
    const r = overloadEligibility(3.8, false, "senior");
    expect(r.canOverload).toBe(false);
    expect(r.reason).toMatch(/[Pp]riority registration/);
  });
});
