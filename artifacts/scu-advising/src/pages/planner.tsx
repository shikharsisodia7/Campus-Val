import { WORKDAY_STUDENT_URL } from "@/lib/workday";
import { useState, useMemo } from "react";
import {
  useCheckPlan,
  useGetProfile,
  getGetProfileQueryKey,
  useListPlans,
  useGetPlan,
  getGetPlanQueryKey,
  PlanItem,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  CalendarCheck,
  BookOpen,
} from "lucide-react";
import { Link } from "wouter";
import { creditedCourses, loadStoredExams } from "@/lib/apib";
import { useScheduleWorkspace } from "@/components/schedule-planner/useScheduleWorkspace";
import { TermAndScheduleHeader } from "@/components/schedule-planner/TermAndScheduleHeader";
import { CalendarGrid } from "@/components/schedule-planner/CalendarGrid";
import { ConflictsPanel } from "@/components/schedule-planner/ConflictsPanel";
import { SidebarPanels } from "@/components/schedule-planner/SidebarPanels";
import { CourseDetailsDialog } from "@/components/schedule-planner/CourseDetailsDialog";
import { ScheduleEvent } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Quarter Plan supports fall/winter/spring only (the three academic quarters).
// Summer is excluded from the term selector; the availability endpoint remains
// the sole source of official/tentative status for the allowed terms.
const QUARTER_PLAN_TERMS = new Set(["fall", "winter", "spring"]);

