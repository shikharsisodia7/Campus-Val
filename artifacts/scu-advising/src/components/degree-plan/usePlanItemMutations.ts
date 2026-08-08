import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  AcademicPlanDetail,
  BulkImportPlanItemsResult,
  PlanItem,
  getGetPlanQueryKey,
  useDeletePlanItem,
  useUpdatePlanItem,
} from "@workspace/api-client-react";

const plansPredicate = (q: { queryKey: readonly unknown[] }) =>
  String(q.queryKey[0]).startsWith("/api/plans");

/**
 * Mirrors the server's move semantics client-side so drags feel instant:
 * insert the item into the target term at the requested position (or the end),
 * then contiguously reindex both the target and source terms.
 */
function applyOptimisticMove(
  plan: AcademicPlanDetail,
  itemId: number,
  update: { academicYear?: number; term?: string; position?: number },
): AcademicPlanDetail {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return plan;

  const targetYear = update.academicYear ?? item.academicYear;
  const targetTerm = update.term ?? item.term;
  const termChanged =
    targetYear !== item.academicYear || targetTerm !== item.term;

  const sorted = [...plan.items].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  const target = sorted.filter(
    (i) =>
      i.id !== item.id &&
      i.academicYear === targetYear &&
      i.term === targetTerm,
  );
  const insertAt = Math.min(
    Math.max(update.position ?? target.length, 0),
    target.length,
  );
  const movedItem: PlanItem = { ...item, academicYear: targetYear, term: targetTerm as PlanItem["term"] };
  target.splice(insertAt, 0, movedItem);

  const newPositions = new Map<number, PlanItem>();
  target.forEach((t, idx) => newPositions.set(t.id, { ...t, position: idx }));

  if (termChanged) {
    const source = sorted.filter(
      (i) =>
        i.id !== item.id &&
        i.academicYear === item.academicYear &&
        i.term === item.term,
    );
    source.forEach((s, idx) => newPositions.set(s.id, { ...s, position: idx }));
  }

  return {
    ...plan,
    items: plan.items.map((i) => newPositions.get(i.id) ?? i),
  };
}

function applyOptimisticDelete(
  plan: AcademicPlanDetail,
  itemId: number,
): AcademicPlanDetail {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return plan;

  const remaining = plan.items.filter((i) => i.id !== itemId);
  const term = remaining
    .filter(
      (i) => i.academicYear === item.academicYear && i.term === item.term,
    )
    .sort((a, b) => a.position - b.position || a.id - b.id);
  const newPositions = new Map<number, PlanItem>();
  term.forEach((t, idx) => newPositions.set(t.id, { ...t, position: idx }));

  return {
    ...plan,
    items: remaining.map((i) => newPositions.get(i.id) ?? i),
  };
}

type MoveContext = { previous?: AcademicPlanDetail };

/** Optimistic move/reorder mutation with rollback on error. */
export function useOptimisticUpdatePlanItem() {
  const queryClient = useQueryClient();
  return useUpdatePlanItem<unknown, MoveContext>({
    mutation: {
      onMutate: async ({ id, itemId, data }) => {
        const queryKey = getGetPlanQueryKey(id);
        await queryClient.cancelQueries({ queryKey });
        const previous =
          queryClient.getQueryData<AcademicPlanDetail>(queryKey);
        if (previous) {
          queryClient.setQueryData<AcademicPlanDetail>(
            queryKey,
            applyOptimisticMove(previous, itemId, data),
          );
        }
        return { previous };
      },
      onError: (_err, { id }, context) => {
        if (context?.previous) {
          queryClient.setQueryData(getGetPlanQueryKey(id), context.previous);
        }
      },
      onSettled: () =>
        queryClient.invalidateQueries({ predicate: plansPredicate }),
    },
  });
}

/** Bulk-import report-completed courses into the Completed area. */
export function useBulkImportReportCourses() {
  const queryClient = useQueryClient();
  return useMutation<
    BulkImportPlanItemsResult,
    Error,
    { planId: number; courseCodes: string[] }
  >({
    mutationFn: async ({ planId, courseCodes }) => {
      const res = await fetch(`/api/plans/${planId}/items/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCodes }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to import courses.");
      }
      return res.json() as Promise<BulkImportPlanItemsResult>;
    },
    onSettled: () =>
      queryClient.invalidateQueries({ predicate: plansPredicate }),
  });
}

/** Optimistic delete mutation with rollback on error. */
export function useOptimisticDeletePlanItem() {
  const queryClient = useQueryClient();
  return useDeletePlanItem<unknown, MoveContext>({
    mutation: {
      onMutate: async ({ id, itemId }) => {
        const queryKey = getGetPlanQueryKey(id);
        await queryClient.cancelQueries({ queryKey });
        const previous =
          queryClient.getQueryData<AcademicPlanDetail>(queryKey);
        if (previous) {
          queryClient.setQueryData<AcademicPlanDetail>(
            queryKey,
            applyOptimisticDelete(previous, itemId),
          );
        }
        return { previous };
      },
      onError: (_err, { id }, context) => {
        if (context?.previous) {
          queryClient.setQueryData(getGetPlanQueryKey(id), context.previous);
        }
      },
      onSettled: () =>
        queryClient.invalidateQueries({ predicate: plansPredicate }),
    },
  });
}
