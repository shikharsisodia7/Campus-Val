/**
 * One page of an uploaded PDF, drawn to a picture.
 *
 * The web app draws PDF pages itself, in the browser, with PDF.js. A native
 * mobile app has no such renderer built in, so the server draws the page
 * instead and sends back a PNG — the same library (`unpdf`, the same PDF.js)
 * doing the same drawing, just on the server rather than in a `<canvas>`.
 *
 * Nothing here reads, judges or stores anything about the page's content: it
 * is asked for a page number and a scale, and returns pixels. The route that
 * calls this checks ownership first; this module trusts the bytes and the
 * page index it is given.
 */
import { renderPageAsImage } from "unpdf";
import { CHECKSHEET_LIMITS } from "./limits";
import { ChecksheetError } from "./model";

/** 1x is Letter-sized text at screen resolution; higher looks better zoomed in on a phone. */
export const PDF_PAGE_IMAGE_SCALES = { min: 1, max: 3, default: 2 } as const;

export function clampPdfPageScale(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return PDF_PAGE_IMAGE_SCALES.default;
  return Math.min(Math.max(n, PDF_PAGE_IMAGE_SCALES.min), PDF_PAGE_IMAGE_SCALES.max);
}

/** Throws ChecksheetError when the page cannot be drawn. */
export async function renderChecksheetPdfPage(buf: Buffer, pageIndex: number, scale: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= CHECKSHEET_LIMITS.maxPdfPages) throw new ChecksheetError("malformed_pdf");
  try {
    const image = await renderPageAsImage(new Uint8Array(buf), pageIndex + 1, {
      // A dynamic import, kept as an external by the build: the native
      // rendering package is loaded only when a page is actually drawn.
      canvasImport: () => import("@napi-rs/canvas"),
      scale,
    });
    return Buffer.from(image);
  } catch {
    throw new ChecksheetError("malformed_pdf");
  }
}
