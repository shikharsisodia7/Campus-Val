import { useId, useState } from "react";
import { Link } from "wouter";
import type { ProgressReportCategory } from "@workspace/api-client-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { PlanningComparisonWorkspace } from "@/components/degree-plan/PlanningComparisonWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, FileUp, Info, Loader2, Plus, ShieldCheck, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTrackUsage } from "@/hooks/use-track-usage";
import { APR_UPLOAD_PHASE_LABEL, useAprDocuments, useAprUpload } from "@/hooks/use-apr-documents";
import { UploadZone, type SelectedFile } from "@/components/progress-report/UploadZone";
import { AprDocumentCard } from "@/components/progress-report/AprDocumentCard";
import { APR_CATEGORY_OPTIONS } from "@/components/progress-report/apr-format";

/**
 * The full Academic Progress Report page: every APR the student has uploaded,
 * each in its own collapsible container showing the workbook as Workday
 * exported it. The compact, grade-free version lives in the planning sidebar.
 */
function FullAprWorkspace() {
  const { data, isLoading, isError, refetch } = useAprDocuments();
  const [adding, setAdding] = useState(false);

  const reports = data?.reports ?? [];
  const available = data?.available;
  const atLimit = !!data && reports.length >= data.maxDocuments;
  const showForm = available === true && (adding || reports.length === 0);

  return (
    <div className="space-y-4 pr-1" data-testid="full-apr-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link href="/degree-plan" data-testid="link-back-degree-plan">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Back to Degree Plan
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link href="/planner" data-testid="link-back-quarter-plan">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Back to Quarter Plan
            </Link>
          </Button>
        </div>
        {available === true && reports.length > 0 && !adding && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setAdding(true)}
            disabled={atLimit}
            title={atLimit ? `You can keep up to ${data?.maxDocuments} APRs.` : undefined}
            data-testid="button-upload-another"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Upload another APR
          </Button>
        )}
      </div>

      <Card className="border-emerald-200 bg-emerald-50 p-4" data-testid="card-privacy-notice">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="space-y-1 text-sm text-emerald-900">
            <p className="font-semibold">Your files are private and under your control.</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Only you can see your APRs. Sharing a plan with an advisor does <strong>not</strong> share them.</li>
              <li>Upload the Workday export as it is — Excel or PDF, one file or several. Nothing needs combining.</li>
              <li>Uploading an APR does <strong>not</strong> change your plans or your Workday record.</li>
            </ul>
            <p className="mt-1 text-xs text-emerald-800">
              <Info className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              CampusVal cannot refresh an APR from Workday. Each one shows the date you uploaded it —
              export and upload again after grades post or your program changes.
            </p>
          </div>
        </div>
      </Card>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="status-loading">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}

      {isError && !isLoading && (
        <Card className="p-4" role="alert" data-testid="card-apr-load-error">
          <p className="text-sm">Couldn't load your Academic Progress Reports right now.</p>
          <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {available === false && !isLoading && (
        <Card className="border-border bg-muted/40 p-5" data-testid="card-storage-unavailable">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">File uploads aren't configured for this deployment.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This feature requires private file storage to be set up by the server operator. The
                rest of CampusVal works normally.
              </p>
            </div>
          </div>
        </Card>
      )}

      {showForm && (
        <UploadForm
          first={reports.length === 0}
          maxUploadBytes={data?.maxUploadBytes}
          onCancel={reports.length > 0 ? () => setAdding(false) : undefined}
          onUploaded={() => setAdding(false)}
        />
      )}

      {available === true && reports.length > 0 && (
        <section aria-label="Uploaded Academic Progress Reports" className="space-y-3" data-testid="apr-document-list">
          <p className="text-xs text-muted-foreground" data-testid="apr-document-count">
            {reports.length} APR{reports.length === 1 ? "" : "s"} uploaded. Open one at a time, or several.
          </p>
          {reports.map((report, i) => (
            <AprDocumentCard
              key={report.id}
              report={report}
              // One open by default; the rest stay collapsed until asked for.
              defaultOpen={i === 0 && reports.length === 1}
              maxUploadBytes={data?.maxUploadBytes}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * The full Academic Progress Report page, beside the student's Planning
 * Requirements:
 *
 *   Planning Requirements | Full APR
 *
 * The compact APR sidebar is deliberately NOT shown here: the whole center is
 * already the APR. Nothing about the APR (its data, rendering, privacy or
 * management) changes; an edit made in the sidebar is only a personal planning
 * note on the selected plan.
 */
export default function ProgressReportPage() {
  useTrackUsage("apr_upload");
  return (
    <AppShell>
      <PageHeader
        compact
        title="Academic Progress Reports"
        subtitle="Your Workday Academic Progress Reports, shown as exported. Workday is the definitive reference for degree completion."
      />
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8">
        <PlanningComparisonWorkspace main={<FullAprWorkspace />} mainLabel="Full Academic Progress Reports" showCompactApr={false} />
      </div>
    </AppShell>
  );
}

function UploadForm({
  first,
  maxUploadBytes,
  onCancel,
  onUploaded,
}: {
  first: boolean;
  maxUploadBytes?: number;
  onCancel?: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ProgressReportCategory>(first ? "primary_major" : "other");
  const { upload, busy, phase, error } = useAprUpload();
  const { toast } = useToast();
  const labelId = useId();
  const categoryId = useId();

  if (busy) {
    return (
      <Card className="p-6" data-testid="card-uploading">
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="font-medium text-foreground" data-testid="text-upload-phase">
            {APR_UPLOAD_PHASE_LABEL[phase]}
          </p>
          <p className="text-sm text-muted-foreground">Please don't close this tab.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5" data-testid="card-upload-form">
      <div>
        <h2 className="mb-1 font-serif text-xl font-semibold">
          {first ? "Upload a Workday APR" : "Upload another APR"}
        </h2>
        <p className="text-sm text-muted-foreground">
          In Workday, open <strong>View My Academic Progress</strong> and export the report — to{" "}
          <strong>Excel (.xlsx)</strong> or to <strong>PDF</strong> — then upload that file here. A
          single export can cover all of your majors and minors; separate files work too.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-1">
          <Label htmlFor={labelId}>Label</Label>
          <Input
            id={labelId}
            value={label}
            maxLength={80}
            placeholder="e.g. Finance Major"
            onChange={(e) => setLabel(e.target.value)}
            data-testid="input-apr-label"
          />
          <p className="text-[11px] text-muted-foreground">Your own name for this APR. CampusVal does not guess it from the file.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={categoryId}>This APR is for</Label>
          <select
            id={categoryId}
            value={category}
            onChange={(e) => setCategory(e.target.value as ProgressReportCategory)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            data-testid="select-apr-category"
          >
            {APR_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <UploadZone onFileSelected={setFile} maxBytes={maxUploadBytes} />

      {error && (
        <div
          data-testid="card-upload-error"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          data-testid="button-upload"
          disabled={!file || !label.trim()}
          className="gap-2"
          onClick={async () => {
            if (!file || !label.trim()) return;
            const doc = await upload(file, { label: label.trim(), category });
            if (doc) {
              toast({ title: "APR uploaded", description: `“${doc.label}” is stored privately.` });
              onUploaded();
            }
          }}
        >
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Upload APR
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-upload">
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}
