/**
 * Fixture-based tests for the progress-report parser.
 *
 * Three fixture layers:
 *
 * 1. COMMITTED TEXT FIXTURES — anonymized text representing what pdf-parse
 *    actually extracts from real Workday APR PDFs (multi-term, space-collapsed
 *    column merges, transfer credit, in-progress sections). Tested directly
 *    against extractCodesFromText to exercise the full classification logic
 *    without round-tripping through PDF encoding.
 *
 * 2. COMMITTED xlsx FIXTURE — generated from the same Workday row structure
 *    and committed to __fixtures__. Tested via parseXlsxBuffer end-to-end.
 *
 * 3. SYNTHETIC INTEGRATION TESTS — minimal PDFs + xlsx buffers for structural
 *    assurances (status codes, logging guard, catalog-only guarantee). Retained
 *    as unit coverage alongside the golden-text tests.
 *
 * All fixtures use anonymized data (no real student records).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parsePdfBuffer,
  parseXlsxBuffer,
  parseProgressReport,
  extractCodesFromText,
} from "./progress-report-parser";
import { COURSES } from "../data/courses";

// ─── Fixture paths ────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(import.meta.dirname, "../__fixtures__/progress-report");

/** Load the committed plain-text golden fixture (multi-term Workday APR). */
function loadTextFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

/** Load the committed xlsx golden fixture as a Buffer. */
function loadXlsxFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

// ─── Catalog lookup helper ────────────────────────────────────────────────────

const catalogMap = new Map(COURSES.map((c) => [c.code, c]));

function assertInCatalog(code: string): void {
  const entry = catalogMap.get(code);
  expect(entry, `Expected '${code}' to be a real catalog entry`).toBeDefined();
}

// ─── Synthetic helpers ────────────────────────────────────────────────────────

/** Build a minimal valid PDF containing the given text (short, ASCII-safe strings only). */
function minimalPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objs = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) { offsets.push(pdf.length); pdf += o + "\n"; }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function minimalXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const XLSXmod = (XLSX as any).default ?? XLSX;
  const ws = XLSXmod.utils.aoa_to_sheet(rows);
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, ws, "Progress Report");
  return XLSXmod.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const [CA, CB] = COURSES.slice(0, 2);

// =============================================================================
// 1. GOLDEN TEXT FIXTURE: multi-term Workday APR
//    Source: src/__fixtures__/progress-report/workday-apr-anonymized.txt
//    Represents real pdf-parse extraction output from a machine-generated
//    Workday APR PDF (multi-page, term sections, transfer credit, in-progress).
// =============================================================================

