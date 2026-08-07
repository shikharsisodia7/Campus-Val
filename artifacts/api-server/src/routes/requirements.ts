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
        notes: `Course-by-course requirements for ${majorName} aren't loaded in CampusVal yet. Check the SCU Bulletin and your department advisor.`,
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

  const scenarioMajors = String(req.query.scenarioMajors ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  const scenarioMinors = String(req.query.scenarioMinors ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  const declaredMajors = [
    profile.major,
    profile.secondMajor,
    ...(profile.additionalMajors ?? []),
    ...scenarioMajors,
  ].filter((m, idx, arr): m is string => !!m && arr.indexOf(m) === idx);
  const majorGroups = declaredMajors.map((m, idx) =>
    buildMajorGroup(m, idx === 0 ? "primary" : `extra-${idx}`),
  );

  // Declared minors: CampusVal doesn't have verified course-by-course minor
  // requirements, so these groups are honest placeholders — no invented items.
  const declaredMinors = [
    profile.minor,
    ...(profile.additionalMinors ?? []),
    ...scenarioMinors,
  ].filter(
    (m, idx, arr): m is string => !!m && arr.indexOf(m) === idx,
  );
  const minorGroups = declaredMinors.map((minorName, idx) => ({
    id: `minor-${idx}`,
    title: `Minor Requirements — ${minorName}`,
    kind: "minor" as const,
    sourceUrl: SOURCES.casBulletin,
    sourceLabel: "SCU Undergraduate Bulletin (minor department chapter)",
    academicYear: universityCore.academicYear,
    lastVerified: universityCore.lastVerified,
    notes: `Course-by-course requirements for the ${minorName} minor aren't loaded in CampusVal yet. Check the SCU Bulletin and the minor's department advisor.`,
    items: [],
    autoTrackedCount: 0,
    autoCompletedCount: 0,
    manualCount: 0,
  }));
  const professionalPreparation = {
    id: "professional-preparation",
    title: "Professional Preparation",
    kind: "professional_prep" as const,
    sourceUrl: null,
    sourceLabel: "Student planning only",
    academicYear: universityCore.academicYear,
    lastVerified: universityCore.lastVerified,
    notes:
      "Student-added professional preparation goals are not official SCU graduation requirements. Verify professional-school prerequisites directly with that program.",
    items: [
      {
        id: "student-professional-preparation-goal",
        label: "Student-added professional preparation goal",
        description:
          "Use a placeholder to represent a professional-path course or prerequisite. This is planning-only, not an SCU degree requirement.",
        courses: [],
        phase: null,
        autoTracked: false,
        needsVerification: true,
        satisfiedBy: [],
        complete: false,
      },
    ],
    autoTrackedCount: 0,
    autoCompletedCount: 0,
    manualCount: 1,
  };

  res.json({
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
      professionalPreparation,
      resolveGroup(college, completed),
    ],
  });
});

export default router;
