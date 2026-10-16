/**
 * Degree Completion Assessment: automatic result + the student's corrections.
 *
 * The automatic result is recomputed from the APR on every request and never
 * stored. A correction is stored beside it (degree_completion_overrides) and
 * never replaces it: the response always carries both, so "Reset to APR-based
 * assessment" is one delete away.
 *
 * Replacing the APR file keeps the document id, so a correction finds its row
 * again by the row's stable key. If that row now says something different
 * (fingerprint), the correction is NOT applied silently: it is kept, flagged
 * `sourceChanged`, and the automatic result shows until the student confirms or
 * resets it. A correction whose row is gone is listed as orphaned.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, degreeCompletionOverridesTable, type DegreeCompletionOverrideRow } from "@workspace/db";
import { cleanText } from "../requirement-customizations";
import {
  ASSESSMENT_RULE_VERSION,
  REASON_TEXT,
  type AssessmentItem,
  type AssessmentOptions,
  type AssessmentState,
  type WorkbookAssessment,
} from "./engine";

export const ASSESSMENT_DISCLAIMER =
  "CampusVal's Degree Completion Assessment is a planning aid generated from your uploaded APR. Verify all requirements against Workday. Workday is the definitive reference for degree completion.";

export const MAX_ASSESSMENT_NOTE = 600;

export type Effective = "remaining" | "appears_complete" | "needs_review" | "complete_for_planning";
export type Confidence = AssessmentState | "USER_CORRECTED";

export interface CorrectionView {
  status: "remaining" | "complete" | null;
  hidden: boolean;
  note: string | null;
  /** The APR row changed since the correction was made: it is not applied until confirmed. */
  sourceChanged: boolean;
  updatedAt: string;
}

export interface AssessmentItemView {
  key: string;
  label: string;
  aprStatus: string | null;
  remaining: string | null;
  remainingKind: string | null;
  remainingAmount: number | null;
  registrations: { text: string; inProgress: boolean }[];
  group: string;
  groupKind: string;
  automatic: { state: AssessmentState; reason: string; explanation: string };
  correction: CorrectionView | null;
  effective: Effective;
  confidence: Confidence;
  adjusted: boolean;
  /** For proofing (shown to admins / developers only): exactly where and why. */
  trace: { sheet: string; sheetIndex: number; row: number; block: string | null; blockIndex: number; rule: string; ruleVersion: string; fingerprint: string };
}

export interface AssessmentProgramView {
  key: string;
  sheet: string;
  block: string | null;
  items: AssessmentItemView[];
  summary: AssessmentSummary;
}

export interface AssessmentSummary {
  remaining: number;
  needsReview: number;
  appearsComplete: number;
  adjusted: number;
  hidden: number;
}

export interface OrphanedCorrection {
  itemKey: string;
  sourceLabel: string;
  status: "remaining" | "complete" | null;
  hidden: boolean;
  note: string | null;
  updatedAt: string;
}

const automaticEffective: Record<AssessmentState, Effective> = {
  CLEAR_REMAINING: "remaining",
  LIKELY_COMPLETE: "appears_complete",
  AMBIGUOUS: "needs_review",
};

const asStatus = (v: string | null): "remaining" | "complete" | null => (v === "remaining" || v === "complete" ? v : null);

function itemView(item: AssessmentItem, row: DegreeCompletionOverrideRow | undefined): AssessmentItemView {
  const sourceChanged = !!row && row.sourceFingerprint !== item.fingerprint;
  const correction: CorrectionView | null = row
    ? {
        status: asStatus(row.statusOverride),
        hidden: row.hidden,
        note: row.note,
        sourceChanged,
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
  const applied = correction && !sourceChanged && correction.status ? correction.status : null;
  const effective: Effective = applied === "remaining" ? "remaining" : applied === "complete" ? "complete_for_planning" : automaticEffective[item.derived.state];
  return {
    key: item.key,
    label: item.label,
    aprStatus: item.aprStatus,
    remaining: item.remaining?.text ?? null,
    remainingKind: item.remaining?.kind ?? null,
    remainingAmount: item.remaining?.amount ?? null,
    registrations: item.registrations,
    group: item.source.group,
    groupKind: item.source.groupKind,
    automatic: { state: item.derived.state, reason: item.derived.reason, explanation: REASON_TEXT[item.derived.reason] },
    correction,
    effective,
    confidence: applied ? "USER_CORRECTED" : item.derived.state,
    adjusted: applied !== null,
    trace: {
      sheet: item.source.sheet,
      sheetIndex: item.source.sheetIndex,
      row: item.source.row,
      block: item.source.block,
      blockIndex: item.source.blockIndex,
      rule: item.derived.reason,
      ruleVersion: ASSESSMENT_RULE_VERSION,
      fingerprint: item.fingerprint,
    },
  };
}

export function summarize(items: AssessmentItemView[]): AssessmentSummary {
  const hiddenNow = (i: AssessmentItemView) => !!i.correction?.hidden && !i.correction.sourceChanged;
  const shown = items.filter((i) => !hiddenNow(i));
  return {
    remaining: shown.filter((i) => i.effective === "remaining").length,
    needsReview: shown.filter((i) => i.effective === "needs_review").length,
    appearsComplete: shown.filter((i) => i.effective === "appears_complete" || i.effective === "complete_for_planning").length,
    adjusted: shown.filter((i) => i.adjusted).length,
    hidden: items.length - shown.length,
  };
}

/** Pure: an automatic assessment + stored corrections -> what the student sees. */
export function mergeCorrections(assessment: WorkbookAssessment, corrections: DegreeCompletionOverrideRow[]) {
  const byKey = new Map(corrections.map((c) => [c.itemKey, c]));
  const seen = new Set<string>();
  const programs: AssessmentProgramView[] = assessment.programs.map((program) => {
    const items = program.items.map((item) => {
      seen.add(item.key);
      return itemView(item, byKey.get(item.key));
    });
    return { key: program.key, sheet: program.sheet, block: program.block, items, summary: summarize(items) };
  });
  const orphaned: OrphanedCorrection[] = corrections
    .filter((c) => !seen.has(c.itemKey))
    .map((c) => ({
      itemKey: c.itemKey,
      sourceLabel: c.sourceLabel,
      status: asStatus(c.statusOverride),
      hidden: c.hidden,
      note: c.note,
      updatedAt: c.updatedAt.toISOString(),
    }));
  return { programs, orphaned, summary: summarize(programs.flatMap((p) => p.items)) };
}

export function findItem(assessment: WorkbookAssessment, key: string): AssessmentItem | null {
  for (const program of assessment.programs) for (const item of program.items) if (item.key === key) return item;
  return null;
}

// ─── configuration ───────────────────────────────────────────────────────────

/**
 * Explicit opt-in for the private Degree Completion Assessment R&D surface.
 *
 * The engine stays exercised in tests, but no production/pilot user should be
 * able to reach its derived academic claims unless an operator deliberately
 * enables the internal feature.  This intentionally does not reuse the old
 * "on unless false" switch: a missing deployment variable must fail closed.
 */
export function assessmentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["ENABLE_DEGREE_COMPLETION_RND"]?.trim().toLowerCase() === "true";
}

