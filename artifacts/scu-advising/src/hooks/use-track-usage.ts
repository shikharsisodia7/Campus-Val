import { useEffect, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";

/**
 * Fires one privacy-preserving usage event (docs/USAGE_ANALYTICS.md) the
 * first time a major feature is visited in this component's lifetime.
 * Silent no-op on failure (signed out, network hiccup, admin-analytics being
 * down) — analytics must never affect the product experience. `feature` must
 * be one of the names the server allowlists (routes/usage.ts USAGE_FEATURES);
 * anything else is rejected server-side rather than silently accepted.
 */
export function useTrackUsage(feature: string, enabled = true): void {
  const fired = useRef(false);
  useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    customFetch("/api/usage-events", {
      method: "POST",
      body: JSON.stringify({ feature }),
      headers: { "content-type": "application/json" },
    }).catch(() => {
      // Analytics is best-effort; never surface this to the user.
    });
  }, [feature, enabled]);
}
