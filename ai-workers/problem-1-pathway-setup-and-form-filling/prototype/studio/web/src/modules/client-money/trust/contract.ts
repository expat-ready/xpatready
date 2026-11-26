// FO-7s3b part 1 (R1.58; concept screens/fo-7s-money/concept-trust.md (e), concept.md BR-1, BR-3, BR-4; AG-6-60 r1-4, r6-8,
// AG-6-25 to -27, AG-6-59 r5-6; P-634 (1), P-653 (2), P-694): what the trust screens read, parsed at the edge, and their pure
// helpers. No imports from the app, so a test reads it in Node. The server decides every figure: the page sums nothing
// across currencies and computes no balance (the ledger's running balance and the summary's figures are the API's).
// Reads: FO-7v's `GET …/trust/shortfall`, FO-7t's `GET …/trust/ledger`, FO-7r's `GET …/parties/:kind/:id/summary`, FO-7q's
// `GET …/parties?q=`. Each answers 404 while trust does not show (AG-6-59 r4), and the screens then show no trust word.
import { z } from "zod";

export const TRUST_HOME = "/money/trust";
/** The trust reads' key (AG-6-60 §8); FO-7q's client search takes agent/invoice:list. */
export const TRUST_KEY = "agent/invoice:show";
export const SEARCH_KEY = "agent/invoice:list";

const Cur = z.string();
/** FO-7v's shortfall list: each party whose trust balance is below zero after a reversal (P-634 (1)). */
export const ShortfallRow = z.object({
  personId: z.string().nullable(), companyId: z.string().nullable(), name: z.string().nullable(), currency: Cur, balanceMinor: z.number().int(),
  reversalEntryId: z.string().nullable(), paymentId: z.string().nullable(), caseId: z.string().nullable(), reasonCode: z.string().nullable(),
});
export type ShortfallRow = z.infer<typeof ShortfallRow>;
export const Shortfall = z.object({ items: z.array(ShortfallRow) });

/** FO-7t's ledger: newest first, the running balance summed by the server over the rows the caller may see. */
export const LedgerEntry = z.object({
  id: z.string(), at: z.string(), kind: z.string(), reference: z.string().nullable(), payer: z.string().nullable(), amountMinor: z.number().int(),
  currency: Cur, balanceAfterMinor: z.number().int(), caseId: z.string().nullable(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
export const LedgerPage = z.object({ items: z.array(LedgerEntry), pageSize: z.number().int(), next: z.string().nullable() });

/** FO-7r's summary figures, one row per currency (never summed across them); trustMinor is null while trust does not show. */
export const Figures = z.object({
  currency: Cur, billedMinor: z.number().int(), paidMinor: z.number().int(), paidFromTrustMinor: z.number().int(), creditedMinor: z.number().int(),
  writtenOffMinor: z.number().int(), refundedMinor: z.number().int(), owedMinor: z.number().int(), oldestOverdueDays: z.number().int().nullable(),
  trustMinor: z.number().int().nullable(), creditMinor: z.number().int(), unbilledMinor: z.null(),
});
export type Figures = z.infer<typeof Figures>;
export const CaseFigures = Figures.extend({ caseId: z.string().nullable(), caseLabel: z.string().nullable() });
export const Summary = z.object({
  party: z.object({ kind: z.enum(["PERSON", "COMPANY"]), id: z.string(), name: z.string().nullable() }), today: z.string(), trustShows: z.boolean(),
  totals: z.array(Figures), cases: z.array(CaseFigures),
});
export type Summary = z.infer<typeof Summary>;

export const PartyHits = z.object({ items: z.array(z.object({ kind: z.enum(["PERSON", "COMPANY"]), id: z.string(), name: z.string() })) });

/** The client's address in the app: `/money/parties/person/<id>` or `/money/parties/company/<id>` (Lead B, rev 16.36). */
export const partyPath = (p: { personId?: string | null; companyId?: string | null }) =>
  p.personId ? `/money/parties/person/${p.personId}` : p.companyId ? `/money/parties/company/${p.companyId}` : null;
export const kindWord = (k: string) => (k === "person" ? "personId" : k === "company" ? "companyId" : null);

/** The ledger's entry in words (concept-trust (e)): a withdrawal names the invoice it paid. */
export function entryWords(e: Pick<LedgerEntry, "kind" | "reference" | "amountMinor">): string {
  switch (e.kind) {
    case "DEPOSIT": return "Received";
    case "WITHDRAWAL_TO_INVOICE": return e.reference ? `Paid to ${e.reference}` : "Paid to an invoice";
    case "REFUND_TO_CLIENT": return "Refunded to client";
    case "MOVE_TO_CASE": return e.amountMinor < 0 ? "Moved to a case" : "Moved from before a case";
    case "CORRECTION": return "Correction";
    default: return "Entry";
  }
}

/** The label a negative trust figure always carries (BR-3, DW7): never a bare minus. */
export const SHORTFALL_LABEL = "Trust shortfall after a reversal";
/** The words under a shortfall (concept-trust (e), Sample; Unconfirmed: no counsel). */
export const shortfallWords = (minor: number, currency: string, money: (m: number, c: string) => string) =>
  `Your firm needs to put ${money(Math.abs(minor), currency)} of its own money into trust for this client.`;

/** "Trust held: CAD 1,300.00 (2 cases, CAD 150.00 before a case)" (AG-6-60 r6), one line per currency, from the summary's rows. */
export function heldWords(cases: z.infer<typeof CaseFigures>[], currency: string, money: (m: number, c: string) => string): string | null {
  const mine = cases.filter((c) => c.currency === currency && c.trustMinor !== null && c.trustMinor !== 0);
  if (!mine.length) return null;
  const total = mine.reduce((s, c) => s + (c.trustMinor ?? 0), 0), onCases = mine.filter((c) => c.caseId).length, before = mine.find((c) => !c.caseId);
  const parts = [onCases ? `${onCases} case${onCases === 1 ? "" : "s"}` : null, before ? `${money(before.trustMinor ?? 0, currency)} before a case` : null].filter(Boolean);
  return `Trust held: ${money(total, currency)}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}
