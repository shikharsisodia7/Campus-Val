import { useQueryClient } from "@tanstack/react-query";
import {
  getListProgressReportMappingsQueryKey,
  useDeleteProgressReportMapping,
  useListProgressReportMappings,
  useUpsertProgressReportMapping,
  type ProgressReportMapping,
} from "@workspace/api-client-react";

/**
 * The student's own mappings of unrecognized APR items to catalog courses.
 * Fails soft: while loading, or if the request fails, there are simply no
 * mappings — the APR itself never depends on them.
 */
export function useProgressReportMappings(): ProgressReportMapping[] {
  const { data } = useListProgressReportMappings({
    query: { queryKey: getListProgressReportMappingsQueryKey() },
  });
  return data?.mappings ?? [];
}

/** Save / change / remove one mapping, keeping the list in sync. */
export function useEditProgressReportMappings() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListProgressReportMappingsQueryKey() });
  const upsert = useUpsertProgressReportMapping({ mutation: { onSuccess: refresh } });
  const remove = useDeleteProgressReportMapping({ mutation: { onSuccess: refresh } });
  return {
    save: (rawCode: string, courseCode: string) => upsert.mutateAsync({ rawCode, data: { courseCode } }),
    remove: (rawCode: string) => remove.mutateAsync({ rawCode }),
    saving: upsert.isPending,
    removing: remove.isPending,
    error: upsert.error ?? remove.error ?? null,
    reset: () => {
      upsert.reset();
      remove.reset();
    },
  };
}
