import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable, type StudentProfileRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildRequirementGroups,
  UNIVERSITY_DEGREE_RULES,
  SOURCES,
  SCHOOL_NAME,
  type PlanProgramContext,
  type RequirementGroupDef,
  type RequirementItemDef,
  type SchoolCoreFulfillmentDef,
} from "../data/degree-requirements";
import {
  getMajorRequirements,
  getMinorRequirements,
  getMajorCollege,
  getMajorTitle,
  type College,
} from "../data/graduation-paths";
import { COURSES, findCourse } from "../data/courses";
import {
  MAJOR_STRUCTURES,
  resolveMajorStructure,
  validVariant,
  type StructuredChoice,
} from "../data/major-structures";
import { categoryOfGroupKind, type RequirementCategory } from "../lib/requirements-source/category";
import type { StructureVariants } from "../data/majors/model";
import { logger } from "../lib/logger";
import { CORE_AREA_BY_REQUIREMENT } from "../data/core-areas";
import {
  resolveCrossSatisfaction,
  type RequirementStatus,
} from "../lib/core-cross-satisfaction";

/**
 * Every requirement item — Core, major, minor or Professional Preparation —
 * reports the same shape, so the response is one uniform contract and a
 * planned course reads the same way wherever it appears.
 */
interface ResolvedRequirementItem {
  id: string;
  label: string;
  description: string;
  courses: string[];
  phase: "Foundations" | "Explorations" | "Integrations" | null;
  autoTracked: boolean;
  needsVerification: boolean;
  satisfiedBy: string[];
  plannedBy: string[];
  crossSatisfiedBy: string[];
  /** Canonical Core area whose catalog courses satisfy this item, when one is mapped. */
  coreArea?: { tag: string; code: string; courseCount: number; catalogStatedCount: number } | null;
  status: RequirementStatus;
  complete: boolean;
  /** The Bulletin heading the requirement sits under within its group ("Upper-division themes"). */
  section?: string | null;
  /** How a choice requirement is satisfied and which named course lists it draws on. */
  choice?: StructuredChoice | null;
  /** The track / emphasis / concentration the requirement belongs to, when only one does. */
  variant?: string | null;
  /** A requirement CampusVal cannot count from course codes: the student tracks it. */
  manual?: boolean;
  /**
   * A school's own statement about how its students fulfil this University
   * Core area (Leavey: "Social Science: ECON 1"), with its source. It explains
   * a relationship; completion still comes from course evidence.
   */
  annotations?: RequirementAnnotation[];
}

/** A school's Core fulfillment statement, as the sidebar shows it under a Core item. */
export interface RequirementAnnotation {
  id: string;
  kind: "school_core_fulfillment";
  school: College;
  schoolName: string;
  text: string;
  /** Every course the statement names as a route (empty: guidance only). */
  courses: string[];
  /** The course sets, one of which satisfies the area ("MGMT 162 with MGMT 136, MGMT 6 or PHIL 109"). */
  routes: { label: string; parts: string[][] }[];
  /** Who it applies to, when SCU narrows it ("Accounting majors"); null for every student of the school. */
  programScope: string | null;
  /** Ids of the school's own requirements the same course satisfies ("lsb-econ1"). */
  schoolRequirementIds: string[];
  /** Where the student stands on this statement's routes. */
  status: RequirementStatus;
  sourceLabel: string;
  sourceUrl: string;
  academicYear: string;
  lastVerified: string;
}

const router: IRouter = Router();

type ProfessionalPlanningGoal = {
  id: string;
  name: string;
  notes: string;
  courseCodes: string[];
  placeholders: string[];
};

const COLLEGE_CODE: Record<string, College> = {
  "School of Engineering": "SOE",
  "Leavey School of Business": "LSB",
  "College of Arts and Sciences": "CAS",
  "School of Education and Counseling Psychology": "CAS",
};

// Display name for a college code, used when a plan-scoped primary major moves
// the effective college to a different school than the profile's.
const COLLEGE_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * How many catalog courses carry the Core area a requirement maps to — or
 * null when the requirement has no mapping (e.g. Pathways), so the UI can say
 * so instead of offering an empty or invented list. Counts are computed once,
 * lazily, from the same derived tags course search filters on.
 */
let coreAreaCounts: Map<string, { total: number; stated: number }> | null = null;
function coreAreaSummaryFor(itemId: string) {
  const def = CORE_AREA_BY_REQUIREMENT.get(itemId);
  if (!def) return null;
  if (!coreAreaCounts) {
    coreAreaCounts = new Map();
    for (const c of COURSES) {
      for (const tag of c.coreAreas ?? []) {
        const e = coreAreaCounts.get(tag) ?? { total: 0, stated: 0 };
        e.total += 1;
        if (c.coreAreaSources?.[tag] === "catalog_text") e.stated += 1;
        coreAreaCounts.set(tag, e);
      }
    }
  }
  const c = coreAreaCounts.get(def.tag) ?? { total: 0, stated: 0 };
  return { tag: def.tag, code: def.code, courseCount: c.total, catalogStatedCount: c.stated };
}

