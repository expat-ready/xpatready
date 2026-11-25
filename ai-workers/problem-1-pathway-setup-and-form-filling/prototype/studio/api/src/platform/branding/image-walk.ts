// PF-13 part 1b (brief PF-13.md "metadata stripped by walking the file's structure, no new library", Lead B rev 16.40):
// a firm's brand image is kept only as PNG or JPEG, rebuilt from the parts a picture needs. Pure code, no I/O.
// JPEG keeps SOI, APP0 (JFIF), APP14 (Adobe), DQT, SOFn (Huffman), DHT, DRI, SOS with its scan data, EOI; drops APP1-APP13,
// APP15 (EXIF, XMP, GPS) and COM; an arithmetic-coded frame (SOF9-SOF11, SOF13-SOF15, or a DAC table) is refused (415);
// any other marker is refused rather than guessed. PNG keeps IHDR, PLTE, IDAT, IEND, tRNS, cHRM, gAMA, iCCP, sRGB, pHYs
// (each CRC checked) and drops every other chunk (eXIf, tEXt, iTXt, zTXt, tIME, unknown). Bytes after EOI or IEND (a
// polyglot tail) are dropped. A file whose structure does not parse is refused. SVG and every other type: refused.
import { crc32 } from "node:zlib";
import { detect } from "../files/file-type.ts";

/** The largest side a brand image may have (a stored size, and JPEG's own limit). */
export const MAX_SIDE = 65535;
export const TOO_WIDE = "the image is wider or taller than 65,535 pixels";
export type Walked = { ok: true; kind: "png" | "jpeg"; mediaType: "image/png" | "image/jpeg"; bytes: Uint8Array; dropped: string[]; width: number; height: number } | { ok: false; why: string };
const no = (why: string): Walked => ({ ok: false, why });

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "iCCP", "sRGB", "pHYs"]);

function walkPng(b: Uint8Array): Walked {
  const out: Uint8Array[] = [b.subarray(0, 8)], dropped: string[] = [], dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, seenIdat = false, first = true;
  while (true) {
    if (p + 12 > b.length) return no("the PNG ends before its IEND chunk");
    const len = dv.getUint32(p), type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) return no("a PNG chunk has no valid name");
    if (len > 0x7fffffff || p + 12 + len > b.length) return no("a PNG chunk runs past the end of the file");
    const whole = b.subarray(p, p + 12 + len);
    if (crc32(b.subarray(p + 4, p + 8 + len)) >>> 0 !== dv.getUint32(p + 8 + len)) return no(`the PNG chunk ${type} is damaged (CRC)`);
    if (first && type !== "IHDR") return no("a PNG must start with IHDR");
    if (type === "IHDR" && (!first || len !== 13)) return no("a PNG has one IHDR chunk of 13 bytes");   // review M2: a second header could hide its size
    first = false;
    if (type === "IDAT") seenIdat = true;
    if (PNG_KEEP.has(type)) out.push(whole); else dropped.push(type);
    p += 12 + len;
    if (type === "IEND") break;
  }
  if (!seenIdat) return no("the PNG has no image data");
  if (p < b.length) dropped.push(`${b.length - p} bytes after IEND`);
  const width = dv.getUint32(16), height = dv.getUint32(20);
  if (!width || !height) return no("the PNG has no size");
  if (width > MAX_SIDE || height > MAX_SIDE) return no(TOO_WIDE);
  return { ok: true, kind: "png", mediaType: "image/png", bytes: concat(out), dropped, width, height };
}

const JPEG_KEEP = new Set([0xe0, 0xee, 0xdb, 0xc4, 0xdd, 0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7]);
const JPEG_ARITH = new Set([0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf, 0xcc]);
const isDrop = (m: number) => (m >= 0xe1 && m <= 0xed) || m === 0xef || m === 0xfe;
const isSof = (m: number) => [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7].includes(m);

function walkJpeg(b: Uint8Array): Walked {
  const out: Uint8Array[] = [b.subarray(0, 2)], dropped: string[] = [];
  let p = 2, sof = false, sos = false, width = 0, height = 0;
  while (true) {
    if (p + 2 > b.length) return no("the JPEG ends before its EOI marker");
    if (b[p] !== 0xff) return no("the JPEG has bytes where a marker should be");
    while (p + 1 < b.length && b[p + 1] === 0xff) p++;   // fill bytes
    const m = b[p + 1];
    if (m === 0xd9) { out.push(b.subarray(p, p + 2)); p += 2; break; }
    if (m === 0xd8 || m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) return no("the JPEG has a marker out of place");
    if (JPEG_ARITH.has(m)) return no("arithmetic-coded JPEG is not taken");
    if (p + 4 > b.length) return no("the JPEG ends inside a marker");
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2 || p + 2 + len > b.length) return no("a JPEG segment runs past the end of the file");
    const seg = b.subarray(p, p + 2 + len);
    if (m === 0xda) {
      if (!sof) return no("the JPEG's scan comes before its frame");
      sos = true;
      // The scan data runs to the next marker that is neither a stuffed 0xFF00 nor a restart marker.
      let q = p + 2 + len;
      while (q + 1 < b.length && !(b[q] === 0xff && b[q + 1] !== 0x00 && !(b[q + 1] >= 0xd0 && b[q + 1] <= 0xd7))) q++;
      if (q + 1 >= b.length) return no("the JPEG's scan data has no end");
      out.push(b.subarray(p, q)); p = q; continue;
    }
    if (isSof(m)) { if (sof) return no("the JPEG has more than one frame header"); if (len < 8) return no("the JPEG frame is too short"); sof = true; height = (b[p + 5] << 8) | b[p + 6]; width = (b[p + 7] << 8) | b[p + 8]; }
    // APP0 and APP14 only as the brief names them (JFIF, Adobe); any other APP0/APP14 is dropped (review m1).
    const id = (t: string) => Buffer.from(b.subarray(p + 4, p + 4 + t.length)).toString("latin1") === t;
    if ((m === 0xe0 && !id("JFIF\0")) || (m === 0xee && !id("Adobe"))) dropped.push(`APP${m - 0xe0}`);
    else if (JPEG_KEEP.has(m)) out.push(seg);
    else if (isDrop(m)) dropped.push(m === 0xfe ? "COM" : `APP${m - 0xe0}`);
    else return no(`the JPEG has a marker this door does not take (0x${m.toString(16)})`);
    p += 2 + len;
  }
  if (!sof || !sos) return no("the JPEG has no frame or no scan");
  if (!width || !height) return no("the JPEG has no size");
  if (p < b.length) dropped.push(`${b.length - p} bytes after EOI`);
  return { ok: true, kind: "jpeg", mediaType: "image/jpeg", bytes: concat(out), dropped, width, height };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

/** The kept picture: PNG or JPEG by its own bytes (PF-F4's detect, which also refuses a pixel bomb), rebuilt without
 *  metadata or tail. Anything else, or a file that does not parse, is refused (the route answers 415). */
export function walkImage(bytes: Uint8Array): Walked {
  const d = detect(bytes, ["png", "jpeg"]);
  if (!d.ok) return no(d.message);
  if (d.kind === "png") return PNG_SIG.every((x, i) => bytes[i] === x) ? walkPng(bytes) : no("not a PNG");
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? walkJpeg(bytes) : no("not a JPEG");
}
