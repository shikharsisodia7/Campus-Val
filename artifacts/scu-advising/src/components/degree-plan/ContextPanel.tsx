import { useDegreePlanContext } from "./DegreePlanContext";
import { WorkdayAprPanel } from "../progress-report/WorkdayAprPanel";
import { useListGraduationMajors } from "@workspace/api-client-react";

/**
 * The right-hand column of Degree Plan / Tentative Degree Plan — the shared
 * WorkdayAprPanel, gated on there being an active plan to show it next to.
 * See WorkdayAprPanel for what this column does and doesn't show.
 *
 * Plan switching and majors/minors/Professional-Preparation editing live in
 * DegreePlanToolbar on the planning side.
 */
export function ContextPanel() {
  const { activePlan, profile } = useDegreePlanContext();
  const { data: majorsList } = useListGraduationMajors();
  if (!activePlan) return null;
  // Reconciliation only makes sense against the real Degree Plan — a
  // Tentative Degree Plan's whole purpose is exploring a possibly-different
  // major, and that intentional divergence must never be flagged as a
  // discrepancy against the Workday APR.
  const primaryMajorCode =
    activePlan.planType === "degree"
      ? activePlan.programs?.primaryMajor?.trim() || profile?.major
      : undefined;
  const planningMajorTitle = primaryMajorCode
    ? (majorsList?.majors.find(
        (m) => m.code.toLowerCase() === primaryMajorCode.toLowerCase(),
      )?.title ?? primaryMajorCode)
    : undefined;
  return <WorkdayAprPanel planningMajorTitle={planningMajorTitle} />;
}
