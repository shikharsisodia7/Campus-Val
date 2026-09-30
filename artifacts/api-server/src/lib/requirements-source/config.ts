/**
 * Which requirements source is active is CONFIGURATION, not code in a UI
 * component: the eventual benchmark decision should be a setting plus a
 * provider, never a change to the sidebar.
 *
 * Only a provider that exists can be selected. Anything else (a typo, a source
 * that has not been built) falls back to the current source and reports a
 * warning; it never fails the request and never silently uses a different
 * benchmark. A student cannot reach this: it reads the server environment,
 * not a request.
 *
 * Setting: REQUIREMENTS_BENCHMARK_PROVIDER (unset = the current source).
 */
import { REQUIREMENT_SOURCE_TYPES, type RequirementSourceType } from "./model";

export const DEFAULT_REQUIREMENTS_SOURCE: RequirementSourceType = "current_bulletin";

export interface RequirementsBenchmarkConfig {
  provider: RequirementSourceType;
  /** "default" when nothing was set or the setting was unusable. */
  from: "default" | "environment";
  /** Set when the setting was present but unusable. Never contains the value. */
  warning: string | null;
}

export function resolveRequirementsBenchmarkConfig(
  env: Record<string, string | undefined>,
  registered: readonly RequirementSourceType[],
): RequirementsBenchmarkConfig {
  const raw = env.REQUIREMENTS_BENCHMARK_PROVIDER?.trim();
  if (!raw) return { provider: DEFAULT_REQUIREMENTS_SOURCE, from: "default", warning: null };

  const known = (REQUIREMENT_SOURCE_TYPES as readonly string[]).includes(raw);
  if (!known) {
    return {
      provider: DEFAULT_REQUIREMENTS_SOURCE,
      from: "default",
      warning: "REQUIREMENTS_BENCHMARK_PROVIDER is not a known requirements source; using the current source.",
    };
  }
  if (!registered.includes(raw as RequirementSourceType)) {
    return {
      provider: DEFAULT_REQUIREMENTS_SOURCE,
      from: "default",
      warning: `REQUIREMENTS_BENCHMARK_PROVIDER names "${raw}", which has not been built; using the current source.`,
    };
  }
  return { provider: raw as RequirementSourceType, from: "environment", warning: null };
}
