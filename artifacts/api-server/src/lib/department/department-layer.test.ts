/**
 * The department layer as pure functions (no database), and the deterministic
 * checklist-note extractor.
 */
import { describe, it, expect } from "vitest";
import type { AprSheet } from "../apr/workbook-model";
import { applyDepartmentLayer, type LayerContext, type NoteRecord, type OverrideRecord } from "./layer";
import { courseCodesIn, extractChecklistNotes, isCodesOnly } from "./checklist-notes";
import { listPrograms, programTree } from "./programs";
import { composeRequirementOverlay } from "../requirements-source/overlay";

const biology = listPrograms().find((p) => p.type === "major" && p.title === "Biology")!;
const tree = programTree(biology.programKey)!;
const group = tree.tree.find((g) => g.stableKey === biology.programKey)!;
const first = group.items[0]!;
const second = group.items[1]!;

const ctx: LayerContext = {
  edition: "2026-27",
  programTitles: new Map([[biology.programKey, "Biology"]]),
  completed: new Set(),
  planned: new Set(),
};
const note = (over: Partial<NoteRecord> = {}): NoteRecord => ({
  id: 1,
  programKey: biology.programKey,
  targetKey: first.stableKey,
  bulletinEdition: "2026-27",
  body: "Take in the first year.",
  noteKind: "sequence",
  title: null,
  courseCodes: [],
  status: "published",
  origin: "admin",
  sourceLabel: "Biology department",
  sourceUrl: null,
  sourceReference: null,
  reviewedBy: "chair@scu.edu",
  updatedAt: new Date(0),
  ...over,
});
const override = (over: Partial<OverrideRecord> = {}): OverrideRecord => ({
  id: 1,
  programKey: biology.programKey,
  bulletinEdition: "2026-27",
  entryType: "edit",
  targetKey: first.stableKey,
  groupKey: null,
  title: null,
  description: null,
  hidden: false,
  courseCodes: [],
  minimumCourses: null,
  position: 0,
  baseFingerprint: first.fingerprint,
  baseTitle: first.item.label,
  baseSourceVersion: null,
  updatedAt: new Date(0),
  ...over,
});

