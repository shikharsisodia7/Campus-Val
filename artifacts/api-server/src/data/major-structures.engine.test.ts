/**
 * The structure engine's rules, on small synthetic structures (and a few real majors whose Bulletin
 * wording exercises them): "from at least K lists", "at most N from a list", requirements a course
 * meets in addition, tracks, catalog ranges, and stale catalog codes.
 */
import { describe, expect, it } from "vitest";
import { codes, each, list, listsOf, manual, oneOf, pick, range, section, type MajorStructure } from "./majors/model";
import { MAJOR_STRUCTURES, exampleSelection, resolveMajorStructure } from "./major-structures";

const base = (extra: Partial<MajorStructure>): MajorStructure => ({
  sourceUrl: "https://www.scu.edu/bulletin/undergraduate/",
  sourceLabel: "test",
  catalogYear: "2026-27",
  lastVerified: "2026-10-09",
  verificationNote: "",
  sourceText: [],
  lists: {},
  sections: [],
  notes: [],
  ...extra,
});

const byKey = (structure: MajorStructure, completed: string[], planned: string[] = [], variant?: string | null) =>
  new Map(resolveMajorStructure(structure, completed, planned, { variant }).map((r) => [r.key, r]));

describe("choose N from at least K lists", () => {
  const areas = base({
    lists: listsOf(list("a", "A", ["ECEN 116", "ECEN 117"]), list("b", "B", ["ECEN 118"]), list("c", "C", ["ECEN 105"]), list("d", "D", ["ECEN 164"])),
    sections: [section("s", "S", [pick("areas", "Four areas", 3, ["a", "b", "c", "d"], "", { minDistinctLists: 3 })])],
  });

  it("is complete only when the courses cover enough different lists", () => {
    expect(byKey(areas, ["ECEN 116", "ECEN 117", "ECEN 118"]).get("areas")!.status).toBe("open");
    const r = byKey(areas, ["ECEN 116", "ECEN 117", "ECEN 118", "ECEN 105"]).get("areas")!;
    expect(r.status).toBe("completed");
    // The spread is taken first: one per list, not the first three in order.
    expect(r.satisfiedBy).toEqual(["ECEN 116", "ECEN 118", "ECEN 105"]);
    expect(r.choice!.minDistinctLists).toBe(3);
  });

  it("a planned course can complete the spread, but only as planned", () => {
    const r = byKey(areas, ["ECEN 116", "ECEN 117", "ECEN 118"], ["ECEN 164"]).get("areas")!;
    expect(r.status).toBe("planned");
    expect(r.plannedBy).toEqual(["ECEN 164"]);
  });
});

describe("at most N from a list", () => {
  const capped = base({
    lists: listsOf(list("main", "Main", codes("ECEN", "123 127 131")), list("sub", "Substitutes", ["CSEN 79", "CSCI 163"])),
    sections: [section("s", "S", [pick("two", "Two", 2, ["main", "sub"], "", { maxPerList: { sub: 1 } })])],
  });
  it("counts one substitute, never two", () => {
    expect(byKey(capped, ["CSEN 79", "CSCI 163"]).get("two")!.satisfiedBy).toEqual(["CSEN 79"]);
    expect(byKey(capped, ["CSEN 79", "CSCI 163"]).get("two")!.status).toBe("open");
    expect(byKey(capped, ["CSEN 79", "ECEN 127"]).get("two")!.status).toBe("completed");
  });
});

describe("a requirement a course meets in addition (overlay)", () => {
  const music = base({
    lists: listsOf(list("listening", "Listening", codes("MUSC", "7 8 9 10")), list("electronic", "Electronic", codes("MUSC", "9 157"))),
    sections: [
      section("s", "S", [
        pick("listening", "Two listening", 2, ["listening"], ""),
        pick("electronic", "One electronic", 1, ["electronic"], "", { overlay: true }),
      ]),
    ],
  });
  it("reads a course another requirement counted, and never takes it away", () => {
    const r = byKey(music, ["MUSC 7", "MUSC 9"]);
    expect(r.get("listening")!.satisfiedBy).toEqual(["MUSC 7", "MUSC 9"]);
    expect(r.get("electronic")!.satisfiedBy).toEqual(["MUSC 9"]);
    expect(r.get("electronic")!.status).toBe("completed");
  });
});

