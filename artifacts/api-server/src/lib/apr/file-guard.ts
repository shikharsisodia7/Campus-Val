/**
 * Checks made on the raw bytes BEFORE any workbook library touches them.
 *
 * An .xlsx file is a zip archive. Reading the zip's own directory (a few
 * fixed-width records at the end of the file) tells us — without inflating
 * anything — whether the file is a zip at all, how big it claims to be once
 * inflated, and whether it carries the parts a workbook must have.
 */
import { APR_LIMITS } from "./limits";
import { AprImportError } from "./workbook-model";

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50;
/** OLE2 compound file: legacy .xls, and every password-protected .xlsx. */
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface ZipDirectory {
  entryNames: string[];
  declaredInflatedBytes: number;
}

export function readZipDirectory(buf: Buffer): ZipDirectory {
  if (buf.length < 22 || buf.readUInt32LE(0) !== ZIP_LOCAL_HEADER) {
    throw new AprImportError("not_a_workbook");
  }
  // The end-of-central-directory record is within the last 64 KB + 22 bytes.
  const searchFrom = Math.max(0, buf.length - (0xffff + 22));
  let eocd = -1;
  for (let i = buf.length - 22; i >= searchFrom; i--) {
    if (buf.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIR) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new AprImportError("malformed_workbook");

  const entryCount = buf.readUInt16LE(eocd + 10);
  const directorySize = buf.readUInt32LE(eocd + 12);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (entryCount > APR_LIMITS.maxZipEntries) throw new AprImportError("too_large");
  if (directoryOffset + directorySize > buf.length) throw new AprImportError("malformed_workbook");

  const entryNames: string[] = [];
  let declaredInflatedBytes = 0;
  let p = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== ZIP_CENTRAL_HEADER) {
      throw new AprImportError("malformed_workbook");
    }
    declaredInflatedBytes += buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    if (p + 46 + nameLength > buf.length) throw new AprImportError("malformed_workbook");
    entryNames.push(buf.toString("utf8", p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entryNames, declaredInflatedBytes };
}

export interface GuardResult {
  /** The archive carries VBA. It is never executed; the importer just notes it. */
  hasMacros: boolean;
}

/** Throws AprImportError when the bytes cannot be a readable, reasonably sized .xlsx. */
export function guardXlsxBytes(buf: Buffer): GuardResult {
  if (buf.length === 0) throw new AprImportError("empty_workbook");
  if (buf.length >= OLE2_MAGIC.length && buf.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) {
    throw new AprImportError("legacy_xls_or_encrypted");
  }
  const dir = readZipDirectory(buf);
  if (dir.declaredInflatedBytes > APR_LIMITS.maxInflatedBytes) throw new AprImportError("too_large");
  const names = new Set(dir.entryNames.map((n) => n.toLowerCase()));
  // Every SpreadsheetML package has these; a .docx or a plain zip does not.
  if (!names.has("[content_types].xml") || !names.has("xl/workbook.xml")) {
    throw new AprImportError("not_a_workbook");
  }
  return { hasMacros: names.has("xl/vbaproject.bin") };
}
