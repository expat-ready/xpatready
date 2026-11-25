// PF-F4 (map row 67): the one file-type and size check every upload door calls. Pure code, no library, no I/O.
// (1) The type comes from the file's own bytes, never its name or the browser's claim (AG-9-2). (2) Word and Excel are
// OOXML: a ZIP whose central directory, read here without decompressing anything, holds [Content_Types].xml and a
// word/ or xl/ part; a macro project refuses the file. (3) A plain ZIP is refused in Release 1 (P-607, Q7; departs from
// SA-8-37 and SA-8-49). (4) Size limits are built constants (SA-8-58): 25 MB documents, 10 MB images, checked on the
// declared size when an upload opens and on the bytes at the end. (5) Batch 5: the bytes decide; a disagreeing name or
// declared type is corrected, not refused. Images whose header declares over 89.5 megapixels are refused (Sample);
// PDFs with active content are flagged, not refused (IRCC's own forms carry scripts). Every refusal lists the door's
// allowed types and ends "Nothing was stored." The "damaged PDF" check needs a parser and stays with the case side (CS-D1).

export type FileKind = "pdf" | "jpeg" | "png" | "heic" | "tiff" | "word" | "excel";
export type SizeClass = "document" | "image";

/** Every kind the platform accepts (SA-8-37 without ZIP, P-607); a door narrows it through its own allowed list. */
export const ALL_KINDS: readonly FileKind[] = ["pdf", "jpeg", "png", "heic", "tiff", "word", "excel"];

const MB = 1024 * 1024;
/** SA-8-58: built constants, not a setting. */
export const MAX_BYTES: Record<SizeClass, number> = { document: 25 * MB, image: 10 * MB };
/** CS-D4 (batch 5): an image header declaring more pixels than this is refused. Sample value, no source. */
export const MAX_IMAGE_PIXELS = 89_500_000;

type KindInfo = { mediaType: string; extension: string; words: string; size: SizeClass };
export const KINDS: Record<FileKind, KindInfo> = {
  pdf: { mediaType: "application/pdf", extension: "pdf", words: "PDF", size: "document" },
  jpeg: { mediaType: "image/jpeg", extension: "jpg", words: "JPEG", size: "image" },
  png: { mediaType: "image/png", extension: "png", words: "PNG", size: "image" },
  heic: { mediaType: "image/heic", extension: "heic", words: "HEIC", size: "image" },
  tiff: { mediaType: "image/tiff", extension: "tiff", words: "TIFF", size: "image" },
  word: { mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", words: "Word", size: "document" },
  excel: { mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", words: "Excel", size: "document" },
};

/** The safe viewer's flag (CS-D4, CS-D5): shown on a PDF with active content. */
export const SCRIPTS_FLAG = "Contains scripts: opened only in the safe viewer";
export const NOTHING_STORED = "Nothing was stored.";

export type RefusalReason = "NOT_ALLOWED_TYPE" | "ZIP" | "MACROS" | "TOO_LARGE" | "TOO_MANY_PIXELS" | "DAMAGED" | "EMPTY";
export type Refused = { ok: false; reason: RefusalReason; message: string };
export type Detected = { ok: true; kind: FileKind; mediaType: string; extension: string; activeContent: string[]; pixels?: number };
export type Checked = {
  ok: true; kind: FileKind; mediaType: string; size: number; name: string;
  /** The name or the declared type disagreed with the bytes and was corrected (batch 5, CS-D4's rule). */
  corrected: boolean; flags: string[]; activeContent: string[];
};

const words = (kinds: readonly FileKind[]) => {
  const w = kinds.map((k) => KINDS[k].words);
  return w.length < 2 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
};
const refuse = (reason: RefusalReason, why: string, allowed: readonly FileKind[]): Refused =>
  ({ ok: false, reason, message: `${why} Allowed here: ${words(allowed)}. ${NOTHING_STORED}` });
const mbText = (n: number) => `${Math.round((n / MB) * 10) / 10} MB`;

// ---- detection from the bytes ----------------------------------------------------------------------------------

const ascii = (b: Uint8Array, at: number, n: number) => (at + n <= b.length ? String.fromCharCode(...b.subarray(at, at + n)) : "");
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "heif", "mif1", "msf1"]);
const NOT_HEIC = new Set(["avif", "avis"]);

