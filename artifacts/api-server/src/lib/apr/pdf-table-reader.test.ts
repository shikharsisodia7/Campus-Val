import { describe, it, expect } from "vitest";
import { buildAprPdf, PDF_COLUMN_X } from "../../__fixtures__/apr/build-pdf";
import { FIXTURE_PROGRAMS, FIXTURE_PRIVATE_MARKERS } from "../../__fixtures__/apr/build-workbooks";
import { readAprPdf } from "./pdf-table-reader";
import { projectForSidebar } from "./sidebar-projection";
import { AprImportError, type AprWorkbook } from "./workbook-model";

const text = (cell: string | number | null) => (cell === null ? "" : String(cell));

/** The rows that sit inside a table, as seven strings each. */
function tableRows(workbook: AprWorkbook): string[][] {
  const out: string[][] = [];
  let inTable = false;
  for (const row of workbook.sheets[0]!.rows) {
    if (row.cells.some((c) => c.bold)) {
      inTable = true;
      continue;
    }
    const value = row.cells.find((c) => c.c === 1)?.text;
    const lead = row.cells.every((c) => c.c <= 1) && row.cells.some((c) => c.c === 0);
    if (lead && (value === undefined || /\d/.test(value))) {
      inTable = false;
      continue;
    }
    if (inTable) out.push([0, 1, 2, 3, 4, 5, 6].map((c) => row.cells.find((x) => x.c === c)?.text ?? ""));
  }
  return out;
}

async function code(buf: Buffer): Promise<string> {
  try {
    await readAprPdf(buf);
  } catch (err) {
    if (err instanceof AprImportError) return err.code;
    throw err;
  }
  return "read";
}

