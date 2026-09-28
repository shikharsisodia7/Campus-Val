import type { Response } from "express";
import type { DownloadedObject } from "../storage";
import { CHECKSHEET_MIME, type ChecksheetFormat } from "./model";

/** Formats a browser can show safely in place: they cannot carry script. */
const INLINE: ReadonlySet<ChecksheetFormat> = new Set(["pdf", "png", "jpg"]);

/**
 * Streams a stored Degree Checksheet back to its owner.
 *
 *  - The content type comes from the format CampusVal verified when the file
 *    was uploaded (the first bytes of the file), never from what storage or
 *    the browser says, so a stored object can never be served as HTML.
 *  - PDFs and pictures are served inline so they can be drawn in the app;
 *    office files are always a download, under a sandboxing policy.
 *  - `no-store`: a student's planning document must not linger in a cache on a
 *    shared or lab machine after sign-out.
 *  - The download name is fixed and generic, never the uploaded file name, so
 *    it cannot be used for header injection.
 */
export function sendChecksheetFile(
  res: Response,
  obj: DownloadedObject,
  format: ChecksheetFormat,
  onStreamError: () => void,
): void {
  const inline = INLINE.has(format);
  res.setHeader("Content-Type", CHECKSHEET_MIME[format]);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!inline) res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="degree-checksheet.${format}"`);
  if (obj.size) res.setHeader("Content-Length", String(obj.size));

  obj.stream.on("error", () => {
    onStreamError();
    if (!res.headersSent) res.status(500).json({ error: "Failed to serve file." });
    else res.destroy();
  });
  obj.stream.pipe(res);
}
