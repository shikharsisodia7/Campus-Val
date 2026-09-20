import { describe, it, expect } from "vitest";
import type { ParsedProgressReport, ProgressReport } from "@workspace/api-client-react";
import {
  courseLists,
  deriveAprState,
  errorStatus,
  filterGroupsForView,
  kindOfGroup,
  normalizeReportCode,
  orderGroups,
  regroupForDisplay,
  reviewSummary,
  tallyGroups,
  universityRows,
} from "./apr-model";

type Groups = NonNullable<ParsedProgressReport["groups"]>;

const req = (name: string, status: any, extra: object = {}) => ({ name, status, courses: [], ...extra });

const groups: Groups = [
  { name: "Mathematics Minor Requirements", kind: "minor", order: 5, requirements: [
    req("University Requirement: Must have a minimum 2.000 Cumulative GPA", "completed", { scope: "university" }),
    req("Minor Core", "remaining", { scope: "program" }),
  ] },
  { name: "Computer Science Major Requirements", kind: "major", order: 0, requirements: [
    req("University Requirement: Must have a minimum 2.000 Cumulative GPA", "completed", { scope: "university" }),
    req("University Requirement: Must complete 180 units", "in_progress", { scope: "university", unit: "total", requiredUnits: 180 }),
    req("Lower Division Core", "completed", { scope: "program" }),
    req("Upper Division Elective", "remaining", { scope: "program" }),
    req("Mystery row", "needs_review", { scope: "program", sourceText: "Mystery row ???" }),
  ] },
  { name: "University Core Curriculum Requirements", kind: "core", order: 2, requirements: [
    req("Critical Thinking & Writing 1", "completed"),
    req("Ethics", "in_progress"),
  ] },
  { name: "College of Arts and Sciences Requirements", requirements: [req("Second language", "remaining")] },
];

describe("display ordering", () => {
  it("orders Core → Major → Minor → Other regardless of source order, keeping source order within a kind", () => {
    expect(orderGroups(groups).map((g) => g.group.name)).toEqual([
      "University Core Curriculum Requirements",
      "Computer Science Major Requirements",
      "Mathematics Minor Requirements",
      "College of Arts and Sciences Requirements",
    ]);
  });

  it("keeps each group's ORIGINAL index so test ids and open-state stay stable", () => {
    expect(orderGroups(groups).map((g) => g.index)).toEqual([2, 1, 0, 3]);
  });

  it("classifies a legacy group (stored before `kind` existed) from its heading", () => {
    expect(kindOfGroup({ name: "Physics Minor Requirements", requirements: [] })).toBe("minor");
    expect(kindOfGroup({ name: "Core Requirements", requirements: [] })).toBe("core");
    expect(kindOfGroup({ name: "Pathway Requirements", requirements: [] })).toBe("other");
  });
});

describe("tallies count each requirement once, excluding the repeated university-wide rows", () => {
  it("tallies program rows only", () => {
    expect(tallyGroups(groups)).toEqual({ completed: 2, in_progress: 1, remaining: 3, needs_review: 1, total: 7 });
  });
});

describe("university-wide rows", () => {
  it("are listed once even though Workday repeats them, and unit rows are left to the Units section", () => {
    const rows = universityRows(groups);
    expect(rows.map((r) => r.name)).toEqual(["University Requirement: Must have a minimum 2.000 Cumulative GPA"]);
  });
});

describe("Still needed filter", () => {
  it("drops completed rows and any group left with nothing outstanding", () => {
    const filtered = filterGroupsForView(orderGroups(groups), "needed");
    const names = filtered.map((g) => g.group.name);
    expect(names).toContain("University Core Curriculum Requirements"); // Ethics still in progress
    const core = filtered.find((g) => g.kind === "core")!;
    expect(core.group.requirements.map((r) => r.name)).toEqual(["Ethics"]);
    expect(filterGroupsForView(orderGroups([{ name: "X Major Requirements", requirements: [req("Done", "completed")] }]), "needed")).toEqual([]);
  });

  it("'all' leaves everything", () => {
    expect(filterGroupsForView(orderGroups(groups), "all")).toHaveLength(4);
  });
});

