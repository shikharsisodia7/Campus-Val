import { describe, it, expect } from "vitest";
import {
  findEventConflicts,
  provenNoOverlap,
  hasProvenConflictFreeSection,
  provenNoSectionFits,
  sectionsAlwaysConflict,
  sectionOverlapDetails,
  timeToMinutes,
  minutesToLabel,
  layoutDayEvents,
  type TimedEvent,
  type SectionTimeLike,
} from "./conflicts";

function ev(
  id: string,
  days: string[],
  start: string,
  end: string,
): TimedEvent {
  return { id, label: id, meetingDays: days, startTime: start, endTime: end };
}

describe("findEventConflicts", () => {
  it("detects course/course overlap on a shared day", () => {
    const c = findEventConflicts([
      ev("CHEM 11-01", ["M", "W", "F"], "08:00", "09:05"),
      ev("MATH 11-02", ["M", "W"], "08:30", "09:35"),
    ]);
    expect(c.length).toBe(2); // Monday + Wednesday
    expect(c[0]!.day).toBe("M");
    expect(c[0]!.overlapStart).toBe(timeToMinutes("08:30"));
    expect(c[0]!.overlapEnd).toBe(timeToMinutes("09:05"));
  });

  it("does not flag non-overlapping times", () => {
    const c = findEventConflicts([
      ev("A", ["T", "R"], "08:30", "10:10"),
      ev("B", ["T", "R"], "10:20", "12:00"),
    ]);
    expect(c).toEqual([]);
  });

  it("does not flag same times on different days", () => {
    const c = findEventConflicts([
      ev("A", ["M", "W", "F"], "09:15", "10:20"),
      ev("B", ["T", "R"], "09:15", "10:20"),
    ]);
    expect(c).toEqual([]);
  });

  it("detects work commitment overlapping a 3-hour lab", () => {
    const c = findEventConflicts([
      ev("CHEM 12L-04", ["R"], "18:00", "21:00"),
      ev("Work", ["T", "R"], "17:00", "20:30"),
    ]);
    expect(c.length).toBe(1);
    expect(c[0]!.day).toBe("R");
    expect(c[0]!.overlapStart).toBe(timeToMinutes("18:00"));
    expect(c[0]!.overlapEnd).toBe(timeToMinutes("20:30"));
  });

  it("detects external-course conflicts and commitment/commitment conflicts", () => {
    const c = findEventConflicts([
      ev("DVC PHYS 120", ["T", "R"], "18:00", "19:50"),
      ev("Practice", ["T"], "19:00", "21:00"),
    ]);
    expect(c.length).toBe(1);
    expect(c[0]!.day).toBe("T");
  });

  it("treats touching intervals (end == start) as non-conflicting", () => {
    const c = findEventConflicts([
      ev("A", ["M"], "08:00", "09:00"),
      ev("B", ["M"], "09:00", "10:00"),
    ]);
    expect(c).toEqual([]);
  });

  it("ignores events with invalid or zero-length times", () => {
    const c = findEventConflicts([
      ev("A", ["M"], "", ""),
      ev("B", ["M"], "08:00", "08:00"),
      ev("C", ["M"], "08:00", "09:00"),
    ]);
    expect(c).toEqual([]);
  });
});

function sec(days: string[], start: string, end: string): SectionTimeLike {
  return { meetingDays: days, startTime: start, endTime: end };
}

