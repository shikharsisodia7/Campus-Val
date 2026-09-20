import {
  useGetProgressReport,
  getGetProgressReportQueryKey,
  type GetProgressReportParams,
} from "@workspace/api-client-react";

/**
 * The parameters every PLANNING surface (Degree Plan, Tentative Degree Plan,
 * Quarter Plan) uses to read the student's own APR. `view: "planning"` asks the
 * server for the minimized projection — no grades, no raw source lines, no
 * student ID — so a planning view cannot render private detail it was never
 * sent. Only the dedicated APR page asks for the full view.
 */
export const PLANNING_APR_PARAMS: GetProgressReportParams = { view: "planning" };

export function usePlanningProgressReport() {
  return useGetProgressReport(PLANNING_APR_PARAMS, {
    query: { queryKey: getGetProgressReportQueryKey(PLANNING_APR_PARAMS) },
  });
}
