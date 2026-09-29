/**
 * Opens an uploaded PDF far enough to know it is a real, readable PDF and how
 * big its pages are. The pages themselves are drawn in the browser from the
 * original file, so nothing about their appearance is decided here.
 *
 * Each page also gets a hash of its text. The text is not kept: the hash
 * exists so that, when the file is replaced, CampusVal can tell whether a page
 * still says the same thing before leaving a student's marker on it.
 *
 * A scanned page has no text. It gets a hash of what it DRAWS instead: its
 * drawing instructions and the pixels of its pictures. The comparison is exact;
 * a page rescanned, even of the same paper, is a different page.
 */
import { createHash } from "node:crypto";
import { getDocumentProxy } from "unpdf";
import { CHECKSHEET_LIMITS } from "./limits";
import { CHECKSHEET_RENDER_VERSION, ChecksheetError, type PdfPageInfo, type PdfRender } from "./model";

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentProxy>>["getPage"]>>;

interface DecodedPicture {
  width?: number;
  height?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
}

/** A picture the page refers to, once the PDF library has decoded it. */
function pictureOf(page: Page, id: string): Promise<DecodedPicture | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    try {
      store.get(id, (value: unknown) => {
        clearTimeout(timer);
        resolve(value && typeof value === "object" ? (value as DecodedPicture) : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * A hash of what a page draws. Returns null when it cannot be made within the
 * budget, which leaves the page unverifiable, as it was before.
 */
async function drawnContentHash(page: Page, budget: { bytes: number }): Promise<string | null> {
  const operations = await page.getOperatorList();
  const hash = createHash("sha256");
  for (let i = 0; i < operations.fnArray.length; i++) {
    hash.update(`#${operations.fnArray[i]}`);
    for (const argument of (operations.argsArray[i] as unknown[] | null) ?? []) {
      // The library names decoded objects by page and order; the name is not
      // part of the page, what it names is.
      if (typeof argument === "string" && /^(img_|g_)/.test(argument)) {
        const picture = await pictureOf(page, argument);
        const bytes = picture?.data;
        if (!bytes || !bytes.byteLength) {
          hash.update("object");
          continue;
        }
        budget.bytes -= bytes.byteLength;
        if (budget.bytes < 0) return null;
        hash.update(`picture:${picture.width}x${picture.height}:`);
        hash.update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      } else {
        hash.update(JSON.stringify(argument, (_key, value: unknown) => (ArrayBuffer.isView(value) ? Array.from(value as Uint8Array) : value)) ?? "");
      }
    }
  }
  return hash.digest("hex").slice(0, 32);
}

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
    const budget = { bytes: CHECKSHEET_LIMITS.maxScanFingerprintBytes };
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
      let contentHash: string | null = null;
      if (!textHash && budget.bytes > 0) {
        try {
          contentHash = await drawnContentHash(page, budget);
        } catch {
          contentHash = null;
        }
      }
      pages.push({
        width: Math.round(viewport.width * 100) / 100,
        height: Math.round(viewport.height * 100) / 100,
        textHash,
        ...(textHash ? {} : { contentHash }),
      });
      page.cleanup();
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
