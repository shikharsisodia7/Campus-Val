import { createHmac, timingSafeEqual } from "crypto";
import { UPLOAD_OBJECT_PATH_RE } from "../uploadPath";

/**
 * Expiring HMAC-signed upload token for providers where the browser uploads
 * THROUGH CampusVal (PUT /api/storage/local-upload/:token) instead of straight
 * to a cloud presigned URL — the local-filesystem and Google Cloud Storage
 * providers. Equivalent to a presigned PUT: bound to one objectPath, one size
 * cap and one content type, valid 15 minutes. The secret never leaves the server.
 */
export interface UploadTokenPayload {
  /** objectPath the token may write to. */
  p: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Max accepted size in bytes. */
  max: number;
  /** The one content type the upload must declare (empty = any). */
  ct: string;
}

export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

const b64url = (buf: Buffer): string => buf.toString("base64url");
const sign = (secret: string, body: string): string => b64url(createHmac("sha256", secret).update(body).digest());

export function mintUploadToken(secret: string, payload: UploadTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(secret, body)}`;
}

/** The payload for a valid, unexpired token whose path has the minted shape; null otherwise. */
export function verifyUploadToken(secret: string, token: string): UploadTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(secret, body));
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
    if (!UPLOAD_OBJECT_PATH_RE.test(payload.p)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Result of receiving an app-proxied upload. */
export type AppUploadResult =
  | { ok: true; size: number }
  | { ok: false; status: 400 | 401 | 413 | 415 | 500; error: string };

/** A provider that accepts uploads through PUT /api/storage/local-upload/:token. */
export interface AppProxiedUploadReceiver {
  receiveUpload(token: string, req: import("http").IncomingMessage): Promise<AppUploadResult>;
}

export function isAppProxiedUploadReceiver(x: unknown): x is AppProxiedUploadReceiver {
  return !!x && typeof (x as { receiveUpload?: unknown }).receiveUpload === "function";
}
