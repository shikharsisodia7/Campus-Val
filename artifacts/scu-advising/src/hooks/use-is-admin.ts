import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";

const ADMIN_ROLE_QUERY_KEY = ["/api/me/role"];

type AdminRole = {
  isAdmin: boolean;
  isDepartmentAdmin?: boolean;
  /** Server-derived capability for the private APR assessment R&D route. */
  canUseDegreeCompletionRND?: boolean;
};

function useAdminRoleQuery() {
  return useQuery({
    queryKey: ADMIN_ROLE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(getApiUrl("/me/role"));
      if (!res.ok) return { isAdmin: false, isDepartmentAdmin: false, canUseDegreeCompletionRND: false };
      return res.json() as Promise<AdminRole>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The signal AppShell and pilot route-gating use to decide between the
 * reduced pilot nav and the full nav/routes an admin needs (see
 * artifacts/scu-advising/src/lib/pilot-features.ts). Defaults to false
 * (reduced nav) while loading or on any error, so a slow/failed request
 * never accidentally over-exposes features.
 */
export function useIsAdmin(): boolean {
  const { data } = useAdminRoleQuery();
  return data?.isAdmin ?? false;
}

/**
 * Whether the signed-in user maintains at least one program (or is a super
 * admin). Only decides whether the UI links to Program Requirements Admin; the
 * server checks scope on every admin request.
 */
export function useIsDepartmentAdmin(): boolean {
  const { data } = useAdminRoleQuery();
  return data?.isDepartmentAdmin ?? false;
}

/**
 * Same underlying query (React Query dedupes by queryKey), but also exposes
 * whether the admin check is still in flight. PilotGate needs this so it
 * doesn't redirect a real admin away from a PILOT_HIDDEN route just because
 * the /me/role fetch hasn't resolved yet.
 */
export function useAdminStatus(): { isAdmin: boolean; isLoading: boolean; canUseDegreeCompletionRND: boolean } {
  const { data, isLoading } = useAdminRoleQuery();
  return {
    isAdmin: data?.isAdmin ?? false,
    isLoading,
    // Fail closed if this newer capability field is absent from an older API.
    canUseDegreeCompletionRND: data?.canUseDegreeCompletionRND ?? false,
  };
}
