/**
 * Instructor-name normalization for the Professors directory.
 *
 * Imported schedule data occasionally carries artifacts such as a leading
 * period (". Sunwolf"), duplicated whitespace, or stray punctuation. These
 * must be cleaned WITHOUT damaging legitimate names (O'Brien, de la Cruz,
 * Smith-Jones, single-word legal names like Sunwolf).
 */

const PLACEHOLDER_NAMES = new Set(["tba", "staff", "to be announced", "tbd"]);

/**
 * Clean visual artifacts from an imported instructor name.
 * - strips leading/trailing punctuation artifacts (periods, commas, hyphens
 *   and whitespace that cannot start/end a real name)
 * - collapses internal duplicate whitespace
 * Returns "" when nothing name-like remains.
 */
export function normalizeInstructorName(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  // Strip leading chars that are not letters (covers ". Sunwolf", ", Smith").
  name = name.replace(/^[^\p{L}]+/u, "");
  // Strip trailing punctuation artifacts but keep "Jr." style suffix periods.
  name = name.replace(/[,;:\-\s]+$/u, "");
  return name.trim();
}

/**
 * True when the (normalized) name identifies a real person rather than a
 * TBA/Staff placeholder. Placeholders must be rendered as "Instructor TBA",
 * never given a professor profile.
 */
export function isRealInstructorName(raw: string): boolean {
  const n = normalizeInstructorName(raw).toLowerCase();
  return n.length > 0 && !PLACEHOLDER_NAMES.has(n);
}
