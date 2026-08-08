import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  AcademicPlanDetail, 
  PlanItem, 
  StudentProfile, 
  RequirementGroup, 
  ScheduleAvailability,
  Course
} from "@workspace/api-client-react";

type DegreePlanContextType = {
  activePlan: AcademicPlanDetail | undefined;
  activePlanId: number | null;
  setActivePlanId: (id: number | null) => void;
  profile: StudentProfile | undefined;
  requirements: RequirementGroup[] | undefined;
  scheduleAvailability: ScheduleAvailability | undefined;
  catalog: Course[] | undefined;
  aprCompletedCodes?: Set<string>;
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
