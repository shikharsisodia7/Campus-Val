import { useState } from "react";
import {
  FileText,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  BookOpen,
  HelpCircle,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import type { ProgressReport } from "@workspace/api-client-react";
import { formatBytes } from "./UploadZone";
import { AprStructuredView } from "./AprStructuredView";
import { AprStateNotice } from "./AprStateNotice";
import { deriveAprState } from "./apr-model";

interface ReportCardProps {
  report: ProgressReport;
  onDelete: () => void;
  onReplace: () => void;
  isDeleting: boolean;
}

function ParseStatusBadge({ status }: { status: ProgressReport["parseStatus"] }) {
  switch (status) {
    case "parsed":
      return (
        <Badge
          data-testid="badge-parse-status"
          className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200"
          variant="outline"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Parsed
        </Badge>
      );
    case "pending":
      return (
        <Badge
          data-testid="badge-parse-status"
          className="gap-1 bg-amber-100 text-amber-800 border-amber-200"
          variant="outline"
        >
          <Clock className="h-3.5 w-3.5" /> Pending
        </Badge>
      );
    case "unsupported":
      return (
        <Badge
          data-testid="badge-parse-status"
          className="gap-1 bg-slate-100 text-slate-700 border-slate-200"
          variant="outline"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Unsupported format
        </Badge>
      );
    case "failed":
      return (
        <Badge
          data-testid="badge-parse-status"
          variant="outline"
          className="gap-1 bg-red-100 text-red-800 border-red-200"
        >
          <XCircle className="h-3.5 w-3.5" /> Parse failed
        </Badge>
      );
    default:
      return null;
  }
}

export function ReportCard({ report, onDelete, onReplace, isDeleting }: ReportCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const fileUrl = `${import.meta.env.BASE_URL}api/progress-report/file`.replace(/\/+/g, "/");

  const uploadedDate = new Date(report.uploadedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // The same state derivation the planning sidebar uses, so both agree on
  // what "processed", "failed", "still processing" and "nothing readable" mean.
  const state = deriveAprState({
    isLoading: false,
    envelope: { available: true, report },
    error: null,
  });
  const sourceMissing = report.sourceFile === "missing";

  return (
    <div className="space-y-4">
      {/* Read-only banner */}
      <div
        data-testid="banner-read-only"
        className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          <strong>This report is a reference.</strong> It never changes your plans automatically.
        </p>
      </div>

      {/* Metadata card */}
      <Card className="p-5" data-testid="card-report-metadata">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <FileText className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <p data-testid="text-file-name" className="truncate font-medium text-foreground">
                {report.fileName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span data-testid="text-file-size">{formatBytes(report.fileSize)}</span>
                {" · "}
                <span data-testid="text-uploaded-at">Uploaded {uploadedDate}</span>
              </p>
            </div>
          </div>
          <ParseStatusBadge status={report.parseStatus} />
        </div>

        {sourceMissing && (
          <div
            role="alert"
            data-testid="alert-source-missing"
            className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              The original file can no longer be read from storage. The summary below is what
              CampusVal already extracted; replace the report to view the original again.
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!sourceMissing && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-view-file"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> View original file
            </a>
          )}

          <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-replace-report"
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" /> Replace
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace progress report?</AlertDialogTitle>
                <AlertDialogDescription>
                  Uploading a new file will overwrite the existing report. Your old file will be
                  removed from storage. This does not affect any of your plans.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-replace-cancel">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-replace-confirm"
                  onClick={() => { setConfirmReplace(false); onReplace(); }}
                >
                  Yes, replace
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-delete-report"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete progress report?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your file will be permanently removed from storage. This cannot be undone. Your
                  plans will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-delete-confirm"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { setConfirmDelete(false); onDelete(); }}
                >
                  Yes, delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>

      {/* Structured, verifiable text representation of the report */}
      {state.kind === "ready" && <ParsedView parsed={state.parsed} />}

      {/* Still processing, or read but nothing recognizable */}
      {(state.kind === "pending" || state.kind === "no_structure") && (
        <Card className="p-5 text-sm" data-testid="card-apr-state">
          <AprStateNotice state={state} onAprPage />
          {report.parsed?.notes && report.parsed.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 space-y-0.5 text-xs text-muted-foreground" data-testid="list-parse-notes">
              {report.parsed.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Unsupported / failed view */}
      {(report.parseStatus === "unsupported" || report.parseStatus === "failed") && (
        <Card
          className="p-5 border-amber-200 bg-amber-50"
          data-testid="card-parse-error"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-amber-900">
                {report.parseStatus === "unsupported"
                  ? "File format not supported for parsing"
                  : "File couldn't be read reliably"}
              </p>
              <p className="text-sm text-amber-800">
                Your file has been stored safely and you can still view or download it above.
                CampusVal couldn't extract course data from this file.
                For best results, export your Academic Progress Report from Workday as{" "}
                <strong>PDF</strong>.
              </p>
              {report.parsed?.notes && report.parsed.notes.length > 0 && (
                <ul
                  data-testid="list-parse-notes"
                  className="mt-2 list-disc pl-5 space-y-0.5 text-xs text-amber-900/80"
                >
                  {report.parsed.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/** "2026-09-08" → "Sep 8, 2026" without a timezone shift (the date is a calendar date, not an instant). */
function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ParsedView({ parsed }: { parsed: NonNullable<ProgressReport["parsed"]> }) {
  // Grades stay in the stored record and the original file, but the default
  // view — like the planning sidebar — does not display them. Showing them is
  // an explicit, per-visit choice.
  const [showGrades, setShowGrades] = useState(false);
  const hasGrades = (parsed.groups ?? []).some((g) =>
    g.requirements.some((r) => r.courses.some((c) => c.grade)),
  );

  return (
    <div className="space-y-4" data-testid="section-parsed">
      {/* Program — Workday's own header list when the report has one */}
      {parsed.program && (
        <div data-testid="text-program" className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            {parsed.declaredMajors?.length ? "Declared major(s) on your report:" : "Detected program:"}
          </span>
          <strong className="text-foreground">{parsed.program}</strong>
        </div>
      )}
      {(parsed.declaredMinors?.length ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="text-declared-minors">
          Declared minor(s):{" "}
          <span className="font-medium text-foreground">{parsed.declaredMinors!.join(" / ")}</span>
        </p>
      )}
      {(parsed.reportDate || parsed.lastEvaluated) && (
        <p className="text-xs text-muted-foreground" data-testid="text-report-dates">
          {parsed.reportDate && <>Report dated {formatIsoDate(parsed.reportDate)}. </>}
          {parsed.lastEvaluated && <>Workday last evaluated the requirements on {formatIsoDate(parsed.lastEvaluated)}.</>}
        </p>
      )}

      <Card className="p-5" data-testid="card-requirement-groups">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold">Academic requirements</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A text copy of your Workday report, grouped and named the way Workday presents it, so
              you can check it against the original. Workday remains the official record.
            </p>
          </div>
          {hasGrades && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor="apr-show-grades">
              <input
                id="apr-show-grades"
                type="checkbox"
                checked={showGrades}
                onChange={(e) => setShowGrades(e.target.checked)}
                data-testid="toggle-show-grades"
                className="h-4 w-4 rounded border-border"
              />
              Show grades
            </label>
          )}
        </div>
        <div className="mt-4">
          <AprStructuredView parsed={parsed} variant="page" showGrades={showGrades} />
        </div>
      </Card>

      {/* Processing notes — what the parser left out and why */}
      {parsed.notes.length > 0 && (
        <Card className="p-4" data-testid="card-parse-notes">
          <div className="mb-2 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-serif text-sm font-semibold">Processing notes</h3>
          </div>
          <ul data-testid="list-parsed-notes" className="list-disc pl-5 space-y-0.5 text-xs text-muted-foreground">
            {parsed.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
