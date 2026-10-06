/**
 * Normalized Bulletin snapshots, one file per edition, and the diff between two.
 *
 * The sidebar is built from data compiled into the API. A snapshot freezes what
 * that data produced for one Bulletin edition: every program's groups and
 * requirements with stable keys and provenance, no student data. Snapshots
 * allow auditing ("what did 2026-27 say about Biology?"), proofreading, and the
 * old-versus-new comparison a cohort-curriculum workflow will need.
 *
 * An edition's snapshot is written once and never overwritten by a later
 * edition: producing the next edition's file leaves the previous one untouched
 * (see scripts/snapshot-bulletin.ts).
 */
import { listPrograms, programTree } from "../department/programs";
import { findBulletinEdition } from "./editions";

export const SNAPSHOT_VERSION = 1;

export interface SnapshotItem {
  stableKey: string;
  label: string;
  description: string;
  courses: string[];
  phase: string | null;
}

export interface SnapshotGroup {
  stableKey: string;
  category: string;
  kind: string;
  title: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceVersion: string | null;
  lastVerified: string | null;
  sourceProgram: string | null;
  notes: string[];
  items: SnapshotItem[];
}

export interface BulletinSnapshot {
  snapshotVersion: number;
  edition: string;
  editionLabel: string;
  statedAs: string;
  provider: string;
  /** Every distinct group (the University Core of a school appears once, not once per major). */
  groups: Record<string, SnapshotGroup>;
  /** program key -> the group keys a student with only that program sees, in order. */
  programs: Record<string, { type: string; title: string; college: string; groupKeys: string[] }>;
}

export function buildBulletinSnapshot(editionId: string): BulletinSnapshot {
  const edition = findBulletinEdition(editionId);
  if (!edition) throw new Error(`The ${editionId} Bulletin is not loaded; there is nothing to snapshot.`);
  const groups: Record<string, SnapshotGroup> = {};
  const programs: BulletinSnapshot["programs"] = {};
  let provider = "";
  for (const info of listPrograms()) {
    const built = programTree(info.programKey)!;
    if (built.edition !== editionId) throw new Error(`Programs are built from the ${built.edition} Bulletin, not ${editionId}.`);
    const keys: string[] = [];
    for (const node of built.tree) {
      keys.push(node.stableKey);
      provider = node.provider;
      groups[node.stableKey] ??= {
        stableKey: node.stableKey,
        category: node.category,
        kind: node.group.kind,
        title: node.group.title,
        sourceUrl: node.provenance.sourceIdentifier,
        sourceLabel: node.provenance.sourceLabel,
        sourceVersion: node.provenance.sourceVersion,
        lastVerified: node.provenance.lastVerified,
        sourceProgram: node.provenance.sourceProgram,
        notes: node.group.notes ?? [],
        items: node.items.map((entry) => ({
          stableKey: entry.stableKey,
          label: entry.item.label,
          description: entry.item.description,
          courses: entry.item.courses,
          phase: entry.item.phase ?? null,
        })),
      };
    }
    programs[info.programKey] = { type: info.type, title: info.title, college: info.college, groupKeys: keys };
  }
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    edition: edition.id,
    editionLabel: edition.label,
    statedAs: edition.statedAs,
    provider,
    groups: Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))),
    programs: Object.fromEntries(Object.entries(programs).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export const serializeSnapshot = (snapshot: BulletinSnapshot): string => JSON.stringify(snapshot, null, 1) + "\n";

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface RequirementChange {
  stableKey: string;
  group: string;
  before: SnapshotItem;
  after: SnapshotItem;
  /** What differs: label, description (units appear here), courses. */
  fields: ("label" | "description" | "courses")[];
  coursesAdded: string[];
  coursesRemoved: string[];
}

export interface SnapshotDiff {
  from: string;
  to: string;
  groupsAdded: string[];
  groupsRemoved: string[];
  programsAdded: string[];
  programsRemoved: string[];
  requirementsAdded: { stableKey: string; group: string; label: string }[];
  requirementsRemoved: { stableKey: string; group: string; label: string }[];
  requirementsChanged: RequirementChange[];
  /** Requirements whose description (the place unit counts are stated) changed. */
  unitTextChanged: string[];
}

export function diffSnapshots(from: BulletinSnapshot, to: BulletinSnapshot): SnapshotDiff {
  const keys = (o: object) => Object.keys(o);
  const diff: SnapshotDiff = {
    from: from.edition,
    to: to.edition,
    groupsAdded: keys(to.groups).filter((k) => !(k in from.groups)),
    groupsRemoved: keys(from.groups).filter((k) => !(k in to.groups)),
    programsAdded: keys(to.programs).filter((k) => !(k in from.programs)),
    programsRemoved: keys(from.programs).filter((k) => !(k in to.programs)),
    requirementsAdded: [],
    requirementsRemoved: [],
    requirementsChanged: [],
    unitTextChanged: [],
  };
  const index = (s: BulletinSnapshot) => {
    const m = new Map<string, { group: string; item: SnapshotItem }>();
    for (const g of Object.values(s.groups)) for (const i of g.items) m.set(i.stableKey, { group: g.title, item: i });
    return m;
  };
  const a = index(from);
  const b = index(to);
  for (const [key, { group, item }] of b) if (!a.has(key)) diff.requirementsAdded.push({ stableKey: key, group, label: item.label });
  for (const [key, { group, item }] of a) if (!b.has(key)) diff.requirementsRemoved.push({ stableKey: key, group, label: item.label });
  for (const [key, before] of a) {
    const after = b.get(key);
    if (!after) continue;
    const fields: RequirementChange["fields"] = [];
    if (before.item.label !== after.item.label) fields.push("label");
    if (before.item.description !== after.item.description) fields.push("description");
    const bc = [...before.item.courses].sort().join("|");
    const ac = [...after.item.courses].sort().join("|");
    if (bc !== ac) fields.push("courses");
    if (fields.length === 0) continue;
    diff.requirementsChanged.push({
      stableKey: key,
      group: after.group,
      before: before.item,
      after: after.item,
      fields,
      coursesAdded: after.item.courses.filter((c) => !before.item.courses.includes(c)),
      coursesRemoved: before.item.courses.filter((c) => !after.item.courses.includes(c)),
    });
    if (fields.includes("description") && /\b\d+(\.\d+)? units?\b/i.test(`${before.item.description} ${after.item.description}`)) diff.unitTextChanged.push(key);
  }
  return diff;
}

export const isEmptyDiff = (d: SnapshotDiff): boolean =>
  d.groupsAdded.length + d.groupsRemoved.length + d.programsAdded.length + d.programsRemoved.length +
    d.requirementsAdded.length + d.requirementsRemoved.length + d.requirementsChanged.length === 0;
