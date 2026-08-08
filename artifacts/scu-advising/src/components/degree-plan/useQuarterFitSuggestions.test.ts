import { describe, it, expect } from "vitest";
import { classifyQuarterFit } from "./useQuarterFitSuggestions";
import type { SectionTimeLike } from "@/lib/conflicts";

function s(days: string[], start?: string | null, end?: string | null): SectionTimeLike {
  return { meetingDays: days, startTime: start, endTime: end };
}

describe("classifyQuarterFit", () => {
  const a1 = s(["M", "W"], "08:00", "09:05");
  const a2 = s(["T", "R"], "10:00", "11:05");

  it("fits when a section provably avoids all planned courses", () => {
    expect(
      classifyQuarterFit([a1, a2], [[s(["M"], "08:30", "09:35")]]),
    ).toBe("fits");
  });

  it("fits in an empty quarter with a valid-timed section", () => {
    expect(classifyQuarterFit([a1], [])).toBe("fits");
  });

  it("no-fit when a single planned course blocks every section", () => {
    expect(
      classifyQuarterFit(
        [a1],
        [[s(["M"], "08:30", "09:35")]],
      ),
    ).toBe("no-fit");
  });

  it("no-fit when different sections are blocked by different planned courses", () => {
    const B = [s(["M"], "08:30", "09:35")];
    const C = [s(["T"], "10:30", "11:35")];
    expect(classifyQuarterFit([a1, a2], [B, C])).toBe("no-fit");
  });

  it("unverified when times are TBA — never guessed either way", () => {
    expect(classifyQuarterFit([s(["M"], null, null)], [])).toBe("unverified");
    expect(
      classifyQuarterFit([s([], null, null)], [[a1]]),
    ).toBe("unverified");
    expect(
      classifyQuarterFit([a1], [[s([], null, null)]]),
    ).toBe("unverified");
  });
});
