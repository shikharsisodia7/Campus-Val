import { Router, type IRouter } from "express";
import { and, gte, sql } from "drizzle-orm";
import { db, usageEventsTable } from "@workspace/db";
import { requireAuth, campusValUserType } from "../middlewares/requireAuth";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

/**
 * The only feature names the server will record. Deliberately high-level —
 * "which product area", never a course code, grade, query string, or file
 * content. See docs/USAGE_ANALYTICS.md.
 */
export const USAGE_FEATURES = [
  "dashboard",
  "degree_plan",
  "tentative_degree_plan",
  "quarter_plan",
  "apr_upload",
  "degree_checksheets",
  "four_year_plan",
  "plan_controls",
  "find_courses",
  "workday_handoff",
  "feedback_submit",
  "requirement_customization",
] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];
const FEATURE_SET = new Set<string>(USAGE_FEATURES);

/** Admin dashboards: ADMIN_EMAILS allowlist (lib/auth/policy.ts). */
const requireAdmin = requireRole("admin");

// Fire-and-forget event from an authenticated client. Identity is taken from
// the verified session (req.userId/req.userEmail), never from the request
// body — a client can only ever report which feature IT visited, not who it
// visited as.
router.post("/usage-events", requireAuth, async (req, res) => {
  const feature = req.body?.feature;
  if (typeof feature !== "string" || !FEATURE_SET.has(feature)) {
    return res.status(400).json({ error: "Unknown feature" });
  }
  await db.insert(usageEventsTable).values({
    userId: req.userId!,
    userEmail: req.userEmail!,
    userType: campusValUserType(req.userEmail!),
    feature,
  });
  // See the identical comment in routes/progress-reports.ts DELETE: an empty
  // 204 body has been observed intermittently arriving at the client as a
  // platform-level 503 despite the handler completing successfully.
  res.status(200).json({ recorded: true });
});

// Admin-only: which source the requirements sidebar is built from, and that
// the benchmark policy is still to be decided. Says nothing about any student.
router.get("/admin/requirements-source", requireAuth, requireAdmin, async (_req, res) => {
  const { requirementsSourceStatus } = await import("../lib/requirements-source");
  res.json(requirementsSourceStatus());
});

// Admin-only provenance inspector: every group and requirement one program
// produces, with its stable key, fingerprint and where the data came from.
// Synthetic profile: no student data is read.
router.get("/admin/requirements-inspector", requireAuth, requireAdmin, async (req, res) => {
  const { inspectProgramRequirements } = await import("../lib/requirements-source/inspect");
  const major = typeof req.query.major === "string" ? req.query.major : "";
  const minor = typeof req.query.minor === "string" && req.query.minor ? req.query.minor : null;
  const result = inspectProgramRequirements(major, minor);
  if (!result) return res.status(404).json({ error: "Unknown major or minor code." });
  res.json(result);
});

// Admin-only: who is using CampusVal, how often, and which high-level
// features they use. No course codes, grades, APR content, or file content
// are ever stored, so there is nothing sensitive to redact here.
router.get("/admin/usage/summary", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      userId: usageEventsTable.userId,
      userEmail: usageEventsTable.userEmail,
      userType: usageEventsTable.userType,
      firstSeen: sql<string>`min(${usageEventsTable.createdAt})`,
      lastSeen: sql<string>`max(${usageEventsTable.createdAt})`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(usageEventsTable)
    .groupBy(usageEventsTable.userId, usageEventsTable.userEmail, usageEventsTable.userType)
    .orderBy(sql`max(${usageEventsTable.createdAt}) desc`);

  const features = await db
    .select({
      feature: usageEventsTable.feature,
      visitCount: sql<number>`count(*)::int`,
      uniqueUsers: sql<number>`count(distinct ${usageEventsTable.userId})::int`,
    })
    .from(usageEventsTable)
    .groupBy(usageEventsTable.feature)
    .orderBy(sql`count(*) desc`);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ activeUsers: sql<number>`count(distinct ${usageEventsTable.userId})::int` })
    .from(usageEventsTable)
    .where(and(gte(usageEventsTable.createdAt, sevenDaysAgo)));

  res.json({
    users,
    features,
    activeUsersLast7Days: recent?.activeUsers ?? 0,
  });
});

export default router;
