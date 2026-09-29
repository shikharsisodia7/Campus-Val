/**
 * Degree Checksheets in the mobile app: what it lays out, what it offers, and
 * that its tracking is the web app's tracking.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SaveConflict,
  TRACKING_STATUS_OPTIONS,
  TRACKING_TERM_OPTIONS,
  TrackingSaveQueue,
  canHold,
  cellKey,
  defaultYearForTerm,
  entriesByPlace,
  entrySummary,
  placeKeyOf,
  replacementSummary,
  sheetRowName,
  validateChecksheetFile,
  type ChecksheetSheet,
  type TrackingEntry,
} from '@workspace/api-client-react';
import {
  MIN_COLUMN_WIDTH,
  TRACKING_COLUMN_WIDTH,
  columnWidth,
  fitPicture,
  sheetGrid,
  tableRowName,
  tableWidths,
  touchToFraction,
} from './checksheet-layout';
import { canPlaceAgain, describePlace, trackingHint, trackingWays } from './checksheet-rules';

const MB = 1024 * 1024;

/** A synthetic checklist: requirements with one student column, a plan grid beside it. */
const sheet: ChecksheetSheet = {
  name: 'Checklist',
  index: 0,
  visibility: 'visible',
  rowCount: 4,
  columnCount: 5,
  columnWidths: [40, 8, 4, 24, null],
  merges: [{ r: 0, c: 0, rowSpan: 1, colSpan: 5 }],
  rows: [
    { r: 0, cells: [{ c: 0, text: 'Applied Widgetry Checklist (sample)', bold: true }] },
    { r: 1, cells: [{ c: 0, text: 'Requirements', bold: true, filled: true }, { c: 1, text: 'Quarter', bold: true }, { c: 3, text: 'Course', bold: true }, { c: 4, text: 'Quarter', bold: true }] },
    { r: 2, cells: [{ c: 0, text: 'Introduction to Widgetry' }, { c: 3, text: 'WIDG 101' }] },
    { r: 3, cells: [{ c: 0, text: 'Widget Mathematics I' }] },
  ],
  tracking: {
    columns: [
      { c: 1, field: 'both', header: 'Quarter', headerRow: 1 },
      { c: 4, field: 'both', header: 'Quarter', headerRow: 1 },
    ],
    cells: [
      { r: 2, c: 1, field: 'both' },
      { r: 3, c: 1, field: 'both' },
      { r: 2, c: 4, field: 'both' },
    ],
  },
};

const entry = (overrides: Partial<TrackingEntry>): TrackingEntry => ({
  key: 'id:1',
  id: 1,
  anchorType: 'manual',
  anchor: {},
  field: null,
  detached: false,
  sortOrder: 0,
  itemLabel: null,
  status: null,
  term: null,
  termYear: null,
  note: null,
  ...overrides,
});

