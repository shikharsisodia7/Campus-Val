import { Fragment, useMemo, useState } from "react";
import type { ChecksheetDocBlock, ChecksheetDocRun, ChecksheetDocTableCell } from "@workspace/api-client-react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { cellKey, itemKey, type ChecksheetTracking } from "@/hooks/use-degree-checksheets";
import { MyTrackingTag, StatusSelect, TermSelect, TRACKING_HINT } from "./TrackingControls";
import { PICKABLE, PickItemToolbar, TrackedItem } from "./TrackedItem";
import { safeExternalUrl } from "./checksheet-format";

/**
 * A Word document, shown from the blocks the server read out of it: headings,
 * paragraphs, lists, tables and pictures, in the document's own order and
 * wording.
 *
 * There is no HTML from the file here to sanitize. Every piece of text is a
 * React text node; every element on the page is one this component chose. A
 * link is shown only when it is a plain web address, and opens in a new tab
 * without handing the page over to it.
 *
 * Word's page layout is not reproduced; the original file has it.
 */
export function ChecksheetDocumentView({
  documentId,
  title,
  blocks,
  tracking,
  showTracking,
}: {
  documentId: number;
  title: string;
  blocks: ChecksheetDocBlock[];
  tracking: ChecksheetTracking;
  showTracking: boolean;
}) {
  const groups = useMemo(() => groupLists(blocks), [blocks]);
  const [picking, setPicking] = useState(false);
  const hasTable = blocks.some((block) => block.type === "table");
  const chosen = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "doc_item").length;

  return (
    <div className="space-y-2">
    {showTracking && hasTable && <PickItemToolbar picking={picking} onChange={setPicking} count={chosen} />}
    <div
      className="max-h-[75vh] overflow-auto rounded-md border border-border bg-background"
      tabIndex={0}
      role="region"
      aria-label={`${title} — document, scrollable`}
      data-testid={`checksheet-document-${documentId}`}
    >
      <div className="mx-auto max-w-4xl space-y-3 p-4 text-sm leading-relaxed sm:p-6">
        {groups.map((group) =>
          group.kind === "list" ? (
            <List key={group.start} items={group.items} />
          ) : (
            <Block
              key={group.index}
              block={group.block}
              index={group.index}
              title={title}
              tracking={tracking}
              showTracking={showTracking}
              picking={showTracking && picking}
              onPicked={() => setPicking(false)}
            />
          ),
        )}
      </div>
    </div>
    </div>
  );
}

type ListItem = { index: number; block: ChecksheetDocBlock };
type Group = { kind: "list"; start: number; items: ListItem[] } | { kind: "block"; index: number; block: ChecksheetDocBlock };

/** Consecutive list items are shown as one list. */
function groupLists(blocks: ChecksheetDocBlock[]): Group[] {
  const groups: Group[] = [];
  blocks.forEach((block, index) => {
    const last = groups[groups.length - 1];
    if (block.type !== "list-item") {
      groups.push({ kind: "block", index, block });
    } else if (last?.kind === "list" && !!last.items[0]!.block.ordered === !!block.ordered) {
      last.items.push({ index, block });
    } else {
      groups.push({ kind: "list", start: index, items: [{ index, block }] });
    }
  });
  return groups;
}

function Runs({ runs }: { runs: ChecksheetDocRun[] | undefined }) {
  return (
    <>
      {(runs ?? []).map((run, i) => {
        const href = safeExternalUrl(run.href);
        const className = cn(run.bold && "font-semibold", run.italic && "italic", run.underline && !href && "underline");
        const text = <span className={cn("whitespace-pre-wrap", className)}>{run.text}</span>;
        return href ? (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {text}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <Fragment key={i}>{text}</Fragment>
        );
      })}
    </>
  );
}

function List({ items }: { items: ListItem[] }) {
  const Tag = items[0]!.block.ordered ? "ol" : "ul";
  return (
    <Tag className={cn("space-y-1 pl-6", items[0]!.block.ordered ? "list-decimal" : "list-disc")}>
      {items.map(({ index, block }) => (
        <li key={index} style={block.depth ? { marginLeft: `${Math.min(block.depth, 8) * 1.25}rem` } : undefined}>
          <Runs runs={block.runs} />
        </li>
      ))}
    </Tag>
  );
}

const HEADING = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"];

