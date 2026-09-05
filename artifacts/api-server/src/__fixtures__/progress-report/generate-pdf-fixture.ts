/**
 * Generator script for the committed PDF fixture file.
 * Run via: npx tsx src/__fixtures__/progress-report/generate-pdf-fixture.ts
 *
 * Renders workday-apr-hierarchical.txt (the same synthetic, already-vetted
 * APR text used by progress-report-parser.fixture.test.ts) as a real,
 * minimal, valid single-page PDF — one Tj per line, base-14 Helvetica (no
 * font embedding needed). No third-party PDF library exists in this
 * monorepo, and pulling one in for a ~2KB test fixture isn't worth a new
 * dependency, so this writes the PDF byte structure directly (catalog /
 * pages / page / content stream / font, with a computed xref table).
 *
 * This exists specifically to exercise the real `unpdf`-based PDF path
 * end-to-end (upload -> unpdf text extraction -> parser), which the .txt
 * fixtures deliberately bypass by feeding parser functions text directly.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const textPath = join(import.meta.dirname, "workday-apr-hierarchical.txt");
const outPath = join(import.meta.dirname, "workday-apr-hierarchical.pdf");

function escapePdfString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines: string[]): Buffer {
  let content = "BT\n/F1 10 Tf\n14 TL\n50 760 Td\n";
  for (const line of lines) {
    content += `(${escapePdfString(line)}) Tj\nT*\n`;
  }
  content += "ET";

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];
  const streamHeader = `4 0 obj\n<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n`;
  const streamFooter = `\nendstream\nendobj\n`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  let cursor = Buffer.byteLength(pdf, "latin1");

  const append = (str: string) => {
    pdf += str;
    cursor += Buffer.byteLength(str, "latin1");
  };

  offsets[1] = cursor;
  append(objects[0]!);
  offsets[2] = cursor;
  append(objects[1]!);
  offsets[3] = cursor;
  append(objects[2]!);
  offsets[4] = cursor;
  append(streamHeader);
  append(content);
  append(streamFooter);
  offsets[5] = cursor;
  append(objects[3]!);

  const xrefStart = cursor;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  append(xref);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return Buffer.from(pdf, "latin1");
}

const lines = readFileSync(textPath, "utf-8").split("\n");
writeFileSync(outPath, buildPdf(lines));
console.log(`wrote ${outPath}`);