/** ISO-BMFF `ftyp` with a HEIC or HEIF brand (major or compatible); AVIF, which shares mif1, is not HEIC. */
function isHeic(b: Uint8Array): boolean {
  if (ascii(b, 4, 4) !== "ftyp") return false;
  const size = u32be(b, 0); if (size < 16 || size > Math.min(b.length, 4096)) return false;
  const brands = [ascii(b, 8, 4)]; for (let at = 16; at + 4 <= size; at += 4) brands.push(ascii(b, at, 4));
  return brands.some((x) => HEIC_BRANDS.has(x)) && !brands.some((x) => NOT_HEIC.has(x));
}

type ZipRead = { names: string[] } | { damaged: true };
const ZIP_MAX_ENTRIES = 5000;
/** The ZIP's central directory: names only, every offset bounds-checked, nothing decompressed (a bomb's declared sizes are never read). */
function zipNames(b: Uint8Array): ZipRead {
  const floor = Math.max(0, b.length - 22 - 0xffff);
  let eocd = -1;
  for (let at = b.length - 22; at >= floor; at--) if (b[at] === 0x50 && b[at + 1] === 0x4b && b[at + 2] === 5 && b[at + 3] === 6) { eocd = at; break; }
  if (eocd < 0) return { damaged: true };
  const count = u16le(b, eocd + 10), cdSize = u32le(b, eocd + 12), cdAt = u32le(b, eocd + 16);
  // Over 5,000 entries (this also refuses ZIP64's 0xffff count) or a directory outside the file (also ZIP64's 0xffffffff
  // offset): not something an office program writes for a file under 25 MB.
  if (count > ZIP_MAX_ENTRIES || cdAt + cdSize > eocd) return { damaged: true };
  const names: string[] = [];
  for (let at = cdAt, i = 0; i < count; i++) {
    if (at + 46 > eocd || u32le(b, at) !== 0x02014b50) return { damaged: true };
    const n = u16le(b, at + 28), extra = u16le(b, at + 30), comment = u16le(b, at + 32);
    if (at + 46 + n > eocd) return { damaged: true };
    names.push(new TextDecoder().decode(b.subarray(at + 46, at + 46 + n)));
    at += 46 + n + extra + comment;
  }
  return { names };
}

