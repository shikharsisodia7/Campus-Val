/**
 * Stable identifiers for requirement groups and items, and a fingerprint of
 * what a source requirement said.
 *
 * A student's customization is anchored to a requirement by its stable key,
 * never by array position, visible text or DOM index, so it survives reloads,
 * re-ordering and ordinary regeneration. The fingerprint lets the overlay
 * notice when the source requirement has since changed.
 *
 * Keys are derived only from identifiers the source data already carries
 * (group id, program name, item id). Nothing is hashed from student data.
 */
import { createHash } from "node:crypto";

export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

interface KeyedGroup {
  id: string;
  kind: string;
  title: string;
}
interface KeyedItem {
  id: string;
  label: string;
  description: string;
  courses: string[];
}

/** "Major Requirements — Computer Science (proposed)" -> "Computer Science". */
export function programNameOf(groupTitle: string): string {
  const afterDash = groupTitle.split(" — ").slice(1).join(" — ") || groupTitle;
  return afterDash.replace(/\s*\(proposed\)\s*$/i, "").trim();
}

/**
 * The group's key. A major group's response id is positional ("major-primary")
 * and the University Core's id is shared by all three schools while its
 * contents differ, so those are keyed by the program / school they describe.
 */
export function groupStableKey(group: KeyedGroup, collegeCode: string): string {
  switch (group.kind) {
    case "university_core":
      return `university-core:${collegeCode.toLowerCase()}`;
    case "major":
      return `major:${slug(programNameOf(group.title))}`;
    default:
      return group.id;
  }
}

/** The item's key: the group's key plus the item id with the group prefix removed. */
export function itemStableKey(group: KeyedGroup, groupKey: string, item: { id: string }): string {
  const prefix = `${group.id}-`;
  const suffix = item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id;
  return `${groupKey}#${suffix}`;
}

/**
 * What a source requirement said, for detecting that it has changed. Covers the
 * text and courses a student sees and the edition of the source; it does NOT
 * cover status, so completing a course never looks like a source change.
 */
export function requirementFingerprint(
  item: KeyedItem,
  sourceVersion: string | null,
  sourceType: string,
): string {
  const payload = JSON.stringify([
    sourceType,
    sourceVersion ?? "",
    item.label,
    item.description,
    [...item.courses].sort(),
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}