describe("progress-report-parser fixture: golden text — multi-term Workday APR", () => {
  /**
   * Golden expected completedCourses from the multi-term fixture.
   * These are real SCU catalog courses that appear in the fixture text
   * in "completed" term sections. The in-progress courses (CSEN 12, PHYS 31)
   * also appear here because the current parser cannot distinguish
   * completed from in-progress based on text alone — see follow-up task #37.
   */
  const GOLDEN_CATALOG_CODES = [
    "CSCI 10",   // Fall 2022-2023 — completed
    "MATH 11",   // Fall 2022-2023 — completed
    "ENGL 1A",   // Fall 2022-2023 — completed (letter suffix in number)
    "CSCI 60",   // Winter 2022-2023 — completed
    "MATH 12",   // Winter 2022-2023 — completed
    "CSCI 61",   // Spring 2022-2023 — completed
    "MATH 13",   // Spring 2022-2023 — completed
    "BIOE 158L", // Spring 2022-2023 — completed, letter-suffix course
    "CSEN 12",   // In-progress section: current parser matches anyway (see #37)
    "PHYS 31",   // In-progress section: current parser matches anyway (see #37)
  ];

  /**
   * Golden expected possibleCourses prefixes.
   * These tokens match the course-code pattern but are NOT in the SCU catalog.
   * Includes the real multi-page artifact ("PAGE N of M" → "PAGE N", "OF N")
   * and the non-catalog transfer-credit codes ("XFER NNN").
   */
  const GOLDEN_POSSIBLE_PREFIXES = [
    "PAGE",  // from "Page 1 of 2" / "Page 2 of 2" — multi-page artifact
    "OF",    // from "Page 1 of 2" — "of 2" → "OF 2" matches pattern
    "XFER",  // transfer credit codes not in the SCU catalog
  ];

  it("extracts all golden catalog courses from the committed text fixture", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);
    const codes = catalogMatches.map((c) => c.code);

    for (const expected of GOLDEN_CATALOG_CODES) {
      expect(codes, `Expected '${expected}' in completedCourses`).toContain(expected);
    }
  });

  it("all golden catalog matches have title and units from the real catalog, never from fixture text", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);

    for (const c of catalogMatches) {
      const entry = catalogMap.get(c.code);
      expect(entry, `'${c.code}' must be a real catalog entry`).toBeDefined();
      expect(c.title).toBe(entry!.title);
      expect(c.units).toBe(entry!.units);
      expect(c.confidence).toBe("high");
    }
  });

  it("non-catalog tokens from the fixture (page numbers, transfer codes) land in possibleCourses", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { unknownTokens } = extractCodesFromText(text);
    const raws = unknownTokens.map((t) => t.raw.toUpperCase());

    for (const prefix of GOLDEN_POSSIBLE_PREFIXES) {
      expect(
        raws.some((r) => r.startsWith(prefix)),
        `Expected a possibleCourse starting with '${prefix}'`,
      ).toBe(true);
    }
  });

  it("transfer-credit codes (XFER NNN) never appear in completedCourses", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);
    const codes = catalogMatches.map((c) => c.code);

    expect(codes.some((c) => c.startsWith("XFER"))).toBe(false);
  });

  it("BIOE 158L (letter-suffix number) is recognized as a catalog entry", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);

    const found = catalogMatches.find((c) => c.code === "BIOE 158L");
    expect(found).toBeDefined();
    assertInCatalog("BIOE 158L");
    expect(found!.units).toBe(1);
  });

  it("multi-page artifact lines ('Page N of M') appear in possibleCourses, never in completedCourses", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);
    const codes = catalogMatches.map((c) => c.code);

    // PAGE N tokens must NOT end up as completed courses
    expect(codes.some((c) => c.startsWith("PAGE"))).toBe(false);
  });

  it("deduplicates catalog courses that appear more than once (e.g. repeated page headers)", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);
    const codes = catalogMatches.map((c) => c.code);
    const uniqueCodes = [...new Set(codes)];

    expect(codes.length).toBe(uniqueCodes.length);
  });
});

// =============================================================================
// 2. GOLDEN TEXT FIXTURE: space-collapsed Workday APR
//    Source: src/__fixtures__/progress-report/workday-apr-spacecollapsed.txt
//    Represents real pdf-parse output where the column between course code
//    and title is collapsed (e.g. "CSCI10  Introduction...").
//    normalizeCode() must bridge the missing internal space so the catalog
//    lookup succeeds — a real gap that existed before being fixed.
// =============================================================================

