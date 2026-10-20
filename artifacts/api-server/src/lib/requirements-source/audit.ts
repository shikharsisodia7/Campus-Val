/**
 * The requirements audit: walks every supported major and minor through the
 * active requirements source and reports what is wrong or unproven, so the
 * professor can proofread requirement content systematically.
 *
 * It only REPORTS. It never edits, "fixes" or substitutes academic content.
 * Every finding has a category so the right person acts on it:
 *
 *   data_integrity      objectively wrong in the data or code (a duplicate id, a
 *                       course code that is not in the catalog, a malformed
 *                       rule). Engineering fixes these.
 *   missing_provenance  the data does not say where it came from (no source
 *                       address, edition or verification date).
 *   academic_content    may be right or wrong depending on SCU policy (an empty
 *                       group, a course listed twice, a Core-looking item in a
 *                       major). Reported for the professor; never auto-changed.
 *
 * Private student data is never read: the audit runs on synthetic profiles.
 */
import type { StudentProfileRow } from "@workspace/db";
import { getAvailableMajors, getAvailableMinors, getMajorCollege, getMajorRequirements, getMinorRequirements, type College } from "../../data/graduation-paths";
import { findCourse } from "../../data/courses";
import { MAJOR_STRUCTURES, resolveMajorStructure, structureCourses, type MajorStructure } from "../../data/major-structures";
import { buildNormalizedRequirements } from "./index";
import { codesNamedIn } from "./bulletin-source-text";
import { isCtwCourseCode, looksLikeCoreAreaLabel } from "./category";
import type { NormalizedGroup } from "./normalize";
import { findOrphanedCustomizations, type StoredCustomization } from "./overlay";

export type AuditCategory = "data_integrity" | "missing_provenance" | "academic_content";
export type AuditSeverity = "error" | "warning" | "info";

export interface AuditFinding {
  code: string;
  category: AuditCategory;
  severity: AuditSeverity;
  programType: "major" | "minor" | "college";
  program: string;
  group: string;
  groupKey: string;
  requirement: string | null;
  requirementKey: string | null;
  message: string;
}

/** One row per requirement (or per empty group), for proofreading in a spreadsheet. */
export interface AuditRow {
  programType: "major" | "minor" | "college";
  program: string;
  group: string;
  groupKey: string;
  requirement: string;
  requirementKey: string;
  courses: string;
  provider: string;
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  lastVerified: string;
  provenanceStatus: string;
  /** Structured-major section, when the active source provides one. */
  section?: string;
  /** Structured-major track/emphasis/concentration, when the active source provides one. */
  variant?: string;
  /** fixed_course, choose, alternatives, or manual. */
  requirementRule?: string;
  /** Minimum courses for a choice; blank for alternatives, units, and fixed courses. */
  choiceMinimum?: string;
  /** Number of named eligible lists/options attached to this choice. */
  choiceListCount?: number;
  /** Number of those lists/options that actually contain courses. */
  nonEmptyChoiceListCount?: number;
  /** Distinct eligible courses exposed by this normalized requirement. */
  choiceEligibleCourseCount?: number;
  warnings: string;
}

export interface ChoiceCoverage {
  requirements: number;
  lists: number;
  nonEmptyLists: number;
  emptyLists: number;
}

export interface AuditReport {
  generatedAt: string;
  provider: string;
  counts: {
    majors: number;
    minors: number;
    collegeGroups: number;
    /** Majors that name official concentrations/tracks, and how many names in all. */
    majorsWithConcentrations: number;
    concentrations: number;
    /** Findings that say a requirement sits in the wrong category (Core under Major, ...). */
    classificationErrors: number;
    groups: number;
    requirements: number;
    /** Choice/alternative requirements represented in the normalized output. */
    choiceRequirements: number;
    /** Named choice lists and alternative options exposed in that output. */
    choiceLists: number;
    choiceListsWithCourses: number;
    emptyChoiceLists: number;
    /** Major structures with stored Bulletin source metadata. */
    structuredMajorSources: number;
    /** Source/normalized representation parity findings. */
    sourceRepresentationMismatches: number;
    /** Majors with no enumerated upper-division course evidence. */
    majorsWithoutUpperDivisionCourseEvidence: number;
    /** Plans (single majors and cross-school combinations) checked for school composition. */
    schoolCompositionCases: number;
    /** Findings from those checks (a missing or duplicated school group, a second Core...). */
    schoolCompositionErrors: number;
    findings: number;
    byCategory: Record<AuditCategory, number>;
    bySeverity: Record<AuditSeverity, number>;
    missingProvenanceGroups: number;
  };
  findings: AuditFinding[];
  rows: AuditRow[];
}

/** The choice shape the requirements response sends for structured majors/minors. */
interface AuditChoice {
  kind: "choose" | "alternatives";
  minimum: number | null;
  minDistinctLists: number | null;
  lists: { key: string; label: string; courses: string[] }[];
  alternatives: { label: string; courses: string[] }[];
}

type AuditableItem = {
  choice?: AuditChoice | null;
  manual?: boolean;
  section?: string | null;
  variant?: string | null;
};

const emptyChoiceCoverage = (): ChoiceCoverage => ({ requirements: 0, lists: 0, nonEmptyLists: 0, emptyLists: 0 });

const mergeChoiceCoverage = (into: ChoiceCoverage, from: ChoiceCoverage) => {
  into.requirements += from.requirements;
  into.lists += from.lists;
  into.nonEmptyLists += from.nonEmptyLists;
  into.emptyLists += from.emptyLists;
};

const COLLEGE_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

const normalizeCode = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, " ");

