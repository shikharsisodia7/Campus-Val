import { randomUUID } from "crypto";
import { Readable } from "stream";
// Type-only: erased at compile time, so this never becomes a runtime import.
// The @google-cloud/storage *runtime* is loaded lazily below via
// getObjectStorageClient() — this provider must never force that package to
// resolve on Vercel, where it isn't installed (it's Replit/local-dev only).
import type { File, Storage as StorageClient } from "@google-cloud/storage";

import { uploadPathOwnerSegment, isUploadPathOwnedBy } from "../uploadPath";
import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "../objectAcl";
import type {
  DownloadedObject,
  PrivateObjectStorage,
  StorageMetadata,
  UploadTarget,
} from "./types";
import { ObjectNotFoundError } from "./types";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

let clientPromise: Promise<StorageClient> | null = null;

function getObjectStorageClient(): Promise<StorageClient> {
  if (!clientPromise) {
    clientPromise = import("@google-cloud/storage").then(
      ({ Storage }) =>
        new Storage({
          credentials: {
            audience: "replit",
            subject_token_type: "access_token",
            token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
            type: "external_account",
            credential_source: {
              url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
              format: {
                type: "json",
                subject_token_field_name: "access_token",
              },
            },
            universe_domain: "googleapis.com",
          },
          projectId: "",
        }),
    );
  }
  return clientPromise;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return { bucketName: pathParts[1]!, objectName: pathParts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`,
    );
  }
  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var.",
    );
  }
  return dir;
}

async function getObjectFile(objectPath: string): Promise<File> {
  if (!objectPath.startsWith("/objects/")) {
    throw new ObjectNotFoundError();
  }
  const parts = objectPath.slice(1).split("/");
  if (parts.length < 2) {
    throw new ObjectNotFoundError();
  }
  const entityId = parts.slice(1).join("/");
  let entityDir = getPrivateObjectDir();
  if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
  const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
  const client = await getObjectStorageClient();
  const bucket = client.bucket(bucketName);
  const objectFile = bucket.file(objectName);
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new ObjectNotFoundError();
  }
  return objectFile;
}

/**
 * Replit-hosted GCS provider, used for local development against the Replit
 * object-storage sidecar. Not available in the Vercel production runtime —
 * see vercelBlobProvider.ts for that path.
 */
export class ReplitObjectStorageProvider implements PrivateObjectStorage {
  async createUploadTarget(owner: string): Promise<UploadTarget> {
    const privateObjectDir = getPrivateObjectDir();
    const objectId = randomUUID();
    // Owner binding happens via the path itself: /uploads/<ownerSegment>/<uuid>.
    // GCS does not allow metadata writes on objects that do not exist yet, so
    // the ACL policy is applied at finalizeUpload() time; the owner segment
    // lets registration verify the path was minted for the claiming user.
    const ownerSegment = `${uploadPathOwnerSegment(owner)}/`;
    const fullPath = `${privateObjectDir}/uploads/${ownerSegment}${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const objectPath = `/objects/uploads/${ownerSegment}${objectId}`;
    const uploadURL = await signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
    return { uploadURL, objectPath };
  }

  isUploadPathOwnedBy(objectPath: string, owner: string): boolean {
    return isUploadPathOwnedBy(objectPath, owner);
  }

  async finalizeUpload(objectPath: string, owner: string): Promise<void> {
    const objectFile = await getObjectFile(objectPath);
    await setObjectAclPolicy(objectFile, { owner, visibility: "private" });
  }

  async canRead(objectPath: string, userId: string | undefined): Promise<boolean> {
    let objectFile: File;
    try {
      objectFile = await getObjectFile(objectPath);
    } catch {
      return false;
    }
    return canAccessObject({ userId, objectFile, requestedPermission: ObjectPermission.READ });
  }

  async getMetadata(objectPath: string): Promise<StorageMetadata> {
    const objectFile = await getObjectFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    return {
      size: Number(metadata.size ?? 0),
      contentType: (metadata.contentType as string) || "application/octet-stream",
    };
  }

  async downloadObject(objectPath: string): Promise<DownloadedObject> {
    const objectFile = await getObjectFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    const nodeStream = objectFile.createReadStream() as unknown as NodeJS.ReadableStream;
    return {
      stream: nodeStream,
      contentType: (metadata.contentType as string) || "application/octet-stream",
      size: metadata.size ? Number(metadata.size) : undefined,
    };
  }

  async deleteObject(objectPath: string): Promise<void> {
    const objectFile = await getObjectFile(objectPath);
    await objectFile.delete();
  }
}

// Re-exported so callers that only need a readable stream type match Express
// response piping without importing Node's `stream` module themselves.
export type { Readable };
