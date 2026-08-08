import {
  useGetDashboardSummary,
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, BookCheck, Award } from "lucide-react";
import { creditedCourses, loadStoredExams } from "@/lib/apib";
import { ProgressReportSection } from "@/components/ProgressReportSection";

/**
 * Persistent right-side panel summarizing the student's declared program and
 * how far along they are. Reads the same server-computed dashboard summary the
 * Dashboard uses, so progress numbers stay consistent across pages.
 */
export function AcademicProgress({ className }: { className?: string }) {
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });
  const { data: summary } = useGetDashboardSummary();

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

  return (
    <Card className={`p-5 ${className ?? ""}`} data-testid="academic-progress-panel">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <GraduationCap className="h-4 w-4 text-primary" />
        Academic Progress
      </div>

      {!profile ? (
        <p className="text-sm text-muted-foreground mt-3">
          Complete your profile to see your declared program and progress here.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
              Declared
            </div>
            <div className="flex flex-wrap gap-1.5">
              {majors.map((m) => (
                <Badge key={m} className="bg-primary/10 text-primary border-primary/20" variant="outline">
                  {m}
                </Badge>
              ))}
              {minors.map((m) => (
                <Badge key={m} variant="outline" className="text-muted-foreground">
                  {m} minor
                </Badge>
              ))}
              {majors.length === 0 && minors.length === 0 && (
                <span className="text-sm text-muted-foreground">No major declared yet.</span>
              )}
            </div>
          </div>

          {summary && (
            <div>
              <div className="flex items-baseline justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {summary.classification}
                </div>
                <div className="text-sm font-semibold font-mono">
                  {summary.totalUnitsAllSources} / 175
                </div>
              </div>
              <Progress value={summary.progressPercent} className="mt-2" />
              <div className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                {summary.unitsToGraduation} units to graduation
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              <BookCheck className="h-3.5 w-3.5" />
              Completed courses ({completed.length})
            </div>
            {completed.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No completed coursework recorded yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                {completed.map((c) => (
                  <Badge
                    key={c}
                    variant="secondary"
                    className="font-mono text-[11px]"
                    data-testid={`progress-completed-${c}`}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {apIb.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                <Award className="h-3.5 w-3.5" />
                AP / IB credit ({apIb.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {apIb.map((c) => (
                  <Badge key={c} variant="outline" className="font-mono text-[11px]">
                    {c.toUpperCase()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <ProgressReportSection />
        </div>
      )}
    </Card>
  );
}
