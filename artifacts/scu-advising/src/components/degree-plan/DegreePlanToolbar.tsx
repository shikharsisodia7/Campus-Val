import { useState } from "react";
import { AcademicPlan } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { PlanControlsPanel } from "./PlanControlsPanel";
import { FourYearPreload } from "./FourYearPreload";
import { useDegreePlanContext } from "./DegreePlanContext";

/**
 * Compact control strip that sits above the planning board.
 *
 * Per the professor's correction, everything that CHANGES what the student is
 * planning — switching plans, editing the planning major, adding a second
 * major, minors, Professional Preparation, loading a four-year sequence —
 * lives here on the planning side. The right-hand column is reserved
 * exclusively for the Workday Academic Progress Report so the student can
 * compare their plan against the university record.
 *
 * It is deliberately one short row: the professor repeatedly asked for less
 * wasted vertical space above the board.
 */
export function DegreePlanToolbar({
  plans,
  mode,
}: {
  plans: AcademicPlan[];
  mode: "degree" | "tentative";
}) {
  const { activePlan } = useDegreePlanContext();
  const [controlsOpen, setControlsOpen] = useState(false);

  const degreePlan = plans.find((p) => p.planType === "degree") ?? null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 shadow-sm"
      data-testid="degree-plan-toolbar"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {mode === "tentative" ? "Tentative Degree Plan" : "Degree Plan"}
        </span>
        <div
          className="truncate text-sm font-semibold leading-tight"
          data-testid="toolbar-plan-name"
        >
          {activePlan?.name ?? "—"}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <FourYearPreload degreePlan={mode === "tentative" ? activePlan ?? null : degreePlan} />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setControlsOpen(true)}
          data-testid="button-open-plan-controls"
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          Plan Controls
        </Button>
      </div>

      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent
          className="flex w-full flex-col p-0 sm:max-w-md"
          data-testid="sheet-plan-controls"
        >
          <SheetHeader className="border-b border-border/60 px-4 pb-2 pt-4">
            <SheetTitle>Plan Controls</SheetTitle>
            <SheetDescription>
              Switch plans, and edit majors, minors, and Professional
              Preparation for this plan. These choices are planning only —
              CampusVal does not declare anything with the university.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <PlanControlsPanel plans={plans} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
