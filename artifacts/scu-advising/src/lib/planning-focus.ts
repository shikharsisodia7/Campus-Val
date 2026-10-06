/**
 * "Show me where that went": after a student saves something into their Planning
 * Requirements from another region of the page (a Degree Checksheet row, for
 * example), the sidebar opens the group and scrolls to the requirement. A plain
 * DOM event, so the two regions stay independent components and nothing is
 * stored: if no sidebar is mounted, nothing happens.
 */
export const FOCUS_REQUIREMENT_EVENT = "campusval:focus-requirement";

export interface FocusRequirementDetail {
  /** The stable key of the requirement (or of its group, to open the group only). */
  stableKey: string;
}

export function focusRequirement(stableKey: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FocusRequirementDetail>(FOCUS_REQUIREMENT_EVENT, { detail: { stableKey } }));
}

/** The group a stable key belongs to ("major:biology#biol-1a" -> "major:biology"). */
export const groupKeyOfStableKey = (stableKey: string): string => stableKey.split("#")[0] ?? stableKey;
