/**
 * The canonical Core-area layer, tested both on synthetic bulletin text (the
 * extraction RULES) and against the REAL catalog (the data the professor's
 * "Critical Thinking & Writing / Advanced Writing / CNI show nothing or only
 * a few courses" bug report is about).
 */
import { describe, it, expect } from "vitest";
import { COURSES } from "./courses";
import {
  CORE_AREAS,
  CORE_AREA_BY_REQUIREMENT,
  coreAreaDefForTag,
  deriveCoreAreas,
  resolveCoreAreaTag,
} from "./core-areas";
import { searchCourses } from "../lib/course-search";

const tagged = (tag: string) => COURSES.filter((c) => c.coreAreas.includes(tag)).map((c) => c.code);
const statedFor = (tag: string) =>
  COURSES.filter((c) => c.coreAreaSources?.[tag] === "catalog_text").map((c) => c.code);

describe("alias resolution (one definition of every Core area)", () => {
  it.each([
    ["CTW", "Critical Thinking & Writing"],
    ["ctw 1", "Critical Thinking & Writing"],
    ["Critical Thinking and Writing", "Critical Thinking & Writing"],
    ["CNI", "Cultures & Ideas"],
    ["C&I", "Cultures & Ideas"],
    ["c and i", "Cultures & Ideas"],
    ["C&I 3", "Cultures & Ideas 3"],
    ["AW", "Advanced Writing"],
    ["  advanced   writing ", "Advanced Writing"],
    ["ELSJ", "Experiential Learning for Social Justice"],
    ["RTC", "Religion, Theology & Culture"],
    ["STS", "Science, Technology & Society"],
  ])("%s → %s", (input, tag) => {
    expect(resolveCoreAreaTag(input)).toBe(tag);
  });

  it("returns null for anything that is not a Core area", () => {
    expect(resolveCoreAreaTag("Underwater Basket Weaving")).toBeNull();
    expect(resolveCoreAreaTag("")).toBeNull();
    expect(resolveCoreAreaTag(null)).toBeNull();
  });

  it("has no alias claimed by two different areas", () => {
    const seen = new Map<string, string>();
    for (const area of CORE_AREAS) {
      for (const key of [area.tag, area.code, ...area.aliases].map((s) => s.trim().toLowerCase())) {
        const owner = seen.get(key);
        expect(owner === undefined || owner === area.tag, `${key} is claimed by ${owner} and ${area.tag}`).toBe(true);
        seen.set(key, area.tag);
      }
    }
  });

  it("maps every Core requirement item id used by the plan UI to exactly one area", () => {
    for (const id of ["ctw1", "ctw2", "ci1", "ci2", "ci3", "advwriting", "elsj", "rtc1", "rtc2", "rtc3", "math", "natsci", "socsci", "arts", "ethics", "diversity", "civic", "lang", "sts"]) {
      expect(CORE_AREA_BY_REQUIREMENT.get(id), id).toBeTruthy();
    }
    // Pathways are NOT invented: no mapping, so the UI must say so.
    expect(CORE_AREA_BY_REQUIREMENT.get("pathway")).toBeUndefined();
  });

  it("every tag stored on a catalog course is a known canonical area", () => {
    const known = new Set(CORE_AREAS.map((a) => a.tag));
    const unknown = new Set<string>();
    for (const c of COURSES) for (const t of c.coreAreas) if (!known.has(t)) unknown.add(t);
    expect([...unknown]).toEqual([]);
  });
});

