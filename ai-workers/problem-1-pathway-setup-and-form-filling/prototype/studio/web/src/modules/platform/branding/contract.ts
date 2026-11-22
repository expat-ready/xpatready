// PF-13 part 2 (concept screens/PF-13; AG-1-6, AG-1-9, AG-16-2; P-574 (1); R1.23): the shapes the Branding page reads from parts
// 1a and 1b's routes, parsed at the edge, and the page's pure rules. No imports from the app, so a test reads it in Node. The server
// decides every rule; the rules here only say a refusal earlier, in the server's own words (the browser check reads both sides).
import { z } from "zod";

/** Who may open the page: Owner and Admin (AG-16-2). */
export const BRANDING_KEY = "agent/settings:edit";

export const IMAGE_KINDS = ["logo", "favicon", "banner"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
const KB = 1024, MB = 1024 * KB;
/** Part 1b's Sample limits (api/src/platform/branding/image-setting.ts IMAGE_LIMITS; the browser check compares the two). */
export const IMAGE_LIMITS: Record<ImageKind, { bytes: number; words: string }> = { logo: { bytes: 2 * MB, words: "2 MB" }, favicon: { bytes: 256 * KB, words: "256 KB" }, banner: { bytes: 2 * MB, words: "2 MB" } };
export const MIN_CONTRAST = 4.5;
export const SENDER_NAME_MAX = 80;

const Image = z.object({ link: z.string(), width: z.number(), height: z.number(), mediaType: z.string() }).nullable();
/** GET /api/platform/branding, the parts this page shows (the read carries more: accent colour, tagline, footer, signature). */
export const Branding = z.object({
  colour: z.string().nullable(), senderName: z.string().nullable(),
  neutral: z.object({ colour: z.string() }),
  images: z.object({ logo: Image, favicon: Image, banner: Image }),
});
export type Branding = z.infer<typeof Branding>;
/** GET /api/public/firms/:firmKey/branding: the firm's name as clients see it. */
export const PublicBranding = z.object({ name: z.string() });

/** WCAG 2.1 contrast ratio of #rrggbb against white, as the server computes it (branding.ts contrastOnWhite). */
export function contrastOnWhite(hex: string): number {
  const ch = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return 1.05 / (l + 0.05);
}
/** The ratio as people read it, cut (never rounded up) to two decimals, as the server writes it. */
export const ratioWords = (r: number) => `${+(Math.floor(r * 100) / 100).toFixed(2)}:1`;
const HEX = /^#[0-9a-fA-F]{6}$/;
/** The typed colour as it would be stored: null when the field is empty (ExpatReady's neutral colour applies). */
export const colourValue = (typed: string): string | null => (typed.trim() ? typed.trim().toLowerCase() : null);
/** Why a typed colour cannot be saved, in the server's words; null when it can (empty: not set). */
export function colourProblem(typed: string): string | null {
  const v = typed.trim();
  if (!v) return null;
  if (!HEX.test(v)) return "Brand colour: a colour as #rrggbb, for example #1f4e79.";
  const r = contrastOnWhite(v.toLowerCase());
  return r >= MIN_CONTRAST ? null : `Contrast ${ratioWords(r)} on white; at least ${MIN_CONTRAST}:1 is needed.`;
}
/** The line under a colour that may be saved. */
export const contrastLine = (colour: string) => `Contrast ${ratioWords(contrastOnWhite(colour))} on white.`;

/** The typed sender name as stored: trimmed; null when empty (the firm's name applies). */
export const senderValue = (typed: string): string | null => typed.trim() || null;
export function senderProblem(typed: string): string | null {
  const v = typed.trim();
  if ([...v].length > SENDER_NAME_MAX) return `Sender name: at most ${SENDER_NAME_MAX} characters.`;
  return null;
}

/** PNG or JPEG by the file's own first bytes, never by its name or declared type (part 1b reads the bytes too). */
export function sniff(head: Uint8Array): "image/png" | "image/jpeg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((b, i) => head[i] === b)) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  return null;
}
export const NOT_AN_IMAGE = "Use a PNG or JPEG file.";
export const TOO_WIDE = "The image is wider or taller than 65,535 pixels. Use a smaller PNG or JPEG file.";
export const MAX_SIDE = 65535, MAX_IMAGE_PIXELS = 89_500_000;
export const tooLargeWords = (kind: ImageKind) => `The ${kind} can be at most ${IMAGE_LIMITS[kind].words}.`;
const ARITHMETIC = [0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf], SOF = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7];
/** The size the file's own header declares, read without drawing it (challenge M2): a PNG's IHDR and its chunks up to IEND, a
 *  JPEG's segments up to its frame and scan. null: the structure does not read (cut short, arithmetic-coded, no frame). The server
 *  parses more (CRCs, every marker) and stays the authority (part 1b's walkImage). */
