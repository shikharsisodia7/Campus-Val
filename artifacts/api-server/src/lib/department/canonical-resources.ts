/**
 * Rules shared by the Department Resource registry, importer, and tests.
 *
 * A canonical resource is an institution-controlled source document. It is
 * deliberately different from a student's Degree Checksheet upload: a
 * resource has a known program, school, public HTTPS source, version and
 * review trail before it can be imported into the global Department Notes
 * layer. Keeping the gate here makes it impossible for a new importer call
 * site to accidentally treat a private upload as authoritative.
 */

export const CANONICAL_RESOURCE_PROVENANCE_STATUSES = ["documented", "verified", "superseded", "rejected"] as const;
export type CanonicalResourceProvenanceStatus = (typeof CANONICAL_RESOURCE_PROVENANCE_STATUSES)[number];

export const CANONICAL_RESOURCE_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type CanonicalResourceReviewStatus = (typeof CANONICAL_RESOURCE_REVIEW_STATUSES)[number];

export const CANONICAL_RESOURCE_PUBLICATION_STATUSES = ["draft", "published", "archived"] as const;
export type CanonicalResourcePublicationStatus = (typeof CANONICAL_RESOURCE_PUBLICATION_STATUSES)[number];

export interface CanonicalResourceGate {
  provenanceStatus: string;
  reviewStatus: string;
  publicationStatus: string;
}

/** The identity the offline importer needs to match a vetted package file. */
export interface CanonicalResourceFileRegistration extends CanonicalResourceGate {
  sourceFileName: string;
}

/**
 * A source may feed global notes only after all three independent decisions
 * have been recorded.  In particular, a source that was once published but is
 * later superseded or archived stops contributing immediately.
 */
export function isCanonicalResourceReady(resource: CanonicalResourceGate): boolean {
  return (
    resource.provenanceStatus === "verified" &&
    resource.reviewStatus === "approved" &&
    resource.publicationStatus === "published"
  );
}

/** A concise safe explanation for an import report; never includes document contents. */
export function canonicalResourceBlocker(resource: CanonicalResourceGate): string | null {
  if (resource.provenanceStatus !== "verified") return `provenance is ${resource.provenanceStatus}, not verified`;
  if (resource.reviewStatus !== "approved") return `review is ${resource.reviewStatus}, not approved`;
  if (resource.publicationStatus !== "published") return `publication is ${resource.publicationStatus}, not published`;
  return null;
}

export type CanonicalResourceFileSelection<T> =
  | { resource: T; error: null }
  | { resource: null; error: string };

/**
 * Find the one current registry entry for a package file. File names are only
 * locators for an offline copy; they do not grant trust by themselves. A
 * duplicate active registration fails closed rather than selecting a version
 * based on directory order.
 */
export function selectCanonicalResourceForFile<T extends CanonicalResourceFileRegistration>(
  resources: readonly T[],
  fileName: string,
): CanonicalResourceFileSelection<T> {
  const normalized = fileName.trim().toLocaleLowerCase();
  const registered = resources.filter((resource) => resource.sourceFileName.trim().toLocaleLowerCase() === normalized);
  const active = registered.filter((resource) => resource.publicationStatus !== "archived");
  if (registered.length === 0) return { resource: null, error: "not registered as a canonical department resource" };
  if (active.length === 0) return { resource: null, error: "only archived canonical resource registrations exist" };
  if (active.length > 1) return { resource: null, error: "more than one active canonical resource registration has this file name" };
  return { resource: active[0]!, error: null };
}
