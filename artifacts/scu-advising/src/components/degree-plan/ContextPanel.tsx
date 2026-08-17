import { useState } from "react";
import { useDegreePlanContext } from "./DegreePlanContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  useGetProgressReport,
  getGetProgressReportQueryKey,
  AcademicPlan,
} from "@workspace/api-client-react";
import { SlidersHorizontal, ExternalLink, FileWarning, Info } from "lucide-react";
import { Link } from "wouter";
import { PlanProgressPanel } from "./PlanProgressPanel";
import { PlanControlsPanel } from "./PlanControlsPanel";

/**
 * The right-hand column of Degree Plan / Tentative Degree Plan. Per the
 * professor's correction, this column is ALWAYS the Academic Progress
 * Report reference — never a Progress/Plan toggle. Plan switching and
 * majors/minors/professional-prep editing live in PlanControlsPanel,
 * reachable from the "Plan Controls" button below, not from here.
 */
export function ContextPanel({ plans }: { plans: AcademicPlan[] }) {
  const { activePlan } = useDegreePlanContext();
  const [controlsOpen, setControlsOpen] = useState(false);

  const {
    data: reportEnvelope,
    isLoading: isReportLoading,
    error: reportError,
  } = useGetProgressReport({
    query: { queryKey: getGetProgressReportQueryKey(), retry: false },
  });
  // GET /progress-report 404s (not a 200 envelope) when the user hasn't
  // uploaded a report yet — that's the expected "none uploaded" signal for
  // this endpoint, not a failure.
  const reportNotUploaded = (reportError as any)?.status === 404;
  const report = reportEnvelope?.report;
  const fileUrl = `${import.meta.env.BASE_URL}api/progress-report/file`;

  if (!activePlan) return null;

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/60 px-3 py-2.5 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-base font-bold">
            Academic Progress Report
          </h2>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
            Official Reference
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          data-testid="button-open-plan-controls"
          onClick={() => setControlsOpen(true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
          Plan Controls
        </Button>
      </div>

      <ScrollArea className="h-full flex-1">
        <div className="p-3 space-y-4">
          <div
            className="rounded-md border border-border bg-muted/20 p-3 text-xs text-foreground/90"
            data-testid="apr-official-reference"
          >
            <p>
              This report reflects official university records. CampusVal
              does not modify the report. Always verify your official
              academic record directly in Workday.
            </p>

            {isReportLoading && (
              <p className="text-muted-foreground mt-2">Loading…</p>
            )}

            {!isReportLoading && reportEnvelope && !reportEnvelope.available && (
              <div
                className="mt-2 flex items-start gap-1.5 text-muted-foreground"
                data-testid="apr-uploads-unavailable"
              >
                <FileWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>File uploads aren't configured in this environment.</span>
              </div>
            )}

            {!isReportLoading &&
              ((reportEnvelope?.available && !report) || reportNotUploaded) && (
                <div className="mt-2" data-testid="apr-none-uploaded">
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>No Academic Progress Report uploaded.</span>
                  </div>
                  <Link
                    href="/progress-report"
                    className="inline-flex items-center gap-1 mt-1.5 text-primary hover:underline font-medium"
                    data-testid="apr-upload-link"
                  >
                    Upload Workday APR
                  </Link>
                </div>
              )}

            {!isReportLoading && reportError && !reportNotUploaded && (
              <div
                className="mt-2 flex items-start gap-1.5 text-muted-foreground"
                data-testid="apr-load-error"
              >
                <FileWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Couldn't load your report right now. Try refreshing the page.</span>
              </div>
            )}

            {report && (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-2" data-testid="apr-original-report">
                <div className="text-xs font-semibold text-foreground">
                  Uploaded Workday Academic Progress Report
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {report.fileName} · uploaded{" "}
                  {new Date(report.uploadedAt).toLocaleDateString()}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="button-view-original-report"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      View Original Report
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <Link href="/progress-report" data-testid="button-replace-report">
                      Replace Report
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-0.5">
              CampusVal planning support (not the official record)
            </div>
            <PlanProgressPanel />
          </div>
        </div>
      </ScrollArea>

      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent
          className="w-full sm:max-w-md p-0 flex flex-col"
          data-testid="sheet-plan-controls"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/60">
            <SheetTitle>Plan Controls</SheetTitle>
            <SheetDescription>
              Switch plans, and edit majors, minors, and Professional
              Preparation for this plan.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <PlanControlsPanel plans={plans} />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
