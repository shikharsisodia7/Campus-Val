import { Readable } from "stream";
import { issueSignedToken, presignUrl } from "@vercel/blob";

import { uploadPathOwnerSegment, isUploadPathOwnedBy } from "../uploadPath";
import type {
  DownloadedObject,
  PrivateObjectStorage,
  StorageMetadata,
  UploadTarget,
} from "./types";
import { ObjectNotFoundError } from "./types";

const PUT_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min, matches Replit's 900s signed PUT URL
const READ_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Vercel Blob provider for the production runtime. Every object lives in a
 * PRIVATE Blob store — access is only ever granted through short-lived
 * signed URLs scoped to a single pathname, never a public/listable URL.
 *
 * Ownership is derived entirely from the pathname (see uploadPath.ts): the
 * server always mints the pathname for the authenticated caller, so there is
 * no separate ACL-metadata step to run after upload (unlike the GCS
 * provider, which needs one because GCS won't accept metadata writes on
 * objects that don't exist yet).
 */
export class VercelBlobObjectStorageProvider implements PrivateObjectStorage {
  async createUploadTarget(
    owner: string,
    opts?: { contentType?: string; maxSizeBytes?: number },
  ): Promise<UploadTarget> {
    const objectId = crypto.randomUUID();
    const ownerSegment = uploadPathOwnerSegment(owner);
    const pathname = `progress-reports/${ownerSegment}/${objectId}`;
    const objectPath = `/objects/uploads/${ownerSegment}/${objectId}`;

    const token = await issueSignedToken({
      pathname,
      operations: ["put"],
      allowedContentTypes: opts?.contentType ? [opts.contentType] : undefined,
      maximumSizeInBytes: opts?.maxSizeBytes,
      validUntil: Date.now() + PUT_TOKEN_TTL_MS,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: "put",
      pathname,
      access: "private",
      allowedContentTypes: opts?.contentType ? [opts.contentType] : undefined,
      maximumSizeInBytes: opts?.maxSizeBytes,
      addRandomSuffix: false,
      allowOverwrite: true,
      validUntil: Date.now() + PUT_TOKEN_TTL_MS,
    });

    return { uploadURL: presignedUrl, objectPath };
  }

  isUploadPathOwnedBy(objectPath: string, owner: string): boolean {
    return isUploadPathOwnedBy(objectPath, owner);
  }

  // No-op: ownership is fully derived from the pathname at mint time, and
  // Blob has no equivalent of GCS's post-hoc custom-metadata ACL write.
  async finalizeUpload(): Promise<void> {
    return;
  }

  async canRead(objectPath: string, userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    return isUploadPathOwnedBy(objectPath, userId);
  }

  private toPathname(objectPath: string): string {
    // objectPath shape: /objects/uploads/<ownerSegment>/<uuid>
    const parts = objectPath.replace(/^\/objects\/uploads\//, "");
    if (parts === objectPath) {
      throw new ObjectNotFoundError();
    }
    return `progress-reports/${parts}`;
  }

  private async presignedGet(pathname: string, operation: "get" | "head"): Promise<string> {
    const token = await issueSignedToken({
      pathname,
      operations: [operation],
      validUntil: Date.now() + READ_TOKEN_TTL_MS,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation,
      pathname,
      access: "private",
      useCache: false,
    });
    return presignedUrl;
  }

  async getMetadata(objectPath: string): Promise<StorageMetadata> {
    const pathname = this.toPathname(objectPath);
    const url = await this.presignedGet(pathname, "head");
    const res = await fetch(url, { method: "HEAD" });
    if (res.status === 404) throw new ObjectNotFoundError();
    if (!res.ok) throw new Error(`Failed to read object metadata (${res.status})`);
    return {
      size: Number(res.headers.get("content-length") ?? 0),
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  }

  async downloadObject(objectPath: string): Promise<DownloadedObject> {
    const pathname = this.toPathname(objectPath);
    const url = await this.presignedGet(pathname, "get");
    const res = await fetch(url);
    if (res.status === 404) throw new ObjectNotFoundError();
    if (!res.ok || !res.body) throw new Error(`Failed to download object (${res.status})`);
    return {
      stream: Readable.fromWeb(res.body as unknown as import("stream/web").ReadableStream),
      contentType: res.headers.get("content-type") || "application/octet-stream",
      size: res.headers.has("content-length") ? Number(res.headers.get("content-length")) : undefined,
    };
  }

  async deleteObject(objectPath: string): Promise<void> {
    const pathname = this.toPathname(objectPath);
    const token = await issueSignedToken({
      pathname,
      operations: ["delete"],
      validUntil: Date.now() + READ_TOKEN_TTL_MS,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: "delete",
      pathname,
      access: "private",
    });
    const res = await fetch(presignedUrl, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete object (${res.status})`);
    }
  }
}