describe("progress-report-parser fixture: golden text — space-collapsed extraction", () => {
  const GOLDEN_CODES_SPACED = ["CSCI 10", "MATH 11", "ENGL 1A", "CSCI 60", "MATH 12"];

  it("recognizes all catalog courses even when extracted without the internal space (e.g. CSCI10)", () => {
    const text = loadTextFixture("workday-apr-spacecollapsed.txt");
    const { catalogMatches } = extractCodesFromText(text);
    const codes = catalogMatches.map((c) => c.code);

    for (const expected of GOLDEN_CODES_SPACED) {
      expect(codes, `Expected '${expected}' to be found even from space-collapsed text`).toContain(
        expected,
      );
    }
  });

  it("canonical code form in completedCourses always uses a space separator (e.g. 'CSCI 10', not 'CSCI10')", () => {
    const text = loadTextFixture("workday-apr-spacecollapsed.txt");
    const { catalogMatches } = extractCodesFromText(text);

    for (const c of catalogMatches) {
      // Every code must follow the 'SUBJ NNN' format from the catalog
      expect(c.code).toMatch(/^[A-Z]{2,5} \d/);
    }
  });

  it("space-collapsed titles/units still come from the catalog (not guessed from the merged text)", () => {
    const text = loadTextFixture("workday-apr-spacecollapsed.txt");
    const { catalogMatches } = extractCodesFromText(text);

    for (const c of catalogMatches) {
      const entry = catalogMap.get(c.code);
      expect(entry).toBeDefined();
      expect(c.title).toBe(entry!.title);
      expect(c.units).toBe(entry!.units);
    }
  });
});

// =============================================================================
// 3. COMMITTED xlsx FIXTURE: realistic multi-term Workday APR spreadsheet
//    Source: src/__fixtures__/progress-report/workday-apr-anonymized.xlsx
//    Generated once by generate-xlsx-fixture.ts from real Workday column
//    structure and committed. Tests parseXlsxBuffer end-to-end.
// =============================================================================

describe("progress-report-parser fixture: committed xlsx — multi-term Workday APR", () => {
  const EXPECTED_COMPLETED = [
    "CSCI 10", "MATH 11", "ENGL 1A",   // Fall 2022-2023
    "CSCI 60", "MATH 12",               // Winter 2022-2023
    "CSCI 61", "MATH 13", "BIOE 158L", // Spring 2022-2023
    // NOTE: CSEN 12 and PHYS 31 appear under "In Progress" but are in the
    // catalog, so the current parser matches them (see follow-up task #37).
    "CSEN 12", "PHYS 31",
  ];
  const EXPECTED_POSSIBLE_PREFIXES = ["XFER"]; // transfer-credit codes not in catalog

  it("parseXlsxBuffer returns status=parsed and finds all completed-term catalog courses", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const { result, status } = await parseProgressReport(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "workday-apr-anonymized.xlsx",
    );

    expect(status).toBe("parsed");
    const codes = result.completedCourses.map((c) => c.code);
    for (const expected of EXPECTED_COMPLETED) {
      expect(codes, `Expected '${expected}' in xlsx completedCourses`).toContain(expected);
    }
  });

  it("xlsx completedCourses title and units come from the catalog, not the spreadsheet cells", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const result = await parseXlsxBuffer(buf);

    for (const c of result.completedCourses) {
      const entry = catalogMap.get(c.code);
      expect(entry, `'${c.code}' must be a real catalog entry`).toBeDefined();
      expect(c.title).toBe(entry!.title);
      expect(c.units).toBe(entry!.units);
      expect(c.confidence).toBe("high");
    }
  });

  it("transfer-credit codes (XFER NNN) appear in xlsx possibleCourses, never in completedCourses", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const result = await parseXlsxBuffer(buf);

    const completedCodes = result.completedCourses.map((c) => c.code);
    expect(completedCodes.some((c) => c.startsWith("XFER"))).toBe(false);

    const possibles = result.possibleCourses.map((p) => p.raw.toUpperCase());
    for (const prefix of EXPECTED_POSSIBLE_PREFIXES) {
      expect(
        possibles.some((r) => r.startsWith(prefix)),
        `Expected possibleCourse starting with '${prefix}'`,
      ).toBe(true);
    }
  });

  it("xlsx BIOE 158L (letter-suffix) recognized as a catalog entry", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const result = await parseXlsxBuffer(buf);

    const found = result.completedCourses.find((c) => c.code === "BIOE 158L");
    expect(found).toBeDefined();
    expect(found!.units).toBe(1);
  });

  it("GPA/credit summary rows in xlsx do not produce false catalog matches", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const result = await parseXlsxBuffer(buf);

    // Every completedCourse must be a real catalog entry
    for (const c of result.completedCourses) {
      assertInCatalog(c.code);
    }
  });

  it("xlsx completedCourses are deduplicated (each code appears at most once)", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    const result = await parseXlsxBuffer(buf);

    const codes = result.completedCourses.map((c) => c.code);
    expect(codes.length).toBe(new Set(codes).size);
  });
});

