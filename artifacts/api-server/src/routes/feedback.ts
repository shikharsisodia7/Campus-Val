import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, feedbackTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";

const router: IRouter = Router();

const CATEGORIES = ["general", "bug", "feature", "data", "course"] as const;

// "Report Error / Suggest Changes" dialog types (Part 3.1 of the professor
// follow-up spec). Distinct from the plain-page CATEGORIES above - both
// write into the same feedback table, but only the dialog sets `type`.
export const REPORT_TYPES = [
  "incorrect_info",
  "broken_feature",
  "suggest_correction",
  "suggest_feature",
  "other",
] as const;

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
] as const;

const submitSchema = z.object({
  category: z.enum(CATEGORIES).default("general"),
  message: z.string().trim().min(4, "Please add a little more detail.").max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  page: z.string().trim().max(200).optional(),
  // Optional "Report Error / Suggest Changes" fields. Present when the
  // header dialog submits; absent for the plain /feedback page.
  type: z.enum(REPORT_TYPES).optional(),
  subject: z.string().trim().max(200).optional(),
  feature: z.string().trim().max(100).optional(),
  pathname: z.string().trim().max(300).optional(),
  academicItem: z.string().trim().max(200).optional(),
  officialSourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v.length === 0 || z.url().safeParse(v).success, {
      message: "That doesn't look like a valid URL.",
    })
    .optional(),
  proposedCorrection: z.string().trim().max(2000).optional(),
});

router.post("/feedback", requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid feedback.",
    });
  }
  const {
    category,
    message,
    rating,
    page,
    type,
    subject,
    feature,
    pathname,
    academicItem,
    officialSourceUrl,
    proposedCorrection,
  } = parsed.data;
  const [row] = await db
    .insert(feedbackTable)
    .values({
      userId: req.userId!,
      email: req.userEmail ?? null,
      category,
      message,
      rating: rating ?? null,
      page: page ?? null,
      type: type ?? null,
      subject: subject ?? null,
      feature: feature ?? null,
      pathname: pathname ?? null,
      academicItem: academicItem ?? null,
      officialSourceUrl: officialSourceUrl || null,
      proposedCorrection: proposedCorrection ?? null,
    })
    .returning();
  req.log.info({ feedbackId: row?.id, category, type }, "feedback submitted");
  res.status(201).json({ ok: true, id: row?.id });
});

router.get("/feedback/mine", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(feedbackTable)
    .where(eq(feedbackTable.userId, req.userId!))
    .orderBy(desc(feedbackTable.createdAt))
    .limit(50);
  res.json({
    feedback: rows.map((r) => ({
      id: r.id,
      category: r.category,
      message: r.message,
      rating: r.rating,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

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

const listQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
});

// Admin-only review queue for both feedback entry points. No enumeration by
// non-admins - requireAdmin runs after requireAuth so a signed-out request
// still 401s, and a signed-in non-admin gets 403 rather than an empty list
// (empty vs. forbidden would let a user infer whether feedback exists).
router.get("/admin/feedback", requireAuth, requireAdmin, async (req, res) => {
  const parsedQuery = listQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: "Invalid status filter." });
  }
  const { status } = parsedQuery.data;
  const rows = await db
    .select()
    .from(feedbackTable)
    .where(status ? eq(feedbackTable.status, status) : undefined)
    .orderBy(desc(feedbackTable.createdAt))
    .limit(500);
  res.json({
    feedback: rows.map((r) => ({
      id: r.id,
      email: r.email,
      category: r.category,
      message: r.message,
      rating: r.rating,
      page: r.page,
      status: r.status,
      type: r.type,
      subject: r.subject,
      feature: r.feature,
      pathname: r.pathname,
      academicItem: r.academicItem,
      officialSourceUrl: r.officialSourceUrl,
      proposedCorrection: r.proposedCorrection,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolvedBy: r.resolvedBy,
    })),
  });
});

const patchSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
});

router.patch("/admin/feedback/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid feedback id." });
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid status.",
    });
  }
  const { status } = parsed.data;
  const isTerminal = status === "RESOLVED" || status === "DISMISSED";
  const [row] = await db
    .update(feedbackTable)
    .set({
      status,
      updatedAt: new Date(),
      resolvedAt: isTerminal ? new Date() : null,
      resolvedBy: isTerminal ? req.userEmail! : null,
    })
    .where(eq(feedbackTable.id, id))
    .returning();
  if (!row) {
    return res.status(404).json({ error: "Feedback report not found." });
  }
  res.json({ ok: true, id: row.id, status: row.status });
});

export default router;