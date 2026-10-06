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
import { getAvailableMajors, getAvailableMinors, getMajorRequirements, getMinorRequirements, type College } from "../../data/graduation-paths";
import { findCourse } from "../../data/courses";
import { buildNormalizedRequirements } from "./index";
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
  warnings: string;
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
    findings: number;
    byCategory: Record<AuditCategory, number>;
    bySeverity: Record<AuditSeverity, number>;
    missingProvenanceGroups: number;
  };
  findings: AuditFinding[];
  rows: AuditRow[];
}

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
): { findings: AuditFinding[]; rows: AuditRow[] } {
  const findings: AuditFinding[] = [];
  const rows: AuditRow[] = [];
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
        if (/\b(175|193) (quarter )?units\b|\bupper-division (quarter )?units\b|\bresidency\b|\b2\.0 GPA\b/i.test(`${item.label} ${item.description}`)) {
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
        warnings: "group_has_no_requirements",
      });
    }
  }
  return { findings, rows };
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
  }

  const schoolCourses = new Map<College, Set<string>>();
  for (const [college, major] of firstMajorOf) {
    const schoolGroup = build(college, major, null).find((g) => g.group.kind === "college");
    schoolCourses.set(college, new Set((schoolGroup?.items ?? []).flatMap((i) => i.item.courses.map(normalizeCode))));
  }

  for (const m of majors) {
    const tree = build(m.college, m.code, null).filter((g) => g.group.kind === "major");
    const overlap = new Set<string>();
    for (const node of tree) for (const i of node.items) for (const c of i.item.courses) if (schoolCourses.get(m.college)?.has(normalizeCode(c))) overlap.add(normalizeCode(c));
    if (overlap.size > 0 && tree[0]) {
      findings.push({
        code: "listed_in_school_and_major_groups",
        category: "academic_content",
        severity: "info",
        programType: "major",
        program: `${m.title} (${m.code})`,
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
    const result = auditTree(tree, "major", `${m.title} (${m.code})`, { universityCoreItemCourses: coreCoursesByCollege.get(m.college) });
    findings.push(...result.findings);
    rows.push(...result.rows);
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
      findings: findings.length,
      byCategory,
      bySeverity,
      missingProvenanceGroups,
    },
    findings,
    rows,
  };
}

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
    "provider", "source", "sourceUrl", "sourceVersion", "lastVerified", "provenanceStatus", "warnings",
  ];
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

export function auditFindingsToCsv(findings: AuditFinding[]): string {
  const columns: (keyof AuditFinding)[] = ["category", "severity", "code", "programType", "program", "group", "requirement", "requirementKey", "message"];
  return [columns.join(","), ...findings.map((f) => columns.map((c) => csvCell(String(f[c] ?? ""))).join(","))].join("\n") + "\n";
}
