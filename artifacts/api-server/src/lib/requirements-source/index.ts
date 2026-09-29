/**
 * The source of the requirements sidebar in use, and the only place it is named.
 *
 * To act on the professor's decision, once there is one:
 *   1. write a provider for the chosen source (implement
 *      RequirementsBenchmarkProvider; see current-bulletin.ts);
 *   2. add it to PROVIDERS;
 *   3. set ACTIVE_REQUIREMENTS_SOURCE and POLICY_DECIDED;
 *   4. update the snapshots in routes/requirements.golden.test.ts, which will
 *      fail, and say in that commit what changed for students.
 * Nothing else in CampusVal needs to know where requirements come from.
 *
 * There is no setting, flag or request parameter that changes the source. It
 * cannot be switched by configuration or by a student.
 */
import { currentBulletinProvider, type RequirementsResponse } from "./current-bulletin";
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
export type { RequirementsResponse } from "./current-bulletin";

/** The behaviour CampusVal has had since before this existed. */
export const ACTIVE_REQUIREMENTS_SOURCE: RequirementSourceType = "current_bulletin";

/** The professor has not chosen the benchmark. */
export const POLICY_DECIDED = false;

const PROVIDERS: Partial<Record<RequirementSourceType, RequirementsBenchmarkProvider<RequirementsResponse>>> = {
  current_bulletin: currentBulletinProvider,
};

export function requirementsProvider(type: RequirementSourceType = ACTIVE_REQUIREMENTS_SOURCE): RequirementsBenchmarkProvider<RequirementsResponse> {
  const provider = PROVIDERS[type];
  if (!provider) {
    throw new Error(`No requirements provider for "${type}": that source has not been chosen, so it has not been built.`);
  }
  return provider;
}

export function buildRequirements(request: RequirementsRequest): RequirementsResult<RequirementsResponse> {
  return requirementsProvider().build(request);
}

export function requirementsSourceStatus(): RequirementsSourceStatus {
  const implemented = REQUIREMENT_SOURCE_TYPES.filter((type) => PROVIDERS[type]);
  return {
    active: ACTIVE_REQUIREMENTS_SOURCE,
    activeLabel: REQUIREMENT_SOURCE_LABEL[ACTIVE_REQUIREMENTS_SOURCE],
    policyDecided: POLICY_DECIDED,
    implemented,
    notImplemented: REQUIREMENT_SOURCE_TYPES.filter((type) => !PROVIDERS[type]),
    decisionNeeded:
      "Which source the requirements sidebar is benchmarked against: the current Bulletin, the Bulletin of the student's matriculation year, the department checksheet for the student's curriculum year, the Academic Progress Report, or a controlled combination.",
  };
}