/** The Registrar-dependent subrule, off unless DEGREE_COMPLETION_IN_PROGRESS_REMAINING_IS_ADDITIONAL=true. */
export function assessmentOptions(env: NodeJS.ProcessEnv = process.env): AssessmentOptions {
  return { inProgressRemainingIsAdditional: env["DEGREE_COMPLETION_IN_PROGRESS_REMAINING_IS_ADDITIONAL"]?.trim().toLowerCase() === "true" };
}

// ─── persistence (always scoped to the signed-in owner) ─────────────────────

export async function listCorrections(userId: string, documentIds: number[]): Promise<DegreeCompletionOverrideRow[]> {
  if (documentIds.length === 0) return [];
  return db
    .select()
    .from(degreeCompletionOverridesTable)
    .where(and(eq(degreeCompletionOverridesTable.userId, userId), inArray(degreeCompletionOverridesTable.aprDocumentId, documentIds)));
}

export interface CorrectionPatch {
  status?: "remaining" | "complete" | null;
  hidden?: boolean;
  note?: string | null;
}

export class AssessmentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Save the student's correction of one row. The caller has already proved the
 * document is the student's. A patch that leaves nothing to keep removes the
 * correction (the automatic result shows again).
 */
export async function saveCorrection(
  userId: string,
  documentId: number,
  item: AssessmentItem,
  patch: CorrectionPatch,
): Promise<DegreeCompletionOverrideRow | null> {
  const [existing] = await db
    .select()
    .from(degreeCompletionOverridesTable)
    .where(
      and(
        eq(degreeCompletionOverridesTable.userId, userId),
        eq(degreeCompletionOverridesTable.aprDocumentId, documentId),
        eq(degreeCompletionOverridesTable.itemKey, item.key),
      ),
    )
    .limit(1);
  const status = patch.status !== undefined ? patch.status : asStatus(existing?.statusOverride ?? null);
  const hidden = patch.hidden !== undefined ? patch.hidden : (existing?.hidden ?? false);
  const note = patch.note !== undefined ? cleanText(patch.note, MAX_ASSESSMENT_NOTE, true) : (existing?.note ?? null);
  if (status === null && !hidden && note === null) {
    if (existing) await db.delete(degreeCompletionOverridesTable).where(eq(degreeCompletionOverridesTable.id, existing.id));
    return null;
  }
  // Saving always re-anchors to what the row says NOW: that is how a student confirms a correction after the APR changed.
  const values = { statusOverride: status, hidden, note, sourceFingerprint: item.fingerprint, sourceLabel: item.label };
  if (existing) {
    const [row] = await db.update(degreeCompletionOverridesTable).set(values).where(eq(degreeCompletionOverridesTable.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db
    .insert(degreeCompletionOverridesTable)
    .values({ userId, aprDocumentId: documentId, itemKey: item.key, ...values })
    .returning();
  return row!;
}

/** Reset to the APR-based assessment. Works for an orphaned correction too. */
export async function deleteCorrection(userId: string, documentId: number, itemKey: string): Promise<boolean> {
  const rows = await db
    .delete(degreeCompletionOverridesTable)
    .where(
      and(
        eq(degreeCompletionOverridesTable.userId, userId),
        eq(degreeCompletionOverridesTable.aprDocumentId, documentId),
        eq(degreeCompletionOverridesTable.itemKey, itemKey),
      ),
    )
    .returning({ id: degreeCompletionOverridesTable.id });
  return rows.length > 0;
}
