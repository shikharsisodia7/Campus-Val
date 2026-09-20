import { Link } from "wouter";
import { AlertTriangle, FileWarning, Info, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AprViewState } from "./apr-model";

/**
 * One rendering of every non-"ready" APR state, shared by the planning panel
 * and the APR page. Each state names what happened and gives the next step
 * (upload, go to the APR page, retry) — the panel is never blank or crashed.
 */
export function AprStateNotice({
  state,
  onRetry,
  /** True when already on the APR page, where "go to the APR page" would be circular. */
  onAprPage = false,
}: {
  state: Exclude<AprViewState, { kind: "ready" }>;
  onRetry?: () => void;
  onAprPage?: boolean;
}) {
  const toAprPage = (label: string) =>
    onAprPage ? null : (
      <Link
        href="/progress-report"
        className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
        data-testid="apr-goto-page"
      >
        {label}
      </Link>
    );

  switch (state.kind) {
    case "loading":
      return (
        <p className="mt-2 flex items-center gap-1.5 text-muted-foreground" role="status" data-testid="apr-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading…
        </p>
      );

    case "storage_unavailable":
      return (
        <div className="mt-2 flex items-start gap-1.5 text-muted-foreground" data-testid="apr-uploads-unavailable">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>File uploads aren't configured in this environment.</span>
        </div>
      );

    case "none":
      return (
        <div className="mt-2" data-testid="apr-none-uploaded">
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>No Academic Progress Report uploaded.</span>
          </div>
          {!onAprPage && (
            <Link
              href="/progress-report"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
              data-testid="apr-upload-link"
            >
              Upload Workday APR
            </Link>
          )}
        </div>
      );

    case "unauthorized":
      return (
        <div
          className="mt-2 flex items-start gap-1.5 text-amber-900"
          role="alert"
          data-testid="apr-unauthorized"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            You don't have access to this report. Sign in again — a report is only ever visible to
            the student who uploaded it.
          </span>
        </div>
      );

    case "error":
      return (
        <div className="mt-2" role="alert" data-testid="apr-load-error">
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Couldn't load your report right now.</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {onRetry && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry} data-testid="apr-retry">
                Try again
              </Button>
            )}
            {toAprPage("Open the APR page")}
          </div>
        </div>
      );

    case "pending":
      return (
        <div className="mt-2" role="status" data-testid="apr-pending">
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
            <span>Your report was uploaded and is still being processed.</span>
          </div>
          {toAprPage("Check status on the APR page")}
        </div>
      );

    case "failed":
      return (
        <div className="mt-2" role="alert" data-testid="apr-failed">
          <div className="flex items-start gap-1.5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>We couldn't process your report. Your file is stored safely.</span>
          </div>
          {toAprPage("Replace it on the APR page")}
        </div>
      );

    case "unsupported":
      return (
        <div className="mt-2" role="alert" data-testid="apr-unsupported">
          <div className="flex items-start gap-1.5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              This file's format couldn't be read. Export the APR from Workday as a PDF and upload
              it again.
            </span>
          </div>
          {toAprPage("Replace it on the APR page")}
        </div>
      );

    case "no_structure":
      return (
        <div className="mt-2" data-testid="apr-no-structure">
          <div className="flex items-start gap-1.5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Your report was uploaded, but nothing could be read from it reliably. Use the original
              file as the source of truth.
            </span>
          </div>
          {toAprPage("Details on the APR page")}
        </div>
      );
  }
}
