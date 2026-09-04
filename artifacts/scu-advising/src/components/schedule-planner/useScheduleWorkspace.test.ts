import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression coverage for a race found via live production testing while
 * verifying the Quarter Plan "click an intended course" fix: creating a
 * quarter's first schedule (`invalidateSchedules()` immediately followed by
 * `setActiveScheduleId(newId)`) could have that `activeScheduleId` clobbered
 * back to `null` a moment later. React Query keeps showing the last
 * *settled* schedules list while the invalidated query refetches in the
 * background, so `schedules` briefly still reads as the pre-creation empty
 * list — which hits this hook's own "no schedules → activeScheduleId = null"
 * branch and stomps the id a caller just set. That unmounts/remounts Find
 * Courses and silently drops any in-flight "jump to this course" intent
 * (observed on production: the intended-course chip created a schedule and
 * showed a toast, but the search box stayed empty instead of the clicked
 * course code). Full render coverage would need a fairly heavy react-query
 * mock for a generated Orval hook; a source check is enough to catch a
 * regression back to the un-guarded effect.
 */
const hookSource = readFileSync(
  join(import.meta.dirname, "useScheduleWorkspace.ts"),
  "utf-8",
);

describe("useScheduleWorkspace: activeScheduleId survives a schedule-list refetch", () => {
  it("does not decide activeScheduleId while the schedules list is still fetching", () => {
    expect(hookSource).toMatch(/isFetching:\s*isFetchingList/);
    expect(hookSource).toMatch(/if\s*\(isFetchingList\)\s*return;/);
  });
});