/** A route is completed when every part has a completed course; planned when every part is completed or planned. */
function routeStatus(parts: string[][], completed: Set<string>, planned: Set<string>): RequirementStatus {
  const has = (set: Set<string>) => (part: string[]) => part.some((c) => set.has(normalize(c)));
  if (parts.every(has(completed))) return "completed";
  if (parts.every((part) => has(completed)(part) || has(planned)(part))) return "planned";
  return "open";
}

/**
 * A University Core item with the plan's schools' fulfillment statements laid
 * over it. Explicit statements (the school names the course) win over the
 * catalog's derived Core tagging; a derived match is still reported, flagged
 * for verification, for courses outside the statements. A planned course is
 * never reported as completed, and naming a school's route never completes it.
 */
function resolveCoreItem(
  item: RequirementItemDef,
  fulfillments: SchoolCoreFulfillmentDef[],
  completed: Set<string>,
  planned: Set<string>,
): ResolvedRequirementItem {
  const routeCourses = [...new Set(fulfillments.flatMap((f) => f.routes.flatMap((r) => r.parts.flat())))];
  const routeSet = new Set(routeCourses.map(normalize));
  // The derived Core-tag match only looks at courses the statements do not name.
  const cross = resolveCrossSatisfaction(
    item.id,
    item.courses,
    new Set([...completed].filter((c) => !routeSet.has(c))),
    new Set([...planned].filter((c) => !routeSet.has(c))),
  );
  const routeResults = fulfillments.flatMap((f) => f.routes.map((r) => ({ route: r, status: routeStatus(r.parts, completed, planned) })));
  const onRoute = (status: RequirementStatus, set: Set<string>) => [
    ...new Set(routeResults.filter((r) => r.status === status).flatMap((r) => r.route.parts.flat()).filter((c) => set.has(normalize(c)))),
  ];
  const explicitCompleted = onRoute("completed", completed);
  const explicitPlanned = onRoute("planned", planned);
  const status: RequirementStatus =
    explicitCompleted.length > 0 || cross.status === "completed"
      ? "completed"
      : explicitPlanned.length > 0 || cross.status === "planned"
        ? "planned"
        : "open";
  const definitive = fulfillments.some((f) => f.definitive && f.routes.length > 0);
  const restsOnExplicit = explicitCompleted.length > 0 || (status === "planned" && explicitPlanned.length > 0);
  const annotations: RequirementAnnotation[] = fulfillments.map((f) => {
    const statuses = f.routes.map((r) => routeStatus(r.parts, completed, planned));
    return {
      id: f.id,
      kind: "school_core_fulfillment",
      school: f.school,
      schoolName: SCHOOL_NAME[f.school],
      text: f.text,
      courses: [...new Set(f.routes.flatMap((r) => r.parts.flat()))],
      routes: f.routes.map((r) => ({ label: r.label, parts: r.parts })),
      programScope: f.programScope,
      schoolRequirementIds: f.schoolRequirementIds,
      status: statuses.includes("completed") ? "completed" : statuses.includes("planned") ? "planned" : "open",
      sourceLabel: f.sourceLabel,
      sourceUrl: f.sourceUrl,
      academicYear: f.academicYear,
      lastVerified: f.lastVerified,
    };
  });
  const courses = [...new Set([...item.courses, ...routeCourses])];
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    courses,
    phase: item.phase ?? null,
    autoTracked: courses.length > 0 || cross.crossSatisfiedBy.length > 0,
    // A school statement that IS the requirement needs no manual check; a match
    // resting only on derived catalog tagging always does.
    needsVerification: restsOnExplicit ? !definitive : (item.needsVerification && !definitive) || cross.needsVerification,
    satisfiedBy: [...new Set([...explicitCompleted, ...cross.satisfiedBy])],
    plannedBy: status === "completed" ? cross.plannedBy : [...new Set([...explicitPlanned, ...cross.plannedBy])],
    crossSatisfiedBy: cross.crossSatisfiedBy,
    coreArea: coreAreaSummaryFor(item.id),
    status,
    complete: status === "completed",
    section: null,
    choice: null,
    ...(annotations.length > 0 ? { annotations } : {}),
  };
}

/** A school requirement with course-set routes ("OMIS 41, or ECON 41 and ECON 42"). */
function resolveRoutedItem(
  item: RequirementItemDef & { routes: NonNullable<RequirementItemDef["routes"]> },
  completed: Set<string>,
  planned: Set<string>,
): ResolvedRequirementItem {
  const statuses = item.routes.map((r) => routeStatus(r.courses.map((c) => [c]), completed, planned));
  const status: RequirementStatus = statuses.includes("completed") ? "completed" : statuses.includes("planned") ? "planned" : "open";
  const satisfiedBy = item.courses.filter((c) => completed.has(normalize(c)));
  const plannedBy = item.courses.filter((c) => !completed.has(normalize(c)) && planned.has(normalize(c)));
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    courses: item.courses,
    phase: item.phase ?? null,
    autoTracked: true,
    needsVerification: item.needsVerification,
    // Only a satisfied route counts as completion evidence: a lone ECON 41 does not complete it.
    satisfiedBy: status === "completed" ? satisfiedBy : [],
    plannedBy,
    crossSatisfiedBy: [],
    coreArea: null,
    status,
    complete: status === "completed",
    section: null,
    choice: {
      kind: "alternatives",
      minimum: null,
      minDistinctLists: null,
      completedCount: satisfiedBy.length,
      plannedCount: plannedBy.length,
      lists: [],
      alternatives: item.routes.map((r, index) => ({ label: r.label, courses: r.courses, recommended: index === 0 })),
    },
  };
}

