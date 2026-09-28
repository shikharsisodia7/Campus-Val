import { describe, expect, it } from "vitest";
import { calendarYearFor } from "@/lib/academic-year";
import {
  CHECKSHEET_CATEGORY_OPTIONS,
  SCU_CHECKSHEETS_URL,
  TRACKING_STATUS_OPTIONS,
  checksheetCategoryLabel,
  currentAcademicYearAnchor,
  defaultYearForTerm,
  formatUploadDate,
  safeExternalUrl,
  termLabel,
  termShortLabel,
  titleFromFileName,
  trackingStatusLabel,
  trackingYearOptions,
  validateChecksheetFile,
} from "./checksheet-format";

const MB = 1024 * 1024;

describe("the official SCU page", () => {
  it("is the Drahmann advising toolkit's checksheets page", () => {
    expect(SCU_CHECKSHEETS_URL).toBe("https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/");
  });
});

describe("what the student may say a document is", () => {
  it("offers the kinds of department resource, in library order", () => {
    expect(CHECKSHEET_CATEGORY_OPTIONS.map((o) => o.label)).toEqual([
      "Major Checksheet",
      "Minor Checksheet",
      "Four-Year Plan",
      "Flowchart",
      "Department Advising Resource",
      "Other",
    ]);
    expect(checksheetCategoryLabel("flowchart")).toBe("Flowchart");
    expect(checksheetCategoryLabel("something-new")).toBe("Other");
  });
});

describe("status", () => {
  it("is the student's own: no value claims to be official or verified", () => {
    expect(TRACKING_STATUS_OPTIONS.map((o) => o.label)).toEqual(["Not Started", "Planned", "In Progress", "Completed"]);
    const words = JSON.stringify(TRACKING_STATUS_OPTIONS).toLowerCase();
    for (const word of ["official", "verified", "waived", "satisfied", "met"]) expect(words).not.toContain(word);
  });

  it("labels a stored value, and nothing for no value", () => {
    expect(trackingStatusLabel("in_progress")).toBe("In Progress");
    expect(trackingStatusLabel(null)).toBeNull();
    expect(trackingStatusLabel("verified_complete")).toBeNull();
  });
});

