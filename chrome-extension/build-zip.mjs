// Bundle the Chrome extension into a zip the API server can serve.
// Uses the `archiver` package already available transitively via the workspace
// — but to avoid adding deps, we ship a pure-Node ZIP writer (store-only).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listFiles(p, base, out);
    else {
      const rel = relative(base, p).replace(/\\/g, "/");
      // Skip the zip itself and build scripts when packaging.
      if (rel.endsWith(".zip")) continue;
      if (rel === "build-zip.mjs" || rel === "build-icons.mjs") continue;
      out.push({ path: rel, full: p });
    }
  }
  return out;
}

function buildZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  const dosTime = 0, dosDate = 33; // 1980-01-01

  for (const f of files) {
    const data = readFileSync(f.full);
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const stored = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const nameBuf = Buffer.from(f.path, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);     // version needed
    localHeader.writeUInt16LE(0x0800, 6); // utf-8 flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(stored.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, nameBuf, stored);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(stored.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += localHeader.length + nameBuf.length + stored.length;
  }

  const localBlob = Buffer.concat(local);
  const centralBlob = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBlob, centralBlob, eocd]);
}

const root = "./chrome-extension";
const files = listFiles(root);
console.log(`packaging ${files.length} files…`);
const zip = buildZip(files);

const outDir = "./artifacts/api-server/public-static";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/campusval-extension.zip`;
writeFileSync(outPath, zip);
console.log(`wrote ${outPath} (${zip.length} bytes)`);
