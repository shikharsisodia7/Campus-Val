import { describe, it, expect } from "vitest";
import { validateAprFile } from "./UploadZone";
import { formatUploadDate, PDF_TYPE, XLSX_TYPE } from "./apr-format";

const MAX = 10 * 1024 * 1024;

describe("validateAprFile", () => {
  it("accepts the Workday Excel export, whatever type the browser reports", () => {
    expect(validateAprFile({ name: "View_My_Academic_Progress.xlsx", size: 9000, type: XLSX_TYPE }, MAX)).toEqual({
      contentType: XLSX_TYPE,
    });
    expect(validateAprFile({ name: "APR.XLSX", size: 9000, type: "" }, MAX)).toEqual({ contentType: XLSX_TYPE });
  });

  it("accepts a PDF as an original", () => {
    expect(validateAprFile({ name: "apr.pdf", size: 9000, type: PDF_TYPE }, MAX)).toEqual({ contentType: PDF_TYPE });
  });

  it("explains how to fix a legacy .xls", () => {
    const result = validateAprFile({ name: "apr.xls", size: 9000, type: "application/vnd.ms-excel" }, MAX);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/\.xlsx/);
  });

  it("rejects other types, empty files and oversized files", () => {
    for (const name of ["apr.csv", "apr.xlsm", "apr.docx", "apr", "apr.xlsx.exe"]) {
      expect(validateAprFile({ name, size: 10, type: "" }, MAX), name).toHaveProperty("error");
    }
    expect(validateAprFile({ name: "a.xlsx", size: 0, type: XLSX_TYPE }, MAX)).toHaveProperty("error");
    expect(validateAprFile({ name: "a.xlsx", size: 2 * 1024 * 1024, type: XLSX_TYPE }, 1024 * 1024)).toEqual({
      error: "File exceeds the 1 MB limit.",
    });
  });
});

describe("formatUploadDate", () => {
  it("says Uploaded, with a plain date", () => {
    expect(formatUploadDate("2026-09-26T19:30:00.000Z")).toBe("Uploaded Sep 26, 2026");
    expect(formatUploadDate("not a date")).toBe("Upload date unavailable");
  });
});
