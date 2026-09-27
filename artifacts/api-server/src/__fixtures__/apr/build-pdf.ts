/**
 * SYNTHETIC Workday "View My Academic Progress" PDFs for tests and local QA.
 *
 * Invented content, laid out the way Workday typesets the real report (checked
 * against a real export, never committed): Letter pages, page chrome at the
 * top ("Page 1 of 2"), program blocks with a title and summary lines, a
 * two-row table header repeated on every page, left-aligned cells whose text
 * wraps 9pt apart, and table rows 11pt apart.
 *
 * The PDF is written by hand (text placed at coordinates, standard Helvetica)
 * so the fixture needs no PDF library and its geometry is exactly known.
 */
import { FIXTURE_PROGRAMS, type FixtureProgram } from "./build-workbooks";

type Cell = string | number | null;

/** Where each column's text starts, in points — the real report's positions. */
export const PDF_COLUMN_X = [37, 176.1, 246, 331.3, 439.9, 501.9, 540.7] as const;
const COLUMN_CHARS = [31, 13, 16, 24, 11, 5, 5];
const HEADER = [
  { text: "Satisfied With", x: 425.7, dy: 0 },
  { text: "Requirement", x: 78.8, dy: 13.5 },
  { text: "Status", x: 196.3, dy: 13.5 },
  { text: "Remaining", x: 265.1, dy: 13.5 },
  { text: "Academic", x: 449.2, dy: 18 },
  { text: "Registrations Used", x: 345.6, dy: 22.5 },
  { text: "Units", x: 509.1, dy: 22.5 },
  { text: "Grade", x: 545.4, dy: 22.5 },
  { text: "Period", x: 455.9, dy: 27 },
];
const HEADER_HEIGHT = 27;
const PAGE = { width: 612, height: 792, top: 99, bottom: 700 };
const WRAP = 9.05;
const ROW_GAP = 11;

interface Placed {
  x: number;
  /** From the top of the page. */
  y: number;
  text: string;
  size: number;
  /** A second run of text in the SAME text object, starting at this x. */
  then?: { x: number; text: string };
}

/** Standard Helvetica advance widths (1/1000 em) for characters 32..126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

function widthOf(text: string, size: number): number {
  let units = 0;
  for (const ch of text) units += HELVETICA[ch.charCodeAt(0) - 32] ?? 556;
  return (units * size) / 1000;
}

function wrap(text: string, chars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > chars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function assemble(pages: Placed[][]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pagesId = objects.length + 1 + pages.length * 2;
  const kids: number[] = [];
  for (const placed of pages) {
    const stream = placed
      .map((p) => {
        const at = `BT /F1 ${p.size} Tf 1 0 0 1 ${p.x.toFixed(2)} ${(PAGE.height - p.y).toFixed(2)} Tm`;
        if (!p.then) return `${at} (${escape(p.text)}) Tj ET`;
        // One text object holding two cells: the gap between them is an
        // adjustment inside the same TJ array, exactly as Workday's PDF has it.
        const gap = p.then.x - (p.x + widthOf(`${p.text} `, p.size));
        const adjust = -Math.round((gap / p.size) * 1000);
        return `${at} [(${escape(p.text)} ) ${adjust} (${escape(p.then.text)})] TJ ET`;
      })
      .join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  const tree = add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  if (tree !== pagesId) throw new Error("page tree id mismatch");
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export interface PdfFixtureOptions {
  programs?: FixtureProgram[];
  /**
   * Write a requirement and its status as ONE piece of text, the way the real
   * report does when the requirement text reaches the next column.
   */
  fuseFirstStatus?: boolean;
  /** Leave out the table header, to produce a PDF CampusVal must refuse to read. */
  withoutHeader?: boolean;
}

export function buildAprPdf(options: PdfFixtureOptions = {}): Buffer {
  const programs = options.programs ?? FIXTURE_PROGRAMS;
  const pages: Placed[][] = [[]];
  let y = 108.5;
  const page = () => pages[pages.length - 1]!;
  const put = (x: number, text: string, size = 9, at = y) => page().push({ x, y: at, text, size });

  const header = () => {
    if (!options.withoutHeader) for (const h of HEADER) put(h.x, h.text, 9, y + h.dy);
    y += HEADER_HEIGHT + 15;
  };
  const newPage = (repeatHeader: boolean) => {
    pages.push([]);
    y = PAGE.top + 19.5;
    if (repeatHeader) {
      y = PAGE.top + 19.5;
      header();
    }
  };

  put(28, "Sample Department/Undergraduate (Finance Major/Mathematics Major/Healthcare Innovation and Design Minor)", 10);
  y += 32;
  put(89, "Cumulative GPA", 9);
  put(168, "3.100", 9);
  y += 12;
  put(70, "Unused Registrations", 9);
  put(168, "0", 9);
  y += 18;

  programs.forEach((program) => {
    if (y > PAGE.bottom - 120) newPage(false);
    put(33, program.title, 10);
    y += 17.4;
    for (const [label, value, x] of [
      ["Program of Study GPA", program.gpa, 69],
      ["Requirements Effective", program.effective, 68],
      ["Last Evaluated", "01/12/2027 08:00:00 AM GMT-08:00 Pacific Time (Los Angeles)", 101],
    ] as const) {
      put(x, label, 9);
      put(173, value, 9);
      y += 12;
    }
    if (program.notAssigned !== undefined) {
      y += 6;
      put(47, "Requirements Not Assigned", 9);
      put(172, String(program.notAssigned), 9);
      y += 12;
    }
    y += 4;
    header();

    program.rows.forEach((row: Cell[]) => {
      const cells = row.map((cell, c) => (cell === null ? [] : wrap(String(cell), COLUMN_CHARS[c]!)));
      const height = Math.max(1, ...cells.map((l) => l.length));
      if (y + (height - 1) * WRAP > PAGE.bottom) newPage(true);

      // The real report stores a requirement and its status as one text
      // object when the requirement text nearly fills its column.
      const fuse =
        !!options.fuseFirstStatus &&
        cells[0]!.length === 1 &&
        cells[1]!.length === 1 &&
        widthOf(cells[0]![0]!, 9) > PDF_COLUMN_X[1] - PDF_COLUMN_X[0] - 12;
      cells.forEach((lines, c) => {
        lines.forEach((text, i) => {
          if (fuse && c === 1) return;
          if (fuse && c === 0) {
            page().push({ x: PDF_COLUMN_X[0], y, text, size: 9, then: { x: PDF_COLUMN_X[1], text: cells[1]![0]! } });
            return;
          }
          put(PDF_COLUMN_X[c]!, text, 9, y + i * WRAP);
        });
      });
      y += (height - 1) * WRAP + ROW_GAP;
    });
    y += 20;
  });

  // Page chrome, as Workday prints it on every page.
  pages.forEach((placed, i) => {
    placed.unshift(
      { x: 230, y: 32.8, text: "View My Academic Progress", size: 12 },
      { x: 551, y: 26.7, text: "09:05 AM", size: 10 },
      { x: 544, y: 40.1, text: "01/15/2027", size: 10 },
      { x: 537, y: 49.7, text: `Page ${i + 1} of ${pages.length}`, size: 10 },
    );
  });
  return assemble(pages);
}
