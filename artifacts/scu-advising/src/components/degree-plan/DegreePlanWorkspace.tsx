import { useState, useEffect } from "react";
import { 
  useListPlans, 
  useGetPlan, 
  useGetProfile, 
  useGetDegreeRequirements, 
  useGetScheduleAvailability,
  useListCourses,
  getGetPlanQueryKey,
} from "@workspace/api-client-react";
import { DegreePlanProvider } from "./DegreePlanContext";
import { Palette } from "./Palette";
import { Board } from "./Board";
import { ContextPanel } from "./ContextPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Menu, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export function DegreePlanWorkspace({ mode = "degree" }: { mode?: "degree" | "tentative" }) {
  const { data: plansList, isLoading: plansLoading } = useListPlans();
  const [activePlanId, setActivePlanId] = useState<number | null>(null);

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    if (!activePlanId && plansList?.plans) {
      // On the Tentative Plans page, default to the most recent tentative
      // plan; on Degree Plan, default to the degree plan.
      const defaultPlan =
        mode === "tentative"
          ? plansList.plans.find(p => p.planType === 'tentative') ?? plansList.plans.find(p => p.planType === 'degree')
          : plansList.plans.find(p => p.planType === 'degree') || plansList.plans[0];
      if (defaultPlan) {
        setActivePlanId(defaultPlan.id);
      }
    }
  }, [plansList, activePlanId, mode]);

  const { data: activePlan, isLoading: planLoading } = useGetPlan(activePlanId!, {
    query: { enabled: !!activePlanId, queryKey: getGetPlanQueryKey(activePlanId!) }
  });

  const { data: profile } = useGetProfile();
  const { data: reqsData } = useGetDegreeRequirements();
  const { data: scheduleAvailability } = useGetScheduleAvailability();
  const { data: catalog } = useListCourses({});

  if (plansLoading || (activePlanId && planLoading)) {
    return (
      <div className="flex gap-4 h-[calc(100vh-14rem)]">
        <Skeleton className="hidden xl:block w-[320px] h-full rounded-md" />
        <Skeleton className="flex-1 h-full rounded-md" />
        <Skeleton className="hidden xl:block w-[280px] h-full rounded-md" />
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
    <DegreePlanProvider value={{
      activePlan,
      activePlanId,
      setActivePlanId,
      profile,
      requirements: reqsData?.groups,
      scheduleAvailability,
      catalog,
    }}>
      <div className="xl:hidden flex items-center justify-between mb-4 bg-card border border-border p-2 rounded-md shadow-sm">
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm"><Menu className="h-4 w-4 mr-2" /> Palette</Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] p-0">
            <SheetTitle className="sr-only">Course Palette</SheetTitle>
            <Palette />
          </SheetContent>
        </Sheet>
        
        <div className="text-sm font-semibold truncate px-2">{activePlan?.name}</div>

        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm"><Settings2 className="h-4 w-4 mr-2" /> Plan Info</Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] p-0">
            <SheetTitle className="sr-only">Plan Context</SheetTitle>
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
        <div className="hidden xl:block w-[280px] shrink-0 h-full overflow-hidden">
          <ContextPanel plans={plansList?.plans ?? []} />
        </div>
      </div>
    </DegreePlanProvider>
  );
}
