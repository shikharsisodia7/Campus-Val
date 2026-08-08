import { useState, useEffect } from "react";
import {
  useListPlans,
  useGetPlan,
  useGetProfile,
  useGetDegreeRequirements,
  useGetScheduleAvailability,
  useListCourses,
  useGetProgressReport,
  useCreatePlan,
  getGetPlanQueryKey,
} from "@workspace/api-client-react";
import { DegreePlanProvider } from "./DegreePlanContext";
import { Palette } from "./Palette";
import { Board } from "./Board";
import { ContextPanel } from "./ContextPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, Menu, Settings2, FlaskConical, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const LAST_TENTATIVE_PLAN_KEY = "campusval.lastTentativePlanId";

export function DegreePlanWorkspace({ mode = "degree" }: DegreePlanWorkspaceProps) {
  const { data: plansList, isLoading: plansLoading } = useListPlans();
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const createPlan = useCreatePlan();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activePlanId && plansList?.plans) {
      if (mode === 'tentative') {
        // Prefer the plan the user was last working on (survives reloads).
        // Fall back to the first tentative plan only if the remembered one
        // no longer exists (e.g. it was deleted or promoted).
        const rememberedRaw = sessionStorage.getItem(LAST_TENTATIVE_PLAN_KEY);
        const rememberedId = rememberedRaw ? Number(rememberedRaw) : null;
        const remembered = rememberedId
          ? plansList.plans.find(p => p.id === rememberedId && p.planType === 'tentative')
          : undefined;
        const tentativePlan = remembered ?? plansList.plans.find(p => p.planType === 'tentative');
        if (tentativePlan) {
          setActivePlanId(tentativePlan.id);
        }
        // else: show starter state (activePlanId stays null)
      } else {
        const defaultPlan = plansList.plans.find(p => p.planType === 'degree') || plansList.plans[0];
        if (defaultPlan) {
          setActivePlanId(defaultPlan.id);
        }
      }
    }
  }, [plansList, activePlanId, mode]);

  const { data: activePlan, isLoading: planLoading } = useGetPlan(activePlanId!, {
    query: { enabled: !!activePlanId, queryKey: getGetPlanQueryKey(activePlanId!) }
  });

  const selectPlan = (planId: number | null) => {
    setActivePlanId(planId);
    if (mode === 'tentative') {
      // Only remember an id that's actually a tentative plan — selecting the
      // Degree Plan (e.g. via "Official Degree Plan", or the post-delete
      // fallback) must not poison the remembered-tentative-plan key.
      const isTentative =
        planId !== null &&
        plansList?.plans.some((p) => p.id === planId && p.planType === 'tentative');
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
  const { data: reqsData } = useGetDegreeRequirements(
    {
      ...(scenarioMajorQuery ? { scenarioMajors: scenarioMajorQuery } : {}),
      ...(scenarioMinorQuery ? { scenarioMinors: scenarioMinorQuery } : {}),
    },
    {
      query: {
        queryKey: ["/api/requirements", scenarioMajorQuery, scenarioMinorQuery],
      },
    },
  );
  const { data: scheduleAvailability } = useGetScheduleAvailability();
  const { data: catalog } = useListCourses({});
  const { data: reportData } = useGetProgressReport();

  const degreePlan = plansList?.plans.find(p => p.planType === 'degree');

  const handleCreateTentative = (copyFromPlanId?: number) => {
    setCreating(true);
    createPlan.mutate({
      data: {
        name: copyFromPlanId ? `${degreePlan?.name ?? 'My Plan'} (Tentative)` : 'My Tentative Plan',
        copyFromPlanId: copyFromPlanId ?? null,
      }
    }, {
      onSuccess: (newPlan) => {
        selectPlan(newPlan.id);
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
        setCreating(false);
      },
      onError: () => setCreating(false),
    });
  };

  if (plansLoading || (activePlanId && planLoading)) {
    return (
      <div className="flex gap-4 h-[calc(100vh-14rem)]">
        <Skeleton className="hidden xl:block w-[320px] h-full rounded-md" />
        <Skeleton className="flex-1 h-full rounded-md" />
        <Skeleton className="hidden xl:block w-[280px] h-full rounded-md" />
      </div>
    );
  }

  // Tentative mode with no tentative plans yet — show starter state
  if (mode === 'tentative' && !activePlanId && !plansLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed rounded-md bg-muted/20 gap-4 p-8"
        data-testid="tentative-starter-state">
        <FlaskConical className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <h3 className="font-semibold text-lg mb-1">No tentative plans yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Tentative plans are safe, independent scenarios — great for trying out a second major, different sequencing, or a study-abroad term. Promoting one replaces your official plan after confirmation.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          {degreePlan && (
            <Button
              onClick={() => handleCreateTentative(degreePlan.id)}
              disabled={creating}
              data-testid="button-copy-degree-plan"
            >
              <Plus className="h-4 w-4 mr-2" />
              Copy my Degree Plan into a tentative plan
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handleCreateTentative()}
            disabled={creating}
            data-testid="button-start-blank-tentative"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start a blank tentative plan
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

  // Build aprCompletedCodes from progress report parsed data (THEIRS envelope format)
  const aprCompletedCodes = new Set<string>(
    (reportData?.report?.parsed?.completedCourses ?? []).map((course: any) =>
      course.code.toUpperCase(),
    ),
  );

  return (
    <DegreePlanProvider value={{
      activePlan,
      activePlanId,
        setActivePlanId: selectPlan,
      profile,
      requirements: reqsData?.groups,
      scheduleAvailability,
      catalog,
      aprCompletedCodes,
    }}>
      <div className="xl:hidden flex items-center justify-between mb-4 bg-card border border-border p-2 rounded-md shadow-sm">
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm"><Menu className="h-4 w-4 mr-2" /> Palette</Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[320px] p-0"
            onEscapeKeyDown={() => setLeftOpen(false)}
            onPointerDownOutside={() => setLeftOpen(false)}
          >
            <SheetTitle className="sr-only">Course Palette</SheetTitle>
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-sm bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
              onClick={() => setLeftOpen(false)}
            >
              Close palette
            </button>
            <Palette />
          </SheetContent>
        </Sheet>

        <div className="text-sm font-semibold truncate px-2">{activePlan?.name}</div>

        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm"><Settings2 className="h-4 w-4 mr-2" /> Plan Info</Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[300px] p-0"
            onEscapeKeyDown={() => setRightOpen(false)}
            onPointerDownOutside={() => setRightOpen(false)}
          >
            <SheetTitle className="sr-only">Plan Context</SheetTitle>
            <button
              type="button"
              className="absolute left-3 top-3 z-10 rounded-sm bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
              onClick={() => setRightOpen(false)}
            >
              Close
            </button>
            <ContextPanel plans={plansList?.plans ?? []} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 h-[calc(100vh-18rem)] xl:h-[calc(100vh-14rem)] items-stretch">
        <div className="hidden xl:block w-[320px] shrink-0 h-full overflow-hidden">
          <Palette />
        </div>
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <Board plans={plansList?.plans ?? []} />
        </div>
        <div className="hidden xl:block w-[300px] shrink-0 h-full overflow-y-auto space-y-4 pr-1">
          <div className="h-[58%] min-h-[360px]">
            <ContextPanel plans={plansList?.plans ?? []} />
          </div>
        </div>
      </div>
    </DegreePlanProvider>
  );
}

interface DegreePlanWorkspaceProps {
  mode?: 'degree' | 'tentative';
}
