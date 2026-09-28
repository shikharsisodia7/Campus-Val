/**
 * Which file a Degree Checksheet upload really is.
 *
 * Three things have to agree before a file is accepted: its extension, the
 * type the browser declared, and the first bytes of the file itself. The
 * bytes are what is trusted; the other two only have to be consistent with
 * them. A renamed executable or an HTML page called "checksheet.pdf" stops
 * here, before any parser sees it.
 */
import { readZipDirectory } from "../apr/file-guard";
import { AprImportError } from "../apr/workbook-model";
import { CHECKSHEET_MIME, ChecksheetError, type ChecksheetFormat } from "./model";

const EXTENSION_FORMAT: Record<string, ChecksheetFormat> = {
  ".pdf": "pdf",
  ".xlsx": "xlsx",
  ".xls": "xls",
  ".docx": "docx",
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
};

/** Browsers on some systems report no type, or a generic one, for office files. */
const GENERIC_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed"]);

const EXTRA_TYPES: Partial<Record<ChecksheetFormat, string[]>> = {
  jpg: ["image/jpg", "image/pjpeg"],
  xls: ["application/excel", "application/x-excel", "application/x-msexcel"],
};

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Total size a .docx may declare once inflated (guards against zip bombs). */
const MAX_DOCX_INFLATED_BYTES = 150 * 1024 * 1024;

export const CHECKSHEET_ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_FORMAT);

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}

/** Extension AND declared type must agree on a supported format. */
export function resolveChecksheetFormat(fileName: string, contentType: string): ChecksheetFormat | null {
  const format = EXTENSION_FORMAT[extensionOf(fileName)];
  if (!format) return null;
  const type = normalizeContentType(contentType);
  if (type === CHECKSHEET_MIME[format]) return format;
  if (EXTRA_TYPES[format]?.includes(type)) return format;
  // Pictures and PDFs always have a real type; only office files arrive generic.
  if (GENERIC_TYPES.has(type) && (format === "xlsx" || format === "xls" || format === "docx")) return format;
  return null;
}

/**
 * The content type a browser should send when uploading this file. The upload
 * link is bound to exactly one type, so both sides must name the same one.
 */
export function canonicalContentType(format: ChecksheetFormat): string {
  return CHECKSHEET_MIME[format];
}

function startsWith(buf: Buffer, magic: Buffer): boolean {
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

/** An OLE2 file names its streams in UTF-16LE in its directory. */
function hasOle2Stream(buf: Buffer, name: string): boolean {
  return buf.includes(Buffer.from(name, "utf16le"));
}

function zipEntryNames(buf: Buffer, onBad: ChecksheetError): Set<string> {
  try {
    const dir = readZipDirectory(buf);
    if (dir.declaredInflatedBytes > MAX_DOCX_INFLATED_BYTES) throw new ChecksheetError("too_large");
    return new Set(dir.entryNames.map((n) => n.toLowerCase()));
  } catch (err) {
    if (err instanceof ChecksheetError) throw err;
    if (err instanceof AprImportError && err.code === "too_large") throw new ChecksheetError("too_large");
    throw onBad;
  }
}

/**
 * Throws unless the bytes are what the format says they are. Password
 * protection is reported as such, because the student can fix it.
 */
export function assertBytesMatchFormat(buf: Buffer, format: ChecksheetFormat): void {
  if (buf.length === 0) throw new ChecksheetError("empty_file");

  switch (format) {
    case "pdf": {
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ChecksheetError("type_mismatch");
      return;
    }
    case "png": {
      if (!startsWith(buf, PNG_MAGIC)) throw new ChecksheetError("type_mismatch");
      return;
    }
    case "jpg": {
      if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
        throw new ChecksheetError("type_mismatch");
      }
      return;
    }
    case "xls": {
      if (!startsWith(buf, OLE2_MAGIC)) throw new ChecksheetError("type_mismatch");
      if (hasOle2Stream(buf, "EncryptedPackage")) throw new ChecksheetError("encrypted");
      // A Word .doc or an installer is also OLE2; a workbook has a Workbook stream.
      if (!hasOle2Stream(buf, "Workbook") && !hasOle2Stream(buf, "Book")) throw new ChecksheetError("type_mismatch");
      return;
    }
    case "xlsx":
    case "docx": {
      // A password-protected office file is an OLE2 container, not a zip.
      if (startsWith(buf, OLE2_MAGIC)) {
        throw new ChecksheetError(hasOle2Stream(buf, "EncryptedPackage") ? "encrypted" : "type_mismatch");
      }
      const bad = new ChecksheetError(format === "xlsx" ? "malformed_workbook" : "malformed_document");
      if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new ChecksheetError("type_mismatch");
      const names = zipEntryNames(buf, bad);
      const required = format === "xlsx" ? "xl/workbook.xml" : "word/document.xml";
      if (!names.has("[content_types].xml") || !names.has(required)) throw new ChecksheetError("type_mismatch");
      return;
    }
  }
}
