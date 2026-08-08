export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface UploadTarget {
  /** Short-lived signed PUT URL the client uploads bytes to directly. */
  uploadURL: string;
  /** Opaque, provider-specific, owner-bound path. Persisted by the caller. */
  objectPath: string;
}

export interface StorageMetadata {
  size: number;
  contentType: string;
}

export interface DownloadedObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size?: number;
}

/**
 * Deployment-neutral private object storage. Implementations must keep every
 * object owner-bound and never publicly readable — this interface backs
 * FERPA-sensitive Academic Progress Report uploads.
 */
export interface PrivateObjectStorage {
  /** Mint a fresh, owner-bound upload target (short-lived signed PUT URL). */
  createUploadTarget(
    owner: string,
    opts?: { contentType?: string; maxSizeBytes?: number },
  ): Promise<UploadTarget>;

  /** True if objectPath was minted for / is bound to this owner. */
  isUploadPathOwnedBy(objectPath: string, owner: string): boolean;

  /** Called once after a client-side upload completes and passes validation. */
  finalizeUpload(objectPath: string, owner: string): Promise<void>;

  /** Authorization check for reading an object (owner-only; never public). */
  canRead(objectPath: string, userId: string | undefined): Promise<boolean>;

  /** Authoritative metadata from the storage backend — never trust client-supplied size/type. */
  getMetadata(objectPath: string): Promise<StorageMetadata>;

  /** Stream object bytes. Throws ObjectNotFoundError if missing. */
  downloadObject(objectPath: string): Promise<DownloadedObject>;

  /** Best-effort delete. */
  deleteObject(objectPath: string): Promise<void>;
}
