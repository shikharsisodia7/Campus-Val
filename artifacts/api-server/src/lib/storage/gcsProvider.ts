import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { Readable } from "stream";

import { isUploadPathOwnedBy, uploadPathOwnerSegment, UPLOAD_OBJECT_PATH_RE } from "../uploadPath";
import type { DownloadedObject, PrivateObjectStorage, StorageMetadata, UploadTarget } from "./types";
import { ObjectNotFoundError } from "./types";
import {
  mintUploadToken,
  verifyUploadToken,
  UPLOAD_TOKEN_TTL_MS,
  type AppProxiedUploadReceiver,
  type AppUploadResult,
} from "./uploadToken";

const API = "https://storage.googleapis.com/storage/v1";
const UPLOAD_API = "https://storage.googleapis.com/upload/storage/v1";
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";
const TIMEOUT_MS = 60_000;

/**
 * Google Cloud Storage provider for SCU's GCP deployment (Cloud Run, whose
 * local disk does not survive an instance restart).
 *
 *  - The bucket is PRIVATE (uniform bucket-level access, public access
 *    prevention enforced — see docs/migration/CLOUD_STORAGE.md). No object
 *    URL is ever given to a browser: reads stream through the authenticated,
 *    owner-checked API routes.
 *  - Uploads go browser → CampusVal (PUT /api/storage/local-upload/:token,
 *    an expiring HMAC token bound to one path/size/type) → GCS. So no signed
 *    GCS URLs, no bucket CORS, and no signBlob permission are needed.
 *  - Credentials are the Cloud Run service account via Application Default
 *    Credentials. No key file. Grant it roles/storage.objectUser on THIS
 *    bucket only.
 *  - Object names are built only from a strictly validated objectPath, so
 *    nothing outside `progress-reports/<owner>/<uuid>` is addressable.
 *
 * Plain JSON API over fetch; google-auth-library (already bundled) supplies
 * the token — the @google-cloud/storage SDK is not needed at runtime.
 */
export class GcsObjectStorageProvider implements PrivateObjectStorage, AppProxiedUploadReceiver {
  private readonly bucket: string;
  private readonly secret: string;
  private readonly tokenSource: () => Promise<string>;

  constructor(opts?: { bucket?: string; secret?: string; getAccessToken?: () => Promise<string> }) {
    const bucket = opts?.bucket ?? process.env["GCS_BUCKET"];
    const secret = opts?.secret ?? process.env["STORAGE_SIGNING_SECRET"];
    if (!bucket || !secret) throw new Error("GCS storage requires GCS_BUCKET and STORAGE_SIGNING_SECRET.");
    this.bucket = bucket.trim();
    this.secret = secret;
    this.tokenSource = opts?.getAccessToken ?? adcTokenSource();
  }

  private objectName(objectPath: string): string {
    const m = UPLOAD_OBJECT_PATH_RE.exec(objectPath);
    if (!m) throw new ObjectNotFoundError();
    return `progress-reports/${m[1]}/${m[2]}`;
  }

