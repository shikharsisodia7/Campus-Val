import { useMemo, useState } from "react";
import type { ChecksheetSheet, ChecksheetTrackingCell } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { buildGrid, columnLetter } from "@/components/progress-report/AprWorkbookTable";
import type { ChecksheetTracking } from "@/hooks/use-degree-checksheets";
import { cellKey, itemKey } from "@/hooks/use-degree-checksheets";
import { MyTrackingTag, StatusSelect, TermSelect, TRACKING_HINT } from "./TrackingControls";
import { PICKABLE, PickItemToolbar, TrackedItem } from "./TrackedItem";

/**
 * A department workbook, shown as it was uploaded, with the student's own
 * tracking controls in the cells the department left empty for that purpose.
 *
 * The grid is the same read-only copy the APR page shows: every row and
 * column, source order, source wording, merged cells, bold headings. Cell
 * text is rendered as a React text node, so whatever a cell contains is
 * displayed literally and can never become markup or a link.
 *
 * A tracking control appears ONLY in a cell the server marked as the
 * student's. What is chosen there is stored as a tracking entry; the workbook
 * and this copy of it are never written to.
 */
export function ChecksheetSpreadsheetView({
  documentId,
  title,
  sheets,
  tracking,
  showTracking,
}: {
  documentId: number;
  title: string;
  sheets: ChecksheetSheet[];
  tracking: ChecksheetTracking;
  /** Off shows the source alone, exactly as uploaded. */
  showTracking: boolean;
}) {
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState(false);
  const index = Math.min(active, sheets.length - 1);
  const sheet = sheets[index];
  if (!sheet) return null;
  const chosen = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "sheet_item").length;

  return (
    <div className="space-y-2" data-testid={`checksheet-spreadsheet-${documentId}`}>
      {showTracking && <PickItemToolbar picking={picking} onChange={setPicking} count={chosen} />}
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Worksheets" className="flex flex-wrap gap-1" data-testid="checksheet-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setActive(i)}
              className={cn(
                "min-h-9 rounded-t-md border px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                i === index
                  ? "border-border border-b-background bg-background font-semibold"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
              data-testid={`checksheet-sheet-tab-${s.index}`}
            >
              {s.name}
              {s.visibility === "hidden" ? " (hidden in Excel)" : ""}
              {s.rows.length === 0 ? " (empty)" : ""}
            </button>
          ))}
        </div>
      )}
      <SheetGrid
        sheet={sheet}
        sheetPosition={index}
        caption={`${title} — ${sheet.name}`}
        tracking={tracking}
        showTracking={showTracking}
        picking={showTracking && picking}
        onPicked={() => setPicking(false)}
      />
    </div>
  );
}