describe("sectionsAlwaysConflict", () => {
  it("flags two single-section courses that overlap", () => {
    expect(
      sectionsAlwaysConflict(
        [sec(["M", "W", "F"], "08:00", "09:05")],
        [sec(["M", "W"], "08:30", "09:35")],
      ),
    ).toBe(true);
  });

  it("does not flag when at least one combination is free", () => {
    expect(
      sectionsAlwaysConflict(
        [sec(["M", "W"], "08:00", "09:05"), sec(["T", "R"], "08:00", "09:05")],
        [sec(["M", "W"], "08:30", "09:35")],
      ),
    ).toBe(false);
  });

  it("flags when every combination overlaps across multiple sections", () => {
    expect(
      sectionsAlwaysConflict(
        [sec(["M", "W"], "09:00", "10:05"), sec(["M", "W"], "09:15", "10:20")],
        [sec(["M"], "09:30", "10:35"), sec(["W"], "08:30", "09:35")],
      ),
    ).toBe(true);
  });

  it("never flags when a section has TBA/invalid times (unprovable)", () => {
    expect(
      sectionsAlwaysConflict(
        [sec(["M"], "", "")],
        [sec(["M"], "08:30", "09:35")],
      ),
    ).toBe(false);
    expect(
      sectionsAlwaysConflict(
        [{ meetingDays: ["M"], startTime: null, endTime: null }],
        [sec(["M"], "08:30", "09:35")],
      ),
    ).toBe(false);
  });

  it("never flags when either course has no sections", () => {
    expect(sectionsAlwaysConflict([], [sec(["M"], "08:00", "09:00")])).toBe(false);
    expect(sectionsAlwaysConflict([sec(["M"], "08:00", "09:00")], [])).toBe(false);
  });

  it("does not flag same times on disjoint days", () => {
    expect(
      sectionsAlwaysConflict(
        [sec(["M", "W"], "09:00", "10:05")],
        [sec(["T", "R"], "09:00", "10:05")],
      ),
    ).toBe(false);
  });
});

describe("sectionOverlapDetails", () => {
  it("returns the shared days and overlap window for overlapping pairs", () => {
    const d = sectionOverlapDetails(
      [{ ...sec(["M", "W", "F"], "08:00", "09:05"), sectionNumber: "1" }],
      [{ ...sec(["M", "W"], "08:30", "09:35"), sectionNumber: "2" }],
    );
    expect(d.length).toBe(1);
    expect(d[0]!.aSection).toBe("§1");
    expect(d[0]!.bSection).toBe("§2");
    expect(d[0]!.sharedDays).toEqual(["M", "W"]);
    expect(d[0]!.overlapStart).toBe(timeToMinutes("08:30"));
    expect(d[0]!.overlapEnd).toBe(timeToMinutes("09:05"));
  });

  it("only includes provably overlapping pairs", () => {
    const d = sectionOverlapDetails(
      [
        { ...sec(["M", "W"], "09:00", "10:05"), sectionNumber: "1" },
        { ...sec(["T", "R"], "09:00", "10:05"), sectionNumber: "2" },
      ],
      [{ ...sec(["M"], "09:30", "10:35"), sectionNumber: "3" }],
    );
    expect(d.length).toBe(1);
    expect(d[0]!.aSection).toBe("§1");
    expect(d[0]!.sharedDays).toEqual(["M"]);
  });

  it("skips TBA/invalid times instead of guessing", () => {
    expect(
      sectionOverlapDetails(
        [{ meetingDays: ["M"], startTime: null, endTime: null }],
        [sec(["M"], "08:30", "09:35")],
      ),
    ).toEqual([]);
  });

  it("labels tentative or unnumbered sections as TBA", () => {
    const d = sectionOverlapDetails(
      [{ ...sec(["M"], "08:00", "09:05"), tentative: true, sectionNumber: "1" }],
      [sec(["M"], "08:30", "09:35")],
    );
    expect(d[0]!.aSection).toBe("Section TBA");
    expect(d[0]!.bSection).toBe("Section TBA");
  });

  it("orders shared days canonically (M T W R F S U)", () => {
    const d = sectionOverlapDetails(
      [sec(["F", "M", "W"], "08:00", "09:05")],
      [sec(["W", "F", "M"], "08:30", "09:35")],
    );
    expect(d[0]!.sharedDays).toEqual(["M", "W", "F"]);
  });
});

describe("minutesToLabel", () => {
  it("formats AM/PM correctly", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(8 * 60 + 5)).toBe("8:05 AM");
    expect(minutesToLabel(12 * 60)).toBe("12:00 PM");
    expect(minutesToLabel(21 * 60 + 30)).toBe("9:30 PM");
  });
});

function secN(days: string[], start?: string | null, end?: string | null): SectionTimeLike {
  return { meetingDays: days, startTime: start, endTime: end };
}

