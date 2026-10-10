/**
 * Where the Degree Plan's requirements sidebar gets its requirements.
 *
 * THE DECISION IS NOT MADE. Which source the sidebar should be benchmarked
 * against is the professor's to decide, and has not been decided:
 *
 *   - the current Undergraduate Bulletin;
 *   - the Bulletin of the student's matriculation (cohort) year;
 *   - the department checksheet for the student's curriculum year;
 *   - the Academic Progress Report;
 *   - a controlled combination of these.
 *
 * What is here is the engineering that makes that decision cheap to carry out
 * once it is made: one interface every source implements, one place that names
 * the source in use, and a record of where each group of requirements came
 * from. It changes nothing a student sees.
 *
 * Only one provider exists, and it is the behaviour CampusVal already had. The
 * other source types are named so the choice can be written down, and are
 * deliberately NOT implemented: building one would be deciding.
 */
import type { StudentProfileRow } from "@workspace/db";

export const REQUIREMENT_SOURCE_TYPES = ["current_bulletin", "cohort_bulletin", "degree_checksheet", "apr", "composite"] as const;
export type RequirementSourceType = (typeof REQUIREMENT_SOURCE_TYPES)[number];

export const REQUIREMENT_SOURCE_LABEL: Record<RequirementSourceType, string> = {
  current_bulletin: "Current Undergraduate Bulletin",
  cohort_bulletin: "Undergraduate Bulletin of the student's matriculation year",
  degree_checksheet: "Department checksheet for the student's curriculum year",
  apr: "Workday Academic Progress Report",
  composite: "A controlled combination of sources",
};

/** What the sidebar is asked for. The same input whatever the source. */
export interface RequirementsRequest {
  profile: StudentProfileRow;
  scenarioMajors: string[];
  scenarioMinors: string[];
  professionalGoals: { id: string; name: string; notes: string; courseCodes: string[]; placeholders: string[] }[];
  plannedCourses: string[];
  primaryMajor: string | null;
  /**
   * "all": resolve every track / emphasis of a major instead of the student's own choice (a
   * department's program tree shows every requirement a note can attach to). Default: the student's.
   */
  variants?: "student" | "all";
  /**
   * Context a source may one day select or version by. NO current provider
   * reads it, and none may be inferred from it (in particular the student's
   * entry year is NOT used to pick a Bulletin): it exists so a future
   * provider can accept a curriculum year without the callers changing.
   */
  context?: {
    planId?: number | null;
    curriculumYear?: string | null;
    /**
     * A Bulletin edition id ("2026-27"). Absent = the configured / latest
     * edition. There is no student-facing selector yet; this is the seam for it.
     */
    bulletinEdition?: string | null;
  };
}

/**
 * Where one group of requirements came from. Every value is one the data
 * already carries; nothing is filled in that CampusVal does not know. A field
 * is null when the data does not say.
 */
export interface RequirementProvenance {
  /** The group of the response this describes. */
  groupId: string;
  groupKind: string;
  sourceType: RequirementSourceType;
  /** Which document within the source: the address the group's data names. */
  sourceIdentifier: string | null;
  sourceLabel: string | null;
  /** The edition of the source, as the data states it ("2025-26 / 2026-27 Undergraduate Bulletin"). */
  sourceVersion: string | null;
  /** The academic year the response shows for the group. */
  academicYear: string | null;
  /**
   * Whose year that is. A major's group shows the University Core's year, not
   * one of its own: the major data does not state an edition per group.
   */
  academicYearBasis: "stated_for_this_group" | "inherited_from_university_core" | "not_stated";
  /** When a person last checked the data against the source. */
  lastVerified: string | null;
  /**
   * A future document-based source (a canonical checksheet, an exported APR)
   * names the exact document here. Null for the current data, which is code,
   * not a document. Never a student's private upload.
   */
  sourceDocumentId: string | null;
  /** Where inside the source: the group's own title. */
  sourceSection: string | null;
  /** The program the group describes ("Biology"), when it describes one. */
  sourceProgram: string | null;
  /**
   * The Bulletin edition id ("2026-27") the group was built from. With the
   * stable key it is a requirement's full identity. Null for sources that are
   * not a Bulletin.
   */
  bulletinEdition: string | null;
  /** When CampusVal imported it. Null: the current data is compiled in, not imported. */
  importedAt: string | null;
  /**
   * documented: the data names its document, edition and verification date.
   * partial: some of those are missing. unknown: none is stated.
   * student_authored: written by the student (a Professional Preparation goal);
   * it has no SCU source and never claims one.
   */
  provenanceStatus: "documented" | "partial" | "unknown" | "student_authored";
}

export interface RequirementsResult<Response> {
  /** Exactly what is sent to the student's browser. */
  response: Response;
  /** For CampusVal's own use. Never sent to a student. */
  provenance: RequirementProvenance[];
  /** The Bulletin edition id the response was built from; null for other sources. */
  edition: string | null;
}

export interface RequirementsBenchmarkProvider<Response> {
  readonly type: RequirementSourceType;
  build(request: RequirementsRequest): RequirementsResult<Response>;
}

/** The state of the decision, for CampusVal's maintainers. */
export interface RequirementsSourceStatus {
  active: RequirementSourceType;
  activeLabel: string;
  /** False until the professor chooses. */
  policyDecided: boolean;
  implemented: RequirementSourceType[];
  notImplemented: RequirementSourceType[];
  decisionNeeded: string;
}
