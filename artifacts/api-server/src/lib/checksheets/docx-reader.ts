/**
 * Reads a Word document (.docx) into display blocks: headings, paragraphs,
 * list items, tables and pictures, in source order.
 *
 * SAFETY. The document is untrusted. Mammoth turns it into a small, known set
 * of HTML elements; that HTML is then READ, never shown. Only the elements
 * named below become blocks, only their text is kept, and the browser renders
 * the blocks as plain text nodes. No markup from the file reaches the page, so
 * there is nothing to sanitize and nothing that could run. Macros, embedded
 * objects, scripts and fields are simply not among the things that are read.
 *
 * FIDELITY. Word's page layout (columns, page breaks, exact fonts) is not
 * reproduced; the wording, order, headings, lists and tables are. The
 * original file is always available for the exact appearance.
 */
import mammoth from "mammoth";
import { Parser } from "htmlparser2";
import { CHECKSHEET_LIMITS } from "./limits";
import {
  CHECKSHEET_RENDER_VERSION,
  ChecksheetError,
  type DocBlock,
  type DocTableCell,
  type DocTextRun,
  type DocumentRender,
} from "./model";
import { detectTrackingLayout, type LayoutRow } from "./tracking-layout";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const OMITTED_IMAGE_SRC = "omitted:";
const HEADING = /^h([1-6])$/;
/** Elements whose contents are never text for a reader. */
const SKIPPED = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"]);

/** Only links a student can safely follow are kept as links. */
export function safeDocumentHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (trimmed.length > CHECKSHEET_LIMITS.sourceUrlMaxLength) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  return url.toString();
}

function cleanText(text: string): string {
  // Control characters (other than tab and newline) have no place on a page.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function pushRun(runs: DocTextRun[], run: DocTextRun): void {
  const last = runs[runs.length - 1];
  if (
    last &&
    last.bold === run.bold &&
    last.italic === run.italic &&
    last.underline === run.underline &&
    last.href === run.href
  ) {
    last.text += run.text;
    return;
  }
  runs.push(run);
}

function trimRuns(runs: DocTextRun[]): DocTextRun[] {
  const out = runs.filter((run) => run.text !== "");
  if (out.length > 0) {
    out[0]!.text = out[0]!.text.replace(/^\s+/, "");
    out[out.length - 1]!.text = out[out.length - 1]!.text.replace(/\s+$/, "");
  }
  return out.filter((run) => run.text !== "");
}

const runsText = (runs: DocTextRun[]): string => runs.map((run) => run.text).join("");

interface OpenTable {
  rows: DocTableCell[][];
  row: DocTableCell[] | null;
  cell: DocTableCell | null;
}

