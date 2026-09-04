import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";

const router: IRouter = Router();

/**
 * The one signal the frontend needs to decide between the reduced core-nav
 * "tester" experience and the full nav an admin needs (Part 15/16 of the
 * controlled-rollout spec). Deliberately just a boolean derived from the
 * existing server-side ADMIN_EMAILS allowlist — no separate client-visible
 * role table, and never a hardcoded email list in the bundle.
 */
router.get("/me/role", requireAuth, async (req, res) => {
  res.json({ isAdmin: isAdminUser(req.userEmail!) });
});

export default router;