describe('a worksheet on a phone', () => {
  it('is never shrunk to fit: every column keeps a readable width and the sheet scrolls sideways', () => {
    const grid = sheetGrid(sheet, true);
    expect(grid.widths.every((width) => width >= MIN_COLUMN_WIDTH)).toBe(true);
    expect(grid.totalWidth).toBeGreaterThan(390);
    expect(columnWidth(2, false)).toBe(MIN_COLUMN_WIDTH);
    expect(columnWidth(500, false)).toBe(300);
  });

  it("gives the student's columns room for their control, whatever the file's width", () => {
    const grid = sheetGrid(sheet, true);
    expect(grid.studentColumns).toEqual([1, 4]);
    expect(grid.widths[1]).toBe(TRACKING_COLUMN_WIDTH);
    // With tracking hidden the column is the file's own.
    expect(sheetGrid(sheet, false).widths[1]).toBe(MIN_COLUMN_WIDTH);
  });

  it('keeps every row, in source order, with the wording as written', () => {
    const grid = sheetGrid(sheet, true);
    expect(grid.rows.map((row) => row.r)).toEqual([0, 1, 2, 3]);
    expect(grid.rows[2]!.boxes.map((box) => box.text)).toEqual(['Introduction to Widgetry', '', '', 'WIDG 101', '']);
  });

  it('draws a merged title as one box across its columns', () => {
    const grid = sheetGrid(sheet, true);
    const [title, ...rest] = grid.rows[0]!.boxes;
    expect(rest).toEqual([]);
    expect(title!.width).toBe(grid.totalWidth);
    expect(title!.bold).toBe(true);
  });

  it('offers tracking only in the cells the document left for the student', () => {
    const offered = sheetGrid(sheet, true).rows.flatMap((row) => row.boxes.filter((box) => box.tracking).map((box) => `${box.r}:${box.c}:${box.tracking}`));
    expect(offered).toEqual(['2:1:both', '2:4:both', '3:1:both']);
  });

  it("'Show original only' offers nothing", () => {
    expect(sheetGrid(sheet, false).rows.flatMap((row) => row.boxes).some((box) => box.tracking)).toBe(false);
  });

  it("names a control after its own table's row, as the web app does", () => {
    const cells = sheet.rows[2]!.cells;
    expect(sheetRowName(cells, 2, 1, [1, 4])).toBe('Introduction to Widgetry');
    expect(sheetRowName(cells, 2, 4, [1, 4])).toBe('WIDG 101');
    expect(sheetRowName([], 7, 1, [1])).toBe('row 8');
  });
});

describe('a Word table on a phone', () => {
  const rows = [
    [{ runs: [{ text: 'Course' }], header: true }, { runs: [{ text: 'Status' }], header: true }],
    [{ runs: [{ text: 'WIDG 101 ' }, { text: 'Introduction to Widgetry', bold: true }] }, { runs: [] }],
  ];

  it('names a row by what it says, and sizes columns by their content', () => {
    expect(tableRowName(rows[1]!, 1, [1])).toBe('WIDG 101 Introduction to Widgetry');
    expect(tableRowName([{ runs: [] }], 4, [])).toBe('row 5');
    const widths = tableWidths(rows, [1], true);
    expect(widths[0]).toBeGreaterThan(MIN_COLUMN_WIDTH);
    expect(widths[1]).toBe(TRACKING_COLUMN_WIDTH);
  });
});

describe('a marker placed by touch', () => {
  it('is stored as fractions of the picture, the numbers the web app stores', () => {
    expect(touchToFraction({ x: 100, y: 50 }, { width: 400, height: 200 })).toEqual({ x: 0.25, y: 0.25 });
  });

  it('is the same place whatever size the picture is drawn at', () => {
    const small = touchToFraction({ x: 90, y: 30 }, { width: 360, height: 240 });
    const zoomed = touchToFraction({ x: 270, y: 90 }, { width: 1080, height: 720 });
    expect(zoomed).toEqual(small);
  });

  it('never lands outside the picture, and needs a picture that has been laid out', () => {
    expect(touchToFraction({ x: -5, y: 900 }, { width: 400, height: 200 })).toEqual({ x: 0, y: 1 });
    expect(touchToFraction({ x: 10, y: 10 }, { width: 0, height: 0 })).toBeNull();
  });

  it('draws the picture at its own shape', () => {
    expect(fitPicture({ width: 640, height: 420 }, 320)).toEqual({ width: 320, height: 210 });
    expect(fitPicture({ width: 640, height: 420 }, 320, 2)).toEqual({ width: 640, height: 420 });
    expect(fitPicture({ width: 0, height: 0 }, 320)).toEqual({ width: 0, height: 0 });
  });
});