function resolveGroup(
  group: RequirementGroupDef,
  completed: Set<string>,
  planned: Set<string> = new Set(),
  fulfillments: SchoolCoreFulfillmentDef[] = [],
) {
  const items = group.items.map((item): ResolvedRequirementItem => {
    if (group.kind === "university_core") {
      return resolveCoreItem(item, fulfillments.filter((f) => f.coreItemId === item.id), completed, planned);
    }
    if (item.routes && item.routes.length > 0) {
      return resolveRoutedItem({ ...item, routes: item.routes }, completed, planned);
    }
    const cross = resolveCrossSatisfaction(
      item.id,
      item.courses,
      completed,
      planned,
    );
    // A requirement is auto-tracked when SCU names its courses, OR when a
    // course the student has completed/planned carries the matching Core
    // designation — that is what makes a major course count for Core.
    const autoTracked =
      item.courses.length > 0 || cross.crossSatisfiedBy.length > 0;
    const coreArea = coreAreaSummaryFor(item.id);
    return {
      id: item.id,
      label: item.label,
      description: item.description,
      courses: item.courses,
      phase: item.phase ?? null,
      autoTracked,
      // Keep the requirement's own verification flag, but also raise it when
      // the only evidence is the catalog's derived Core-area tagging.
      needsVerification: item.needsVerification || cross.needsVerification,
      satisfiedBy: cross.satisfiedBy,
      // Planned courses are NEVER reported as completed.
      plannedBy: cross.plannedBy,
      crossSatisfiedBy: cross.crossSatisfiedBy,
      coreArea,
      status: cross.status,
      complete: cross.status === "completed",
      section: null,
      choice: null,
    } satisfies ResolvedRequirementItem;
  });
  const autoItems = items.filter((i) => i.autoTracked);
  return {
    id: group.id,
    title: group.title,
    kind: group.kind,
    category: categoryOfGroupKind(group.kind),
    sourceUrl: group.sourceUrl,
    sourceLabel: group.sourceLabel,
    academicYear: group.academicYear,
    lastVerified: group.lastVerified,
    notes: group.notes,
    items,
    autoTrackedCount: autoItems.length,
    autoCompletedCount: autoItems.filter((i) => i.complete).length,
    manualCount: items.length - autoItems.length,
    school: null as GroupSchool | null,
  };
}

/**
 * One group of the response. Every group has the same shape, whatever built it,
 * so a consumer can read `school` or an item's `annotations` on any of them.
 */
export interface ResolvedRequirementGroup {
  id: string;
  title: string;
  kind: "university" | "university_core" | "college" | "major" | "minor" | "professional_prep";
  category: RequirementCategory;
  sourceUrl: string | null;
  sourceLabel: string;
  academicYear: string;
  lastVerified: string;
  notes: string[];
  items: ResolvedRequirementItem[];
  autoTrackedCount: number;
  autoCompletedCount: number;
  manualCount: number;
  /** SCHOOL groups: the school and the plan majors that bring it in. Null for every other group. */
  school: GroupSchool | null;
  variants?: {
    major: string;
    kind: StructureVariants["kind"];
    required: boolean;
    options: StructureVariants["options"];
    selected: string | null;
    note: string | null;
  } | null;
}

/** Gives a builder's group the common shape (`school` is null unless it is a SCHOOL group). */
const asGroup = (group: Omit<ResolvedRequirementGroup, "school"> & { school?: GroupSchool | null }): ResolvedRequirementGroup => ({
  ...group,
  school: group.school ?? null,
});

/** Which school a SCHOOL group belongs to and which of the plan's majors bring it in. */
export interface GroupSchool {
  code: College;
  name: string;
  /** The plan's majors from this school, as titles ("Finance (B.S. Commerce)"). */
  activatedBy: string[];
}

/** One school the plan's majors belong to. */
export interface PlanSchool {
  code: College;
  name: string;
  /** The plan's majors from this school (codes as the plan stores them). */
  majors: string[];
  /** The school of the plan's primary major. */
  primary: boolean;
  /**
   * program_catalog: the major's school in CampusVal's program catalog.
   * profile_college: the primary major is not in the catalog, so the school is
   * the one the student chose at onboarding (never a guess).
   */
  basis: "program_catalog" | "profile_college";
}

/** Canonical major code for program rules ("COEN" is the old code of "CSE"). */
const majorCode = (major: string) => (major.trim().toUpperCase() === "COEN" ? "CSE" : major.trim());
/** Canonical minor code, whether the plan stored the code or the title. */
const minorCode = (minor: string) => getMinorRequirements(minor)?.code ?? minor.trim();