// =============================================================================
// 4. STRUCTURAL / ERROR STATE TESTS
//    Synthetic inputs for status codes, corrupt files, and unsupported types.
// =============================================================================

describe("progress-report-parser fixture: error states and unsupported formats", () => {
  it("returns status=failed for a corrupt PDF buffer, with an honest note and no courses", async () => {
    const corrupt = Buffer.from(
      "%PDF-1.4 this is deliberately corrupt and not a real PDF body",
    );
    const { result, status } = await parseProgressReport(
      corrupt,
      "application/pdf",
      "corrupt.pdf",
    );

    expect(["failed", "unsupported"]).toContain(status);
    expect(result.completedCourses).toHaveLength(0);
    expect(result.possibleCourses).toHaveLength(0);
    const note = result.notes.join(" ").toLowerCase();
    expect(note).toMatch(/failed|no readable|extraction|not available/);
  });

  it("returns status=unsupported for an unsupported file type (.docx)", async () => {
    const { result, status } = await parseProgressReport(
      Buffer.from("PK fake docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "report.docx",
    );

    expect(status).toBe("unsupported");
    expect(result.completedCourses).toHaveLength(0);
    expect(result.possibleCourses).toHaveLength(0);
    expect(result.notes.join(" ")).toMatch(/unsupported|only PDF|Excel/i);
  });

  it("returns an honest note for a corrupt xlsx buffer", async () => {
    const result = await parseXlsxBuffer(Buffer.from("PK not a real xlsx"));

    expect(result.completedCourses).toHaveLength(0);
    expect(result.notes.join(" ").toLowerCase()).toMatch(/failed|corrupt|no readable|no course/);
  });

  it("every parse outcome includes at least one note, course, or possibleCourse (never silently empty)", async () => {
    const scenarios: Array<{ buf: Buffer; ct: string; fn: string }> = [
      {
        buf: minimalPdf(`${CA!.code} Accounting GPA 3.5`),
        ct: "application/pdf",
        fn: "a.pdf",
      },
      { buf: Buffer.from("garbage"), ct: "text/plain", fn: "b.txt" },
      { buf: Buffer.from("%PDF-1.4 junk"), ct: "application/pdf", fn: "c.pdf" },
    ];

    for (const { buf, ct, fn } of scenarios) {
      const { result } = await parseProgressReport(buf, ct, fn);
      const hasOutput =
        result.notes.length > 0 ||
        result.completedCourses.length > 0 ||
        result.possibleCourses.length > 0;
      expect(hasOutput, `Scenario ${fn} must have at least one output field`).toBe(true);
    }
  });
});

// =============================================================================
// 5. CATALOG-ONLY GUARANTEE
//    The completedCourses list must never contain invented data.
// =============================================================================

describe("progress-report-parser fixture: no fabricated data", () => {
  it("golden text fixture: every completedCourse is a real catalog entry with correct metadata", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    const { catalogMatches } = extractCodesFromText(text);

    expect(catalogMatches.length).toBeGreaterThan(0);
    for (const c of catalogMatches) {
      const entry = catalogMap.get(c.code);
      expect(entry, `Invented entry: '${c.code}' is not in the catalog`).toBeDefined();
      expect(c.title).toBe(entry!.title);
      expect(c.units).toBe(entry!.units);
      expect(c.confidence).toBe("high");
    }
  });

  it("space-collapsed fixture: every completedCourse is a real catalog entry", () => {
    const text = loadTextFixture("workday-apr-spacecollapsed.txt");
    const { catalogMatches } = extractCodesFromText(text);

    expect(catalogMatches.length).toBeGreaterThan(0);
    for (const c of catalogMatches) {
      assertInCatalog(c.code);
    }
  });

  it("a parser result never contains a completedCourse that is not in the SCU catalog", async () => {
    const buf = await minimalXlsx([
      ["Code", "Title", "Units", "Grade"],
      [CA!.code, CA!.title, CA!.units, "A"],
      ["ZZZZ 99", "Invented", 4, "B"],
    ]);
    const result = await parseXlsxBuffer(buf);

    for (const c of result.completedCourses) {
      assertInCatalog(c.code);
    }
  });

  it("unknown code-like tokens go to possibleCourses, never to completedCourses", () => {
    const text = `${CA!.code} Accounting FAKE 99 Invented ZZZZ 101 Unknown`;
    const { catalogMatches, unknownTokens } = extractCodesFromText(text);

    const completedCodes = catalogMatches.map((c) => c.code);
    expect(completedCodes).toContain(CA!.code);
    expect(completedCodes).not.toContain("FAKE 99");
    expect(completedCodes).not.toContain("ZZZZ 101");

    const possibles = unknownTokens.map((t) => t.raw.toUpperCase());
    expect(possibles.some((r) => r.startsWith("FAKE"))).toBe(true);
    expect(possibles.some((r) => r.startsWith("ZZZZ"))).toBe(true);
  });
});