describe("review summary", () => {
  it("collects needs_review rows (with their source line) and unmatched course-like tokens", () => {
    const r = reviewSummary({
      completedCourses: [], possibleCourses: [{ raw: "ZXQW 999" }], notes: [], groups,
    } as ParsedProgressReport);
    expect(r.items).toEqual([{ where: "Computer Science Major Requirements", name: "Mystery row", sourceText: "Mystery row ???" }]);
    expect(r.unrecognized).toEqual(["ZXQW 999"]);
    expect(r.count).toBe(2);
  });
});

describe("course lists never carry grades", () => {
  it("returns code + title only for completed and in-progress", () => {
    const lists = courseLists({
      completedCourses: [{ code: "CSCI 10", title: "Intro", units: 5, confidence: "high" }],
      nonCompletedCourses: [
        { code: "CSEN 12", title: "ADT", units: 4, status: "in_progress" },
        { code: "PHYS 31", title: "Physics", units: 5, status: "needs_review" },
      ],
      possibleCourses: [], notes: [],
    } as ParsedProgressReport);
    expect(lists.completed).toEqual([{ code: "CSCI 10", title: "Intro" }]);
    expect(lists.inProgress).toEqual([{ code: "CSEN 12", title: "ADT" }]);
    expect(JSON.stringify(lists)).not.toMatch(/grade/i);
  });
});

describe("deriveAprState — every state the professor asked for", () => {
  const report = (over: Partial<ProgressReport> = {}): ProgressReport => ({
    id: 1, fileName: "a.pdf", fileSize: 1, contentType: "application/pdf", uploadedAt: "2026-09-01T00:00:00Z",
    createdAt: "", updatedAt: "", parseStatus: "parsed",
    parsed: { completedCourses: [], possibleCourses: [], notes: [], groups },
    ...over,
  });
  const derive = (over: Parameters<typeof deriveAprState>[0]) => deriveAprState(over).kind;

  it("loading, then no report (200 null OR 404), unauthorized, error", () => {
    expect(derive({ isLoading: true, envelope: undefined, error: null })).toBe("loading");
    expect(derive({ isLoading: false, envelope: { available: true, report: null }, error: null })).toBe("none");
    expect(derive({ isLoading: false, envelope: undefined, error: { status: 404 } })).toBe("none");
    expect(derive({ isLoading: false, envelope: undefined, error: { status: 401 } })).toBe("unauthorized");
    expect(derive({ isLoading: false, envelope: undefined, error: { status: 403 } })).toBe("unauthorized");
    expect(derive({ isLoading: false, envelope: undefined, error: { status: 500 } })).toBe("error");
    expect(derive({ isLoading: false, envelope: undefined, error: new Error("network") })).toBe("error");
  });

  it("uploads not configured", () => {
    expect(derive({ isLoading: false, envelope: { available: false, report: null }, error: null })).toBe("storage_unavailable");
  });

  it("pending (processing), failed, unsupported", () => {
    for (const parseStatus of ["pending", "failed", "unsupported"] as const) {
      expect(derive({ isLoading: false, envelope: { available: true, report: report({ parseStatus }) }, error: null })).toBe(parseStatus);
    }
  });

  it("parsed but nothing recognizable → no_structure (never a blank panel)", () => {
    const s = deriveAprState({ isLoading: false, error: null, envelope: { available: true, report: report({ parsed: { completedCourses: [], possibleCourses: [], notes: [] } }) } });
    expect(s.kind).toBe("no_structure");
  });

  it("parsed → ready, carrying the review count and whether the original file is gone", () => {
    const ok = deriveAprState({ isLoading: false, error: null, envelope: { available: true, report: report() } });
    expect(ok).toMatchObject({ kind: "ready", reviewCount: 1, sourceMissing: false });
    const gone = deriveAprState({ isLoading: false, error: null, envelope: { available: true, report: report({ sourceFile: "missing" }) } });
    expect(gone).toMatchObject({ kind: "ready", sourceMissing: true });
  });

  it("a payload without parseStatus but with a parse is still ready", () => {
    const r = { ...report(), parseStatus: undefined } as unknown as ProgressReport;
    expect(derive({ isLoading: false, envelope: { available: true, report: r }, error: null })).toBe("ready");
  });

  it("keeps showing cached data while a refetch is in flight", () => {
    expect(derive({ isLoading: true, envelope: { available: true, report: report() }, error: null })).toBe("ready");
  });

  it("errorStatus reads a numeric status only", () => {
    expect(errorStatus({ status: 403 })).toBe(403);
    expect(errorStatus({ status: "403" })).toBeUndefined();
    expect(errorStatus(null)).toBeUndefined();
  });
});

