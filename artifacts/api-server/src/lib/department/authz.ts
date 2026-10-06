/**
 * Who may maintain which program: decided here, on the server, for every
 * request.
 *
 *   super admin       an address in ADMIN_EMAILS (lib/admin.ts): every program,
 *                     plus granting and revoking scopes.
 *   department admin  an address with a row in program_admin_scopes: exactly
 *                     the programs of its rows.
 *   everyone else     no access to any of it.
 *
 * Identity is the verified address of the signed-in user (req.userEmail, set by
 * requireUser from the identity provider), never a role or program the browser
 * sends. A scope is keyed by email so it can be granted before the person first
 * signs in and, when SCU SSO arrives, mapped from an institutional group by
 * writing the same rows. The ids of the identity provider are not stored.
 */
import type { NextFunction, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, programAdminScopesTable } from "@workspace/db";
import { isAdminUser } from "../admin";
import { logger } from "../logger";

export const DEPARTMENT_ADMIN_ROLE = "department_admin";

export interface AdminScopes {
  email: string;
  superAdmin: boolean;
  /** Program keys this person may maintain (empty for a plain student). */
  programKeys: ReadonlySet<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminScopes?: AdminScopes;
    }
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

function isMissingTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: any = error; e && !seen.has(e); e = e.cause) {
    seen.add(e);
    if (e.code === "42P01") return true;
  }
  return false;
}

export async function loadAdminScopes(email: string): Promise<AdminScopes> {
  const normalized = normalizeEmail(email);
  const superAdmin = isAdminUser(normalized);
  let programKeys = new Set<string>();
  try {
    const rows = await db
      .select({ programKey: programAdminScopesTable.programKey })
      .from(programAdminScopesTable)
      .where(and(eq(programAdminScopesTable.email, normalized), isNull(programAdminScopesTable.revokedAt)));
    programKeys = new Set(rows.map((r) => r.programKey));
  } catch (error) {
    // Migration 0006 not applied yet: nobody has a scope. Super admins keep theirs.
    if (!isMissingTable(error)) throw error;
    logger.error({ event: "program_admin_scopes_table_missing" }, "program_admin_scopes is missing: apply database migration 0006");
  }
  return { email: normalized, superAdmin, programKeys };
}

export function canManageProgram(scopes: AdminScopes, programKey: string): boolean {
  return scopes.superAdmin || scopes.programKeys.has(programKey);
}

export const hasAnyAdminScope = (scopes: AdminScopes): boolean => scopes.superAdmin || scopes.programKeys.size > 0;

/**
 * Mount AFTER requireAuth. 403 unless the signed-in user is a super admin or
 * holds at least one program scope. Per-program checks still happen in each
 * handler: this only keeps students away from the admin API entirely.
 */
export async function requireDepartmentAccess(req: Request, res: Response, next: NextFunction) {
  const scopes = await loadAdminScopes(req.userEmail ?? "");
  if (!hasAnyAdminScope(scopes)) {
    return res.status(403).json({ error: "Department administrator access required" });
  }
  req.adminScopes = scopes;
  next();
}

/** Mount AFTER requireAuth. Super admins only (granting scopes). */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminUser(req.userEmail ?? "")) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