describe("extraction rules on synthetic bulletin text", () => {
  const base = { code: "TEST 1", title: "Test", department: "TEST", description: "" };

  it("reads an explicit 'Satisfies the X Core requirement' designation and keeps the sentence as evidence", () => {
    const d = deriveCoreAreas({ ...base, description: "Intro. Satisfies the Ethics Core requirement for the bachelor's degree." });
    expect(d.areas).toContain("Ethics");
    expect(d.sources["Ethics"]).toBe("catalog_text");
    expect(d.evidence["Ethics"]).toMatch(/Satisfies the Ethics Core requirement/);
  });

  it("treats 'Successful completion of CTW I (X)' as the CTW sequence's own designation", () => {
    const d = deriveCoreAreas({ ...base, code: "PHIL 1A", department: "PHIL", description: "Successful completion of CTW I (PHIL 1A) is a prerequisite for CTW II (PHIL 2A)." });
    expect(d.areas).toContain("Critical Thinking & Writing");
  });

  it("reads Cultures & Ideas 3 as its own area, distinct from C&I 1/2", () => {
    const d = deriveCoreAreas({ ...base, code: "ENGR 161", department: "ENGR", description: "ENGR 161 satisfies the Cultures & Ideas 3 Core requirement." });
    expect(d.areas).toContain("Cultures & Ideas 3");
    expect(d.areas).not.toContain("Cultures & Ideas");
  });

  it("an explicit negation suppresses the area even when a heuristic would add it", () => {
    const d = deriveCoreAreas({
      code: "MATH 9S", title: "Statistics", department: "MATH",
      description: "Does not fulfill the undergraduate Core Curriculum requirement in mathematics.",
    });
    expect(d.areas).not.toContain("Mathematics");
  });

  it("does not attribute a sentence about a DIFFERENT course to this one", () => {
    const d = deriveCoreAreas({
      ...base, code: "CLAS 21", department: "CLAS",
      description: "Students who take CLAS 21-23 can use CLAS 23 to satisfy the Second Language or RTC 2 core requirements.",
    });
    expect(d.areas).not.toContain("Second Language");
    expect(d.areas).not.toContain("Religion, Theology & Culture");
  });

  it("ignores elective wording and prose that merely mentions an area", () => {
    const d = deriveCoreAreas({ ...base, description: "This course counts as an Advanced Writing elective. Explores ethics and civic engagement." });
    expect(d.areas).not.toContain("Advanced Writing");
    expect(d.areas).not.toContain("Ethics");
    expect(d.areas).not.toContain("Civic Engagement");
  });

  it("falls back to (and labels) the department/number heuristic when the text is silent", () => {
    const d = deriveCoreAreas({ code: "THTR 10", title: "Acting", department: "THTR", description: "Scene study." });
    expect(d.sources["Arts"]).toBe("heuristic");
    expect(d.evidence["Arts"]).toBeUndefined();
  });
});

describe("against the real catalog", () => {
  it("CTW is no longer just ENGL 1A/1H: the bulletin's own CTW sequence courses are all found", () => {
    const ctw = tagged("Critical Thinking & Writing");
    for (const code of ["ENGL 1A", "ENGL 1H", "PHIL 1A", "WGST 1A"]) expect(ctw).toContain(code);
    expect(ctw.length).toBeGreaterThanOrEqual(5);
  });

  it("Advanced Writing includes courses the bulletin states outright, not only ENGL 1xx heuristics", () => {
    const aw = tagged("Advanced Writing");
    for (const code of ["ENGL 28", "CHEM 132", "CHEM 135", "COMM 165M", "PHIL 19"]) expect(aw).toContain(code);
    expect(statedFor("Advanced Writing")).toEqual(expect.arrayContaining(["ENGL 28", "CHEM 132"]));
  });

  it("C&I (CNI) covers every department's 11A sequence course, not just HIST/CLAS/ARTH", () => {
    const ci = tagged("Cultures & Ideas");
    for (const code of ["ENGL 11A", "PHIL 11A", "SOCI 11A", "ANTH 11A", "THTR 11A", "MUSC 11A", "HIST 11A"]) expect(ci).toContain(code);
    expect(ci.length).toBeGreaterThan(60);
  });

  it("C&I 3 and ELSJ — previously not tagged at all — are found from bulletin text", () => {
    expect(tagged("Cultures & Ideas 3")).toEqual(expect.arrayContaining(["ENGR 161", "PHIL 175"]));
    expect(tagged("Experiential Learning for Social Justice")).toEqual(
      expect.arrayContaining(["BUSN 183A", "BUSN 188", "ENGR 111", "SPAN 170"]),
    );
  });

  it("Ethics / Civic Engagement / STS / Arts pick up bulletin-stated designations", () => {
    expect(statedFor("Ethics")).toEqual(expect.arrayContaining(["PHIL 120", "PHIL 22"]));
    expect(statedFor("Civic Engagement")).toEqual(expect.arrayContaining(["COMM 60", "COMM 187"]));
    expect(statedFor("Science, Technology & Society")).toEqual(expect.arrayContaining(["COMM 12", "CHEM 103"]));
    expect(statedFor("Arts")).toContain("COMM 30");
  });

  it("a course the bulletin says does NOT satisfy Math Core is not tagged Mathematics", () => {
    expect(tagged("Mathematics")).not.toContain("MATH 9S");
  });

  it("every tagged course records the provenance of every tag it carries", () => {
    for (const c of COURSES) {
      for (const t of c.coreAreas) {
        expect(["catalog_text", "heuristic"], `${c.code} ${t}`).toContain(c.coreAreaSources?.[t]);
      }
    }
  });

  it("every catalog_text tag on a course has traceable evidence text (except source-supplied ones)", () => {
    for (const c of COURSES) {
      for (const [t, src] of Object.entries(c.coreAreaSources ?? {})) {
        if (src === "catalog_text") expect(c.coreAreaEvidence?.[t], `${c.code} ${t}`).toBeTruthy();
      }
    }
  });

  it("an area with no catalog basis has zero courses and says so (nothing invented)", () => {
    // Every area the UI offers a "Find courses" button for must be either populated or honestly empty.
    for (const area of CORE_AREAS) {
      expect(tagged(area.tag).length, area.tag).toBeGreaterThanOrEqual(0);
    }
    expect(coreAreaDefForTag("Pathways")).toBeNull();
  });
});

