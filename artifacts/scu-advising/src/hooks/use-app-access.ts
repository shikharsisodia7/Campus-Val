import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";

export type AppAccess = {
  allowed: boolean;
  accessMode: "pilot" | "institution" | null;
  /** The server's wording for a refused account; null when allowed. */
  message: string | null;
};

export const APP_ACCESS_QUERY_KEY = ["/api/me/access"];

/**
 * Whether the signed-in account may use CampusVal under the server's current
 * access mode (pilot = invited participants only). The server enforces this on
 * every data route; this only lets the app explain a refusal instead of
 * failing page by page. A failed request is an error, never "allowed".
 */
export function useAppAccess() {
  return useQuery({
    queryKey: APP_ACCESS_QUERY_KEY,
    queryFn: async (): Promise<AppAccess> => {
      const res = await fetch(getApiUrl("/me/access"), { cache: "no-store" });
      if (!res.ok) throw new Error(`Access check failed (${res.status})`);
      return (await res.json()) as AppAccess;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    retry: 1,
  });
}
