/**
 * "APR is a university-record reference; Degree Plan is planning intent —
 * never silently merge the two, never overwrite the Degree Plan from the
 * APR" (professor feedback, 2026-09 pass).
 *
 * The upload/parse/replace/delete flow for the APR (progress-report.ts)
 * requires a real object-storage backend to exercise end-to-end, so this
 * locks in the invariant the same way this codebase already does for a
 * comparable cross-file regression (see planner.apr-shared.test.tsx):
 * source inspection is a reliable, fast guard against ever reintroducing a
 * write from one system into the other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const progressReportSource = readFileSync(
  join(import.meta.dirname, "progress-report.ts"),
  "utf-8",
);
const plansSource = readFileSync(join(import.meta.dirname, "plans.ts"), "utf-8");

describe("APR / Degree Plan independence", () => {
  it("progress-report.ts never imports or references the plan tables — an APR upload cannot write to a plan", () => {
    expect(progressReportSource).not.toMatch(/academicPlansTable/);
    expect(progressReportSource).not.toMatch(/planItemsTable/);
  });

  it("plans.ts never imports or references the progress-report table — a plan write cannot touch the APR", () => {
    expect(plansSource).not.toMatch(/progressReportsTable/);
  });

  it("progress-report.ts only ever READS studentProfilesTable (to verify the APR's own student ID matches, before accepting an upload) — it never writes to it, so an APR upload cannot mutate the profile's declared major/minor", () => {
    expect(progressReportSource).toMatch(/progressReportsTable/);
    // Read is fine (identity-verification check against a mismatched
    // upload); a write of any kind to the profile table is not.
    expect(progressReportSource).not.toMatch(/\.update\(studentProfilesTable/);
    expect(progressReportSource).not.toMatch(/\.insert\(studentProfilesTable/);
    expect(progressReportSource).not.toMatch(/\.delete\(studentProfilesTable/);
  });
});
