import { logger } from "../logger";
import { ManualPasteAvailabilityProvider } from "./providers/manualPaste";
import { FixtureAvailabilityProvider } from "./providers/fixture";
import { WorkdayAvailabilityProvider } from "./providers/workday";
import { AvailabilityService } from "./service";

export * from "./types";
export * from "./freshness";
export { AvailabilityService, sectionKey } from "./service";
export type { TermAvailability, LiveFeedState, TermDiagnostics, RefreshOutcome } from "./service";

type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined): boolean => v?.trim().toLowerCase() === "true";
const intOr = (v: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/**
 * Build the availability service from environment configuration. NO URLs,
 * credentials or feature switches are hard-coded; see .env.example and
 * docs/SECTION_AVAILABILITY.md for every variable.
 *
 *  - Live Workday provider: only when WORKDAY_AVAILABILITY_ENABLED=true AND a
 *    URL + credential are present (startup validation in lib/config.ts
 *    refuses to boot an enabled-but-incomplete configuration).
 *  - Fixture provider: only when AVAILABILITY_FIXTURE_ENABLED=true AND
 *    NODE_ENV is not "production". In production the flag is ignored.
 */
export function buildAvailabilityService(env: Env = process.env): AvailabilityService {
  const enabled = truthy(env["WORKDAY_AVAILABILITY_ENABLED"]);
  const url = env["WORKDAY_AVAILABILITY_URL"]?.trim();
  const token = env["WORKDAY_AVAILABILITY_AUTH_TOKEN"]?.trim();

  const live =
    enabled && url && token
      ? new WorkdayAvailabilityProvider({
          url,
          authToken: token,
          authHeader: env["WORKDAY_AVAILABILITY_AUTH_HEADER"]?.trim() || undefined,
          authScheme: env["WORKDAY_AVAILABILITY_AUTH_SCHEME"] ?? undefined,
          timeoutMs: intOr(env["WORKDAY_AVAILABILITY_TIMEOUT_MS"], 5000, 500, 30_000),
        })
      : null;

  const isProduction = env["NODE_ENV"] === "production";
  const wantsFixture = truthy(env["AVAILABILITY_FIXTURE_ENABLED"]);
  if (wantsFixture && isProduction) {
    logger.warn(
      "AVAILABILITY_FIXTURE_ENABLED is set but ignored in production: sample seat data is never served to real students.",
    );
  }
  const fixture = wantsFixture && !isProduction ? new FixtureAvailabilityProvider() : null;

  return new AvailabilityService({
    live,
    fixture,
    manual: new ManualPasteAvailabilityProvider(),
    cacheTtlMs: intOr(env["WORKDAY_AVAILABILITY_CACHE_TTL_SECONDS"], 60, 5, 3600) * 1000,
    // Shortest gap a student's "Refresh availability" may force (bounded upstream traffic).
    minRefreshIntervalMs: intOr(env["WORKDAY_AVAILABILITY_MIN_REFRESH_SECONDS"], 30, 5, 3600) * 1000,
    livePolicy: {
      liveWithinMs: intOr(env["WORKDAY_AVAILABILITY_LIVE_WITHIN_SECONDS"], 120, 5, 3600) * 1000,
      staleAfterMs: intOr(env["WORKDAY_AVAILABILITY_STALE_AFTER_SECONDS"], 900, 30, 86_400) * 1000,
    },
    onProviderFailure: ({ provider, reason }) =>
      // Reason only — never the URL, credential or upstream body.
      logger.warn({ provider, reason }, "Availability provider failed; serving cached/unknown availability"),
  });
}

let singleton: AvailabilityService | null = null;

export function getAvailabilityService(): AvailabilityService {
  singleton ??= buildAvailabilityService();
  return singleton;
}

/** Test seam: swap in a service (or clear it so the next call rebuilds from env). */
export function setAvailabilityServiceForTests(service: AvailabilityService | null): void {
  singleton = service;
}
