/**
 * Bulletin editions CampusVal can build the requirements sidebar from.
 *
 * The sidebar's structural baseline is the Undergraduate Bulletin, and by
 * default the MOST RECENT edition CampusVal has loaded. The edition is data,
 * not a constant scattered through the UI: department notes, department
 * overrides and snapshots are all keyed by it, a requirement's full identity
 * is (edition, stable key), and a second edition can be added without
 * touching the sidebar. Students do not choose an edition yet; a student on
 * an older curriculum uses the plan-scoped edits (hide, add, My Note).
 *
 * Only editions whose requirement data is actually loaded belong here. An older
 * edition is registered when its data is imported (see docs/BULLETIN_BASELINE.md);
 * asking for one that is not registered is an error, never a silent substitute.
 */
export interface BulletinEdition {
  /** "2026-27". Sorts lexically. Part of every note/override key. */
  id: string;
  label: string;
  /** How the data states its own edition (the group's `academicYear`). */
  statedAs: string;
  /** When the data was last checked against the Bulletin (ISO date). */
  verifiedOn: string;
  status: "active" | "archived";
}

export const BULLETIN_EDITIONS: readonly BulletinEdition[] = [
  {
    id: "2026-27",
    label: "2026-27 Undergraduate Bulletin",
    statedAs: "2025-26 / 2026-27 Undergraduate Bulletin",
    verifiedOn: "2026-07-23",
    status: "active",
  },
];

export class BulletinEditionNotLoadedError extends Error {
  constructor(readonly requested: string) {
    super(`The ${requested} Undergraduate Bulletin is not loaded in CampusVal.`);
    this.name = "BulletinEditionNotLoadedError";
  }
}

/** The newest registered edition. */
export function latestBulletinEdition(editions: readonly BulletinEdition[] = BULLETIN_EDITIONS): BulletinEdition {
  const sorted = [...editions].sort((a, b) => b.id.localeCompare(a.id));
  const latest = sorted[0];
  if (!latest) throw new Error("No Bulletin edition is registered.");
  return latest;
}

export function findBulletinEdition(
  id: string,
  editions: readonly BulletinEdition[] = BULLETIN_EDITIONS,
): BulletinEdition | null {
  return editions.find((e) => e.id === id) ?? null;
}

export interface EditionResolution {
  edition: BulletinEdition;
  /** "default" = the latest; "environment" = REQUIREMENTS_BULLETIN_EDITION. */
  from: "default" | "environment" | "request";
  /** Set when a configured edition is unusable. Never echoes the value. */
  warning: string | null;
}

/**
 * Which edition builds the sidebar. A request may name one (a future version
 * selector); otherwise the server setting REQUIREMENTS_BULLETIN_EDITION; otherwise
 * the latest. An unknown value from the SETTING falls back to the latest with a
 * warning; an unknown value from a REQUEST throws (the caller names an edition
 * that does not exist).
 */
export function resolveBulletinEdition(
  requested: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
  editions: readonly BulletinEdition[] = BULLETIN_EDITIONS,
): EditionResolution {
  if (requested) {
    const found = findBulletinEdition(requested, editions);
    if (!found) throw new BulletinEditionNotLoadedError(requested);
    return { edition: found, from: "request", warning: null };
  }
  const configured = env.REQUIREMENTS_BULLETIN_EDITION?.trim();
  if (configured) {
    const found = findBulletinEdition(configured, editions);
    if (found) return { edition: found, from: "environment", warning: null };
    return {
      edition: latestBulletinEdition(editions),
      from: "default",
      warning: "REQUIREMENTS_BULLETIN_EDITION names an edition that is not loaded; using the latest.",
    };
  }
  return { edition: latestBulletinEdition(editions), from: "default", warning: null };
}
