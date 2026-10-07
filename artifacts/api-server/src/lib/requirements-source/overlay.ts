/**
 * Composes a student's planning customizations over the normalized source
 * requirements:
 *
 *     SOURCE REQUIREMENT  +  PLAN-SPECIFIC OVERRIDE  =  DISPLAYED REQUIREMENT
 *
 * Pure. It never writes, and it never changes what makes a requirement
 * complete: status, satisfiedBy, plannedBy, courses and every count come from
 * the source untouched. A student's edit can rename or annotate a requirement
 * or hide it from their own view; it cannot make a requirement satisfied. A
 * custom requirement is always open (its status is never "completed"), and its
 * "done" tick is the student's own note, not a claim about the degree.
 *
 * When the source requirement has changed since the student edited it (its
 * fingerprint, or the source that produced it, differs), the old edit is NOT
 * applied: the updated source is shown with `sourceChanged`, and the student
 * chooses to keep the edit or take the update.
 */
import type { NormalizedGroup, SourceGroup, SourceItem } from "./normalize";

export type CustomizationEntryType = "source_edit" | "custom";

/** A stored customization row (the fields the overlay reads). */
export interface StoredCustomization {
  entryType: CustomizationEntryType;
  targetKey: string;
  groupKey: string | null;
  title: string | null;
  note: string | null;
  hidden: boolean;
  done: boolean;
  courseCodes?: string[];
  position?: number;
  baseFingerprint: string | null;
  baseTitle: string | null;
  baseSourceVersion: string | null;
  baseSourceType: string | null;
  /** Where the note came from (a Degree Checksheet the student owns); provenance only. */
  noteSourceType?: string | null;
  noteSourceDocumentId?: number | null;
  noteSourceLabel?: string | null;
  noteSourceAnchor?: string | null;
  updatedAt: Date;
}

export interface ItemCustomization {
  kind: "edit" | "custom";
  /** Applied now: the label shown is the student's. */
  titleEdited: boolean;
  /** The student's title, stored whether or not it is applied. */
  title: string | null;
  note: string | null;
  /** The student chose to hide it. Only in effect while `sourceChanged` is false. */
  hidden: boolean;
  /** Custom requirements only: the student's own tick. */
  done: boolean;
  /** The source changed since this was edited; the edit is not applied. */
  sourceChanged: boolean;
  /** The source's label now (equal to `label` unless the title is edited). */
  originalLabel: string;
  originalDescription: string;
  labelAtEdit: string | null;
  sourceVersionAtEdit: string | null;
  sourceVersionNow: string | null;
  /** Set when the note was transferred from the student's own Degree Checksheet. */
  noteSource?: { type: "DEGREE_CHECKSHEET"; label: string; anchor: string | null; documentAvailable: boolean };
  updatedAt: string;
}

export type DisplayItem<I extends SourceItem = SourceItem> = I & {
  stableKey: string;
  customization?: ItemCustomization;
};
export type DisplayGroup<G extends SourceGroup = SourceGroup> = Omit<G, "items"> & {
  stableKey: string;
  items: DisplayItem<G["items"][number]>[];
};

export type OrphanReason = "requirement_not_in_source" | "program_not_in_plan";
export interface OrphanedCustomization {
  entryType: CustomizationEntryType;
  targetKey: string;
  groupKey: string | null;
  reason: OrphanReason;
  title: string | null;
  note: string | null;
  updatedAt: string;
}

export interface CustomizationSummary {
  edited: number;
  hidden: number;
  custom: number;
  sourceChanged: number;
  orphaned: number;
}

export interface OverlayResult<G extends SourceGroup = SourceGroup> {
  groups: DisplayGroup<G>[];
  orphaned: OrphanedCustomization[];
  summary: CustomizationSummary;
}

/** The provenance of a transferred note. The note itself is the student's; this only says where it came from. */
function noteSourceOf(row: StoredCustomization, available: ReadonlySet<number> | undefined): ItemCustomization["noteSource"] {
  if (!row.note || row.noteSourceType !== "DEGREE_CHECKSHEET" || !row.noteSourceLabel) return undefined;
  return {
    type: "DEGREE_CHECKSHEET",
    label: row.noteSourceLabel,
    anchor: row.noteSourceAnchor ?? null,
    // False once the document is deleted: the note stays, and says its source is gone.
    documentAvailable: row.noteSourceDocumentId != null && (available?.has(row.noteSourceDocumentId) ?? false),
  };
}

export function customRequirementId(targetKey: string): string {
  return `custom-${targetKey}`;
}

/**
 * Rows whose target is not in the source tree. Shared by the overlay (to show
 * them) and by the plan audit (to report them).
 */