describe("quarter", () => {
  it("is shown in full, and short on a marker", () => {
    expect(termLabel("fall", 2026)).toBe("Fall 2026");
    expect(termLabel("winter", 2027)).toBe("Winter 2027");
    expect(termShortLabel("fall", 2026)).toBe("F26");
    expect(termShortLabel("spring", 2027)).toBe("Sp27");
    expect(termShortLabel("summer", 2031)).toBe("Su31");
  });

  it("needs both a term and a year", () => {
    expect(termLabel("fall", null)).toBeNull();
    expect(termLabel(null, 2026)).toBeNull();
    expect(termLabel("autumn", 2026)).toBeNull();
  });

  it("knows the academic year in progress", () => {
    expect(currentAcademicYearAnchor(new Date(2026, 8, 28))).toBe(2026); // late September
    expect(currentAcademicYearAnchor(new Date(2027, 1, 10))).toBe(2026); // February
    expect(currentAcademicYearAnchor(new Date(2027, 5, 30))).toBe(2026); // June
    expect(currentAcademicYearAnchor(new Date(2027, 6, 1))).toBe(2027); // July
  });

  it("offers the year of that quarter in the academic year in progress", () => {
    const september = new Date(2026, 8, 28);
    expect(defaultYearForTerm("fall", september)).toBe(2026);
    expect(defaultYearForTerm("winter", september)).toBe(2027);
    expect(defaultYearForTerm("spring", september)).toBe(2027);
    expect(defaultYearForTerm("summer", september)).toBe(2027);
    // In February of that same academic year the answers are the same.
    expect(defaultYearForTerm("winter", new Date(2027, 1, 10))).toBe(2027);
    expect(defaultYearForTerm("fall", new Date(2027, 1, 10))).toBe(2026);
  });

  it("uses the Degree Plan's own year conversion, not a second one", () => {
    const now = new Date(2026, 8, 28);
    for (const term of ["fall", "winter", "spring", "summer"] as const) {
      expect(defaultYearForTerm(term, now)).toBe(calendarYearFor(term, 2026));
    }
  });

  it("offers past years for completed work and future years for planning", () => {
    const years = trackingYearOptions(new Date(2026, 8, 28));
    expect(years[0]).toBe(2034);
    expect(years[years.length - 1]).toBe(2014);
    expect(years).toContain(2019);
    expect(years).toContain(2031);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  it("always includes a year that is already saved, however old", () => {
    expect(trackingYearOptions(new Date(2026, 8, 28), 2003)).toContain(2003);
  });
});

describe("upload date", () => {
  it("says when the file was uploaded, in words that claim nothing else", () => {
    const text = formatUploadDate("2026-09-28T19:30:00.000Z");
    expect(text).toMatch(/^Uploaded Sep 2[89], 2026$/);
    expect(text).not.toMatch(/official|department|current|version/i);
  });

  it("does not show a broken date", () => {
    expect(formatUploadDate("not a date")).toBe("Upload date unavailable");
  });
});

describe("choosing a file", () => {
  it("accepts each supported format, whatever the case of its extension", () => {
    expect(validateChecksheetFile({ name: "major.pdf", size: 10 }, MB)).toEqual({ contentType: "application/pdf" });
    expect(validateChecksheetFile({ name: "MAJOR.XLSX", size: 10 }, MB)).toEqual({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(validateChecksheetFile({ name: "old.xls", size: 10 }, MB)).toEqual({ contentType: "application/vnd.ms-excel" });
    expect(validateChecksheetFile({ name: "guide.docx", size: 10 }, MB)).toEqual({
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(validateChecksheetFile({ name: "chart.png", size: 10 }, MB)).toEqual({ contentType: "image/png" });
    expect(validateChecksheetFile({ name: "chart.JPEG", size: 10 }, MB)).toEqual({ contentType: "image/jpeg" });
  });

  it("refuses other files with a message that says what to do", () => {
    for (const name of ["page.html", "vector.svg", "notes.txt", "macro.xlsm", "archive.zip", "noextension"]) {
      const result = validateChecksheetFile({ name, size: 10 }, MB);
      expect("error" in result && result.error, name).toMatch(/PDF, Excel/);
    }
    const doc = validateChecksheetFile({ name: "old.doc", size: 10 }, MB);
    expect("error" in doc && doc.error).toMatch(/\.docx or PDF/);
    const gdoc = validateChecksheetFile({ name: "Finance checksheet.gdoc", size: 10 }, MB);
    expect("error" in gdoc && gdoc.error).toMatch(/Download/);
  });

  it("refuses an empty or oversized file", () => {
    expect(validateChecksheetFile({ name: "a.pdf", size: 0 }, MB)).toEqual({ error: "This file is empty." });
    expect(validateChecksheetFile({ name: "a.pdf", size: 21 * MB }, 20 * MB)).toEqual({
      error: "File exceeds the 20 MB limit.",
    });
    expect(validateChecksheetFile({ name: "a.pdf", size: 20 * MB }, 20 * MB)).toEqual({ contentType: "application/pdf" });
  });
});

describe("a starting title", () => {
  it("tidies the file name and reads nothing into it", () => {
    expect(titleFromFileName("finance_major-checksheet_2025-26.pdf")).toBe("finance major checksheet 2025 26");
    expect(titleFromFileName("Computer Science Major.xlsx")).toBe("Computer Science Major");
    expect(titleFromFileName("x".repeat(300) + ".pdf")).toHaveLength(120);
  });
});

describe("links", () => {
  it("only plain web addresses become links", () => {
    expect(safeExternalUrl("https://www.scu.edu/x")).toBe("https://www.scu.edu/x");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///c:/x", "not a url", "", null, undefined]) {
      expect(safeExternalUrl(bad), String(bad)).toBeNull();
    }
  });
});
