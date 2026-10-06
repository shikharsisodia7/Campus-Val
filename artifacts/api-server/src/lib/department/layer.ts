/**
 * The department layer: composes published Department Notes and global
 * Department overrides over the Bulletin-derived tree.
 *
 *     BULLETIN  +  DEPARTMENT LAYER  =  tree the student's own edits sit on
 *
 * Pure. The Bulletin tree it is given is never mutated: every changed group and
 * item is a copy, and an unchanged group is returned as the same object. What it
 * may change is exactly what a department may change in the planning view:
 *
 *   - a requirement's wording (title, description) and whether it is shown;
 *   - requirements the Bulletin does not list, marked as the department's own;
 *   - notes shown beside a requirement, a group, or a whole program.
 *
 * It never edits a Bulletin requirement's courses, and the BULLETIN
 * fingerprint of every item is carried through untouched, so a student's edit
 * stays anchored to the Bulletin and survives a department note or retitle.
 */
import type { NormalizedGroup, NormalizedItem } from "../requirements-source/normalize";
import { groupKeyOf } from "./programs";

/** What a student sees of a Department Note. */
export interface DepartmentNoteView {
  id: number;
  body: string;
  kind: string | null;
  programKey: string;
  /** "Biology": which program's department wrote it (matters on shared Core items). */
  programTitle: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  origin: "imported" | "admin";
  /** True once a person has reviewed it. An imported note shows "not yet reviewed". */
  reviewed: boolean;
  updatedAt: string;
}

export interface NoteRecord {
  id: number;
  programKey: string;
  targetKey: string | null;
  bulletinEdition: string;
  body: string;
  noteKind: string | null;
  status: string;
  origin: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  reviewedBy: string | null;
  updatedAt: Date;
}

export interface OverrideRecord {
  id: number;
  programKey: string;
  bulletinEdition: string;
  entryType: string; // edit | added
  targetKey: string;
  groupKey: string | null;
  title: string | null;
  description: string | null;
  hidden: boolean;
  courseCodes: string[];
  minimumCourses: number | null;
  position: number;
  baseFingerprint: string | null;
  baseTitle: string | null;
  baseSourceVersion: string | null;
  updatedAt: Date;
}

/** What marks an item or group the department touched. Sent to the browser. */
export interface DepartmentItemInfo {
  /** The department changed this requirement's wording. */
  overridden: boolean;
  /** The Bulletin's own wording, kept so it is one click away. */
  originalLabel: string | null;
  originalDescription: string | null;
  /** A requirement the department added; the Bulletin does not list it. */
  added: boolean;
  programKey: string;
  programTitle: string;
}

export interface LayerContext {
  edition: string | null;
  /** program key -> title, for labelling notes. */
  programTitles: ReadonlyMap<string, string>;
  completed: ReadonlySet<string>;
  planned: ReadonlySet<string>;
}

export interface LayerResult {
  tree: NormalizedGroup[];
  /** What was applied, for the audit and tests. */
  applied: { notes: number; overridden: number; hidden: number; added: number };
}

const norm = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, " ");

type Item = NormalizedItem["item"] & {
  autoTracked?: boolean;
  complete?: boolean;
  status?: string;
};

function noteView(note: NoteRecord, titles: ReadonlyMap<string, string>): DepartmentNoteView {
  return {
    id: note.id,
    body: note.body,
    kind: note.noteKind,
    programKey: note.programKey,
    programTitle: titles.get(note.programKey) ?? note.programKey,
    sourceLabel: note.sourceLabel,
    sourceUrl: note.sourceUrl,
    sourceReference: note.sourceReference,
    origin: note.origin === "imported" ? "imported" : "admin",
    reviewed: note.reviewedBy !== null,
    updatedAt: note.updatedAt.toISOString(),
  };
}

function recount(items: Item[]) {
  const auto = items.filter((i) => i.autoTracked);
  return {
    autoTrackedCount: auto.length,
    autoCompletedCount: auto.filter((i) => i.complete).length,
    manualCount: items.length - auto.length,
  };
}

function addedItem(row: OverrideRecord, ctx: LayerContext, programTitle: string): NormalizedItem {
  const codes = row.courseCodes.map(norm);
  const satisfiedBy = codes.filter((c) => ctx.completed.has(c));
  const plannedBy = codes.filter((c) => !ctx.completed.has(c) && ctx.planned.has(c));
  const minimum = Math.max(1, row.minimumCourses ?? 1);
  const status = codes.length > 0 && satisfiedBy.length >= minimum ? "completed" : plannedBy.length > 0 ? "planned" : "open";
  const stableKey = row.targetKey;
  const item = {
    id: `department-${stableKey.split("#dept:")[1] ?? row.id}`,
    label: row.title ?? "",
    description: row.description ?? "",
    courses: codes,
    phase: null,
    autoTracked: codes.length > 0,
    needsVerification: codes.length === 0,
    satisfiedBy,
    plannedBy,
    crossSatisfiedBy: [] as string[],
    coreArea: null,
    status,
    complete: status === "completed",
    department: {
      overridden: false,
      originalLabel: null,
      originalDescription: null,
      added: true,
      programKey: row.programKey,
      programTitle,
    } satisfies DepartmentItemInfo,
  };
  return { stableKey, fingerprint: `department:${row.id}`, item: item as unknown as NormalizedItem["item"] };
}

