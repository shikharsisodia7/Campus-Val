import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildRequirementGroups,
  UNIVERSITY_DEGREE_RULES,
  SOURCES,
  type RequirementGroupDef,
} from "../data/degree-requirements";
import { getMajorRequirements, type College } from "../data/graduation-paths";
import { findCourse } from "../data/courses";

const router: IRouter = Router();

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

  const collegeCode: College = COLLEGE_CODE[profile.college] ?? "CAS";
  const completed = new Set(
    (profile.completedCourseCodes ?? []).map(normalize),
  );

  const { universityCore, college } = buildRequirementGroups(collegeCode);

  // Major requirements from the recipe system, checked against completions.
  const majorReqs = profile.major
    ? getMajorRequirements(profile.major, profile.completedCourseCodes ?? [], (code) => {
        const c = findCourse(code);
        return c
          ? { code: c.code, title: c.title, units: c.units, description: c.description }
          : undefined;
      })
    : null;

  const majorGroup = majorReqs
    ? {
        id: "major",
        title: `Major Requirements — ${majorReqs.title}`,
        kind: "major" as const,
        sourceUrl:
          collegeCode === "SOE"
            ? SOURCES.engineeringBulletin
            : collegeCode === "LSB"
              ? SOURCES.leaveyBulletin
              : SOURCES.casBulletin,
        sourceLabel: "SCU Undergraduate Bulletin (major department chapter)",
        academicYear: universityCore.academicYear,
        lastVerified: universityCore.lastVerified,
        notes: majorReqs.notes,
        items: majorReqs.groups.flatMap((g) =>
          g.courses.map((c) => ({
            id: `major-${c.code.replace(/\s+/g, "-").toLowerCase()}`,
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
      }
    : null;

  res.json({
    college: profile.college,
    collegeCode,
    major: profile.major ?? null,
    universityRules: {
      rules: UNIVERSITY_DEGREE_RULES,
      sourceUrl: SOURCES.degreeRequirements,
      sourceLabel: "SCU Bulletin Ch. 8: Degree Requirements",
    },
    groups: [
      resolveGroup(universityCore, completed),
      resolveGroup(college, completed),
      ...(majorGroup ? [majorGroup] : []),
    ],
  });
});

export default router;