/** Turns mammoth's HTML into blocks. Exported for tests. */
export function htmlToBlocks(html: string): { blocks: DocBlock[]; warnings: string[] } {
  const blocks: DocBlock[] = [];
  const warnings = new Set<string>();
  const lists: boolean[] = [];
  let table: OpenTable | null = null;
  let tableDepth = 0;
  let current: { block: Extract<DocBlock, { runs: DocTextRun[] }> } | null = null;
  let bold = 0;
  let italic = 0;
  let underline = 0;
  const hrefs: (string | undefined)[] = [];
  let textLength = 0;
  let tableRows = 0;
  let skipping = 0;

  const addBlock = (block: DocBlock) => {
    if (blocks.length >= CHECKSHEET_LIMITS.maxDocxBlocks) throw new ChecksheetError("too_large");
    blocks.push(block);
  };

  const closeCurrent = () => {
    if (!current) return;
    current.block.runs = trimRuns(current.block.runs);
    if (current.block.runs.length > 0) addBlock(current.block);
    current = null;
  };

  const target = (): DocTextRun[] | null => {
    if (table) return table.cell ? table.cell.runs : null;
    if (!current) current = { block: { type: "paragraph", runs: [] } };
    return current.block.runs;
  };

  const addText = (raw: string) => {
    const text = cleanText(raw);
    if (text === "") return;
    const runs = target();
    if (!runs) return;
    textLength += text.length;
    if (textLength > CHECKSHEET_LIMITS.maxDocxTextLength) throw new ChecksheetError("too_large");
    const run: DocTextRun = { text };
    if (bold > 0) run.bold = true;
    if (italic > 0) run.italic = true;
    if (underline > 0) run.underline = true;
    const href = hrefs[hrefs.length - 1];
    if (href) run.href = href;
    pushRun(runs, run);
  };

  /** Paragraphs inside one table cell are separated by a line break. */
  const breakInCell = () => {
    if (table?.cell && table.cell.runs.length > 0) pushRun(table.cell.runs, { text: "\n" });
  };

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (SKIPPED.has(name)) skipping += 1;
        if (skipping > 0) return;
        const heading = HEADING.exec(name);
        if (name === "table") {
          tableDepth += 1;
          if (tableDepth === 1) {
            closeCurrent();
            table = { rows: [], row: null, cell: null };
          } else {
            // A table inside a cell is kept as that cell's text.
            warnings.add("nested_table_flattened");
            breakInCell();
          }
          return;
        }
        if (table) {
          if (tableDepth === 1 && name === "tr") {
            tableRows += 1;
            if (tableRows > CHECKSHEET_LIMITS.maxDocxTableRows) throw new ChecksheetError("too_large");
            table.row = [];
            return;
          }
          if (tableDepth === 1 && (name === "td" || name === "th")) {
            const cell: DocTableCell = { runs: [] };
            if (name === "th") cell.header = true;
            const colSpan = Number(attrs["colspan"]);
            const rowSpan = Number(attrs["rowspan"]);
            if (Number.isInteger(colSpan) && colSpan > 1 && colSpan <= 50) cell.colSpan = colSpan;
            if (Number.isInteger(rowSpan) && rowSpan > 1 && rowSpan <= 500) cell.rowSpan = rowSpan;
            table.cell = cell;
            return;
          }
          if (name === "p" || name === "li" || heading || name === "tr" || name === "td" || name === "th") {
            breakInCell();
            return;
          }
        } else if (name === "p") {
          // A paragraph inside a list item belongs to that item.
          if (current?.block.type !== "list-item") {
            closeCurrent();
            current = { block: { type: "paragraph", runs: [] } };
          }
          return;
        } else if (heading) {
          closeCurrent();
          current = { block: { type: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4 | 5 | 6, runs: [] } };
          return;
        } else if (name === "ul" || name === "ol") {
          closeCurrent();
          lists.push(name === "ol");
          return;
        } else if (name === "li") {
          closeCurrent();
          current = {
            block: {
              type: "list-item",
              ordered: lists[lists.length - 1] ?? false,
              depth: Math.min(Math.max(lists.length - 1, 0), 8),
              runs: [],
            },
          };
          return;
        }

        if (name === "strong" || name === "b") bold += 1;
        else if (name === "em" || name === "i") italic += 1;
        else if (name === "u") underline += 1;
        else if (name === "a") hrefs.push(safeDocumentHref(attrs["href"]));
        else if (name === "br") addText("\n");
        else if (name === "img") {
          const alt = cleanText(attrs["alt"] ?? "").slice(0, 200);
          const src = attrs["src"] ?? "";
          const match = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/=]+)$/.exec(src);
          if (table) {
            addText(alt ? `[Picture: ${alt}]` : "[Picture]");
          } else {
            closeCurrent();
            if (match) addBlock({ type: "image", mime: match[1] as "image/png" | "image/jpeg" | "image/gif", data: match[2]!, alt });
            else {
              warnings.add("image_omitted");
              addBlock({ type: "image-omitted", alt });
            }
          }
        }
      },
      ontext(text) {
        if (skipping === 0) addText(text);
      },
      onclosetag(name) {
        if (SKIPPED.has(name)) {
          skipping = Math.max(0, skipping - 1);
          return;
        }
        if (skipping > 0) return;
        if (name === "table") {
          tableDepth = Math.max(0, tableDepth - 1);
          if (tableDepth === 0 && table) {
            const rows = table.rows.filter((row) => row.length > 0);
            // Some exporters (Google Docs among them) flag EVERY row as a
            // header row. A table cannot be all header; the first row is the
            // header and the rest is its content.
            if (rows.length > 1 && rows.every((row) => row.every((cell) => cell.header))) {
              for (const row of rows.slice(1)) for (const cell of row) delete cell.header;
              warnings.add("header_rows_normalized");
            }
            if (rows.length > 0) addBlock({ type: "table", rows, tracking: { columns: [], cells: [] } });
            table = null;
          }
          return;
        }
        if (table) {
          if (tableDepth === 1 && (name === "td" || name === "th")) {
            if (table.cell && table.row) {
              table.cell.runs = trimRuns(table.cell.runs);
              table.row.push(table.cell);
            }
            table.cell = null;
          } else if (tableDepth === 1 && name === "tr") {
            if (table.row) table.rows.push(table.row);
            table.row = null;
          }
        } else if (name === "p") {
          if (current?.block.type === "list-item") addText("\n");
          else closeCurrent();
        } else if (HEADING.test(name) || name === "li") {
          closeCurrent();
        } else if (name === "ul" || name === "ol") {
          closeCurrent();
          lists.pop();
        }

        if (name === "strong" || name === "b") bold = Math.max(0, bold - 1);
        else if (name === "em" || name === "i") italic = Math.max(0, italic - 1);
        else if (name === "u") underline = Math.max(0, underline - 1);
        else if (name === "a") hrefs.pop();
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  closeCurrent();

  return { blocks, warnings: [...warnings].sort() };
}

