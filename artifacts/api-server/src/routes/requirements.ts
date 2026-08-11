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
) {
  const items = group.items.map((item) => {
    const satisfiedBy = item.courses.filter((c) => completed.has(normalize(c)));
    const autoTracked = item.courses.length > 0;
    return {
      id: item.id,
      label: item.label,
      description: item.description,
      courses: item.courses,
      phase: item.phase ?? null,
      autoTracked,
      needsVerification: item.needsVerification,
      satisfiedBy,
      complete: autoTracked && satisfiedBy.length > 0,
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
) {
  const collegeCode: College = COLLEGE_CODE[profile.college] ?? "CAS";
  const completed = new Set(
    (profile.completedCourseCodes ?? []).map(normalize),
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
  const buildMajorGroup = (majorName: string, idSuffix: string) => {
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
        title: `Major Requirements — ${majorName}`,
        kind: "major" as const,
        sourceUrl: majorSourceUrl,
        sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
        academicYear: universityCore.academicYear,
        lastVerified: universityCore.lastVerified,
        notes: [
          `Course-by-course requirements for ${majorName} aren't loaded in CampusVal yet. Check the SCU Bulletin and your department advisor.`,
        ],
        items: [],
        autoTrackedCount: 0,
        autoCompletedCount: 0,
        manualCount: 0,
      };
    }
    return {
      id: `major-${idSuffix}`,
      title: `Major Requirements — ${majorReqs.title}`,
      kind: "major" as const,
      sourceUrl: majorSourceUrl,
      sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
      academicYear: universityCore.academicYear,
      lastVerified: universityCore.lastVerified,
      notes: majorReqs.notes,
      items: majorReqs.groups.flatMap((g) =>
        g.courses.map((c) => ({
          id: `major-${idSuffix}-${c.code.replace(/\s+/g, "-").toLowerCase()}`,
          label: `${c.code} — ${c.title}`,
          description: `${g.label} · ${c.units} unit${c.units === 1 ? "" : "s"}`,
          courses: [c.code],
          phase: null,
          autoTracked: true,
          needsVerification: false,
          satisfiedBy: c.completed ? [c.code] : [],
          complete: c.completed,
        })),
      ),
      autoTrackedCount: majorReqs.totalListed,
      autoCompletedCount: majorReqs.completedCount,
      manualCount: 0,
    };
  };

  const declaredMajors = [
    profile.major,
    profile.secondMajor,
    ...(profile.additionalMajors ?? []),
    ...scenarioMajors,
  ].filter((m, idx, arr): m is string => !!m && arr.indexOf(m) === idx);
  const majorGroups = declaredMajors.map((m, idx) =>
    buildMajorGroup(m, idx === 0 ? "primary" : `extra-${idx}`),
  );

  // Minor recipes use the same centralized requirement pipeline as majors,
  // including the server-side placeholder eligibility check.
  const declaredMinors = [
    profile.minor,
    ...(profile.additionalMinors ?? []),
    ...scenarioMinors,
  ].filter(
    (m, idx, arr): m is string => !!m && arr.indexOf(m) === idx,
  );
  const minorGroups = declaredMinors.map((minorName, idx) => {
    const recipe = getMinorRequirements(minorName);
    if (!recipe) {
      return {
        id: `minor-${idx}`,
        title: `Minor Requirements — ${minorName}`,
        kind: "minor" as const,
        sourceUrl: SOURCES.casBulletin,
        sourceLabel: "SCU Undergraduate Bulletin (minor department chapter)",
        academicYear: universityCore.academicYear,
        lastVerified: universityCore.lastVerified,
        notes: [
          `Requirements not yet verified for the ${minorName} minor. CampusVal will not invent eligible courses; verify the official SCU Bulletin and your department.`,
        ],
        items: [],
        autoTrackedCount: 0,
        autoCompletedCount: 0,
        manualCount: 0,
      };
    }
    const items = recipe.groups.flatMap((group, groupIndex) => {
      const minimum = group.minimumCourses ?? (group.courses.length || 1);
      if (group.minimumCourses !== undefined || group.courses.length === 0) {
        const satisfiedBy = group.courses.filter((course) => completed.has(normalize(course)));
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
          complete: group.courses.length > 0 && satisfiedBy.length >= minimum,
        }];
      }
      return group.courses.map((course) => ({
        id: `minor-${recipe.code}-${groupIndex + 1}-${course.replace(/\s+/g, "-").toLowerCase()}`,
        label: course,
        description: group.label,
        courses: [course],
        phase: null,
        autoTracked: true,
        needsVerification: group.needsVerification ?? false,
        satisfiedBy: completed.has(normalize(course)) ? [course] : [],
        complete: completed.has(normalize(course)),
      }));
    });
    const autoItems = items.filter((item) => item.autoTracked);
    return {
      id: `minor-${recipe.code.toLowerCase()}`,
      title: `Minor Requirements — ${recipe.title}`,
      kind: "minor" as const,
      sourceUrl: recipe.sourceUrl,
      sourceLabel: recipe.sourceLabel,
      academicYear: recipe.catalogYear,
      lastVerified: recipe.lastVerified,
      notes: recipe.notes,
      items,
      autoTrackedCount: autoItems.length,
      autoCompletedCount: autoItems.filter((item) => item.complete).length,
      manualCount: items.length - autoItems.length,
    };
  });
  const professionalPreparation = professionalGoals.map((goal) => {
    const courseItems = goal.courseCodes.map((courseCode) => ({
      id: `professional-${goal.id}-${courseCode.replace(/\s+/g, "-").toLowerCase()}`,
      label: `${courseCode} — student-selected planning course`,
      description: `Student planning goal: ${goal.name}. Not an official SCU graduation requirement.`,
      courses: [courseCode],
      phase: null,
      autoTracked: true,
      needsVerification: false,
      satisfiedBy: completed.has(normalize(courseCode)) ? [courseCode] : [],
      complete: completed.has(normalize(courseCode)),
    }));
    const placeholderItems = goal.placeholders.map((label, index) => ({
      id: `professional-${goal.id}-placeholder-${index + 1}`,
      label,
      description: `Manual planning placeholder for ${goal.name}. Not an official SCU graduation requirement.`,
      courses: [],
      phase: null,
      autoTracked: false,
      needsVerification: true,
      satisfiedBy: [],
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
    // Palette order: Major(s) first, then University Core, then Minor(s),
    // then professional planning-only goals, then college/school requirements.
    groups: [
      ...majorGroups,
      resolveGroup(universityCore, completed),
      ...minorGroups,
      ...professionalPreparation,
      resolveGroup(college, completed),
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
    ),
  );
});

export default router;
