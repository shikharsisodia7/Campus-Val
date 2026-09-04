import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";

/**
 * The signal AppShell uses to decide between the reduced core-nav "tester"
 * experience and the full nav an admin needs (Part 15/16 of the controlled-
 * rollout spec). Defaults to false (reduced nav) while loading or on any
 * error, so a slow/failed request never accidentally over-exposes features.
 */
export function useIsAdmin(): boolean {
  const { data } = useQuery({
    queryKey: ["/api/me/role"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/me/role"));
      if (!res.ok) return { isAdmin: false };
      return res.json() as Promise<{ isAdmin: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data?.isAdmin ?? false;
}
