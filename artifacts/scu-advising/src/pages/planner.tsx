import { WORKDAY_STUDENT_URL } from "@/lib/workday";
import { useState, useMemo, useRef } from "react";
import {
  useCheckPlan,
  useGetProfile,
  getGetProfileQueryKey,
  useListPlans,
  useGetPlan,
  getGetPlanQueryKey,
  PlanItem,
  Term,
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
import { anchorYearFor } from "@/lib/academic-year";
import { TermAndScheduleHeader } from "@/components/schedule-planner/TermAndScheduleHeader";
import { AcademicYearOverview } from "@/components/schedule-planner/AcademicYearOverview";
import { CalendarGrid } from "@/components/schedule-planner/CalendarGrid";
import { ConflictsPanel } from "@/components/schedule-planner/ConflictsPanel";
import { SidebarPanels } from "@/components/schedule-planner/SidebarPanels";
import { CourseDetailsDialog } from "@/components/schedule-planner/CourseDetailsDialog";
import { AcademicProgress } from "@/components/AcademicProgress";
import { ScheduleEvent } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Quarter Plan supports fall/winter/spring only (the three academic quarters).
// Summer is excluded from the term selector; the availability endpoint remains
// the sole source of official/tentative status for the allowed terms.
const QUARTER_PLAN_TERMS = new Set(["fall", "winter", "spring"]);

export default function Planner() {
  const { toast } = useToast();
  const workspace = useScheduleWorkspace();
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(
    null,
  );
  const focusedQuarterRef = useRef<HTMLDivElement | null>(null);
  const handleFocusQuarter = (term: Term, year: number) => {
    workspace.setActiveTerm(term);
    workspace.setActiveYear(year);
    focusedQuarterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
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
  const degreePlan =
    plansList?.plans.find((p) => p.planType === "degree") ??
    plansList?.plans[0] ??
    null;
  const { data: activePlan } = useGetPlan(degreePlan?.id ?? 0, {
    query: {
      enabled: !!degreePlan?.id,
      queryKey: getGetPlanQueryKey(degreePlan?.id ?? 0),
    },
  });

  // Items in the degree plan for the selected quarter
  const degreeItems: PlanItem[] = useMemo(() => {
    if (!activePlan || !workspace.activeTerm || !workspace.activeYear)
      return [];
    // workspace.activeYear is a CALENDAR year (it comes from schedule
    // availability); plan items are stored under the academic-year anchor.
    const anchor = anchorYearFor(workspace.activeTerm, workspace.activeYear);
    return activePlan.items.filter(
      (i) =>
        i.term === workspace.activeTerm &&
        i.academicYear === anchor &&
        (i.bucket ?? "planned") !== "completed",
    );
  }, [activePlan, workspace.activeTerm, workspace.activeYear]);

  // Sections already selected in this quarter's active schedule
  const selectedSections =
    workspace.activeSchedule?.events.filter((e) => e.kind === "section") ?? [];
  const selectedCourseCodes = new Set(
    selectedSections.map((e) => e.courseCode?.toUpperCase() ?? ""),
  );

  // Run load check against scheduled courses
  const onRunLoadCheck = () => {
    if (
      !workspace.activeSchedule ||
      !workspace.activeTerm ||
      !workspace.activeYear
    )
      return;
    const apIb = creditedCourses(loadStoredExams());
    const mergedCompleted = Array.from(
      new Set(
        [...(profile?.completedCourseCodes ?? []), ...apIb].map((c) =>
          c.toUpperCase(),
        ),
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
      const time =
        s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "Time TBA";
      const component =
        s.componentType && s.componentType !== "unknown"
          ? ` (${s.componentType})`
          : "";
      return isTentativeSchedule
        ? `${s.courseCode} — Tentative offering${component}  ${days} ${time}`
        : `${s.courseCode}-${s.sectionNumber}${component}  ${days} ${time}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Section list copied to clipboard" });
  };

  const loadCheckResult = checkPlan.data;

  return (
    <AppShell>
      <PageHeader
        compact
        title="Quarter Schedule Planner"
        subtitle="Plan your Fall, Winter, and Spring schedules — exact sections from Workday's posted schedule for the next quarter, and the Registrar's tentative schedules for later ones."
      />
      <PageContent>
        {/* The professor's own explanation of this page, kept compact. */}
        <p
          className="mb-2 text-xs leading-relaxed text-muted-foreground"
          data-testid="quarter-plan-intro"
        >
          Your Degree Plan courses are listed for each quarter below. If you
          decide to change which classes you plan to take, go back and edit the
          Degree Plan so it reflects those changes. Find course sections and add
          them to your plan, and be sure to schedule both lecture and lab — or
          any other required component — for courses that require them. At the
          bottom there is a handoff to Workday to complete your registration.{" "}
          <strong className="font-semibold text-foreground">
            CampusVal does not register you for classes; this is planning
            support.
          </strong>
        </p>

        {/* Compact Fall/Winter/Spring focus strip with read-only carryover. */}
        <div className="mb-3">
          <AcademicYearOverview
            activePlan={activePlan}
            focusedTerm={workspace.activeTerm}
            focusedYear={workspace.activeYear}
            onFocusQuarter={handleFocusQuarter}
            availability={workspace.availability}
          />
        </div>

        <div ref={focusedQuarterRef} />

        {/* TermAndScheduleHeader: schedule (what-if) selection for the
            focused quarter — quarter itself is chosen via the overview
            above, fall/winter/spring only. */}
        <TermAndScheduleHeader
          workspace={workspace}
          allowedTerms={QUARTER_PLAN_TERMS}
          showQuarterSelect={false}
        />

        {/* Three columns at laptop width and up:
              Find Courses | weekly calendar | Academic Progress Report.
            The professor asked for Find Courses to be immediately visible
            after choosing a quarter, and for the APR to sit in a dedicated
            right-hand column starting near the top — conceptually the same
            place it occupies on Degree Plan. */}
        <div
          className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[minmax(330px,380px)_minmax(0,1fr)_minmax(280px,320px)]"
          data-testid="quarter-plan-layout"
        >
          {/* Left: section search — the main action on this page. */}
          <div
            className="order-2 flex min-w-0 flex-col gap-3 xl:order-1"
            data-testid="quarter-plan-search-column"
          >
            <PlannedThisQuarterChips
              items={degreeItems}
              selectedCourseCodes={selectedCourseCodes}
              activeTerm={workspace.activeTerm}
              activeYear={workspace.activeYear}
              isLoadingAvailability={workspace.isLoadingAvailability}
              onFindSections={(code) => setIntentionCourse(code)}
            />
            {workspace.activeScheduleId ? (
              <div className="min-h-[24rem] xl:h-[calc(100vh-22rem)]">
                <SidebarPanels
                  workspace={workspace}
                  initialCourse={intentionCourse}
                  onInitialCourseConsumed={() => setIntentionCourse(null)}
                />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border bg-card p-6 text-center text-sm opacity-50 shadow-sm">
                Create a schedule above to search for sections.
              </div>
            )}
          </div>

          {/* Center: Calendar + Conflicts + Handoff — dominant workspace */}
          <div
            className="order-3 flex min-w-0 flex-col gap-4 xl:order-2"
            data-testid="quarter-plan-calendar-column"
          >
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
                <ConflictsPanel
                  events={workspace.activeSchedule?.events || []}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/10 p-8 text-center text-muted-foreground min-h-[300px]">
                <CalendarCheck className="h-10 w-10 mb-3 opacity-30" />
                <h2 className="text-xl font-semibold mb-2">
                  No Schedule Selected
                </h2>
                <p className="max-w-sm text-sm">
                  Create a new schedule or select an existing one above to start
                  placing sections on the calendar.
                </p>
              </div>
            )}

            {/* Workday Handoff Card */}
            <WorkdayHandoffCard
              sections={selectedSections}
              onCopy={onCopyHandoff}
              isTentativeSchedule={isTentativeSchedule}
              quarterLabel={
                workspace.activeTerm && workspace.activeYear
                  ? `${workspace.activeTerm.charAt(0).toUpperCase()}${workspace.activeTerm.slice(1)} ${workspace.activeYear}`
                  : null
              }
              scheduleName={workspace.activeSchedule?.name ?? null}
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
                    Checks use the courses in your selected schedule. CampusVal
                    cannot verify seats, holds, restrictions, or registration
                    eligibility.
                  </p>
                  <Button
                    onClick={onRunLoadCheck}
                    disabled={
                      checkPlan.isPending || !workspace.activeScheduleId
                    }
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
                            Units ·{" "}
                            {standingTitle(loadCheckResult.classStanding)}
                          </div>
                          <div className="text-sm font-semibold">
                            {loadCheckResult.totalUnits} /{" "}
                            {loadCheckResult.unitCap}
                          </div>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            (loadCheckResult.totalUnits /
                              loadCheckResult.unitCap) *
                              100,
                          )}
                          className="mt-2"
                        />
                        <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground font-mono">
                          <span>
                            Standard cap: {loadCheckResult.standardCap}
                          </span>
                          <span>
                            Approved cap: {loadCheckResult.approvedCap}
                          </span>
                        </div>
                      </div>
                      {loadCheckResult.requiresAdvisorApproval && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 leading-snug">
                          <strong>Advisor approval required:</strong> this plan
                          is over your standard cap. Even if eligible to
                          overload, you need written dean approval before
                          registration.
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground italic">
                        {loadCheckResult.overloadReason}
                      </div>
                      <div className="space-y-2 pt-2 border-t border-border">
                        {loadCheckResult.issues.length === 0 ? (
                          <div className="flex items-start gap-2 text-sm text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            No issues were detected in the information CampusVal
                            can verify. Confirm prerequisites, restrictions,
                            seats, and registration eligibility in Workday
                            before registering.
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
                              <Badge
                                key={a}
                                variant="secondary"
                                className="text-xs"
                              >
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

          {/* Right: the Workday Academic Progress Report reference column.
              Starts at the top of the workspace, mirroring Degree Plan, and
              carries nothing else — no CampusVal progress analytics above it. */}
          <div
            className="order-1 flex min-w-0 flex-col gap-3 xl:order-3"
            data-testid="quarter-plan-apr-column"
          >
            <div className="overflow-y-auto xl:h-[calc(100vh-18rem)]">
              <AcademicProgress className="p-3" />
            </div>
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

/**
 * Compact reminder of what the Degree Plan says for the FOCUSED quarter,
 * rendered as a one-line chip row above Find Courses.
 *
 * This replaces the large intentions card that used to sit at the top of the
 * workspace. The professor asked for that space back, and for the carryover
 * itself to be read-only — so these chips never move a course between
 * quarters. They only jump the search to that course, or show that a section
 * has already been chosen. Changing WHICH quarter a course belongs to happens
 * in the Degree Plan.
 */
function PlannedThisQuarterChips({
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
  const quarterLabel =
    activeTerm && activeYear
      ? `${activeTerm.charAt(0).toUpperCase()}${activeTerm.slice(1)} ${activeYear}`
      : "this quarter";

  return (
    <div
      className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
      data-testid="planned-this-quarter"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <LinkIcon className="h-3 w-3" />
        Degree Plan — {quarterLabel}
      </div>

      {courses.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing planned for {quarterLabel}.{" "}
          <Link
            href="/degree-plan"
            className="underline text-primary"
            data-testid="link-degree-plan-empty"
          >
            Add courses in the Degree Plan
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((item) => {
            const code = item.courseCode!;
            const isSelected = selectedCourseCodes.has(code.toUpperCase());
            return isSelected ? (
              <Badge
                key={item.id}
                variant="secondary"
                className="border-emerald-200 bg-emerald-100 text-[10px] font-mono text-emerald-800"
                data-testid={`intention-scheduled-${item.id}`}
                title={`${code} already has a section on this schedule`}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {code}
              </Badge>
            ) : (
              <Button
                key={item.id}
                variant="outline"
                size="sm"
                className="h-6 px-2 font-mono text-[10px]"
                onClick={() => onFindSections(code)}
                data-testid={`button-find-sections-${item.id}`}
                title={`Find ${code} sections in ${quarterLabel}`}
              >
                {code}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function standingTitle(s: string): string {
  switch (s) {
    case "freshman":
      return "First Year";
    case "sophomore":
      return "Sophomore";
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
    default:
      return s;
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
  const config: Record<
    string,
    { icon: React.ReactNode; bg: string; border: string }
  > = {
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
      <div className="text-sm text-foreground/90 leading-snug">
        {issue.message}
      </div>
    </div>
  );
}

function WorkdayHandoffCard({
  sections,
  onCopy,
  isTentativeSchedule,
  quarterLabel,
  scheduleName,
}: {
  sections: ScheduleEvent[];
  onCopy: () => void;
  isTentativeSchedule: boolean;
  quarterLabel?: string | null;
  scheduleName?: string | null;
}) {
  return (
    <Card className="p-4" data-testid="workday-handoff-card">
      <div className="flex items-center gap-2 mb-3">
        <ExternalLink className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Workday Handoff
        </span>
      </div>

      {quarterLabel && (
        <p
          className="mb-2 text-xs font-medium text-foreground"
          data-testid="handoff-scope"
        >
          {quarterLabel}
          {scheduleName ? ` · ${scheduleName}` : ""}
        </p>
      )}

      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        <strong className="text-foreground">
          CampusVal cannot register you for classes.
        </strong>{" "}
        This plan is not enrollment, and CampusVal cannot confirm seats, holds,
        restrictions, or your registration eligibility.{" "}
        {isTentativeSchedule
          ? "This quarter's schedule is still tentative, so treat this as planning rather than something you can register for today."
          : "When you're ready, copy your section list and open Workday Student to register manually."}
      </p>

      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Add course sections to your schedule to see them here.
        </p>
      ) : (
        <div className="bg-muted/30 border border-border/50 rounded-md p-3 mb-3 font-mono text-xs space-y-1 overflow-x-auto">
          {sections.map((s) => {
            const days = s.meetingDays.join("") || "TBA";
            const time =
              s.startTime && s.endTime
                ? `${s.startTime}–${s.endTime}`
                : "Time TBA";
            return (
              <div
                key={s.id}
                data-testid={`handoff-section-${s.id}`}
                className="whitespace-nowrap"
              >
                {isTentativeSchedule
                  ? `${s.courseCode} — Tentative offering`
                  : `${s.courseCode}-${s.sectionNumber}`}
                {s.componentType && s.componentType !== "unknown"
                  ? ` (${s.componentType})`
                  : ""}
                {"  "}
                {days} {time}
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
          <Button
            size="sm"
            className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Open Workday Student <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </a>
      </div>
    </Card>
  );
}
