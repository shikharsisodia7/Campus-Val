/**
 * SYNTHETIC Degree Checksheet documents for tests and local QA.
 *
 * Every program, course and requirement here is invented ("Applied Widgetry",
 * "WIDG 101"). No real department document and no real student's file is, or
 * may be, committed. The LAYOUTS follow what departments publish: a table with
 * a header row and empty "Status" / "Quarter Completed" columns for the
 * student, a PDF with blank check spaces, a flowchart picture, a Word guide.
 *
 * Everything is built in memory so the tests need no binary files:
 *   await buildChecksheetFixture("major-workbook") -> Buffer
 * and `pnpm --filter @workspace/api-server exec tsx
 * src/__fixtures__/checksheets/write-fixtures.ts <dir>` writes them to disk for
 * browser QA.
 */
import { deflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export type ChecksheetFixtureName =
  | "major-workbook"
  | "major-workbook-extended"
  | "major-workbook-reworded"
  | "second-major-workbook"
  | "minor-workbook"
  | "official-status-workbook"
  | "no-header-workbook"
  | "major-pdf"
  | "major-pdf-revised"
  | "four-year-plan-pdf"
  | "flowchart-png"
  | "flowchart-jpg"
  | "advising-docx"
  | "hostile-docx";

type Cell = string | number | null;

export const CHECKSHEET_HEADER: Cell[] = ["Requirement", "Course", "Status", "Quarter Completed", "Notes"];

/** Rows of the synthetic major checksheet. Column C and D are left for the student. */
export const MAJOR_ROWS: Cell[][] = [
  ["Lower Division", null, null, null, null],
  ["Introduction to Widgetry", "WIDG 101", null, null, "Recommended first course"],
  ["Widget Mathematics I", "WIDG 111", null, null, "Prerequisite for WIDG 112"],
  ["Widget Mathematics II", "WIDG 112", null, null, null],
  ["Upper Division", null, null, null, null],
  ["Widget Design Studio", "WIDG 120", null, null, "Offered fall only"],
  ["Widget Ethics", "WIDG 130", null, null, "Also satisfies a sample Core area"],
  ["Senior Widget Capstone", "WIDG 190", null, null, "Senior standing required"],
];

const SECOND_MAJOR_ROWS: Cell[][] = [
  ["Gadget Foundations", "GADG 10", null, null, null],
  ["Gadget Systems", "GADG 20", null, null, "Take after GADG 10"],
  ["Gadget Seminar", "GADG 150", null, null, null],
];

const MINOR_ROWS: Cell[][] = [
  ["Sprocket Basics", "SPRK 1", null, null, null],
  ["Sprocket Methods", "SPRK 2", null, null, null],
  ["One upper-division elective", "SPRK 100-199", null, null, "See department list"],
];

interface SheetSpec {
  name: string;
  title: string;
  header: Cell[] | null;
  rows: Cell[][];
}

async function workbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name);
    ws.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 34 }];
    const title = ws.addRow([spec.title]);
    title.font = { bold: true, size: 14 };
    ws.mergeCells(title.number, 1, title.number, 5);
    ws.addRow([]);
    if (spec.header) {
      const header = ws.addRow(spec.header);
      header.font = { bold: true };
      header.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });
    }
    for (const cells of spec.rows) {
      const row = ws.addRow(cells);
      // A section heading: one bold cell.
      if (cells.filter((c) => c !== null).length === 1) row.font = { bold: true };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const escapePdf = (text: string) => text.replace(/([\\()])/g, "\\$1");

/** A minimal, valid PDF: Letter pages of left-aligned Helvetica lines. */
export function buildTextPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const tree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const text = lines
      .map((line, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 54 ${740 - i * 22} Td (${escapePdf(line)}) Tj ET`)
      .join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const MAJOR_PDF_PAGE_1 = [
  "Applied Widgetry Major Checksheet (sample)",
  "Requirements effective for students entering Fall 2025 and later",
  "",
  "[  ]  WIDG 101  Introduction to Widgetry          Quarter: ______",
  "[  ]  WIDG 111  Widget Mathematics I              Quarter: ______",
  "[  ]  WIDG 112  Widget Mathematics II             Quarter: ______",
  "Note: WIDG 111 is a prerequisite for WIDG 112.",
];
const MAJOR_PDF_PAGE_2 = [
  "Upper Division",
  "",
  "[  ]  WIDG 120  Widget Design Studio              Quarter: ______",
  "[  ]  WIDG 130  Widget Ethics                     Quarter: ______",
  "[  ]  WIDG 190  Senior Widget Capstone            Quarter: ______",
];

// ─── pictures ────────────────────────────────────────────────────────────────

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real PNG: boxes joined by lines on a white page, like a course flowchart. */
export function buildFlowchartPng(width = 640, height = 420): Buffer {
  const boxes = [
    { x: 40, y: 40, w: 150, h: 70 },
    { x: 245, y: 40, w: 150, h: 70 },
    { x: 450, y: 40, w: 150, h: 70 },
    { x: 245, y: 200, w: 150, h: 70 },
    { x: 245, y: 320, w: 150, h: 70 },
  ];
  const dark = (x: number, y: number): boolean => {
    for (const b of boxes) {
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      const border = x < b.x + 3 || x >= b.x + b.w - 3 || y < b.y + 3 || y >= b.y + b.h - 3;
      if (inside && border) return true;
    }
    // Connectors: across the top row, then down the middle column.
    if (y >= 74 && y < 77 && ((x >= 190 && x < 245) || (x >= 395 && x < 450))) return true;
    return x >= 319 && x < 322 && ((y >= 110 && y < 200) || (y >= 270 && y < 320));
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    raw[start] = 0;
    for (let x = 0; x < width; x++) {
      const value = dark(x, y) ? 0x33 : 0xff;
      raw.fill(value, start + 1 + x * 3, start + 4 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A real, small (48x32) baseline JPEG: a grey panel with a dark frame. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAgADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDcmm1f+3rQmxst/wBlnwv2x8EbosnPlfTt3PTHN7zta/6B9h/4Gv8A/GqJv+Rjsv8Ar0uP/Q4a0KAM/wA7Wv8AoH2H/ga//wAao87Wv+gfYf8Aga//AMarQooAz/O1r/oH2H/ga/8A8aqjDNq/9vXZFjZb/ssGV+2PgDdLg58r69uw6543qz4f+Rjvf+vS3/8AQ5qACb/kY7L/AK9Lj/0OGtCsGaHV/wC3rQG+st/2WfDfY3wBuiyMeb9O/Y9c8XvJ1r/oIWH/AIBP/wDHaANCis/yda/6CFh/4BP/APHaPJ1r/oIWH/gE/wD8doA0Kz4f+Rjvf+vS3/8AQ5qPJ1r/AKCFh/4BP/8AHaoww6v/AG9dgX1lv+ywZb7G+CN0uBjzfr37jpjkA//Z",
  "base64",
);

// ─── Word ────────────────────────────────────────────────────────────────────

const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const run = (text: string, bold = false) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const paragraph = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${run(text)}</w:p>`;
const bullet = (text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const link = (text: string, relationship: string) =>
  `<w:p><w:hyperlink r:id="${relationship}">${run(text)}</w:hyperlink></w:p>`;
const tableCell = (text: string, bold = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p>${text ? run(text, bold) : ""}</w:p></w:tc>`;
const table = (rows: Cell[][], headerRows = 1) =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows
    .map(
      (cells, i) =>
        `<w:tr>${cells.map((c) => tableCell(c === null ? "" : String(c), i < headerRows)).join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;

async function docx(body: string, links: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${Object.entries(
      links,
    )
      .map(
        ([id, target]) =>
          `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(target)}" TargetMode="External"/>`,
      )
      .join("")}</Relationships>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style></w:styles>`,
  );
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

const ADVISING_TABLE: Cell[][] = [
  ["Course", "Units", "Status", "Quarter"],
  ["WIDG 101 Introduction to Widgetry", 4, null, null],
  ["WIDG 111 Widget Mathematics I", 5, null, null],
  ["WIDG 120 Widget Design Studio", 4, null, null],
];

/** Text that must only ever be displayed, never run or followed. */
export const HOSTILE_MARKERS = {
  script: "<script>window.__checksheetPwned = true</script>",
  image: '<img src=x onerror="window.__checksheetPwned = true">',
  link: "javascript:window.__checksheetPwned=true",
};

export async function buildChecksheetFixture(name: ChecksheetFixtureName): Promise<Buffer> {
  switch (name) {
    case "major-workbook":
      return workbook([
        { name: "Major", title: "Applied Widgetry Major Checksheet (sample)", header: CHECKSHEET_HEADER, rows: MAJOR_ROWS },
      ]);
    case "major-workbook-extended":
      // The same rows in the same places, with one new requirement at the end.
      return workbook([
        {
          name: "Major",
          title: "Applied Widgetry Major Checksheet (sample)",
          header: CHECKSHEET_HEADER,
          rows: [...MAJOR_ROWS, ["Widget Internship", "WIDG 198", null, null, "Optional"]],
        },
      ]);
    case "major-workbook-reworded":
      // Same shape, different requirements in the same rows: positions no longer mean the same thing.
      return workbook([
        {
          name: "Major",
          title: "Applied Widgetry Major Checksheet (sample)",
          header: CHECKSHEET_HEADER,
          rows: MAJOR_ROWS.map((row, i) => (i === 1 ? ["History of Widgets", "WIDG 105", null, null, null] : row)),
        },
      ]);
    case "second-major-workbook":
      return workbook([
        { name: "Gadgetry", title: "Gadget Studies Major Checksheet (sample)", header: CHECKSHEET_HEADER, rows: SECOND_MAJOR_ROWS },
      ]);
    case "minor-workbook":
      return workbook([
        { name: "Minor", title: "Sprocket Studies Minor Checksheet (sample)", header: CHECKSHEET_HEADER, rows: MINOR_ROWS },
        {
          name: "Electives",
          title: "Approved electives (sample)",
          header: ["Course", "Units", "Completed", "Term"],
          rows: [
            ["SPRK 110 Sprocket History", 4, null, null],
            ["SPRK 120 Sprocket Policy", 4, null, null],
          ],
        },
      ]);
    case "official-status-workbook":
      // "Status" here is the DEPARTMENT's column (Required / Elective), already filled in.
      return workbook([
        {
          name: "Major",
          title: "Applied Widgetry Requirements (sample)",
          header: ["Requirement", "Course", "Status", "Notes"],
          rows: [
            ["Introduction to Widgetry", "WIDG 101", "Required", null],
            ["Widget Mathematics I", "WIDG 111", "Required", null],
            ["Widget Ethics", "WIDG 130", "Elective", null],
          ],
        },
      ]);
    case "no-header-workbook":
      // Blank columns but no header naming them: nothing may be assumed editable.
      return workbook([
        { name: "Plan", title: "Applied Widgetry planning sheet (sample)", header: null, rows: MAJOR_ROWS },
      ]);
    case "major-pdf":
      return buildTextPdf([MAJOR_PDF_PAGE_1, MAJOR_PDF_PAGE_2]);
    case "major-pdf-revised":
      // Page 1 is word for word the same; page 2 lists different courses.
      return buildTextPdf([
        MAJOR_PDF_PAGE_1,
        ["Upper Division", "", "[  ]  WIDG 125  Widget Fabrication               Quarter: ______"],
      ]);
    case "four-year-plan-pdf":
      return buildTextPdf([
        [
          "Widget Engineering Four-Year Plan (sample)",
          "First year     Fall: WIDG 101    Winter: WIDG 111    Spring: WIDG 112",
          "Second year    Fall: WIDG 120    Winter: WIDG 130    Spring: elective",
          "Fourth year    Fall: WIDG 190",
        ],
      ]);
    case "flowchart-png":
      return buildFlowchartPng();
    case "flowchart-jpg":
      return TINY_JPEG;
    case "advising-docx":
      return docx(
        [
          paragraph("Applied Widgetry Advising Guide (sample)", "Heading1"),
          paragraph("Start with WIDG 101 in your first fall quarter."),
          paragraph("Recommended sequence", "Heading2"),
          bullet("Take WIDG 111 before WIDG 112."),
          bullet("WIDG 120 is offered in fall only."),
          table(ADVISING_TABLE),
          link("Department website", "rIdLink1"),
        ].join(""),
        { rIdLink1: "https://www.example.edu/widgetry" },
      );
    case "hostile-docx":
      return docx(
        [
          paragraph("Hostile sample", "Heading1"),
          paragraph(HOSTILE_MARKERS.script),
          paragraph(HOSTILE_MARKERS.image),
          link("A link that must not be followed", "rIdLink1"),
          table([
            ["Course", "Status"],
            [HOSTILE_MARKERS.script, null],
          ]),
        ].join(""),
        { rIdLink1: HOSTILE_MARKERS.link },
      );
  }
}

export const CHECKSHEET_FIXTURE_FILES: Record<ChecksheetFixtureName, { fileName: string; contentType: string }> = {
  "major-workbook": { fileName: "applied-widgetry-major.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "major-workbook-extended": { fileName: "applied-widgetry-major-extended.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "major-workbook-reworded": { fileName: "applied-widgetry-major-reworded.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "second-major-workbook": { fileName: "gadget-studies-major.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "minor-workbook": { fileName: "sprocket-studies-minor.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "official-status-workbook": { fileName: "official-status.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "no-header-workbook": { fileName: "no-header.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  "major-pdf": { fileName: "applied-widgetry-major.pdf", contentType: "application/pdf" },
  "major-pdf-revised": { fileName: "applied-widgetry-major-revised.pdf", contentType: "application/pdf" },
  "four-year-plan-pdf": { fileName: "widget-engineering-four-year-plan.pdf", contentType: "application/pdf" },
  "flowchart-png": { fileName: "widget-flowchart.png", contentType: "image/png" },
  "flowchart-jpg": { fileName: "widget-flowchart.jpg", contentType: "image/jpeg" },
  "advising-docx": { fileName: "widgetry-advising-guide.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  "hostile-docx": { fileName: "hostile.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};