describe('what the mobile app offers for each kind of document', () => {
  const kinds = {
    checklist: { previewKind: 'spreadsheet', inlineTracking: true, renderStatus: 'ready' },
    coursePlan: { previewKind: 'document', inlineTracking: false, renderStatus: 'ready' },
    flowchart: { previewKind: 'image', inlineTracking: false, renderStatus: 'ready' },
    pdf: { previewKind: 'pdf', inlineTracking: false, renderStatus: 'ready' },
    noPreview: { previewKind: null, inlineTracking: false, renderStatus: 'original_only' },
  } as const;

  it('promises only what the format supports', () => {
    expect(trackingWays(kinds.checklist)).toEqual({ inPlace: true, chooseCell: true, placeMarker: false, myList: true });
    expect(trackingWays(kinds.coursePlan)).toEqual({ inPlace: false, chooseCell: true, placeMarker: false, myList: true });
    expect(trackingWays(kinds.flowchart)).toEqual({ inPlace: false, chooseCell: false, placeMarker: true, myList: true });
    expect(trackingWays(kinds.pdf)).toEqual({ inPlace: false, chooseCell: false, placeMarker: true, myList: true });
    expect(trackingWays(kinds.noPreview)).toEqual({ inPlace: false, chooseCell: false, placeMarker: false, myList: true });
  });

  it('always has My Tracking, so every document can be tracked', () => {
    for (const kind of Object.values(kinds)) expect(trackingWays(kind).myList).toBe(true);
  });

  it('never calls tracking "editing" the document', () => {
    for (const kind of Object.values(kinds)) expect(trackingHint(kind)).not.toMatch(/edit/i);
    expect(trackingHint(kinds.checklist)).toMatch(/never changed/);
    expect(trackingHint(kinds.pdf)).toMatch(/My Tracking/);
  });

  it('lets a detached entry go back only into a document that has such a place', () => {
    expect(canPlaceAgain({ anchorType: 'sheet_cell' }, kinds.checklist)).toBe(true);
    expect(canPlaceAgain({ anchorType: 'sheet_cell' }, kinds.coursePlan)).toBe(false);
    expect(canPlaceAgain({ anchorType: 'doc_item' }, kinds.coursePlan)).toBe(true);
    expect(canPlaceAgain({ anchorType: 'point' }, kinds.flowchart)).toBe(true);
    expect(canPlaceAgain({ anchorType: 'point' }, kinds.pdf)).toBe(true);
    expect(canPlaceAgain({ anchorType: 'manual' }, kinds.checklist)).toBe(false);
  });

  it('describes where a marker sits', () => {
    expect(describePlace(entry({ anchorType: 'point', anchor: { page: 2, x: 0.1, y: 0.1 } }), kinds.pdf)).toBe('Marker on page 3');
    expect(describePlace(entry({ anchorType: 'point', anchor: { page: 0, x: 0.1, y: 0.1 } }), kinds.flowchart)).toBe('Marker on the picture');
    expect(describePlace(entry({ itemLabel: 'WIDG 101' }), kinds.pdf)).toBe('WIDG 101');
  });
});