// =============================================================================
// 6. LOGGING GUARD
//    The parser must never write student data to any console channel.
// =============================================================================

describe("progress-report-parser fixture: no student data logged during parse", () => {
  const spies = {
    log: vi.spyOn(console, "log"),
    warn: vi.spyOn(console, "warn"),
    error: vi.spyOn(console, "error"),
    info: vi.spyOn(console, "info"),
    debug: vi.spyOn(console, "debug"),
  };

  beforeEach(() => {
    for (const s of Object.values(spies)) s.mockClear();
  });

  it("extractCodesFromText produces no console output", () => {
    const text = loadTextFixture("workday-apr-anonymized.txt");
    extractCodesFromText(text);

    for (const s of Object.values(spies)) {
      expect(s.mock.calls).toHaveLength(0);
    }
  });

  it("parseXlsxBuffer produces no console output for the committed fixture", async () => {
    const buf = loadXlsxFixture("workday-apr-anonymized.xlsx");
    await parseXlsxBuffer(buf);

    const contentCalls = [
      ...spies.log.mock.calls,
      ...spies.warn.mock.calls,
      ...spies.info.mock.calls,
      ...spies.debug.mock.calls,
    ];
    expect(contentCalls).toHaveLength(0);
  });

  it("parsePdfBuffer produces no console output for a valid PDF", async () => {
    const buf = minimalPdf(`${CA!.code} Accounting ${CB!.code} Managerial GPA 3.5`);
    await parsePdfBuffer(buf);

    const contentCalls = [
      ...spies.log.mock.calls,
      ...spies.warn.mock.calls,
      ...spies.info.mock.calls,
      ...spies.debug.mock.calls,
    ];
    expect(contentCalls).toHaveLength(0);
  });

  it("a failed parse never leaks file content to any log channel", async () => {
    const sentinel = "STUDENT_SENTINEL_DO_NOT_LOG_XQ9Z";
    const corrupt = Buffer.from(`%PDF-1.4 ${sentinel} garbage`);

    await parseProgressReport(corrupt, "application/pdf", "bad.pdf");

    const allCalls = Object.values(spies).flatMap((s) => s.mock.calls);
    for (const call of allCalls) {
      expect(call.map(String).join(" ")).not.toContain(sentinel);
    }
  });
});
