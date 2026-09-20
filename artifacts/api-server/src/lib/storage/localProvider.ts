import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import type { IncomingMessage } from "http";
import { pipeline } from "stream/promises";
import { Transform } from "stream";

import { uploadPathOwnerSegment, isUploadPathOwnedBy } from "../uploadPath";
import type {
  DownloadedObject,
  PrivateObjectStorage,
  StorageMetadata,
  UploadTarget,
} from "./types";
import { ObjectNotFoundError } from "./types";

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000; // matches the Vercel Blob / Replit PUT-URL lifetime

/** /objects/uploads/<16-hex owner segment>/<uuid> — the ONLY shape this provider will touch. */
const OBJECT_PATH_RE = /^\/objects\/uploads\/([0-9a-f]{16})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

interface UploadTokenPayload {
  /** objectPath the token may write to. */
  p: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Max accepted size in bytes. */
  max: number;
  /** The one content type the upload must declare (empty = any). */
  ct: string;
}

export type LocalUploadResult =
  | { ok: true; size: number }
  | { ok: false; status: 400 | 401 | 413 | 415 | 500; error: string };

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Filesystem-backed private object storage for hosts with no cloud blob
 * service — e.g. a university VM or container with a persistent volume.
 *
 * Security properties mirror the cloud providers:
 *   - Objects live in a directory that is never served statically; the only
 *     read path is the authenticated, owner-checked API route.
 *   - Ownership is derived from the pathname (see uploadPath.ts), which the
 *     server alone mints, so no ACL metadata step exists to forget.
 *   - Uploads are authorised by an expiring HMAC-signed token bound to one
 *     objectPath, one size cap and one content type — equivalent to a
 *     presigned PUT URL. The signing secret never leaves the server.
 *   - Filesystem paths are built ONLY from a strictly validated objectPath
 *     (fixed regex above), so path traversal is not expressible.
 */
export class LocalFilesystemObjectStorageProvider implements PrivateObjectStorage {
  private readonly root: string;
  private readonly secret: string;

  constructor(opts?: { dir?: string; secret?: string }) {
    const dir = opts?.dir ?? process.env["PRIVATE_STORAGE_DIR"];
    const secret = opts?.secret ?? process.env["STORAGE_SIGNING_SECRET"];
    if (!dir || !secret) {
      throw new Error(
        "Local storage requires PRIVATE_STORAGE_DIR and STORAGE_SIGNING_SECRET.",
      );
    }
    this.root = path.resolve(dir);
    this.secret = secret;
  }

  // ----- token helpers ---------------------------------------------------

  private sign(body: string): string {
    return b64url(createHmac("sha256", this.secret).update(body).digest());
  }

  private mintToken(payload: UploadTokenPayload): string {
    const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
    return `${body}.${this.sign(body)}`;
  }

  /** Returns the payload for a valid, unexpired token; null otherwise. */
  verifyToken(token: string): UploadTokenPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts as [string, string];
    const expected = this.sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTokenPayload;
      if (
        typeof payload.p !== "string" ||
        typeof payload.exp !== "number" ||
        typeof payload.max !== "number" ||
        typeof payload.ct !== "string"
      ) {
        return null;
      }
      if (payload.exp < Date.now()) return null;
      if (!OBJECT_PATH_RE.test(payload.p)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // ----- path helpers ----------------------------------------------------

  private filePathFor(objectPath: string): string {
    const m = OBJECT_PATH_RE.exec(objectPath);
    if (!m) throw new ObjectNotFoundError();
    return path.join(this.root, "progress-reports", m[1]!, m[2]!);
  }

  private metaPathFor(objectPath: string): string {
    return `${this.filePathFor(objectPath)}.meta.json`;
  }

  // ----- PrivateObjectStorage -------------------------------------------

  async createUploadTarget(
    owner: string,
    opts?: { contentType?: string; maxSizeBytes?: number },
  ): Promise<UploadTarget> {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${uploadPathOwnerSegment(owner)}/${objectId}`;
    const token = this.mintToken({
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
    if (!userId) return false;
    return isUploadPathOwnedBy(objectPath, userId);
  }

  async getMetadata(objectPath: string): Promise<StorageMetadata> {
    const file = this.filePathFor(objectPath);
    try {
      const stat = await fsp.stat(file);
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await fsp.readFile(this.metaPathFor(objectPath), "utf8")) as {
          contentType?: string;
        };
        if (typeof meta.contentType === "string" && meta.contentType) contentType = meta.contentType;
      } catch {
        /* meta sidecar missing → octet-stream */
      }
      return { size: stat.size, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new ObjectNotFoundError();
      throw err;
    }
  }

  async downloadObject(objectPath: string): Promise<DownloadedObject> {
    const meta = await this.getMetadata(objectPath); // throws ObjectNotFoundError if missing
    return {
      stream: fs.createReadStream(this.filePathFor(objectPath)),
      contentType: meta.contentType,
      size: meta.size,
    };
  }

  async deleteObject(objectPath: string): Promise<void> {
    for (const p of [this.filePathFor(objectPath), this.metaPathFor(objectPath)]) {
      try {
        await fsp.unlink(p);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
  }

  // ----- upload receiver (backs PUT /api/storage/local-upload/:token) ----

  /**
   * Streams the request body to disk under the token's objectPath. Enforces
   * the token's size cap while streaming (aborting the write, not just
   * checking afterwards) and its declared content type. Writes to a temp
   * file and renames, so a half-finished upload is never readable.
   */
  async receiveUpload(token: string, req: IncomingMessage): Promise<LocalUploadResult> {
    // Rejected requests must still drain the body, or the client sees a
    // connection reset instead of the status code we are returning.
    const reject = (status: 400 | 401 | 413 | 415 | 500, error: string): LocalUploadResult => {
      req.resume();
      return { ok: false, status, error };
    };

    const payload = this.verifyToken(token);
    if (!payload) return reject(401, "Upload link is invalid or has expired.");

    const declaredType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (payload.ct && declaredType !== payload.ct.toLowerCase()) {
      return reject(415, "Content-Type does not match the upload link.");
    }

    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > payload.max) {
      return reject(413, "File exceeds the size limit.");
    }

    const finalPath = this.filePathFor(payload.p);
    const tmpPath = `${finalPath}.${randomUUID()}.part`;
    await fsp.mkdir(path.dirname(finalPath), { recursive: true, mode: 0o700 });

    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > payload.max) {
          cb(new Error("SIZE_LIMIT"));
          return;
        }
        cb(null, chunk);
      },
    });

    try {
      await pipeline(req, limiter, fs.createWriteStream(tmpPath, { mode: 0o600 }));
      if (received === 0) {
        await fsp.unlink(tmpPath).catch(() => undefined);
        return { ok: false, status: 400, error: "Empty upload." };
      }
      await fsp.rename(tmpPath, finalPath);
      await fsp.writeFile(
        this.metaPathFor(payload.p),
        JSON.stringify({ contentType: declaredType || payload.ct || "application/octet-stream" }),
        { mode: 0o600 },
      );
      return { ok: true, size: received };
    } catch (err) {
      await fsp.unlink(tmpPath).catch(() => undefined);
      if ((err as Error).message === "SIZE_LIMIT") {
        return reject(413, "File exceeds the size limit.");
      }
      return reject(500, "Could not store the uploaded file.");
    }
  }
}
