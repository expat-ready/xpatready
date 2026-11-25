// FO-7s3a part 1 (concept screens/fo-7s-money/concept-payments.md (c); AG-6-19, AG-6-20, AG-6-21 r2-3, AG-6-63; FO-7b's
// `POST …/money/invoices/:id/payments`, FO-7q's `GET …/money/payments` and `…/payments/:id`): what the payment screens send and
// read, parsed at the edge, and their pure helpers. No imports from the app, so a test reads it in Node. The server decides
// every figure and refusal; the page adds nothing up (BR-4) and shows "Received into" only when the read answers it (trust shows).
import { z } from "zod";

/** The methods a person records by hand, in AG-6-19 r1's order and words. `CARD` is never offered here (a card payment comes
 *  only through the card webhook); a trust deposit leaves out Card terminal too (P-567 (3)). */
export const METHODS = [
  { code: "BANK_TRANSFER", word: "Bank transfer" }, { code: "WIRE", word: "Wire" }, { code: "CHEQUE", word: "Cheque" }, { code: "CASH", word: "Cash" },
  { code: "E_TRANSFER", word: "e-Transfer" }, { code: "CARD_TERMINAL", word: "Card terminal" }, { code: "OTHER", word: "Other" },
] as const;
export type Method = (typeof METHODS)[number]["code"];
/** Every method a read may answer, in words (a card payment from the webhook reads "Card"). */
export const METHOD_WORD: Record<string, string> = { ...Object.fromEntries(METHODS.map((m) => [m.code, m.word])), CARD: "Card" };
export const methodWord = (m: string) => METHOD_WORD[m] ?? "Other";

const Refund = z.object({ id: z.string(), amountMinor: z.number().int(), currency: z.string(), reason: z.string(), createdAt: z.string() });
export const PaymentAction = z.enum(["REFUND", "KEEP_AS_CREDIT", "REFUND_EXTRA"]);
/** FO-7q's payment row; `receivedInto` and `trustRequestId` are answered only while trust shows (AG-6-59 r5). */
export const PaymentRow = z.object({
  id: z.string(), invoiceId: z.string().nullable(), invoiceNumber: z.string().nullable(), method: z.string(), amountMinor: z.number().int(), currency: z.string(),
  receivedOn: z.string(), reference: z.string().nullable(), cleared: z.boolean(), receiptNumber: z.string().nullable(), refundedMinor: z.number().int(), refunds: z.array(Refund),
  receivedInto: z.enum(["OPERATING", "TRUST"]).optional(), trustRequestId: z.string().nullable().optional(),
  refundableMinor: z.number().int().optional(), waitingMinor: z.number().int().optional(),
  // An action the page does not know is dropped, never shown (BR-10).
  allowedActions: z.array(z.string()).optional().transform((a) => (a ?? []).filter((x): x is z.infer<typeof PaymentAction> => PaymentAction.safeParse(x).success)),
});
export type PaymentRow = z.infer<typeof PaymentRow>;
export const PaymentPage = z.object({ items: z.array(PaymentRow), pageSize: z.number().int(), next: z.string().nullable() });

/** FO-7b's answer to a recorded payment (ports/client-money.ts PaymentView), the parts this page shows. */
export const Recorded = z.object({
  id: z.string(), amountMinor: z.number().int(), currency: z.string(), receiptNumber: z.string(), replayed: z.boolean(), cleared: z.boolean(), method: z.string(),
  receivedInto: z.enum(["OPERATING", "TRUST"]),
  extra: z.object({ amountMinor: z.number().int(), waitingMinor: z.number().int(), choices: z.array(z.string()), note: z.string().nullable() }).nullable(),
  trust: z.object({ depositedMinor: z.number().int(), appliedMinor: z.number().int(), shortfallCoveredMinor: z.number().int(), balanceMinor: z.number().int() }).nullable(),
  receiptEmail: z.enum(["SENT", "NO_ADDRESS", "NOT_SENT"]),
  invoice: z.object({ statusWord: z.string(), dueMinor: z.number().int(), number: z.string().nullable() }).passthrough(),
});
export type Recorded = z.infer<typeof Recorded>;

/** The keys: recording needs agent/payment:record (AG-6-19 §8); FO-7q reads payments with agent/invoice:show. */
export const RECORD_KEY = "agent/payment:record";
export const PAYMENTS_KEY = "agent/invoice:show";
export const PAYMENTS_HOME = "/money/payments";

/** One key per opening of the panel (AG-6-19 r3): every submit of that opening sends it, so a double click or a retry is one payment. */
export const newKey = () => `pay-${crypto.randomUUID()}`;

/** The receipt line after a success, in words (concept (c) "R-0012 recorded · Receipt emailed to Client B"). */
export function recordedWords(r: Recorded, party: string): string {
  const mail = r.receiptEmail === "SENT" ? `Receipt emailed to ${party}` : r.receiptEmail === "NO_ADDRESS" ? `No email address on file for ${party}: the receipt was not emailed` : "The receipt email could not be sent now";
  return `${r.receiptNumber} recorded · ${mail}`;
}

/** The status words a payment row shows (concept (c) list: Recorded, Refunded, Part refunded). */
export function paymentStatus(p: Pick<PaymentRow, "amountMinor" | "refundedMinor">): "Recorded" | "Refunded" | "Part refunded" {
  return p.refundedMinor <= 0 ? "Recorded" : p.refundedMinor >= p.amountMinor ? "Refunded" : "Part refunded";
}

/** The list's filters, kept in the address. */
export type PaymentFilters = { method: string; from: string; to: string };
export const paymentFiltersOf = (p: URLSearchParams): PaymentFilters => ({ method: METHOD_WORD[p.get("method") ?? ""] ? p.get("method")! : "", from: p.get("from") ?? "", to: p.get("to") ?? "" });
export const paymentQueryOf = (f: PaymentFilters, after?: string | null): string => {
  const q = new URLSearchParams();
  if (f.method) q.set("method", f.method);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (after) q.set("after", after);
  return q.toString();
};
