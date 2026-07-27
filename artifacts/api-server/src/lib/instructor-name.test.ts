import { describe, it, expect } from "vitest";
import {
  normalizeInstructorName,
  isRealInstructorName,
} from "./instructor-name";

describe("normalizeInstructorName", () => {
  it("strips leading punctuation artifacts (the '. Sunwolf' bug)", () => {
    expect(normalizeInstructorName(". Sunwolf")).toBe("Sunwolf");
    expect(normalizeInstructorName(", Smith")).toBe("Smith");
    expect(normalizeInstructorName("- Jones")).toBe("Jones");
  });
  it("collapses duplicate whitespace", () => {
    expect(normalizeInstructorName("  Maria   Lopez  ")).toBe("Maria Lopez");
  });
  it("does not damage legitimate names", () => {
    expect(normalizeInstructorName("O'Brien")).toBe("O'Brien");
    expect(normalizeInstructorName("de la Cruz")).toBe("de la Cruz");
    expect(normalizeInstructorName("Smith-Jones")).toBe("Smith-Jones");
    expect(normalizeInstructorName("Sunwolf")).toBe("Sunwolf");
    expect(normalizeInstructorName("Robert Downey Jr.")).toBe(
      "Robert Downey Jr.",
    );
  });
  it("returns empty string for pure garbage", () => {
    expect(normalizeInstructorName("...")).toBe("");
    expect(normalizeInstructorName("  ")).toBe("");
  });
});

describe("isRealInstructorName", () => {
  it("rejects TBA/Staff placeholders in any case", () => {
    expect(isRealInstructorName("TBA")).toBe(false);
    expect(isRealInstructorName("staff")).toBe(false);
    expect(isRealInstructorName("To Be Announced")).toBe(false);
    expect(isRealInstructorName(". tba")).toBe(false);
    expect(isRealInstructorName("")).toBe(false);
  });
  it("accepts real names, including cleaned artifacts", () => {
    expect(isRealInstructorName(". Sunwolf")).toBe(true);
    expect(isRealInstructorName("Maria Lopez")).toBe(true);
  });
});