/**
 * Builds the full requirement-groups response for a student profile, given
 * optional plan-scoped scenario majors/minors. Shared by GET /requirements
 * and by server-side placeholder-replacement validation (POST
 * /plans/:id/items/:itemId/replace) so both use the exact same requirement
 * resolution — a course is only ever "eligible" for a requirement if it
 * appears here.
 */
export function buildRequirementsResponse(
  profile: StudentProfileRow,
  scenarioMajors: string[] = [],
  scenarioMinors: string[] = [],
  professionalGoals: ProfessionalPlanningGoal[] = [],
  /**
   * Course codes the student has PLANNED (from the active Degree Plan or
   * Tentative Degree Plan). Used so a major course that carries a Core
   * designation marks the Core requirement as planned rather than leaving it
   * open and pushing the student toward a duplicate course. Plan-scoped, so
   * a tentative scenario never affects the Degree Plan's requirement view.
   */
  plannedCourses: string[] = [],
  /**
   * Plan-scoped PRIMARY major override (a major code). When set, it REPLACES
   * the profile's onboarding major as the primary major these requirements are
   * built for — the whole point of "Set / Change Primary Major" in Plan
   * Controls. It is planning intent only: it never mutates the profile or the
   * Workday APR. Passed from the active plan's `programs.primaryMajor`
   * (Degree Plan or the specific Tentative scenario), so a tentative scenario's
   * major never bleeds into the Degree Plan's requirement view.
   */
  primaryMajorOverride: string | null = null,
  /**
   * allVariants: resolve every track / emphasis of a major (a department's program tree, which must
   * show every requirement a note can attach to) instead of the student's own choice.
   */
  options: { allVariants?: boolean } = {},
) {
  const declaredMajor = profile.major;
  const effectivePrimaryMajor =
    (primaryMajorOverride ?? "").trim().slice(0, 120) || declaredMajor;
  const primaryMajorChanged =
    normalize(effectivePrimaryMajor) !== normalize(declaredMajor);

  // When the effective primary major belongs to a different school/college
  // than the profile, that college's own University Core / college
  // requirements apply. Majors without a loaded recipe fall back to the
  // profile college rather than guessing.
  const overrideCollege = primaryMajorChanged
    ? getMajorCollege(effectivePrimaryMajor)
    : null;
  const collegeCode: College =
    overrideCollege ?? COLLEGE_CODE[profile.college] ?? "CAS";
  const effectiveCollegeName = overrideCollege
    ? COLLEGE_NAME[collegeCode]
    : profile.college;
  const completed = new Set(
    (profile.completedCourseCodes ?? []).map(normalize),
  );
  // Planned courses that are already completed are just completed.
  const planned = new Set(
    plannedCourses.map(normalize).filter((c) => !completed.has(c)),
  );

  const profileDeclaredMajors = new Set(
    [profile.major, profile.secondMajor, ...(profile.additionalMajors ?? [])]
      .filter((m): m is string => !!m)
      .map(normalize),
  );
  // The effective primary major leads. The old profile primary is REPLACED
  // (not kept as an extra) when overridden, so changing the primary major
  // swaps that program's requirements without deleting second majors, minors,
  // or professional preparation.
  const declaredMajors = [
    effectivePrimaryMajor,
    profile.secondMajor,
    ...(profile.additionalMajors ?? []),
    ...scenarioMajors,
  ].filter((m, idx, arr): m is string => !!m && arr.indexOf(m) === idx);
  const declaredMinors = [
    profile.minor,
    ...(profile.additionalMinors ?? []),
    ...scenarioMinors,
  ].filter(
    (m, idx, arr): m is string => !!m && arr.indexOf(m) === idx,
  );

  // The plan's SCHOOLS: every school any of its majors belongs to, primary
  // first, each once. School requirements come from MAJORS only: a minor in a
  // school does not bring that school's requirements (a business minor is not
  // the Leavey core). The school is read from the program catalog, never from a
  // course prefix (Leavey ECON and CAS ECON_CAS are different programs).
  const schools: PlanSchool[] = [];
  const schoolWarnings: string[] = [];
  declaredMajors.forEach((major, index) => {
    const catalogSchool = getMajorCollege(majorCode(major));
    let school: College;
    let basis: PlanSchool["basis"] = "program_catalog";
    if (catalogSchool) {
      school = catalogSchool;
    } else if (index === 0) {
      // Backward compatible: a primary major CampusVal does not know keeps the
      // school chosen at onboarding, which is the student's own record.
      school = collegeCode;
      basis = "profile_college";
      schoolWarnings.push(
        `CampusVal does not have ${major} in its program catalog, so its school is taken from your profile (${COLLEGE_NAME[collegeCode]}). Confirm your school's requirements with your advisor.`,
      );
    } else {
      schoolWarnings.push(
        `CampusVal does not know which school ${major} belongs to, so no school requirements are shown for it. Confirm them with SCU or your advisor.`,
      );
      logger.warn({ event: "requirements_major_school_unknown" }, "a plan major has no school in the program catalog");
      return;
    }
    const existing = schools.find((s) => s.code === school);
    if (existing) existing.majors.push(major);
    else schools.push({ code: school, name: COLLEGE_NAME[school], majors: [major], primary: index === 0, basis });
  });
  if (schools.length === 0) {
    // No majors at all (an incomplete profile): the profile's school, as before.
    schools.push({ code: collegeCode, name: COLLEGE_NAME[collegeCode], majors: [], primary: true, basis: "profile_college" });
  }
  const programs: PlanProgramContext = {
    majors: declaredMajors.map(majorCode),
    minors: declaredMinors.map(minorCode),
  };

  const { university, universityCore, schools: schoolDefs, coreFulfillments } = buildRequirementGroups(
    collegeCode,
    schools.map((s) => s.code),
    programs,
  );
  const schoolGroups = schoolDefs.map((def, index) => {
    const school = schools[index]!;
    return {
      ...resolveGroup(def, completed, planned),
      school: {
        code: school.code,
        name: school.name,
        activatedBy: school.majors.map((m) => getMajorTitle(majorCode(m)) ?? m),
      } satisfies GroupSchool,
    };
  });

  const majorSourceUrlFor = (major: string) => {
    const school = getMajorCollege(majorCode(major)) ?? collegeCode;
    return school === "SOE"
      ? SOURCES.engineeringBulletin
      : school === "LSB"
        ? SOURCES.leaveyBulletin
        : SOURCES.casBulletin;
  };

  // Build a requirement group for a declared major from the recipe system.
  // Majors without verified recipes get an honest empty group (no invented
  // requirements), pointing students at the Bulletin.
  const buildMajorGroup = (majorName: string, idSuffix: string, isScenarioOnly: boolean) => {
    const scenarioNote = isScenarioOnly
      ? ["Planning only — official declaration must be completed through SCU. CampusVal does not declare majors."]
      : [];
    const majorReqs = getMajorRequirements(
      majorName,
      profile.completedCourseCodes ?? [],
      (code) => {
        const c = findCourse(code);
        return c
          ? { code: c.code, title: c.title, units: c.units, description: c.description }
          : undefined;
      },
    );
    if (!majorReqs) {
      return {
        id: `major-${idSuffix}`,
        title: `Major Requirements — ${majorName}${isScenarioOnly ? " (proposed)" : ""}`,
        kind: "major" as const,
        category: categoryOfGroupKind("major"),
        sourceUrl: majorSourceUrlFor(majorName),
        sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
        academicYear: universityCore.academicYear,
        lastVerified: universityCore.lastVerified,
        notes: [
          ...scenarioNote,
          `Course-by-course requirements for ${majorName} aren't loaded in CampusVal yet. Check the SCU Bulletin and your department advisor.`,
        ],
        items: [] as ResolvedRequirementItem[],
        autoTrackedCount: 0,
        autoCompletedCount: 0,
        manualCount: 0,
      };
    }
    const concentrationNote =
      majorReqs.concentrations.length > 0 && !MAJOR_STRUCTURES[majorReqs.major]?.variants
        ? [
            `This major has official concentrations/tracks: ${majorReqs.concentrations
              .map((c) => c.title)
              .join(", ")}. Requirement course lists aren't loaded for concentrations yet — see the official source for exact requirements.`,
          ]
        : [];
    // getMajorRequirements ends with an informational "University Core (areas)"
    // group whose entries are Core area NAMES with a fake course code ("Critical
    // Thinking & Writing 1"), meant for the graduation-paths page. They are not
    // major requirements: the University Core has its own group in this sidebar,
    // the recipe's own totals already leave them out, and no course can ever
    // satisfy them here. They are left out of the major group.
    const structure = MAJOR_STRUCTURES[majorReqs.major];
    if (structure) {
      // The Bulletin's own structure: themes, "choose N" lists, alternative sequences, the student's
      // track, and requirements the student tracks; each course counted toward one requirement only.
      const chosenTrack = validVariant(structure, profile.majorTracks?.[majorReqs.major]);
      const resolved = resolveMajorStructure(structure, profile.completedCourseCodes ?? [], [...planned], {
        variant: chosenTrack,
        allVariants: options.allVariants,
      });
      const items: ResolvedRequirementItem[] = resolved.map((r) => {
        const course = r.course ? findCourse(r.course) : undefined;
        return {
          id: `major-${idSuffix}-${r.key}`,
          label: r.course ? (course ? `${r.course} — ${course.title}` : r.course) : r.label,
          description: r.course
            ? `${r.description}${course ? ` · ${course.units} unit${course.units === 1 ? "" : "s"}` : " · not in CampusVal's course catalog — verify in the Bulletin"}`
            : [r.description, ...r.notes].join(" "),
          courses: r.courses,
          phase: null,
          // A requirement the student tracks is never counted from courses, so never "complete" here.
          autoTracked: !r.manual,
          needsVerification: r.manual,
          satisfiedBy: r.satisfiedBy,
          plannedBy: r.plannedBy,
          crossSatisfiedBy: [] as string[],
          status: r.status as RequirementStatus,
          complete: r.status === "completed",
          section: r.section,
          choice: r.choice,
          variant: r.variant,
          manual: r.manual,
        };
      });
      const variants = structure.variants
        ? {
            major: majorReqs.major,
            kind: structure.variants.kind,
            required: structure.variants.required,
            options: structure.variants.options,
            selected: chosenTrack,
            note: structure.variants.note ?? null,
          }
        : null;
      const trackNote = variants
        ? [
            chosenTrack
              ? `Showing the ${variants.options.find((o) => o.key === chosenTrack)!.label} requirements.`
              : variants.required
                ? `This major requires one ${variants.kind}. Choose yours to see its requirements.`
                : `Optional ${variants.kind}s: ${variants.options.map((o) => o.label).join("; ")}. Choose one to add its requirements.`,
          ]
        : [];
      return {
        id: `major-${idSuffix}`,
        title: `Major Requirements — ${majorReqs.title}${isScenarioOnly ? " (proposed)" : ""}`,
        kind: "major" as const,
        category: categoryOfGroupKind("major"),
        sourceUrl: structure.sourceUrl,
        sourceLabel: structure.sourceLabel,
        academicYear: structure.catalogYear,
        lastVerified: structure.lastVerified,
        // The reference listing's catalog-gap note covers every track's courses; here each item says it itself.
        notes: [...scenarioNote, ...trackNote, ...majorReqs.notes.filter((n) => !/not in our current catalog snapshot/.test(n)), ...concentrationNote],
        items,
        variants,
        // Counted per sidebar item, like every other group (the department layer recounts the same way).
        autoTrackedCount: items.filter((i) => i.autoTracked).length,
        autoCompletedCount: items.filter((i) => i.autoTracked && i.complete).length,
        manualCount: items.filter((i) => !i.autoTracked).length,
      };
    }
    const majorItemGroups = majorReqs.groups.filter((g) => !g.courses.every((c) => c.category === "university-core"));
    const usedItemIds = new Map<string, number>();
    return {
      id: `major-${idSuffix}`,
      title: `Major Requirements — ${majorReqs.title}${isScenarioOnly ? " (proposed)" : ""}`,
      kind: "major" as const,
      category: categoryOfGroupKind("major"),
      sourceUrl: majorSourceUrlFor(majorName),
      sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
      academicYear: universityCore.academicYear,
      lastVerified: universityCore.lastVerified,
      notes: [...scenarioNote, ...majorReqs.notes, ...concentrationNote],
      items: majorItemGroups.flatMap((g) =>
        g.courses.map((c) => {
          const isPlanned = !c.completed && planned.has(normalize(c.code));
          // A course the recipe lists under two headings (e.g. MATH 11 in both
          // the math sequence and the lower division) keeps its original id
          // the first time and gets a numbered one after, so no two items in a
          // group share an id.
          const baseId = `major-${idSuffix}-${c.code.replace(/\s+/g, "-").toLowerCase()}`;
          const seen = (usedItemIds.get(baseId) ?? 0) + 1;
          usedItemIds.set(baseId, seen);
          return {
            id: seen === 1 ? baseId : `${baseId}-${seen}`,
            label: `${c.code} — ${c.title}`,
            description: `${g.label} · ${c.units} unit${c.units === 1 ? "" : "s"}`,
            courses: [c.code],
            phase: null,
            autoTracked: true,
            needsVerification: false,
            satisfiedBy: c.completed ? [c.code] : [],
            plannedBy: isPlanned ? [c.code] : [],
            crossSatisfiedBy: [] as string[],
            status: (c.completed
              ? "completed"
              : isPlanned
                ? "planned"
                : "open") as RequirementStatus,
            complete: c.completed,
            section: g.label,
            choice: null,
          };
        }),
      ),
      autoTrackedCount: majorReqs.totalListed,
      autoCompletedCount: majorReqs.completedCount,
      manualCount: 0,
    };
  };

  const majorGroups = declaredMajors.map((m, idx) =>
    buildMajorGroup(
      m,
      idx === 0 ? "primary" : `extra-${idx}`,
      // The primary major group is the plan's planning primary, never a
      // "proposed" extra. Only additional majors keep the declared-vs-proposed
      // distinction.
      idx === 0 ? false : !profileDeclaredMajors.has(normalize(m)),
    ),
  );
  // Truthful planning note on the primary group when the student is planning
  // around a major other than the one on their profile / Workday APR record.
  if (primaryMajorChanged && majorGroups[0]) {
    const primaryTitle =
      getMajorTitle(effectivePrimaryMajor) ?? effectivePrimaryMajor;
    majorGroups[0] = {
      ...majorGroups[0],
      notes: [
        `Planning major — you're planning around ${primaryTitle} in CampusVal. This updates your CampusVal plan only; your official SCU declaration and Workday APR are unchanged. Verify any formal major change with SCU or your advisor.`,
        ...majorGroups[0].notes,
      ],
    };
  }

  // Minor recipes use the same centralized requirement pipeline as majors,
  // including the server-side placeholder eligibility check.
  const profileDeclaredMinors = new Set(
    [profile.minor, ...(profile.additionalMinors ?? [])]
      .filter((m): m is string => !!m)
      .map(normalize),
  );
  const minorGroups = declaredMinors.map((minorName, idx) => {
    const isScenarioOnly = !profileDeclaredMinors.has(normalize(minorName));
    const scenarioNote = isScenarioOnly
      ? ["Planning only — official declaration must be completed through SCU. CampusVal does not declare minors."]
      : [];
    const recipe = getMinorRequirements(minorName);
    if (!recipe) {
      return {
        id: `minor-${idx}`,
        title: `Minor Requirements — ${minorName}${isScenarioOnly ? " (proposed)" : ""}`,
        kind: "minor" as const,
        category: categoryOfGroupKind("minor"),
        sourceUrl: SOURCES.casBulletin,
        sourceLabel: "SCU Undergraduate Bulletin (minor department chapter)",
        academicYear: universityCore.academicYear,
        lastVerified: universityCore.lastVerified,
        notes: [
          ...scenarioNote,
          `Requirements not yet verified for the ${minorName} minor. CampusVal will not invent eligible courses; verify the official SCU Bulletin and your department.`,
        ],
        items: [] as ResolvedRequirementItem[],
        autoTrackedCount: 0,
        autoCompletedCount: 0,
        manualCount: 0,
      };
    }
    const items = recipe.groups.flatMap((group, groupIndex) => {
      const minimum = group.minimumCourses ?? (group.courses.length || 1);
      if (group.minimumCourses !== undefined || group.courses.length === 0) {
        const satisfiedBy = group.courses.filter((course) => completed.has(normalize(course)));
        const plannedHere = group.courses.filter(
          (course) =>
            !completed.has(normalize(course)) && planned.has(normalize(course)),
        );
        const isComplete =
          group.courses.length > 0 && satisfiedBy.length >= minimum;
        return [{
          id: `minor-${recipe.code}-${groupIndex + 1}`,
          label: group.minimumUnits
            ? `${group.label} — ${group.minimumUnits} units minimum`
            : `${group.label} — choose ${minimum}`,
          description: group.notes?.join(" ") ?? "Verify approved-course and overlap rules in the official SCU Bulletin.",
          courses: group.courses,
          phase: null,
          autoTracked: group.courses.length > 0,
          needsVerification: group.needsVerification ?? false,
          satisfiedBy,
          plannedBy: plannedHere,
          crossSatisfiedBy: [] as string[],
          status: (isComplete
            ? "completed"
            : plannedHere.length > 0
              ? "planned"
              : "open") as RequirementStatus,
          complete: isComplete,
          section: null as string | null,
          choice:
            group.courses.length > 0
              ? {
                  kind: "choose" as const,
                  minimum: group.minimumUnits ? null : minimum,
                  minDistinctLists: null,
                  completedCount: Math.min(satisfiedBy.length, minimum),
                  plannedCount: plannedHere.length,
                  lists: [{ key: "eligible", label: group.label, note: null, courses: group.courses, max: null }],
                  alternatives: [],
                }
              : null,
        }];
      }
      return group.courses.map((course) => {
        const isCompleted = completed.has(normalize(course));
        const isPlanned = !isCompleted && planned.has(normalize(course));
        return {
          id: `minor-${recipe.code}-${groupIndex + 1}-${course.replace(/\s+/g, "-").toLowerCase()}`,
          label: course,
          description: group.label,
          courses: [course],
          phase: null,
          autoTracked: true,
          needsVerification: group.needsVerification ?? false,
          satisfiedBy: isCompleted ? [course] : [],
          plannedBy: isPlanned ? [course] : [],
          crossSatisfiedBy: [] as string[],
          status: (isCompleted
            ? "completed"
            : isPlanned
              ? "planned"
              : "open") as RequirementStatus,
          complete: isCompleted,
          section: null,
          choice: null,
        } satisfies ResolvedRequirementItem;
      });
    });
    const autoItems = items.filter((item) => item.autoTracked);
    return {
      id: `minor-${recipe.code.toLowerCase()}`,
      title: `Minor Requirements — ${recipe.title}${isScenarioOnly ? " (proposed)" : ""}`,
      kind: "minor" as const,
      category: categoryOfGroupKind("minor"),
      sourceUrl: recipe.sourceUrl,
      sourceLabel: recipe.sourceLabel,
      academicYear: recipe.catalogYear,
      lastVerified: recipe.lastVerified,
      notes: [...scenarioNote, ...recipe.notes],
      items,
      autoTrackedCount: autoItems.length,
      autoCompletedCount: autoItems.filter((item) => item.complete).length,
      manualCount: items.length - autoItems.length,
    };
  });
  const professionalPreparation = professionalGoals.map((goal) => {
    const courseItems = goal.courseCodes.map((courseCode) => {
      const isCompleted = completed.has(normalize(courseCode));
      const isPlanned = !isCompleted && planned.has(normalize(courseCode));
      return {
        id: `professional-${goal.id}-${courseCode.replace(/\s+/g, "-").toLowerCase()}`,
        label: `${courseCode} — student-selected planning course`,
        description: `Student planning goal: ${goal.name}. Not an official SCU graduation requirement.`,
        courses: [courseCode],
        phase: null,
        autoTracked: true,
        needsVerification: false,
        satisfiedBy: isCompleted ? [courseCode] : [],
        plannedBy: isPlanned ? [courseCode] : [],
        crossSatisfiedBy: [] as string[],
        status: (isCompleted
          ? "completed"
          : isPlanned
            ? "planned"
            : "open") as RequirementStatus,
        complete: isCompleted,
        section: null,
        choice: null,
      } satisfies ResolvedRequirementItem;
    });
    const placeholderItems = goal.placeholders.map((label, index) => ({
      id: `professional-${goal.id}-placeholder-${index + 1}`,
      label,
      description: `Manual planning placeholder for ${goal.name}. Not an official SCU graduation requirement.`,
      courses: [] as string[],
      phase: null,
      autoTracked: false,
      needsVerification: true,
      satisfiedBy: [] as string[],
      plannedBy: [] as string[],
      crossSatisfiedBy: [] as string[],
      status: "open" as RequirementStatus,
      complete: false,
      section: null,
      choice: null,
    }) satisfies ResolvedRequirementItem);
    const items = [...courseItems, ...placeholderItems];
    return {
      id: `professional-${goal.id}`,
      title: `Professional Preparation — ${goal.name}`,
      kind: "professional_prep" as const,
      category: categoryOfGroupKind("professional_prep"),
      sourceUrl: null,
      sourceLabel: "Student planning goal",
      academicYear: universityCore.academicYear,
      lastVerified: universityCore.lastVerified,
      notes: [
        "Student planning goal — not an official SCU graduation requirement.",
        ...(goal.notes ? [goal.notes] : []),
      ],
      items,
      autoTrackedCount: courseItems.length,
      autoCompletedCount: courseItems.filter((item) => item.complete).length,
      manualCount: placeholderItems.length,
    };
  });

  return {
    college: effectiveCollegeName,
    collegeCode,
    major: effectivePrimaryMajor ?? null,
    declaredMajor: declaredMajor ?? null,
    universityRules: {
      rules: UNIVERSITY_DEGREE_RULES,
      sourceUrl: SOURCES.degreeRequirements,
      sourceLabel: "SCU Bulletin Ch. 8: Degree Requirements",
    },
    // Every school the plan's majors belong to (primary first). The groups
    // below hold one SCHOOL group per entry.
    schools,
    schoolWarnings,
    // Requirement order the professor asked for: the fundamentals a student
    // must graduate with come first, and the optional extras come last, so
    // second majors / minors / professional goals never sit above the primary
    // major, University Core, or the schools' own requirements. One University
    // Core, whatever the number of schools; one group per school.
    groups: [
      ...majorGroups.slice(0, 1),
      resolveGroup(universityCore, completed, planned, coreFulfillments),
      ...schoolGroups,
      resolveGroup(university, completed, planned),
      ...majorGroups.slice(1),
      ...minorGroups,
      ...professionalPreparation,
    ].map(asGroup),
  };
}

