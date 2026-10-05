/**
 * Stable import point for route authentication. The implementation lives in
 * lib/auth (provider-independent interface + the Clerk adapter); routes keep
 * importing `requireAuth` from here so swapping Clerk for SCU SSO touches no
 * route file.
 */
export { requireUser as requireAuth, isApprovedCampusValUser, campusValUserType } from "../lib/auth";
