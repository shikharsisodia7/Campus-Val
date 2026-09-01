import { Router, type IRouter } from "express";
import { and, gte, sql } from "drizzle-orm";
import { db, usageEventsTable } from "@workspace/db";
import { requireAuth, campusValUserType } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";

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
  "four_year_plan",
  "plan_controls",
  "find_courses",
  "workday_handoff",
] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];
const FEATURE_SET = new Set<string>(USAGE_FEATURES);

function requireAdmin(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  if (!req.userEmail || !isAdminUser(req.userEmail)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

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
  res.status(204).end();
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