// Core area names. A real course whose title merely contains a phase word
// (BUSN 70 "Foundations of Business") is not matched.
const CORE_LOOKING = /\b(core curriculum|pathway|critical thinking|cultures? (?:and|&) ideas|religion, theology)/i;

function syntheticProfile(college: College, major: string, minor: string | null): StudentProfileRow {
  return {
    id: 0,
    userId: "requirements-audit",
    email: null,
    name: "Requirements Audit",
    studentId: null,
    studentType: "undergraduate",
    college: COLLEGE_NAME[college],
    major,
    secondMajor: null,
    minor,
    additionalMajors: [],
    additionalMinors: [],
    startTerm: "fall",
    startYear: 2026,
    expectedGradTerm: "spring",
    expectedGradYear: 2030,
    unitsCompletedAtScu: "0",
    unitsTransferredIn: "0",
    cumulativeGpa: null,
    majorGpa: null,
    completedCourseCodes: [],
    priorityRegistration: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as StudentProfileRow;
}

type Tree = NormalizedGroup[];

/** Checks that need only one built program tree. Exported so tests can feed it crafted trees. */
export function auditTree(
  tree: Tree,
  programType: AuditFinding["programType"],
  program: string,
  options: { universityCoreItemCourses?: Set<string>[] } = {},
): { findings: AuditFinding[]; rows: AuditRow[]; choiceCoverage: ChoiceCoverage } {
  const findings: AuditFinding[] = [];
  const rows: AuditRow[] = [];
  const choiceCoverage = emptyChoiceCoverage();
  const seenKeys = new Map<string, string>();

  for (const node of tree) {
    const { group, provenance } = node;
    const at = (
      code: string,
      category: AuditCategory,
      severity: AuditSeverity,
      message: string,
      item?: { label: string; stableKey: string },
    ) => {
      findings.push({
        code,
        category,
        severity,
        programType,
        program,
        group: group.title,
        groupKey: node.stableKey,
        requirement: item?.label ?? null,
        requirementKey: item?.stableKey ?? null,
        message,
      });
    };

    if (provenance.provenanceStatus === "unknown" || provenance.provenanceStatus === "partial") {
      const missing = [
        !provenance.sourceIdentifier && "source address",
        !provenance.sourceVersion && "edition",
        !provenance.lastVerified && "verification date",
      ].filter(Boolean);
      at("provenance_incomplete", "missing_provenance", "warning", `The data does not state: ${missing.join(", ")}.`);
    }
    if (group.items.length === 0) {
      at("group_has_no_requirements", "academic_content", "warning", group.notes?.[0] ?? "This group lists no requirements.");
    }

    const ids = new Set<string>();
    const groupCourses = new Map<string, string>();
    for (const { item, stableKey } of node.items) {
      const auditItem = item as typeof item & AuditableItem;
      const choice = auditItem.choice ?? null;
      const manual = auditItem.manual === true;
      const ref = { label: item.label, stableKey };
      const itemWarnings: string[] = [];
      const flag = (code: string, category: AuditCategory, severity: AuditSeverity, message: string) => {
        at(code, category, severity, message, ref);
        itemWarnings.push(code);
      };

      if (ids.has(item.id)) flag("duplicate_item_id", "data_integrity", "error", `Two requirements in this group share the id "${item.id}".`);
      ids.add(item.id);
      const owner = seenKeys.get(stableKey);
      if (owner !== undefined) flag("duplicate_stable_key", "data_integrity", "error", `The stable key "${stableKey}" is also used in "${owner}".`);
      seenKeys.set(stableKey, group.title);

      if (!item.label.trim()) flag("empty_label", "data_integrity", "error", "The requirement has no label.");
      if (!item.description.trim()) flag("empty_description", "data_integrity", "warning", "The requirement has no description.");

      // Choice details are part of the source representation, not merely display
      // decoration. Keep their coverage in the spreadsheet and fail a rule that
      // asks a student to choose from an empty list. A manual rule with no
      // enumerated list is allowed: CampusVal must preserve the Bulletin's words
      // instead of inventing an approved-course list.
      const choiceLists = choice
        ? choice.kind === "alternatives"
          ? choice.alternatives.map((alternative, index) => ({ key: `alternative-${index + 1}`, label: alternative.label, courses: alternative.courses }))
          : choice.lists
        : [];
      if (choice) {
        choiceCoverage.requirements += 1;
        choiceCoverage.lists += choiceLists.length;
        choiceCoverage.nonEmptyLists += choiceLists.filter((list) => list.courses.length > 0).length;
        choiceCoverage.emptyLists += choiceLists.filter((list) => list.courses.length === 0).length;

        if (choiceLists.length === 0) {
          flag(
            choice.kind === "alternatives" ? "alternative_requirement_has_no_options" : "choice_requirement_has_no_lists",
            "data_integrity",
            "error",
            choice.kind === "alternatives"
              ? "An alternatives requirement has no course-set options."
              : "A choice requirement has no named eligible-course lists.",
          );
        }
        for (const list of choiceLists) {
          if (list.courses.length === 0) {
            flag(
              choice.kind === "alternatives" ? "alternative_option_has_no_courses" : "choice_list_has_no_courses",
              "data_integrity",
              "error",
              `The ${choice.kind === "alternatives" ? "alternative option" : "choice list"} "${list.label || list.key}" has no eligible courses.`,
            );
          }
        }
        if (!manual && item.courses.length === 0) {
          flag("choice_requirement_has_no_eligible_courses", "data_integrity", "error", "A course-counted choice requirement exposes no eligible courses.");
        }
        if (choice.kind === "choose" && typeof choice.minimum === "number") {
          const distinctCourses = new Set(item.courses.map(normalizeCode)).size;
          if (choice.minimum < 1) {
            flag("choice_minimum_invalid", "data_integrity", "error", `The choice minimum is ${choice.minimum}.`);
          // A single named workshop with a higher count can be a deliberate
          // repeatable-course rule. The minor-recipe audit reports that case
          // for human proofing without incorrectly declaring it impossible.
          } else if (!manual && distinctCourses < choice.minimum && distinctCourses !== 1) {
            flag("choice_minimum_exceeds_eligible_courses", "data_integrity", "error", `The choice needs ${choice.minimum} distinct course(s) but exposes only ${distinctCourses}.`);
          }
          if (typeof choice.minDistinctLists === "number" && choice.minDistinctLists > choiceLists.length) {
            flag("choice_minimum_distinct_lists_invalid", "data_integrity", "error", `The choice needs courses from ${choice.minDistinctLists} lists but exposes only ${choiceLists.length}.`);
          }
        }
      }

      const inItem = new Set<string>();
      for (const raw of item.courses) {
        const code = normalizeCode(raw);
        if (!raw.trim()) flag("empty_course_code", "data_integrity", "error", "A course code is empty.");
        else if (raw !== code) flag("course_code_not_normalized", "data_integrity", "warning", `"${raw}" differs from its normalized form "${code}" (case or spacing).`);
        if (raw.trim() && !findCourse(code)) flag("course_not_in_catalog", "data_integrity", "warning", `${code} is not in the course catalog.`);
        if (inItem.has(code)) flag("duplicate_course_in_requirement", "data_integrity", "warning", `${code} is listed twice in this requirement.`);
        inItem.add(code);
        if (group.kind === "major" && item.courses.length === 1) {
          const first = groupCourses.get(code);
          if (first !== undefined) flag("course_listed_twice_in_group", "academic_content", "info", `${code} is listed in this group more than once (also under "${first}").`);
          else groupCourses.set(code, item.label);
        }
      }

      // CLASSIFICATION: a requirement belongs to the category of the Bulletin group it is in.
      // These are objective: the item's own wording says it is in the wrong group.
      if (group.kind === "major") {
        const noCatalogCourse = item.courses.length === 0 || item.courses.every((c) => !findCourse(normalizeCode(c)));
        if (looksLikeCoreAreaLabel(item.label) && (noCatalogCourse || item.courses.every(isCtwCourseCode))) {
          flag("core_requirement_under_major", "data_integrity", "error", "A University Core area (Critical Thinking & Writing, Cultures & Ideas, a Pathway...) is listed as a major requirement.");
        } else if (item.courses.some(isCtwCourseCode)) {
          // Legitimate if the major itself requires the course; reported so it can be proofread.
          flag("ctw_course_in_major", "academic_content", "info", "A Critical Thinking & Writing course is listed as a major requirement. It is Core for every student; confirm the major requires it for its own reason.");
        }
        // The university's own unit rules (175 / 193 units; 60 upper-division units). A major's OWN unit
        // requirement ("40 quarter upper-division units" of French) is the major's, not a leak.
        if (/\b(175|193) (quarter )?units\b|\b60 (quarter )?(units of )?upper-division\b|\bresidency\b|\b2\.0 GPA\b/i.test(`${item.label} ${item.description}`)) {
          flag("university_rule_under_major", "data_integrity", "error", "A university-wide degree rule (units, residency, GPA) is listed as a major requirement.");
        }
      } else if (group.kind === "university_core") {
        if (item.phase == null) flag("core_item_without_phase", "data_integrity", "error", "A University Core requirement has no Foundations / Explorations / Integrations phase.");
        if (/^[A-Z]{2,5} \d{1,3}[A-Z]{0,2}\s+[—-]\s/.test(item.label)) {
          flag("major_requirement_under_core", "data_integrity", "error", "A course-by-course (major-style) requirement is listed under the University Core.");
        }
      } else if (group.kind === "university") {
        if (item.courses.length > 0) flag("university_rule_with_courses", "data_integrity", "error", "A university-wide rule lists courses; it should be a rule, not a course list.");
      }

      if (group.kind === "major") {
        const same = (set: Set<string>) => set.size > 0 && set.size === inItem.size && [...set].every((c) => inItem.has(c));
        // A Core area NAME standing where a course should: it names a Core area and none
        // of its entries is a catalog course. A real course whose title mentions a Core
        // area (HIST 11A, Cultures & Ideas I) is a legitimate major requirement.
        const noRealCourse = item.courses.length === 0 || item.courses.every((c) => !findCourse(normalizeCode(c)));
        const looksCore = item.phase != null || (CORE_LOOKING.test(item.label) && noRealCourse);
        const sameAsCore = item.courses.length > 1 && (options.universityCoreItemCourses ?? []).some(same);
        if (looksCore || sameAsCore) {
          flag(
            "possible_category_leakage",
            "academic_content",
            "warning",
            "A major requirement reads like a University Core item. It may be intended (the source lists it) or a category mix-up.",
          );
        }
      }

      rows.push({
        programType,
        program,
        group: group.title,
        groupKey: node.stableKey,
        requirement: item.label,
        requirementKey: stableKey,
        courses: item.courses.join("; "),
        provider: node.provider,
        source: provenance.sourceLabel ?? "",
        sourceUrl: provenance.sourceIdentifier ?? "",
        sourceVersion: provenance.sourceVersion ?? "",
        lastVerified: provenance.lastVerified ?? "",
        provenanceStatus: provenance.provenanceStatus,
        section: auditItem.section ?? "",
        variant: auditItem.variant ?? "",
        requirementRule: choice?.kind ?? (manual ? "manual" : "fixed_course"),
        choiceMinimum: choice?.minimum == null ? "" : String(choice.minimum),
        choiceListCount: choiceLists.length,
        nonEmptyChoiceListCount: choiceLists.filter((list) => list.courses.length > 0).length,
        choiceEligibleCourseCount: choice ? new Set(item.courses.map(normalizeCode)).size : 0,
        warnings: itemWarnings.join("; "),
      });
    }

    if (node.items.length === 0) {
      rows.push({
        programType,
        program,
        group: group.title,
        groupKey: node.stableKey,
        requirement: "",
        requirementKey: "",
        courses: "",
        provider: node.provider,
        source: provenance.sourceLabel ?? "",
        sourceUrl: provenance.sourceIdentifier ?? "",
        sourceVersion: provenance.sourceVersion ?? "",
        lastVerified: provenance.lastVerified ?? "",
        provenanceStatus: provenance.provenanceStatus,
        section: "",
        variant: "",
        requirementRule: "empty_group",
        choiceMinimum: "",
        choiceListCount: 0,
        nonEmptyChoiceListCount: 0,
        choiceEligibleCourseCount: 0,
        warnings: "group_has_no_requirements",
      });
    }
  }
  return { findings, rows, choiceCoverage };
}

/** Findings that mean the normalized response no longer matches its structured Bulletin source. */
export const SOURCE_REPRESENTATION_MISMATCH_CODES = new Set([
  "source_course_not_named",
  "normalized_requirement_key_duplicate",
  "normalized_requirement_missing_from_structured_source",
  "normalized_requirement_not_in_structured_source",
  "normalized_requirement_course_mismatch",
  "normalized_requirement_choice_mismatch",
  "normalized_requirement_manual_mismatch",
  "normalized_provenance_source_mismatch",
]);

const localRequirementKey = (groupId: string, itemId: string): string => {
  const prefix = `${groupId}-`;
  return itemId.startsWith(prefix) ? itemId.slice(prefix.length) : itemId;
};

const courseSet = (courses: readonly string[]): string[] => [...new Set(courses.map(normalizeCode))].sort();

const sameCourses = (left: readonly string[], right: readonly string[]) => {
  const a = courseSet(left);
  const b = courseSet(right);
  return a.length === b.length && a.every((course, index) => course === b[index]);
};

const choiceSignature = (choice: AuditChoice | null | undefined): string => {
  if (!choice) return "";
  const lists = choice.lists.map((list) => ({ key: list.key, courses: courseSet(list.courses) }));
  const alternatives = choice.alternatives.map((alternative) => ({ label: alternative.label, courses: courseSet(alternative.courses) }));
  return JSON.stringify({
    kind: choice.kind,
    minimum: choice.minimum ?? null,
    minDistinctLists: choice.minDistinctLists ?? null,
    lists,
    alternatives,
  });
};

const isUpperDivisionCourse = (course: string): boolean => {
  const match = /^[A-Z]{2,5}\s+(\d{1,3})/i.exec(normalizeCode(course));
  return match !== null && Number(match[1]) >= 100;
};

/**
 * Compare a major's normalized response with the structured source used to
 * create it. The stored source text gives this check a reviewable boundary:
 * it does not scrape or infer academic policy, and it never turns a source
 * discrepancy into a data rewrite.
 */
export function auditStructuredMajorSource(
  program: string,
  structure: MajorStructure,
  normalized: NormalizedGroup,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const at = (
    code: string,
    category: AuditCategory,
    severity: AuditSeverity,
    message: string,
    item?: { label: string; stableKey: string },
  ) => findings.push({
    code,
    category,
    severity,
    programType: "major",
    program,
    group: normalized.group.title,
    groupKey: normalized.stableKey,
    requirement: item?.label ?? null,
    requirementKey: item?.stableKey ?? null,
    message,
  });

  const missingMetadata = [
    !structure.sourceUrl && "source address",
    !structure.catalogYear && "edition",
    !structure.lastVerified && "verification date",
    structure.sourceText.length === 0 && "source requirement text",
  ].filter(Boolean);
  if (missingMetadata.length > 0) {
    at("structured_source_metadata_incomplete", "missing_provenance", "warning", `The structured source does not state: ${missingMetadata.join(", ")}.`);
  }

  const provenanceMismatches = [
    normalized.provenance.sourceIdentifier !== structure.sourceUrl && "source address",
    normalized.provenance.sourceVersion !== structure.catalogYear && "edition",
    normalized.provenance.lastVerified !== structure.lastVerified && "verification date",
  ].filter(Boolean);
  if (provenanceMismatches.length > 0) {
    at(
      "normalized_provenance_source_mismatch",
      "data_integrity",
      "error",
      `The normalized group disagrees with its structured source about: ${provenanceMismatches.join(", ")}.`,
    );
  }

  if (structure.sourceText.length > 0) {
    const named = new Set([...codesNamedIn([...structure.sourceText, ...(structure.listingText ?? [])], structure.defaultSubject)].map(normalizeCode));
    const corrections = new Set(Object.keys(structure.sourceCorrections ?? {}).map(normalizeCode));
    for (const course of structureCourses(structure)) {
      if (!named.has(normalizeCode(course)) && !corrections.has(normalizeCode(course))) {
        at(
          "source_course_not_named",
          "data_integrity",
          "error",
          `${course} appears in the structured representation but not in the stored Bulletin text or source corrections.`,
        );
      }
    }
  }

  const expected = new Map(resolveMajorStructure(structure, [], [], { allVariants: true }).map((item) => [item.key, item]));
  const actual = new Map<string, (typeof normalized.items)[number]>();
  for (const item of normalized.items) {
    const key = localRequirementKey(normalized.group.id, item.item.id);
    if (actual.has(key)) {
      at(
        "normalized_requirement_key_duplicate",
        "data_integrity",
        "error",
        `The normalized response contains the structured requirement key "${key}" more than once.`,
        { label: item.item.label, stableKey: item.stableKey },
      );
    }
    actual.set(key, item);
  }

  for (const [key, sourceItem] of expected) {
    const responseItem = actual.get(key);
    if (!responseItem) {
      at(
        "normalized_requirement_missing_from_structured_source",
        "data_integrity",
        "error",
        `The structured source defines "${sourceItem.label}" (${key}), but the normalized response does not expose it.`,
      );
      continue;
    }
    const response = responseItem.item as typeof responseItem.item & AuditableItem;
    if (!sameCourses(sourceItem.courses, response.courses)) {
      at(
        "normalized_requirement_course_mismatch",
        "data_integrity",
        "error",
        `The normalized requirement's eligible courses differ from structured source "${key}".`,
        { label: response.label, stableKey: responseItem.stableKey },
      );
    }
    if (choiceSignature(sourceItem.choice) !== choiceSignature(response.choice)) {
      at(
        "normalized_requirement_choice_mismatch",
        "data_integrity",
        "error",
        `The normalized choice rule differs from structured source "${key}".`,
        { label: response.label, stableKey: responseItem.stableKey },
      );
    }
    if (sourceItem.manual !== (response.manual === true)) {
      at(
        "normalized_requirement_manual_mismatch",
        "data_integrity",
        "error",
        `The normalized manual-tracking setting differs from structured source "${key}".`,
        { label: response.label, stableKey: responseItem.stableKey },
      );
    }
  }
  for (const [key, responseItem] of actual) {
    if (!expected.has(key)) {
      at(
        "normalized_requirement_not_in_structured_source",
        "data_integrity",
        "error",
        `The normalized response exposes "${responseItem.item.label}" (${key}), which the structured source does not define.`,
        { label: responseItem.item.label, stableKey: responseItem.stableKey },
      );
    }
  }

  const expectedCourses = [...expected.values()].flatMap((item) => item.courses);
  if (!expectedCourses.some(isUpperDivisionCourse)) {
    const sourceMentionsUpperDivision = /\bupper[-\s]?division\b/i.test([
      ...structure.sourceText,
      ...(structure.listingText ?? []),
      ...structure.notes,
      ...structure.sections.flatMap((section) => [section.label, ...section.requirements.flatMap((requirement) => [requirement.label, requirement.description])]),
    ].join("\n"));
    at(
      "major_without_upper_division_course_evidence",
      "academic_content",
      "warning",
      sourceMentionsUpperDivision
        ? "The source describes upper-division work but the structured requirements expose no upper-division course options. Confirm the source mapping."
        : "The structured major exposes no upper-division course options or upper-division source language. Confirm that a requirement was not omitted.",
    );
  }

  return findings;
}

/** Rules that live in a minor's recipe, checked against the recipe itself. */
function auditMinorRecipe(code: string, title: string): AuditFinding[] {
  const recipe = getMinorRequirements(code);
  if (!recipe) return [];
  const findings: AuditFinding[] = [];
  recipe.groups.forEach((group, index) => {
    const bad = (message: string, codeName: string) =>
      findings.push({
        code: codeName,
        category: "data_integrity",
        severity: "error",
        programType: "minor",
        program: title,
        group: `Minor Requirements — ${recipe.title}`,
        groupKey: `minor-${recipe.code.toLowerCase()}`,
        requirement: group.label,
        requirementKey: `minor-${recipe.code}-${index + 1}`,
        message,
      });
    if (!group.label.trim()) bad("A requirement group has no label.", "malformed_rule");
    if (group.minimumCourses !== undefined && group.minimumCourses < 1) bad(`minimumCourses is ${group.minimumCourses}.`, "malformed_rule");
    if (group.minimumCourses !== undefined && group.courses.length > 0 && group.minimumCourses > group.courses.length) {
      // Contradictory as written, but the real rule may allow a repeatable course
      // or a longer approved list: that is SCU policy, so it is the professor's to settle.
      findings.push({
        code: "minimum_exceeds_listed_courses",
        category: "academic_content",
        severity: "warning",
        programType: "minor",
        program: title,
        group: `Minor Requirements — ${recipe.title}`,
        groupKey: `minor-${recipe.code.toLowerCase()}`,
        requirement: group.label,
        requirementKey: `minor-${recipe.code}-${index + 1}`,
        message: `Asks for ${group.minimumCourses} courses but lists only ${group.courses.length}. As written it cannot be met by ${group.courses.length} distinct course(s); the source may allow repeats or a longer list.`,
      });
    }
    if (group.minimumUnits !== undefined && group.minimumUnits <= 0) bad(`minimumUnits is ${group.minimumUnits}.`, "malformed_rule");
  });
  return findings;
}

export function auditRequirements(now: Date = new Date()): AuditReport {
  const findings: AuditFinding[] = [];
  const rows: AuditRow[] = [];
  const choiceCoverage = emptyChoiceCoverage();
  const majors = getAvailableMajors();
  const minors = getAvailableMinors();
  let provider = "";
  let groups = 0;
  let missingProvenanceGroups = 0;

  const build = (college: College, major: string, minor: string | null) => {
    const built = buildNormalizedRequirements({
      profile: syntheticProfile(college, major, minor),
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
      // Audit every track / emphasis, not only the requirements a student with none chosen sees.
      variants: "all",
    });
    provider = built.provider;
    return built.tree;
  };

  // University Core and school groups: once per school, not once per major.
  const firstMajorOf = new Map<College, string>();
  for (const m of majors) if (!firstMajorOf.has(m.college)) firstMajorOf.set(m.college, m.code);
  const coreCoursesByCollege = new Map<College, Set<string>[]>();
  let collegeGroups = 0;
  let majorsWithConcentrations = 0;
  let concentrations = 0;
  for (const [college, major] of firstMajorOf) {
    const shared = build(college, major, null).filter((g) => g.group.kind === "university" || g.group.kind === "university_core" || g.group.kind === "college");
    collegeGroups += shared.length;
    groups += shared.length;
    missingProvenanceGroups += shared.filter((g) => ["unknown", "partial"].includes(g.provenance.provenanceStatus)).length;
    coreCoursesByCollege.set(
      college,
      shared.filter((g) => g.group.kind === "university_core").flatMap((g) => g.items.map((i) => new Set(i.item.courses.map(normalizeCode)))),
    );
    const result = auditTree(shared, "college", COLLEGE_NAME[college]);
    findings.push(...result.findings);
    rows.push(...result.rows);
    mergeChoiceCoverage(choiceCoverage, result.choiceCoverage);
  }

  const schoolCourses = new Map<College, Set<string>>();
  for (const [college, major] of firstMajorOf) {
    const schoolGroup = build(college, major, null).find((g) => g.group.kind === "college");
    schoolCourses.set(college, new Set((schoolGroup?.items ?? []).flatMap((i) => i.item.courses.map(normalizeCode))));
  }

  for (const m of majors) {
    const tree = build(m.college, m.code, null).filter((g) => g.group.kind === "major");
    const label = `${m.title} (${m.code})`;
    const overlap = new Set<string>();
    for (const node of tree) for (const i of node.items) for (const c of i.item.courses) if (schoolCourses.get(m.college)?.has(normalizeCode(c))) overlap.add(normalizeCode(c));
    if (overlap.size > 0 && tree[0]) {
      findings.push({
        code: "listed_in_school_and_major_groups",
        category: "academic_content",
        severity: "info",
        programType: "major",
        program: label,
        group: tree[0].group.title,
        groupKey: tree[0].stableKey,
        requirement: null,
        requirementKey: null,
        message: `${overlap.size} course(s) appear in both the school requirements group and this major group (${[...overlap].slice(0, 6).join(", ")}${overlap.size > 6 ? ", ..." : ""}). Typical of the Leavey Common Curriculum; the source may intend it.`,
      });
    }
    const named = getMajorRequirements(m.code, [], () => undefined)?.concentrations.length ?? 0;
    if (named > 0) majorsWithConcentrations += 1;
    concentrations += named;
    groups += tree.length;
    missingProvenanceGroups += tree.filter((g) => ["unknown", "partial"].includes(g.provenance.provenanceStatus)).length;
    if (tree.length === 0) {
      findings.push({
        code: "major_program_not_built",
        category: "data_integrity",
        severity: "error",
        programType: "major",
        program: label,
        group: "",
        groupKey: "",
        requirement: null,
        requirementKey: null,
        message: "The major is offered but produced no requirement group.",
      });
    } else {
      const structure = MAJOR_STRUCTURES[m.code];
      if (!structure) {
        findings.push({
          code: "major_structured_source_missing",
          category: "missing_provenance",
          severity: "warning",
          programType: "major",
          program: label,
          group: tree[0]!.group.title,
          groupKey: tree[0]!.stableKey,
          requirement: null,
          requirementKey: null,
          message: "This major has no structured Bulletin source to compare against the normalized response.",
        });
      } else {
        findings.push(...auditStructuredMajorSource(label, structure, tree[0]!));
      }
    }
    const result = auditTree(tree, "major", label, { universityCoreItemCourses: coreCoursesByCollege.get(m.college) });
    findings.push(...result.findings);
    rows.push(...result.rows);
    mergeChoiceCoverage(choiceCoverage, result.choiceCoverage);
  }

  for (const minor of minors) {
    const tree = build(minor.college, firstMajorOf.get(minor.college) ?? majors[0]!.code, minor.title).filter((g) => g.group.kind === "minor");
    groups += tree.length;
    missingProvenanceGroups += tree.filter((g) => ["unknown", "partial"].includes(g.provenance.provenanceStatus)).length;
    const label = `${minor.title} (${minor.code})`;
    if (tree.length === 0) {
      findings.push({
        code: "program_not_built",
        category: "data_integrity",
        severity: "error",
        programType: "minor",
        program: label,
        group: "",
        groupKey: "",
        requirement: null,
        requirementKey: null,
        message: "The minor is offered but produced no requirement group.",
      });
      continue;
    }
    const result = auditTree(tree, "minor", label);
    findings.push(...result.findings, ...auditMinorRecipe(minor.code, label));
    rows.push(...result.rows);
    mergeChoiceCoverage(choiceCoverage, result.choiceCoverage);
  }

  // Multi-school composition: every major alone, the cross-school matrix, and a
  // business minor beside a non-business major (a minor brings no school).
  const compositionCases: { label: string; majors: string[]; minor: string | null }[] = [
    ...majors.map((m) => ({ label: `${m.title} (${m.code})`, majors: [m.code], minor: null })),
    ...SCHOOL_COMPOSITION_MATRIX.map((combo) => ({ label: combo.join(" + "), majors: combo, minor: null })),
    { label: "BIOL + MIS-MIN (minor)", majors: ["BIOL"], minor: "MIS-MIN" },
  ];
  let schoolCompositionErrors = 0;
  for (const c of compositionCases) {
    const [primary, ...rest] = c.majors;
    const tree = buildNormalizedRequirements({
      profile: { ...syntheticProfile(getMajorCollege(primary!) ?? "CAS", primary!, c.minor), additionalMajors: rest } as StudentProfileRow,
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    }).tree;
    const found = auditSchoolComposition(tree, c.majors, c.label);
    schoolCompositionErrors += found.length;
    findings.push(...found);
  }

  // A key must identify one requirement across the whole catalog of a kind.
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!row.requirementKey) continue;
    const scope = `${row.programType}:${row.groupKey}:${row.requirementKey}`;
    const first = seen.get(scope);
    if (first !== undefined && first !== row.requirement && row.programType !== "major") {
      findings.push({
        code: "stable_key_reused",
        category: "data_integrity",
        severity: "error",
        programType: row.programType,
        program: row.program,
        group: row.group,
        groupKey: row.groupKey,
        requirement: row.requirement,
        requirementKey: row.requirementKey,
        message: `The stable key is also used by "${first}".`,
      });
    }
    seen.set(scope, row.requirement);
  }

  const byCategory: Record<AuditCategory, number> = { data_integrity: 0, missing_provenance: 0, academic_content: 0 };
  const bySeverity: Record<AuditSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) {
    byCategory[f.category] += 1;
    bySeverity[f.severity] += 1;
  }
  return {
    generatedAt: now.toISOString(),
    provider,
    counts: {
      majors: majors.length,
      minors: minors.length,
      collegeGroups,
      majorsWithConcentrations,
      concentrations,
      classificationErrors: findings.filter((f) => CLASSIFICATION_CODES.has(f.code)).length,
      groups,
      requirements: rows.filter((r) => r.requirementKey).length,
      choiceRequirements: choiceCoverage.requirements,
      choiceLists: choiceCoverage.lists,
      choiceListsWithCourses: choiceCoverage.nonEmptyLists,
      emptyChoiceLists: choiceCoverage.emptyLists,
      structuredMajorSources: majors.filter((major) => MAJOR_STRUCTURES[major.code]).length,
      sourceRepresentationMismatches: findings.filter((f) => SOURCE_REPRESENTATION_MISMATCH_CODES.has(f.code)).length,
      majorsWithoutUpperDivisionCourseEvidence: findings.filter((f) => f.code === "major_without_upper_division_course_evidence").length,
      schoolCompositionCases: compositionCases.length,
      schoolCompositionErrors,
      findings: findings.length,
      byCategory,
      bySeverity,
      missingProvenanceGroups,
    },
    findings,
    rows,
  };
}

