/**
 * A fingerprint of what a picture SHOWS, as opposed to the bytes of its file.
 *
 * A marker sits on a picture at a position. When the file is replaced, the
 * marker may stay only if the picture is the same picture. The file's own hash
 * answers that for an identical file; this answers it when only the file's
 * wrapping changed: the same image downloaded again with a different date
 * stamp, comment, colour profile, resolution tag or compression level.
 *
 * It is exact, never approximate. Two pictures that differ in a single pixel
 * have different fingerprints, and a picture that was resized, cropped or
 * re-encoded by a lossy encoder does not match. There is no "similar enough":
 * a marker is never left on a picture that cannot be shown to be the same.
 *
 * Nothing here draws or interprets the picture.
 */
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/** Above this many inflated bytes a PNG is fingerprinted by its stored data instead. */
const MAX_INFLATED_BYTES = 256 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bits per pixel for a PNG colour type and bit depth. */
function bitsPerPixel(colorType: number, bitDepth: number): number | null {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  return channels ? channels * bitDepth : null;
}

/** Undoes PNG's per-row filters, giving the pixel bytes themselves. */
function unfilter(data: Buffer, width: number, height: number, bpp: number): Buffer | null {
  const stride = Math.ceil((width * bpp) / 8);
  const step = Math.max(1, Math.ceil(bpp / 8));
  if (data.length !== (stride + 1) * height) return null;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[from + x]!;
      const left = x >= step ? out[to + x - step]! : 0;
      const up = y > 0 ? out[to - stride + x]! : 0;
      const upLeft = y > 0 && x >= step ? out[to - stride + x - step]! : 0;
      let value: number;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else return null;
      out[to + x] = value & 0xff;
    }
  }
  return out;
}

export function pngContentHash(buf: Buffer): string | null {
  try {
    if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    const hash = createHash("sha256");
    const data: Buffer[] = [];
    let header: Buffer | null = null;
    let p = 8;
    while (p + 12 <= buf.length) {
      const length = buf.readUInt32BE(p);
      const type = buf.toString("latin1", p + 4, p + 8);
      const body = buf.subarray(p + 8, p + 8 + length);
      if (body.length !== length) return null;
      if (type === "IHDR") header = Buffer.from(body);
      else if (type === "IDAT") data.push(body);
      // The palette and its transparency decide what the pixel values look like.
      else if (type === "PLTE" || type === "tRNS") hash.update(type).update(body);
      else if (type === "IEND") break;
      p += 12 + length;
    }
    if (!header || header.length !== 13 || data.length === 0) return null;
    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    const bitDepth = header[8]!;
    const colorType = header[9]!;
    const interlaced = header[12] !== 0;
    hash.update(`png:${width}x${height}:${bitDepth}:${colorType}:${interlaced ? 1 : 0}:`);

    const inflated = inflateSync(Buffer.concat(data), { maxOutputLength: MAX_INFLATED_BYTES });
    const bpp = bitsPerPixel(colorType, bitDepth);
    // An interlaced picture is stored in passes; its stored rows are compared as they are.
    const pixels = !interlaced && bpp ? unfilter(inflated, width, height, bpp) : null;
    hash.update(pixels ? "pixels:" : "rows:").update(pixels ?? inflated);
    return hash.digest("hex").slice(0, 32);
  } catch {
    return null;
  }
}

/**
 * A JPEG without its descriptive segments (APPn: EXIF, JFIF density, colour
 * profile, thumbnails; COM: comments). What remains is the tables and the
 * compressed picture, which decode to the same pixels.
 */
export function jpegContentHash(buf: Buffer): string | null {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    const hash = createHash("sha256").update("jpeg:");
    let p = 2;
    while (p + 4 <= buf.length) {
      if (buf[p] !== 0xff) return null;
      while (p < buf.length && buf[p] === 0xff) p++;
      const marker = buf[p++];
      if (marker === undefined) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9) break;
      if (p + 2 > buf.length) return null;
      const length = buf.readUInt16BE(p);
      if (length < 2 || p + length > buf.length) return null;
      const descriptive = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
      if (!descriptive) hash.update(Buffer.from([marker])).update(buf.subarray(p, p + length));
      p += length;
      if (marker === 0xda) {
        // Start of scan: the compressed picture runs to the end of the file.
        hash.update(buf.subarray(p));
        return hash.digest("hex").slice(0, 32);
      }
    }
    return null;
  } catch {
    return null;
  }
}