describe("required courses and choices", () => {
  const s = base({
    lists: listsOf(range("electives", "Electives", { subjects: ["CHEM"], from: 100, to: 199 })),
    sections: [
      section("s", "S", [
        each("core", "Core", ["CHEM 102"]),
        pick("electives", "Two electives", 2, ["electives"], ""),
        oneOf("one", "102 or 103", [
          ["CHEM 102", ["CHEM 102"]],
          ["CHEM 103", ["CHEM 103"]],
        ]),
      ]),
    ],
  });
  it("a course an each-rule requires never fills an elective, but an option may name it", () => {
    const r = byKey(s, ["CHEM 102", "CHEM 150"]);
    expect(r.get("electives")!.satisfiedBy).toEqual(["CHEM 150"]);
    expect(r.get("one")!.status).toBe("completed");
  });
  it("a student's course inside a stated range counts even when the catalog lacks it", () => {
    expect(byKey(s, ["CHEM 150", "CHEM 199Z"]).get("electives")!.satisfiedBy).toEqual(["CHEM 150", "CHEM 199Z"]);
  });
});

describe("ranges: unit floors and excluded suffixes", () => {
  it("a unit floor drops courses below it and courses the catalog cannot vouch for", () => {
    const s = base({
      lists: listsOf(range("r", "R", { subjects: ["CHEM"], from: 100, to: 199, minUnits: 3 })),
      sections: [section("s", "S", [pick("r", "R", 2, ["r"], "")])],
    });
    const r = byKey(s, ["CHEM 115", "CHEM 199Z", "CHEM 150"]).get("r")!;
    expect(r.satisfiedBy).toEqual(["CHEM 150"]);
    expect(r.courses).not.toContain("CHEM 115");
  });
  it("Psychology's additional courses exclude the Advanced Topics (AT) courses", () => {
    const psyc = MAJOR_STRUCTURES.PSYC!;
    const r = byKey(psyc, ["PSYC 111AT", "PSYC 116AT", "PSYC 120", "PSYC 130", "PSYC 131", "PSYC 138"]);
    expect(r.get("advanced-topics")!.satisfiedBy).toEqual(["PSYC 111AT"]);
    expect(r.get("additional")!.satisfiedBy).not.toContain("PSYC 116AT");
    expect(r.get("additional")!.courses.some((c) => c.endsWith("AT"))).toBe(false);
  });
});

