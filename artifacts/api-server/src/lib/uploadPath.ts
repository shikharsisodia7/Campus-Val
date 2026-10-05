import { createHash } from "crypto";

/**
 * Deterministic, non-reversible owner segment embedded in upload object paths.
 * Binds a freshly minted upload path to the authenticated requester without
 * requiring any pre-upload GCS metadata writes (which are unsupported on
 * objects that do not exist yet).
 */
export function uploadPathOwnerSegment(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

/**
 * The ONLY object-path shape any storage provider mints:
 * /objects/uploads/<16-hex owner segment>/<lowercase UUID>.
 * Anything else — extra segments, "..", encoded characters, a trailing
 * slash — is refused, so an ownership check can never be satisfied by a path
 * that resolves somewhere else once a provider turns it into a storage key or
 * URL (a URL parser collapses "/a/../b" to "/b").
 */
export const UPLOAD_OBJECT_PATH_RE =
  /^\/objects\/uploads\/([0-9a-f]{16})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** True when the given /objects/ path has the exact minted shape AND was minted for this user. */
export function isUploadPathOwnedBy(objectPath: string, userId: string): boolean {
  const m = UPLOAD_OBJECT_PATH_RE.exec(objectPath);
  return !!m && m[1] === uploadPathOwnerSegment(userId);
}
