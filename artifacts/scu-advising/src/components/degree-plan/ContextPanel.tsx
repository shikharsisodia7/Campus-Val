import { useDegreePlanContext } from "./DegreePlanContext";
import { WorkdayAprPanel } from "../progress-report/WorkdayAprPanel";

/**
 * The right-hand column of Degree Plan / Tentative Degree Plan — the shared
 * WorkdayAprPanel, gated on there being an active plan to show it next to.
 * See WorkdayAprPanel for what this column does and doesn't show.
 *
 * Plan switching and majors/minors/Professional-Preparation editing live in
 * DegreePlanToolbar on the planning side.
 */
export function ContextPanel() {
  const { activePlan } = useDegreePlanContext();
  if (!activePlan) return null;
  return <WorkdayAprPanel />;
}