describe("tracks, emphases and concentrations", () => {
  const tracks = base({
    lists: listsOf(list("shared", "Shared", ["BIOE 180", "PHIL 117"]), list("te", "TE", ["BIOE 154", "BIOE 155"])),
    sections: [
      section("shared", "Shared", [each("core", "Core", ["BIOE 24"]), pick("ethics", "Ethics", 1, ["shared"], "")]),
      section("a", "Track A", [oneOf("a-24", "BIOE 24 or 25", [["BIOE 24", ["BIOE 24"]], ["BIOE 25", ["BIOE 25"]]]), each("a-core", "A", ["CHEM 11"])], "a"),
      section("b", "Track B", [each("b-core", "B", ["CHEM 11"]), manual("b-te", "TE", "8 units", ["te"])], "b"),
    ],
    variants: { kind: "track", required: true, options: [{ key: "a", label: "Track A" }, { key: "b", label: "Track B" }] },
  });

  it("asks for a required track until one is chosen", () => {
    const r = byKey(tracks, ["CHEM 11"]);
    expect(r.get("choose-track")!.manual).toBe(true);
    expect(r.get("choose-track")!.description).toContain("Track A or Track B");
    expect(r.has("a-chem-11")).toBe(false);
  });

  it("shows only the chosen track, with track-prefixed keys", () => {
    const r = byKey(tracks, ["CHEM 11", "BIOE 24"], [], "a");
    expect(r.has("choose-track")).toBe(false);
    expect(r.get("a-chem-11")!.status).toBe("completed");
    // An option may name a course the shared sections require.
    expect(r.get("a-24")!.status).toBe("completed");
    expect(r.has("b-chem-11")).toBe(false);
  });

  it("ignores a track the major does not have", () => {
    expect(byKey(tracks, [], [], "nope").has("choose-track")).toBe(true);
  });

  it("resolves every track for a reference listing, keys unique", () => {
    const keys = resolveMajorStructure(tracks, [], [], { allVariants: true }).map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["a-chem-11", "b-chem-11", "b-te"]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("an optional emphasis adds nothing until chosen", () => {
    const math = MAJOR_STRUCTURES.MATH!;
    const keys = resolveMajorStructure(math, []).map((r) => r.key);
    expect(keys.some((k) => k.startsWith("applied-") || k === "choose-emphasis")).toBe(false);
    const chosen = resolveMajorStructure(math, ["MATH 102"], [], { variant: "applied-mathematics" });
    // The emphasis's "specification" MATH 102 also counts as the analysis course.
    expect(chosen.find((r) => r.key === "analysis")!.satisfiedBy).toEqual(["MATH 102"]);
    expect(chosen.find((r) => r.key === "applied-mathematics-math-102")!.status).toBe("completed");
  });

  it("the four-year example follows the first track of a required set", () => {
    const { lowerDiv, upperDiv } = exampleSelection(MAJOR_STRUCTURES.BIOE!);
    expect([...lowerDiv, ...upperDiv]).toContain("BIOE 163"); // biomolecular engineering
    expect([...lowerDiv, ...upperDiv]).not.toContain("BIOE 174"); // medical-device only
  });
});

describe("stale catalog codes", () => {
  it("a course saved under its old subject counts as the Bulletin's code", () => {
    const rs = MAJOR_STRUCTURES.RSOC!;
    // RSOC 15 was the 2025-26 catalog's code for SCTR 15 (Texting God).
    const r = byKey(rs, ["RSOC 15", "TESP 4", "RSOC 10"]);
    expect(r.get("lower-division")!.satisfiedBy.sort()).toEqual(["RSOC 10", "SCTR 15", "TESP 4"]);
    expect(r.get("lower-division")!.status).toBe("completed");
  });
});

describe("real majors read as the Bulletin writes them", () => {
  it("Electrical Engineering: four areas, then any ECEN 100-level elective except 188/189", () => {
    const r = byKey(MAJOR_STRUCTURES.EE!, ["ECEN 116", "ECEN 117", "ECEN 118", "ECEN 105", "ECEN 164", "ECEN 188"]);
    expect(r.get("technical-electives-areas")!.status).toBe("completed");
    expect(r.get("technical-elective-fifth")!.satisfiedBy).toEqual(["ECEN 117"]);
    expect(r.get("technical-elective-fifth")!.courses).not.toContain("ECEN 188");
  });

  it("Finance: the Leavey core's FNCE 121 is never a finance elective; FNCE 118 never counts", () => {
    const r = byKey(MAJOR_STRUCTURES.FNCE!, ["FNCE 121", "FNCE 118", "FNCE 134"]);
    expect(r.get("finance-electives")!.satisfiedBy).toEqual(["FNCE 134"]);
  });

  it("Philosophy: one course never satisfies both History of Philosophy and Non-Western", () => {
    const r = byKey(MAJOR_STRUCTURES.PHIL!, ["PHIL 175"]);
    const used = [...r.get("history")!.satisfiedBy, ...r.get("non-western")!.satisfiedBy];
    expect(used).toEqual(["PHIL 175"]);
  });

  it("Computer Science asks for an emphasis; Bioengineering for a track; Physics for neither", () => {
    expect(byKey(MAJOR_STRUCTURES.CSCI!, []).has("choose-emphasis")).toBe(true);
    expect(byKey(MAJOR_STRUCTURES.BIOE!, []).has("choose-track")).toBe(true);
    expect([...byKey(MAJOR_STRUCTURES.PHYS!, []).keys()].some((k) => k.startsWith("choose-"))).toBe(false);
  });

  it("History's geographic breadth reads the courses the other requirements counted", () => {
    const r = byKey(MAJOR_STRUCTURES.HIST!, ["HIST 121", "HIST 105", "HIST 103", "HIST 140", "HIST 100S", "HIST 101S"]);
    expect(r.get("upper-division")!.satisfiedBy).toEqual(expect.arrayContaining(["HIST 121", "HIST 105"]));
    expect(r.get("geographic-breadth")!.status).toBe("completed");
  });
});
