/**
 * A marker on a page or picture, when the file under it is replaced.
 *
 * It stays only where the page is shown to be the same page. It is never
 * moved by likeness: a marker saying "Completed" must not end up beside a
 * different requirement.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildChecksheetFixture, buildScannedPdf, buildTextPdf } from "../../__fixtures__/checksheets/build-fixtures";
import { movedPage, reconcileAnchor, resolveAnchor, type StoredAnchor } from "./anchors";
import { jpegContentHash, pngContentHash } from "./content-hash";
import type { ChecksheetFormat, ChecksheetRender } from "./model";
import { buildChecksheetRender } from "./render";

async function renderOf(bytes: Buffer, format: ChecksheetFormat): Promise<ChecksheetRender> {
  const out = await buildChecksheetRender(bytes, format);
  if (!out.render) throw new Error("no render");
  return out.render;
}

/** A marker placed on a page of a file, as it is stored. */
function markerOn(render: ChecksheetRender, page: number, x = 0.25, y = 0.4): StoredAnchor {
  const placed = resolveAnchor(render, "point", { page, x, y });
  if (!placed) throw new Error("the file offers no such place");
  return { anchorType: "point", anchor: placed.anchor, anchorFingerprint: placed.fingerprint };
}

const pageOf = (kept: ReturnType<typeof reconcileAnchor>) => (kept ? (kept.anchor as { page: number }).page : null);

// ─── PNG / JPEG helpers ──────────────────────────────────────────────────────

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

interface Chunk {
  type: string;
  body: Buffer;
}

function chunksOf(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  for (let p = 8; p + 12 <= png.length; ) {
    const length = png.readUInt32BE(p);
    chunks.push({ type: png.toString("latin1", p + 4, p + 8), body: png.subarray(p + 8, p + 8 + length) });
    p += 12 + length;
  }
  return chunks;
}

const pngFrom = (chunks: Chunk[]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks.map((c) => chunk(c.type, c.body))]);

/** The same picture, with every row stored under a different PNG filter and compression. */
function reencoded(png: Buffer): Buffer {
  const chunks = chunksOf(png);
  const header = chunks.find((c) => c.type === "IHDR")!.body;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header[9]!]!;
  const step = Math.max(1, (channels * header[8]!) / 8);
  const stride = Math.ceil((width * channels * header[8]!) / 8);
  const stored = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.body)));

  // Undo whatever filters the file used...
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = stored[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const raw = stored[y * (stride + 1) + 1 + x]!;
      const left = x >= step ? pixels[y * stride + x - step]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= step ? pixels[(y - 1) * stride + x - step]! : 0;
      const paeth = () => {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      };
      const add = [0, left, up, (left + up) >> 1, paeth()][filter]!;
      pixels[y * stride + x] = (raw + add) & 0xff;
    }
  }
  // ...and store every row with the "Sub" filter instead.
  const again = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    again[y * (stride + 1)] = 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= step ? pixels[y * stride + x - step]! : 0;
      again[y * (stride + 1) + 1 + x] = (pixels[y * stride + x]! - left) & 0xff;
    }
  }
  const others = chunks.filter((c) => c.type !== "IDAT" && c.type !== "IEND");
  return pngFrom([...others, { type: "IDAT", body: deflateSync(again, { level: 1 }) }, { type: "IEND", body: Buffer.alloc(0) }]);
}

function withPngText(png: Buffer, text: string): Buffer {
  const chunks = chunksOf(png);
  const at = chunks.findIndex((c) => c.type === "IDAT");
  chunks.splice(at, 0, { type: "tEXt", body: Buffer.from(`Comment\0${text}`, "latin1") });
  return pngFrom(chunks);
}

function withOnePixelChanged(png: Buffer): Buffer {
  const chunks = chunksOf(png);
  const stored = Buffer.from(inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.body))));
  stored[stored.length - 1] = stored[stored.length - 1]! ^ 0x01;
  const others = chunks.filter((c) => c.type !== "IDAT" && c.type !== "IEND");
  return pngFrom([...others, { type: "IDAT", body: deflateSync(stored) }, { type: "IEND", body: Buffer.alloc(0) }]);
}

