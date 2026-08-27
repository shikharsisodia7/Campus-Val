import { useDegreePlanContext } from "./DegreePlanContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useGetProgressReport,
  getGetProgressReportQueryKey,
} from "@workspace/api-client-react";
import { ExternalLink, FileWarning, Info } from "lucide-react";
import { Link } from "wouter";
import { RequirementGroupList } from "../progress-report/RequirementGroupList";

/**
 * The right-hand column of Degree Plan / Tentative Degree Plan.
 *
 * Per the professor's correction this column is the Workday Academic Progress
 * Report and NOTHING else: no plan controls, no major/minor editing, no
 * CampusVal-generated progress widgets or completed-course analytics. Its
 * whole purpose is letting the student compare their editable CampusVal plan
 * against what Workday currently shows, so it starts at the top of the column
 * and uses the full height available.
 *
 * The one addition to that rule is the parsed APR's own requirement
 * hierarchy (collapsed by default) — it's still Workday's own structure and
 * wording, not a CampusVal-computed analytic, so it stays inside "nothing
 * else but the APR reference."
 *
 * Plan switching and majors/minors/Professional-Preparation editing live in
 * DegreePlanToolbar on the planning side.
 */
export function ContextPanel() {
  const { activePlan } = useDegreePlanContext();

  const {
    data: reportEnvelope,
    isLoading: isReportLoading,
    error: reportError,
  } = useGetProgressReport({
    query: { queryKey: getGetProgressReportQueryKey() },
  });
  // GET /progress-report 404s (not a 200 envelope) when the user hasn't
  // uploaded a report yet — that's the expected "none uploaded" signal for
  // this endpoint, not a failure. (Query-wide retry/refetch defaults for
  // this key are set centrally in App.tsx — see the comment there.)
  const reportNotUploaded = (reportError as any)?.status === 404;
  const report = reportEnvelope?.report;
  const fileUrl = `${import.meta.env.BASE_URL}api/progress-report/file`;

  if (!activePlan) return null;

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/60 px-3 py-2" data-testid="apr-column-header">
        <h2 className="font-serif text-base font-bold leading-tight">
          Workday Academic Progress Report
        </h2>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          University Record Reference
        </p>
      </div>

      <ScrollArea className="h-full flex-1">
        <div className="p-3 space-y-4">
          <div
            className="rounded-md border border-border bg-muted/20 p-3 text-xs text-foreground/90"
            data-testid="apr-official-reference"
          >
            <p>
              This is the university-generated record. CampusVal never
              modifies it. Verify your academic and registration information
              directly in Workday.
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

          {report?.parsed?.groups && report.parsed.groups.length > 0 && (
            <div data-testid="apr-requirement-groups">
              <RequirementGroupList groups={report.parsed.groups} defaultOpen="none" />
            </div>
          )}
        </div>
      </ScrollArea>

    </Card>
  );
}
