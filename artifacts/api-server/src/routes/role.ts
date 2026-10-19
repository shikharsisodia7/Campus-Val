import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";
import { hasAnyAdminScope, loadAdminScopes } from "../lib/department/authz";
import { assessmentEnabled } from "../lib/degree-completion/service";
import { accessDeniedMessage, decideAccess, getCurrentUser } from "../lib/auth";

const router: IRouter = Router();

/**
 * Whether the signed-in account may use CampusVal under the current access
 * mode (lib/auth/policy.ts). Deliberately NOT behind requireAuth: it is the
 * one question a signed-in-but-not-invited account needs answered, so the web
 * app can say so plainly instead of failing on every page. It returns only
 * the decision about the caller's own verified address — no allowlist, no
 * other account, no application data. Enforcement stays in requireUser.
 */
router.get("/me/access", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (!user.email) {
    res.json({ allowed: false, accessMode: null, message: "We couldn't read your email address from your account. Sign out and sign back in." });
    return;
  }
  const decision = await decideAccess(user.email);
  res.json({
    allowed: decision.allowed,
    accessMode: decision.mode,
    message: decision.allowed ? null : accessDeniedMessage(),
  });
});

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
