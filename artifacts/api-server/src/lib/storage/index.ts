import type { PrivateObjectStorage } from "./types";
import { isStorageProviderConfigured, resolveStorageProvider } from "../config";

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
  return isStorageProviderConfigured();
}

/** Test seam: drop the memoised provider so a changed environment is re-read. */
export function resetPrivateObjectStorageForTests(): void {
  cached = null;
}

/**
 * Selects the private object storage provider for the current runtime
 * (see `resolveStorageProvider` in ../config for the exact rules):
 *   - "vercel-blob": Vercel Blob, private access, signed per-pathname URLs.
 *   - "local": a private directory on the host's filesystem (universities,
 *     VMs, containers with a persistent volume) — no cloud dependency.
 *   - "gcs": a private Google Cloud Storage bucket (SCU's GCP / Cloud Run).
 *   - "replit": the original Replit object-storage sidecar.
 * An explicit PRIVATE_STORAGE_PROVIDER always wins; otherwise the platform
 * is inferred (VERCEL → blob, PRIVATE_STORAGE_DIR → local, PRIVATE_OBJECT_DIR
 * → replit), which is exactly the pre-existing behaviour.
 *
 * Providers are loaded via dynamic import (not a static top-level import) so
 * that only the provider actually selected pulls in its dependencies —
 * critically, @google-cloud/storage (used only by the Replit provider) must
 * never be eagerly resolved on Vercel, where it isn't installed.
 */
export async function getPrivateObjectStorage(): Promise<PrivateObjectStorage> {
  if (cached) return cached;

  const provider = resolveStorageProvider();

  if (provider === "vercel-blob") {
    const { VercelBlobObjectStorageProvider } = await import("./vercelBlobProvider");
    cached = new VercelBlobObjectStorageProvider();
    return cached;
  }

  if (provider === "gcs") {
    const { GcsObjectStorageProvider } = await import("./gcsProvider");
    cached = new GcsObjectStorageProvider();
    return cached;
  }

  if (provider === "local") {
    const { LocalFilesystemObjectStorageProvider } = await import("./localProvider");
    cached = new LocalFilesystemObjectStorageProvider();
    return cached;
  }

  const { ReplitObjectStorageProvider } = await import("./replitProvider");
  cached = new ReplitObjectStorageProvider();
  return cached;
}
