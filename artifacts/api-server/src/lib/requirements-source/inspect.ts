/**
 * The provenance inspector: for one program, every group and requirement the
 * active source produces, with its stable key, fingerprint and provenance.
 * For CampusVal's maintainers and the professor while proofreading. It runs on
 * a synthetic profile, so it reads no student data.
 */
import type { StudentProfileRow } from "@workspace/db";
import { getAvailableMajors, getAvailableMinors, type College } from "../../data/graduation-paths";
import { buildNormalizedRequirements, requirementsSourceStatus } from "./index";

const COLLEGE_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

export function inspectProgramRequirements(majorCode: string, minorCode?: string | null) {
  const major = getAvailableMajors().find((m) => m.code === majorCode);
  if (!major) return null;
  const minor = minorCode ? getAvailableMinors().find((m) => m.code === minorCode) : null;
  if (minorCode && !minor) return null;
  const profile = {
    id: 0,
    userId: "requirements-inspector",
    name: "Requirements Inspector",
    studentType: "undergraduate",
    college: COLLEGE_NAME[major.college],
    major: major.code,
    secondMajor: null,
    minor: minor?.title ?? null,
    additionalMajors: [],
    additionalMinors: [],
    completedCourseCodes: [],
  } as unknown as StudentProfileRow;
  const { tree, provider } = buildNormalizedRequirements({
    profile,
    scenarioMajors: [],
    scenarioMinors: [],
    professionalGoals: [],
    plannedCourses: [],
    primaryMajor: null,
  });
  return {
    source: requirementsSourceStatus(),
    provider,
    program: { major: major.code, majorTitle: major.title, minor: minor?.code ?? null },
    groups: tree.map((node) => ({
      stableKey: node.stableKey,
      responseId: node.group.id,
      title: node.group.title,
      kind: node.group.kind,
      displayOrder: node.displayOrder,
      provenance: node.provenance,
      items: node.items.map((entry) => ({
        stableKey: entry.stableKey,
        responseId: entry.item.id,
        fingerprint: entry.fingerprint,
        label: entry.item.label,
        courses: entry.item.courses,
      })),
    })),
  };
}