export default function Planner() {
  const { toast } = useToast();
  const workspace = useScheduleWorkspace();
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const isTentativeSchedule =
    workspace.availability?.terms.find(
      (t) => t.term === workspace.activeTerm && t.year === workspace.activeYear,
    )?.status === "tentative";

  // Intentions panel: jump a course into Quick Add
  const [intentionCourse, setIntentionCourse] = useState<string | null>(null);

  // Load-check collapsible
  const [loadCheckOpen, setLoadCheckOpen] = useState(false);
  const checkPlan = useCheckPlan();

  // Profile for load-check
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });

  // Degree plan (find the 'degree' type plan)
  const { data: plansList } = useListPlans();
  const degreePlan = plansList?.plans.find((p) => p.planType === "degree") ?? plansList?.plans[0] ?? null;
  const { data: activePlan } = useGetPlan(degreePlan?.id ?? 0, {
    query: { enabled: !!degreePlan?.id, queryKey: getGetPlanQueryKey(degreePlan?.id ?? 0) },
  });

  // Items in the degree plan for the selected quarter
  const degreeItems: PlanItem[] = useMemo(() => {
    if (!activePlan || !workspace.activeTerm || !workspace.activeYear) return [];
    return activePlan.items.filter(
      (i) => i.term === workspace.activeTerm && i.academicYear === workspace.activeYear,
    );
  }, [activePlan, workspace.activeTerm, workspace.activeYear]);

  // Sections already selected in this quarter's active schedule
  const selectedSections = workspace.activeSchedule?.events.filter((e) => e.kind === "section") ?? [];
  const selectedCourseCodes = new Set(selectedSections.map((e) => e.courseCode?.toUpperCase() ?? ""));

  // Run load check against scheduled courses
  const onRunLoadCheck = () => {
    if (!workspace.activeSchedule || !workspace.activeTerm || !workspace.activeYear) return;
    const apIb = creditedCourses(loadStoredExams());
    const mergedCompleted = Array.from(
      new Set(
        [...(profile?.completedCourseCodes ?? []), ...apIb].map((c) => c.toUpperCase()),
      ),
    );
    const scheduledCourses = selectedSections
      .filter((e) => e.courseCode)
      .map((e) => ({ code: e.courseCode!, units: e.units ?? 0 }));
    if (scheduledCourses.length === 0) {
      toast({ title: "No course sections on this schedule yet." });
      return;
    }
    checkPlan.mutate({
      data: {
        term: workspace.activeTerm as "fall" | "winter" | "spring" | "summer",
        year: workspace.activeYear,
        college: profile?.college ?? "School of Engineering",
        plannedCourses: scheduledCourses,
        completedCourseCodes: mergedCompleted,
        cumulativeGpa: profile?.cumulativeGpa ?? null,
        priorityRegistration: profile?.priorityRegistration ?? false,
      },
    });
    setLoadCheckOpen(true);
  };

  // Workday handoff copy
  const onCopyHandoff = () => {
    if (selectedSections.length === 0) {
      toast({ title: "No sections to copy yet." });
      return;
    }
    const lines = selectedSections.map((s) => {
      const days = s.meetingDays.join("") || "TBA";
      const time = s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "Time TBA";
      return `${s.courseCode}-${s.sectionNumber}  ${days} ${time}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Section list copied to clipboard" });
  };

  const loadCheckResult = checkPlan.data;

  return (
    <AppShell>
      <PageHeader
        title="Quarter Plan"
        subtitle="Pick exact sections for one quarter. Use your Degree Plan intentions as a guide, select sections on the calendar, then hand off to Workday to register. CampusVal does not register you — this is planning support only."
      />
      <PageContent>
        {/* TermAndScheduleHeader: term/year selection from availability API, fall/winter/spring only */}
        <TermAndScheduleHeader
          workspace={workspace}
          allowedTerms={QUARTER_PLAN_TERMS}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: Calendar + Conflicts + Degree Intentions */}
          <div className="xl:col-span-8 xl:col-start-1 flex flex-col gap-6 min-w-0">

            {/* Degree Plan Intentions Panel */}
            <DegreePlanIntentionsPanel
              items={degreeItems}
              selectedCourseCodes={selectedCourseCodes}
              activeTerm={workspace.activeTerm}
              activeYear={workspace.activeYear}
              isLoadingAvailability={workspace.isLoadingAvailability}
              onFindSections={(code) => setIntentionCourse(code)}
            />

            {/* Calendar or empty state */}
            {workspace.activeScheduleId ? (
              <>
                {/* overflow-x-auto here lets CalendarGrid scroll horizontally on
                    narrow screens without widening the page; min-w-0 prevents the
                    flex-column child from expanding beyond its parent. */}
                <div className="min-w-0 overflow-x-auto">
                  <CalendarGrid
                    events={workspace.activeSchedule?.events || []}
                    onEventClick={setSelectedEvent}
                    isTentativeSchedule={isTentativeSchedule}
                  />
                </div>
                <ConflictsPanel events={workspace.activeSchedule?.events || []} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/10 p-8 text-center text-muted-foreground min-h-[300px]">
                <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                <h2 className="text-xl font-semibold mb-2">No Schedule Selected</h2>
                <p className="max-w-sm text-sm">
                  Create a new schedule or select an existing one above to start placing sections on the calendar.
                </p>
              </div>
            )}

            {/* Workday Handoff Card */}
            <WorkdayHandoffCard
              sections={selectedSections}
              onCopy={onCopyHandoff}
            />

            {/* Load Check Collapsible */}
            <Card className="p-4">
              <button
                type="button"
                className="w-full flex items-center justify-between text-sm font-semibold text-foreground"
                onClick={() => setLoadCheckOpen((o) => !o)}
                data-testid="button-toggle-load-check"
                aria-expanded={loadCheckOpen}
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Load Check — validate unit caps, prerequisites &amp; overload
                </span>
                {loadCheckOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {loadCheckOpen && (
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Checks run against the course sections currently on your selected schedule. Add sections to the calendar first.
                  </p>
                  <Button
                    onClick={onRunLoadCheck}
                    disabled={checkPlan.isPending || !workspace.activeScheduleId}
                    data-testid="button-check-plan"
                    size="sm"
                  >
                    {checkPlan.isPending ? "Checking…" : "Run load check"}
                  </Button>

                  {loadCheckResult && (
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div>
                        <div className="flex items-baseline justify-between">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                            Units · {standingTitle(loadCheckResult.classStanding)}
                          </div>
                          <div className="text-sm font-semibold">
                            {loadCheckResult.totalUnits} / {loadCheckResult.unitCap}
                          </div>
                        </div>
                        <Progress
                          value={Math.min(100, (loadCheckResult.totalUnits / loadCheckResult.unitCap) * 100)}
                          className="mt-2"
                        />
                        <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground font-mono">
                          <span>Standard cap: {loadCheckResult.standardCap}</span>
                          <span>Approved cap: {loadCheckResult.approvedCap}</span>
                        </div>
                      </div>
                      {loadCheckResult.requiresAdvisorApproval && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 leading-snug">
                          <strong>Advisor approval required:</strong> this plan is over your standard cap. Even if eligible to overload, you need written dean approval before registration.
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground italic">
                        {loadCheckResult.overloadReason}
                      </div>
                      <div className="space-y-2 pt-2 border-t border-border">
                        {loadCheckResult.issues.length === 0 ? (
                          <div className="flex items-start gap-2 text-sm text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            No issues found. This plan looks safe to register.
                          </div>
                        ) : (
                          loadCheckResult.issues.map((issue, i) => (
                            <IssueRow key={i} issue={issue} />
                          ))
                        )}
                      </div>
                      {loadCheckResult.coreAreasFulfilled.length > 0 && (
                        <div className="pt-3 border-t border-border">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                            Core areas fulfilled
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {loadCheckResult.coreAreasFulfilled.map((a) => (
                              <Badge key={a} variant="secondary" className="text-xs">
                                {a}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Right: Section search sidebar */}
          <div className="xl:col-span-4 xl:col-start-9 flex flex-col min-w-0">
            {workspace.activeScheduleId ? (
              <SidebarPanels
                workspace={workspace}
                initialCourse={intentionCourse}
                onInitialCourseConsumed={() => setIntentionCourse(null)}
              />
            ) : (
              <div className="flex-1 rounded-xl bg-card border shadow-sm opacity-50 pointer-events-none p-6 text-center text-sm flex items-center justify-center">
                Please create a schedule to access section search tools.
              </div>
            )}
          </div>
        </div>
      </PageContent>

      <CourseDetailsDialog
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(o) => !o && setSelectedEvent(null)}
        isTentativeSchedule={isTentativeSchedule}
      />
    </AppShell>
  );
}

function DegreePlanIntentionsPanel({
  items,
  selectedCourseCodes,
  activeTerm,
  activeYear,
  isLoadingAvailability,
  onFindSections,
}: {
  items: PlanItem[];
  selectedCourseCodes: Set<string>;
  activeTerm: string | null;
  activeYear: number | null;
  isLoadingAvailability: boolean;
  onFindSections: (courseCode: string) => void;
}) {
  if (isLoadingAvailability || (!activeTerm && !activeYear)) return null;

  const courses = items.filter((i) => i.itemType === "course" && !!i.courseCode);
  const placeholders = items.filter((i) => i.itemType === "requirement_placeholder");

  const quarterLabel = activeTerm && activeYear
    ? `${activeTerm.charAt(0).toUpperCase()}${activeTerm.slice(1)} ${activeYear}`
    : "this quarter";

  return (
    <Card className="p-4" data-testid="intentions-panel">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <LinkIcon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">
            From your Degree Plan — {quarterLabel}
          </span>
        </div>
        <Link href="/degree-plan">
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" data-testid="link-go-to-degree-plan">
            Edit Degree Plan
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
          No courses are planned for {quarterLabel} in your Degree Plan.{" "}
          <Link href="/degree-plan" className="underline text-primary" data-testid="link-degree-plan-empty">
            Add courses to your Degree Plan
          </Link>{" "}
          to see them here.
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map((item) => {
            const code = item.courseCode!;
            const isSelected = selectedCourseCodes.has(code.toUpperCase());
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border ${
                  isSelected ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-muted/20"
                }`}
                data-testid={`intention-course-${item.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelected ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <div className="min-w-0 overflow-hidden">
                    <span className="font-mono text-sm font-bold text-primary">{code}</span>
                    {item.courseTitle && (
                      <span className="ml-2 text-xs text-muted-foreground truncate inline-block max-w-full">{item.courseTitle}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {isSelected ? (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">
                      Section added
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onFindSections(code)}
                      data-testid={`button-find-sections-${item.id}`}
                    >
                      Find sections
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {placeholders.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border/50 bg-muted/10 opacity-70"
              data-testid={`intention-placeholder-${item.id}`}
            >
              <div className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/30" />
              <div className="text-xs text-muted-foreground italic">
                <span className="font-medium not-italic text-foreground/70">
                  {item.requirementLabel || item.requirementCategory || "Requirement placeholder"}
                </span>
                {" "}— decide a course in the{" "}
                <Link href="/degree-plan" className="underline text-primary/80">
                  Degree Plan
                </Link>{" "}
                first
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function standingTitle(s: string): string {
  switch (s) {
    case "freshman": return "First Year";
    case "sophomore": return "Sophomore";
    case "junior": return "Junior";
    case "senior": return "Senior";
    default: return s;
  }
}

function IssueRow({
  issue,
}: {
  issue: {
    severity: string;
    code: string;
    message: string;
    relatedCourse?: string | null;
  };
}) {
  const config: Record<string, { icon: React.ReactNode; bg: string; border: string }> = {
    error: {
      icon: <XCircle className="h-4 w-4 text-destructive" />,
      bg: "bg-destructive/5",
      border: "border-destructive/20",
    },
    warning: {
      icon: <AlertTriangle className="h-4 w-4 text-amber-700" />,
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    info: {
      icon: <Info className="h-4 w-4 text-blue-700" />,
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  };
  const c = config[issue.severity] ?? config.info!;
  return (
    <div className={`flex gap-2.5 p-3 rounded-md border ${c.border} ${c.bg}`}>
      <span className="shrink-0 mt-0.5">{c.icon}</span>
      <div className="text-sm text-foreground/90 leading-snug">{issue.message}</div>
    </div>
  );
}

function WorkdayHandoffCard({
  sections,
  onCopy,
}: {
  sections: ScheduleEvent[];
  onCopy: () => void;
}) {
  return (
    <Card className="p-4" data-testid="workday-handoff-card">
      <div className="flex items-center gap-2 mb-3">
        <ExternalLink className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Workday Handoff</span>
      </div>

      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        <strong className="text-foreground">CampusVal cannot register you for classes.</strong>{" "}
        This plan is not enrollment. When you're ready, copy your section list and open Workday Student to register manually.
      </p>

      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Add course sections to your schedule to see them here.
        </p>
      ) : (
        <div className="bg-muted/30 border border-border/50 rounded-md p-3 mb-3 font-mono text-xs space-y-1 overflow-x-auto">
          {sections.map((s) => {
            const days = s.meetingDays.join("") || "TBA";
            const time = s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "Time TBA";
            return (
              <div key={s.id} data-testid={`handoff-section-${s.id}`} className="whitespace-nowrap">
                {s.courseCode}-{s.sectionNumber}{"  "}{days} {time}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={sections.length === 0}
          className="h-8 text-xs"
          data-testid="button-copy-sections"
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy section list
        </Button>
        <a
          href={WORKDAY_STUDENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-open-workday"
        >
          <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
            Open Workday Student <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </a>
      </div>
    </Card>
  );
}