describe("regroupForDisplay — Core rows live inside program blocks", () => {
  const core = (name: string, status: any, order: number) =>
    req(name, status, { category: "core", scope: "program", order });
  const college = (name: string, status: any, order: number) =>
    req(name, status, { category: "college", scope: "program", order });

  const repeated: Groups = [
    { name: "Finance Major Requirements", kind: "major", order: 0, requirements: [
      req("University Requirement: Must have a minimum 2.000 Cumulative GPA", "completed", { scope: "university", order: 1 }),
      core("Core: LSB: CTW 1", "completed", 2),
      core("Core: LSB: C&I 2", "remaining", 3),
      college("Leavey School of Business Core Knowledge: BUSN 70", "in_progress", 4),
      college("Leavey School of Business Core: Writing for Business: BUSN 179", "remaining", 5),
      req("Finance Major : FNCE 124", "remaining", { scope: "program", order: 6 }),
    ] },
    { name: "Mathematics Major Requirements", kind: "major", order: 7, requirements: [
      req("University Requirement: Must have a minimum 2.000 Cumulative GPA", "completed", { scope: "university", order: 8 }),
      core("Core: LSB: CTW 1", "completed", 9),
      core("Core: LSB: C&I 2", "remaining", 10),
      college("Leavey School of Business Core Knowledge: BUSN 70", "in_progress", 11),
      req("Mathematics Major : MATH 13", "remaining", { scope: "program", order: 12 }),
    ] },
    { name: "Real Estate Minor Requirements", kind: "minor", order: 13, requirements: [
      core("Core: LSB: CTW 1", "completed", 14),
      req("Real Estate Minor: FNCE 118", "remaining", { scope: "program", order: 15 }),
    ] },
  ];

  it("shows each Core row once when blocks in the same school repeat it", () => {
    const out = regroupForDisplay(repeated);
    const uc = out.find((g) => g.name === "University Core (LSB)")!;
    expect(uc.requirements.map((r) => r.name)).toEqual(["Core: LSB: CTW 1", "Core: LSB: C&I 2"]);
    expect(uc.section).toBe("core");
    expect(uc.order).toBe(2);
  });

  it("gives the school's own Core rows one section named from the rows themselves", () => {
    const out = regroupForDisplay(repeated);
    const school = out.find((g) => g.section === "college")!;
    expect(school.name).toBe("Leavey School of Business Core");
    expect(school.requirements.map((r) => r.name)).toEqual([
      "Leavey School of Business Core Knowledge: BUSN 70",
      "Leavey School of Business Core: Writing for Business: BUSN 179",
    ]);
  });

  it("leaves program rows in their own block and drops blocks left empty", () => {
    const out = regroupForDisplay(repeated);
    const finance = out.find((g) => g.name === "Finance Major Requirements")!;
    expect(finance.requirements.map((r) => r.name)).toEqual([
      "University Requirement: Must have a minimum 2.000 Cumulative GPA",
      "Finance Major : FNCE 124",
    ]);
    expect(out.find((g) => g.name === "Real Estate Minor Requirements")!.requirements).toHaveLength(1);
  });

  it("makes tallies count each requirement once instead of once per program block", () => {
    const flat = tallyGroups(repeated);
    const regrouped = tallyGroups(regroupForDisplay(repeated));
    // 2 core + 2 college + FNCE 124 + MATH 13 + FNCE 118 = 7 distinct program rows.
    expect(regrouped.total).toBe(7);
    expect(flat.total).toBeGreaterThan(regrouped.total);
    expect(regrouped.completed).toBe(1);
    expect(regrouped.in_progress).toBe(1);
    expect(regrouped.remaining).toBe(5);
  });

  it("orders University Core → School Core → Major → Minor", () => {
    const order = orderGroups(regroupForDisplay(repeated)).map((g) => g.kind);
    expect(order).toEqual(["core", "college", "major", "major", "minor"]);
  });

  it("never merges different schools' Core curricula (LSB vs CAS) — each keeps its own group", () => {
    const twoSchools: Groups = [
      { name: "Finance Major Requirements", kind: "major", order: 0, requirements: [
        core("Core: LSB: CTW 1", "completed", 1),
        core("Core: LSB: Advanced Writing", "remaining", 2),
      ] },
      { name: "Mathematics Major Requirements", kind: "major", order: 3, requirements: [
        core("Core: CAS: CTW 1", "completed", 4),
        core("Core: CAS: Ethics", "completed", 5),
        core("Core: CAS: Advanced Writing", "remaining", 6),
      ] },
    ];
    const out = regroupForDisplay(twoSchools);
    expect(out.map((g) => [g.name, g.requirements.length])).toEqual([
      ["University Core (LSB)", 2],
      ["University Core (CAS)", 3],
    ]);
    // Same-named rows in different schools are different requirements: both are tallied.
    expect(tallyGroups(out).total).toBe(5);
  });

  it("keeps two rows that DISAGREE about the same requirement instead of quietly choosing one", () => {
    const disagree: Groups = [
      { name: "A Major Requirements", kind: "major", requirements: [core("Core: LSB: CTW 1", "completed", 1)] },
      { name: "B Major Requirements", kind: "major", requirements: [core("Core: LSB: CTW 1", "remaining", 2)] },
    ];
    const uc = regroupForDisplay(disagree).find((g) => g.name === "University Core (LSB)")!;
    expect(uc.requirements.map((r) => r.status)).toEqual(["completed", "remaining"]);
  });

  it("passes reports with no categories (older parses, simple layouts) through untouched", () => {
    expect(regroupForDisplay(groups)).toEqual(groups);
  });

  it("is idempotent", () => {
    const once = regroupForDisplay(repeated);
    expect(regroupForDisplay(once).map((g) => [g.name, g.requirements.length])).toEqual(
      once.map((g) => [g.name, g.requirements.length]),
    );
  });

  it("lists a repeated needs-review Core row once in the review summary", () => {
    const parsed = {
      completedCourses: [],
      possibleCourses: [],
      notes: [],
      groups: [
        { name: "A Major Requirements", kind: "major", requirements: [core("Core: LSB: Mystery", "needs_review", 1)] },
        { name: "B Major Requirements", kind: "major", requirements: [core("Core: LSB: Mystery", "needs_review", 2)] },
      ],
    } as unknown as ParsedProgressReport;
    expect(reviewSummary(parsed).items).toHaveLength(1);
  });
});

