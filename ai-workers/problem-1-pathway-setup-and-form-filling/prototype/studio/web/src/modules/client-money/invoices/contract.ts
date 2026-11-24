// FO-7s1 part 1 (concept screens/fo-7s-money/concept-invoices.md (a), (b); AG-6-1, AG-6-25 to -27): what the invoice list and
// detail read from FO-7q (`GET /api/front-office/money/invoices`, `…/:id/detail`), parsed at the edge, and the pages' pure helpers.
// No imports from the app, so a test reads it in Node. The server decides every figure, status word and action: the page adds
// nothing up (BR-4: one total per currency, never a sum; client-money arithmetic stays in the API).
import { z } from "zod";

export const Currency = z.enum(["CAD", "USD"]);
export const StatusWord = z.enum(["Draft", "Open", "Part paid", "Paid", "Overdue", "Credited", "Refunded", "Written off"]);
export type StatusWord = z.infer<typeof StatusWord>;
/** The list filter's codes (FO-7q's `status=`), in the concept's order, with FO-7b's words. */
export const STATUSES: { code: string; word: StatusWord }[] = [
  { code: "DRAFT", word: "Draft" }, { code: "OPEN", word: "Open" }, { code: "PART_PAID", word: "Part paid" }, { code: "PAID", word: "Paid" },
  { code: "OVERDUE", word: "Overdue" }, { code: "CREDITED", word: "Credited" }, { code: "REFUNDED", word: "Refunded" }, { code: "WRITTEN_OFF", word: "Written off" },
];

/** FO-7q part 3 (#3306): the party's kind and stored name (null when none is stored), and the case number. */
const BillTo = z.object({ kind: z.enum(["PERSON", "COMPANY"]), name: z.string().nullable() }).nullable();
export const Row = z.object({
  id: z.string(), number: z.string().nullable(), statusWord: StatusWord, personId: z.string().nullable(), companyId: z.string().nullable(), caseId: z.string().nullable(),
  currency: Currency, issuedOn: z.string().nullable(), dueDate: z.string().nullable(), totalMinor: z.number().int(), paidMinor: z.number().int(), dueMinor: z.number().int(),
  billTo: BillTo, caseLabel: z.string().nullable(),
});
export type Row = z.infer<typeof Row>;
export const Page = z.object({ items: z.array(Row), pageSize: z.number().int(), next: z.string().nullable() });

const Line = z.object({ id: z.string(), position: z.number().int(), kind: z.enum(["FEE", "DISBURSEMENT", "GOVERNMENT_FEE"]), description: z.string(), quantity: z.number().int(),
  unitMinor: z.number().int(), amountMinor: z.number().int(), ratePpm: z.number().int(), taxMinor: z.number().int(), currency: Currency });
export type Line = z.infer<typeof Line>;
export const Action = z.enum(["EDIT", "ISSUE", "SEND", "RECORD_PAYMENT", "CREDIT_NOTE", "DOWNLOAD_PDF"]);
export type Action = z.infer<typeof Action>;
export const Detail = z.object({
  invoice: z.object({
    id: z.string(), status: z.enum(["DRAFT", "ISSUED"]), number: z.string().nullable(), personId: z.string().nullable(), companyId: z.string().nullable(), currency: Currency,
    billToProvince: z.string().nullable(), lines: z.array(Line), subtotalMinor: z.number().int(), taxMinor: z.number().int(), totalMinor: z.number().int(), statusWord: StatusWord,
    dueDate: z.string().nullable(), paidMinor: z.number().int(), creditedMinor: z.number().int(), writtenOffMinor: z.number().int(), dueMinor: z.number().int(), extraMinor: z.number().int(),
  }),
  caseId: z.string().nullable(), billTo: BillTo, caseLabel: z.string().nullable(), issuedOn: z.string().nullable(), creditableMinor: z.number().int(),
  // An action the page does not know is dropped, never shown (BR-10).
  allowedActions: z.array(z.string()).transform((a) => a.filter((x): x is Action => Action.safeParse(x).success)),
  payments: z.array(z.object({ id: z.string(), method: z.string(), amountMinor: z.number().int(), currency: z.string(), receivedOn: z.string(), reference: z.string().nullable(),
    receiptNumber: z.string().nullable(), refundedMinor: z.number().int() }).passthrough()),
  creditNotes: z.array(z.object({ id: z.string(), number: z.string().nullable(), full: z.boolean(), amountMinor: z.number().int(), currency: z.string(), reason: z.string(), createdAt: z.string() })),
  writeOff: z.object({ amountMinor: z.number().int(), currency: z.string(), reason: z.string(), createdAt: z.string() }).nullable(),
  trustPaidMinor: z.number().int().optional(),
});
export type Detail = z.infer<typeof Detail>;

