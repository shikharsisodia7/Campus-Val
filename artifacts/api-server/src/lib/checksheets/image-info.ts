/**
 * Reads the pixel size of a PNG or JPEG from its header.
 *
 * The picture is never decoded on the server: the size is all CampusVal needs
 * (to reserve the right space and to place the student's markers), and a file
 * whose header cannot be read is not a picture a browser should be handed.
 */
import { CHECKSHEET_LIMITS } from "./limits";
import { ChecksheetError } from "./model";

export interface ImageSize {
  width: number;
  height: number;
}

function checked(width: number, height: number): ImageSize {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ChecksheetError("malformed_image");
  }
  if (width * height > CHECKSHEET_LIMITS.maxImagePixels) throw new ChecksheetError("too_large");
  return { width, height };
}

export function readPngSize(buf: Buffer): ImageSize {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  if (buf.length < 33 || buf.toString("latin1", 12, 16) !== "IHDR") throw new ChecksheetError("malformed_image");
  return checked(buf.readUInt32BE(16), buf.readUInt32BE(20));
}

/** Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) do not. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export function readJpegSize(buf: Buffer): ImageSize {
  let p = 2;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) throw new ChecksheetError("malformed_image");
    // Markers may be padded with any number of 0xFF fill bytes.
    while (p < buf.length && buf[p] === 0xff) p++;
    const marker = buf[p];
    p++;
    if (marker === undefined) break;
    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (p + 2 > buf.length) break;
    const length = buf.readUInt16BE(p);
    if (length < 2) throw new ChecksheetError("malformed_image");
    if (isStartOfFrame(marker)) {
      if (p + 7 > buf.length) break;
      return checked(buf.readUInt16BE(p + 5), buf.readUInt16BE(p + 3));
    }
    p += length;
  }
  throw new ChecksheetError("malformed_image");
}
