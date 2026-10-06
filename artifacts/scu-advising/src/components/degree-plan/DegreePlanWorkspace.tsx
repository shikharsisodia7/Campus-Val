import { useState, useEffect, useMemo } from "react";
import {
  useListPlans,
  useGetPlan,
  useGetProfile,
  useGetDegreeRequirements,
  useGetPlanRequirements,
  useGetScheduleAvailability,
  useListCourses,
  useCreatePlan,
  getGetPlanQueryKey,
  getGetPlanRequirementsQueryKey,
} from "@workspace/api-client-react";
import { DegreePlanProvider } from "./DegreePlanContext";
import { Palette } from "./Palette";
import { Board } from "./Board";
import { ContextPanel } from "./ContextPanel";
import { AprReferenceSheet } from "@/components/progress-report/AprReferenceSheet";
import { DegreePlanToolbar } from "./DegreePlanToolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  Menu,
  FlaskConical,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const LAST_TENTATIVE_PLAN_KEY = "campusval.lastTentativePlanId";

export function DegreePlanWorkspace({
  mode = "degree",
}: DegreePlanWorkspaceProps) {
  const { data: plansList, isLoading: plansLoading } = useListPlans();
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const [leftOpen, setLeftOpen] = useState(false);

  const createPlan = useCreatePlan();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activePlanId && plansList?.plans) {
      if (mode === "tentative") {
        // Prefer the plan the user was last working on (survives reloads).
        // Fall back to the first tentative plan only if the remembered one
        // no longer exists (e.g. it was deleted or promoted).
        const rememberedRaw = sessionStorage.getItem(LAST_TENTATIVE_PLAN_KEY);
        const rememberedId = rememberedRaw ? Number(rememberedRaw) : null;
        const remembered = rememberedId
          ? plansList.plans.find(
              (p) => p.id === rememberedId && p.planType === "tentative",
            )
          : undefined;
        const tentativePlan =
          remembered ?? plansList.plans.find((p) => p.planType === "tentative");
        if (tentativePlan) {
          setActivePlanId(tentativePlan.id);
        }
        // else: show starter state (activePlanId stays null)
      } else {
        const defaultPlan =
          plansList.plans.find((p) => p.planType === "degree") ||
          plansList.plans[0];
        if (defaultPlan) {
          setActivePlanId(defaultPlan.id);
        }
      }
    }
  }, [plansList, activePlanId, mode]);

  const { data: activePlan, isLoading: planLoading } = useGetPlan(
    activePlanId!,
    {
      query: {
        enabled: !!activePlanId,
        queryKey: getGetPlanQueryKey(activePlanId!),
      },
    },
  );

  const selectPlan = (planId: number | null) => {
    setActivePlanId(planId);
    if (mode === "tentative") {
      // Only remember an id that's actually a tentative plan — selecting the
      // Degree Plan (e.g. via the Degree Plan entry, or the post-delete
      // fallback) must not poison the remembered-tentative-plan key.
      const isTentative =
        planId !== null &&
        plansList?.plans.some(
          (p) => p.id === planId && p.planType === "tentative",
        );
      if (isTentative) {
        sessionStorage.setItem(LAST_TENTATIVE_PLAN_KEY, String(planId));
      } else {
        sessionStorage.removeItem(LAST_TENTATIVE_PLAN_KEY);
      }
    }
    if (planId !== null) {
      // A tentative plan must always render from its own detail query. This
      // prevents the previous plan's cached detail from briefly appearing
      // after a duplicate/create/switch operation.
      queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(planId) });
    }
  };

  const { data: profile } = useGetProfile();
  // Plan-scoped scenario programs come from the "Programs for this plan"
  // editor (activePlan.programs); legacy metadata.scenarioMajors/Minors are
  // still honored for previously saved scenarios.
  const scenarioMajorQuery =
    [
      ...(activePlan?.programs?.additionalMajors ?? []),
      ...(activePlan?.metadata?.scenarioMajors ?? []),
    ].join(",") || undefined;
  const scenarioMinorQuery =
    [
      ...(activePlan?.programs?.minors ?? []),
      ...(activePlan?.metadata?.scenarioMinors ?? []),
    ].join(",") || undefined;
  const professionalGoalsQuery = activePlan?.programs?.professionalGoals?.length
    ? JSON.stringify(activePlan.programs.professionalGoals)
    : undefined;
  // Courses planned in THIS plan, so a major course that carries a Core
  // designation marks the matching Core requirement as planned instead of
  // leaving it open and pushing the student toward a duplicate course.
  // Plan-scoped by construction: a tentative scenario sends its own items.
  const plannedCoursesQuery =
    Array.from(
      new Set(
        (activePlan?.items ?? [])
          .filter((i) => i.itemType === "course" && !!i.courseCode)
          .map((i) => i.courseCode!.toUpperCase()),
      ),
    ).join(",") || undefined;
  // Plan-scoped PRIMARY major (from "Set / Change Primary Major"). It REPLACES
  // the profile major as the primary for THIS plan's requirement view, so a
  // tentative scenario workshops a different major without touching the Degree
  // Plan. Part of the query key so rapid A→B→C switching always renders the
  // latest selection — a slower earlier response can never overwrite it.
  const primaryMajorQuery = activePlan?.programs?.primaryMajor || undefined;
  // Requirements come from the ACTIVE PLAN when there is one: the server builds
  // them from that plan's programs and planned courses and composes the plan's
  // planning customizations over them. The query key still carries the plan
  // inputs, so a change to any of them refetches (and rapid A→B→C switching
  // always renders the latest). Without a plan (first load, empty tentative
  // state) the plan-less endpoint answers exactly as before.
  const { data: planReqsData, isError: planReqsError } = useGetPlanRequirements(activePlanId ?? 0, {
    query: {
      enabled: activePlanId !== null,
      queryKey: [
        ...getGetPlanRequirementsQueryKey(activePlanId ?? 0),
        primaryMajorQuery,
        scenarioMajorQuery,
        scenarioMinorQuery,
        professionalGoalsQuery,
        plannedCoursesQuery,
      ],
    },
  });
  const { data: legacyReqsData } = useGetDegreeRequirements(
    {
      ...(primaryMajorQuery ? { primaryMajor: primaryMajorQuery } : {}),
      ...(scenarioMajorQuery ? { scenarioMajors: scenarioMajorQuery } : {}),
      ...(scenarioMinorQuery ? { scenarioMinors: scenarioMinorQuery } : {}),
      ...(professionalGoalsQuery
        ? { professionalGoals: professionalGoalsQuery }
        : {}),
      ...(plannedCoursesQuery
        ? { plannedCourses: plannedCoursesQuery }
        : {}),
    },
    {
      query: {
        // Only when there is no plan at all to read requirements from. While
        // plans are loading, or a plan is about to be selected, the plan
        // endpoint answers: asking here too would flash the un-customized list.
        enabled: activePlanId === null && !plansLoading && (plansList?.plans?.length ?? 0) === 0,
        queryKey: [
          "/api/requirements",
          primaryMajorQuery,
          scenarioMajorQuery,
          scenarioMinorQuery,
          professionalGoalsQuery,
          plannedCoursesQuery,
        ],
      },
    },
  );
  const reqsData = activePlanId !== null ? planReqsData : legacyReqsData;
  const requirementsMeta = useMemo(
    () =>
      activePlanId !== null && planReqsData
        ? {
            sourceLabel: planReqsData.requirementsSource.label,
            policyDecided: planReqsData.requirementsSource.policyDecided,
            summary: planReqsData.customizations.summary,
            orphaned: planReqsData.customizations.orphaned,
          }
        : null,
    [activePlanId, planReqsData],
  );
  const { data: scheduleAvailability } = useGetScheduleAvailability();
  const { data: catalog } = useListCourses({});

  const degreePlan = plansList?.plans.find((p) => p.planType === "degree");

  const handleCreateTentative = (copyFromPlanId?: number) => {
    setCreating(true);
    createPlan.mutate(
      {
        data: {
          name: "Tentative Degree Plan",
          copyFromPlanId: copyFromPlanId ?? null,
        },
      },
      {
        onSuccess: (newPlan) => {
          selectPlan(newPlan.id);
          queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
          });
          setCreating(false);
        },
        onError: () => setCreating(false),
      },
    );
  };

  if (plansLoading || (activePlanId && planLoading)) {
    return (
      <div className="grid h-[calc(100vh-14rem)] gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(330px,380px)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)_minmax(400px,460px)]">
        <Skeleton className="hidden h-full rounded-md xl:block" />
        <Skeleton className="h-full min-w-0 rounded-md" />
        <Skeleton className="hidden h-full rounded-md xl:block" />
      </div>
    );
  }

  // Tentative mode with no tentative plans yet — show starter state
  if (mode === "tentative" && !activePlanId && !plansLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 text-center border border-dashed rounded-md bg-muted/20 gap-4 p-8"
        data-testid="tentative-starter-state"
      >
        <FlaskConical className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <h3 className="mb-1 text-lg font-semibold">
            No Tentative Degree Plan yet
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Tentative Degree Plans are safe, independent scenarios — great for
            trying out a second major, different sequencing, or a study-abroad
            term. Promoting one replaces your Degree Plan after confirmation.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          {degreePlan && (
            <Button
              onClick={() => handleCreateTentative(degreePlan.id)}
              disabled={creating}
              data-testid="button-copy-degree-plan"
              // The label is long: let it wrap on a phone instead of pushing the page wider than the screen.
              className="h-auto max-w-full whitespace-normal py-2 text-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Copy my Degree Plan into a Tentative Degree Plan
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handleCreateTentative()}
            disabled={creating}
            data-testid="button-start-blank-tentative"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start a blank Tentative Degree Plan
          </Button>
        </div>
      </div>
    );
  }

  if (!activePlan && activePlanId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed rounded-md bg-muted/20">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p>Failed to load the active plan.</p>
      </div>
    );
  }

  return (
    <DegreePlanProvider
      value={{
        activePlan,
        activePlanId,
        setActivePlanId: selectPlan,
        profile,
        requirements: reqsData?.groups,
        requirementsMeta,
        requirementsError: activePlanId !== null && planReqsError,
        scheduleAvailability,
        catalog,
      }}
    >
      <div className="xl:hidden flex items-center justify-between mb-4 bg-card border border-border p-2 rounded-md shadow-sm">
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Menu className="h-4 w-4 mr-2" /> Palette
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(24rem,92vw)] p-0"
            onEscapeKeyDown={() => setLeftOpen(false)}
            onPointerDownOutside={() => setLeftOpen(false)}
          >
            <SheetTitle className="sr-only">Course Palette</SheetTitle>
            <Palette />
          </SheetContent>
        </Sheet>

        <div className="text-sm font-semibold truncate px-2">
          {activePlan?.name}
        </div>

        {/* The same shared drawer Quarter Plan uses — see AprReferenceSheet. */}
        <AprReferenceSheet>
          <ContextPanel />
        </AprReferenceSheet>
      </div>

      <DegreePlanToolbar plans={plansList?.plans ?? []} mode={mode} />

      <div
        className="flex h-[calc(100vh-19rem)] flex-col items-stretch gap-3 xl:grid xl:h-[calc(100vh-14rem)] xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(330px,380px)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)_minmax(400px,460px)]"
        data-testid="degree-plan-layout"
      >
        <div
          className="hidden h-full min-w-0 overflow-hidden xl:block"
          data-testid="degree-plan-palette-column"
        >
          <Palette />
        </div>
        <div
          className="h-full min-w-0 overflow-hidden"
          data-testid="degree-plan-board-column"
        >
          <Board plans={plansList?.plans ?? []} />
        </div>
        <div
          className="hidden h-full min-w-0 overflow-hidden xl:block"
          data-testid="degree-plan-progress-column"
        >
          <ContextPanel />
        </div>
      </div>
    </DegreePlanProvider>
  );
}

interface DegreePlanWorkspaceProps {
  mode?: "degree" | "tentative";
}
