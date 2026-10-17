/**
 * Brings a note imported from a checklist BEFORE the canonical-resource registry
 * existed (a "legacy" import) to what the current deterministic extractor says
 * about the same cell. Only an importer-owned row is ever changed: once a person
 * has edited, reviewed or archived a note it is theirs, and this never touches it.
 *
 * Used when an extractor rule changes (a dated note is now held for review; a
 * theme row is now anchored by its course list) so a legacy import does not keep
 * the old answer while a fresh import would give the new one.
 */
import type { NoteCandidate } from "./checklist-notes";

export interface LegacyNoteRow {
  id: number;
  status: string;
  targetKey: string | null;
  noteKind: string | null;
  body: string;
  sourceAnchorText: string | null;
  canonicalResourceId: number | null;
  origin: string;
  reviewedBy: string | null;
  createdBy: string;
  updatedBy: string;
}

export type ReconcileDecision =
  | { action: "unchanged" }
  | { action: "skip"; why: string }
  | { action: "update"; next: { status: NoteCandidate["status"]; targetKey: string | null; noteKind: string | null } };

export function reconcileLegacyNote(row: LegacyNoteRow, candidate: NoteCandidate): ReconcileDecision {
  if (row.canonicalResourceId !== null || row.origin !== "imported") return { action: "skip", why: "not a legacy import" };
  if (row.reviewedBy || row.updatedBy !== row.createdBy || row.status === "archived") {
    return { action: "skip", why: "a person has edited, reviewed or archived it" };
  }
  // The same cell must still say the same thing, beside the same label; otherwise it is a different note.
  if (row.body !== candidate.body || (row.sourceAnchorText ?? "") !== candidate.rowLabel) {
    return { action: "skip", why: "the cell no longer says what was imported" };
  }
  const next = { status: candidate.status, targetKey: candidate.targetKey, noteKind: candidate.kind };
  if (row.status === next.status && row.targetKey === next.targetKey && row.noteKind === next.noteKind) return { action: "unchanged" };
  return { action: "update", next };
}
