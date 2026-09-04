import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable, type StudentProfileRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildRequirementGroups,
  UNIVERSITY_DEGREE_RULES,
  SOURCES,
  type RequirementGroupDef,
} from "../data/degree-requirements";
import { getMajorRequirements, getMinorRequirements, type College } from "../data/graduation-paths";
import { findCourse } from "../data/courses";
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
  status: RequirementStatus;
  complete: boolean;
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

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

function resolveGroup(
  group: RequirementGroupDef,
  completed: Set<string>,
  planned: Set<string> = new Set(),
) {
  const items = group.items.map((item) => {
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
      status: cross.status,
      complete: cross.status === "completed",
    };
  });
  const autoItems = items.filter((i) => i.autoTracked);
  return {
    id: group.id,
    title: group.title,
    kind: group.kind,
    sourceUrl: group.sourceUrl,
    sourceLabel: group.sourceLabel,
    academicYear: group.academicYear,
    lastVerified: group.lastVerified,
    notes: group.notes,
    items,
    autoTrackedCount: autoItems.length,
    autoCompletedCount: autoItems.filter((i) => i.complete).length,
    manualCount: items.length - autoItems.length,
  };
}

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
) {
  const collegeCode: College = COLLEGE_CODE[profile.college] ?? "CAS";
  const completed = new Set(
    (profile.completedCourseCodes ?? []).map(normalize),
  );
  // Planned courses that are already completed are just completed.
  const planned = new Set(
    plannedCourses.map(normalize).filter((c) => !completed.has(c)),
  );

  const { universityCore, college } = buildRequirementGroups(collegeCode);

  const majorSourceUrl =
    collegeCode === "SOE"
      ? SOURCES.engineeringBulletin
      : collegeCode === "LSB"
        ? SOURCES.leaveyBulletin
        : SOURCES.casBulletin;

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
        sourceUrl: majorSourceUrl,
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
      majorReqs.concentrations.length > 0
        ? [
            `This major has official concentrations/tracks: ${majorReqs.concentrations
              .map((c) => c.title)
              .join(", ")}. Requirement course lists aren't loaded for concentrations yet — see the official source for exact requirements.`,
          ]
        : [];
    return {
      id: `major-${idSuffix}`,
      title: `Major Requirements — ${majorReqs.title}${isScenarioOnly ? " (proposed)" : ""}`,
      kind: "major" as const,
      sourceUrl: majorSourceUrl,
      sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
      academicYear: universityCore.academicYear,
      lastVerified: universityCore.lastVerified,
      notes: [...scenarioNote, ...majorReqs.notes, ...concentrationNote],
      items: majorReqs.groups.flatMap((g) =>
        g.courses.map((c) => {
          const isPlanned = !c.completed && planned.has(normalize(c.code));
          return {
            id: `major-${idSuffix}-${c.code.replace(/\s+/g, "-").toLowerCase()}`,
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
          };
        }),
      ),
      autoTrackedCount: majorReqs.totalListed,
      autoCompletedCount: majorReqs.completedCount,
      manualCount: 0,
    };
  };

  const profileDeclaredMajors = new Set(
    [profile.major, profile.secondMajor, ...(profile.additionalMajors ?? [])]
      .filter((m): m is string => !!m)
      .map(normalize),
  );
  const declaredMajors = [
    profile.major,
    profile.secondMajor,
    ...(profile.additionalMajors ?? []),
    ...scenarioMajors,
  ].filter((m, idx, arr): m is string => !!m && arr.indexOf(m) === idx);
  const majorGroups = declaredMajors.map((m, idx) =>
    buildMajorGroup(
      m,
      idx === 0 ? "primary" : `extra-${idx}`,
      !profileDeclaredMajors.has(normalize(m)),
    ),
  );

  // Minor recipes use the same centralized requirement pipeline as majors,
  // including the server-side placeholder eligibility check.
  const profileDeclaredMinors = new Set(
    [profile.minor, ...(profile.additionalMinors ?? [])]
      .filter((m): m is string => !!m)
      .map(normalize),
  );
  const declaredMinors = [
    profile.minor,
    ...(profile.additionalMinors ?? []),
    ...scenarioMinors,
  ].filter(
    (m, idx, arr): m is string => !!m && arr.indexOf(m) === idx,
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
        };
      });
    });
    const autoItems = items.filter((item) => item.autoTracked);
    return {
      id: `minor-${recipe.code.toLowerCase()}`,
      title: `Minor Requirements — ${recipe.title}${isScenarioOnly ? " (proposed)" : ""}`,
      kind: "minor" as const,
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
      };
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
    }));
    const items = [...courseItems, ...placeholderItems];
    return {
      id: `professional-${goal.id}`,
      title: `Professional Preparation — ${goal.name}`,
      kind: "professional_prep" as const,
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
    college: profile.college,
    collegeCode,
    major: profile.major ?? null,
    universityRules: {
      rules: UNIVERSITY_DEGREE_RULES,
      sourceUrl: SOURCES.degreeRequirements,
      sourceLabel: "SCU Bulletin Ch. 8: Degree Requirements",
    },
    // Requirement order the professor asked for: the fundamentals a student
    // must graduate with come first, and the optional extras come last, so
    // second majors / minors / professional goals never sit above the primary
    // major, University Core, or the college's own requirements.
    groups: [
      ...majorGroups.slice(0, 1),
      resolveGroup(universityCore, completed, planned),
      resolveGroup(college, completed, planned),
      ...majorGroups.slice(1),
      ...minorGroups,
      ...professionalPreparation,
    ],
  };
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

  res.json(
    buildRequirementsResponse(
      profile,
      parseScenarioList(req.query.scenarioMajors),
      parseScenarioList(req.query.scenarioMinors),
      parseProfessionalGoals(req.query.professionalGoals),
      parseScenarioList(req.query.plannedCourses),
    ),
  );
});

export default router;
