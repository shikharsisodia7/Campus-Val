/**
 * Google Cloud Storage provider against an in-memory fake of the GCS JSON API
 * (mocked fetch). No real bucket or credentials are used.
 */
import { Readable } from "stream";
import type { IncomingMessage } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GcsObjectStorageProvider } from "./gcsProvider";
import { ObjectNotFoundError } from "./types";
import { uploadPathOwnerSegment } from "../uploadPath";

const SECRET = "x".repeat(40);
const BUCKET = "scu-campusval-private-test";
const objects = new Map<string, { body: Buffer; contentType: string }>();
const seenAuth: string[] = [];

function fakeGcs(url: string, init: RequestInit = {}): Response {
  seenAuth.push(String((init.headers as Record<string, string>)["Authorization"]));
  const u = new URL(url);
  if (u.pathname === `/upload/storage/v1/b/${BUCKET}/o` && init.method === "POST") {
    const name = u.searchParams.get("name")!;
    objects.set(name, {
      body: Buffer.from(init.body as Buffer),
      contentType: (init.headers as Record<string, string>)["Content-Type"]!,
    });
    return Response.json({ name });
  }
  const prefix = `/storage/v1/b/${BUCKET}/o/`;
  if (!u.pathname.startsWith(prefix)) return new Response("bad bucket", { status: 400 });
  const name = decodeURIComponent(u.pathname.slice(prefix.length));
  const obj = objects.get(name);
  if (init.method === "DELETE") {
    if (!obj) return new Response(null, { status: 404 });
    objects.delete(name);
    return new Response(null, { status: 204 });
  }
  if (!obj) return new Response("{}", { status: 404 });
  if (u.searchParams.get("alt") === "media") return new Response(new Uint8Array(obj.body));
  return Response.json({ name, size: String(obj.body.length), contentType: obj.contentType });
}

function putRequest(body: Buffer, headers: Record<string, string>): IncomingMessage {
  const r = Readable.from([body]) as unknown as IncomingMessage;
  (r as { headers: Record<string, string> }).headers = headers;
  return r;
}

const provider = new GcsObjectStorageProvider({ bucket: BUCKET, secret: SECRET, getAccessToken: async () => "sa-token" });
const PDF = "application/pdf";

beforeEach(() => {
  objects.clear();
  seenAuth.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => fakeGcs(url, init)));
});
afterEach(() => vi.unstubAllGlobals());

async function upload(owner: string, body: Buffer, contentType = PDF) {
  const target = await provider.createUploadTarget(owner, { contentType, maxSizeBytes: 1024 });
  const token = target.uploadURL.split("/").pop()!;
  const result = await provider.receiveUpload(token, putRequest(body, { "content-type": contentType }));
  return { target, token, result };
}

describe("GcsObjectStorageProvider", () => {
  it("round-trips an upload under progress-reports/<owner>/<uuid> using the service-account token", async () => {
    const { target, result } = await upload("user_a", Buffer.from("%PDF-1.7 hello"));
    expect(result).toEqual({ ok: true, size: 14 });
    expect(target.uploadURL.startsWith("/api/storage/local-upload/")).toBe(true);
    expect([...objects.keys()][0]).toMatch(new RegExp(`^progress-reports/${uploadPathOwnerSegment("user_a")}/[0-9a-f-]{36}$`));
    expect(await provider.getMetadata(target.objectPath)).toEqual({ size: 14, contentType: PDF });
    const dl = await provider.downloadObject(target.objectPath);
    const chunks: Buffer[] = [];
    for await (const c of dl.stream) chunks.push(Buffer.from(c as Buffer));
    expect(Buffer.concat(chunks).toString()).toBe("%PDF-1.7 hello");
    expect(seenAuth.every((h) => h === "Bearer sa-token")).toBe(true);
    await provider.deleteObject(target.objectPath);
    await expect(provider.getMetadata(target.objectPath)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("is owner-only", async () => {
    const { target } = await upload("user_a", Buffer.from("x"));
    expect(await provider.canRead(target.objectPath, "user_a")).toBe(true);
    expect(await provider.canRead(target.objectPath, "user_b")).toBe(false);
    expect(await provider.canRead(target.objectPath, undefined)).toBe(false);
  });

  it("never addresses an object outside the minted shape (path traversal)", async () => {
    const seg = uploadPathOwnerSegment("user_a");
    await expect(provider.getMetadata(`/objects/uploads/${seg}/../../other/x`)).rejects.toBeInstanceOf(ObjectNotFoundError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("rejects forged/expired tokens, wrong content type, oversize and empty uploads", async () => {
    const target = await provider.createUploadTarget("user_a", { contentType: PDF, maxSizeBytes: 8 });
    const token = target.uploadURL.split("/").pop()!;
    expect((await provider.receiveUpload(token + "x", putRequest(Buffer.from("a"), { "content-type": PDF }))).ok).toBe(false);
    expect(await provider.receiveUpload(token, putRequest(Buffer.from("a"), { "content-type": "text/html" }))).toMatchObject({ status: 415 });
    expect(await provider.receiveUpload(token, putRequest(Buffer.alloc(9), { "content-type": PDF }))).toMatchObject({ status: 413 });
    expect(await provider.receiveUpload(token, putRequest(Buffer.alloc(0), { "content-type": PDF }))).toMatchObject({ status: 400 });
    const other = new GcsObjectStorageProvider({ bucket: BUCKET, secret: "y".repeat(40), getAccessToken: async () => "t" });
    expect(await other.receiveUpload(token, putRequest(Buffer.from("a"), { "content-type": PDF }))).toMatchObject({ status: 401 });
    expect(objects.size).toBe(0);
  });

  it("requires a bucket and signing secret", () => {
    expect(() => new GcsObjectStorageProvider({ bucket: "", secret: SECRET })).toThrow(/GCS_BUCKET/);
  });
});