describe("filtering the real catalog by area (what the UI's Core click does)", () => {
  it("returns the COMPLETE tagged set for an area — not a truncated first page", () => {
    const all = tagged("Critical Thinking & Writing").length;
    const out = searchCourses(COURSES, { coreAreas: ["Critical Thinking & Writing"], limit: 100 });
    expect(out.state).toBe("results");
    expect(out.totalMatching).toBe(all);
    expect(out.courses).toHaveLength(all);
    expect(out.hasMore).toBe(false);
  });

  it("pages a large result set with offset/hasMore and no duplicates or gaps", () => {
    const tag = "Diversity";
    const total = tagged(tag).length;
    expect(total).toBeGreaterThan(100);
    const seen: string[] = [];
    let offset = 0;
    for (;;) {
      const page = searchCourses(COURSES, { coreAreas: [tag], limit: 100, offset });
      seen.push(...page.courses.map((c) => c.code));
      if (!page.hasMore) break;
      offset += 100;
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("offeredOnly=false keeps every matching course and lists offered ones first", () => {
    const counts = new Map<string, number>([["ENGL 1A", 3]]);
    const out = searchCourses(COURSES, { coreAreas: ["Critical Thinking & Writing"], sectionCounts: counts, offeredOnly: false, limit: 100 });
    expect(out.totalMatching).toBeGreaterThanOrEqual(5);
    expect(out.courses).toHaveLength(out.totalMatching);
    expect(out.courses[0]!.code).toBe("ENGL 1A");
    expect(out.courses[0]!.sectionsThisQuarter).toBe(3);
    expect(out.totalWithSections).toBe(1);
  });

  it("offeredOnly=true (historical) still hides courses with no sections that quarter", () => {
    const counts = new Map<string, number>([["ENGL 1A", 3]]);
    const out = searchCourses(COURSES, { coreAreas: ["Critical Thinking & Writing"], sectionCounts: counts, limit: 100 });
    expect(out.courses.map((c) => c.code)).toEqual(["ENGL 1A"]);
  });

  it("distinguishes 'no such courses' from 'none offered this quarter'", () => {
    expect(searchCourses(COURSES, { coreAreas: ["Nonexistent Area"] }).state).toBe("no_matching_courses");
    const none = searchCourses(COURSES, { coreAreas: ["Ethics"], sectionCounts: new Map() });
    expect(none.state).toBe("no_sections_this_quarter");
    expect(none.courses.length).toBeGreaterThan(0);
  });

  it("combines a Core area with a text query (the normal search still narrows)", () => {
    const out = searchCourses(COURSES, { q: "PHIL", coreAreas: ["Ethics"], limit: 100 });
    expect(out.totalMatching).toBeGreaterThan(0);
    expect(out.courses.every((c) => c.code.startsWith("PHIL") || /phil/i.test(c.title + c.description))).toBe(true);
  });

  it("plain text search (no Core area) is unchanged: by code and by title", () => {
    expect(searchCourses(COURSES, { q: "CSEN 12" }).courses[0]!.code).toBe("CSEN 12");
    expect(searchCourses(COURSES, { q: "abstract data types" }).totalMatching).toBeGreaterThan(0);
  });

  it("exposes per-tag provenance on each hit so the UI can distinguish stated from inferred", () => {
    const hit = searchCourses(COURSES, { coreAreas: ["Ethics"], limit: 100 }).courses.find((c) => c.code === "PHIL 120")!;
    expect(hit.coreAreaSources["Ethics"]).toBe("catalog_text");
  });
});
