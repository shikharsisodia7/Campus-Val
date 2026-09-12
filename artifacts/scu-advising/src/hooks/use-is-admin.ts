import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";

const ADMIN_ROLE_QUERY_KEY = ["/api/me/role"];

function useAdminRoleQuery() {
  return useQuery({
    queryKey: ADMIN_ROLE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(getApiUrl("/me/role"));
      if (!res.ok) return { isAdmin: false };
      return res.json() as Promise<{ isAdmin: boolean }>;
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
 * Same underlying query (React Query dedupes by queryKey), but also exposes
 * whether the admin check is still in flight. PilotGate needs this so it
 * doesn't redirect a real admin away from a PILOT_HIDDEN route just because
 * the /me/role fetch hasn't resolved yet.
 */
export function useAdminStatus(): { isAdmin: boolean; isLoading: boolean } {
  const { data, isLoading } = useAdminRoleQuery();
  return { isAdmin: data?.isAdmin ?? false, isLoading };
}
