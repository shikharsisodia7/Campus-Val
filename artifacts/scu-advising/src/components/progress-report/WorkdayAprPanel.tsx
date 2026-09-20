import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, FileWarning } from "lucide-react";
import { usePlanningProgressReport } from "@/hooks/use-planning-progress-report";
import { reconcileMajor } from "@/lib/apr-major-reconciliation";
import { AprStructuredView } from "./AprStructuredView";
import { AprStateNotice } from "./AprStateNotice";
import { deriveAprState } from "./apr-model";

/**
 * The Workday Academic Progress Report reference column — used identically
 * in Degree Plan, Tentative Degree Plan, and Quarter Plan (the professor
 * explicitly asked that "this window look just like the same window each
 * time"). It is the university record and NOTHING else: no plan controls,
 * no major/minor editing, no CampusVal-generated verdicts.
 *
 * It renders `AprStructuredView` — the same component the APR page uses —
 * from the grade-free planning projection of the stored parse, so what a
 * student compares against their plan is exactly what the APR page shows,
 * minus grades. Upload/Replace lives on the APR page and in each planning
 * page's control bar, so this panel stays focused on report content.
 */
export function WorkdayAprPanel({
  planningMajorTitle,
}: {
  /**
   * The student's current CampusVal planning major (Degree Plan only — the
   * caller should omit this on a Tentative Degree Plan, where an
   * intentional "what if another major" divergence is expected and must
   * never be flagged as a discrepancy). Comparison only; never mutates
   * plan or profile state.
   */
  planningMajorTitle?: string | null;
}) {
  const { data: envelope, isLoading, error, refetch } = usePlanningProgressReport();
  // GET /progress-report 404s (not a 200 envelope) when nothing has been
  // uploaded yet — deriveAprState reads that as "none", not a failure.
  // (Query-wide retry/refetch defaults for this key are set centrally in
  // App.tsx — see the comment there.)
  const state = deriveAprState({ isLoading, envelope, error });
  const fileUrl = `${import.meta.env.BASE_URL}api/progress-report/file`;

  // Every state that has a stored report (still processing, failed, unreadable,
  // or ready) offers the original file: it exists even when parsing did not work.
  const report = "report" in state ? state.report : undefined;
  const majorReconciliation =
    state.kind === "ready"
      ? reconcileMajor(state.parsed.program, planningMajorTitle, state.parsed.declaredMajors)
      : "unknown";

  return (
    <Card
      className="flex h-full min-h-0 flex-col overflow-hidden border-border/60 bg-card shadow-sm"
      data-testid="workday-apr-panel"
    >
      <div className="border-b border-border/60 px-3 py-2" data-testid="apr-column-header">
        <h2 className="font-serif text-base font-bold leading-tight">
          Workday Academic Progress Report
        </h2>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          University Record Reference
        </p>
      </div>

      {/* A native scroller, not Radix ScrollArea: ScrollArea wraps its content in a
          `display: table` element, which lets long unbreakable text (a file
          name, a course title) widen the column past the panel and clip it.
          Focusable so keyboard users can scroll it. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        tabIndex={0}
        role="region"
        aria-label="Workday Academic Progress Report contents"
        data-testid="apr-scroll-region"
      >
        <div className="min-w-0 space-y-3 break-words p-2.5">
          <div
            className="rounded-md border border-border bg-muted/20 p-2.5 text-[11px] leading-snug text-foreground/90"
            data-testid="apr-official-reference"
          >
            <p>
              This is a university record from Workday. It is modified through Workday, not
              CampusVal — use it as your comparison point against your CampusVal plans.
            </p>

            {state.kind !== "ready" && <AprStateNotice state={state} onRetry={() => void refetch()} />}

            {report && (
              <div className="mt-2 space-y-1 border-t border-border/60 pt-2" data-testid="apr-original-report">
                <div className="text-[11px] font-semibold text-foreground">
                  Uploaded Workday Academic Progress Report
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="min-w-0 truncate text-[10px] text-muted-foreground"
                    title={report.fileName}
                  >
                    {report.fileName} · uploaded {new Date(report.uploadedAt).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" asChild>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="button-view-original-report"
                    >
                      <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" />
                      View Original Report
                    </a>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/80">
                  Re-upload after grades or program changes to keep this current.
                </p>
              </div>
            )}

            {state.kind === "ready" && state.sourceMissing && (
              <div
                className="mt-2 flex items-start gap-1.5 text-amber-900"
                role="alert"
                data-testid="apr-source-missing"
              >
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  The original file is no longer available in storage. Re-upload it on the APR page.
                </span>
              </div>
            )}
          </div>

          {majorReconciliation === "mismatch" && (
            <div
              className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
              role="status"
              data-testid="apr-major-mismatch-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Your CampusVal planning requirements differ from the uploaded Workday APR. Workday
                is the university-record reference — review your CampusVal planning major/catalog
                year and verify with your advisor. CampusVal will not change your plan for you.
              </span>
            </div>
          )}

          {state.kind === "ready" && (
            <AprStructuredView parsed={state.parsed} variant="sidebar" showGrades={false} />
          )}
        </div>
      </div>
    </Card>
  );
}