/** Finding codes from the multi-school composition check. */
export const SCHOOL_COMPOSITION_CODES = new Set([
  "lsb_major_missing_school_group",
  "lsb_group_without_lsb_major",
  "school_groups_mismatch",
  "duplicate_school_group",
  "university_core_duplicated",
  "school_requirement_categorized_as_major",
  "core_annotation_outside_core",
  "major_school_unknown",
]);

/**
 * Checks one plan's tree against the schools its MAJORS belong to (from the
 * program catalog): every school group present exactly once, no other, one
 * University Core, school requirements filed as SCHOOL, and school Core
 * statements only on Core items. Exported so tests can feed it planted trees.
 */
export function auditSchoolComposition(tree: Tree, majors: readonly string[], label: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const add = (code: string, message: string, node?: Tree[number], requirement?: { label: string; stableKey: string }) =>
    findings.push({
      code,
      category: "data_integrity",
      severity: "error",
      programType: "college",
      program: label,
      group: node?.group.title ?? "",
      groupKey: node?.stableKey ?? "",
      requirement: requirement?.label ?? null,
      requirementKey: requirement?.stableKey ?? null,
      message,
    });

  const expected = new Set<College>();
  for (const major of majors) {
    const school = getMajorCollege(major);
    if (school) expected.add(school);
    else add("major_school_unknown", `${major} has no school in the program catalog; its school requirements cannot be composed.`);
  }
  const schoolNodes = tree.filter((g) => g.group.kind === "college");
  const counts = new Map<string, number>();
  for (const node of schoolNodes) counts.set(node.stableKey, (counts.get(node.stableKey) ?? 0) + 1);
  for (const [key, n] of counts) if (n > 1) add("duplicate_school_group", `The school group ${key} appears ${n} times.`);
  const actual = new Set([...counts.keys()]);
  const wanted = new Set([...expected].map((c) => `college-${c.toLowerCase()}`));
  if (wanted.has("college-lsb") && !actual.has("college-lsb")) add("lsb_major_missing_school_group", "A Leavey business major is in the plan but the Leavey School requirements are not.");
  if (!wanted.has("college-lsb") && actual.has("college-lsb")) add("lsb_group_without_lsb_major", "The Leavey School requirements are shown but no Leavey major is in the plan.");
  const others = (set: Set<string>) => [...set].filter((k) => k !== "college-lsb").sort().join(",");
  if (expected.size > 0 && others(actual) !== others(wanted)) {
    add("school_groups_mismatch", `School groups ${[...actual].sort().join(", ") || "(none)"} do not match the majors' schools ${[...wanted].sort().join(", ")}.`);
  }
  const cores = tree.filter((g) => g.group.kind === "university_core");
  if (cores.length !== 1) add("university_core_duplicated", `The plan has ${cores.length} University Core groups; it must have exactly one.`);

  for (const node of tree) {
    if (node.group.kind === "college" && node.category !== "SCHOOL") add("school_requirement_categorized_as_major", `A school group is filed as ${node.category}.`, node);
    for (const { item, stableKey } of node.items) {
      const ref = { label: item.label, stableKey };
      if (node.category === "MAJOR" && /^lsb-/.test(item.id)) add("school_requirement_categorized_as_major", "A Leavey School requirement is listed as a major requirement.", node, ref);
      const annotations = (item as { annotations?: unknown[] }).annotations;
      if (annotations && annotations.length > 0 && node.category !== "CORE") add("core_annotation_outside_core", "A school Core fulfillment statement is attached outside the University Core.", node, ref);
    }
  }
  return findings;
}

