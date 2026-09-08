/**
 * Feature/page options for the "Report Error / Suggest Changes" dialog
 * (docs/FEEDBACK_AND_ERROR_REPORTING.md). Kept separate from AppShell's nav
 * labels because the professor asked for a few specific wordings (e.g.
 * "APR / Academic Progress" rather than the nav's "Progress Report") that
 * read better in a report form than in a nav link.
 */
export const FEATURE_OPTIONS = [
  "Dashboard",
  "Degree Plan",
  "Tentative Degree Plan",
  "Quarter Plan",
  "Course Catalog",
  "APR / Academic Progress",
  "Advisor Sharing",
  "Graduation Paths",
  "GPA Calculator",
  "Transfer Credit",
  "Sync Workday Sections",
  "SCU Resources",
  "Advice Board",
  "Planning Support",
  "Voice Planning Support",
  "SCU Policies",
  "AI Evaluation",
  "Other",
] as const;

const PATH_TO_FEATURE: Record<string, (typeof FEATURE_OPTIONS)[number]> = {
  "/": "Dashboard",
  "/degree-plan": "Degree Plan",
  "/tentative-plans": "Tentative Degree Plan",
  "/planner": "Quarter Plan",
  "/courses": "Course Catalog",
  "/progress-report": "APR / Academic Progress",
  "/shared-with-me": "Advisor Sharing",
  "/graduation-paths": "Graduation Paths",
  "/gpa": "GPA Calculator",
  "/transfer": "Transfer Credit",
  "/sync-workday": "Sync Workday Sections",
  "/resources": "SCU Resources",
  "/advice": "Advice Board",
  "/advisor": "Planning Support",
  "/voice": "Voice Planning Support",
  "/policies": "SCU Policies",
  "/evaluation": "AI Evaluation",
};

/** Best-effort feature label for a pathname; falls back to "Other". */
export function detectFeatureFromPath(pathname: string): (typeof FEATURE_OPTIONS)[number] {
  if (PATH_TO_FEATURE[pathname]) return PATH_TO_FEATURE[pathname];
  const prefixMatch = Object.keys(PATH_TO_FEATURE)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return prefixMatch ? PATH_TO_FEATURE[prefixMatch]! : "Other";
}

export const REPORT_TYPE_OPTIONS = [
  { value: "incorrect_info", label: "Incorrect academic information" },
  { value: "broken_feature", label: "Broken feature / technical issue" },
  { value: "suggest_correction", label: "Suggest a correction" },
  { value: "suggest_feature", label: "Suggest a feature or change" },
  { value: "other", label: "Other" },
] as const;

export type ReportType = (typeof REPORT_TYPE_OPTIONS)[number]["value"];