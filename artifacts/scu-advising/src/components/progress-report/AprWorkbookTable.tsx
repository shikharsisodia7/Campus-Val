import { useMemo } from "react";
import type { AprSheet } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * One worksheet of an uploaded Workday APR, shown as it was exported.
 *
 * This is a copy, not an interpretation: every row, every column (Academic
 * Period, Units and Grade included), the source order, the source wording,
 * merged cells, bold headings, fills and indentation. It is read-only — there
 * is nothing here to edit, tick or confirm.
 *
 * Cell text is rendered as a React text node, so whatever a spreadsheet cell
 * contains is displayed literally and can never become markup or a link.
 */

export const columnLetter = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

export interface Grid {
  rowIndexes: number[];
  cellAt: Map<string, AprSheet["rows"][number]["cells"][number]>;
  spanAt: Map<string, { rowSpan: number; colSpan: number }>;
  covered: Set<string>;
}

export function buildGrid(sheet: AprSheet): Grid {
  const cellAt: Grid["cellAt"] = new Map();
  for (const row of sheet.rows) for (const cell of row.cells) cellAt.set(`${row.r}:${cell.c}`, cell);

  // Blank source rows are kept (they separate blocks in the export), but a long
  // run of them is shown as one spacer so an empty region does not fill the page.
  const rowIndexes: number[] = [];
  let previous = -1;
  for (const row of sheet.rows) {
    if (row.r - previous > 1) rowIndexes.push(row.r - 1);
    rowIndexes.push(row.r);
    previous = row.r;
  }
  const shown = new Set(rowIndexes);

  const spanAt: Grid["spanAt"] = new Map();
  const covered = new Set<string>();
  for (const merge of sheet.merges) {
    // A merge spans source rows; count only the ones actually rendered.
    let rowSpan = 0;
    for (let r = merge.r; r < merge.r + merge.rowSpan; r++) if (shown.has(r)) rowSpan += 1;
    const colSpan = Math.min(merge.colSpan, sheet.columnCount - merge.c);
    if (rowSpan < 1 || colSpan < 1 || !shown.has(merge.r)) continue;
    spanAt.set(`${merge.r}:${merge.c}`, { rowSpan, colSpan });
    for (let r = merge.r; r < merge.r + merge.rowSpan; r++) {
      for (let c = merge.c; c < merge.c + colSpan; c++) {
        if (r !== merge.r || c !== merge.c) covered.add(`${r}:${c}`);
      }
    }
  }
  return { rowIndexes, cellAt, spanAt, covered };
}

export function AprWorkbookTable({ sheet, caption }: { sheet: AprSheet; caption: string }) {
  const grid = useMemo(() => buildGrid(sheet), [sheet]);
  const columns = useMemo(() => Array.from({ length: sheet.columnCount }, (_, c) => c), [sheet.columnCount]);

  if (sheet.rows.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="apr-sheet-empty">
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
      data-testid="apr-workbook-scroll"
    >
      <table
        className="w-max min-w-full border-collapse text-[12px] leading-snug text-foreground"
        data-testid="apr-workbook-table"
      >
        <caption className="sr-only">{caption}. Read-only copy of the uploaded Workday workbook.</caption>
        <colgroup>
          <col style={{ width: "2.75rem" }} />
          {columns.map((c) => {
            const width = sheet.columnWidths[c];
            // Excel widths are in characters; ~0.6rem per character, within sane bounds.
            const rem = width ? Math.min(Math.max(width * 0.6, 4), 34) : 9;
            return <col key={c} style={{ width: `${rem}rem`, minWidth: `${Math.min(rem, 8)}rem` }} />;
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
                    )}
                    style={cell?.indent ? { paddingLeft: `${0.375 + cell.indent * 0.9}rem` } : undefined}
                  >
                    {cell?.text ?? ""}
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
