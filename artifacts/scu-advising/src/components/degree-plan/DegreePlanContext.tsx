import { createContext, useContext, ReactNode } from "react";
import { AcademicPlanDetail, StudentProfile, RequirementGroup, ScheduleAvailability, Course } from "@workspace/api-client-react";
import type { RequirementsMeta } from "./RequirementCustomization";

type DegreePlanContextType = {
  activePlan: AcademicPlanDetail | undefined;
  activePlanId: number | null;
  setActivePlanId: (id: number | null) => void;
  profile: StudentProfile | undefined;
  requirements: RequirementGroup[] | undefined;
  /**
   * Present when the requirements came from GET /plans/:id/requirements, i.e.
   * the plan can carry planning customizations. Absent for the plan-less fallback.
   */
  requirementsMeta?: RequirementsMeta | null;
  /** The requirements could not be loaded (and none are cached). Nothing else about the plan is affected. */
  requirementsError?: boolean;
  scheduleAvailability: ScheduleAvailability | undefined;
  catalog: Course[] | undefined;
};

const DegreePlanContext = createContext<DegreePlanContextType | null>(null);

export function useDegreePlanContext() {
  const ctx = useContext(DegreePlanContext);
  if (!ctx) throw new Error("Missing DegreePlanContext.Provider");
  return ctx;
}

export function DegreePlanProvider({ 
  children, 
  value 
}: { 
  children: ReactNode; 
  value: DegreePlanContextType; 
}) {
  return (
    <DegreePlanContext.Provider value={value}>
      {children}
    </DegreePlanContext.Provider>
  );
}
