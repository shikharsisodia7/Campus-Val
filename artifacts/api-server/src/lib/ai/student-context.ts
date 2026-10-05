/**
 * The ONLY student information CampusVal sends to an AI provider.
 *
 * FERPA data minimization: the advisor needs a student's program, timeline and
 * completed course codes to answer prerequisite / "what's left" questions, so
 * those are included. It does NOT need to know who the student is or what
 * their grades are, so these are never sent:
 *
 *   - name, email, SCU student ID, Clerk/auth user ID
 *   - cumulative GPA, major GPA, or any grade
 *   - Academic Progress Report (APR) files or their contents
 *   - saved quarter schedules
 *
 * When an answer depends on GPA (overload eligibility, probation, Dean's List),
 * the advisor prompt tells the model to ask; the student can choose to type it.
 * See docs/migration/AI_PROVIDER_MIGRATION.md.
 */
import type { studentProfilesTable } from "@workspace/db";

type Profile = typeof studentProfilesTable.$inferSelect;

export function buildAIStudentContext(p: Profile, opts: { includeTransferUnits?: boolean } = {}): string {
  const majors = [p.major, p.secondMajor, ...(p.additionalMajors ?? [])].filter((m): m is string => !!m);
  const minors = [p.minor, ...(p.additionalMinors ?? [])].filter((m): m is string => !!m);
  const lines = [
    `- Student type: ${p.studentType}`,
    `- College: ${p.college}`,
    `- Major(s): ${majors.join(" + ") || "(not set)"}${minors.length ? ` (minor: ${minors.join(", ")})` : ""}`,
    `- Start: ${p.startTerm} ${p.startYear}; expected graduation ${p.expectedGradTerm} ${p.expectedGradYear}`,
    `- Units completed at SCU: ${Number(p.unitsCompletedAtScu)}`,
  ];
  if (opts.includeTransferUnits !== false) lines.push(`- Units transferred in: ${Number(p.unitsTransferredIn)}`);
  lines.push(
    `- Priority registration: ${p.priorityRegistration ? "yes" : "no"}`,
    `- Currently in: ${p.currentTerm} ${p.currentYear}`,
    `- Completed courses: ${(p.completedCourseCodes ?? []).join(", ") || "(none provided)"}`,
    `- GPA: not shared with the AI advisor — ask the student if an answer depends on it.`,
  );
  return lines.join("\n");
}
