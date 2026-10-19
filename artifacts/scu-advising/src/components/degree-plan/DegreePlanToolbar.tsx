import { useState } from "react";
import { AcademicPlan } from "@workspace/api-client-react";
import { useAprDocuments } from "@/hooks/use-apr-documents";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SlidersHorizontal, Upload, Share2 } from "lucide-react";
import { Link } from "wouter";
import { PlanControlsPanel } from "./PlanControlsPanel";
import { FourYearPreload } from "./FourYearPreload";
import { SamplePlanLoader } from "./SamplePlanLoader";
import { AdvisorSharingPanel } from "./AdvisorSharingPanel";
import { useDegreePlanContext } from "./DegreePlanContext";
import { useTrackUsage } from "@/hooks/use-track-usage";

/**
 * "Executive control bar" above the planning board: each control sits on the
 * side of the column it affects, so its physical placement matches what it
 * does —
 *
 *   LEFT (Plan Controls)      → Planning Requirements, on the left
 *   MIDDLE (Load Four-Year Plan + plan name) → the Degree Plan board, center
 *   RIGHT (Upload / Manage Workday APRs) → the APR reference column, on the right
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
  const [sharingOpen, setSharingOpen] = useState(false);
  useTrackUsage("plan_controls", controlsOpen);
  const { data: aprList } = useAprDocuments();
  const hasReport = (aprList?.reports.length ?? 0) > 0;

  const degreePlan = plans.find((p) => p.planType === "degree") ?? null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
      data-testid="degree-plan-toolbar"
    >
      {/* LEFT: affects Planning Requirements */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={() => setControlsOpen(true)}
          title="Add majors, minors, or professional preparation not yet in your APR."
          data-testid="button-open-plan-controls"
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Plan Controls
        </Button>
        {/* Shown in full where it fits; elsewhere the button's tooltip carries it
            (a truncated half-sentence helped no one). */}
        <span className="hidden max-w-[16rem] text-[11px] leading-tight text-muted-foreground 2xl:inline">
          Add majors, minors, or professional preparation not yet in your APR.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={() => setSharingOpen(true)}
          data-testid="button-open-advisor-sharing"
        >
          <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Share
        </Button>
      </div>

      {/* MIDDLE: affects the Degree Plan board itself. From lg up it shares the
          row and the plan name truncates before anything wraps; below lg it
          takes its own line (and may wrap) so nothing is squeezed or pushes
          the page wider than a phone. */}
      <div className="order-last flex w-full flex-wrap items-center justify-center gap-2 lg:order-none lg:w-auto lg:min-w-0 lg:flex-1 lg:flex-nowrap">
        <span
          className="min-w-12 truncate text-sm font-semibold leading-tight"
          data-testid="toolbar-plan-name"
        >
          {activePlan?.name ?? "—"}
        </span>
        <FourYearPreload degreePlan={mode === "tentative" ? activePlan ?? null : degreePlan} />
        <SamplePlanLoader />
      </div>

      {/* RIGHT: affects the Workday APR reference column */}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 text-xs">
          <Link href="/progress-report" data-testid="button-upload-apr-toolbar">
            <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {hasReport ? "Manage Workday APRs" : "Upload Workday APR"}
          </Link>
        </Button>
      </div>

      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent
          side="left"
          className="flex w-full flex-col p-0 sm:max-w-md"
          data-testid="sheet-plan-controls"
          onEscapeKeyDown={() => setControlsOpen(false)}
          onPointerDownOutside={() => setControlsOpen(false)}
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

      <Sheet open={sharingOpen} onOpenChange={setSharingOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-md"
          data-testid="sheet-advisor-sharing"
          onEscapeKeyDown={() => setSharingOpen(false)}
          onPointerDownOutside={() => setSharingOpen(false)}
        >
          <SheetHeader className="border-b border-border/60 px-4 pb-2 pt-4">
            <SheetTitle>Share with an advisor</SheetTitle>
            <SheetDescription>
              Give a specific advisor read-only access to your plan. You
              control exactly who can see it and can revoke access any time.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <AdvisorSharingPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
