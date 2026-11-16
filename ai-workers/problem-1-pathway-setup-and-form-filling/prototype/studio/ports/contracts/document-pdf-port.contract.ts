// PF-Fp: DocumentPdfPort's contract (ports/render.ts). Run by fakePdf and by GotenbergPdf
// (api/src/front-office/render/gotenberg.ts: against a stand-in of Gotenberg's route in CI, and against the pinned
// container when GOTENBERG_URL is set). The port file's sentences: a Word file in, a PDF out; never throws; a failure
// answers "no PDF" with its reason; over the cap, or not a zip, is refused before anything is sent.
import { defineContract, expect } from "./contract.ts";
import { PDF, PDF_MAX_INPUT_BYTES, type DocumentPdfPort, type PdfResult } from "../render.ts";

/** What a PDF adapter's test hands the contract. */
export type PdfHarness = {
  pdf: DocumentPdfPort;
  /** The same adapter with a converter slower than its own time limit, and that limit. */
  slow: DocumentPdfPort;
  slowLimitMs: number;
  /** A Word file the converter reads, and a zip it cannot read. */
  docx: Uint8Array;
  corrupt: Uint8Array;
  /** How many files reached the converter (both adapters above). */
  sent(): number;
};

const noPdf = (r: PdfResult, failure: string) => r.pdf === null && r.failure === failure && typeof r.detail === "string";

export const documentPdfPortContract = defineContract("DocumentPdfPort", (make: () => Promise<PdfHarness> | PdfHarness) => [
  {
    name: "a Word file converts to a PDF (application/pdf, %PDF- header)",
    async run() {
      const h = await make(), r = await h.pdf.toPdf(h.docx);
      expect(r.failure === null && r.pdf && r.pdf.contentType === PDF && new TextDecoder().decode(r.pdf.bytes.subarray(0, 5)) === "%PDF-", "a PDF", r.pdf ? { contentType: r.pdf.contentType, head: new TextDecoder().decode(r.pdf.bytes.subarray(0, 8)) } : r);
      expect(h.sent() === 1, "the file reached the converter once", h.sent());
    },
  },
  {
    name: "a file one byte over the cap answers TOO_LARGE and is never sent",
    async run() {
      const h = await make(), big = new Uint8Array(PDF_MAX_INPUT_BYTES + 1);
      big.set([0x50, 0x4b, 0x03, 0x04]);
      const r = await h.pdf.toPdf(big);
      expect(noPdf(r, "TOO_LARGE") && h.sent() === 0, "TOO_LARGE before sending", { r: { ...r, pdf: !!r.pdf }, sent: h.sent() });
    },
  },
  {
    name: "a file that is not a zip, or not bytes at all, answers NOT_DOCX and is never sent; nothing throws",
    async run() {
      const h = await make();
      const a = await h.pdf.toPdf(new TextEncoder().encode("%PDF-1.4 not a Word file"));
      const b = await h.pdf.toPdf("text" as never);
      expect(noPdf(a, "NOT_DOCX") && noPdf(b, "NOT_DOCX") && h.sent() === 0, "NOT_DOCX before sending", { a: a.failure, b: b.failure, sent: h.sent() });
    },
  },
  {
    name: "a zip the converter cannot read answers FAILED (no PDF, no throw)",
    async run() {
      const h = await make(), r = await h.pdf.toPdf(h.corrupt);
      expect(noPdf(r, "FAILED"), "FAILED", { ...r, pdf: !!r.pdf });
    },
  },
  {
    name: "a converter slower than the time limit answers TIMEOUT, close to the limit",
    async run() {
      const h = await make(), t0 = Date.now(), r = await h.slow.toPdf(h.docx), took = Date.now() - t0;
      expect(noPdf(r, "TIMEOUT") && took < h.slowLimitMs + 2000, "TIMEOUT within the limit", { r: { ...r, pdf: !!r.pdf }, took, limit: h.slowLimitMs });
    },
  },
]);