describe("applyDepartmentLayer", () => {
  it("returns the very same groups when nothing applies (Bulletin only)", () => {
    const out = applyDepartmentLayer(tree.tree, [], [], ctx);
    expect(out.tree).toEqual(tree.tree);
    expect(out.tree.every((g, i) => g === tree.tree[i])).toBe(true);
    expect(out.applied).toEqual({ notes: 0, overridden: 0, hidden: 0, added: 0 });
  });

  it("never mutates the Bulletin tree it is given", () => {
    const before = JSON.stringify(tree.tree);
    applyDepartmentLayer(tree.tree, [note()], [override({ title: "x" }), override({ id: 2, targetKey: second.stableKey, hidden: true })], ctx);
    expect(JSON.stringify(tree.tree)).toBe(before);
  });

  it("shows only published notes of the matching edition and of programs present in the plan", () => {
    const notes = [
      note({ id: 1 }),
      note({ id: 2, status: "draft" }),
      note({ id: 3, status: "archived" }),
      note({ id: 4, status: "unmapped" }),
      note({ id: 5, bulletinEdition: "2025-26" }),
      note({ id: 6, programKey: "major:not-in-this-plan" }),
    ];
    const out = applyDepartmentLayer(tree.tree, notes, [], ctx);
    const item = out.tree.find((g) => g.stableKey === biology.programKey)!.items.find((i) => i.stableKey === first.stableKey)!.item as any;
    expect(item.departmentNotes.map((n: any) => n.id)).toEqual([1]);
    expect(out.applied.notes).toBe(1);
  });

  it("puts a program-level note on the program's group", () => {
    const out = applyDepartmentLayer(tree.tree, [note({ targetKey: null })], [], ctx);
    expect((out.tree.find((g) => g.stableKey === biology.programKey)!.group as any).departmentNotes).toHaveLength(1);
  });

  it("retitles but keeps the Bulletin fingerprint, courses and status", () => {
    const out = applyDepartmentLayer(tree.tree, [], [override({ title: "Renamed" })], ctx);
    const entry = out.tree.find((g) => g.stableKey === biology.programKey)!.items.find((i) => i.stableKey === first.stableKey)!;
    expect(entry.item.label).toBe("Renamed");
    expect((entry.item as any).department.originalLabel).toBe(first.item.label);
    expect(entry.fingerprint).toBe(first.fingerprint);
    expect(entry.item.courses).toEqual(first.item.courses);
  });

  it("hides and recounts only the touched group, and ignores an override from another edition", () => {
    const hidden = applyDepartmentLayer(tree.tree, [], [override({ hidden: true })], ctx);
    const g = hidden.tree.find((x) => x.stableKey === biology.programKey)!;
    expect(g.items.length).toBe(group.items.length - 1);
    expect((g.group as any).autoTrackedCount).toBe((group.group as any).autoTrackedCount - 1);
    expect(hidden.tree.filter((x) => x !== g).every((x, i) => x === tree.tree.filter((y) => y.stableKey !== biology.programKey)[i])).toBe(true);
    const stale = applyDepartmentLayer(tree.tree, [], [override({ hidden: true, bulletinEdition: "2025-26" })], ctx);
    expect(stale.tree.find((x) => x.stableKey === biology.programKey)!.items.length).toBe(group.items.length);
  });

  it("adds a department requirement and computes its status from the student's courses", () => {
    const added = override({ id: 9, entryType: "added", targetKey: `${biology.programKey}#dept:abc`, groupKey: biology.programKey, title: "Seminar", courseCodes: ["BIOL 1A", "BIOL 1B"], minimumCourses: 2 });
    const open = applyDepartmentLayer(tree.tree, [], [added], ctx).tree.find((g) => g.stableKey === biology.programKey)!.items.at(-1)!.item as any;
    expect(open).toMatchObject({ label: "Seminar", status: "open", complete: false });
    expect(open.department.added).toBe(true);
    const done = applyDepartmentLayer(tree.tree, [], [added], { ...ctx, completed: new Set(["BIOL 1A", "BIOL 1B"]) }).tree.find((g) => g.stableKey === biology.programKey)!.items.at(-1)!.item as any;
    expect(done.status).toBe("completed");
    const one = applyDepartmentLayer(tree.tree, [], [added], { ...ctx, completed: new Set(["BIOL 1A"]), planned: new Set(["BIOL 1B"]) }).tree.find((g) => g.stableKey === biology.programKey)!.items.at(-1)!.item as any;
    expect(one.status).toBe("planned");
  });

  it("leaves the student's overlay working on top: My Note, hide, and the Bulletin-anchored fingerprint", () => {
    const layered = applyDepartmentLayer(tree.tree, [note()], [override({ title: "Dept title" })], ctx).tree;
    const row = {
      entryType: "source_edit" as const,
      targetKey: first.stableKey,
      groupKey: null,
      title: null,
      note: "my own note",
      hidden: false,
      done: false,
      baseFingerprint: first.fingerprint, // recorded against the Bulletin
      baseTitle: first.item.label,
      baseSourceVersion: null,
      baseSourceType: "current_bulletin",
      updatedAt: new Date(0),
    };
    const shown = composeRequirementOverlay(layered, [row]).groups.find((g) => g.stableKey === biology.programKey)!.items.find((i) => i.stableKey === first.stableKey)! as any;
    expect(shown.customization.sourceChanged).toBe(false);
    expect(shown.customization.note).toBe("my own note");
    expect(shown.label).toBe("Dept title");
    expect(shown.departmentNotes[0].body).toBe("Take in the first year.");
  });
});

