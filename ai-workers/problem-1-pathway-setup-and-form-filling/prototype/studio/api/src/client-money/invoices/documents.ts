// FO-7b part 1b (R1.56, R1.60; AG-6-63 rule 4, AG-6-71 rule 1, AG-6-48): the invoice, the payment receipt and the credit
// note as text and as a PDF. A receipt prints its figures as of its own moment, a credit note only its own (a
// document never changes after it is issued, AG-6-63 rule 8), behind DocumentRenderPort. The wording is the committed Sample text in
// samples/client-money-wording/; the figures are the stored ones, passed in as text made from whole minor units: nothing
// here computes a tax or a total (AG-6-4a: one rule across compute, display, receipt and export; R9). The PDF is a plain
// text page written here (PDF 1.4, the built-in Courier font: no library). Known limit: a character outside Latin-1 (an
// emoji, another script) prints as "?" in the PDF; the stored text and the email body keep it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InvoiceView } from "../../../../ports/client-money.ts";
import { PDF, RenderData, type DocumentRenderPort, type RenderedDocument } from "../../../../ports/render.ts";
import { MONEY } from "./drafts.ts";

const WORDING = join(import.meta.dirname, "..", "..", "..", "..", "samples", "client-money-wording");
export const MONEY_TEMPLATES = { "client_money.invoice": "invoice.txt", "client_money.receipt": "receipt.txt", "client_money.credit_note": "credit-note.txt" } as const;
export type MoneyTemplate = keyof typeof MONEY_TEMPLATES;

/** The wording with its names filled; a name the data lacks stops the render (never a blank on a money document). */
export function documentText(templateKey: string, data: RenderData): string {
  const file = (MONEY_TEMPLATES as Record<string, string>)[templateKey];
  if (!file) throw new Error(`unknown template ${templateKey}`);
  const d = RenderData.parse(data);
  return readFileSync(join(WORDING, file), "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n")
    .replace(/\{\{([A-Za-z]+)\}\}/g, (_, k: string) => { if (typeof d[k] !== "string") throw new Error(`${templateKey}: no value for ${k}`); return d[k]; }).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** A rate in parts per million as a percentage, from its digits: 130000 → "13", 99750 → "9.975". */
const percent = (ppm: number) => { const s = String(ppm).padStart(5, "0"), frac = s.slice(-4).replace(/0+$/, ""); return frac ? `${s.slice(0, -4)}.${frac}` : s.slice(0, -4); };
export type Letterhead = { firmName: string; firmAddress?: string; taxNumber: string | null; billTo: string };
const head = (h: Letterhead) => ({ firmName: h.firmName, firmAddress: h.firmAddress ?? "", taxLine: h.taxNumber ? `Tax number: ${h.taxNumber}` : "", billTo: h.billTo });

/** The invoice's names: every figure is the stored row's, printed from its digits. */
export function invoiceData(v: InvoiceView, h: Letterhead & { issuedOn: string; operatingDetails: string | null }): RenderData {
  const lines = v.lines.map((l) => `${l.position}. ${l.description}\n   ${l.quantity} x ${MONEY(l.unitMinor)} = ${MONEY(l.amountMinor)}${l.kind === "GOVERNMENT_FEE" ? " (government fee, no tax)" : `; tax ${percent(l.ratePpm)}% = ${MONEY(l.taxMinor)}`}`).join("\n");
  const settled = [v.paidMinor ? `Paid: ${v.currency} ${MONEY(v.paidMinor)}` : "", v.creditedMinor ? `Credited: ${v.currency} ${MONEY(v.creditedMinor)}` : "", v.paidMinor || v.creditedMinor ? `Balance due: ${v.currency} ${MONEY(v.dueMinor)}` : ""].filter(Boolean).join("\n");
  return { ...head(h), number: v.number ?? "", issuedOn: h.issuedOn, dueDate: v.dueDate ?? "", lines, currency: v.currency, subtotal: MONEY(v.subtotalMinor), tax: MONEY(v.taxMinor), total: MONEY(v.totalMinor), settled: settled ? `${settled}\n` : "",
    operatingDetails: h.operatingDetails ?? "Ask us how to pay." };
}

const METHOD: Record<string, string> = { BANK_TRANSFER: "bank transfer", WIRE: "wire", CHEQUE: "cheque", CASH: "cash", E_TRANSFER: "Interac e-Transfer", CARD_TERMINAL: "card terminal", OTHER: "another method" };
export function receiptData(v: InvoiceView, p: { receiptNumber: string; issuedOn: string; amountMinor: number; method: string; receivedOn: string; reference: string | null; cleared: boolean; balanceMinor: number; extraMinor: number; shortfallMinor?: number; keptInTrust: boolean }, h: Letterhead): RenderData {
  const shortfall = p.shortfallMinor ? `${v.currency} ${MONEY(p.shortfallMinor)} of this payment made up the client's trust balance, which was below zero.\n` : "";
  return { ...head(h), number: p.receiptNumber, issuedOn: p.issuedOn, invoiceNumber: v.number ?? "", currency: v.currency, total: MONEY(v.totalMinor), tax: MONEY(v.taxMinor), amount: MONEY(p.amountMinor), method: METHOD[p.method] ?? p.method,
    receivedOn: p.receivedOn, reference: p.reference ? `, reference ${p.reference}` : "", cleared: p.cleared ? "" : "Not yet cleared", balance: MONEY(p.balanceMinor),
    extra: shortfall + (p.extraMinor ? `${v.currency} ${MONEY(p.extraMinor)} is more than this invoice asked${p.keptInTrust ? ": kept in trust." : ": we will be in touch about it."}\n` : "") };
}
export function creditNoteData(v: InvoiceView, c: { number: string; issuedOn: string; amountMinor: number; reason: string }, h: Letterhead): RenderData {
  return { ...head(h), number: c.number, issuedOn: c.issuedOn, invoiceNumber: v.number ?? "", currency: v.currency, total: MONEY(v.totalMinor), amount: MONEY(c.amountMinor), reason: c.reason };
}

/** Plain text as a PDF: A4 pages of 60 lines, long lines wrapped at 95 characters. */
export function textPdf(text: string): Uint8Array {
  const lines = text.split("\n").flatMap((l) => (l.length ? l.match(/.{1,95}/gu) ?? [""] : [""]));
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 60)) }, (_, i) => lines.slice(i * 60, i * 60 + 60));
  const esc = (l: string) => [...l].map((ch) => { const c = ch.codePointAt(0)!, s = c < 32 || (c > 126 && c < 160) || c > 255 ? "?" : ch; return "\\()".includes(s) ? `\\${s}` : s; }).join("");
  const size = (s: string) => Buffer.byteLength(s, "latin1");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"];
  pages.forEach((p, i) => {
    const body = `BT /F1 9 Tf 12 TL 40 800 Td\n${p.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${size(body)} >>\nstream\n${body}\nendstream`);
  });
  let out = "%PDF-1.4\n"; const at: number[] = [];
  objs.forEach((o, i) => { at.push(size(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = size(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

export class MoneyDocuments implements DocumentRenderPort {
  async render(templateKey: string, data: RenderData): Promise<RenderedDocument> { return { bytes: textPdf(documentText(templateKey, data)), contentType: PDF }; }
}
