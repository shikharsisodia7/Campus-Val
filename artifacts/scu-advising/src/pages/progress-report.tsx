import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProgressReport,
  getGetProgressReportQueryKey,
  useRequestUploadUrl,
  useRegisterProgressReport,
  useDeleteProgressReport,
} from "@workspace/api-client-react";
import { AppShell, PageHeader, PageContent } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileUp,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  XCircle,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UploadZone, type SelectedFile } from "@/components/progress-report/UploadZone";
import { ReportCard } from "@/components/progress-report/ReportCard";
import { useTrackUsage } from "@/hooks/use-track-usage";

type UploadPhase = "idle" | "requesting-url" | "uploading" | "registering";

export default function ProgressReportPage() {
  useTrackUsage("apr_upload");
  const qc = useQueryClient();
  const { toast } = useToast();

  const [replacing, setReplacing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ─── Data ───────────────────────────────────────────────────────────────────
  const {
    data: envelope,
    isLoading: envelopeLoading,
    isError: envelopeError,
    error: envelopeRawError,
  } = useGetProgressReport({
    query: {
      queryKey: getGetProgressReportQueryKey(),
      retry: (failCount, err) => {
        // 404 = no report yet (not a network error) — don't retry
        const status = (err as { status?: number })?.status;
        if (status === 404) return false;
        return failCount < 1;
      },
    },
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const requestUrlMutation = useRequestUploadUrl();
  const registerMutation = useRegisterProgressReport();
  const deleteMutation = useDeleteProgressReport({
    mutation: {
      onSuccess: () => {
        // Remove (not just invalidate) so the stale report doesn't linger:
        // the refetch after delete returns 404, and react-query keeps the
        // previous data on error, which would leave the deleted card visible.
        qc.removeQueries({ queryKey: getGetProgressReportQueryKey() });
        qc.invalidateQueries({ queryKey: getGetProgressReportQueryKey() });
        toast({ title: "Report deleted", description: "Your progress report has been removed." });
      },
      onError: () => {
        toast({ title: "Delete failed", description: "Could not delete your report. Please try again.", variant: "destructive" });
      },
    },
  });

  // ─── Upload flow ─────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploadError(null);

    try {
      // Step 1: request presigned URL
      setUploadPhase("requesting-url");
      const urlResponse = await requestUrlMutation.mutateAsync({
        data: {
          name: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.contentType,
        },
      });

      // Step 2: PUT file directly to the presigned URL (never our backend)
      setUploadPhase("uploading");
      const putResponse = await fetch(urlResponse.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.contentType },
        body: selectedFile.file,
      });
      if (!putResponse.ok) {
        throw new Error(`Upload failed (HTTP ${putResponse.status})`);
      }

      // Step 3: register with our backend
      setUploadPhase("registering");
      await registerMutation.mutateAsync({
        data: {
          objectPath: urlResponse.objectPath,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          contentType: selectedFile.contentType,
        },
      });

      // Success
      qc.invalidateQueries({ queryKey: getGetProgressReportQueryKey() });
      setSelectedFile(null);
      setReplacing(false);
      setUploadPhase("idle");
      toast({ title: "Report uploaded", description: "Your progress report is now stored securely." });
    } catch (err) {
      setUploadPhase("idle");
      const msg =
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again.";
      setUploadError(msg);
    }
  }, [selectedFile, requestUrlMutation, registerMutation, qc, toast]);

  const isUploading = uploadPhase !== "idle";

  // ─── Derive state ─────────────────────────────────────────────────────────
  // Check for 404 (no report) vs real errors
  const is404 = envelopeError &&
    (envelopeRawError as { status?: number })?.status === 404;

  const available = envelope?.available ?? (is404 ? true : undefined);
  // A 404 means "no report" — ignore any stale cached envelope in that case.
  const report = is404 ? null : envelope?.report ?? null;

  const showUploadForm =
    available === true &&
    (report === null || is404 || replacing) &&
    !isUploading;

  const showReport = available === true && report !== null && !replacing;

  const phaseLabel: Record<UploadPhase, string> = {
    idle: "",
    "requesting-url": "Preparing upload…",
    uploading: "Uploading file…",
    registering: "Processing report…",
  };

  return (
    <AppShell>
      <PageHeader
        title="Academic Progress Report"
        subtitle="Upload your official Workday Academic Progress Report so CampusVal can show it as a read-only reference next to your plans."
      />
      <PageContent>
        {/* Privacy + disclaimer notice */}
        <Card className="p-5 border-emerald-200 bg-emerald-50" data-testid="card-privacy-notice">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="space-y-1.5 text-sm text-emerald-900">
              <p className="font-semibold">Your file is private and under your control.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Stored <strong>privately</strong> — only you can access it.</li>
                <li>You can <strong>delete it anytime</strong> from this page.</li>
                <li>CampusVal <strong>never sends your file</strong> to any third party.</li>
                <li>Uploading a report <strong>does not change</strong> your plans or profile.</li>
              </ul>
              <p className="mt-2 text-xs text-emerald-800">
                <Info className="inline h-3.5 w-3.5 mr-1" />
                CampusVal is a planning aid and <strong>does not replace Workday or your academic advisor</strong>.
                Always confirm requirements and credits with your official advisor.
              </p>
            </div>
          </div>
        </Card>

        {/* Loading state */}
        {envelopeLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {/* Storage unavailable */}
        {available === false && !envelopeLoading && (
          <Card className="p-5 border-border bg-muted/40" data-testid="card-storage-unavailable">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-semibold text-foreground">File uploads aren't configured for this deployment.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This feature requires object storage to be set up by the server operator. The rest
                  of CampusVal works normally.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Uploading progress */}
        {isUploading && (
          <Card className="p-6" data-testid="card-uploading">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <p className="font-medium text-foreground" data-testid="text-upload-phase">
                  {phaseLabel[uploadPhase]}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please don't close this tab.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Upload form (no report yet, or replacing) */}
        {showUploadForm && (
          <Card className="p-6 space-y-5" data-testid="card-upload-form">
            <div>
              <h2 className="font-serif text-xl font-semibold mb-1">
                {replacing ? "Replace progress report" : "Upload your progress report"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Export your <strong>Academic Progress Report</strong> from Workday (Academics →
                Academic Progress Report) as PDF or Excel (.xlsx), then upload it here.
              </p>
            </div>

            <UploadZone
              onFileSelected={setSelectedFile}
              disabled={isUploading}
            />

            {uploadError && (
              <div
                data-testid="card-upload-error"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                data-testid="button-upload"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="gap-2"
              >
                <FileUp className="h-4 w-4" />
                {replacing ? "Upload & replace" : "Upload report"}
              </Button>
              {replacing && (
                <Button
                  variant="outline"
                  data-testid="button-cancel-replace"
                  onClick={() => { setReplacing(false); setSelectedFile(null); setUploadError(null); }}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Existing report */}
        {showReport && report && (
          <ReportCard
            report={report}
            onDelete={() => deleteMutation.mutate()}
            onReplace={() => { setReplacing(true); setSelectedFile(null); setUploadError(null); }}
            isDeleting={deleteMutation.isPending}
          />
        )}
      </PageContent>
    </AppShell>
  );
}
