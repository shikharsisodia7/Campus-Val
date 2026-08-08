import type { PrivateObjectStorage } from "./types";

export { ObjectNotFoundError } from "./types";
export type { PrivateObjectStorage, UploadTarget, StorageMetadata, DownloadedObject } from "./types";

let cached: PrivateObjectStorage | null = null;

/**
 * True when a private storage backend is actually configured for the
 * current runtime. Callers should treat the progress-report feature as
 * unavailable (503, not a crash) when this is false, e.g. in a local
 * checkout with no storage provisioned.
 */
export function isPrivateStorageConfigured(): boolean {
  if (process.env.VERCEL) {
    return !!process.env.BLOB_READ_WRITE_TOKEN;
  }
  return !!process.env.PRIVATE_OBJECT_DIR;
}

/**
 * Selects the private object storage provider for the current runtime.
 * - Vercel (process.env.VERCEL is set automatically by the platform):
 *   Vercel Blob, private access, signed per-pathname URLs.
 * - Everything else (local dev, Replit): the Replit object-storage sidecar,
 *   unchanged from before the Vercel migration.
 *
 * Providers are loaded via dynamic import (not a static top-level import) so
 * that only the provider actually selected pulls in its dependencies —
 * critically, @google-cloud/storage (used only by the Replit provider) must
 * never be eagerly resolved on Vercel, where it isn't installed.
 */
export async function getPrivateObjectStorage(): Promise<PrivateObjectStorage> {
  if (cached) return cached;

  if (process.env.VERCEL) {
    const { VercelBlobObjectStorageProvider } = await import("./vercelBlobProvider");
    cached = new VercelBlobObjectStorageProvider();
    return cached;
  }

  const { ReplitObjectStorageProvider } = await import("./replitProvider");
  cached = new ReplitObjectStorageProvider();
  return cached;
}