describe("provenNoOverlap", () => {
  it("true for disjoint days", () => {
    expect(provenNoOverlap(secN(["M", "W"], "09:00", "10:00"), secN(["T", "R"], "09:00", "10:00"))).toBe(true);
  });
  it("true for shared day, disjoint times", () => {
    expect(provenNoOverlap(secN(["M"], "08:00", "09:00"), secN(["M"], "09:00", "10:00"))).toBe(true);
  });
  it("false when times overlap on a shared day", () => {
    expect(provenNoOverlap(secN(["M"], "08:00", "09:30"), secN(["M"], "09:00", "10:00"))).toBe(false);
  });
  it("false (never claimed) when either side has TBA times", () => {
    expect(provenNoOverlap(secN(["M"], null, null), secN(["T"], "09:00", "10:00"))).toBe(false);
    expect(provenNoOverlap(secN(["M"], "09:00", "10:00"), secN(["T"], "", ""))).toBe(false);
  });
});

describe("hasProvenConflictFreeSection", () => {
  const morning = secN(["M", "W"], "08:00", "09:05");
  const afternoon = secN(["M", "W"], "14:00", "15:05");
  it("true when one section avoids all planned courses", () => {
    expect(
      hasProvenConflictFreeSection(
        [morning, afternoon],
        [[secN(["M", "W"], "08:30", "09:35")]],
      ),
    ).toBe(true);
  });
  it("false when every section clashes with a planned course", () => {
    expect(
      hasProvenConflictFreeSection(
        [morning],
        [[secN(["M"], "08:30", "09:35")]],
      ),
    ).toBe(false);
  });
  it("true with no planned courses when course has a valid-timed section", () => {
    expect(hasProvenConflictFreeSection([morning], [])).toBe(true);
  });
  it("false when the only course section has TBA times", () => {
    expect(hasProvenConflictFreeSection([secN(["M"], null, null)], [])).toBe(false);
  });
  it("false when a planned course's sections are all TBA (can't verify)", () => {
    expect(
      hasProvenConflictFreeSection([morning], [[secN([], null, null)]]),
    ).toBe(false);
  });
  it("false with empty course section list", () => {
    expect(hasProvenConflictFreeSection([], [])).toBe(false);
  });
});

describe("provenNoSectionFits", () => {
  const a1 = secN(["M", "W"], "08:00", "09:05");
  const a2 = secN(["T", "R"], "10:00", "11:05");
  it("true when different sections are blocked by different planned courses", () => {
    // a1 blocked by B (every B section overlaps a1), a2 blocked by C
    const B = [secN(["M"], "08:30", "09:35")];
    const C = [secN(["T"], "10:30", "11:35")];
    expect(provenNoSectionFits([a1, a2], [B, C])).toBe(true);
  });
  it("false when one section escapes every planned course", () => {
    const B = [secN(["M"], "08:30", "09:35")];
    expect(provenNoSectionFits([a1, a2], [B])).toBe(false);
  });
  it("false when a course section has TBA times (block unprovable)", () => {
    const B = [secN(["M"], "08:30", "09:35")];
    expect(provenNoSectionFits([secN(["M"], null, null)], [B])).toBe(false);
  });
  it("false when the blocking course has a TBA section (not ALL overlap)", () => {
    const B = [secN(["M"], "08:30", "09:35"), secN([], null, null)];
    expect(provenNoSectionFits([a1], [B])).toBe(false);
  });
  it("false with no planned courses or no course sections", () => {
    expect(provenNoSectionFits([], [[a1]])).toBe(false);
    expect(provenNoSectionFits([a1], [])).toBe(false);
  });
});

/**
 * The professor's lecture+lab requirement: "Conflict detection must consider
 * every selected component." Both a course's lecture and its lab are ordinary
 * timed events, so they must each be checked against everything else on the
 * schedule — including against each other.
 */
