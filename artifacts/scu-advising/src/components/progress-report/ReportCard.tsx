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
import { RequirementGroupList } from "./RequirementGroupList";

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

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-view-file"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> View original file
          </a>

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

      {/* Parsed view */}
      {report.parseStatus === "parsed" && report.parsed && (
        <ParsedView parsed={report.parsed} />
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

function ParsedView({ parsed }: { parsed: NonNullable<ProgressReport["parsed"]> }) {
  return (
    <div className="space-y-4" data-testid="section-parsed">
      {/* Program */}
      {parsed.program && (
        <div data-testid="text-program" className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Detected program:</span>
          <strong className="text-foreground">{parsed.program}</strong>
        </div>
      )}

      {/* Requirement hierarchy — the primary APR experience when the document supports it */}
      {parsed.groups && parsed.groups.length > 0 ? (
        <Card className="p-5" data-testid="card-requirement-groups">
          <h3 className="font-serif text-lg font-semibold mb-1">Academic requirements</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Grouped and named the way your Workday report presents them.
          </p>
          <RequirementGroupList groups={parsed.groups} defaultOpen="all" />
        </Card>
      ) : (
        <Card className="p-5" data-testid="card-completed-courses">
          <h3 className="font-serif text-lg font-semibold mb-3">
            Recognized completed courses ({parsed.completedCourses.length})
          </h3>
          {parsed.completedCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed courses detected.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {parsed.completedCourses.map((course, i) => (
                <div
                  key={i}
                  data-testid={`badge-course-${i}`}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
                >
                  <span className="font-mono text-xs font-bold text-primary">{course.code}</span>
                  <Separator orientation="vertical" className="h-3.5" />
                  <span className="text-xs text-foreground">{course.title}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {course.units}u
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Needs review section */}
      {(parsed.possibleCourses.length > 0 || parsed.notes.length > 0) && (
        <Card className="p-5 border-amber-200 bg-amber-50/60" data-testid="card-needs-review">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="h-4 w-4 text-amber-700" />
            <h3 className="font-serif text-base font-semibold text-amber-900">
              Needs your review
            </h3>
          </div>
          <p className="text-xs text-amber-800 mb-3">
            These are course-like tokens the parser found but couldn't confidently match to the
            catalog. Please verify them in Workday.
          </p>

          {parsed.possibleCourses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3" data-testid="list-possible-courses">
              {parsed.possibleCourses.map((c, i) => (
                <Badge
                  key={i}
                  data-testid={`badge-possible-${i}`}
                  variant="outline"
                  className="font-mono text-xs bg-white border-amber-300 text-amber-900"
                >
                  {c.raw}
                </Badge>
              ))}
            </div>
          )}

          {parsed.notes.length > 0 && (
            <ul data-testid="list-parsed-notes" className="list-disc pl-5 space-y-0.5 text-xs text-amber-900/80">
              {parsed.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