  private objectUrl(objectPath: string, query = ""): string {
    return `${API}/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(this.objectName(objectPath))}${query}`;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenSource();
    return fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async createUploadTarget(owner: string, opts?: { contentType?: string; maxSizeBytes?: number }): Promise<UploadTarget> {
    const objectPath = `/objects/uploads/${uploadPathOwnerSegment(owner)}/${randomUUID()}`;
    const token = mintUploadToken(this.secret, {
      p: objectPath,
      exp: Date.now() + UPLOAD_TOKEN_TTL_MS,
      max: opts?.maxSizeBytes ?? 10 * 1024 * 1024,
      ct: opts?.contentType ?? "",
    });
    return { uploadURL: `/api/storage/local-upload/${token}`, objectPath };
  }

  isUploadPathOwnedBy(objectPath: string, owner: string): boolean {
    return isUploadPathOwnedBy(objectPath, owner);
  }

  async finalizeUpload(): Promise<void> {
    return; // ownership is derived from the pathname at mint time
  }

  async canRead(objectPath: string, userId: string | undefined): Promise<boolean> {
    return !!userId && isUploadPathOwnedBy(objectPath, userId);
  }

  async getMetadata(objectPath: string): Promise<StorageMetadata> {
    const res = await this.call(this.objectUrl(objectPath));
    if (res.status === 404) throw new ObjectNotFoundError();
    if (!res.ok) throw new Error(`GCS metadata request failed (${res.status})`);
    const meta = (await res.json()) as { size?: string; contentType?: string };
    return { size: Number(meta.size ?? 0), contentType: meta.contentType || "application/octet-stream" };
  }

  async downloadObject(objectPath: string): Promise<DownloadedObject> {
    const meta = await this.getMetadata(objectPath);
    const res = await this.call(this.objectUrl(objectPath, "?alt=media"));
    if (res.status === 404) throw new ObjectNotFoundError();
    if (!res.ok || !res.body) throw new Error(`GCS download failed (${res.status})`);
    return {
      stream: Readable.fromWeb(res.body as unknown as import("stream/web").ReadableStream),
      contentType: meta.contentType,
      size: meta.size,
    };
  }

  async deleteObject(objectPath: string): Promise<void> {
    const res = await this.call(this.objectUrl(objectPath), { method: "DELETE" });
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok && res.status !== 404) throw new Error(`GCS delete failed (${res.status})`);
  }

  /**
   * Backs PUT /api/storage/local-upload/:token. Enforces the token's size cap
   * while reading (aborting, not checking afterwards) and its content type,
   * then writes the object in one request. Bounded by the upload cap (default
   * 10 MB APR / 20 MB checksheet), so buffering is safe.
   */
  async receiveUpload(token: string, req: IncomingMessage): Promise<AppUploadResult> {
    const reject = (status: 400 | 401 | 413 | 415 | 500, error: string): AppUploadResult => {
      req.resume();
      return { ok: false, status, error };
    };
    const payload = verifyUploadToken(this.secret, token);
    if (!payload) return reject(401, "Upload link is invalid or has expired.");

    const declaredType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (payload.ct && declaredType !== payload.ct.toLowerCase()) {
      return reject(415, "Content-Type does not match the upload link.");
    }
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > payload.max) {
      return reject(413, "File exceeds the size limit.");
    }

    const chunks: Buffer[] = [];
    let received = 0;
    try {
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        received += buf.length;
        if (received > payload.max) return reject(413, "File exceeds the size limit.");
        chunks.push(buf);
      }
    } catch {
      return { ok: false, status: 400, error: "Upload was interrupted." };
    }
    if (received === 0) return { ok: false, status: 400, error: "Empty upload." };

    const url =
      `${UPLOAD_API}/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=` +
      encodeURIComponent(this.objectName(payload.p));
    try {
      const res = await this.call(url, {
        method: "POST",
        headers: { "Content-Type": declaredType || payload.ct || "application/octet-stream" },
        body: Buffer.concat(chunks),
      });
      await res.body?.cancel().catch(() => undefined);
      if (!res.ok) return { ok: false, status: 500, error: "Could not store the uploaded file." };
    } catch {
      return { ok: false, status: 500, error: "Could not store the uploaded file." };
    }
    return { ok: true, size: received };
  }
}

function adcTokenSource(): () => Promise<string> {
  let auth: { getAccessToken(): Promise<string | null | undefined> } | null = null;
  return async () => {
    if (!auth) {
      const { GoogleAuth } = await import("google-auth-library");
      auth = new GoogleAuth({ scopes: [SCOPE] });
    }
    const token = await auth.getAccessToken();
    if (!token) throw new Error("No Google Cloud credentials available for Cloud Storage.");
    return token;
  };
}
