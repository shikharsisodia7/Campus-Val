/**
 * Opens an uploaded PDF far enough to know it is a real, readable PDF and how
 * big its pages are. The pages themselves are drawn in the browser from the
 * original file, so nothing about their appearance is decided here.
 *
 * Each page also gets a hash of its text. The text is not kept: the hash
 * exists so that, when the file is replaced, CampusVal can tell whether a page
 * still says the same thing before leaving a student's marker on it.
 */
import { createHash } from "node:crypto";
import { getDocumentProxy } from "unpdf";
import { CHECKSHEET_LIMITS } from "./limits";
import { CHECKSHEET_RENDER_VERSION, ChecksheetError, type PdfPageInfo, type PdfRender } from "./model";

function isPasswordError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "PasswordException";
}

export async function readChecksheetPdf(buf: Buffer): Promise<PdfRender> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  } catch (err) {
    throw new ChecksheetError(isPasswordError(err) ? "encrypted" : "malformed_pdf");
  }

  try {
    if (pdf.numPages < 1) throw new ChecksheetError("malformed_pdf");
    if (pdf.numPages > CHECKSHEET_LIMITS.maxPdfPages) throw new ChecksheetError("too_large");

    const pages: PdfPageInfo[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      let textHash: string | null = null;
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        // A scanned page has no text; nothing can be verified about it later.
        if (text) textHash = createHash("sha256").update(text).digest("hex").slice(0, 32);
      } catch {
        textHash = null;
      }
      pages.push({
        width: Math.round(viewport.width * 100) / 100,
        height: Math.round(viewport.height * 100) / 100,
        textHash,
      });
    }
    return { version: CHECKSHEET_RENDER_VERSION, kind: "pdf", pages };
  } catch (err) {
    if (err instanceof ChecksheetError) throw err;
    throw new ChecksheetError("malformed_pdf");
  } finally {
    // Releases the parsed pages; the type in this version does not declare it.
    await (pdf as unknown as { cleanup?: () => Promise<void> }).cleanup?.().catch(() => undefined);
  }
}