function Block({
  block,
  index,
  title,
  tracking,
  showTracking,
  picking,
  onPicked,
}: {
  block: ChecksheetDocBlock;
  index: number;
  title: string;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  picking: boolean;
  onPicked: () => void;
}) {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level ?? 1, 1), 6);
      // The page already has its own h1–h3; the document's headings follow them.
      return (
        <p role="heading" aria-level={Math.min(level + 3, 6)} className={cn("pt-1 font-serif font-semibold", HEADING[level - 1])}>
          <Runs runs={block.runs} />
        </p>
      );
    }
    case "paragraph":
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      );
    case "table":
      return (
        <Table block={block} index={index} tracking={tracking} showTracking={showTracking} picking={picking} onPicked={onPicked} />
      );
    case "image":
      return block.mime && block.data && /^[A-Za-z0-9+/=]+$/.test(block.data) ? (
        <img
          src={`data:${block.mime};base64,${block.data}`}
          alt={block.alt || `Picture in ${title}`}
          className="h-auto max-w-full rounded border border-border"
        />
      ) : null;
    case "image-omitted":
      return (
        <p className="flex items-center gap-2 rounded border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          A picture in this document is not shown in the preview{block.alt ? ` (“${block.alt}”)` : ""}. Open the
          original file to see it.
        </p>
      );
    default:
      return null;
  }
}

function Table({
  block,
  index,
  tracking,
  showTracking,
  picking,
  onPicked,
}: {
  block: ChecksheetDocBlock;
  index: number;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  picking: boolean;
  onPicked: () => void;
}) {
  const rows = block.rows ?? [];
  const slots = new Map((block.tracking?.cells ?? []).map((cell) => [`${cell.r}:${cell.c}`, cell]));
  const tracked = new Set((block.tracking?.columns ?? []).map((column) => column.c));
  const entries = new Map(tracking.entries.map((entry) => [entry.key, entry]));
  const textOf = (cell: ChecksheetDocTableCell | undefined) => (cell?.runs ?? []).map((run) => run.text).join("").trim();

  return (
    <div className="overflow-x-auto" data-testid={`checksheet-doc-table-${index}`}>
      <table className="w-max min-w-full border-collapse text-[13px]">
        <tbody>
          {rows.map((row, r) => {
            const name =
              row
                .filter((_, c) => !tracked.has(c))
                .map(textOf)
                .find((text) => text !== "")
                ?.slice(0, 120) ?? `row ${r + 1}`;
            return (
              <tr key={r}>
                {row.map((cell, c) => {
                  const slot = showTracking && textOf(cell) === "" ? slots.get(`${r}:${c}`) : undefined;
                  if (slot) {
                    const anchor = { block: index, row: r, col: c };
                    const entry = entries.get(cellKey("doc_cell", anchor));
                    return (
                      <td
                        key={c}
                        className={cn(
                          "border border-primary/30 bg-primary/[0.04] p-1 align-top",
                          slot.field === "term" ? "min-w-[13rem]" : "min-w-[9.5rem]",
                        )}
                        title={TRACKING_HINT}
                        data-tracking-cell={slot.field}
                        data-testid={`checksheet-doc-cell-${index}-${r}-${c}`}
                      >
                        <MyTrackingTag className="mb-0.5" />
                        {slot.field === "status" ? (
                          <StatusSelect
                            value={entry?.status ?? null}
                            label={`My status for ${name}`}
                            onChange={(status) => tracking.setCell("doc_cell", anchor, "status", { status })}
                            testId={`checksheet-doc-cell-status-${index}-${r}-${c}`}
                          />
                        ) : (
                          <TermSelect
                            term={entry?.term ?? null}
                            year={entry?.termYear ?? null}
                            label={`My quarter for ${name}`}
                            onChange={(term, termYear) => tracking.setCell("doc_cell", anchor, "term", { term, termYear })}
                            testId={`checksheet-doc-cell-term-${index}-${r}-${c}`}
                          />
                        )}
                      </td>
                    );
                  }
                  const Cell = cell.header ? "th" : "td";
                  const text = textOf(cell);
                  const item = { block: index, row: r, col: c };
                  const chosen = showTracking ? entries.get(itemKey("doc_item", item)) : undefined;
                  const pickable = picking && text !== "" && !chosen;
                  const pick = () => {
                    tracking.addItem("doc_item", item, text.slice(0, 200));
                    onPicked();
                  };
                  return (
                    <Cell
                      key={c}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      scope={cell.header ? "col" : undefined}
                      className={cn(
                        "max-w-[28rem] border border-border/70 px-2 py-1 text-left align-top font-normal",
                        cell.header && "bg-muted/60 font-semibold",
                        pickable && PICKABLE,
                      )}
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
                      data-testid={`checksheet-doc-source-${index}-${r}-${c}`}
                    >
                      <Runs runs={cell.runs} />
                      {chosen && (
                        <TrackedItem
                          entry={chosen}
                          name={text.slice(0, 120)}
                          tracking={tracking}
                          testId={`checksheet-doc-item-${index}-${r}-${c}`}
                        />
                      )}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