function withJpegComment(jpeg: Buffer, text: string): Buffer {
  const body = Buffer.from(text, "latin1");
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xfffe, 0);
  segment.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segment, body, jpeg.subarray(2)]);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("a picture", () => {
  it("the same file again: the marker stays", async () => {
    const png = await buildChecksheetFixture("flowchart-png");
    const render = await renderOf(png, "png");
    expect(reconcileAnchor(markerOn(render, 0), render, true)).not.toBeNull();
  });

  it("the same picture in a different file: the marker stays", async () => {
    const png = await buildChecksheetFixture("flowchart-png");
    const marker = markerOn(await renderOf(png, "png"), 0);
    for (const [what, bytes] of [
      ["a comment was added", withPngText(png, "Downloaded 2026-09-28")],
      ["it was stored with other filters and compression", reencoded(png)],
    ] as const) {
      expect(bytes.equals(png), what).toBe(false);
      const kept = reconcileAnchor(marker, await renderOf(bytes, "png"), false);
      expect(kept, what).not.toBeNull();
      expect(kept!.anchor).toEqual(marker.anchor);
    }
  });

  it("a picture that differs in one pixel is a different picture: the marker is detached", async () => {
    const png = await buildChecksheetFixture("flowchart-png");
    const marker = markerOn(await renderOf(png, "png"), 0);
    expect(reconcileAnchor(marker, await renderOf(withOnePixelChanged(png), "png"), false)).toBeNull();
  });

  it("a JPEG with a comment or other description added is the same picture", async () => {
    const jpeg = await buildChecksheetFixture("flowchart-jpg");
    const marker = markerOn(await renderOf(jpeg, "jpg"), 0);
    const described = withJpegComment(jpeg, "Saved from scu.edu");
    expect(jpegContentHash(described)).toBe(jpegContentHash(jpeg));
    expect(reconcileAnchor(marker, await renderOf(described, "jpg"), false)).not.toBeNull();

    const changed = Buffer.from(jpeg);
    changed[changed.length - 3] = changed[changed.length - 3]! ^ 0x01;
    expect(reconcileAnchor(marker, await renderOf(changed, "jpg"), false)).toBeNull();
  });

  it("a picture in the other format is never assumed to be the same", async () => {
    const marker = markerOn(await renderOf(await buildChecksheetFixture("flowchart-png"), "png"), 0);
    expect(reconcileAnchor(marker, await renderOf(await buildChecksheetFixture("flowchart-jpg"), "jpg"), false)).toBeNull();
  });

  it("a marker made before pictures were fingerprinted stays only on the identical file", async () => {
    const render = await renderOf(await buildChecksheetFixture("flowchart-png"), "png");
    const old: StoredAnchor = { anchorType: "point", anchor: { page: 0, x: 0.5, y: 0.5 }, anchorFingerprint: null };
    expect(reconcileAnchor(old, render, true)).not.toBeNull();
    expect(reconcileAnchor(old, render, false)).toBeNull();
  });

  it("gives no fingerprint to a file that is not a picture", () => {
    expect(pngContentHash(Buffer.from("not a picture"))).toBeNull();
    expect(jpegContentHash(Buffer.from("not a picture"))).toBeNull();
  });
});

describe("a PDF with text", () => {
  const page = (title: string) => [title, "Requirement one", "Requirement two"];

  it("same layout, same words: the markers stay", async () => {
    const before = await renderOf(buildTextPdf([page("Lower Division"), page("Upper Division")]), "pdf");
    // Built again: a different file, saying the same.
    const after = await renderOf(buildTextPdf([page("Lower Division"), page("Upper Division"), page("Electives")]), "pdf");
    expect(pageOf(reconcileAnchor(markerOn(before, 0), after, false))).toBe(0);
    expect(pageOf(reconcileAnchor(markerOn(before, 1), after, false))).toBe(1);
  });

  it("different layout: a marker on a page that now says something else is detached", async () => {
    const before = await renderOf(buildTextPdf([page("Lower Division"), page("Upper Division")]), "pdf");
    const after = await renderOf(buildTextPdf([page("Lower Division"), ["Upper Division", "A different requirement"]]), "pdf");
    expect(pageOf(reconcileAnchor(markerOn(before, 0), after, false))).toBe(0);
    expect(reconcileAnchor(markerOn(before, 1), after, false)).toBeNull();
  });

  it("a page inserted in front: each marker follows its page to the new page number", async () => {
    const before = await renderOf(buildTextPdf([page("Lower Division"), page("Upper Division")]), "pdf");
    const after = await renderOf(buildTextPdf([page("Cover"), page("Lower Division"), page("Upper Division")]), "pdf");
    const first = markerOn(before, 0, 0.1, 0.9);
    const kept = reconcileAnchor(first, after, false);
    expect(kept!.anchor).toEqual({ page: 1, x: 0.1, y: 0.9 });
    expect(movedPage(first, kept!)).toBe(true);
    expect(pageOf(reconcileAnchor(markerOn(before, 1), after, false))).toBe(2);
    // Its fingerprint is the new page's, so the next replacement starts from there.
    expect(kept!.fingerprint).toBe(first.anchorFingerprint);
  });

  it("a page removed: markers on it are detached, the others follow their pages", async () => {
    const before = await renderOf(buildTextPdf([page("Lower Division"), page("Upper Division"), page("Electives")]), "pdf");
    const after = await renderOf(buildTextPdf([page("Lower Division"), page("Electives")]), "pdf");
    expect(pageOf(reconcileAnchor(markerOn(before, 0), after, false))).toBe(0);
    expect(reconcileAnchor(markerOn(before, 1), after, false)).toBeNull();
    expect(pageOf(reconcileAnchor(markerOn(before, 2), after, false))).toBe(1);
  });

  it("a page that appears twice in the new file is never guessed at", async () => {
    const before = await renderOf(buildTextPdf([page("Cover"), page("Lower Division")]), "pdf");
    const after = await renderOf(buildTextPdf([page("Lower Division"), page("Cover"), page("Lower Division")]), "pdf");
    // "Lower Division" was page 2; it is now pages 1 and 3. Which one is not knowable.
    expect(reconcileAnchor(markerOn(before, 1), after, false)).toBeNull();
    // "Cover" exists once, so its marker goes with it.
    expect(pageOf(reconcileAnchor(markerOn(before, 0), after, false))).toBe(1);
  });
});

