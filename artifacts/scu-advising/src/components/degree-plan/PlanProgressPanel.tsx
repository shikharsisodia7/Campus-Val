import { useGetProgressReport, getGetProgressReportQueryKey } from "@workspace/api-client-react";
import { useDegreePlanContext } from "./DegreePlanContext";
import { useOptimisticUpdatePlanItem, useBulkImportReportCourses } from "./usePlanItemMutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, BookCheck, GraduationCap, Award, Info, MoveRight, PackagePlus } from "lucide-react";
import { creditedCourses, loadStoredExams } from "@/lib/apib";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useState } from "react";

export function PlanProgressPanel() {
  const { activePlan, activePlanId, profile } = useDegreePlanContext();
  const updatePlanItem = useOptimisticUpdatePlanItem();
  const bulkImport = useBulkImportReportCourses();

  const { data: summary } = useGetDashboardSummary();
  const { data: reportEnvelope } = useGetProgressReport({
    query: { queryKey: getGetProgressReportQueryKey() }
  });

  const apIb = creditedCourses(loadStoredExams());
  const completed = (profile?.completedCourseCodes ?? [])
    .map((c) => c.toUpperCase())
    .sort();

  const majors = [profile?.major, profile?.secondMajor, ...(profile?.additionalMajors ?? [])].filter(
    (m): m is string => !!m,
  );
  const minors = [profile?.minor, ...(profile?.additionalMinors ?? [])].filter(
    (m): m is string => !!m,
  );

  // Mismatch calculations
  const reportParsed = reportEnvelope?.report?.parsed;
  const completedCoursesFromReport = reportParsed?.completedCourses ?? [];
  const reportCodes = new Set(completedCoursesFromReport.map(c => c.code.toUpperCase()));

  // All course codes already in this plan (any term, any bucket)
  const planAllCourseCodes = new Set(
    (activePlan?.items ?? [])
      .filter(i => i.itemType === "course" && i.courseCode)
      .map(i => i.courseCode!.toUpperCase()),
  );

  // (a) courses the report shows completed but planned in future terms
  const futurePlanItems = activePlan?.items.filter(i =>
    i.itemType === "course" &&
    i.courseCode &&
    i.term !== "completed" &&
    (i.bucket ?? "planned") !== "completed"
  ) ?? [];
  const reportCompletedButFuture = futurePlanItems.filter(i =>
    reportCodes.has(i.courseCode!.toUpperCase())
  );

  // (b) courses in plan completed area not in the report
  const planCompletedItems = activePlan?.items.filter(i =>
    (i.term === "completed" || (i.bucket ?? "planned") === "completed") &&
    i.itemType === "course" &&
    i.courseCode
  ) ?? [];
  const planCompletedNotInReport = planCompletedItems.filter(i =>
    !reportCodes.has(i.courseCode!.toUpperCase())
  );

  // (c) NEW: report-completed courses not yet in the plan at all
  const reportCompletedNotInPlan = completedCoursesFromReport.filter(
    c => !planAllCourseCodes.has(c.code.toUpperCase())
  );

  // Bulk import selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  // Reset selection/result when the report changes
  const allImportable = reportCompletedNotInPlan.map(c => c.code.toUpperCase());

  const toggleCourse = (code: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setImportResult(null);
    setImportError(null);
  };

  const toggleAll = () => {
    setImportResult(null);
    setImportError(null);
    if (selected.size === allImportable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allImportable));
    }
  };

  const handleBulkImport = () => {
    if (!activePlanId || selected.size === 0) return;
    setImportError(null);
    setImportResult(null);
    bulkImport.mutate(
      { planId: activePlanId, courseCodes: Array.from(selected) },
      {
        onSuccess: (result) => {
          setImportResult({ added: result.added.length, skipped: result.skipped.length });
          setSelected(new Set());
        },
        onError: (err) => {
          setImportError(err.message);
        },
      },
    );
  };

  const handleMoveToCompleted = (itemId: number) => {
    if (!activePlanId) return;
    updatePlanItem.mutate({
      id: activePlanId,
      itemId,
      data: {
        academicYear: 0,
        term: "completed" as any,
        bucket: "completed" as const,
        completionSource: "manually_marked" as any,
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Academic Progress summary */}
      <div data-testid="plan-academic-progress">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          <GraduationCap className="h-3.5 w-3.5" />
          Academic Progress
        </div>

        {!profile ? (
          <p className="text-xs text-muted-foreground">
            Complete your profile to see your program and progress.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {majors.map((m) => (
                <Badge key={m} className="bg-primary/10 text-primary border-primary/20 text-[10px]" variant="outline">
                  {m}
                </Badge>
              ))}
              {minors.map((m) => (
                <Badge key={m} variant="outline" className="text-muted-foreground text-[10px]">
                  {m} minor
                </Badge>
              ))}
              {majors.length === 0 && minors.length === 0 && (
                <span className="text-xs text-muted-foreground">No major declared yet.</span>
              )}
            </div>

            {summary && (
              <div>
                <div className="flex items-baseline justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {summary.classification}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {summary.totalUnitsAllSources} / 175
                  </div>
                </div>
                <Progress value={summary.progressPercent} className="mt-1.5 h-1.5" />
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {summary.unitsToGraduation} units to graduation
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                <BookCheck className="h-3 w-3" />
                Completed ({completed.length})
              </div>
              {completed.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No completed coursework recorded yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                  {completed.map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-[10px]"
                      data-testid={`progress-completed-${c}`}>
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {apIb.length > 0 && (
              <div className="pt-2 border-t border-border/60">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  <Award className="h-3 w-3" />
                  AP / IB Credit ({apIb.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {apIb.map((c) => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">
                      {c.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Imported report reference + mismatches */}
      <div className="pt-3 border-t border-border/60" data-testid="plan-progress-report-section">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          <BookCheck className="h-3 w-3" />
          Progress Report
        </div>

        {reportEnvelope === undefined && (
          <p className="text-[10px] text-muted-foreground">Loading...</p>
        )}

        {reportEnvelope && !reportEnvelope.available && (
          <p className="text-[10px] text-muted-foreground" data-testid="report-uploads-unavailable">
            File uploads aren't configured in this environment.
          </p>
        )}

        {reportEnvelope?.available && !reportEnvelope.report && (
          <p className="text-[10px] text-muted-foreground" data-testid="report-none-uploaded">
            No progress report uploaded yet.{" "}
            <Link href="/progress-report" className="underline text-primary">
              Upload one
            </Link>
            {" "}to see mismatch notices.
          </p>
        )}

        {reportEnvelope?.available && reportEnvelope.report && (
          <div className="space-y-3">
            {/* Completed courses from report */}
            {completedCoursesFromReport.length === 0 ? (
              <p className="text-[10px] text-muted-foreground" data-testid="report-empty-parse">
                Your report was parsed but no completed courses were found.
              </p>
            ) : (
              <div data-testid="report-completed-courses">
                <div className="text-[10px] text-muted-foreground mb-1">
                  Report shows {completedCoursesFromReport.length} completed course{completedCoursesFromReport.length !== 1 ? "s" : ""}
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                  {completedCoursesFromReport.map((c) => (
                    <Badge key={c.code} variant="secondary" className="font-mono text-[10px]"
                      data-testid={`report-course-${c.code}`}>
                      {c.code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ── NEW: Bulk import – report courses not yet in the plan ── */}
            {reportCompletedNotInPlan.length > 0 && (
              <div
                className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 space-y-2"
                data-testid="bulk-import-section"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-800">
                  <PackagePlus className="h-3.5 w-3.5" />
                  {reportCompletedNotInPlan.length} course{reportCompletedNotInPlan.length !== 1 ? "s" : ""} not yet in your plan
                </div>

                {/* Select all / deselect all */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-[10px] text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    onClick={toggleAll}
                    data-testid="bulk-import-toggle-all"
                  >
                    {selected.size === allImportable.length ? "Deselect all" : "Select all"}
                  </button>
                  <span className="text-[10px] text-blue-700 tabular-nums">
                    {selected.size} / {allImportable.length} selected
                  </span>
                </div>

                {/* Course checklist */}
                <div
                  className="space-y-1 max-h-32 overflow-y-auto pr-1"
                  data-testid="bulk-import-course-list"
                >
                  {reportCompletedNotInPlan.map((c) => {
                    const key = c.code.toUpperCase();
                    return (
                      <label
                        key={c.code}
                        className="flex items-center gap-2 cursor-pointer group"
                        data-testid={`bulk-import-course-${c.code}`}
                      >
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={() => toggleCourse(key)}
                          className="h-3.5 w-3.5 border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          aria-label={`Import ${c.code}`}
                        />
                        <span className="font-mono text-[10px] text-blue-900 group-hover:text-blue-700">
                          {c.code}
                        </span>
                        {c.title && (
                          <span className="text-[10px] text-blue-700/70 truncate max-w-[120px]" title={c.title}>
                            {c.title}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {/* Import button */}
                <Button
                  size="sm"
                  variant="default"
                  className="w-full h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleBulkImport}
                  disabled={selected.size === 0 || bulkImport.isPending}
                  data-testid="bulk-import-confirm-button"
                >
                  <PackagePlus className="h-3 w-3 mr-1.5" />
                  {bulkImport.isPending
                    ? "Adding…"
                    : `Add ${selected.size > 0 ? selected.size : ""} course${selected.size !== 1 ? "s" : ""} to Completed area`}
                </Button>

                {/* Result feedback */}
                {importResult && (
                  <p className="text-[10px] text-blue-800" data-testid="bulk-import-result">
                    ✓ Added {importResult.added} course{importResult.added !== 1 ? "s" : ""} to your Completed area
                    {importResult.skipped > 0 ? ` (${importResult.skipped} already in plan, skipped)` : ""}.
                  </p>
                )}
                {importError && (
                  <p className="text-[10px] text-red-700" data-testid="bulk-import-error">
                    {importError}
                  </p>
                )}
              </div>
            )}

            {/* Mismatch (a): report shows completed but in future term */}
            {reportCompletedButFuture.length > 0 && (
              <div className="space-y-1.5" data-testid="mismatch-report-completed-future">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Possible mismatches
                </div>
                {reportCompletedButFuture.map((item) => (
                  <div key={item.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900"
                    data-testid={`mismatch-future-${item.id}`}>
                    <div className="mb-1">
                      Your report shows <span className="font-mono font-bold">{item.courseCode}</span> completed, but it's planned for{" "}
                      <span className="capitalize">{item.term} {item.academicYear}</span> — review.
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] border-amber-300 text-amber-800 hover:bg-amber-100"
                      onClick={() => handleMoveToCompleted(item.id)}
                      data-testid={`move-to-completed-${item.id}`}
                    >
                      <MoveRight className="h-3 w-3 mr-1" />
                      Move to Completed area
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Mismatch (b): in plan completed area but not in report */}
            {planCompletedNotInReport.length > 0 && (
              <div className="space-y-1.5" data-testid="mismatch-plan-completed-not-in-report">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                  <Info className="h-3 w-3" />
                  In your plan's completed area but not in report
                </div>
                <div className="flex flex-wrap gap-1">
                  {planCompletedNotInReport.map((item) => (
                    <Badge key={item.id} variant="outline" className="font-mono text-[10px] border-dashed"
                      data-testid={`plan-completed-not-in-report-${item.id}`}>
                      {item.courseCode}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