describe('the same data as the web app', () => {
  it('offers the same statuses and quarters, with the same values', () => {
    expect(TRACKING_STATUS_OPTIONS.map((o) => o.value)).toEqual(['not_started', 'planned', 'in_progress', 'completed']);
    expect(TRACKING_TERM_OPTIONS.map((o) => o.value)).toEqual(['fall', 'winter', 'spring', 'summer']);
  });

  it('gives a quarter the year of the academic year in progress', () => {
    const september = new Date(2026, 8, 28);
    expect(defaultYearForTerm('fall', september)).toBe(2026);
    expect(defaultYearForTerm('winter', september)).toBe(2027);
    expect(defaultYearForTerm('spring', september)).toBe(2027);
  });

  it('finds the entry of a cell by where it sits, whatever its key', () => {
    const placed = entry({ key: 'id:9', anchorType: 'sheet_cell', anchor: { sheet: 0, row: 3, col: 1 }, status: 'completed' });
    const detached = entry({ key: 'id:8', anchorType: 'sheet_cell', anchor: { sheet: 0, row: 2, col: 1 }, detached: true });
    expect(placeKeyOf(placed)).toBe(cellKey('sheet_cell', { sheet: 0, row: 3, col: 1 }));
    expect(placeKeyOf(detached)).toBeNull();
    expect([...entriesByPlace([placed, detached]).keys()]).toEqual(['sheet:0:3:1']);
  });

  it('never puts an entry where part of it would be lost', () => {
    const both = { status: 'completed', term: 'fall' };
    expect(canHold('both', both)).toBe(true);
    expect(canHold('status', both)).toBe(false);
    expect(canHold('term', both)).toBe(false);
    expect(canHold('status', { status: 'completed', term: null })).toBe(true);
  });

  it('says what an entry holds, and what a replacement did', () => {
    expect(entrySummary({ status: 'completed', term: 'fall', termYear: 2025 })).toBe('Completed, Fall 2025');
    expect(entrySummary({ status: null, term: null, termYear: null })).toBe('no status yet');
    expect(replacementSummary({ kept: 2, detached: 0, moved: 2 })).toMatch(/followed their pages/);
    expect(replacementSummary({ kept: 0, detached: 1 })).toMatch(/nothing is shown against the wrong requirement/);
  });

  it('checks a chosen file as the web app does', () => {
    expect(validateChecksheetFile({ name: 'major.xlsx', size: 10 }, MB)).toEqual({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(validateChecksheetFile({ name: 'old.xls', size: 10 }, MB)).toEqual({ contentType: 'application/vnd.ms-excel' });
    expect(validateChecksheetFile({ name: 'photo.heic', size: 10 }, MB)).toHaveProperty('error');
    expect(validateChecksheetFile({ name: 'big.pdf', size: 2 * MB }, MB)).toEqual({ error: 'File exceeds the 1 MB limit.' });
    expect(validateChecksheetFile({ name: 'empty.pdf', size: 0 }, MB)).toEqual({ error: 'This file is empty.' });
  });
});

describe('saving from a phone', () => {
  const api = () => {
    let revision = 0;
    const calls: string[] = [];
    return {
      calls,
      create: vi.fn(async (request: object) => {
        calls.push(`create ${JSON.stringify(request)}`);
        return { id: 7, revision: ++revision };
      }),
      update: vi.fn(async (id: number, request: object) => {
        calls.push(`update ${id} ${JSON.stringify(request)}`);
        return { id, revision: ++revision };
      }),
      remove: vi.fn(async (id: number) => void calls.push(`remove ${id}`)),
    };
  };
  const events = () => ({ onState: vi.fn(), onSaved: vi.fn(), onRemoved: vi.fn(), onConflict: vi.fn() });

  it('creates an entry once, then updates it with the revision the server returned', async () => {
    const server = api();
    const queue = new TrackingSaveQueue(server, events());
    queue.declare('sheet:0:2:1', { anchorType: 'sheet_cell', anchor: { sheet: 0, row: 2, col: 1 } });
    queue.save('sheet:0:2:1', { status: 'completed' });
    queue.save('sheet:0:2:1', { term: 'fall', termYear: 2026 });
    await queue.flush();
    expect(server.calls).toEqual([
      'create {"anchorType":"sheet_cell","anchor":{"sheet":0,"row":2,"col":1},"status":"completed"}',
      'update 7 {"term":"fall","termYear":2026,"expectedRevision":1}',
    ]);
    expect(queue.hasUnsaved()).toBe(false);
  });

  it('sends what is waiting when the document is closed', async () => {
    const server = api();
    const queue = new TrackingSaveQueue(server, events());
    queue.adopt('id:3', { id: 3, revision: 4 });
    queue.save('id:3', { note: 'Ask my advisor' }, { delayMs: 60_000 });
    expect(server.update).not.toHaveBeenCalled();
    await queue.flush();
    expect(server.calls).toEqual(['update 3 {"note":"Ask my advisor","expectedRevision":4}']);
  });

  it('shows the newer version when the entry was changed in the web app meanwhile', async () => {
    const server = api();
    server.update.mockRejectedValueOnce(new SaveConflict({ id: 3, revision: 9 }));
    const listener = events();
    const queue = new TrackingSaveQueue(server, listener);
    queue.adopt('id:3', { id: 3, revision: 4 });
    queue.save('id:3', { status: 'planned' });
    await queue.flush();
    expect(listener.onConflict).toHaveBeenCalledWith('id:3', { id: 3, revision: 9 });
  });
});