/** The keys (AG-6-1 §8): the list needs :list, the detail :show. */
export const LIST_KEY = "agent/invoice:list";
export const INVOICES_HOME = "/money/invoices";

/** One amount in its own currency, two decimals, one formatter (BR-11): "CAD 1,385.00", "−USD 25.00". Never adds two figures. */
export function money(minor: number, currency: string): string {
  const sign = minor < 0 ? "−" : "", abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100).toLocaleString("en-CA"), cents = String(abs % 100).padStart(2, "0");
  return `${sign}${currency} ${whole}.${cents}`;
}
/** "23 Nov 2026" from YYYY-MM-DD, read as a calendar day (never shifted by a time zone). */
export function day(d: string | null): string {
  if (!d) return "—";
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
/** Who the invoice is for: the stored name (FO-7q part 3); a party with no stored name says its kind, never a guess. */
export const billToWord = (b: z.infer<typeof BillTo>) => (b?.name ? b.name : b?.kind === "COMPANY" ? "A company (no name on file)" : b?.kind === "PERSON" ? "A person (no name on file)" : "Not chosen yet");
export const KIND_WORD: Record<Line["kind"], string> = { FEE: "Fee", DISBURSEMENT: "Disbursement", GOVERNMENT_FEE: "Government fee" };
/** A rate in parts per million as people read it: 130000 → "13%", 49750 → "4.975%". */
export const rateWord = (ppm: number) => `${(ppm / 10000).toLocaleString("en-CA", { maximumFractionDigits: 4 })}%`;
export const STATUS_TONE: Record<StatusWord, string> = { Draft: "neutral", Open: "info", "Part paid": "info", Paid: "ok", Overdue: "danger", Credited: "neutral", Refunded: "neutral", "Written off": "neutral" };
/** What each status chip means, for its tooltip (BIC-14). */
export const STATUS_HINT: Record<StatusWord, string> = {
  Draft: "Not issued yet: no number, nothing owed.", Open: "Issued, nothing paid yet, not past its due date.", "Part paid": "Some of it is paid.", Paid: "Nothing left to pay.",
  Overdue: "Past its due date with something left to pay.", Credited: "Cancelled by credit notes.", Refunded: "Every payment on it was refunded.", "Written off": "The rest was written off.",
};
/** The list's filters, kept in the address (concept (a)). */
export type Filters = { status: string; issuedFrom: string; issuedTo: string; overdue: boolean };
export const filtersOf = (p: URLSearchParams): Filters => ({ status: STATUSES.some((s) => s.code === p.get("status")) ? p.get("status")! : "", issuedFrom: p.get("issuedFrom") ?? "", issuedTo: p.get("issuedTo") ?? "", overdue: p.get("overdue") === "true" });
export const queryOf = (f: Filters, after?: string | null): string => {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.issuedFrom) q.set("issuedFrom", f.issuedFrom);
  if (f.issuedTo) q.set("issuedTo", f.issuedTo);
  if (f.overdue) q.set("overdue", "true");
  if (after) q.set("after", after);
  return q.toString();
};
export const anyFilter = (f: Filters) => !!(f.status || f.issuedFrom || f.issuedTo || f.overdue);

/** A typed amount → cents, or a reason in words. Only one way of writing is read (break B1): digits, an optional comma between
 *  each group of three ("1,000" or "1000"), and a dot before at most two decimals ("1,000.50"). A decimal comma ("5,50"), stray
 *  commas ("1,0,0") and spaces ("1 000,50") are refused, never guessed: a misread would credit 100 times too much. Parsing
 *  only: the API checks the amount. */
export function centsOf(typed: string): { cents: number } | { error: string } {
  const t = typed.trim();
  if (!t) return { error: "Enter an amount, for example 100.00." };
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return { error: "Write the amount with a dot before the cents and no spaces, for example 1,000.50 or 5.50." };
  const [w, c = ""] = t.replace(/,/g, "").split(".");
  if (w.length > 9) return { error: "That amount is too large." };
  const cents = Number(w) * 100 + Number(c.padEnd(2, "0"));
  return cents > 0 ? { cents } : { error: "Enter an amount above 0.00." };
}
