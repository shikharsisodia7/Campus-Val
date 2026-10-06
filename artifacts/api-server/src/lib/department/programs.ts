/**
 * The programs a department can maintain, and the requirement tree of one
 * program as a student with only that program would see it.
 *
 * A PROGRAM KEY is the stable key of the program's sidebar group
 * ("major:biology", "minor-biol-min"), so a scope, a note and a requirement
 * all use one vocabulary. Trees are built on a synthetic profile: nothing here
 * reads a student.
 */
import type { StudentProfileRow } from "@workspace/db";
import { getAvailableMajors, getAvailableMinors, type College } from "../../data/graduation-paths";
import { buildNormalizedRequirements, type NormalizedGroup } from "../requirements-source";

export type ProgramType = "major" | "minor";

export interface ProgramInfo {
  programKey: string;
  type: ProgramType;
  /** The recipe code ("BIOL", "ANTH-MIN"). */
  code: string;
  title: string;
  college: College;
  collegeName: string;
}

export const COLLEGE_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

function syntheticProfile(college: College, major: string, minor: string | null): StudentProfileRow {
  return {
    id: 0,
    userId: "department-program-tree",
    email: null,
    name: "Program tree",
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

export interface ProgramTree {
  program: ProgramInfo;
  edition: string | null;
  tree: NormalizedGroup[];
}

interface Built {
  info: ProgramInfo;
  tree: NormalizedGroup[];
  edition: string | null;
}

let cache: Map<string, Built> | null = null;

/** Reference data only changes with a deploy, so the trees are built once. */
function build(): Map<string, Built> {
  if (cache) return cache;
  const out = new Map<string, Built>();
  const majors = getAvailableMajors();
  const defaultMajor = majors[0]!;

  for (const major of majors) {
    const built = buildNormalizedRequirements({
      profile: syntheticProfile(major.college, major.code, null),
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    });
    const group = built.tree.find((g) => g.group.kind === "major");
    if (!group) continue;
    out.set(group.stableKey, {
      info: {
        programKey: group.stableKey,
        type: "major",
        code: major.code,
        title: major.title,
        college: major.college,
        collegeName: COLLEGE_NAME[major.college],
      },
      tree: built.tree,
      edition: built.edition,
    });
  }

  for (const minor of getAvailableMinors()) {
    // A minor sits beside a major of the same school, so the school's own
    // groups are present too. The major itself is irrelevant to the program.
    const host = majors.find((m) => m.college === minor.college) ?? defaultMajor;
    const built = buildNormalizedRequirements({
      profile: syntheticProfile(minor.college, host.code, minor.title),
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    });
    const group = built.tree.find((g) => g.group.kind === "minor");
    if (!group) continue;
    out.set(group.stableKey, {
      info: {
        programKey: group.stableKey,
        type: "minor",
        code: minor.code,
        title: minor.title,
        college: minor.college,
        collegeName: COLLEGE_NAME[minor.college],
      },
      tree: built.tree,
      edition: built.edition,
    });
  }
  cache = out;
  return out;
}

export function listPrograms(): ProgramInfo[] {
  return [...build().values()]
    .map((b) => b.info)
    .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
}

export function findProgram(programKey: string): ProgramInfo | null {
  return build().get(programKey)?.info ?? null;
}

export function programTree(programKey: string): ProgramTree | null {
  const built = build().get(programKey);
  return built ? { program: built.info, edition: built.edition, tree: built.tree } : null;
}

/** For tests that change reference data. */
export function resetProgramCache(): void {
  cache = null;
}

/** The program group's own key from any stable key inside it ("major:biology#chem-12" -> "major:biology"). */
export const groupKeyOf = (stableKey: string): string => stableKey.split("#")[0]!;

/**
 * Is `targetKey` something this program's note or override may attach to? Its
 * own group and items, or an item of the University Core / school / university
 * group its students also see (a Biology note about RTC 3).
 */
export function targetBelongsToProgram(tree: ProgramTree, targetKey: string): boolean {
  const groupKey = groupKeyOf(targetKey);
  const group = tree.tree.find((g) => g.stableKey === groupKey);
  if (!group) return false;
  if (targetKey === groupKey) return true;
  return group.items.some((i) => i.stableKey === targetKey);
}
