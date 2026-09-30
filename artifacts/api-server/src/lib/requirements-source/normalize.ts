/**
 * The normalized requirement tree: what every source produces and what the
 * sidebar, the overlay, the audit and the inspector all consume. The sidebar
 * never learns which source a requirement came from; it reads this.
 *
 *   group (University Core / school / major / minor / professional prep)
 *     └─ requirement item
 *
 * Every group and item carries a stable key and its provenance. The public
 * API sends the keys, never the provenance record.
 */
import type { RequirementProvenance, RequirementSourceType } from "./model";
import { groupStableKey, itemStableKey, requirementFingerprint } from "./stable-keys";

/** The response shape every provider must produce (structural, source-free). */
export interface SourceItem {
  id: string;
  label: string;
  description: string;
  courses: string[];
  phase?: string | null;
}
export interface SourceGroup {
  id: string;
  title: string;
  kind: string;
  academicYear?: string | null;
  notes?: string[];
  items: SourceItem[];
}
export interface SourceResponse {
  collegeCode: string;
  groups: SourceGroup[];
}

export interface NormalizedItem<I extends SourceItem = SourceItem> {
  stableKey: string;
  fingerprint: string;
  item: I;
}
export interface NormalizedGroup<G extends SourceGroup = SourceGroup> {
  stableKey: string;
  displayOrder: number;
  provider: RequirementSourceType;
  provenance: RequirementProvenance;
  group: G;
  items: NormalizedItem<G["items"][number]>[];
}

export function normalizeRequirements<R extends SourceResponse>(
  response: R,
  provenance: RequirementProvenance[],
  provider: RequirementSourceType,
): NormalizedGroup<R["groups"][number]>[] {
  if (provenance.length !== response.groups.length) {
    // A provider must describe every group it returns, in order; refuse a half-described tree.
    throw new Error(`Requirements provider "${provider}" returned ${response.groups.length} groups but ${provenance.length} provenance records.`);
  }
  return response.groups.map((group, index) => {
    const stableKey = groupStableKey(group, response.collegeCode);
    const record = provenance[index]!;
    return {
      stableKey,
      displayOrder: index,
      provider,
      provenance: record,
      group: group as R["groups"][number],
      items: group.items.map((item) => ({
        stableKey: itemStableKey(group, stableKey, item),
        fingerprint: requirementFingerprint(item, record.sourceVersion, provider),
        item: item as R["groups"][number]["items"][number],
      })),
    };
  });
}
