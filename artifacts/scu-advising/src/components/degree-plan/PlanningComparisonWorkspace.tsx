import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Menu, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AprReferenceSheet } from "@/components/progress-report/AprReferenceSheet";
import { DegreePlanProvider } from "./DegreePlanContext";
import { Palette } from "./Palette";
import { usePlanningWorkspace } from "./usePlanningWorkspace";
import {
  COMPARISON_HEIGHT,
  PLANNING_LEFT_ONLY_COLUMNS,
  PLANNING_RIGHT_ONLY_COLUMNS,
  PLANNING_THREE_COLUMNS,
  REQUIREMENTS_DRAWER_WIDTH,
} from "@/lib/workspace-layout";
import { WorkdayAprPanel } from "@/components/progress-report/WorkdayAprPanel";
import { planContextLabel } from "@workspace/api-client-react";

/**
 * The comparison workspace used by Degree Checksheets and the Academic Progress
 * Report page:
 *
 *   Degree Checksheets   | Planning Requirements | Degree Checksheet | Workday APR (compact) |
 *   Academic Progress    | Planning Requirements | Full APR          |
 *
 * It composes the SAME Planning Requirements sidebar (Palette) and the SAME
 * compact APR sidebar (WorkdayAprPanel) that Degree Plan uses, against the
 * plan the student picks; nothing is copied. It never creates a plan and never
 * changes the main content. On wide screens each region scrolls on its own, so
 * keeping your place in a checksheet is independent of the APR or the
 * requirements list.
 *
 * The main content renders at once: it does not depend on the plan, so it never
 * waits for plan data. Only the side panels show a placeholder while it loads.
 *
 * Below `xl` there is no room for three regions: the main content takes the
 * width, the page scrolls as a normal page (no scroll region inside a phone
 * screen), and the requirements (and APR) open in drawers, as on Degree Plan.
 */

const COLLAPSE_KEY = "campusval.compareRails";

type Rails = { left: boolean; right: boolean };

function readRails(): Rails {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "null") as Partial<Rails> | null;
    return { left: parsed?.left !== false, right: parsed?.right !== false };
  } catch {
    return { left: true, right: true };
  }
}

export function PlanningComparisonWorkspace({
  main,
  mainLabel,
  showCompactApr,
}: {
  /** The center content: the Degree Checksheet workspace, or the full APR. */
  main: ReactNode;
  mainLabel: string;
  /** The compact APR sidebar on the right. False on the full APR page, whose center already IS the APR. */
  showCompactApr: boolean;
}) {
  const { plans, plansLoading, planLoading, activePlan, activePlanId, selectPlan, contextValue } = usePlanningWorkspace("compare");
  const [rails, setRails] = useState<Rails>(readRails);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(rails));
    } catch {
      /* a remembered layout is a convenience only */
    }
  }, [rails]);

  const left = rails.left;
  const right = showCompactApr && rails.right;
  const columns = left && right ? PLANNING_THREE_COLUMNS : left ? PLANNING_LEFT_ONLY_COLUMNS : right ? PLANNING_RIGHT_ONLY_COLUMNS : "";
  const planPending = plansLoading || (!!activePlanId && planLoading);
  const noPlan = !plansLoading && plans.length === 0;

  const requirementsPanel = planPending ? (
    <div className="h-full space-y-2 rounded-md border bg-card p-3" role="status" aria-label="Loading your Planning Requirements">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  ) : noPlan ? (
    <p className="m-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid="compare-no-plan">
      You have no plan to compare against yet.{" "}
      <Link href="/degree-plan" className="underline">
        Open your Degree Plan
      </Link>{" "}
      to start one; nothing is created for you here.
    </p>
  ) : (
    <Palette />
  );

  return (
    <DegreePlanProvider value={contextValue}>
      {/* The bar above the regions: which plan, and which regions are showing. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2" data-testid="compare-toolbar">
        <div className="flex min-w-0 items-center gap-2" data-testid="compare-plan-selector">
          <Label htmlFor="compare-plan" className="shrink-0 text-xs text-muted-foreground">
            Compare against
          </Label>
          <Select value={activePlanId ? String(activePlanId) : ""} onValueChange={(v) => selectPlan(Number(v))} disabled={plans.length === 0}>
            <SelectTrigger id="compare-plan" className="h-8 min-w-0 max-w-[18rem] text-xs" data-testid="compare-plan-trigger">
              <SelectValue placeholder={plansLoading ? "Loading plans…" : "No plan yet"} />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                  {planContextLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="hidden items-center gap-1.5 xl:flex" role="group" aria-label="Show or hide side panels">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              aria-pressed={left}
              onClick={() => setRails((r) => ({ ...r, left: !r.left }))}
              data-testid="toggle-left-rail"
            >
              {left ? <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />}
              Planning Requirements
            </Button>
            {showCompactApr && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                aria-pressed={right}
                onClick={() => setRails((r) => ({ ...r, right: !r.right }))}
                data-testid="toggle-right-rail"
              >
                Workday APR
                {right ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            )}
          </div>

          {/* Below xl: the same two panels open in drawers. */}
          {/* Wraps on a narrow phone rather than pushing the page sideways. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 xl:hidden">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" aria-haspopup="dialog" data-testid="button-open-requirements">
                  <Menu className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Planning Requirements
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className={`${REQUIREMENTS_DRAWER_WIDTH} p-0`} data-testid="requirements-drawer">
                <SheetTitle className="sr-only">Planning Requirements</SheetTitle>
                <SheetDescription className="sr-only">Your planning requirements for the selected plan, to compare with the page you are on.</SheetDescription>
                {requirementsPanel}
              </SheetContent>
            </Sheet>
            {showCompactApr && (
              <AprReferenceSheet>
                <WorkdayAprPanel />
              </AprReferenceSheet>
            )}
          </div>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 ${COMPARISON_HEIGHT} ${columns}`}
        data-testid="compare-layout"
        data-rails={`${left ? "L" : ""}${right ? "R" : ""}`}
        data-plan={activePlan ? activePlan.id : undefined}
      >
        {left && (
          <section aria-label="Planning Requirements" className="hidden h-full min-h-0 min-w-0 overflow-hidden xl:block" data-testid="compare-left">
            {requirementsPanel}
          </section>
        )}
        <section
          aria-label={mainLabel}
          className="min-h-0 min-w-0 rounded-md xl:h-full xl:overflow-y-auto xl:overscroll-contain"
          data-testid="compare-main"
          tabIndex={-1}
        >
          {main}
        </section>
        {right && (
          <section aria-label="Workday APR" className="hidden h-full min-h-0 min-w-0 overflow-hidden xl:block" data-testid="compare-right">
            <WorkdayAprPanel />
          </section>
        )}
      </div>
    </DegreePlanProvider>
  );
}
