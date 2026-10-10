/**
 * The requirements sidebar as CampusVal has always built it: from the data
 * taken from the Undergraduate Bulletin (data/degree-requirements.ts and
 * data/graduation-paths.ts).
 *
 * The response is the existing builder's, passed through untouched. This file
 * adds one thing beside it: a record of where each group came from, read from
 * the fields the groups already carry.
 */
import { buildRequirementsResponse } from "../../routes/requirements";
import type { RequirementProvenance, RequirementsBenchmarkProvider, RequirementsRequest } from "./model";
import { resolveBulletinEdition } from "./editions";
import { programNameOf } from "./stable-keys";

export type RequirementsResponse = ReturnType<typeof buildRequirementsResponse>;
type Group = RequirementsResponse["groups"][number];

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

function provenanceOf(group: Group, universityCoreYear: string | null, bulletinEdition: string): RequirementProvenance {
  const academicYear = text(group.academicYear);
  const own =
    group.kind === "university" || group.kind === "university_core" || group.kind === "college" || group.kind === "minor";
  return {
    groupId: group.id,
    groupKind: group.kind,
    sourceType: "current_bulletin",
    sourceIdentifier: text(group.sourceUrl),
    sourceLabel: text(group.sourceLabel),
    sourceVersion: academicYear,
    academicYear,
    academicYearBasis: !academicYear
      ? "not_stated"
      : own
        ? "stated_for_this_group"
        : academicYear === universityCoreYear
          ? "inherited_from_university_core"
          : "stated_for_this_group",
    lastVerified: text(group.lastVerified),
    sourceDocumentId: null,
    sourceSection: text(group.title),
    sourceProgram: group.kind === "major" || group.kind === "minor" ? programNameOf(group.title) : null,
    bulletinEdition,
    importedAt: null,
    provenanceStatus:
      group.kind === "professional_prep"
        ? "student_authored"
        : text(group.sourceUrl) && academicYear && text(group.lastVerified)
          ? "documented"
          : text(group.sourceUrl) || academicYear || text(group.lastVerified)
            ? "partial"
            : "unknown",
  };
}

export const currentBulletinProvider: RequirementsBenchmarkProvider<RequirementsResponse> = {
  type: "current_bulletin",
  build(request: RequirementsRequest) {
    // The latest loaded edition unless the request names one. An edition that
    // is not loaded throws: it is never answered with a different edition.
    const { edition } = resolveBulletinEdition(request.context?.bulletinEdition);
    const response = buildRequirementsResponse(
      request.profile,
      request.scenarioMajors,
      request.scenarioMinors,
      request.professionalGoals,
      request.plannedCourses,
      request.primaryMajor,
      { allVariants: request.variants === "all" },
    );
    const core = response.groups.find((group) => group.kind === "university_core");
    const coreYear = text(core?.academicYear);
    return {
      response,
      provenance: response.groups.map((group) => provenanceOf(group, coreYear, edition.id)),
      edition: edition.id,
    };
  },
};
