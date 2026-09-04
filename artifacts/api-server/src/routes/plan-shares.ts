import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  academicPlansTable,
  planSharesTable,
  studentProfilesTable,
  type PlanShareRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { itemDto, itemsOf } from "./plans";

const router: IRouter = Router();

// "apr" is intentionally not a valid scope: no advisor-facing route reads
// APR data, so accepting the scope would silently promise access that
// doesn't exist. See docs/ADVISOR_SHARING.md.
const VALID_SCOPES = new Set(["degree_plan", "tentative_degree_plan"]);
const DEFAULT_SCOPES = ["degree_plan"];

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // Same shape check the rest of the app uses for reviewer/admin allowlists —
  // good enough to reject garbage input without pretending to validate
  // deliverability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function shareDto(row: PlanShareRow) {
  return {
    id: row.id,
    advisorEmail: row.advisorEmail,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
    status: row.revokedAt ? "revoked" : "active",
  };
}

/**
 * Active (non-revoked) share for this exact (student, advisor) pair, if any.
 * The single server-side authorization check every advisor-facing route
 * below relies on — never inferred from a hidden button or route obscurity.
 */
async function activeShare(
  studentUserId: string,
  advisorEmail: string,
): Promise<PlanShareRow | null> {
  const rows = await db
    .select()
    .from(planSharesTable)
    .where(
      and(
        eq(planSharesTable.studentUserId, studentUserId),
        eq(planSharesTable.advisorEmail, advisorEmail),
        isNull(planSharesTable.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Student-side: grant, list, revoke. Identity is always the verified caller
// (req.userId) — a student can only ever manage grants on THEIR OWN plans.
// ---------------------------------------------------------------------------

router.post("/plan-shares", requireAuth, async (req, res) => {
  const studentUserId = req.userId!;
  const advisorEmail = normalizeEmail(req.body?.advisorEmail);
  if (!advisorEmail) {
    return res.status(400).json({ error: "A valid advisor email is required." });
  }
  if (advisorEmail === req.userEmail?.toLowerCase()) {
    return res.status(400).json({ error: "You cannot share a plan with yourself." });
  }

  const requestedScopes: unknown = req.body?.scopes;
  const scopes = Array.isArray(requestedScopes) && requestedScopes.length > 0
    ? Array.from(new Set(requestedScopes.filter((s) => VALID_SCOPES.has(s))))
    : DEFAULT_SCOPES;
  if (scopes.length === 0) {
    return res.status(400).json({ error: "At least one valid scope is required." });
  }

  const existing = await db
    .select()
    .from(planSharesTable)
    .where(
      and(
        eq(planSharesTable.studentUserId, studentUserId),
        eq(planSharesTable.advisorEmail, advisorEmail),
      ),
    )
    .limit(1);

  if (existing[0]) {
    // Re-sharing (including un-revoking) updates the existing row rather
    // than creating a duplicate grant for the same advisor.
    const [updated] = await db
      .update(planSharesTable)
      .set({ scopes, revokedAt: null })
      .where(eq(planSharesTable.id, existing[0].id))
      .returning();
    return res.status(200).json(shareDto(updated));
  }

  const [created] = await db
    .insert(planSharesTable)
    .values({ studentUserId, advisorEmail, scopes })
    .returning();
  res.status(201).json(shareDto(created));
});

// Who currently has access to my plan(s).
router.get("/plan-shares", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(planSharesTable)
    .where(eq(planSharesTable.studentUserId, req.userId!))
    .orderBy(desc(planSharesTable.createdAt));
  res.json({ shares: rows.map(shareDto) });
});

router.delete("/plan-shares/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid share id." });
  }
  const rows = await db
    .select()
    .from(planSharesTable)
    .where(
      and(
        eq(planSharesTable.id, id),
        eq(planSharesTable.studentUserId, req.userId!),
      ),
    )
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Share not found." });

  const [revoked] = await db
    .update(planSharesTable)
    .set({ revokedAt: new Date() })
    .where(eq(planSharesTable.id, id))
    .returning();
  res.json(shareDto(revoked));
});

// ---------------------------------------------------------------------------
// Advisor-side: read-only. No campus-wide directory — an advisor only ever
// sees students who explicitly shared with THEIR verified sign-in email.
// ---------------------------------------------------------------------------

// "Shared with me" — students who granted this advisor access, not a directory.
router.get("/advisor/shared-students", requireAuth, async (req, res) => {
  const advisorEmail = req.userEmail?.toLowerCase();
  if (!advisorEmail) return res.status(401).json({ error: "Unauthorized" });

  const rows = await db
    .select()
    .from(planSharesTable)
    .where(
      and(
        eq(planSharesTable.advisorEmail, advisorEmail),
        isNull(planSharesTable.revokedAt),
      ),
    )
    .orderBy(desc(planSharesTable.createdAt));

  const studentIds = Array.from(new Set(rows.map((r) => r.studentUserId)));
  const profiles = studentIds.length
    ? await db.select().from(studentProfilesTable)
    : [];
  const profileByUserId = new Map(
    profiles
      .filter((p) => studentIds.includes(p.userId))
      .map((p) => [p.userId, p]),
  );

  res.json({
    students: rows.map((r) => ({
      shareId: r.id,
      studentUserId: r.studentUserId,
      scopes: r.scopes,
      sharedSince: r.createdAt.toISOString(),
      profile: profileByUserId.get(r.studentUserId)
        ? {
            name: profileByUserId.get(r.studentUserId)!.name ?? null,
            currentYear: profileByUserId.get(r.studentUserId)!.currentYear ?? null,
          }
        : null,
    })),
  });
});

// Read-only view of one shared student's Degree Plan (or Tentative Degree
// Plan, via ?planType=tentative). Every request re-checks an active,
// correctly-scoped share — never cached authorization.
router.get("/advisor/shared-students/:studentUserId/plan", requireAuth, async (req, res) => {
  const advisorEmail = req.userEmail?.toLowerCase();
  if (!advisorEmail) return res.status(401).json({ error: "Unauthorized" });

  const studentUserId = String(req.params.studentUserId);
  const share = await activeShare(studentUserId, advisorEmail);
  if (!share) {
    return res.status(403).json({ error: "This student has not shared a plan with you." });
  }

  const wantsTentative = req.query.planType === "tentative";
  const requiredScope = wantsTentative ? "tentative_degree_plan" : "degree_plan";
  if (!share.scopes.includes(requiredScope)) {
    return res.status(403).json({ error: "This share does not include that plan." });
  }

  const [plan] = await db
    .select()
    .from(academicPlansTable)
    .where(
      and(
        eq(academicPlansTable.userId, studentUserId),
        eq(academicPlansTable.planType, wantsTentative ? "tentative" : "degree"),
      ),
    )
    .orderBy(asc(academicPlansTable.id))
    .limit(1);
  if (!plan) return res.status(404).json({ error: "No plan found for this student." });

  const items = await itemsOf(plan.id);

  // Best-effort audit: record that the advisor actually opened this plan.
  await db
    .update(planSharesTable)
    .set({ lastViewedAt: new Date() })
    .where(eq(planSharesTable.id, share.id));

  res.json({
    id: plan.id,
    name: plan.name,
    planType: plan.planType,
    metadata: plan.metadata ?? {},
    items: items.map(itemDto),
    readOnly: true,
    sharedScopes: share.scopes,
  });
});

export default router;
