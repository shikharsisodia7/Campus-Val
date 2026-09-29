/**
 * How a department document is laid out on a phone screen.
 *
 * Nothing here decides what a document means. It turns the server's copy of a
 * worksheet or a table into rows of boxes with widths, so a wide sheet is read
 * by scrolling sideways at a readable size instead of being shrunk to fit.
 *
 * No React Native import: this is plain arithmetic, and is tested as such.
 */
import type {
  ChecksheetDocTableCell,
  ChecksheetSheet,
  ChecksheetTrackingCell,
  ChecksheetTrackingField,
} from '@workspace/api-client-react';

/** Points. A finger needs 44; text needs room to be read without zooming. */
export const MIN_COLUMN_WIDTH = 96;
export const MAX_COLUMN_WIDTH = 300;
/** A student's column must fit its control whatever the file's own width is. */
export const TRACKING_COLUMN_WIDTH = 172;
export const ROW_NUMBER_WIDTH = 34;

/** Excel widths are in characters; about 7.5 points each at this text size. */
export function columnWidth(characters: number | null | undefined, tracking: boolean): number {
  const fromFile = characters ? Math.round(characters * 7.5) : 120;
  const width = Math.min(Math.max(fromFile, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
  return tracking ? Math.max(width, TRACKING_COLUMN_WIDTH) : width;
}

export interface GridBox {
  r: number;
  c: number;
  width: number;
  /** What the department wrote. Empty for a cell it left empty. */
  text: string;
  bold: boolean;
  italic: boolean;
  filled: boolean;
  align: 'left' | 'center' | 'right';
  /** Set when this is a cell the department left for the student. */
  tracking: ChecksheetTrackingField | null;
}

export interface GridRow {
  r: number;
  boxes: GridBox[];
}

export interface SheetGrid {
  rows: GridRow[];
  widths: number[];
  totalWidth: number;
  studentColumns: number[];
}

/**
 * A worksheet as rows of boxes. A merged cell becomes one box as wide as the
 * columns it spans; the cells it covers are not drawn. A cell merged downwards
 * is drawn in its first row.
 */
export function sheetGrid(sheet: ChecksheetSheet, showTracking: boolean): SheetGrid {
  const studentColumns = [...new Set(sheet.tracking.columns.map((column) => column.c))].sort((a, b) => a - b);
  const widths = Array.from({ length: sheet.columnCount }, (_, c) =>
    columnWidth(sheet.columnWidths[c], showTracking && studentColumns.includes(c)),
  );

  const covered = new Set<string>();
  const spans = new Map<string, number>();
  for (const merge of sheet.merges) {
    spans.set(`${merge.r}:${merge.c}`, merge.colSpan);
    for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
      for (let c = merge.c; c < merge.c + merge.colSpan; c++) {
        if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
      }
    }
  }

  const offered = new Map<string, ChecksheetTrackingCell>();
  for (const cell of sheet.tracking.cells) offered.set(`${cell.r}:${cell.c}`, cell);

  const rows: GridRow[] = sheet.rows.map((row) => {
    const byColumn = new Map(row.cells.map((cell) => [cell.c, cell]));
    const boxes: GridBox[] = [];
    for (let c = 0; c < sheet.columnCount; c++) {
      const key = `${row.r}:${c}`;
      if (covered.has(key)) continue;
      const cell = byColumn.get(c);
      const span = Math.max(1, Math.min(spans.get(key) ?? 1, sheet.columnCount - c));
      let width = 0;
      for (let i = 0; i < span; i++) width += widths[c + i] ?? MIN_COLUMN_WIDTH;
      const slot = showTracking && !cell ? offered.get(key) : undefined;
      boxes.push({
        r: row.r,
        c,
        width,
        text: cell?.text ?? '',
        bold: !!cell?.bold,
        italic: !!cell?.italic,
        filled: !!cell?.filled,
        align: cell?.align === 'center' || cell?.align === 'right' ? cell.align : 'left',
        tracking: slot ? slot.field : null,
      });
    }
    return { r: row.r, boxes };
  });

  return { rows, widths, totalWidth: widths.reduce((sum, width) => sum + width, 0), studentColumns };
}

export const tableCellText = (cell: ChecksheetDocTableCell | undefined): string =>
  (cell?.runs ?? [])
    .map((run) => run.text)
    .join('')
    .trim();

/** What a row of a Word table is about: its first cell that says something and is not the student's. */
export function tableRowName(row: readonly ChecksheetDocTableCell[], r: number, studentColumns: readonly number[]): string {
  const name = row
    .filter((_, c) => !studentColumns.includes(c))
    .map(tableCellText)
    .find((text) => text !== '');
  return name ? name.slice(0, 120) : `row ${r + 1}`;
}

/** Column widths for a Word table, from how much its cells say. */
export function tableWidths(rows: readonly (readonly ChecksheetDocTableCell[])[], studentColumns: readonly number[], showTracking: boolean): number[] {
  const count = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: count }, (_, c) => {
    const longest = rows.reduce((max, row) => Math.max(max, tableCellText(row[c]).length), 0);
    return columnWidth(Math.min(Math.max(longest, 10), 34), showTracking && studentColumns.includes(c));
  });
}

/**
 * Where a touch landed on a picture, as fractions of the picture from its
 * top-left corner. The same numbers the web app stores, so a marker placed on
 * a phone sits in the same spot in a browser.
 */
export function touchToFraction(
  touch: { x: number; y: number },
  box: { width: number; height: number },
): { x: number; y: number } | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return { x: round(clamp(touch.x / box.width)), y: round(clamp(touch.y / box.height)) };
}

/** The size a picture is drawn at: as wide as the screen allows, at its own shape. */
export function fitPicture(picture: { width: number; height: number }, available: number, zoom = 1): { width: number; height: number } {
  if (!(picture.width > 0) || !(picture.height > 0) || !(available > 0)) return { width: 0, height: 0 };
  const width = Math.round(available * zoom);
  return { width, height: Math.round((width * picture.height) / picture.width) };
}
