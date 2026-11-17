// PF-0p (rows rev 16): the document render port (contracts §0.3: docxtemplater, in-process; FO-5 builds the real
// adapter). A template key and plain data in, a document's bytes out. This folder imports only zod and its own files.
import { z } from "zod";

export const TemplateKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, "a dotted lower-case template key").max(100);
/** The data a template reads: plain JSON. */
export const RenderData = z.record(z.string(), z.json());
export type RenderData = z.infer<typeof RenderData>;

export type RenderedDocument = { bytes: Uint8Array; contentType: string };

export interface DocumentRenderPort {
  /** Renders `templateKey` with `data`. Throws on an unknown template or data the template cannot take. */
  render(templateKey: string, data: RenderData): Promise<RenderedDocument>;
}

/** Plain JSON with object keys sorted, so the same data always gives the same text. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** The fake: deterministic bytes (the same key and data always give the same bytes, whatever the key order), a text
 *  document naming the template and its data. `templates` limits the known keys; `failOn` forces a failure. */
export function fakeRender(opts: { templates?: string[]; contentType?: string; failOn?: (templateKey: string, data: RenderData) => boolean } = {}): DocumentRenderPort & { readonly calls: ReadonlyArray<{ templateKey: string; data: RenderData }> } {
  const calls: { templateKey: string; data: RenderData }[] = [];
  return {
    async render(templateKey, data) {
      const k = TemplateKey.parse(templateKey), d = RenderData.parse(data);
      if (opts.templates && !opts.templates.includes(k)) throw new Error(`unknown template ${k}`);
      if (opts.failOn?.(k, d)) throw new Error(`forced render failure: ${k}`);
      calls.push({ templateKey: k, data: structuredClone(d) });
      return { bytes: new TextEncoder().encode(`FAKE DOCUMENT\ntemplate: ${k}\ndata: ${stableJson(d)}\n`), contentType: opts.contentType ?? "text/plain; charset=utf-8" };
    },
    get calls() { return [...calls]; },
  };
}

// ------------------------------------------------------------------------------------------------- PF-Fp: Word to PDF
// PF-Fp (P-630; tech gate entry 17): a filled Word file in, a PDF out, for FO-5p part 2's "Download as PDF" and the
// signing hand-off. The real adapter is Gotenberg's LibreOffice route (api/src/front-office/render/gotenberg.ts); CI and
// the demo use fakePdf. A PDF never blocks a send: toPdf never throws, and any failure answers "no PDF" with the reason,
// so the caller keeps offering the .docx (withPdf). `toPdf` sits on its own port beside DocumentRenderPort (PR decision
// 1): DocxRender renders in-process and converts nothing, so one interface would make it carry a method it cannot keep.

export const PDF = "application/pdf";
/** Sample (gate entry 17, condition 3): the largest Word file sent to the converter, and each conversion's time limit. */
export const PDF_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const PDF_TIMEOUT_MS = 30_000;
/** Why there is no PDF: over the cap or not a Word file (refused before sending), the time limit, or the converter's
 *  own failure (an unreadable file, a refused request, an answer that is not a PDF). */
export const PdfFailure = z.enum(["TOO_LARGE", "NOT_DOCX", "TIMEOUT", "FAILED"]);
export type PdfFailure = z.infer<typeof PdfFailure>;
export type PdfResult = { pdf: RenderedDocument; failure: null } | { pdf: null; failure: PdfFailure; detail: string };

export interface DocumentPdfPort {
  /** Converts a Word file (.docx bytes) to PDF. Never throws: a failure answers `pdf: null` with its reason. A file over
   *  PDF_MAX_INPUT_BYTES, or one that is not a zip, is refused before anything is sent. */
  toPdf(docx: Uint8Array): Promise<PdfResult>;
}

/** A .docx is a zip: it starts with the local file header "PK\x03\x04". */
export function looksLikeDocx(bytes: unknown): bytes is Uint8Array {
  return bytes instanceof Uint8Array && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
/** A plain copy of the bytes (break F1: a Uint8Array subclass can lie about its length; the copy is made from the
 *  array's own length, so the bytes checked are the bytes sent). Anything else is returned as it is. */
export function plainBytes<T>(docx: T): T | Uint8Array {
  return docx instanceof Uint8Array ? new Uint8Array(docx) : docx;
}
/** The checks every adapter runs before sending, on plainBytes' copy: null when the file may be sent. */
export function refuseBeforeSending(docx: unknown, maxBytes = PDF_MAX_INPUT_BYTES): PdfResult | null {
  if (docx instanceof Uint8Array && docx.length > maxBytes) return { pdf: null, failure: "TOO_LARGE", detail: `${docx.length} bytes is over the ${maxBytes}-byte limit` };
  if (!looksLikeDocx(docx)) return { pdf: null, failure: "NOT_DOCX", detail: "not a Word file" };
  return null;
}

/** What a caller offers: the .docx always, the PDF when the conversion worked (gate entry 17, condition 3). */
export async function withPdf(docx: RenderedDocument, port: DocumentPdfPort): Promise<{ docx: RenderedDocument; pdf: RenderedDocument | null; failure: PdfFailure | null }> {
  let r: PdfResult;
  try { r = await port.toPdf(docx.bytes); } catch (e) { r = { pdf: null, failure: "FAILED", detail: String(e).slice(0, 200) }; }
  return { docx, pdf: r.pdf, failure: r.failure };
}

/** A one-page PDF with these ASCII lines, every byte offset exact (the fake's output; a viewer opens it). */
export function minimalPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
  const text = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) '`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** The fake: the same Word file always gives the same one-page PDF, naming its size and a fingerprint. `unreadable`
 *  marks a file the converter cannot read (default: a zip with no `word/` part name); `delayMs` beyond `timeoutMs`
 *  answers TIMEOUT. `calls` counts the files that reached the converter (refusals before sending never do). */
export function fakePdf(opts: { maxBytes?: number; timeoutMs?: number; delayMs?: number; unreadable?: (docx: Uint8Array) => boolean } = {}): DocumentPdfPort & { readonly calls: number } {
  let calls = 0;
  const hasWord = (b: Uint8Array) => { for (let i = 0; i + 5 <= b.length; i++) if (b[i] === 0x77 && b[i + 1] === 0x6f && b[i + 2] === 0x72 && b[i + 3] === 0x64 && b[i + 4] === 0x2f) return true; return false; };
  const unreadable = opts.unreadable ?? ((b: Uint8Array) => !hasWord(b));
  return {
    async toPdf(input) {
      const docx = plainBytes(input) as Uint8Array, refused = refuseBeforeSending(docx, opts.maxBytes);
      if (refused) return refused;
      calls++;
      const limit = opts.timeoutMs ?? PDF_TIMEOUT_MS;
      if ((opts.delayMs ?? 0) > limit) { await new Promise((r) => setTimeout(r, limit)); return { pdf: null, failure: "TIMEOUT", detail: `no answer within ${limit} ms` }; }
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (unreadable(docx)) return { pdf: null, failure: "FAILED", detail: "the converter could not read this Word file" };
      let h = 0x811c9dc5;
      for (const b of docx) h = Math.imul(h ^ b, 0x01000193) >>> 0;
      return { pdf: { bytes: minimalPdf(["FAKE PDF", `from a Word file of ${docx.length} bytes`, `fingerprint ${h.toString(16).padStart(8, "0")}`]), contentType: PDF }, failure: null };
    },
    get calls() { return calls; },
  };
}
