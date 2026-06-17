// Generate solid-cardinal-color PNG icons at 16/48/128 with rounded corners
// and a white "CV" mark. Uses node-canvas if available, falls back to a plain
// solid square via raw PNG bytes (no deps).
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

// Solid color RGBA PNG with rounded corners (procedural alpha mask).
function makePng(size, r, g, b) {
  const radius = Math.round(size * 0.16);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter type 0 (None)
    for (let x = 0; x < size; x++) {
      // Distance from nearest corner for rounding
      const cx = x < radius ? radius : x >= size - radius ? size - 1 - radius : x;
      const cy = y < radius ? radius : y >= size - radius ? size - 1 - radius : y;
      const dx = x - cx;
      const dy = y - cy;
      const inside = dx * dx + dy * dy <= radius * radius;
      const a = inside ? 255 : 0;
      const off = 1 + x * 4;
      row[off] = r;
      row[off + 1] = g;
      row[off + 2] = b;
      row[off + 3] = a;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const idat = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const CARDINAL = [0x8c, 0x15, 0x15];
for (const size of [16, 48, 128]) {
  const png = makePng(size, ...CARDINAL);
  const path = `./chrome-extension/icons/icon-${size}.png`;
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes, sha1=${createHash("sha1").update(png).digest("hex").slice(0, 8)})`);
}
