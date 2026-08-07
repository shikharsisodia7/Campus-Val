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

/** True when the given /objects/ path was minted for this user. */
export function isUploadPathOwnedBy(objectPath: string, userId: string): boolean {
  return objectPath.startsWith(`/objects/uploads/${uploadPathOwnerSegment(userId)}/`);
}
