/**
 * The harness that checks an APR export was read completely. It must find what
 * is wrong with a file, and must never repeat what a file says.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildAprFixture, FIXTURE_PRIVATE_MARKERS, type AprFixtureName } from "../../__fixtures__/apr/build-workbooks";
import { buildAprPdf } from "../../__fixtures__/apr/build-pdf";
import { verifyAprExport } from "./verify-export";

describe("verifying an APR export", () => {
  it("reports a complete read of a Workday-style workbook: every row kept, grades withheld", async () => {
    const report = await verifyAprExport(await buildAprFixture("finance-major"), "xlsx");
    expect(report.ok).toBe(true);
    expect(report.error).toBeNull();
    const [sheet] = report.sheets;
    expect(sheet!.rowsInFile).toBe(sheet!.rowsKept);
    expect(sheet!.rowsNotKept).toBe(0);
    expect(sheet!.sidebarRecognised).toBe(true);
    expect(sheet!.sidebarColumns).toEqual(["requirement", "status", "remaining", "satisfied with"]);
    expect(sheet!.withheldColumns).toEqual(["academic period", "units", "grade"]);
    expect(sheet!.groups.university).toBe(1);
    expect(sheet!.groups.core).toBe(1);
    expect(sheet!.sidebarRows).toBeGreaterThan(5);
    expect(report.findings).toEqual([]);
  });

  it("keeps program blocks apart in a combined export", async () => {
    const report = await verifyAprExport(await buildAprFixture("workday-combined"), "xlsx");
    expect(report.ok).toBe(true);
    expect(report.sheets[0]!.programBlocks).toBeGreaterThan(1);
    expect(report.sheets[0]!.rowsNotKept).toBe(0);
  });

  it("says so when Workday's table is not recognised, and still counts every row", async () => {
    const report = await verifyAprExport(await buildAprFixture("unrecognized-layout"), "xlsx");
    expect(report.sheets[0]!.sidebarRecognised).toBe(false);
    expect(report.sheets[0]!.rowsNotKept).toBe(0);
    expect(report.findings.join(" ")).toMatch(/header was not found/);
  });

  it("counts formulas and the ones with no stored result", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("APR");
    ws.addRow(["Requirement", "Status", "Units", "Grade"]);
    ws.addRow(["Core: Widget Ethics", "Satisfied", { formula: "SUM(C5:C9)", result: 0 }, "A-"]);
    ws.addRow(["Core: Widget History", "In Progress", { formula: "SUM(C5:C9)" }, null]);
    const report = await verifyAprExport(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    expect(report.formulas).toEqual({ total: 2, withStoredResult: 1, withoutStoredResult: 1 });
    expect(report.findings.join(" ")).toMatch(/1 formula cell\(s\) carry no stored result/);
    expect(report.warnings).toContain("formula_without_cached_value");
  });

  it("reports a file that cannot be imported by its category", async () => {
    expect(await verifyAprExport(Buffer.from("not a workbook"), "xlsx")).toMatchObject({ ok: false, error: "not_a_workbook", sheets: [] });
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)]);
    expect((await verifyAprExport(ole, "xlsx")).error).toBe("legacy_xls_or_encrypted");
  });

  it("verifies a PDF export", async () => {
    const report = await verifyAprExport(buildAprPdf(), "pdf");
    expect(report.error).toBeNull();
    expect(report.sheets[0]!.sidebarRecognised).toBe(true);
    expect(report.sheets[0]!.withheldColumns).toContain("grade");
    expect(report.sheets[0]!.rowsInFile).toBeNull();
  });

  it("NEVER repeats what the file says: no requirement, course, period, unit or grade", async () => {
    const names: AprFixtureName[] = ["finance-major", "computer-science-major", "data-science-minor", "workday-combined", "two-row-header", "hostile-content"];
    for (const name of names) {
      const text = JSON.stringify(await verifyAprExport(await buildAprFixture(name), "xlsx"));
      for (const marker of [...FIXTURE_PRIVATE_MARKERS.academicPeriods, ...FIXTURE_PRIVATE_MARKERS.grades]) {
        expect(text, `${name}: ${marker}`).not.toContain(`"${marker}"`);
        expect(text, `${name}: ${marker}`).not.toContain(`${marker} `);
      }
      expect(text, name).not.toMatch(/FNCE|CSCI|ENGL|HIST|Finance|Corporate|Sample School|<script|onerror/i);
    }
  });

  it("reports a header it does not know as (other), never by its text", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("APR");
    ws.addRow(["Requirement", "Status", "Advisor Jane Doe said", "Grade"]);
    ws.addRow(["Core: Widget Ethics", "Satisfied", "see me", "A-"]);
    const report = await verifyAprExport(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    expect(report.sheets[0]!.sidebarColumns).toEqual(["requirement", "status", "(other)"]);
    expect(JSON.stringify(report)).not.toMatch(/Jane|see me/);
  });
});
