import { useState } from "react";
import { AcademicPlan, useGetProgressReport } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SlidersHorizontal, Upload } from "lucide-react";
import { Link } from "wouter";
import { PlanControlsPanel } from "./PlanControlsPanel";
import { FourYearPreload } from "./FourYearPreload";
import { useDegreePlanContext } from "./DegreePlanContext";

/**
 * "Executive control bar" above the planning board: each control sits on the
 * side of the column it affects, so its physical placement matches what it
 * does —
 *
 *   LEFT (Plan Controls)      → Planning Requirements, on the left
 *   MIDDLE (Load Four-Year Plan + plan name) → the Degree Plan board, center
 *   RIGHT (Upload/Replace Workday APR) → the APR reference column, on the right
 *
 * The plan-type label ("Degree Plan" / "Tentative Degree Plan") is
 * deliberately not repeated here — the page heading above already says it;
 * only the plan's own (possibly custom) name is shown.
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
  const { data: reportEnvelope } = useGetProgressReport();
  const hasReport = !!reportEnvelope?.report;

  const degreePlan = plans.find((p) => p.planType === "degree") ?? null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 shadow-sm"
      data-testid="degree-plan-toolbar"
    >
      {/* LEFT: affects Planning Requirements */}
      {/* min-w is a real floor (not 0) so the row actually wraps instead of
          crushing a section to nothing — see DegreePlanToolbar's toolbar-plan-name
          fix for why min-w-0 on a flex-1 section defeats flex-wrap. */}
      <div className="flex min-w-36 flex-1 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={() => setControlsOpen(true)}
          data-testid="button-open-plan-controls"
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          Plan Controls
        </Button>
        <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">
          Add majors, minors, or professional preparation not yet in your APR.
        </span>
      </div>

      {/* MIDDLE: affects the Degree Plan board itself */}
      {/* min-w-72 (not min-w-44): at in-between widths like 768px, where all
          three sections fit on one row without wrapping, flex-1 splits the
          row's slack evenly regardless of each section's actual content — a
          smaller floor here let the name span (needing its own real floor
          below) get squeezed down to 1-2 visible characters before the
          "Load Four-Year Plan" button. 72 covers name + button + gap so the
          squeeze never happens; narrower viewports still wrap normally. */}
      <div className="flex min-w-72 flex-1 items-center justify-center gap-2">
        <span
          className="min-w-20 truncate text-sm font-semibold leading-tight"
          data-testid="toolbar-plan-name"
        >
          {activePlan?.name ?? "—"}
        </span>
        <FourYearPreload degreePlan={mode === "tentative" ? activePlan ?? null : degreePlan} />
      </div>

      {/* RIGHT: affects the Workday APR reference column */}
      <div className="flex min-w-36 flex-1 items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 text-xs">
          <Link href="/progress-report" data-testid="button-upload-apr-toolbar">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {hasReport ? "Replace Workday APR" : "Upload Workday APR"}
          </Link>
        </Button>
      </div>

      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent
          side="left"
          className="flex w-full flex-col p-0 sm:max-w-md"
          data-testid="sheet-plan-controls"
        >
          <SheetHeader className="border-b border-border/60 px-4 pb-2 pt-4">
            <SheetTitle>Plan Controls</SheetTitle>
            <SheetDescription>
              Add majors, minors, or professional preparation you plan to
              complete that may not yet appear in your Workday Academic
              Progress Report. These choices are planning only — CampusVal
              does not declare anything with the university.
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