export function declaredSize(b: Uint8Array): { width: number; height: number } | null {
  const type = sniff(b), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === "image/png") {
    if (b.length < 33 || dv.getUint32(8) !== 13 || String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return null;
    let p = 8, ended = false;
    while (p + 12 <= b.length) { const len = dv.getUint32(p), name = String.fromCharCode(...b.subarray(p + 4, p + 8)); if (p + 12 + len > b.length) return null; p += 12 + len; if (name === "IEND") { ended = true; break; } }
    return ended ? { width: dv.getUint32(16), height: dv.getUint32(20) } : null;
  }
  if (type === "image/jpeg") {
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) return null;
      const m = b[p + 1];
      if (m === 0xff) { p++; continue; }
      if (ARITHMETIC.includes(m)) return null;
      const len = (b[p + 2] << 8) | b[p + 3];
      if (len < 2 || p + 2 + len > b.length) return null;
      // The frame gives the size; the picture must also reach its end marker (a file cut short is refused).
      if (SOF.includes(m)) return len >= 8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9 ? { height: (b[p + 5] << 8) | b[p + 6], width: (b[p + 7] << 8) | b[p + 8] } : null;
      p += 2 + len;
    }
  }
  return null;
}
/** Why a chosen file is refused before it is drawn, checked in the server's order (empty, size, type, structure, pixels); null
 *  when it may be shown. `bytes`: the whole file once it is within its size limit (else its first bytes are enough). */
export function fileProblem(kind: ImageKind, size: number, bytes: Uint8Array): string | null {
  if (!size) return "Choose a PNG or JPEG file.";
  if (size > IMAGE_LIMITS[kind].bytes) return tooLargeWords(kind);
  if (!sniff(bytes)) return NOT_AN_IMAGE;
  const d = declaredSize(bytes);
  if (!d || !d.width || !d.height) return NOT_AN_IMAGE;
  if (d.width > MAX_SIDE || d.height > MAX_SIDE) return TOO_WIDE;
  const pixels = d.width * d.height;
  return pixels > MAX_IMAGE_PIXELS ? `This image is too large to open safely (${Math.round(pixels / 1e5) / 10} megapixels; the limit is ${MAX_IMAGE_PIXELS / 1e6}).` : null;
}
/** A file's size in words: "120 KB", "1.4 MB". */
export const sizeWords = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / KB))} KB`);
/** A stored image's link on this page's own address (the read answers an absolute link built from the server's public address). */
export const sameOrigin = (link: string) => { try { const u = new URL(link); return `${u.pathname}${u.search}`; } catch { return link; } };

export const KIND_WORDS: Record<ImageKind, { label: string; hint: string }> = {
  logo: { label: "Logo", hint: `PNG or JPEG, at most ${IMAGE_LIMITS.logo.words}. Shown on client pages, emails and documents.` },
  favicon: { label: "Favicon", hint: `PNG or JPEG, at most ${IMAGE_LIMITS.favicon.words}. The small picture in the browser tab of client pages.` },
  banner: { label: "Banner", hint: `PNG or JPEG, at most ${IMAGE_LIMITS.banner.words}. A wide picture across the top of client pages.` },
};
/** "colour, sender name and logo": a list in words. */
export const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