/** Cross-school combinations the composition audit always checks (primary first). */
export const SCHOOL_COMPOSITION_MATRIX: string[][] = [
  ["BIOL", "FNCE"],
  ["FNCE", "BIOL"],
  ["MECH", "FNCE"],
  ["FNCE", "MECH"],
  ["FNCE", "MKTG"],
  ["BIOL", "MECH"],
  ["CSCI", "ACTG"],
  ["ECON_CAS", "ECON"],
];

/** A plan-level check (used by tests, never by the catalog audit): customizations that no longer match. */
export function auditPlanCustomizations(tree: Tree, rows: StoredCustomization[]): { code: string; targetKey: string; message: string }[] {
  const out = findOrphanedCustomizations(tree, rows).map((o) => ({
    code: "override_missing_source",
    targetKey: o.targetKey,
    message: o.reason === "program_not_in_plan" ? "The customization belongs to a program that is not in this plan." : "The customization refers to a requirement the source no longer has.",
  }));
  const current = new Map(tree.flatMap((g) => g.items.map((i) => [i.stableKey, i.fingerprint] as const)));
  for (const row of rows) {
    if (row.entryType === "source_edit" && current.has(row.targetKey) && current.get(row.targetKey) !== row.baseFingerprint) {
      out.push({ code: "override_source_changed", targetKey: row.targetKey, message: "The source requirement changed since this was customized." });
    }
  }
  return out;
}

