import { useId, useState } from "react";
import { Link } from "wouter";
import type {
  AprSidebarGroup,
  AprSidebarSheet,
  ProgressReportSidebarDocument,
} from "@workspace/api-client-react";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, FileWarning, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAprSidebar } from "@/hooks/use-apr-documents";
import { aprCategoryLabel, formatUploadDate } from "./apr-format";

/**
 * The APR reference in the RIGHT column of Degree Plan, Tentative Degree Plan
 * and Quarter Plan — one component, so it looks the same every time.
 *
 * It shows what Workday says, in Workday's words, for the student to compare
 * against the plan by eye. It does NOT match courses, tick off requirements or
 * draw a conclusion. The only processing is presentation: rows are filed under
 * collapsible headings, and the Academic Period, Units and Grade columns are
 * absent (the server never sends them to a planning page).
 *
 * Opening and closing a section changes what is visible — nothing else.
 */
export function WorkdayAprPanel() {
  const { data, isLoading, isError, refetch } = useAprSidebar();
  const documents = data?.documents ?? [];

  return (
    <Card
      className="flex h-full min-h-0 flex-col overflow-hidden border-border/60 bg-card shadow-sm"
      data-testid="workday-apr-panel"
    >
      <div
        className="flex items-start justify-between gap-2 border-b border-border/60 px-3 py-2"
        data-testid="apr-column-header"
      >
        <div className="min-w-0">
          <h2 className="font-serif text-base font-bold leading-tight">Academic Progress Reports</h2>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workday reference · read-only
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]">
          <Link href="/progress-report" data-testid="link-view-full-aprs">
            <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" />
            View Full APRs
          </Link>
        </Button>
      </div>

      {/* A native scroller, not Radix ScrollArea: ScrollArea wraps its content in a
          `display: table` element, which lets long unbreakable text widen the
          column past the panel. Focusable so keyboard users can scroll it. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        tabIndex={0}
        role="region"
        aria-label="Academic Progress Reports from Workday"
        data-testid="apr-scroll-region"
      >
        <div className="min-w-0 space-y-2 p-2">
          {isLoading && (
            <p className="flex items-center gap-1.5 p-1 text-xs text-muted-foreground" role="status" data-testid="apr-loading">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading…
            </p>
          )}

          {isError && !isLoading && (
            <div className="p-1 text-xs" role="alert" data-testid="apr-load-error">
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Couldn't load your APRs right now. Your plan is not affected.
              </p>
              <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={() => void refetch()} data-testid="apr-retry">
                Try again
              </Button>
            </div>
          )}

          {data?.available === false && (
            <p className="flex items-start gap-1.5 p-1 text-xs text-muted-foreground" data-testid="apr-uploads-unavailable">
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              File uploads aren't configured in this environment.
            </p>
          )}

          {data?.available === true && documents.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-xs" data-testid="apr-none-uploaded">
              <p className="font-semibold text-foreground">No APRs uploaded yet.</p>
              <p className="mt-1 text-muted-foreground">
                Upload a Workday APR to compare your official progress while planning. It's optional —
                planning works without one.
              </p>
              <Button asChild size="sm" className="mt-2 h-7 text-xs">
                <Link href="/progress-report" data-testid="apr-upload-link">
                  Upload APR
                </Link>
              </Button>
            </div>
          )}

          {documents.length > 0 && (
            <p className="px-1 text-[11px] leading-snug text-muted-foreground" data-testid="apr-official-reference">
              Workday's own wording, for comparison with your plan. Academic Period, Units and Grade
              are shown only on the full APR page.
            </p>
          )}

          {documents.map((doc, i) => (
            // The first APR opens; the others start collapsed to their header.
            <SidebarDocument key={doc.report.id} doc={doc} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function SidebarDocument({ doc, defaultOpen }: { doc: ProgressReportSidebarDocument; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const { report } = doc;
  const sheets = doc.sheets.filter((s) => s.structured || s.warnings.includes("header_not_found"));
  const structured = sheets.filter((s) => s.structured && s.groups.length > 0);

  return (
    <section
      className="overflow-hidden rounded-md border border-border bg-background"
      data-testid={`apr-sidebar-document-${report.id}`}
      data-state={doc.state}
    >
      <h3 className="m-0">
        <button
          type="button"
          className="flex w-full items-start gap-1.5 bg-muted/50 px-2 py-1.5 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          data-testid={`apr-sidebar-document-toggle-${report.id}`}
        >
          {open ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block break-words text-[13px] font-semibold leading-tight text-foreground">
              {report.label}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {aprCategoryLabel(report.category)} ·{" "}
              <span data-testid={`apr-sidebar-uploaded-${report.id}`}>{formatUploadDate(report.uploadedAt)}</span>
            </span>
          </span>
        </button>
      </h3>

      <div id={panelId} hidden={!open}>
        {open && (
          <div className="space-y-1.5 p-1.5">
            {doc.state === "import_failed" && (
              <Notice tone="warn" testId="apr-sidebar-failed">
                {report.importErrorMessage ?? "This file could not be processed."} Your other APRs are
                not affected. <FullLink>Replace it on the APR page</FullLink>
              </Notice>
            )}
            {doc.state === "processing" && (
              <Notice tone="info" testId="apr-sidebar-processing">
                This file is still being processed.
              </Notice>
            )}
            {doc.state === "original_only" && (
              <Notice tone="info" testId="apr-sidebar-pdf">
                Uploaded as a PDF, so it can't be shown here. Export the report from Workday to Excel
                (.xlsx) to compare while planning. <FullLink>Open it on the APR page</FullLink>
              </Notice>
            )}
            {doc.state === "unrecognized_layout" && (
              <Notice tone="warn" testId="apr-sidebar-unrecognized">
                CampusVal didn't recognise this workbook's table layout, so it is not summarised here.
                Nothing was lost — the complete file is on the APR page.{" "}
                <FullLink>View the full APR</FullLink>
              </Notice>
            )}

            {structured.map((sheet) => (
              <SidebarSheet key={sheet.index} sheet={sheet} showName={structured.length > 1} />
            ))}

            {doc.state === "ready" &&
              sheets
                .filter((s) => !s.structured)
                .map((s) => (
                  <Notice key={s.index} tone="warn" testId="apr-sidebar-sheet-unrecognized">
                    Worksheet “{s.name}” has a layout CampusVal didn't recognise. It is shown in full on
                    the APR page.
                  </Notice>
                ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SidebarSheet({ sheet, showName }: { sheet: AprSidebarSheet; showName: boolean }) {
  return (
    <div className="space-y-1" data-testid={`apr-sidebar-sheet-${sheet.index}`}>
      {showName && (
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sheet.name}</p>
      )}
      {blocksOf(sheet.groups).length > 1
        ? // One Workday export can hold several programs (each major, each
          // minor). Each is its own collapsible block, titled as Workday titles it.
          blocksOf(sheet.groups).map((block, i) => (
            <SidebarBlock
              key={block.index}
              title={block.title}
              groups={block.groups}
              columns={sheet.columns.map((c) => c.header)}
              defaultOpen={i === 0}
            />
          ))
        : sheet.groups.map((group, i) => (
            <SidebarGroup
              key={group.key}
              group={group}
              columns={sheet.columns.map((c) => c.header)}
              // Every group starts collapsed except the first: the student opens what they need.
              defaultOpen={i === 0 && sheet.groups.length === 1}
            />
          ))}
      {sheet.omittedColumns.length > 0 && (
        <p className="px-1 text-[10px] text-muted-foreground" data-testid="apr-sidebar-omitted">
          Not shown here: {sheet.omittedColumns.join(", ")}.
        </p>
      )}
    </div>
  );
}

interface Block {
  index: number;
  title: string;
  groups: AprSidebarGroup[];
}

/** Consecutive groups of the same program block, in source order. */
function blocksOf(groups: AprSidebarGroup[]): Block[] {
  const blocks: Block[] = [];
  for (const group of groups) {
    const last = blocks[blocks.length - 1];
    if (last && last.index === group.blockIndex) last.groups.push(group);
    else blocks.push({ index: group.blockIndex, title: group.block ?? `Program ${group.blockIndex + 1}`, groups: [group] });
  }
  return blocks;
}

function SidebarBlock({
  title,
  groups,
  columns,
  defaultOpen,
}: {
  title: string;
  groups: AprSidebarGroup[];
  columns: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const rows = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <div className="rounded border border-border bg-muted/20" data-testid="apr-sidebar-block" data-block-title={title}>
      <h4 className="m-0">
        <button
          type="button"
          className="flex w-full items-start gap-1 px-1.5 py-1 text-left text-xs font-bold hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 break-words">{title}</span>
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
            {rows} row{rows === 1 ? "" : "s"}
          </span>
        </button>
      </h4>
      <div id={panelId} hidden={!open}>
        {open && (
          <div className="space-y-1 p-1">
            {groups.map((group) => (
              <SidebarGroup
                key={group.key}
                group={group}
                columns={columns}
                defaultOpen={groups.length === 1}
                nested
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarGroup({
  group,
  columns,
  defaultOpen,
  nested = false,
}: {
  group: AprSidebarGroup;
  columns: string[];
  defaultOpen: boolean;
  /** Inside a program block the group is one heading level deeper. */
  nested?: boolean;
}) {
  const Heading = nested ? "h5" : "h4";
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  // Column widths follow how much text each column actually holds, so a short
  // "Status" column does not take room from a long course title. Layout only.
  const template = columns
    .map((header, i) => {
      const longest = group.rows.reduce((max, row) => Math.max(max, (row.cells[i] ?? "").length), header.length);
      const weight = Math.min(2.4, Math.max(0.9, Math.min(longest, 60) / 14));
      // Wide enough for the column's longest ordinary word ("Satisfied"), so
      // Workday's status text is never split mid-word.
      const longestWord = [header, ...group.rows.map((row) => row.cells[i] ?? "")]
        .flatMap((text) => text.split(/\s+/))
        .reduce((max, word) => Math.max(max, word.length), 0);
      const minRem = Math.min(5.25, Math.max(2.5, Math.min(longestWord, 12) * 0.43 + 0.6));
      return `minmax(${minRem.toFixed(2)}rem,${weight.toFixed(2)}fr)`;
    })
    .join(" ");

  return (
    <div className="rounded border border-border/70" data-testid={`apr-sidebar-group-${group.kind}`} data-group-key={group.key}>
      <Heading className="m-0">
        <button
          type="button"
          className="flex w-full items-center gap-1 px-1.5 py-1 text-left text-xs font-semibold hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 break-words">{group.label}</span>
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
            {group.rows.length} row{group.rows.length === 1 ? "" : "s"}
          </span>
        </button>
      </Heading>
      <div id={panelId} hidden={!open}>
        {open && (
          <div role="table" aria-label={`${group.label} — from Workday`} className="border-t border-border/70 text-[11px] leading-snug">
            <div role="rowgroup">
              <div role="row" className="grid bg-muted/60" style={{ gridTemplateColumns: template }}>
                {columns.map((header) => (
                  <div
                    key={header}
                    role="columnheader"
                    className="break-words border-r border-border/60 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground last:border-r-0"
                  >
                    {header}
                  </div>
                ))}
              </div>
            </div>
            <div role="rowgroup">
              {group.rows.map((row) => (
                <div
                  key={row.r}
                  role="row"
                  className="grid border-t border-border/60"
                  style={{ gridTemplateColumns: template }}
                  data-source-row={row.r + 1}
                >
                  {row.cells.map((text, i) => (
                    <div
                      key={i}
                      role="cell"
                      className={`whitespace-pre-wrap break-words border-r border-border/60 px-1 py-0.5 last:border-r-0 ${
                        i === 0 && row.bold ? "font-semibold" : ""
                      }`}
                      style={i === 0 && row.indent ? { paddingLeft: `${0.25 + row.indent * 0.6}rem` } : undefined}
                    >
                      {text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Notice({
  tone,
  testId,
  children,
}: {
  tone: "info" | "warn";
  testId: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <p
      className={`flex items-start gap-1.5 rounded border px-1.5 py-1 text-[11px] leading-snug ${
        tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-muted/30 text-foreground/90"
      }`}
      role={tone === "warn" ? "alert" : "status"}
      data-testid={testId}
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function FullLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/progress-report" className="font-medium text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}
