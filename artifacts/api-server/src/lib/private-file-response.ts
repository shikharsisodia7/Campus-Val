import type { Response } from "express";
import type { DownloadedObject } from "./storage";

const PDF = "application/pdf";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Streams a private stored object (an Academic Progress Report) back to its
 * owner with headers that stop the browser from ever treating it as
 * something other than the document it is.
 *
 *  - Only the two content types the upload path accepts are echoed; anything
 *    else (e.g. a mislabelled object) is forced to a download as
 *    octet-stream, so stored content can never be rendered as HTML/script in
 *    this origin.
 *  - `nosniff` (and, for downloads, a `sandbox` CSP) close the remaining
 *    sniffing/script paths.
 *  - `no-store`: an APR is a student record; it must not linger in a browser
 *    or proxy cache on a shared/lab machine after sign-out.
 *  - The download name is a fixed generic one — never the user-supplied file
 *    name — so it cannot be used for header injection or leak a real name.
 */
export function sendPrivateFile(
  res: Response,
  obj: DownloadedObject,
  onStreamError: (err: unknown) => void,
): void {
  const declared = (obj.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const safeType = declared === PDF || declared === XLSX ? declared : "application/octet-stream";
  const inline = safeType === PDF;
  const ext = safeType === PDF ? "pdf" : safeType === XLSX ? "xlsx" : "bin";

  res.setHeader("Content-Type", safeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // A `sandbox` CSP blocks Chrome's built-in PDF viewer, so it is applied
  // only to the download (non-inline) variants, where nothing is rendered.
  if (!inline) res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="academic-progress-report.${ext}"`,
  );
  if (obj.size) res.setHeader("Content-Length", String(obj.size));

  obj.stream.on("error", (err) => {
    onStreamError(err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file." });
    else res.destroy();
  });
  obj.stream.pipe(res);
}
