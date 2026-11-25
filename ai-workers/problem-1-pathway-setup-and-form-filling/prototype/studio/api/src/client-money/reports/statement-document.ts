// FO-7r part 2 (R1.111; AG-6-28 rules 3-4; shape r1-111-shape.md, Lead 4 on #3634): the client statement as text and
// as a PDF. Everything printed comes from part 1's reads, the statement's lines and the summary, never recomputed here.
// That covers each line's amount and running balance, each account's opening and closing, what is owed, credit held,
// money waiting for a choice, and each case's trust balance. So the PDF's figures are the JSON's (AG-6-4a: one rule
// across compute, display, receipt and export; tests/check_fo7r_statement_send.ts P1). The wording is the committed
// Sample "Your statement" (samples/client-money-wording/statement.txt) until the template library holds it (map row 45).
// The PDF is invoices/documents.ts's plain text page (PDF 1.4, Courier); a character outside Latin-1 prints as "?".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDF, RenderData, type DocumentRenderPort, type RenderedDocument } from "../../../../ports/render.ts";
import { textPdf } from "../invoices/documents.ts";
import { MONEY } from "../invoices/drafts.ts";
import type { Statement, StatementLine } from "./statement.ts";
import type { Summary } from "./summary.ts";

export const STATEMENT_TEMPLATE = "client_money.statement";
const WORDING = join(import.meta.dirname, "..", "..", "..", "..", "samples", "client-money-wording", "statement.txt");

/** Minor units as money with its sign: -150000 → "-1,500.00" (MONEY prints a whole number of cents without a sign). */
export const SIGNED = (n: number) => `${n < 0 ? "-" : ""}${MONEY(Math.abs(n))}`;

/** Each line's words: what happened, in plain words (no code word is printed). */
const WORDS: Record<string, string> = {
  INVOICE: "Invoice", PAYMENT: "Payment received", REFUND: "Refund to you", PAID_FROM_TRUST: "Paid from your trust balance",
  PAID_FROM_TRUST_CORRECTED: "Trust payment corrected", RETURNED_FROM_TRUST: "Returned to you from trust", CREDIT_APPLIED: "Your credit used",
  CREDIT_APPLIED_REVERSED: "Credit use reversed", KEPT_AS_CREDIT: "Kept as credit for you", KEPT_AS_CREDIT_REVERSED: "Kept credit reversed",
  CREDIT_NOTE: "Credit note", WRITE_OFF: "Written off",
  DEPOSIT: "Received into trust", WITHDRAWAL_TO_INVOICE: "Paid from trust to an invoice", REFUND_TO_CLIENT: "Refunded to you from trust",
  CORRECTION: "Trust correction", MOVE_TO_CASE: "Moved between your cases",
};
export const lineWords = (kind: string) => WORDS[kind] ?? kind;

export type StatementHead = { firmName: string; firmAddress: string; billTo: string };

/** The statement's names, every figure printed from the reads' digits. `lines` is every line of the period (all pages). */
export function statementData(st: Pick<Statement, "accounts" | "period" | "trustShows">, lines: StatementLine[], sum: Summary, head: StatementHead, issuedOn: string): RenderData {
  const period = st.period.from || st.period.to ? `${st.period.from ?? "the first entry"} to ${st.period.to ?? issuedOn}` : "Everything";
  const accounts = st.accounts.map((a) => {
    const title = a.account === "INVOICES" ? `Invoices and payments (${a.currency})` : `Trust (${a.currency})`;
    const rows = lines.filter((l) => l.account === a.account && l.currency === a.currency)
      .map((l) => `${l.at.slice(0, 10)}  ${lineWords(l.kind)}${l.reference ? ` ${l.reference}` : ""}  ${a.currency} ${SIGNED(l.amountMinor)}  balance ${a.currency} ${SIGNED(l.balanceAfterMinor)}`);
    return [title, `Opening balance: ${a.currency} ${SIGNED(a.openingMinor)}`, ...(rows.length ? rows : ["No entries in this period"]), `Closing balance: ${a.currency} ${SIGNED(a.closingMinor)}`, ""].join("\n");
  }).join("\n");
  // AG-6-28 rule 3: each case's trust balance in plain words. The case is named by its number: the case's program name
  // has no source on main (not known), so never "your work permit" guessed.
  const held = st.trustShows ? sum.cases.filter((c) => (c.trustMinor ?? 0) > 0)
    .map((c) => `Held in trust for ${c.caseLabel ? `your case ${c.caseLabel}` : "you (not yet on a case)"}: ${c.currency} ${SIGNED(c.trustMinor!)}`).join("\n") : "";
  const summary = sum.totals.map((t) => [`Owed: ${t.currency} ${SIGNED(t.owedMinor)}`, t.creditMinor > 0 ? `Credit held for you: ${t.currency} ${SIGNED(t.creditMinor)}` : "",
    t.waitingMinor > 0 ? `Paid beyond the bill, waiting for your choice (refund or keep as credit): ${t.currency} ${SIGNED(t.waitingMinor)}` : ""].filter(Boolean).join("\n")).join("\n");
  return { firmName: head.firmName, firmAddress: head.firmAddress, billTo: head.billTo, period, issuedOn, accounts: accounts || "No entries.", held, summary };
}

/** The wording with its names filled; a name the data lacks stops the render (never a blank on a money document). */
export function statementText(data: RenderData): string {
  const d = RenderData.parse(data);
  return readFileSync(WORDING, "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n")
    .replace(/\{\{([A-Za-z]+)\}\}/g, (_, k: string) => { if (typeof d[k] !== "string") throw new Error(`statement: no value for ${k}`); return d[k]; }).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** DocumentRenderPort for the statement: the text above as a PDF. */
export class StatementDocuments implements DocumentRenderPort {
  async render(templateKey: string, data: RenderData): Promise<RenderedDocument> {
    if (templateKey !== STATEMENT_TEMPLATE) throw new Error(`unknown template ${templateKey}`);
    return { bytes: textPdf(statementText(data)), contentType: PDF };
  }
}