export function applyDepartmentLayer(
  tree: NormalizedGroup[],
  notes: readonly NoteRecord[],
  overrides: readonly OverrideRecord[],
  ctx: LayerContext,
): LayerResult {
  const present = new Set(tree.map((g) => g.stableKey));
  const applied = { notes: 0, overridden: 0, hidden: 0, added: 0 };

  const edition = ctx.edition;
  const liveNotes = notes.filter(
    (n) => n.status === "published" && (edition === null || n.bulletinEdition === edition) && present.has(n.programKey),
  );
  const liveOverrides = overrides.filter((o) => edition === null || o.bulletinEdition === edition);

  const editsByTarget = new Map<string, OverrideRecord>();
  const addsByGroup = new Map<string, OverrideRecord[]>();
  for (const row of liveOverrides) {
    if (row.entryType === "edit") editsByTarget.set(row.targetKey, row);
    else if (row.entryType === "added" && row.groupKey) {
      const list = addsByGroup.get(row.groupKey) ?? [];
      list.push(row);
      addsByGroup.set(row.groupKey, list);
    }
  }
  const notesByTarget = new Map<string, NoteRecord[]>();
  const programNotes = new Map<string, NoteRecord[]>();
  for (const note of liveNotes) {
    if (note.targetKey) {
      const list = notesByTarget.get(note.targetKey) ?? [];
      list.push(note);
      notesByTarget.set(note.targetKey, list);
    } else {
      const list = programNotes.get(note.programKey) ?? [];
      list.push(note);
      programNotes.set(note.programKey, list);
    }
  }
  const byId = (a: NoteRecord, b: NoteRecord) => a.id - b.id;

  const out = tree.map((node): NormalizedGroup => {
    const groupNotes = [...(notesByTarget.get(node.stableKey) ?? []), ...(programNotes.get(node.stableKey) ?? [])].sort(byId);
    const adds = (addsByGroup.get(node.stableKey) ?? []).slice().sort((a, b) => a.position - b.position || a.id - b.id);

    let structural = false;
    const items: NormalizedItem[] = [];
    for (const entry of node.items) {
      const edit = editsByTarget.get(entry.stableKey);
      const itemNotes = (notesByTarget.get(entry.stableKey) ?? []).slice().sort(byId);
      if (edit?.hidden) {
        applied.hidden += 1;
        structural = true;
        continue;
      }
      if (!edit && itemNotes.length === 0) {
        items.push(entry);
        continue;
      }
      const base = entry.item as Item;
      const retitled = !!edit && ((edit.title && edit.title !== base.label) || (edit.description && edit.description !== base.description));
      if (retitled) applied.overridden += 1;
      applied.notes += itemNotes.length;
      const next = {
        ...base,
        label: edit?.title || base.label,
        description: edit?.description || base.description,
        ...(itemNotes.length > 0 ? { departmentNotes: itemNotes.map((n) => noteView(n, ctx.programTitles)) } : {}),
        ...(retitled
          ? {
              department: {
                overridden: true,
                originalLabel: base.label,
                originalDescription: base.description,
                added: false,
                programKey: edit!.programKey,
                programTitle: ctx.programTitles.get(edit!.programKey) ?? edit!.programKey,
              } satisfies DepartmentItemInfo,
            }
          : {}),
      };
      // The Bulletin fingerprint is kept: a student's edit stays anchored to the Bulletin.
      items.push({ stableKey: entry.stableKey, fingerprint: entry.fingerprint, item: next as unknown as NormalizedItem["item"] });
    }

    for (const row of adds) {
      const added = addedItem(row, ctx, ctx.programTitles.get(row.programKey) ?? row.programKey);
      items.push(added);
      applied.added += 1;
      structural = true;
    }
    applied.notes += groupNotes.length;

    if (groupNotes.length === 0 && !structural && items.every((it, i) => it === node.items[i])) return node;

    const group = {
      ...node.group,
      ...(groupNotes.length > 0 ? { departmentNotes: groupNotes.map((n) => noteView(n, ctx.programTitles)) } : {}),
      ...(structural ? recount(items.map((i) => i.item as Item)) : {}),
      items: items.map((i) => i.item),
    };
    return { ...node, group: group as unknown as NormalizedGroup["group"], items };
  });

  return { tree: out, applied };
}

/** True when this stable key is one a department added. */
export const isDepartmentAddedKey = (stableKey: string): boolean => stableKey.includes("#dept:");

export { groupKeyOf };
