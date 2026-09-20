import { describe, it, expect } from "vitest";
import type { ParsedProgressReport, ProgressReport } from "@workspace/api-client-react";
import {
  courseLists,
  deriveAprState,
  errorStatus,
  filterGroupsForView,
  kindOfGroup,
  orderGroups,
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
