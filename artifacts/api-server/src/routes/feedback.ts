import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, feedbackTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const CATEGORIES = ["general", "bug", "feature", "data", "course"] as const;

const submitSchema = z.object({
  category: z.enum(CATEGORIES).default("general"),
  message: z.string().trim().min(4, "Please add a little more detail.").max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  page: z.string().trim().max(200).optional(),
});

router.post("/feedback", requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid feedback.",
    });
  }
  const { category, message, rating, page } = parsed.data;
  const [row] = await db
    .insert(feedbackTable)
    .values({
      userId: req.userId!,
      email: req.userEmail ?? null,
      category,
      message,
      rating: rating ?? null,
      page: page ?? null,
    })
    .returning();
  req.log.info({ feedbackId: row?.id, category }, "feedback submitted");
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

export default router;
