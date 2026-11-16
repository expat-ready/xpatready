// PF-Fp (P-630; tech gate entry 17, its five conditions): the real DocumentPdfPort (ports/render.ts) on Gotenberg 8.40.0,
// LibreOffice route only. The container itself is PF-8's stack line, which reads GOTENBERG_IMAGE and GOTENBERG_FLAGS from
// here, so the pinned digest and the three switches live in one place:
//   1. only /forms/libreoffice/convert: the adapter builds no other path, and the flags turn off the Chromium routes,
//      webhooks and downloadFrom (the container answers 404 there; tests/check_pffp_pdf.ts, live part);
//   2. private network, no outbound network, no secrets, no shared volume: PF-8's stack line; here, a base URL with
//      a user name, password, path, query or fragment is refused, and redirects are never followed;
//   3. 10 MB in and 30 s per conversion (Sample, ports/render.ts): over the cap is refused before sending; any failure
//      answers "no PDF" and the caller keeps the .docx (withPdf);
//   4. CI and the demo use fakePdf: pdfFromEnv picks Gotenberg only when DOCUMENT_PDF=gotenberg, and never under CI;
//   5. the image is pinned by digest (isPinned); a Gotenberg advisory is patched within 7 days (gate entry 17).
import { DOCX } from "../retainers/docx.ts";
import { PDF, PDF_MAX_INPUT_BYTES, PDF_TIMEOUT_MS, fakePdf, refuseBeforeSending, type DocumentPdfPort, type PdfResult } from "../../../../ports/render.ts";

export const GOTENBERG_VERSION = "8.40.0";
export const GOTENBERG_IMAGE = "gotenberg/gotenberg:8.40.0@sha256:53073e798c8ef39ea2187e44cb67bab77894ea2509100b94c4fe3b461f7b2996";
/** Flags read in Gotenberg's pkg/modules/chromium/chromium.go, webhook/webhook.go and api/api.go (gate entry 17). */
export const GOTENBERG_FLAGS = ["--chromium-disable-routes=true", "--webhook-disable=true", "--api-disable-download-from=true"] as const;
/** The one route the adapter calls. */
export const GOTENBERG_ROUTE = "/forms/libreoffice/convert";
/** Sample: the largest PDF read back; a larger answer is a failure, never read in full. */
export const PDF_MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

/** An image reference with an exact version and a sha256 digest (condition 5). */
export function isPinned(image: string): boolean {
  return /^[a-z0-9][a-z0-9._/-]*:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/.test(image);
}

/** The converter's address: http(s), a host and an optional port, nothing else (condition 2: no secrets in it). */
export function gotenbergBase(url: string): URL {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("GOTENBERG_URL is not a URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("GOTENBERG_URL must be http or https");
  if (u.username || u.password) throw new Error("GOTENBERG_URL must not carry a user name or password");
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) throw new Error("GOTENBERG_URL is a host and port only");
  return u;
}

export class GotenbergPdf implements DocumentPdfPort {
  private readonly base: URL;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly fetcher: typeof fetch;
  constructor(opts: { baseUrl: string; timeoutMs?: number; maxBytes?: number; fetch?: typeof fetch }) {
    this.base = gotenbergBase(opts.baseUrl);
    this.timeoutMs = opts.timeoutMs ?? PDF_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? PDF_MAX_INPUT_BYTES;
    this.fetcher = opts.fetch ?? fetch;
  }
  async toPdf(docx: Uint8Array): Promise<PdfResult> {
    const refused = refuseBeforeSending(docx, this.maxBytes);
    if (refused) return refused;
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const form = new FormData();
      form.append("files", new Blob([docx as Uint8Array<ArrayBuffer>], { type: DOCX }), "document.docx");
      const res = await this.fetcher(new URL(GOTENBERG_ROUTE, this.base), { method: "POST", body: form, signal, redirect: "error" });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); return { pdf: null, failure: "FAILED", detail: `the converter answered ${res.status}` }; }
      const bytes = await readCapped(res, PDF_MAX_OUTPUT_BYTES);
      if (!bytes) return { pdf: null, failure: "FAILED", detail: `the PDF is over ${PDF_MAX_OUTPUT_BYTES} bytes` };
      if (!(bytes.length > 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-")) return { pdf: null, failure: "FAILED", detail: "the answer is not a PDF" };
      return { pdf: { bytes, contentType: PDF }, failure: null };
    } catch (e) {
      if (signal.aborted) return { pdf: null, failure: "TIMEOUT", detail: `no answer within ${this.timeoutMs} ms` };
      return { pdf: null, failure: "FAILED", detail: `the converter could not be reached (${(e as Error).name})` };
    }
  }
}

/** The body, or null when it passes `cap` (the read stops there). */
async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Condition 4: the fake unless DOCUMENT_PDF=gotenberg (with GOTENBERG_URL), and never Gotenberg under CI. */
export function pdfFromEnv(env: Record<string, string | undefined> = process.env): DocumentPdfPort {
  const pick = env.DOCUMENT_PDF ?? "fake";
  if (pick === "fake") return fakePdf();
  if (pick !== "gotenberg") throw new Error(`DOCUMENT_PDF must be fake or gotenberg, not ${pick.slice(0, 40)}`);
  if (env.CI) throw new Error("DOCUMENT_PDF=gotenberg is refused under CI: CI uses the fake (gate entry 17, condition 4)");
  if (!env.GOTENBERG_URL) throw new Error("DOCUMENT_PDF=gotenberg needs GOTENBERG_URL");
  return new GotenbergPdf({ baseUrl: env.GOTENBERG_URL });
}