describe("multi-component conflict detection", () => {
  const lecture = {
    id: "chem11-lecture",
    label: "CHEM 11 Lecture 1",
    meetingDays: ["M", "W", "F"],
    startTime: "08:00",
    endTime: "09:05",
  };
  const lab = {
    id: "chem11-lab",
    label: "CHEM 11 Lab 13",
    meetingDays: ["M"],
    startTime: "14:15",
    endTime: "17:05",
  };

  it("reports no conflict for a real CHEM 11 lecture and lab pair", () => {
    expect(findEventConflicts([lecture, lab])).toHaveLength(0);
  });

  it("detects a course that overlaps only the lab, not the lecture", () => {
    const clashesWithLabOnly = {
      id: "other",
      label: "MATH 12",
      meetingDays: ["M"],
      startTime: "15:00",
      endTime: "16:05",
    };
    const conflicts = findEventConflicts([lecture, lab, clashesWithLabOnly]);
    expect(conflicts).toHaveLength(1);
    const labels = [conflicts[0]!.a.label, conflicts[0]!.b.label];
    expect(labels).toContain("CHEM 11 Lab 13");
    expect(labels).not.toContain("CHEM 11 Lecture 1");
  });

  it("detects a course that overlaps only the lecture, not the lab", () => {
    const clashesWithLectureOnly = {
      id: "other",
      label: "PHYS 31",
      meetingDays: ["W"],
      startTime: "08:30",
      endTime: "09:35",
    };
    const conflicts = findEventConflicts([lecture, lab, clashesWithLectureOnly]);
    expect(conflicts).toHaveLength(1);
    const labels = [conflicts[0]!.a.label, conflicts[0]!.b.label];
    expect(labels).toContain("CHEM 11 Lecture 1");
  });

  it("detects a lab that overlaps its own lecture", () => {
    const overlappingLab = { ...lab, startTime: "08:30", endTime: "11:20" };
    expect(findEventConflicts([lecture, overlappingLab])).not.toHaveLength(0);
  });

  it("ignores a tentative component whose meeting time is still TBA", () => {
    const tbaLab = { ...lab, meetingDays: [], startTime: "", endTime: "" };
    expect(findEventConflicts([lecture, tbaLab])).toHaveLength(0);
  });
});

describe("layoutDayEvents", () => {
  it("gives non-overlapping events their own full-width column", () => {
    const slots = layoutDayEvents([
      { id: 1, startTime: "08:00", endTime: "09:00" },
      { id: 2, startTime: "10:00", endTime: "11:00" },
    ]);
    expect(slots).toEqual(
      expect.arrayContaining([
        { id: 1, column: 0, columnCount: 1 },
        { id: 2, column: 0, columnCount: 1 },
      ]),
    );
  });

  it("splits two overlapping events into two side-by-side columns instead of hiding one", () => {
    const slots = layoutDayEvents([
      { id: "A", startTime: "10:00", endTime: "10:50" },
      { id: "B", startTime: "10:30", endTime: "11:20" },
    ]);
    const byId = new Map(slots.map((s) => [s.id, s]));
    expect(byId.get("A")!.columnCount).toBe(2);
    expect(byId.get("B")!.columnCount).toBe(2);
    expect(byId.get("A")!.column).not.toBe(byId.get("B")!.column);
  });

  it("reuses a freed column for a later event that no longer overlaps", () => {
    const slots = layoutDayEvents([
      { id: 1, startTime: "09:00", endTime: "10:00" },
      { id: 2, startTime: "09:30", endTime: "10:30" },
      { id: 3, startTime: "10:15", endTime: "11:00" },
    ]);
    const byId = new Map(slots.map((s) => [s.id, s]));
    expect(byId.get(1)!.columnCount).toBe(2);
    expect(byId.get(3)!.column).toBe(byId.get(1)!.column);
  });

  it("gives an event with unparseable/TBA times its own slot instead of dropping it", () => {
    const slots = layoutDayEvents([
      { id: 1, startTime: "", endTime: "" },
      { id: 2, startTime: "09:00", endTime: "10:00" },
    ]);
    const byId = new Map(slots.map((s) => [s.id, s]));
    expect(byId.get(1)).toEqual({ id: 1, column: 0, columnCount: 1 });
    expect(byId.get(2)).toEqual({ id: 2, column: 0, columnCount: 1 });
  });
});
