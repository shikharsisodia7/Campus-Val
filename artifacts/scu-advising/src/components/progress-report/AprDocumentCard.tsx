import { useId, useState } from "react";
import {
  useDeleteProgressReportDocument,
  useGetProgressReportWorkbook,
  useUpdateProgressReportDocument,
  getGetProgressReportWorkbookQueryKey,
  type ProgressReportCategory,
  type ProgressReportDocument,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { APR_UPLOAD_PHASE_LABEL, useAprUpload, useInvalidateApr } from "@/hooks/use-apr-documents";
import { UploadZone, type SelectedFile } from "./UploadZone";
import { AprWorkbookTable } from "./AprWorkbookTable";
import {
  APR_CATEGORY_OPTIONS,
  aprCategoryLabel,
  formatBytes,
  formatUploadDateTime,
  importStatusLabel,
  originalFileUrl,
} from "./apr-format";

type Mode = "view" | "rename" | "replace";

/**
 * One uploaded APR on the APR page: a collapsible container holding the
 * read-only copy of the workbook, with the actions that apply to THIS document
 * only (rename, replace its file, delete it, open the original).
 */
export function AprDocumentCard({
  report,
  defaultOpen = false,
  maxUploadBytes,
}: {
  report: ProgressReportDocument;
  defaultOpen?: boolean;
  maxUploadBytes?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelId = useId();
  const { toast } = useToast();
  const invalidate = useInvalidateApr();

  const ready = report.importStatus === "ready";
  const Icon = report.sourceFormat === "pdf" ? FileText : FileSpreadsheet;

  const deleteMutation = useDeleteProgressReportDocument({
    mutation: {
      onSuccess: () => {
        invalidate(report.id);
        toast({ title: "APR deleted", description: `“${report.label}” and its file were removed.` });
      },
      onError: () =>
        toast({ title: "Delete failed", description: "Could not delete this APR. Please try again.", variant: "destructive" }),
    },
  });

  return (
    <Card className="overflow-hidden" data-testid={`apr-document-${report.id}`} data-apr-card={report.id}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3 sm:p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          data-testid={`apr-document-toggle-${report.id}`}
        >
          {open ? (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block break-words text-lg font-semibold leading-tight" data-testid="apr-document-label">
              {report.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {aprCategoryLabel(report.category)} ·{" "}
              <span className="font-medium text-foreground" data-testid="apr-document-uploaded">
                {formatUploadDateTime(report.uploadedAt)}
              </span>
            </span>
            <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">
              {report.fileName} · {formatBytes(report.fileSize)} · File status:{" "}
              <span data-testid="apr-document-status">{importStatusLabel(report)}</span>
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <a
              href={originalFileUrl(report.id)}
              target="_blank"
              rel="noreferrer"
              data-testid={`apr-view-original-${report.id}`}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Original file
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setMode(mode === "rename" ? "view" : "rename");
              setOpen(true);
            }}
            data-testid={`apr-rename-${report.id}`}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setMode(mode === "replace" ? "view" : "replace");
              setOpen(true);
            }}
            data-testid={`apr-replace-${report.id}`}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
            data-testid={`apr-delete-${report.id}`}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      <div id={panelId} hidden={!open} className="border-t border-border/60">
        {/* Rendered only while open, so a collapsed APR costs nothing. */}
        {open && (
          <div className="space-y-3 p-3 sm:p-4">
            {mode === "rename" && <RenameForm report={report} onDone={() => setMode("view")} />}
            {mode === "replace" && (
              <ReplaceForm report={report} maxUploadBytes={maxUploadBytes} onDone={() => setMode("view")} />
            )}

            {!ready && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                role="alert"
                data-testid={`apr-import-problem-${report.id}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{importStatusLabel(report)}</p>
                  <p className="mt-0.5">
                    {report.importErrorMessage ??
                      "This file is still being processed. Refresh the page in a moment."}
                  </p>
                  <p className="mt-1 text-xs">
                    Your other APRs are not affected. Use Replace to upload the Excel export again.
                  </p>
                </div>
              </div>
            )}

            {ready && report.sourceFormat === "xlsx" && <WorkbookView report={report} />}
            {ready && report.sourceFormat === "pdf" && <PdfView report={report} />}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="apr-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{report.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this APR and its uploaded file from CampusVal. Your other APRs,
              your plans and your Workday record are not changed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="apr-delete-cancel">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: report.id })}
              data-testid="apr-delete-confirm"
            >
              Delete this APR
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function WorkbookView({ report }: { report: ProgressReportDocument }) {
  const { data, isLoading, isError, refetch } = useGetProgressReportWorkbook(report.id, {
    query: {
      queryKey: getGetProgressReportWorkbookQueryKey(report.id),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });
  const [activeSheet, setActiveSheet] = useState(0);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="apr-workbook-loading">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading workbook…
      </p>
    );
  }
  if (isError || !data?.workbook) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm" role="alert" data-testid="apr-workbook-error">
        <p>Couldn't load this workbook right now. The original file is still available above.</p>
        <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const sheets = data.workbook.sheets;
  const sheet = sheets[Math.min(activeSheet, sheets.length - 1)];
  if (!sheet) return null;

  return (
    <div className="space-y-2" data-testid={`apr-workbook-${report.id}`}>
      {report.sourceFormat === "xlsx" && (
        <p className="text-xs text-muted-foreground" data-testid="apr-full-notice">
          Read-only copy of the uploaded Workday workbook — every row and column as exported, including
          Academic Period, Units and Grade. CampusVal has not changed, matched or judged anything in it.
        </p>
      )}
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Worksheets" className="flex flex-wrap gap-1" data-testid="apr-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={i === activeSheet}
              onClick={() => setActiveSheet(i)}
              className={`rounded-t-md border px-2.5 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                i === activeSheet
                  ? "border-border border-b-background bg-background font-semibold"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`apr-sheet-tab-${s.index}`}
            >
              {s.name}
              {s.visibility === "hidden" ? " (hidden in Excel)" : ""}
              {s.rows.length === 0 ? " (empty)" : ""}
            </button>
          ))}
        </div>
      )}
      <AprWorkbookTable sheet={sheet} caption={`${report.label} — ${sheet.name}`} />
    </div>
  );
}