function SheetGrid({
  sheet,
  sheetPosition,
  caption,
  tracking,
  showTracking,
  picking,
  onPicked,
}: {
  sheet: ChecksheetSheet;
  sheetPosition: number;
  caption: string;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  picking: boolean;
  onPicked: () => void;
}) {
  const grid = useMemo(() => buildGrid(sheet), [sheet]);
  const columns = useMemo(() => Array.from({ length: sheet.columnCount }, (_, c) => c), [sheet.columnCount]);
  const trackingCells = useMemo(() => {
    const map = new Map<string, ChecksheetTrackingCell>();
    for (const cell of sheet.tracking.cells) map.set(`${cell.r}:${cell.c}`, cell);
    return map;
  }, [sheet.tracking.cells]);
  const trackingColumns = useMemo(() => new Set(sheet.tracking.columns.map((c) => c.c)), [sheet.tracking.columns]);
  const entries = useMemo(() => new Map(tracking.entries.map((entry) => [entry.key, entry])), [tracking.entries]);

  /** What a row is about, in the department's own words: its first cell that is not a tracking column. */
  const rowName = (r: number): string => {
    const row = sheet.rows.find((candidate) => candidate.r === r);
    const parts = (row?.cells ?? []).filter((cell) => !trackingColumns.has(cell.c) && cell.text.trim() !== "");
    const name = parts
      .slice(0, 2)
      .map((cell) => cell.text.trim())
      .join(", ");
    return name ? name.slice(0, 120) : `row ${r + 1}`;
  };

  if (sheet.rows.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="checksheet-sheet-empty">
        This worksheet is empty in the uploaded file.
      </p>
    );
  }

  return (
    <div
      className="max-h-[70vh] overflow-auto rounded-md border border-border bg-background"
      tabIndex={0}
      role="region"
      aria-label={`${caption} — scrollable`}
      data-testid="checksheet-grid-scroll"
    >
      <table
        className="w-max min-w-full border-collapse text-[12px] leading-snug text-foreground"
        data-testid="checksheet-grid"
      >
        <caption className="sr-only">
          {caption}. A copy of the uploaded workbook.{" "}
          {showTracking
            ? "Only the cells marked “My tracking” can be filled in, and doing so does not change the original document."
            : "Shown as uploaded, without your tracking."}
        </caption>
        <colgroup>
          <col style={{ width: "2.75rem" }} />
          {columns.map((c) => {
            const width = sheet.columnWidths[c];
            // Excel widths are in characters; ~0.6rem per character, within sane bounds.
            const rem = width ? Math.min(Math.max(width * 0.6, 4), 34) : 9;
            // A tracking column must fit its control, whatever the file's width.
            const column = sheet.tracking.columns.find((t) => t.c === c);
            const min = showTracking && column ? (column.field === "term" ? 13 : 9.5) : Math.min(rem, 8);
            return <col key={c} style={{ width: `${Math.max(rem, min)}rem`, minWidth: `${min}rem` }} />;
          })}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-20 border border-border bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground"
            >
              <span className="sr-only">Row</span>
            </th>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="sticky top-0 z-10 border border-border bg-muted px-1 py-0.5 text-center text-[10px] font-normal text-muted-foreground"
              >
                {columnLetter(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rowIndexes.map((r) => (
            <tr key={r} data-source-row={r + 1}>
              <th
                scope="row"
                className="sticky left-0 z-10 border border-border bg-muted px-1 py-0.5 text-right text-[10px] font-normal tabular-nums text-muted-foreground"
              >
                {r + 1}
              </th>
              {columns.map((c) => {
                const key = `${r}:${c}`;
                if (grid.covered.has(key)) return null;
                const cell = grid.cellAt.get(key);
                const span = grid.spanAt.get(key);
                const slot = showTracking && !cell ? trackingCells.get(key) : undefined;

                if (slot) {
                  const anchor = { sheet: sheetPosition, row: r, col: c };
                  const entry = entries.get(cellKey("sheet_cell", anchor));
                  const name = rowName(r);
                  return (
                    <td
                      key={c}
                      className="border border-primary/30 bg-primary/[0.04] p-1 align-top"
                      data-tracking-cell={slot.field}
                      data-testid={`checksheet-cell-${sheetPosition}-${r}-${c}`}
                      title={TRACKING_HINT}
                    >
                      <MyTrackingTag className="mb-0.5" />
                      {slot.field === "status" ? (
                        <StatusSelect
                          value={entry?.status ?? null}
                          label={`My status for ${name}`}
                          onChange={(status) => tracking.setCell("sheet_cell", anchor, "status", { status })}
                          testId={`checksheet-cell-status-${sheetPosition}-${r}-${c}`}
                        />
                      ) : (
                        <TermSelect
                          term={entry?.term ?? null}
                          year={entry?.termYear ?? null}
                          label={`My quarter for ${name}`}
                          onChange={(term, termYear) => tracking.setCell("sheet_cell", anchor, "term", { term, termYear })}
                          testId={`checksheet-cell-term-${sheetPosition}-${r}-${c}`}
                        />
                      )}
                    </td>
                  );
                }

                const text = cell?.text.trim() ?? "";
                const item = { sheet: sheetPosition, row: r, col: c };
                const chosen = showTracking && cell ? entries.get(itemKey("sheet_item", item)) : undefined;
                const pickable = picking && text !== "" && !chosen;
                const pick = () => {
                  tracking.addItem("sheet_item", item, text.slice(0, 200));
                  onPicked();
                };
                return (
                  <td
                    key={c}
                    rowSpan={span?.rowSpan}
                    colSpan={span?.colSpan}
                    className={cn(
                      "whitespace-pre-wrap break-words border border-border/70 px-1.5 py-1 align-top",
                      cell?.bold && "font-semibold",
                      cell?.italic && "italic",
                      cell?.filled && "bg-muted/60",
                      cell?.align === "center" && "text-center",
                      cell?.align === "right" && "text-right",
                      pickable && PICKABLE,
                    )}
                    style={cell?.indent ? { paddingLeft: `${0.375 + cell.indent * 0.9}rem` } : undefined}
                    {...(pickable
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-label": `Track ${text.slice(0, 120)}`,
                          onClick: pick,
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              pick();
                            }
                          },
                        }
                      : {})}
                    data-pickable={pickable ? "true" : undefined}
                  >
                    {cell?.text ?? ""}
                    {chosen && (
                      <TrackedItem
                        entry={chosen}
                        name={text.slice(0, 120)}
                        tracking={tracking}
                        testId={`checksheet-item-${sheetPosition}-${r}-${c}`}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
