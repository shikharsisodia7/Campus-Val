import { describe, it, expect } from "vitest";
import {
  classifyAcademicRecordCompletion,
  classifySectionHeader,
  classifyRowStatusText,
} from "./academic-record-status";

describe("classifyAcademicRecordCompletion", () => {
  describe("not-completed grades never count as completed", () => {
    for (const grade of ["F", "NP", "NC", "W", "I", "AU"]) {
      it(`grade "${grade}" under a completed_term section is not_completed`, () => {
        expect(
          classifyAcademicRecordCompletion({ sectionStatus: "completed_term", grade }),
        ).toBe("not_completed");
      });
    }

    it("is case-insensitive and trims whitespace", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "completed_term", grade: " w " }),
      ).toBe("not_completed");
    });
  });

  describe("completed grades", () => {
    for (const grade of ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "P", "CR"]) {
      it(`grade "${grade}" is completed`, () => {
        expect(
          classifyAcademicRecordCompletion({ sectionStatus: "completed_term", grade }),
        ).toBe("completed");
      });
    }
  });

  describe("section status without a usable grade", () => {
    it("in_progress is never completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "in_progress", grade: null }),
      ).toBe("not_completed");
    });

    it("in_progress with a blank/dash grade token is still not_completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "in_progress", grade: "---" }),
      ).toBe("not_completed");
    });

    it("not_completed section (withdrawn/dropped/planned/registered) is not_completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "not_completed", grade: null }),
      ).toBe("not_completed");
    });

    it("transfer_credit with no grade is completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "transfer_credit", grade: null }),
      ).toBe("completed");
    });

    it("completed_term with no grade is completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "completed_term", grade: null }),
      ).toBe("completed");
    });

    it("unknown section with no grade needs review, never silently completed", () => {
      expect(
        classifyAcademicRecordCompletion({ sectionStatus: "unknown", grade: null }),
      ).toBe("needs_review");
    });
  });

  it("an explicit not-completed grade overrides an otherwise-completed section", () => {
    // Guards against PDF line-collapse bleeding "Completed" section text
    // into a row that actually has a W/F grade.
    expect(
      classifyAcademicRecordCompletion({ sectionStatus: "completed_term", grade: "F" }),
    ).toBe("not_completed");
  });

  it("an explicit completed grade overrides an in_progress section", () => {
    expect(
      classifyAcademicRecordCompletion({ sectionStatus: "in_progress", grade: "A" }),
    ).toBe("completed");
  });
});

describe("classifySectionHeader", () => {
  it("recognizes In Progress headers", () => {
    expect(classifySectionHeader("IN PROGRESS - FALL 2025-2026")).toBe("in_progress");
  });

  it("recognizes Withdrawn/Dropped/Planned/Registered headers as not_completed", () => {
    expect(classifySectionHeader("WITHDRAWN")).toBe("not_completed");
    expect(classifySectionHeader("DROPPED COURSES")).toBe("not_completed");
    expect(classifySectionHeader("PLANNED")).toBe("not_completed");
    expect(classifySectionHeader("REGISTERED")).toBe("not_completed");
  });

  it("never lets 'Not Completed' be mistaken for 'Completed'", () => {
    expect(classifySectionHeader("NOT COMPLETED")).toBe("not_completed");
  });

  it("recognizes transfer/AP/IB/test credit headers", () => {
    expect(classifySectionHeader("TRANSFER CREDIT")).toBe("transfer_credit");
    expect(classifySectionHeader("AP/IB CREDIT")).toBe("transfer_credit");
    expect(classifySectionHeader("ADVANCED PLACEMENT")).toBe("transfer_credit");
  });

  it("recognizes a bare term header as a completed term", () => {
    expect(classifySectionHeader("FALL 2022-2023")).toBe("completed_term");
  });

  it("recognizes generic 'Completed' headers", () => {
    expect(classifySectionHeader("COMPLETED COURSES")).toBe("completed_term");
  });

  it("returns null for a line that isn't a section header at all", () => {
    expect(classifySectionHeader("CSCI 10 INTRO TO COMPUTING 4.00 A")).toBeNull();
  });
});

describe("classifyRowStatusText", () => {
  it("overrides to in_progress when the row itself says so", () => {
    expect(classifyRowStatusText("IN PROGRESS")).toBe("in_progress");
  });

  it("overrides to not_completed for withdrawn/dropped/planned/registered rows", () => {
    expect(classifyRowStatusText("WITHDRAWN")).toBe("not_completed");
  });

  it("returns null when the row text carries no status signal", () => {
    expect(classifyRowStatusText("CSCI 10")).toBeNull();
  });
});
