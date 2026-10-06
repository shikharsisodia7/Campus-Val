import { replacementSummary, type ReplacementResult } from "@workspace/api-client-react";
import { lazy, Suspense, useId, useRef, useState } from "react";
import {
  useDeleteDegreeChecksheet,
  useUpdateDegreeChecksheet,
  type DegreeChecksheetDocument,
  type DegreeChecksheetRender,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Info,
  ListPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Settings2,
  Trash2,
  X,
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
import {
  CHECKSHEET_UPLOAD_PHASE_LABEL,
  errorMessage,
  useChecksheetRender,
  useChecksheetTracking,
  useChecksheetUpload,
  useInvalidateChecksheets,
  type ChecksheetDetails,
  type ChecksheetFileSelection,
  type ChecksheetTracking,
  type TrackingEntry,
} from "@/hooks/use-degree-checksheets";
import { ChecksheetDetailsFields, sourceUrlProblem } from "./ChecksheetDetailsFields";
import { ChecksheetDocumentView } from "./ChecksheetDocumentView";
import { ChecksheetFileZone } from "./ChecksheetFileZone";
import { ChecksheetImageView } from "./ChecksheetImageView";
import { ChecksheetSpreadsheetView } from "./ChecksheetSpreadsheetView";
import { MyTrackingPanel } from "./MyTrackingPanel";
import { AddToPlanningDialog, type TransferSource } from "./AddToPlanningDialog";
import { TransferProvider, type TransferStart } from "./TransferContext";
import { useOptionalDegreePlanContext } from "@/components/degree-plan/DegreePlanContext";
import { SaveIndicator } from "./TrackingControls";
import {
  FORMAT_LABEL,
  checksheetCategoryLabel,
  formatBytes,
  formatUploadDate,
  originalFileUrl,
  programRoleLabel,
  renderStatusLabel,
  safeExternalUrl,
} from "./checksheet-format";

// The PDF library is large; only a student who opens a PDF downloads it.
const ChecksheetPdfView = lazy(() => import("./ChecksheetPdfView"));

type Mode = "view" | "rename" | "details" | "replace";

const ICON = { pdf: FileText, xlsx: FileSpreadsheet, xls: FileSpreadsheet, docx: FileType2, png: FileImage, jpg: FileImage };

/**
 * One uploaded document: a collapsible container holding the source preview,
 * the student's tracking, and the actions that apply to THIS document only.
 *
 * Collapsed, it shows its details and loads nothing else. The tracking state
 * lives here rather than inside the expanded panel, so collapsing a document
 * never discards an edit that is still being saved.
 */
export function ChecksheetDocumentCard({
  document,
  defaultOpen = false,
  maxUploadBytes,
}: {
  document: DegreeChecksheetDocument;
  defaultOpen?: boolean;
  maxUploadBytes?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTracking, setShowTracking] = useState(true);
  const [replaced, setReplaced] = useState<ReplacementResult | null>(null);
  const [focus, setFocus] = useState<{ key: string; at: number } | null>(null);
  const [place, setPlace] = useState<{ key: string; at: number } | null>(null);
  /** The detached cell entry the student is putting back, while they choose its cell. */
  const [relinkKey, setRelinkKey] = useState<string | null>(null);
  // "Add to planning" exists only where Planning Requirements are mounted beside this document.
  const planning = useOptionalDegreePlanContext();
  const [transfer, setTransfer] = useState<TransferSource | null>(null);
  /** The control that opened "Add to planning", to give focus back to when it closes. */
  const transferOpener = useRef<HTMLElement | null>(null);
  const startTransfer = planning?.activePlan
    ? (source: TransferStart) => {
        transferOpener.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
        setTransfer({ ...source, documentId: document.id, documentTitle: document.title });
      }
    : null;
  const cardRef = useRef<HTMLDivElement>(null);
  /** Text selected inside THIS document when the toolbar button was pressed (pressing it can clear a selection). */
  const pressedSelection = useRef("");
  const selectedInDocument = (): string => {
    const selection = window.getSelection();
    const node = selection && !selection.isCollapsed ? selection.anchorNode : null;
    return node && cardRef.current?.contains(node) ? selection!.toString() : "";
  };
  const panelId = useId();
  const { toast } = useToast();
  const invalidate = useInvalidateChecksheets();
  const tracking = useChecksheetTracking(document.id, everOpened);
  const relink = tracking.entries.find((entry) => entry.key === relinkKey && entry.detached) ?? null;

  const Icon = ICON[document.sourceFormat] ?? FileText;
  const sourceUrl = safeExternalUrl(document.sourceUrl);
  const summary = [
    checksheetCategoryLabel(document.category),
    document.programName,
    programRoleLabel(document.programRole),
    document.school,
  ].filter(Boolean);

  const toggle = () => {
    const next = !open;
    if (next) setEverOpened(true);
    // Anything typed a moment ago is sent before the panel goes away.
    else void tracking.flush();
    setOpen(next);
  };

  const show = (next: Mode) => {
    setMode(mode === next ? "view" : next);
    setEverOpened(true);
    setOpen(true);
  };

  const deleteMutation = useDeleteDegreeChecksheet({
    mutation: {
      onSuccess: () => {
        invalidate(document.id);
        toast({ title: "Document deleted", description: `“${document.title}”, its file and its tracking were removed.` });
      },
      onError: (err) =>
        toast({
          title: "Delete failed",
          description: errorMessage(err, "Could not delete this document. Please try again."),
          variant: "destructive",
        }),
    },
  });

  return (
    <Card ref={cardRef} className="overflow-hidden" data-testid={`checksheet-document-${document.id}`} data-checksheet-card={document.id}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3 sm:p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 basis-64 items-start gap-2 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          data-testid={`checksheet-toggle-${document.id}`}
        >
          {open ? (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block break-words font-serif text-lg font-semibold leading-tight" data-testid="checksheet-title">
              {document.title}
            </span>
            <span className="mt-0.5 block break-words text-xs text-muted-foreground" data-testid="checksheet-summary">
              {summary.join(" · ")}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {document.academicYearLabel && (
                <>
                  <span className="font-medium text-foreground" data-testid="checksheet-year">
                    {document.academicYearLabel}
                  </span>
                  {" · "}
                </>
              )}
              <span className="font-medium text-foreground" data-testid="checksheet-uploaded">
                {formatUploadDate(document.uploadedAt)}
              </span>
            </span>
            <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">
              {document.fileName} · {FORMAT_LABEL[document.sourceFormat]} · {formatBytes(document.fileSize)} · File status:{" "}
              <span data-testid="checksheet-status">{renderStatusLabel(document)}</span>
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button asChild variant="outline" size="sm" className="h-9 text-xs md:h-8">
            <a
              href={originalFileUrl(document.id)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open the original file of ${document.title} (opens in a new tab)`}
              data-testid={`checksheet-original-${document.id}`}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Open original
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs md:h-8" onClick={() => show("rename")} data-testid={`checksheet-rename-${document.id}`}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Rename
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs md:h-8" onClick={() => show("details")} data-testid={`checksheet-details-${document.id}`}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Edit details
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs md:h-8" onClick={() => show("replace")} data-testid={`checksheet-replace-${document.id}`}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs text-destructive hover:text-destructive md:h-8"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
            data-testid={`checksheet-delete-${document.id}`}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      <div id={panelId} hidden={!open} className="border-t border-border/60">
        {/* Rendered only while open, so a collapsed document costs nothing. */}
        {open && (
          <div className="space-y-3 p-3 sm:p-4">
            {mode === "rename" && <RenameForm document={document} onDone={() => setMode("view")} />}
            {mode === "details" && <DetailsForm document={document} onDone={() => setMode("view")} />}
            {mode === "replace" && (
              <ReplaceForm
                document={document}
                maxUploadBytes={maxUploadBytes}
                tracking={tracking}
                onDone={(result) => {
                  setMode("view");
                  if (result) setReplaced(result);
                }}
              />
            )}

            {replaced && (
              <div
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  replaced.detached > 0 ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
                role="status"
                data-testid={`checksheet-replaced-${document.id}`}
              >
                {replaced.detached > 0 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <p className="flex-1">The file was replaced. {replacementSummary(replaced)}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setReplaced(null)} aria-label="Dismiss">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}

            {sourceUrl && (
              <p className="text-xs text-muted-foreground" data-testid={`checksheet-source-${document.id}`}>
                You recorded where this document came from:{" "}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-primary underline underline-offset-2"
                >
                  {sourceUrl}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground" data-testid="checksheet-source-notice">
                The document below is shown as you uploaded it and is never changed. Anything marked “My tracking”
                is your own entry, kept separately.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <SaveIndicator state={tracking.saveState} onRetry={tracking.retry} testId={`checksheet-save-${document.id}`} />
                {startTransfer && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs md:h-8"
                    onPointerDown={() => (pressedSelection.current = selectedInDocument())}
                    onClick={() => {
                      // Whatever the student has selected in this document, to start from (or nothing: they write the note).
                      const text = pressedSelection.current || selectedInDocument();
                      pressedSelection.current = "";
                      startTransfer({ text });
                    }}
                    title="Add text you selected in this document (or a note of your own) to your Planning Requirements"
                    data-testid={`checksheet-add-to-planning-${document.id}`}
                  >
                    <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add to planning
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs md:h-8"
                  aria-pressed={!showTracking}
                  onClick={() => setShowTracking((v) => !v)}
                  data-testid={`checksheet-toggle-tracking-${document.id}`}
                >
                  {showTracking ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  {showTracking ? "Show original only" : "Show my tracking"}
                </Button>
              </div>
            </div>

            {tracking.notice && (
              <p
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                role="status"
                data-testid="checksheet-tracking-notice"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{tracking.notice}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={tracking.dismissNotice} aria-label="Dismiss">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </p>
            )}

            <TransferProvider start={startTransfer}>
            <Preview
              document={document}
              tracking={tracking}
              showTracking={showTracking}
              focus={focus}
              place={place}
              relink={relink}
              onRelinkDone={() => setRelinkKey(null)}
            />

            {tracking.isError ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm" role="alert" data-testid="checksheet-tracking-error">
                <p>Your tracking for this document could not be loaded right now. The document itself is not affected.</p>
                <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => void tracking.refetch()}>
                  Try again
                </Button>
              </div>
            ) : tracking.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your tracking…
              </p>
            ) : (
              showTracking && (
                <MyTrackingPanel
                  documentId={document.id}
                  tracking={tracking}
                  inlineAvailable={document.inlineTracking}
                  pointsAvailable={document.previewKind === "pdf" || document.previewKind === "image"}
                  describePlace={(entry) => describePlace(entry, document)}
                  onShowPlace={(entry) => setFocus({ key: entry.key, at: Date.now() })}
                  onPlace={(entry) => setPlace({ key: entry.key, at: Date.now() })}
                  onPlaceInCell={(entry) => setRelinkKey(entry.key)}
                  canPlaceInCell={(entry) => canPlaceInCell(entry, document)}
                />
              )
            )}
            </TransferProvider>
          </div>
        )}
      </div>

      {startTransfer && (
        <AddToPlanningDialog open={!!transfer} onOpenChange={(o) => !o && setTransfer(null)} source={transfer} returnFocusTo={transferOpener.current} />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="checksheet-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{document.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this document, its uploaded file and the tracking you entered on it from
              CampusVal. Your other documents, your plans and your Academic Progress Reports are not changed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="checksheet-delete-cancel">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: document.id })}
              data-testid="checksheet-delete-confirm"
            >
              Delete this document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export { replacementSummary, type ReplacementResult } from "@workspace/api-client-react";

/** A cell entry can only go back into a document of the kind it came from. */
function canPlaceInCell(entry: TrackingEntry, document: DegreeChecksheetDocument): boolean {
  if (entry.anchorType === "sheet_cell") return document.previewKind === "spreadsheet" && document.inlineTracking;
  if (entry.anchorType === "sheet_item") return document.previewKind === "spreadsheet";
  if (entry.anchorType === "doc_cell") return document.previewKind === "document" && document.inlineTracking;
  if (entry.anchorType === "doc_item") return document.previewKind === "document";
  return false;
}

function describePlace(entry: TrackingEntry, document: DegreeChecksheetDocument): string {
  if (entry.anchorType !== "point") return entry.itemLabel ?? "Tracking entry";
  return document.previewKind === "image" ? "Marker on the picture" : `Marker on page ${(entry.anchor.page ?? 0) + 1}`;
}

/** The source, as uploaded. One broken document shows its own message and nothing more. */
function Preview({
  document,
  tracking,
  showTracking,
  focus,
  place,
  relink,
  onRelinkDone,
}: {
  document: DegreeChecksheetDocument;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  focus: { key: string; at: number } | null;
  place: { key: string; at: number } | null;
  relink: TrackingEntry | null;
  onRelinkDone: () => void;
}) {
  const ready = document.renderStatus === "ready";
  const { data, isLoading, isError, refetch } = useChecksheetRender(document.id, ready);

  if (!ready) {
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm"
        role="status"
        data-testid={`checksheet-no-preview-${document.id}`}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-semibold">{renderStatusLabel(document)}</p>
          <p className="mt-0.5">{document.renderNoteMessage ?? "CampusVal could not build a preview of this file."}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use “Open original” to view the file. You can still track your progress in My Tracking below.
          </p>
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="checksheet-preview-loading">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading document…
      </p>
    );
  }
  if (isError || !data?.render) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm" role="alert" data-testid="checksheet-preview-error">
        <p>Couldn't load this document right now. The original file is still available above.</p>
        <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <PreviewBody
      document={document}
      render={data.render}
      tracking={tracking}
      showTracking={showTracking}
      focus={focus}
      place={place}
      relink={relink}
      onRelinkDone={onRelinkDone}
    />
  );
}

function PreviewBody({
  document,
  render,
  tracking,
  showTracking,
  focus,
  place,
  relink,
  onRelinkDone,
}: {
  document: DegreeChecksheetDocument;
  render: DegreeChecksheetRender;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  focus: { key: string; at: number } | null;
  place: { key: string; at: number } | null;
  relink: TrackingEntry | null;
  onRelinkDone: () => void;
}) {
  const common = { documentId: document.id, title: document.title, tracking, showTracking };
  const cells = { relink, onRelinkDone, warnings: render.warnings ?? [] };
  switch (render.kind) {
    case "spreadsheet":
      return <ChecksheetSpreadsheetView {...common} {...cells} sheets={render.sheets ?? []} />;
    case "document":
      return <ChecksheetDocumentView {...common} {...cells} blocks={render.blocks ?? []} />;
    case "image":
      return (
        <ChecksheetImageView
          {...common}
          width={render.width ?? 1}
          height={render.height ?? 1}
          version={document.sourceVersion}
          focus={focus}
          place={place}
        />
      );
    case "pdf":
      return (
        <Suspense
          fallback={
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading PDF viewer…
            </p>
          }
        >
          <ChecksheetPdfView {...common} pages={render.pages ?? []} version={document.sourceVersion} focus={focus} place={place} />
        </Suspense>
      );
    default:
      return null;
  }
}

function RenameForm({ document, onDone }: { document: DegreeChecksheetDocument; onDone: () => void }) {
  const [title, setTitle] = useState(document.title);
  const invalidate = useInvalidateChecksheets();
  const { toast } = useToast();
  const id = useId();
  const update = useUpdateDegreeChecksheet({
    mutation: {
      onSuccess: () => {
        invalidate();
        onDone();
      },
      onError: (err) =>
        toast({ title: "Could not save", description: errorMessage(err, "Please try again."), variant: "destructive" }),
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/20 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) update.mutate({ id: document.id, data: { title: title.trim() } });
      }}
      data-testid="checksheet-rename-form"
    >
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label htmlFor={id} className="text-xs">
          Title
        </Label>
        <Input id={id} value={title} maxLength={120} autoFocus onChange={(e) => setTitle(e.target.value)} data-testid="checksheet-rename-input" />
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={!title.trim() || update.isPending} data-testid="checksheet-rename-save">
        Save
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

function DetailsForm({ document, onDone }: { document: DegreeChecksheetDocument; onDone: () => void }) {
  const [details, setDetails] = useState<ChecksheetDetails>({
    title: document.title,
    category: document.category,
    programName: document.programName,
    programRole: document.programRole,
    school: document.school,
    academicYearLabel: document.academicYearLabel,
    sourceUrl: document.sourceUrl,
  });
  const invalidate = useInvalidateChecksheets();
  const { toast } = useToast();
  const update = useUpdateDegreeChecksheet({
    mutation: {
      onSuccess: () => {
        invalidate();
        onDone();
      },
      onError: (err) =>
        toast({ title: "Could not save", description: errorMessage(err, "Please try again."), variant: "destructive" }),
    },
  });
  const valid = !!details.title.trim() && !sourceUrlProblem(details.sourceUrl);

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) update.mutate({ id: document.id, data: { ...details, title: details.title.trim() } });
      }}
      data-testid="checksheet-details-form"
    >
      <p className="text-sm font-semibold">Details of “{document.title}”</p>
      <ChecksheetDetailsFields value={details} onChange={setDetails} disabled={update.isPending} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-9" disabled={!valid || update.isPending} data-testid="checksheet-details-save">
          Save details
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReplaceForm({
  document,
  maxUploadBytes,
  tracking,
  onDone,
}: {
  document: DegreeChecksheetDocument;
  maxUploadBytes?: number;
  tracking: ChecksheetTracking;
  onDone: (result: ReplacementResult | null) => void;
}) {
  const [file, setFile] = useState<ChecksheetFileSelection | null>(null);
  const { replace, busy, phase, error } = useChecksheetUpload();
  const { toast } = useToast();
  const placed = tracking.entries.filter((entry) => !entry.detached && entry.anchorType !== "manual").length;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3" data-testid="checksheet-replace-form">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Replace the file for “{document.title}”</p>
        <p className="text-xs text-muted-foreground">
          Only this document is replaced. Your current file stays in place until the new one has been checked
          successfully.
        </p>
        {placed > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="checksheet-replace-tracking-note">
            You have {placed} tracking {placed === 1 ? "entry" : "entries"} placed on this document. Each stays
            where it is only if the new file has the same requirement in the same place; otherwise it moves to
            My Tracking for you to review. Your own list is always kept.
          </p>
        )}
      </div>
      {busy ? (
        <p className="flex items-center gap-2 text-sm" role="status" data-testid="checksheet-replace-phase">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {CHECKSHEET_UPLOAD_PHASE_LABEL[phase]}
        </p>
      ) : (
        <ChecksheetFileZone onFileSelected={setFile} maxBytes={maxUploadBytes} />
      )}
      {error && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="checksheet-replace-error"
        >
          {error} Your previous file was kept.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-9"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return;
            // What was typed a moment ago must reach the server before the file changes.
            await tracking.flush();
            const result = await replace(document.id, file);
            if (result) {
              await tracking.reload();
              toast({ title: "File replaced", description: `“${result.document.title}” now shows the new file.` });
              onDone(result.tracking);
            }
          }}
          data-testid="checksheet-replace-submit"
        >
          Upload &amp; replace
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
