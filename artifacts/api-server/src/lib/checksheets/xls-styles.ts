/**
 * Which cells of a legacy Excel workbook (.xls) are bold or italic.
 *
 * The workbook reader gives a legacy file's values, order, merges and widths,
 * but no formatting. CampusVal tells a section heading from a requirement by
 * its bold label, so without this a heading row in a legacy file would be
 * offered a tracking cell. The formatting is read here, from the file's own
 * records, and nothing else is.
 *
 * A legacy workbook is a list of records: an id, a length, and that many
 * bytes. Three kinds matter:
 *   FONT   a font: its weight (700 is bold) and whether it is italic;
 *   XF     a cell format: which font it uses;
 *   a cell which format it uses.
 * Every other record is stepped over by its length and never read. Nothing is
 * executed, nothing is fetched, and a record that does not fit in the file
 * ends the reading: whatever was read so far is kept, the rest is unformatted.
 */
import * as XLSX from "xlsx";

export interface LegacyCellStyle {
  bold: boolean;
  italic: boolean;
}

/** Worksheet position (as the workbook lists its sheets) -> "row:col" -> style. Only styled cells are listed. */
export type LegacyStyles = Map<number, Map<string, LegacyCellStyle>>;

const BOF = 0x0809;
const EOF = 0x000a;
const FONT = 0x0031;
const XF = 0x00e0;
const BOUNDSHEET = 0x0085;
const MULRK = 0x00bd;
/** Records that are one cell: row, column, format, then the value. */
const CELL_RECORDS = new Set([0x0203, 0x027e, 0x00fd, 0x0204, 0x0006, 0x0205, 0x00d6]);

const BOLD_WEIGHT = 600;
const MAX_RECORDS = 5_000_000;

interface Font {
  bold: boolean;
  italic: boolean;
}

function workbookStream(buf: Buffer): Buffer | null {
  const container = XLSX.CFB.read(buf, { type: "buffer" });
  const entry = XLSX.CFB.find(container, "Workbook") ?? XLSX.CFB.find(container, "Book");
  const content = entry?.content as Uint8Array | number[] | undefined;
  return content ? Buffer.from(content as Uint8Array) : null;
}

/** Never throws: a file this cannot read has no styles, and is shown unformatted. */
export function readLegacyStyles(buf: Buffer): LegacyStyles {
  const styles: LegacyStyles = new Map();
  try {
    const stream = workbookStream(buf);
    if (!stream) return styles;

    const fonts: Font[] = [];
    const formats: number[] = [];
    const sheets: number[] = [];

    // The workbook's own records come first, up to its end-of-section record.
    let p = 0;
    let seen = 0;
    while (p + 4 <= stream.length && seen++ < MAX_RECORDS) {
      const id = stream.readUInt16LE(p);
      const length = stream.readUInt16LE(p + 2);
      const at = p + 4;
      if (at + length > stream.length) break;
      if (id === FONT && length >= 8) {
        // Fonts are numbered 0-3, then 5 and up: number 4 is never stored.
        if (fonts.length === 4) fonts.push({ bold: false, italic: false });
        fonts.push({ italic: (stream.readUInt16LE(at + 2) & 0x0002) !== 0, bold: stream.readUInt16LE(at + 6) >= BOLD_WEIGHT });
      } else if (id === XF && length >= 2) {
        formats.push(stream.readUInt16LE(at));
      } else if (id === BOUNDSHEET && length >= 6) {
        sheets.push(stream.readUInt32LE(at));
      } else if (id === EOF) {
        break;
      }
      p = at + length;
    }

    const styleOf = (format: number): Font | null => {
      const font = fonts[formats[format] ?? -1];
      return font && (font.bold || font.italic) ? font : null;
    };

    sheets.forEach((start, index) => {
      if (start + 4 > stream.length || stream.readUInt16LE(start) !== BOF) return;
      const cells = new Map<string, LegacyCellStyle>();
      let q = start;
      let depth = 0;
      while (q + 4 <= stream.length && seen++ < MAX_RECORDS) {
        const id = stream.readUInt16LE(q);
        const length = stream.readUInt16LE(q + 2);
        const at = q + 4;
        if (at + length > stream.length) break;
        if (id === BOF) depth += 1;
        else if (id === EOF) {
          depth -= 1;
          if (depth <= 0) break;
        } else if (depth === 1 && CELL_RECORDS.has(id) && length >= 6) {
          const style = styleOf(stream.readUInt16LE(at + 4));
          if (style) cells.set(`${stream.readUInt16LE(at)}:${stream.readUInt16LE(at + 2)}`, { bold: style.bold, italic: style.italic });
        } else if (depth === 1 && id === MULRK && length >= 6) {
          // A run of numbers in one row: the row, the first column, then a format and a value per cell.
          const row = stream.readUInt16LE(at);
          const first = stream.readUInt16LE(at + 2);
          const count = Math.floor((length - 6) / 6);
          for (let i = 0; i < count; i++) {
            const style = styleOf(stream.readUInt16LE(at + 4 + i * 6));
            if (style) cells.set(`${row}:${first + i}`, { bold: style.bold, italic: style.italic });
          }
        }
        q = at + length;
      }
      if (cells.size > 0) styles.set(index, cells);
    });
  } catch {
    return new Map();
  }
  return styles;
}
