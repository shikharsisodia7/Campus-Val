import { useState } from "react";
import { useCreatePlan } from "@workspace/api-client-react";
import { usePlanningWorkspace } from "./usePlanningWorkspace";
import { PLANNING_THREE_COLUMNS, REQUIREMENTS_DRAWER_WIDTH } from "@/lib/workspace-layout";
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

export function DegreePlanWorkspace({
  mode = "degree",
}: DegreePlanWorkspaceProps) {
  // The plan list, the active plan and its requirements are the shared planning
  // data (usePlanningWorkspace): the same hook feeds the comparison pages.
  const {
    plans,
    degreePlan,
    plansLoading,
    planLoading,
    activePlan,
    activePlanId,
    selectPlan,
    contextValue,
  } = usePlanningWorkspace(mode);
  const queryClient = useQueryClient();
  const [leftOpen, setLeftOpen] = useState(false);
  const createPlan = useCreatePlan();
  const [creating, setCreating] = useState(false);

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
      <div className={`grid h-[calc(100vh-14rem)] gap-3 ${PLANNING_THREE_COLUMNS}`}>
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
    <DegreePlanProvider value={contextValue}>
      <div className="xl:hidden flex items-center justify-between mb-4 bg-card border border-border p-2 rounded-md shadow-sm">
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Menu className="h-4 w-4 mr-2" /> Palette
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className={`${REQUIREMENTS_DRAWER_WIDTH} p-0`}
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

      <DegreePlanToolbar plans={plans} mode={mode} />

      <div
        className={`flex h-[calc(100vh-19rem)] flex-col items-stretch gap-3 xl:grid xl:h-[calc(100vh-14rem)] ${PLANNING_THREE_COLUMNS}`}
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
          <Board plans={plans} />
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
