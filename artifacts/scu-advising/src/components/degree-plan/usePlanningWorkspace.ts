import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPlanQueryKey,
  getGetPlanRequirementsQueryKey,
  useGetDegreeRequirements,
  useGetPlan,
  useGetPlanRequirements,
  useGetProfile,
  useGetScheduleAvailability,
  useListCourses,
  useListPlans,
} from "@workspace/api-client-react";
import type { DegreePlanContextType } from "./DegreePlanContext";

/** Session key for the Tentative Degree Plan the student was last working on (Tentative Degree Plan page). */
export const LAST_TENTATIVE_PLAN_KEY = "campusval.lastTentativePlanId";
/**
 * The plan the student last looked at, on ANY planning surface. The comparison
 * pages (Degree Checksheets, Academic Progress Reports) start from it, so
 * moving from a plan to a checksheet keeps the same plan without a copy of it.
 */
export const ACTIVE_PLAN_KEY = "campusval.activePlanId";

export type PlanningWorkspaceMode = "degree" | "tentative" | "compare";

function readStoredPlanId(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * The data every planning surface shares: which plan is active, that plan, and
 * the requirements built for it (Bulletin + department layer + the student's own
 * edits, composed on the server). ONE implementation, used by Degree Plan,
 * Tentative Degree Plan, Degree Checksheets and the Academic Progress Report page,
 * so the left Planning Requirements sidebar shows the same thing everywhere and
 * all of them read and refresh the SAME query keys.
 *
 * `compare` mode (the two comparison pages) never creates a plan: it starts
 * from the plan last used, then the Degree Plan, then the first plan there is.
 */
export function usePlanningWorkspace(mode: PlanningWorkspaceMode) {
  const queryClient = useQueryClient();
  const { data: plansList, isLoading: plansLoading } = useListPlans();
  const [activePlanId, setActivePlanId] = useState<number | null>(null);

  useEffect(() => {
    if (activePlanId || !plansList?.plans) return;
    const plans = plansList.plans;
    if (mode === "tentative") {
      // Prefer the plan the user was last working on (survives reloads); fall
      // back to the first tentative plan only if it no longer exists.
      const rememberedId = readStoredPlanId(LAST_TENTATIVE_PLAN_KEY);
      const remembered = rememberedId ? plans.find((p) => p.id === rememberedId && p.planType === "tentative") : undefined;
      const tentativePlan = remembered ?? plans.find((p) => p.planType === "tentative");
      if (tentativePlan) setActivePlanId(tentativePlan.id);
      // else: the starter state shows (activePlanId stays null)
    } else if (mode === "compare") {
      const rememberedId = readStoredPlanId(ACTIVE_PLAN_KEY);
      const remembered = rememberedId ? plans.find((p) => p.id === rememberedId) : undefined;
      const chosen = remembered ?? plans.find((p) => p.planType === "degree") ?? plans[0];
      if (chosen) setActivePlanId(chosen.id);
    } else {
      const defaultPlan = plans.find((p) => p.planType === "degree") || plans[0];
      if (defaultPlan) setActivePlanId(defaultPlan.id);
    }
  }, [plansList, activePlanId, mode]);

  // Whatever plan a planning surface ends up showing (picked, remembered or the default)
  // is the one the comparison pages start from next, so moving from a plan to a
  // checksheet or the APR keeps the plan the student was just looking at.
  useEffect(() => {
    if (activePlanId === null) return;
    try {
      sessionStorage.setItem(ACTIVE_PLAN_KEY, String(activePlanId));
    } catch {
      /* storage can be unavailable; the comparison pages then start from the Degree Plan */
    }
  }, [activePlanId]);

  const { data: activePlan, isLoading: planLoading } = useGetPlan(activePlanId!, {
    query: { enabled: !!activePlanId, queryKey: getGetPlanQueryKey(activePlanId!) },
  });

  const selectPlan = (planId: number | null) => {
    setActivePlanId(planId);
    try {
      if (mode === "tentative" || mode === "compare") {
        // Only remember an id that is actually a tentative plan: selecting the
        // Degree Plan must not poison the remembered-tentative-plan key. The comparison
        // pages remember it too, so the Tentative Degree Plan page opens the plan you compared.
        const isTentative = planId !== null && plansList?.plans.some((p) => p.id === planId && p.planType === "tentative");
        if (isTentative) sessionStorage.setItem(LAST_TENTATIVE_PLAN_KEY, String(planId));
        else if (mode === "tentative") sessionStorage.removeItem(LAST_TENTATIVE_PLAN_KEY);
      }
    } catch {
      /* storage can be unavailable; the selection still works for this visit */
    }
    if (planId !== null) {
      // A plan must render from its own detail query, so a previous plan's cached
      // detail never flashes after a duplicate/create/switch.
      queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(planId) });
    }
  };

  const { data: profile } = useGetProfile();
  // Plan-scoped scenario programs come from the "Programs for this plan" editor
  // (activePlan.programs); legacy metadata.scenarioMajors/Minors are still honored.
  const scenarioMajorQuery =
    [...(activePlan?.programs?.additionalMajors ?? []), ...(activePlan?.metadata?.scenarioMajors ?? [])].join(",") || undefined;
  const scenarioMinorQuery = [...(activePlan?.programs?.minors ?? []), ...(activePlan?.metadata?.scenarioMinors ?? [])].join(",") || undefined;
  const professionalGoalsQuery = activePlan?.programs?.professionalGoals?.length ? JSON.stringify(activePlan.programs.professionalGoals) : undefined;
  // Courses planned in THIS plan, so a major course carrying a Core designation marks the
  // Core requirement as planned. Plan-scoped by construction.
  const plannedCoursesQuery =
    Array.from(new Set((activePlan?.items ?? []).filter((i) => i.itemType === "course" && !!i.courseCode).map((i) => i.courseCode!.toUpperCase()))).join(",") ||
    undefined;
  const primaryMajorQuery = activePlan?.programs?.primaryMajor || undefined;

  // Requirements come from the ACTIVE PLAN: the server builds them from that plan's programs
  // and planned courses and composes the plan's customizations over them. The query key still
  // carries the plan inputs, so a change to any of them refetches.
  const { data: planReqsData, isError: planReqsError } = useGetPlanRequirements(activePlanId ?? 0, {
    query: {
      enabled: activePlanId !== null,
      queryKey: [
        ...getGetPlanRequirementsQueryKey(activePlanId ?? 0),
        primaryMajorQuery,
        scenarioMajorQuery,
        scenarioMinorQuery,
        professionalGoalsQuery,
        plannedCoursesQuery,
      ],
    },
  });
  const { data: legacyReqsData } = useGetDegreeRequirements(
    {
      ...(primaryMajorQuery ? { primaryMajor: primaryMajorQuery } : {}),
      ...(scenarioMajorQuery ? { scenarioMajors: scenarioMajorQuery } : {}),
      ...(scenarioMinorQuery ? { scenarioMinors: scenarioMinorQuery } : {}),
      ...(professionalGoalsQuery ? { professionalGoals: professionalGoalsQuery } : {}),
      ...(plannedCoursesQuery ? { plannedCourses: plannedCoursesQuery } : {}),
    },
    {
      query: {
        // Only when there is no plan at all to read requirements from.
        enabled: activePlanId === null && !plansLoading && (plansList?.plans?.length ?? 0) === 0,
        queryKey: ["/api/requirements", primaryMajorQuery, scenarioMajorQuery, scenarioMinorQuery, professionalGoalsQuery, plannedCoursesQuery],
      },
    },
  );
  const reqsData = activePlanId !== null ? planReqsData : legacyReqsData;
  const requirementsMeta = useMemo(
    () =>
      activePlanId !== null && planReqsData
        ? {
            sourceLabel: planReqsData.requirementsSource.label,
            policyDecided: planReqsData.requirementsSource.policyDecided,
            summary: planReqsData.customizations.summary,
            orphaned: planReqsData.customizations.orphaned,
          }
        : null,
    [activePlanId, planReqsData],
  );
  const { data: scheduleAvailability } = useGetScheduleAvailability();
  const { data: catalog } = useListCourses({});

  const contextValue: DegreePlanContextType = {
    activePlan,
    activePlanId,
    setActivePlanId: selectPlan,
    profile,
    requirements: reqsData?.groups,
    requirementsMeta,
    requirementsError: activePlanId !== null && planReqsError,
    scheduleAvailability,
    catalog,
  };

  return {
    plans: plansList?.plans ?? [],
    degreePlan: plansList?.plans.find((p) => p.planType === "degree"),
    plansLoading,
    planLoading,
    activePlan,
    activePlanId,
    selectPlan,
    contextValue,
  };
}
