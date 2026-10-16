import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";
import { hasAnyAdminScope, loadAdminScopes } from "../lib/department/authz";
import { assessmentEnabled } from "../lib/degree-completion/service";

const router: IRouter = Router();

/**
 * The one signal the frontend needs to decide between the reduced core-nav
 * "tester" experience and the full nav an admin needs (Part 15/16 of the
 * controlled-rollout spec). Deliberately just a boolean derived from the
 * existing server-side ADMIN_EMAILS allowlist — no separate client-visible
 * role table, and never a hardcoded email list in the bundle.
 */
router.get("/me/role", requireAuth, async (req, res) => {
  // isDepartmentAdmin only decides whether the UI links to Program Requirements
  // Admin. The admin API re-checks scope on every request (lib/department/authz.ts).
  const scopes = await loadAdminScopes(req.userEmail!);
  const isAdmin = isAdminUser(req.userEmail!);
  res.json({
    isAdmin,
    isDepartmentAdmin: hasAnyAdminScope(scopes),
    // This is an authorization capability, not a client-controlled flag.  It
    // is false for every ordinary pilot user even when the server operator has
    // enabled the internal R&D experiment.
    canUseDegreeCompletionRND: isAdmin && assessmentEnabled(),
  });
});

export default router;