function PdfView({ report }: { report: ProgressReportDocument }) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-2" data-testid={`apr-pdf-${report.id}`}>
      <p className="text-xs text-muted-foreground" data-testid="apr-pdf-notice">
        Your PDF, exactly as uploaded — every page, including Academic Period, Units and Grade.
        CampusVal has not changed, matched or judged anything in it.
        {!report.tableFromPdf &&
          " CampusVal could not find the Academic Progress table in this PDF, so it is not shown in the planning sidebar."}
      </p>
      <iframe
        title={`${report.label} — original PDF`}
        src={originalFileUrl(report.id)}
        className="h-[70vh] w-full rounded-md border border-border bg-background"
        data-testid={`apr-pdf-frame-${report.id}`}
      />
      {report.tableFromPdf && (
        <div className="rounded-md border border-border">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            aria-expanded={showTable}
            aria-controls={panelId}
            onClick={() => setShowTable((v) => !v)}
            data-testid={`apr-pdf-table-toggle-${report.id}`}
          >
            {showTable ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            The table CampusVal read from this PDF
          </button>
          <div id={panelId} hidden={!showTable}>
            {showTable && (
              <div className="space-y-2 border-t border-border p-2">
                <p className="text-xs text-muted-foreground">
                  The planning sidebar is made from this table. It was read from where the text
                  sits on the page; if anything differs, the PDF above is the record.
                </p>
                <WorkbookView report={report} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RenameForm({ report, onDone }: { report: ProgressReportDocument; onDone: () => void }) {
  const [label, setLabel] = useState(report.label);
  const [category, setCategory] = useState<ProgressReportCategory>(report.category);
  const invalidate = useInvalidateApr();
  const { toast } = useToast();
  const labelId = useId();
  const categoryId = useId();
  const update = useUpdateProgressReportDocument({
    mutation: {
      onSuccess: () => {
        invalidate();
        onDone();
      },
      onError: () => toast({ title: "Could not save", description: "Please try again.", variant: "destructive" }),
    },
  });

  return (
    <form
      className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_12rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) update.mutate({ id: report.id, data: { label: label.trim(), category } });
      }}
      data-testid="apr-rename-form"
    >
      <div className="space-y-1">
        <Label htmlFor={labelId} className="text-xs">
          Label
        </Label>
        <Input
          id={labelId}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          data-testid="apr-rename-label"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={categoryId} className="text-xs">
          This APR is for
        </Label>
        <select
          id={categoryId}
          value={category}
          onChange={(e) => setCategory(e.target.value as ProgressReportCategory)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          data-testid="apr-rename-category"
        >
          {APR_CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={!label.trim() || update.isPending} data-testid="apr-rename-save">
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReplaceForm({
  report,
  maxUploadBytes,
  onDone,
}: {
  report: ProgressReportDocument;
  maxUploadBytes?: number;
  onDone: () => void;
}) {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const { replace, busy, phase, error } = useAprUpload();
  const { toast } = useToast();

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3" data-testid="apr-replace-form">
      <div>
        <p className="text-sm font-semibold">Replace the file for “{report.label}”</p>
        <p className="text-xs text-muted-foreground">
          Only this APR is replaced. Your current file stays in place until the new one has been read
          successfully.
        </p>
      </div>
      {busy ? (
        <p className="flex items-center gap-2 text-sm" role="status" data-testid="apr-replace-phase">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {APR_UPLOAD_PHASE_LABEL[phase]}
        </p>
      ) : (
        <UploadZone onFileSelected={setFile} maxBytes={maxUploadBytes} />
      )}
      {error && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="apr-replace-error"
        >
          {error} Your previous file was kept.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return;
            const doc = await replace(report.id, file);
            if (doc) {
              toast({ title: "APR replaced", description: `“${doc.label}” now shows the new file.` });
              onDone();
            }
          }}
          data-testid="apr-replace-submit"
        >
          Upload &amp; replace
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
