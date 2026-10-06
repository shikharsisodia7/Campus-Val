/**
 * The source of the requirements sidebar in use, and the only place it is named.
 *
 * To act on the professor's decision, once there is one:
 *   1. write a provider for the chosen source (implement
 *      RequirementsBenchmarkProvider; see current-bulletin.ts) and give its
 *      groups stable keys via the shared rules in stable-keys.ts;
 *   2. add it to PROVIDERS;
 *   3. select it (REQUIREMENTS_BENCHMARK_PROVIDER, or a rule in
 *      selectRequirementsProvider for per-program / per-year selection) and
 *      set POLICY_DECIDED;
 *   4. update the snapshots in routes/requirements.golden.test.ts, which will
 *      fail, and say in that commit what changed for students. Student
 *      customizations whose source requirement changed are then flagged for
 *      review by the overlay; nothing is overwritten.
 * The sidebar, the overlay, the edit API and the audit need no change.
 *
 * Selection is server configuration only. A request cannot choose the source,
 * and a setting naming a source that has not been built falls back to the
 * current source with a warning (see config.ts).
 */
import { logger } from "../logger";
import { currentBulletinProvider, type RequirementsResponse } from "./current-bulletin";
import { DEFAULT_REQUIREMENTS_SOURCE, resolveRequirementsBenchmarkConfig, type RequirementsBenchmarkConfig } from "./config";
import { normalizeRequirements, type NormalizedGroup } from "./normalize";
import {
  REQUIREMENT_SOURCE_LABEL,
  REQUIREMENT_SOURCE_TYPES,
  type RequirementSourceType,
  type RequirementsBenchmarkProvider,
  type RequirementsRequest,
  type RequirementsResult,
  type RequirementsSourceStatus,
} from "./model";

export * from "./model";
export * from "./stable-keys";
export * from "./normalize";
export * from "./overlay";
export * from "./category";
export * from "./editions";
export type { RequirementsResponse } from "./current-bulletin";
export { resolveRequirementsBenchmarkConfig, type RequirementsBenchmarkConfig } from "./config";

/** The behaviour CampusVal has had since before this existed. */
export const ACTIVE_REQUIREMENTS_SOURCE: RequirementSourceType = DEFAULT_REQUIREMENTS_SOURCE;

/** The professor has not chosen the benchmark. */
export const POLICY_DECIDED = false;

const PROVIDERS: Partial<Record<RequirementSourceType, RequirementsBenchmarkProvider<RequirementsResponse>>> = {
  current_bulletin: currentBulletinProvider,
};

const registered = (): RequirementSourceType[] => REQUIREMENT_SOURCE_TYPES.filter((type) => PROVIDERS[type]);

let resolved: RequirementsBenchmarkConfig | null = null;
export function requirementsBenchmarkConfig(): RequirementsBenchmarkConfig {
  if (!resolved) {
    resolved = resolveRequirementsBenchmarkConfig(process.env, registered());
    if (resolved.warning) logger.warn({ event: "requirements_benchmark_config_invalid" }, resolved.warning);
    else logger.info({ event: "requirements_provider_selected", provider: resolved.provider, from: resolved.from }, "requirements source selected");
  }
  return resolved;
}
/** For tests. */
export function resetRequirementsBenchmarkConfig(): void {
  resolved = null;
}

export function requirementsProvider(type?: RequirementSourceType): RequirementsBenchmarkProvider<RequirementsResponse> {
  const wanted = type ?? requirementsBenchmarkConfig().provider;
  const provider = PROVIDERS[wanted];
  if (!provider) {
    throw new Error(`No requirements provider for "${wanted}": that source has not been chosen, so it has not been built.`);
  }
  return provider;
}

/**
 * The seam for choosing a source by program, school, curriculum year or plan.
 * No such rule exists: every request gets the configured source. A rule would
 * be added here, reading only these fields.
 */
export interface ProviderSelectionContext {
  programKey?: string | null;
  school?: string | null;
  curriculumYear?: string | null;
  planId?: number | null;
}
export function selectRequirementsProvider(_context?: ProviderSelectionContext): RequirementsBenchmarkProvider<RequirementsResponse> {
  return requirementsProvider();
}

export function buildRequirements(request: RequirementsRequest): RequirementsResult<RequirementsResponse> {
  return selectRequirementsProvider({ planId: request.context?.planId, curriculumYear: request.context?.curriculumYear }).build(request);
}

/** The normalized tree for a request: groups and items with stable keys and provenance. */
export function buildNormalizedRequirements(request: RequirementsRequest): {
  response: RequirementsResponse;
  tree: NormalizedGroup<RequirementsResponse["groups"][number]>[];
  provider: RequirementSourceType;
  /** The Bulletin edition id the tree was built from (null for a non-Bulletin source). */
  edition: string | null;
} {
  const provider = selectRequirementsProvider({ planId: request.context?.planId, curriculumYear: request.context?.curriculumYear });
  const { response, provenance, edition } = provider.build(request);
  return { response, tree: normalizeRequirements(response, provenance, provider.type), provider: provider.type, edition };
}

const DECISION_NEEDED =
  "Which source the requirements sidebar is benchmarked against: the current Bulletin, the Bulletin of the student matriculation year, the department checksheet for the student curriculum year, the Academic Progress Report, or a controlled combination.";

export function requirementsSourceStatus(): RequirementsSourceStatus & { configuredFrom: "default" | "environment"; configWarning: string | null } {
  const config = requirementsBenchmarkConfig();
  const implemented = registered();
  return {
    active: config.provider,
    activeLabel: REQUIREMENT_SOURCE_LABEL[config.provider],
    policyDecided: POLICY_DECIDED,
    implemented,
    notImplemented: REQUIREMENT_SOURCE_TYPES.filter((type) => !PROVIDERS[type]),
    configuredFrom: config.from,
    configWarning: config.warning,
    decisionNeeded: DECISION_NEEDED,
  };
}