describe("checklist note extraction", () => {
  const cell = (c: number, text: string) => ({ c, text });
  const sheet = (rows: [number, ...[number, string][]][]): AprSheet =>
    ({
      name: "Biology",
      index: 0,
      visibility: "visible",
      rowCount: 40,
      columnCount: 6,
      columnWidths: [],
      merges: [],
      rows: rows.map(([r, ...cells]) => ({ r, cells: cells.map(([c, t]) => cell(c, t)) })),
    }) as unknown as AprSheet;
  const chem12 = group.items.find((i) => i.item.courses.includes("CHEM 12"))!;
  const biol1a = group.items.find((i) => i.item.courses.includes("BIOL 1A"))!;

  const candidates = extractChecklistNotes(
    sheet([
      [2, [0, "Foundations"], [1, "Quarter"], [2, "Notes"]],
      [3, [0, "RTC 3"], [2, "Can overlap with another Core or a Major requirement"]],
      [4, [0, "Natural Science"], [2, "CHEM 11"]],
      [5, [0, "Something Else"], [2, "A note on a row that is not a Core area"]],
      [28, [0, "Biology Major Requirements"], [1, "Quarter"], [2, "Prerequisites"], [3, "Notes"]],
      [29, [0, "CHEM 12"], [2, "CHEM 11"], [3, "CHEM 14"]],
      [39, [0, "BIOL 1A"], [2, "CHEM 11 or 14"], [3, "Recommend concurrent enrollment in CHEM 12"]],
      [43, [0, "UD BIOL CMB THEME w/ Lab 1"], [3, "Theme"]],
      [44, [0, "PHYS 11/31"], [3, "Take with the lab"]],
      [45, [0, "Elective"], [3, "Any upper-division"]],
    ]),
    "Biology",
    group,
    tree.tree,
  );
  const at = (ref: string) => candidates.find((c) => c.sourceReference === ref)!;

  it("anchors Core rows to the matching Core requirement, keeping the row label as context", () => {
    expect(at("Biology!C4")).toMatchObject({ targetKey: "university-core:cas#rtc3", status: "published", kind: "core_overlap", body: "RTC 3: Can overlap with another Core or a Major requirement" });
    expect(at("Biology!C5")).toMatchObject({ targetKey: "university-core:cas#natsci", body: "Natural Science: CHEM 11" });
    expect(at("Biology!C6")).toMatchObject({ targetKey: null, status: "unmapped" });
  });

  it("anchors a program row only when its course belongs to exactly one requirement, with the text verbatim", () => {
    expect(at("Biology!D40")).toMatchObject({ targetKey: biol1a.stableKey, status: "published", body: "Recommend concurrent enrollment in CHEM 12", kind: "sequence" });
    // Anchored, but says nothing in words: a person must confirm before students see it.
    expect(at("Biology!D30")).toMatchObject({ targetKey: chem12.stableKey, status: "draft" });
  });

  it("sends anything it cannot anchor with certainty to the unmapped queue, never to a guess", () => {
    expect(at("Biology!D44")).toMatchObject({ targetKey: null, status: "unmapped" });
    expect(at("Biology!D45")).toMatchObject({ targetKey: null, status: "unmapped" }); // PHYS 11/31: the requirement does not list PHYS 11
    expect(at("Biology!D46")).toMatchObject({ targetKey: null, status: "unmapped" });
    expect(at("Biology!D46").reason).toMatch(/names no course/);
    expect(candidates.every((c) => c.status === "unmapped" || c.targetKey !== null)).toBe(true);
  });

  it("parses course codes, slash alternatives and code-only text", () => {
    expect(courseCodesIn("PHYS 11/31")).toEqual(["PHYS 11", "PHYS 31"]);
    expect(courseCodesIn("CHEM 12")).toEqual(["CHEM 12"]);
    expect(courseCodesIn("UD BIOL Elective")).toEqual([]);
    expect(isCodesOnly("CHEM 14")).toBe(true);
    expect(isCodesOnly("CHEM 11 or 14")).toBe(true);
    expect(isCodesOnly("Take CHEM 14")).toBe(false);
  });
});