/**
 * Course codes the student has planned. This was parsed with the scenario-program
 * list, which stops at 10 entries: a plan with more than ten courses had every
 * course after the tenth ignored when marking Core requirements "planned". That
 * limit was meant for the short list of proposed majors and minors, not courses.
 */
function parseCourseList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 500);
}

function parseScenarioList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function parseProfessionalGoals(raw: unknown): ProfessionalPlanningGoal[] {
  if (typeof raw !== "string" || raw.length > 20_000) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((goal): goal is Record<string, unknown> => !!goal && typeof goal === "object" && !Array.isArray(goal))
      .slice(0, 8)
      .flatMap((goal) => {
        if (
          typeof goal.id !== "string" ||
          typeof goal.name !== "string" ||
          !Array.isArray(goal.courseCodes) ||
          !Array.isArray(goal.placeholders)
        ) return [];
        return [{
          id: goal.id,
          name: goal.name,
          notes: typeof goal.notes === "string" ? goal.notes : "",
          courseCodes: goal.courseCodes.filter((value): value is string => typeof value === "string"),
          placeholders: goal.placeholders.filter((value): value is string => typeof value === "string"),
        }];
      });
  } catch {
    return [];
  }
}

router.get("/requirements", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);
  const profile = rows[0];
  if (!profile) {
    return res.status(404).json({ error: "Complete onboarding first." });
  }

  // The source of the sidebar is named in one place (lib/requirements-source).
  // Only the response is sent; where each group came from stays on the server.
  const { buildRequirements } = await import("../lib/requirements-source");
  const { response } = buildRequirements({
    profile,
    scenarioMajors: parseScenarioList(req.query.scenarioMajors),
    scenarioMinors: parseScenarioList(req.query.scenarioMinors),
    professionalGoals: parseProfessionalGoals(req.query.professionalGoals),
    plannedCourses: parseCourseList(req.query.plannedCourses),
    primaryMajor: typeof req.query.primaryMajor === "string" ? req.query.primaryMajor : null,
  });
  res.json(response);
});

export default router;