describe("readAprPdf — the table is recovered from where the text sits", () => {
  it("recovers every cell of every row, in order", async () => {
    const workbook = await readAprPdf(buildAprPdf());
    const expected = FIXTURE_PROGRAMS.flatMap((p) => p.rows.map((r) => r.map(text)));
    expect(tableRows(workbook)).toEqual(expected);
  });

  it("joins wrapped lines back into one cell and keeps rows apart", async () => {
    const rows = tableRows(await readAprPdf(buildAprPdf()));
    // Three wrapped lines in the PDF, one cell here.
    expect(rows[0]![0]).toBe("University Requirement: Must have a minimum 2.000 Cumulative GPA");
    // A further registration under the same requirement is its own row with an empty requirement cell.
    expect(rows[2]).toEqual(["", "", "", "ECON 2 - Principles of Macroeconomics (Transfer Credit)", "", "4.5", "CR"]);
  });

  it("splits a requirement and status that the PDF stores as ONE piece of text", async () => {
    const fused = buildAprPdf({ fuseFirstStatus: true });
    // One text object in the file holds both cells.
    expect(fused.toString("latin1")).toMatch(/\[\(Healthcare Innovation Minor GPA \) -?\d+ \(Satisfied\)\] TJ/);
    const rows = tableRows(await readAprPdf(fused));
    expect(rows).toContainEqual(["Healthcare Innovation Minor GPA", "Satisfied", "", "", "", "", ""]);
    expect(rows).toContainEqual(["Mathematics Major GPA", "Satisfied", "", "", "", "", ""]);
    expect(rows).toEqual(FIXTURE_PROGRAMS.flatMap((p) => p.rows.map((r) => r.map(text))));
  });

  it("follows a table across pages and drops the page chrome", async () => {
    const programs = [1, 2, 3].flatMap((n) => FIXTURE_PROGRAMS.map((p) => ({ ...p, title: `${n} ${p.title}` })));
    const pdf = buildAprPdf({ programs, fuseFirstStatus: true });
    expect((pdf.toString("latin1").match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(2);
    const workbook = await readAprPdf(pdf);
    expect(tableRows(workbook)).toEqual(programs.flatMap((p) => p.rows.map((r) => r.map(text))));
    const all = JSON.stringify(workbook);
    expect(all).not.toMatch(/Page \d+ of \d+|09:05 AM|01\/15\/2027/);
    // The header is emitted once per program block, not once per page.
    const headers = workbook.sheets[0]!.rows.filter((r) => r.cells.some((c) => c.text === "Requirement" && c.bold));
    expect(headers).toHaveLength(programs.length);
  });

  it("keeps each block's title and summary lines, as label and value", async () => {
    const workbook = await readAprPdf(buildAprPdf());
    const lead = workbook.sheets[0]!.rows.map((r) => r.cells.map((c) => c.text));
    expect(lead).toContainEqual(["Finance Major Requirements"]);
    expect(lead).toContainEqual(["Program of Study GPA", "3.000"]);
    expect(lead).toContainEqual(["Requirements Not Assigned", "2"]);
    expect(lead).toContainEqual(["Cumulative GPA", "3.100"]);
  });

  it("says where it came from", async () => {
    const workbook = await readAprPdf(buildAprPdf());
    expect(workbook.sourceFormat).toBe("pdf");
    expect(workbook.warnings).toEqual(["reconstructed_from_pdf"]);
    expect(workbook.sheets[0]!.merges).toContainEqual(expect.objectContaining({ c: 3, colSpan: 4 }));
  });

  it("is deterministic", async () => {
    const pdf = buildAprPdf({ fuseFirstStatus: true });
    expect(await readAprPdf(pdf)).toEqual(await readAprPdf(pdf));
  });
});

describe("readAprPdf — the sidebar made from a PDF", () => {
  it("has the same blocks and groups as the Excel export, and none of the omitted columns", async () => {
    const projection = projectForSidebar(await readAprPdf(buildAprPdf({ fuseFirstStatus: true })));
    const sheet = projection.sheets[0]!;
    expect(sheet.structured).toBe(true);
    expect(sheet.columns.map((c) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Registrations Used"]);
    expect(sheet.omittedColumns.sort()).toEqual(["Academic Period", "Grade", "Units"]);
    expect(sheet.groups.map((g) => [g.blockIndex, g.block, g.label, g.rows.length])).toEqual([
      [0, "Finance Major Requirements", "University Requirements", 3],
      [0, "Finance Major Requirements", "Core", 4],
      [0, "Finance Major Requirements", "Sample School of Business Core Knowledge", 1],
      [0, "Finance Major Requirements", "Finance Major", 3],
      [1, "Mathematics Major Requirements", "University Requirements", 1],
      [1, "Mathematics Major Requirements", "Core", 2],
      [1, "Mathematics Major Requirements", "Mathematics Major", 4],
      [2, "Healthcare Innovation and Design Minor Requirements", "Healthcare Innovation Minor", 3],
      [3, "Sample Center Requirements", "Special Interest Program", 1],
    ]);
    const payload = JSON.stringify(projection);
    for (const period of FIXTURE_PRIVATE_MARKERS.academicPeriods) expect(payload).not.toContain(period);
    for (const hidden of ["Program of Study GPA", "3.100", "2.800", "Last Evaluated", "Unused Registrations"]) {
      expect(payload, hidden).not.toContain(hidden);
    }
    const cells = sheet.groups.flatMap((g) => g.rows.flatMap((r) => r.cells));
    for (const token of ["A-", "B+", "CR", "4.5", "4", "5"]) expect(cells, token).not.toContain(token);
  });
});

describe("readAprPdf — it refuses rather than guesses", () => {
  it("a PDF without the table header is not read", async () => {
    expect(await code(buildAprPdf({ withoutHeader: true }))).toBe("unrecognized_pdf");
  });

  it("a PDF whose columns do not line up with the header is not read", async () => {
    // Move the four right-hand body columns away from where the header puts
    // them. Text then lands in the wrong columns, and the self-check refuses it.
    const pdf = buildAprPdf().toString("latin1");
    const xs = PDF_COLUMN_X.slice(3).map((x) => x.toFixed(2).replace(".", "\\."));
    const shifted = pdf.replace(new RegExp(`1 0 0 1 (${xs.join("|")}) `, "g"), (_m, x: string) => {
      return `1 0 0 1 ${(Number(x) + 61).toFixed(2)} `;
    });
    expect(shifted).not.toBe(pdf);
    expect(await code(Buffer.from(shifted, "latin1"))).not.toBe("read");
  });

  it("something that is not a PDF, an empty file and a truncated PDF are refused by category", async () => {
    expect(await code(Buffer.from("<html>not a pdf</html>"))).toBe("unsupported_type");
    expect(await code(Buffer.alloc(0))).toBe("empty_workbook");
    expect(await code(buildAprPdf().subarray(0, 400))).not.toBe("read");
  });

  it("an ordinary PDF that is not an Academic Progress report is not read", async () => {
    expect(await code(buildAprPdf({ withoutHeader: true, programs: [] }))).toBe("unrecognized_pdf");
  });
});