export function findOrphanedCustomizations(
  tree: NormalizedGroup[],
  rows: StoredCustomization[],
): OrphanedCustomization[] {
  const groupKeys = new Set(tree.map((g) => g.stableKey));
  const itemKeys = new Set(tree.flatMap((g) => g.items.map((i) => i.stableKey)));
  const orphans: OrphanedCustomization[] = [];
  for (const row of rows) {
    let reason: OrphanReason | null = null;
    if (row.entryType === "source_edit") {
      if (!itemKeys.has(row.targetKey)) {
        const groupKey = row.targetKey.split("#")[0]!;
        reason = groupKeys.has(groupKey) ? "requirement_not_in_source" : "program_not_in_plan";
      }
    } else if (!row.groupKey || !groupKeys.has(row.groupKey)) {
      reason = "program_not_in_plan";
    }
    if (reason) {
      orphans.push({
        entryType: row.entryType,
        targetKey: row.targetKey,
        groupKey: row.groupKey,
        reason,
        title: row.title,
        note: row.note,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  }
  return orphans;
}

export function composeRequirementOverlay<G extends SourceGroup>(
  tree: NormalizedGroup<G>[],
  rows: StoredCustomization[],
  /** Ids of the student's Degree Checksheets that still exist (to tell a note its source is gone). */
  availableDocumentIds?: ReadonlySet<number>,
): OverlayResult<G> {
  const edits = new Map<string, StoredCustomization>();
  const customsByGroup = new Map<string, StoredCustomization[]>();
  for (const row of rows) {
    if (row.entryType === "source_edit") edits.set(row.targetKey, row);
    else if (row.groupKey) {
      const list = customsByGroup.get(row.groupKey) ?? [];
      list.push(row);
      customsByGroup.set(row.groupKey, list);
    }
  }

  const summary: CustomizationSummary = { edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 };

  const groups = tree.map((node): DisplayGroup<G> => {
    const items = node.items.map((entry): DisplayItem<G["items"][number]> => {
      const row = edits.get(entry.stableKey);
      if (!row) return { ...entry.item, stableKey: entry.stableKey };

      const sourceChanged =
        row.baseFingerprint !== entry.fingerprint || row.baseSourceType !== node.provider;
      const titleEdited = !sourceChanged && !!row.title;
      if (sourceChanged) summary.sourceChanged += 1;
      else {
        if (titleEdited || row.note) summary.edited += 1;
        if (row.hidden) summary.hidden += 1;
      }
      return {
        ...entry.item,
        label: titleEdited ? row.title! : entry.item.label,
        stableKey: entry.stableKey,
        customization: {
          kind: "edit",
          titleEdited,
          title: row.title,
          note: row.note,
          hidden: row.hidden,
          done: false,
          sourceChanged,
          originalLabel: entry.item.label,
          originalDescription: entry.item.description,
          labelAtEdit: row.baseTitle,
          sourceVersionAtEdit: row.baseSourceVersion,
          sourceVersionNow: node.provenance.sourceVersion,
          noteSource: noteSourceOf(row, availableDocumentIds),
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    });

    const customs = (customsByGroup.get(node.stableKey) ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(
      (row): DisplayItem<G["items"][number]> => {
        summary.custom += 1;
        return {
          id: customRequirementId(row.targetKey),
          label: row.title ?? "",
          description: "",
          // The student's own shortcuts: they can be added to the plan, but never
          // make the requirement satisfied or planned.
          courses: row.courseCodes ?? [],
          phase: null,
          autoTracked: false,
          needsVerification: false,
          satisfiedBy: [],
          plannedBy: [],
          crossSatisfiedBy: [],
          coreArea: null,
          // Never "completed": a custom requirement is the student's own note.
          status: "open",
          complete: false,
          stableKey: `${node.stableKey}#custom:${row.targetKey}`,
          customization: {
            kind: "custom",
            titleEdited: false,
            title: row.title,
            note: row.note,
            hidden: false,
            done: row.done,
            sourceChanged: false,
            originalLabel: "",
            originalDescription: "",
            labelAtEdit: null,
            sourceVersionAtEdit: null,
            sourceVersionNow: null,
            noteSource: noteSourceOf(row, availableDocumentIds),
            updatedAt: row.updatedAt.toISOString(),
          },
        } as unknown as DisplayItem<G["items"][number]>;
      },
    );

    return { ...node.group, stableKey: node.stableKey, items: [...items, ...customs] } as unknown as DisplayGroup<G>;
  });

  const orphaned = findOrphanedCustomizations(tree as NormalizedGroup[], rows);
  summary.orphaned = orphaned.length;
  return { groups, orphaned, summary };
}
