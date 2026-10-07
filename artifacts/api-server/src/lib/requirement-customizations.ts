/**
 * Storage for a student's PLAN-SCOPED requirement customizations.
 *
 * These are planning overlays over the sidebar (see lib/requirements-source/
 * overlay.ts). Nothing here reads or writes a source requirement, the APR or a
 * Degree Checksheet. Callers must already have verified that the plan belongs
 * to the signed-in user; every function here is keyed by plan id.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  requirementCustomizationsTable,
  type RequirementCustomizationRow,
} from "@workspace/db";

/**
 * The table arrives with migration 0005, which production applies by hand
 * (docs/SCU_DEPLOYMENT.md). Until it is applied the sidebar must still load, so
 * "the table does not exist" (Postgres 42P01) is recognised and treated as
 * "customizations are not available yet", never as a reason to fail the
 * requirements, the plan, or a plan duplication.
 */
export function isMissingCustomizationTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: any = error; e && !seen.has(e); e = e.cause) {
    seen.add(e);
    if (e.code === "42P01") return true;
  }
  return false;
}

/** Catalog course codes only, normalized, unique, at most 8. Null when any is not in the catalog. */
export function cleanCourseCodes(codes: string[] | undefined | null, isCatalogCode: (c: string) => boolean): string[] | null {
  const out: string[] = [];
  for (const raw of codes ?? []) {
    const code = raw.trim().toUpperCase().replace(/\s+/g, " ");
    if (!code) continue;
    if (!isCatalogCode(code)) return null;
    if (!out.includes(code)) out.push(code);
  }
  return out.length > 8 ? null : out;
}

export const MAX_SOURCE_EDITS_PER_PLAN = 400;
export const MAX_CUSTOM_REQUIREMENTS_PER_PLAN = 60;

/** Plain text only: control characters removed, whitespace tidied. Rendered escaped. */
export function cleanText(value: string | null | undefined, maxLength: number, multiline: boolean): string | null {
  if (value === null || value === undefined) return null;
  // eslint-disable-next-line no-control-regex
  let text = value.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, " ");
  text = multiline ? text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ");
  text = text.trim().slice(0, maxLength);
  return text === "" ? null : text;
}

export async function listCustomizations(planId: number): Promise<RequirementCustomizationRow[]> {
  return db
    .select()
    .from(requirementCustomizationsTable)
    .where(eq(requirementCustomizationsTable.planId, planId));
}

export async function countCustomizations(planId: number, entryType: "source_edit" | "custom"): Promise<number> {
  const rows = await db
    .select({ id: requirementCustomizationsTable.id })
    .from(requirementCustomizationsTable)
    .where(
      and(
        eq(requirementCustomizationsTable.planId, planId),
        eq(requirementCustomizationsTable.entryType, entryType),
      ),
    );
  return rows.length;
}

/**
 * Independent copies of one plan's customizations for another plan of the same
 * owner (duplicate / copy-into-tentative). Editing the copy afterwards never
 * touches the original.
 */
export async function copyCustomizations(fromPlanId: number, toPlanId: number, userId: string): Promise<number> {
  let rows: RequirementCustomizationRow[];
  try {
    rows = await listCustomizations(fromPlanId);
  } catch (error) {
    if (isMissingCustomizationTable(error)) return 0; // nothing can exist yet
    throw error;
  }
  if (rows.length === 0) return 0;
  await db.insert(requirementCustomizationsTable).values(
    rows.map((r) => ({
      planId: toPlanId,
      userId,
      entryType: r.entryType,
      targetKey: r.targetKey,
      groupKey: r.groupKey,
      title: r.title,
      note: r.note,
      hidden: r.hidden,
      done: r.done,
      courseCodes: r.courseCodes,
      position: r.position,
      baseFingerprint: r.baseFingerprint,
      baseTitle: r.baseTitle,
      baseSourceVersion: r.baseSourceVersion,
      baseSourceType: r.baseSourceType,
      noteSourceType: r.noteSourceType,
      noteSourceDocumentId: r.noteSourceDocumentId,
      noteSourceLabel: r.noteSourceLabel,
      noteSourceAnchor: r.noteSourceAnchor,
      updatedBy: userId,
    })),
  );
  return rows.length;
}

export async function deleteCustomizations(planId: number, ids?: number[]): Promise<void> {
  if (ids && ids.length === 0) return;
  await db
    .delete(requirementCustomizationsTable)
    .where(
      ids
        ? and(eq(requirementCustomizationsTable.planId, planId), inArray(requirementCustomizationsTable.id, ids))
        : eq(requirementCustomizationsTable.planId, planId),
    );
}