/** Finds student-entry cells in each plain table (no merged cells). */
function addTableTracking(blocks: DocBlock[]): void {
  blocks.forEach((block, index) => {
    if (block.type !== "table") return;
    if (block.rows.some((row) => row.some((cell) => cell.colSpan || cell.rowSpan))) return;
    const rows: LayoutRow[] = block.rows.map((row, r) => ({
      r,
      cells: row
        .map((cell, c) => ({
          c,
          text: runsText(cell.runs),
          emphasized: !!cell.header || (cell.runs.length > 0 && cell.runs.every((run) => run.bold)),
        }))
        .filter((cell) => cell.text.trim() !== ""),
    }));
    block.tracking = detectTrackingLayout(
      rows.filter((row) => row.cells.length > 0),
      new Set(),
      `block:${index}`,
    );
    // Only cells that exist in the row can hold a control.
    block.tracking.cells = block.tracking.cells.filter((cell) => cell.c < (block.rows[cell.r]?.length ?? 0));
  });
}

export async function readChecksheetDocx(buf: Buffer): Promise<DocumentRender> {
  let imageBudget: number = CHECKSHEET_LIMITS.maxDocxImageBytes;
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: buf },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!IMAGE_TYPES.has(image.contentType)) return { src: OMITTED_IMAGE_SRC };
          const data = await image.readAsBase64String();
          const bytes = Math.floor((data.length * 3) / 4);
          if (bytes > imageBudget) return { src: OMITTED_IMAGE_SRC };
          imageBudget -= bytes;
          return { src: `data:${image.contentType};base64,${data}` };
        }),
      },
    );
    html = result.value;
  } catch {
    // The library's message can quote document content; only the category leaves here.
    throw new ChecksheetError("malformed_document");
  }

  const { blocks, warnings } = htmlToBlocks(html);
  if (blocks.length === 0) throw new ChecksheetError("preview_unavailable");
  addTableTracking(blocks);
  return { version: CHECKSHEET_RENDER_VERSION, kind: "document", blocks, warnings };
}