/** Finding codes that mean a requirement is in the wrong category. */
export const CLASSIFICATION_CODES = new Set([
  "core_requirement_under_major",
  "university_rule_under_major",
  "major_requirement_under_core",
  "core_item_without_phase",
  "university_rule_with_courses",
]);

const csvCell = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function auditRowsToCsv(rows: AuditRow[]): string {
  const columns: (keyof AuditRow)[] = [
    "programType", "program", "group", "groupKey", "requirement", "requirementKey", "courses",
    "provider", "source", "sourceUrl", "sourceVersion", "lastVerified", "provenanceStatus",
    "section", "variant", "requirementRule", "choiceMinimum", "choiceListCount", "nonEmptyChoiceListCount", "choiceEligibleCourseCount",
    "warnings",
  ];
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(String(r[c] ?? ""))).join(","))].join("\n") + "\n";
}

export function auditFindingsToCsv(findings: AuditFinding[]): string {
  const columns: (keyof AuditFinding)[] = ["category", "severity", "code", "programType", "program", "group", "requirement", "requirementKey", "message"];
  return [columns.join(","), ...findings.map((f) => columns.map((c) => csvCell(String(f[c] ?? ""))).join(","))].join("\n") + "\n";
}

const markdownCell = (value: string | number) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** A concise, review-friendly companion to the JSON and spreadsheet exports. */
export function auditReportToMarkdown(report: AuditReport): string {
  const { counts } = report;
  const byKind = new Map<string, number>();
  for (const finding of report.findings) {
    const key = `${finding.category}/${finding.severity}/${finding.code}`;
    byKind.set(key, (byKind.get(key) ?? 0) + 1);
  }
  const kindRows = [...byKind.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `| ${markdownCell(kind)} | ${count} |`);
  return [
    "# CampusVal requirements audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This is a structural and source-representation audit. It never modifies academic data, does not read student records, and does not claim department/professor academic approval.",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    `| Active source | ${markdownCell(report.provider)} |`,
    `| Majors | ${counts.majors} |`,
    `| Minors | ${counts.minors} |`,
    `| Named concentrations/tracks | ${counts.concentrations} in ${counts.majorsWithConcentrations} majors |`,
    `| Requirement groups | ${counts.groups} |`,
    `| Requirements | ${counts.requirements} |`,
    `| Choice/alternative requirements | ${counts.choiceRequirements} |`,
    `| Named choice lists/options | ${counts.choiceLists} |`,
    `| Choice lists/options with courses | ${counts.choiceListsWithCourses} |`,
    `| Empty choice lists/options | ${counts.emptyChoiceLists} |`,
    `| Structured Bulletin sources compared | ${counts.structuredMajorSources} |`,
    `| Normalized/source representation mismatches | ${counts.sourceRepresentationMismatches} |`,
    `| Majors without upper-division course evidence | ${counts.majorsWithoutUpperDivisionCourseEvidence} |`,
    `| Classification errors | ${counts.classificationErrors} |`,
    `| Multi-school composition cases checked | ${counts.schoolCompositionCases} |`,
    `| Multi-school composition errors | ${counts.schoolCompositionErrors} |`,
    `| Missing-provenance groups | ${counts.missingProvenanceGroups} |`,
    `| Findings — errors | ${counts.bySeverity.error} |`,
    `| Findings — warnings | ${counts.bySeverity.warning} |`,
    `| Findings — info | ${counts.bySeverity.info} |`,
    "",
    "## Findings by kind",
    "",
    "| Finding | Count |",
    "| --- | ---: |",
    ...(kindRows.length > 0 ? kindRows : ["| None | 0 |"]),
    "",
    "The companion CSV files contain every requirement and finding. Choice coverage columns show the rule type, minimum, list count, non-empty list count, and eligible-course count for spreadsheet proofing. Run with `--db` against an approved database to add the separate, read-only Department Notes and Sample Plans audit.",
    "",
  ].join("\n");
}
