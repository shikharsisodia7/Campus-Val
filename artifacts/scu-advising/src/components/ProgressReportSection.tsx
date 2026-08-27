import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProgressReport,
  getGetProgressReportQueryKey,
  useRegisterProgressReport,
  useDeleteProgressReport,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Trash2, AlertTriangle } from "lucide-react";
import { RequirementGroupList } from "@/components/progress-report/RequirementGroupList";

const MAX_SIZE = 10 * 1024 * 1024;

/**
 * Academic Progress Report upload/manage section. The report is stored
 * privately (owner-only) and only conservatively-extracted fields are shown.
 * Student-uploaded reports are reference data — Workday stays authoritative.
 */
export function ProgressReportSection() {
  const queryClient = useQueryClient();
  const { data } = useGetProgressReport({
    query: { queryKey: getGetProgressReportQueryKey() },
  });
  const requestUrl = useRequestUploadUrl();
  const register = useRegisterProgressReport();
  const remove = useDeleteProgressReport();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report = data?.report ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetProgressReportQueryKey() });

  const onFile = async (file: File) => {
    setError(null);
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (file.type !== "application/pdf" && !isXlsx) {
      setError("Upload the report as a PDF or Excel (.xlsx) export.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File is larger than the 10 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await requestUrl.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed");
      await register.mutateAsync({
        data: {
          objectPath,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
        },
      });
      await invalidate();
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "Upload to storage failed"
          ? "The report couldn't be saved. Try again."
          : "The file couldn't be uploaded. Try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async () => {
    if (
      !window.confirm(
        "Delete your uploaded Academic Progress Report? This removes the stored file and its extracted data.",
      )
    )
      return;
    await remove.mutateAsync();
    await invalidate();
  };

  return (
    <div className="pt-3 border-t border-border" data-testid="progress-report-section">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        <FileText className="h-3.5 w-3.5" />
        Academic Progress Report
      </div>

      {!report ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Upload your Workday Academic Progress Report (PDF) to keep a
            private reference copy alongside your plans. It's stored securely
            and visible only to you.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            data-testid="button-upload-report"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading…" : "Upload report"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a
                href={`${import.meta.env.BASE_URL}api/progress-report/file`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary underline underline-offset-2 break-all"
                data-testid="link-report-file"
              >
                {report.fileName}
              </a>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Uploaded {new Date(report.uploadedAt).toLocaleDateString()} ·{" "}
                {(report.fileSize / 1024).toFixed(0)} KB · student-uploaded
                reference — Workday remains official
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onDelete}
              disabled={remove.isPending}
              data-testid="button-delete-report"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {(report.parseStatus === "failed" ||
            report.parseStatus === "unsupported") && (
            <div className="flex gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 leading-snug">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              The file couldn't be read for extraction; the original is still
              stored.
            </div>
          )}

          {report.parsed?.groups && report.parsed.groups.length > 0 ? (
            <div data-testid="apr-requirement-groups">
              <RequirementGroupList groups={report.parsed.groups} defaultOpen="none" />
            </div>
          ) : (
            report.parsed &&
            report.parsed.completedCourses.length > 0 && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">
                  Courses identified on the report (
                  {report.parsed.completedCourses.length}):
                </div>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                  {report.parsed.completedCourses.map((c) => (
                    <Badge
                      key={c.code}
                      variant="outline"
                      className="font-mono text-[10px]"
                      title={[c.title, c.units != null ? `${c.units} units` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {c.code}
                    </Badge>
                  ))}
                </div>
              </div>
            )
          )}

          {report.parsed && report.parsed.possibleCourses.length > 0 && (
            <div className="text-[10px] text-muted-foreground leading-snug">
              Needs your review:{" "}
              {report.parsed.possibleCourses.map((p) => p.raw).join(", ")}
            </div>
          )}

          {report.parsed && report.parsed.notes.length > 0 && (
            <ul className="text-[10px] text-muted-foreground leading-snug list-disc pl-4 space-y-0.5">
              {report.parsed.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            data-testid="button-replace-report"
          >
            <Upload className="h-3 w-3 mr-1" />
            {uploading ? "Uploading…" : "Replace report"}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-2 text-[11px] text-destructive" data-testid="report-upload-error">
          {error}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