describe("reviewSummary with the student's own mappings", () => {
  const parsed = (raws: string[]) =>
    ({ completedCourses: [], possibleCourses: raws.map((raw) => ({ raw })), notes: [], groups: [] }) as unknown as ParsedProgressReport;
  const map = (rawCode: string, courseCode = "ENGL 1A") => ({ rawCode, courseCode, courseTitle: "Critical Thinking and Writing I" });

  it("normalizes report codes the way the server does", () => {
    expect(normalizeReportCode("engl2a")).toBe("ENGL 2A");
    expect(normalizeReportCode("  ENGL   2A ")).toBe("ENGL 2A");
    expect(normalizeReportCode("TESP4")).toBe("TESP 4");
  });

  it("without mappings every unrecognized token still needs verifying", () => {
    const r = reviewSummary(parsed(["ENGL 2A", "TESP 4"]));
    expect(r.unrecognized).toEqual(["ENGL 2A", "TESP 4"]);
    expect(r.mapped).toEqual([]);
    expect(r.count).toBe(2);
  });

  it("a mapped token leaves the verify list and the count, and appears under 'mapped'", () => {
    const r = reviewSummary(parsed(["ENGL 2A", "TESP 4"]), [map("ENGL 2A")]);
    expect(r.unrecognized).toEqual(["TESP 4"]);
    expect(r.mapped.map((m) => m.rawCode)).toEqual(["ENGL 2A"]);
    expect(r.count).toBe(1);
  });

  it("matches a mapping to a report token regardless of spacing or case", () => {
    const r = reviewSummary(parsed(["ENGL2A"]), [map("engl 2a")]);
    expect(r.unrecognized).toEqual([]);
    expect(r.mapped).toHaveLength(1);
  });

  it("ignores a stale mapping for a code the current report no longer lists", () => {
    const r = reviewSummary(parsed(["TESP 4"]), [map("PHYS 9")]);
    expect(r.mapped).toEqual([]);
    expect(r.unrecognized).toEqual(["TESP 4"]);
  });

  it("never turns a mapping into a completed course", () => {
    const p = parsed(["ENGL 2A"]);
    reviewSummary(p, [map("ENGL 2A")]);
    expect(p.completedCourses).toEqual([]);
  });
});