describe("a scanned PDF (pages without text)", () => {
  const LETTER = { width: 612, height: 792 };

  it("has a fingerprint for each page, from what the page draws", async () => {
    const render = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    if (render.kind !== "pdf") throw new Error("expected a PDF");
    expect(render.pages.map((p) => p.textHash)).toEqual([null, null, null]);
    expect(render.pages.every((p) => /^[0-9a-f]{32}$/.test(p.contentHash ?? ""))).toBe(true);
    expect(new Set(render.pages.map((p) => p.contentHash)).size).toBe(3);
  });

  it("gives a page the same fingerprint whenever it draws the same thing", async () => {
    const a = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const b = await renderOf(await buildChecksheetFixture("scanned-pdf-page-inserted"), "pdf");
    if (a.kind !== "pdf" || b.kind !== "pdf") throw new Error("expected PDFs");
    expect(b.pages.slice(1).map((p) => p.contentHash)).toEqual(a.pages.map((p) => p.contentHash));
  });

  it("same pages in a different file: the markers stay", async () => {
    const before = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const after = await renderOf(buildScannedPdf([{ ...LETTER, seed: 1 }, { ...LETTER, seed: 2 }, { ...LETTER, seed: 3 }, { ...LETTER, seed: 4 }]), "pdf");
    for (const n of [0, 1, 2]) expect(pageOf(reconcileAnchor(markerOn(before, n), after, false))).toBe(n);
  });

  it("a page inserted, a page removed: markers follow their pages", async () => {
    const before = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const inserted = await renderOf(await buildChecksheetFixture("scanned-pdf-page-inserted"), "pdf");
    expect([0, 1, 2].map((n) => pageOf(reconcileAnchor(markerOn(before, n), inserted, false)))).toEqual([1, 2, 3]);
    const removed = await renderOf(await buildChecksheetFixture("scanned-pdf-page-removed"), "pdf");
    expect([0, 1, 2].map((n) => pageOf(reconcileAnchor(markerOn(before, n), removed, false)))).toEqual([0, null, 1]);
  });

  it("the same paper scanned again is different pictures: every marker is detached", async () => {
    const before = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const after = await renderOf(await buildChecksheetFixture("scanned-pdf-rescanned"), "pdf");
    expect([0, 1, 2].map((n) => reconcileAnchor(markerOn(before, n), after, false))).toEqual([null, null, null]);
  });

  it("changed page dimensions: the marker is detached, though the picture is the same", async () => {
    const before = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const after = await renderOf(buildScannedPdf([{ width: 792, height: 612, seed: 1 }, { ...LETTER, seed: 2 }]), "pdf");
    expect(reconcileAnchor(markerOn(before, 0), after, false)).toBeNull();
    expect(pageOf(reconcileAnchor(markerOn(before, 1), after, false))).toBe(1);
  });

  it("a marker made before scans were fingerprinted stays only on the identical file", async () => {
    const render = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const old: StoredAnchor = { anchorType: "point", anchor: { page: 1, x: 0.5, y: 0.5 }, anchorFingerprint: null };
    expect(pageOf(reconcileAnchor(old, render, true))).toBe(1);
    expect(reconcileAnchor(old, render, false)).toBeNull();
  });
});

describe("what never moves", () => {
  it("a cell entry is not moved to another row, whatever the new file holds", async () => {
    const before = await renderOf(await buildChecksheetFixture("major-workbook"), "xlsx");
    const after = await renderOf(await buildChecksheetFixture("major-workbook-reworded"), "xlsx");
    const placed = resolveAnchor(before, "sheet_cell", { sheet: 0, row: 4, col: 2 })!;
    const stored: StoredAnchor = { anchorType: "sheet_cell", anchor: placed.anchor, anchorFingerprint: placed.fingerprint };
    expect(reconcileAnchor(stored, after, false)).toBeNull();
  });

  it("a marker does not follow its page into a different kind of document", async () => {
    const before = await renderOf(await buildChecksheetFixture("scanned-pdf"), "pdf");
    const picture = await renderOf(await buildChecksheetFixture("flowchart-png"), "png");
    expect(reconcileAnchor(markerOn(before, 0), picture, false)).toBeNull();
  });
});
