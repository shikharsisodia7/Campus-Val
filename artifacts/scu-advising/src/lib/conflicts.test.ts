import { describe, it, expect } from "vitest";
import {
  findEventConflicts,
  timeToMinutes,
  minutesToLabel,
  type TimedEvent,
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

describe("minutesToLabel", () => {
  it("formats AM/PM correctly", () => {
    expect(minutesToLabel(0)).toBe("12:00 AM");
    expect(minutesToLabel(8 * 60 + 5)).toBe("8:05 AM");
    expect(minutesToLabel(12 * 60)).toBe("12:00 PM");
    expect(minutesToLabel(21 * 60 + 30)).toBe("9:30 PM");
  });
});