/** PNG IHDR or JPEG SOF dimensions, read from the header only (no decoding). null: none found. */
function pixelsOf(kind: FileKind, b: Uint8Array): number | null {
  if (kind === "png") return b.length >= 24 && ascii(b, 12, 4) === "IHDR" ? u32be(b, 16) * u32be(b, 20) : null;
  if (kind !== "jpeg") return null;
  for (let at = 2; at + 4 <= b.length;) {
    if (b[at] !== 0xff) return null;
    const m = b[at + 1];
    if (m === 0xff) { at++; continue; }                       // fill byte
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { at += 2; continue; } // no length
    if (m === 0xda || m === 0xd9) return null;                // scan or end before any frame header
    const len = u16be(b, at + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return at + 9 <= b.length ? u16be(b, at + 5) * u16be(b, at + 7) : null;
    if (len < 2) return null;
    at += 2 + len;
  }
  return null;
}

const ACTIVE_NAMES = new Map([["JavaScript", "JavaScript"], ["JS", "JavaScript"], ["OpenAction", "OpenAction"], ["AA", "AA"],
  ["Launch", "Launch"], ["XFA", "XFA"], ["EmbeddedFile", "EmbeddedFiles"], ["EmbeddedFiles", "EmbeddedFiles"]]);
/** A byte scan for PDF names that start something on opening; #xx escapes are decoded (/J#61vaScript). Names inside
 *  compressed object streams are not seen: the flag is a hint, the safe viewer (CS-D5) is the control. */
function activeContentOf(b: Uint8Array): string[] {
  const text = new TextDecoder("latin1").decode(b), found = new Set<string>();
  for (const m of text.matchAll(/\/([^\s\0/[\]<>(){}%]{1,40})/g)) {
    const name = m[1].includes("#") ? m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : m[1];
    const hit = ACTIVE_NAMES.get(name); if (hit) found.add(hit);
  }
  return [...found].sort();
}

const ok = (kind: FileKind, extra: Partial<Detected> = {}): Detected =>
  ({ ok: true, kind, mediaType: KINDS[kind].mediaType, extension: KINDS[kind].extension, activeContent: [], ...extra });

/** Step 1, cheap: the kind from the file's signature (and a ZIP's directory). No whole-file scan. */
function sniff(b: Uint8Array, allowed: readonly FileKind[]): Detected | Refused {
  if (b.length === 0) return refuse("EMPTY", "This file is empty.", allowed);
  if (ascii(b, 0, 5) === "%PDF-") return ok("pdf");
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ok("jpeg");
  if (ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") return ok("png");
  if (ascii(b, 0, 4) === "II*\0" || ascii(b, 0, 4) === "MM\0*") return ok("tiff");
  if (isHeic(b)) return ok("heic");
  if (ascii(b, 0, 4) === "PK\x03\x04" || ascii(b, 0, 4) === "PK\x05\x06") {
    const z = zipNames(b);
    if ("damaged" in z) return refuse("DAMAGED", "This file could not be read: it may be damaged.", allowed);
    // OPC part names are case-insensitive (ECMA-376 part 2), so every comparison is on the lower-cased name.
    const names = z.names.map((n) => n.toLowerCase()), has = (p: (n: string) => boolean) => names.some(p);
    const office = has((n) => n === "[content_types].xml");
    const word = office && has((n) => n.startsWith("word/")), excel = office && has((n) => n.startsWith("xl/"));
    if (word || excel) {
      if (has((n) => /(^|\/)vbaproject\.bin$/.test(n) || n.startsWith("xl/macrosheets/") || /(^|\/)vbadata\.xml$/.test(n)))
        return refuse("MACROS", "Files with macros (.docm, .xlsm) are not accepted: save it as a plain Word or Excel file.", allowed);
      return ok(word ? "word" : "excel");
    }
    // Another office or packaged format (PowerPoint, OpenDocument, EPUB) is a type we do not take, not a folder of files.
    if (office || has((n) => n === "mimetype")) return refuse("NOT_ALLOWED_TYPE", "This type of file is not accepted.", allowed);
    return refuse("ZIP", "Upload the files inside one by one.", allowed);
  }
  return refuse("NOT_ALLOWED_TYPE", "This type of file is not accepted.", allowed);
}

/** Step 2, after the door and size checks: image header dimensions and the PDF's active names (whole-file scan). */
function inspect(found: Detected, b: Uint8Array, allowed: readonly FileKind[]): Detected | Refused {
  if (found.kind === "pdf") return { ...found, activeContent: activeContentOf(b) };
  const pixels = pixelsOf(found.kind, b);
  if ((found.kind === "png" || found.kind === "jpeg") && pixels === null)
    return refuse("DAMAGED", "This image could not be read: it may be damaged.", allowed);
  if (pixels !== null && pixels > MAX_IMAGE_PIXELS)
    return refuse("TOO_MANY_PIXELS", `This image is too large to open safely (${Math.round(pixels / 1e5) / 10} megapixels; the limit is ${MAX_IMAGE_PIXELS / 1e6}).`, allowed);
  return pixels === null ? found : { ...found, pixels };
}

/** The file's type from its own bytes (AG-9-2, AG-9-2a), with the image and PDF checks. Refusals here list every
 *  platform kind; `checkFile` narrows to the door and checks the size before the whole-file scans. */
export function detect(bytes: Uint8Array, allowed: readonly FileKind[] = ALL_KINDS): Detected | Refused {
  const found = sniff(bytes, allowed);
  return found.ok ? inspect(found, bytes, allowed) : found;
}

// ---- names and declared types ------------------------------------------------------------------------------------

const KNOWN_EXT = new Set(["pdf", "jpg", "jpeg", "jpe", "jfif", "png", "heic", "heif", "tif", "tiff", "doc", "docx", "docm", "xls", "xlsx", "xlsm",
  "zip", "exe", "com", "bat", "cmd", "scr", "msi", "js", "vbs", "ps1", "sh", "htm", "html", "svg", "xml", "txt", "rtf", "gif", "bmp", "webp"]);
const EXT_KIND: Record<string, FileKind> = { pdf: "pdf", jpg: "jpeg", jpeg: "jpeg", jpe: "jpeg", jfif: "jpeg", png: "png", heic: "heic", heif: "heic",
  tif: "tiff", tiff: "tiff", docx: "word", xlsx: "excel" };
const MEDIA_KIND: Record<string, FileKind> = Object.fromEntries([
  ...Object.entries(KINDS).map(([k, v]) => [v.mediaType, k]), ["image/jpg", "jpeg"], ["image/pjpeg", "jpeg"], ["image/heif", "heic"]]);

const extOf = (n: string) => /\.([A-Za-z0-9]{1,5})$/.exec(n)?.[1]?.toLowerCase();
/** The last path part; control, markup and invisible or direction characters removed; trailing dots and spaces dropped
 *  (Windows drops them too: "passport.exe." is "passport.exe"). */
const cleanBase = (name: string | undefined) => String(name ?? "").split(/[\\/]/).pop()!
  .replace(/[\u0000-\u001f\u007f<>"*?:|]/g, "").replace(/[​-‏‪-‮⁦-⁩﻿]/g, "").replace(/[.\s]+$/, "").trim();

/** Every known extension stripped from the end (a double extension is cleaned: passport.pdf.exe), then the person's own
 *  extension when it already names the bytes' kind (IMG_0001.JPG stays), else the bytes' extension. Never empty. */
export function correctedName(name: string | undefined, kind: FileKind): string {
  const original = cleanBase(name), own = extOf(original);
  let base = original;
  for (let e; (e = extOf(base)) && KNOWN_EXT.has(e);) base = base.slice(0, -(e.length + 1)).replace(/[.\s]+$/, "");
  base = Array.from(base.replace(/^\.+/, "")).slice(0, 190).join("") || "document";
  const ext = own && EXT_KIND[own] === kind ? original.slice(-own.length) : KINDS[kind].extension;
  return `${base}.${ext}`;
}

const kindOfClaim = (declared?: { name?: string; mediaType?: string }): FileKind | null => {
  const t = declared?.mediaType?.toLowerCase().split(";")[0].trim();
  if (t && MEDIA_KIND[t]) return MEDIA_KIND[t];
  const ext = /\.([A-Za-z0-9]{1,5})\s*$/.exec(declared?.name ?? "")?.[1]?.toLowerCase();
  return ext && EXT_KIND[ext] ? EXT_KIND[ext] : null;
};

// ---- the two checks every door calls -----------------------------------------------------------------------------

const limitOf = (kinds: readonly FileKind[]) => Math.max(...kinds.map((k) => MAX_BYTES[KINDS[k].size]));
const tooLarge = (size: number, cls: SizeClass, allowed: readonly FileKind[]) =>
  refuse("TOO_LARGE", `This file is ${mbText(size)}; the limit for ${cls}s is ${MAX_BYTES[cls] / MB} MB.`, allowed);

/** At creation (PF-F2's upload opens): the declared size against the declared type's limit, or, when the claim names
 *  no allowed type, the door's largest limit. The claim only picks which limit applies; the bytes decide the type at the end. */
export function checkDeclared(declared: { size: number; name?: string; mediaType?: string }, allowed: readonly FileKind[]): { ok: true } | Refused {
  if (!allowed.length) throw new Error("checkDeclared: a door allows at least one kind");
  if (!Number.isSafeInteger(declared.size) || declared.size < 0) return refuse("DAMAGED", "The file's size could not be read.", allowed);
  if (declared.size === 0) return refuse("EMPTY", "This file is empty.", allowed);
  const claim = kindOfClaim(declared);
  const cls: SizeClass = claim && allowed.includes(claim) ? KINDS[claim].size : (limitOf(allowed) === MAX_BYTES.document ? "document" : "image");
  return declared.size > MAX_BYTES[cls] ? tooLarge(declared.size, cls, allowed) : { ok: true };
}

/** At the end (all bytes in): the bytes' type, the door's allowed kinds, the actual size against that type's limit,
 *  then the stored name and type corrected from the bytes. */
export function checkFile(file: { bytes: Uint8Array; name?: string; mediaType?: string }, allowed: readonly FileKind[]): Checked | Refused {
  if (!allowed.length) throw new Error("checkFile: a door allows at least one kind");
  const size = file.bytes.length;
  if (size > limitOf(allowed)) return tooLarge(size, limitOf(allowed) === MAX_BYTES.document ? "document" : "image", allowed);
  const s = sniff(file.bytes, allowed);
  if (!s.ok) return s;
  const d = s;
  if (!allowed.includes(d.kind)) return refuse("NOT_ALLOWED_TYPE", `This file is ${/^[AEIOUH]/.test(KINDS[d.kind].words) ? "an" : "a"} ${KINDS[d.kind].words} file, which this upload does not accept.`, allowed);
  const cls = KINDS[d.kind].size;
  if (size > MAX_BYTES[cls]) return tooLarge(size, cls, allowed);
  const i = inspect(d, file.bytes, allowed);
  if (!i.ok) return i;
  const name = correctedName(file.name, i.kind);
  // Corrected only when the name or a known declared type disagreed with the bytes; an unknown claim
  // (application/octet-stream, none) is no disagreement.
  const claimed = MEDIA_KIND[file.mediaType?.toLowerCase().split(";")[0].trim() ?? ""];
  const corrected = name !== cleanBase(file.name) || (!!claimed && claimed !== i.kind);
  return { ok: true, kind: i.kind, mediaType: i.mediaType, size, name, corrected, activeContent: i.activeContent, flags: i.activeContent.length ? [SCRIPTS_FLAG] : [] };
}
