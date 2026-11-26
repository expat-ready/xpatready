// FO-7b part 1a (QA-482; R1.59; brief build-lead-c-briefs/FO-7b-1a.md): the shared shapes of a draft invoice, as the
// client-money routes read and answer them. Only what these routes need (FO-7b amendment 5): FO-7b part 1b adds issue, payments, credit
// notes, the derived status, the events and ClientMoneyPort with its fake. Money is integers in minor units with
// their currency (ISO 4217 as FO-7a stores it); CAD and USD are never added. Tax is the server's: a tax or amount sent by
// a client is read and ignored. This folder imports only zod and its own files.
import { z } from "zod";

export const MoneyCurrency = z.enum(["CAD", "USD"]);
export type MoneyCurrency = z.infer<typeof MoneyCurrency>;
export const LineKind = z.enum(["FEE", "GOVERNMENT_FEE", "DISBURSEMENT"]);
export type LineKind = z.infer<typeof LineKind>;

/** The largest amount one column holds (FO-7a's integer columns): 21,474,836.47. */
export const MINOR_MAX = 2_147_483_647;
/** A UTF-16 surrogate with no partner (not a character; jsonb and the audit line refuse it). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (what: string) => z.string().regex(UUID, `${what} is not an id.`);
const whole = (what: string, min: number, max: number) => z.number({ error: `${what} must be a whole number.` }).int(`${what} must be a whole number.`).min(min, `${what} is at least ${min}.`).max(max, `${what} is at most ${max}.`);
/** Ignored on input: the server computes it (QA-482). Read so that sending it is never refused. */
const ignored = z.unknown().optional().transform(() => undefined);

/** POST /api/front-office/money/invoices: a draft for one client (a person or a company of the firm) in one currency; the
 *  firm's default currency when none is sent. */
export const DraftIn = z.strictObject({
  personId: id("The person").optional(),
  companyId: id("The company").optional(),
  currency: MoneyCurrency.optional(),
  /** FO-7w1 (AG-6-65 r1): start the draft from this client's signed retainer, with its fee rows. */
  retainerId: id("The retainer").optional(),
  /** FO-7w1: only these rows of the retainer (an "On signing" deposit row is copied only when named here). */
  feeRowIds: z.array(id("A fee row")).min(1, "Name at least one fee row, or leave the list out.").max(50, "At most 50 fee rows.").optional(),
}).refine((d) => (d.personId ? 1 : 0) + (d.companyId ? 1 : 0) === 1, { message: "Name one client: a person or a company.", path: ["personId"] })
  .refine((d) => !d.feeRowIds || d.retainerId, { message: "Fee rows come from a retainer: name the retainer too.", path: ["feeRowIds"] });
export type DraftIn = z.infer<typeof DraftIn>;

/** PUT /api/front-office/money/invoices/:id/bill-to (FO-7g part 3, P-797): the province a draft's tax follows, one of the
 *  13 codes (the same list as api/src/client-money/tax/canada-gst-hst.ts PROVINCE_CODES and the database's CHECK). */
export const BILL_TO_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export const BillToIn = z.strictObject({ province: z.enum(BILL_TO_PROVINCES, { message: "Choose one of the 13 provinces and territories (a two-letter code such as ON)." }) });

/** POST /api/front-office/money/invoices/:id/lines: one line. The description's last word is the database's own text rule
 *  (money_text_ok: some visible letter, number or punctuation; no bidi or C1 control), which the route asks before writing. The rate is in parts per million (13 % is 130000), 0 when absent;
 *  a government fee is never taxed. The currency, when sent, must be the invoice's. */
export const LineIn = z.strictObject({
  kind: LineKind,
  description: z.string().trim().min(1, "Describe the line.").refine((t) => [...t].length <= 500, "At most 500 characters.").regex(/^[^\u0000-\u001f\u007f\u2028\u2029]*$/, "One line, no tabs or control characters.").refine((t) => !LONE_SURROGATE.test(t), "Use only whole characters: this text has a broken character in it."),   // a lone surrogate (PF-28 part 6; was a 500 at the audit line's jsonb)
  quantity: whole("The quantity", 1, 100_000).default(1),
  unitMinor: whole("The unit amount (in cents)", 0, MINOR_MAX),
  ratePpm: whole("The tax rate (parts per million)", 0, 1_000_000).default(0),
  currency: MoneyCurrency.optional(),
  taxMinor: ignored,
  amountMinor: ignored,
});
export type LineIn = z.infer<typeof LineIn>;

/** One stored line, as money_invoice_line holds it. */
export const LineView = z.strictObject({
  id: z.string(), position: z.number().int(), kind: LineKind, description: z.string(), quantity: z.number().int(),
  unitMinor: z.number().int(), amountMinor: z.number().int(), ratePpm: z.number().int(), taxMinor: z.number().int(), currency: MoneyCurrency,
  /** FO-7w1: the retainer fee row this line bills, or null (typed by hand). */
  sourceFeeRowId: z.string().nullable(),
});
export type LineView = z.infer<typeof LineView>;

/** FO-7b part 1b. The status word, derived from facts and never stored (AG-6-1 rule 7; row FO-7b's words). */
export const StatusWord = z.enum(["Draft", "Open", "Part paid", "Paid", "Overdue", "Credited", "Refunded", "Written off"]);
export type StatusWord = z.infer<typeof StatusWord>;
/** The facts a status is read from, all in the invoice's currency and minor units. `paidMinor` is money received on it
 *  (operating payments less refunds, plus trust applied and not returned); `today` and `dueDate` are YYYY-MM-DD. */
export type InvoiceFacts = { issued: boolean; totalMinor: number; creditedMinor: number; writtenOffMinor: number; hasWriteOff: boolean; paidMinor: number; refundedMinor: number; dueDate: string | null; today: string };
/** The one derivation (FO-7r and FO-7t reuse it). Order: a draft; settled by a write-off; fully credited; every payment
 *  refunded; nothing left to pay; past the due date with something left; part paid; open. */
export function invoiceStatus(f: InvoiceFacts): StatusWord {
  if (!f.issued) return "Draft";
  if (f.hasWriteOff) return "Written off";
  if (f.creditedMinor > 0 && f.creditedMinor >= f.totalMinor) return "Credited";
  if (f.refundedMinor > 0 && f.paidMinor <= 0) return "Refunded";
  if (f.totalMinor - f.creditedMinor - f.writtenOffMinor - f.paidMinor <= 0) return "Paid";
  if (f.dueDate !== null && f.today > f.dueDate) return "Overdue";
  return f.paidMinor > 0 ? "Part paid" : "Open";
}

/** An invoice read back: its stored lines and the sums of the stored figures (the total is money_invoice_total's). From
 *  part 1b: the derived status word, the due date, what is paid, credited, written off and still due, and `extraMinor`,
 *  money received past what the invoice asks (waiting for a person's "Refund · Keep as credit", never moved by itself). */
export const InvoiceView = z.strictObject({
  id: z.string(), status: z.literal("DRAFT").or(z.literal("ISSUED")), number: z.string().nullable(),
  personId: z.string().nullable(), companyId: z.string().nullable(), currency: MoneyCurrency, billToProvince: z.enum(BILL_TO_PROVINCES).nullable(), lines: z.array(LineView),
  subtotalMinor: z.number().int(), taxMinor: z.number().int(), totalMinor: z.number().int(),
  statusWord: StatusWord, dueDate: z.string().nullable(), paidMinor: z.number().int(), creditedMinor: z.number().int(),
  writtenOffMinor: z.number().int(), dueMinor: z.number().int(), extraMinor: z.number().int(),
  /** FO-7w1: the invoice bills a retainer's "On signing" row (a deposit, AG-6-61): never a card pay link (P-567 (3)). */
  deposit: z.boolean(),
});
export type InvoiceView = z.infer<typeof InvoiceView>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "That date does not exist.").refine((d) => d >= "2000-01-01" && d <= "2999-12-31", "A date from the year 2000 to 2999.");
const words = (what: string, max: number) => z.string().trim().min(1, `${what} is needed.`).refine((t) => [...t].length <= max, `At most ${max} characters.`).regex(/^[^\u0000-\u001f\u007f\u2028\u2029]*$/, "One line, no tabs or control characters.").refine((t) => !LONE_SURROGATE.test(t), "Use only whole characters: this text has a broken character in it.");

/** POST …/invoices/:id/issue: the due date, else the firm's "Due in N days" from today (AG-6-46 rule 1). */
export const IssueIn = z.strictObject({ dueDate: day.optional() });
/** The methods a person records by hand (AG-6-19 rule 1; Lead B amendment 6). CARD is the online card only (FO-7c). */
export const HandMethod = z.enum(["BANK_TRANSFER", "WIRE", "CHEQUE", "CASH", "E_TRANSFER", "CARD_TERMINAL", "OTHER"]);
export const ReceivedInto = z.enum(["OPERATING", "TRUST"]);
/** POST …/invoices/:id/payments: one payment recorded by hand. `idempotencyKey` makes a double click one payment.
 *  `receivedInto` absent reads as OPERATING until part 2 (amendment 10). The two acknowledgements answer a warning. */
export const PaymentIn = z.strictObject({
  method: HandMethod, amountMinor: whole("The amount (in cents)", 1, MINOR_MAX), currency: MoneyCurrency.optional(),
  receivedInto: ReceivedInto.optional(), receivedOn: day.optional(), reference: words("The reference", 200).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/, "8 to 200 letters, numbers, or : . _ -"),
  duplicateReferenceAcknowledged: z.boolean().optional(), unclearedAcknowledged: z.boolean().optional(),
});
export type PaymentIn = z.infer<typeof PaymentIn>;
/** POST …/invoices/:id/write-off (R1.96 part 1; AG-6-76): only the reason; the amount is what is still due. */
export const WriteOffIn = z.strictObject({ reason: words("The reason", 200) });
export type WriteOffIn = z.infer<typeof WriteOffIn>;
/** At most 12 instalments in a payment plan: Sample (BACKLOG FO-7p "at most 12, Sample"; no source value). */
export const MAX_INSTALMENTS = 12;
/** POST …/invoices/:id/plan (R1.96 part 2; FO-7p, P-574 (5), P-578): 2 to 12 instalments, each a due date and a whole
 *  amount; the route checks the sum against what is due, the dates against today and each other. */
export const PlanIn = z.strictObject({
  instalments: z.array(z.strictObject({ dueDate: day, amountMinor: whole("The amount (in cents)", 1, MINOR_MAX) }), { error: "The instalments are needed." })
    .min(2, "A plan has at least 2 instalments.").max(MAX_INSTALMENTS, `A plan has at most ${MAX_INSTALMENTS} instalments (Sample).`),
});
export type PlanIn = z.infer<typeof PlanIn>;
/** POST …/invoices/:id/plan/cancel (R1.96 part 2): only the reason. */
export const PlanCancelIn = z.strictObject({ reason: words("The reason", 200) });
export type PlanCancelIn = z.infer<typeof PlanCancelIn>;
/** POST …/invoices/:id/credit-notes: `full` credits all that is left (a cancel, AG-6-48 rule 2), else `amountMinor`: the
 *  gross amount (Lead B (Track B) ruling 3: any tax split is Sample. Unconfirmed: no accountant). */
export const CreditNoteIn = z.strictObject({ full: z.boolean().optional(), amountMinor: whole("The amount (in cents)", 1, MINOR_MAX).optional(), reason: words("The reason", 200) })
  .refine((c) => (c.full === true) !== (c.amountMinor !== undefined), { message: "Give an amount, or choose a full credit note: one of the two.", path: ["amountMinor"] });

/** What a recorded payment answers. `extra` is money past what the invoice asked, as recorded; `waitingMinor` is the part
 *  not yet kept as credit, for which a person chooses Refund · Keep as credit (amendment 1). `trust`
 *  only for money received into trust: `shortfallCoveredMinor` is the part that made up a balance below zero (P-634); the party's balance is its newest ledger entry's, never one row of a paired move. */
export const PaymentView = z.strictObject({
  id: z.string(), invoiceId: z.string(), method: HandMethod, amountMinor: z.number().int(), currency: MoneyCurrency, receivedInto: ReceivedInto,
  receivedOn: z.string(), reference: z.string().nullable(), cleared: z.boolean(), receiptNumber: z.string(), replayed: z.boolean(),
  appliedMinor: z.number().int(), extra: z.strictObject({ amountMinor: z.number().int(), waitingMinor: z.number().int(), choices: z.array(z.enum(["REFUND", "KEEP_AS_CREDIT"])), note: z.string().nullable() }).nullable(),
  trust: z.strictObject({ depositedMinor: z.number().int(), appliedMinor: z.number().int(), shortfallCoveredMinor: z.number().int(), balanceMinor: z.number().int() }).nullable(),
  receiptEmail: z.enum(["SENT", "NO_ADDRESS", "NOT_SENT"]), invoice: InvoiceView,
});
export type PaymentView = z.infer<typeof PaymentView>;
export const CreditNoteView = z.strictObject({ id: z.string(), number: z.string(), full: z.boolean(), amountMinor: z.number().int(), currency: MoneyCurrency, reason: z.string(), invoice: InvoiceView });
export type CreditNoteView = z.infer<typeof CreditNoteView>;
/** An issue or a send answers the invoice and what happened to its email: HELD while the firm's operating payment
 *  details are empty (AG-6-71 rule 3), NO_ADDRESS when the bill-to has no email, NOT_SENT when the sender failed. */
export const IssuedView = z.strictObject({ invoice: InvoiceView, email: z.enum(["SENT", "HELD", "NO_ADDRESS", "NOT_SENT"]) });
export type IssuedView = z.infer<typeof IssuedView>;

// ------------------------------------------------------------------------------------------------------------ events
/** Client money's event names (module_event.type). Kept here, in the module's own port file, until the events folder of
 *  P-785 (2) is on main (#2919): ports/events.ts is frozen for new names. */
export const MONEY_EVENT = {
  /** An invoice was issued: numbered and frozen (AG-6-1 rule 9). */
  INVOICE_ISSUED: "invoice.issued",
  /** Nothing is left to pay on an issued invoice (AG-6-19 rule 9). */
  INVOICE_PAID: "invoice.paid",
  /** An invoice was cancelled by a full credit note (AG-6-48 rule 9). */
  INVOICE_VOIDED: "invoice.voided",
  /** An issued invoice passed its due date with something left to pay (row FO-7b; written by a later part's job). */
  INVOICE_OVERDUE: "invoice.overdue",
  /** A payment was recorded (AG-6-19 rule 9); `externalId` is a surrogate id for a payment recorded by hand. */
  PAYMENT_SUCCEEDED: "payment.succeeded",
  /** A payment was refunded (AG-6-23 rule 9; FO-7b part 1c: offline refunds only, card refunds are FO-7c). */
  PAYMENT_REFUNDED: "payment.refunded",
  /** What was still due on an issued invoice was written off (R1.96 part 1; AG-6-76 rule 9). */
  INVOICE_WRITTEN_OFF: "invoice.written_off",
  /** A card payment on an invoice's pay link was declined (FO-7c part 2b, R1.57: "a failed card leaves the invoice unpaid
   *  with the reason"); the invoice is unchanged. */
  PAYMENT_FAILED: "payment.failed",
} as const;
const uuid = z.string().regex(UUID);
/** invoice.*: ids and the stored figures only (no name, no email). The tax and total are the stored lines' sums (R9). */
export const InvoiceEventPayload = z.strictObject({ invoiceId: uuid, number: z.string(), personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(),
  currency: MoneyCurrency, subtotalMinor: z.number().int(), taxMinor: z.number().int(), totalMinor: z.number().int(), dueDate: z.string(), creditNoteId: uuid.optional() });
export type InvoiceEventPayload = z.infer<typeof InvoiceEventPayload>;
/** CARD: FO-7c part 2b, a payment booked from the card webhook. */
export const PaymentEventPayload = z.strictObject({ paymentId: uuid, externalId: z.string(), invoiceId: uuid, method: z.union([HandMethod, z.literal("CARD")]), amountMinor: z.number().int(), currency: MoneyCurrency, receivedInto: ReceivedInto, receiptNumber: z.string() });
export type PaymentEventPayload = z.infer<typeof PaymentEventPayload>;
/** payment.failed (FO-7c part 2b): the intent, the invoice, the amount asked and the processor's decline code (a fixed word or "other"); no card data, no text. */
export const PaymentFailedPayload = z.strictObject({ externalId: z.string(), invoiceId: uuid, amountMinor: z.number().int(), currency: MoneyCurrency, code: z.string().regex(/^[a-z_]{1,40}$/) });
export type PaymentFailedPayload = z.infer<typeof PaymentFailedPayload>;

// -------------------------------------------------------------------------------------------------------------- port
/** The bill-to party another module asks about: a person or a company of the firm (exactly one). */
export const MoneyParty = z.strictObject({ personId: uuid.optional(), companyId: uuid.optional() }).refine((p) => (p.personId ? 1 : 0) + (p.companyId ? 1 : 0) === 1, "one of personId, companyId");
export type MoneyParty = z.infer<typeof MoneyParty>;
/** What other modules ask client money (contracts §8: nothing else reads or writes money_*). */
export interface ClientMoneyPort {
  /** True when any invoice, payment or trust entry exists for the party in the firm, a tax treatment is set for it, or a
   *  trust entry names it as payee (FO-9b asks before a merge by itself). */
  hasMoney(firmId: string, party: MoneyParty): Promise<boolean>;
}
/** The fake: the parties a test says have money, per firm. */
export function fakeClientMoney(have: { firmId: string; personId?: string; companyId?: string }[] = []): ClientMoneyPort {
  return { async hasMoney(firmId, party) { const p = MoneyParty.parse(party), id = (p.personId ?? p.companyId)!.toLowerCase(); return have.some((h) => h.firmId.toLowerCase() === firmId.toLowerCase() && (p.personId ? h.personId : h.companyId)?.toLowerCase() === id); } };
}

// ------------------------------------------------------------------------------------------- FO-7b part 1c (additive)
/** POST /api/front-office/money/payments/:paymentId/refunds: an offline refund of a payment recorded into operating
 *  (AG-6-23 rules 2, 4): an amount, how and when it was paid back (today when no date is sent), a reason (required), and
 *  an idempotency key. The same key again with the same data answers the same refund; with other data, 409. */
export const RefundIn = z.strictObject({
  amountMinor: whole("The amount (in cents)", 1, MINOR_MAX), method: HandMethod, reference: words("The reference", 200).optional(),
  refundedOn: day.optional(), reason: words("The reason", 200), idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/, "8 to 200 letters, numbers, or : . _ -"),
});
export type RefundIn = z.infer<typeof RefundIn>;
/** POST …/payments/:paymentId/extra: a person's one choice on a payment's waiting extra (FO-7b amendment 1). Always for
 *  exactly what is waiting. A Refund needs how it was paid back, a reason and an idempotency key. */
export const ExtraChoiceIn = z.strictObject({
  choice: z.enum(["REFUND", "KEEP_AS_CREDIT"], { error: "Choose REFUND or KEEP_AS_CREDIT." }),
  method: HandMethod.optional(), reference: words("The reference", 200).optional(), refundedOn: day.optional(), reason: words("The reason", 200).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/, "8 to 200 letters, numbers, or : . _ -").optional(),
}).superRefine((c, x) => {   // one strict shape, so an unknown field is named whatever the choice (PF-28); each choice's own fields below
  if (c.choice === "REFUND") {
    if (!c.method) x.addIssue({ code: "custom", path: ["method"], message: "This is required." });
    if (!c.reason) x.addIssue({ code: "custom", path: ["reason"], message: "This is required." });
    if (!c.idempotencyKey) x.addIssue({ code: "custom", path: ["idempotencyKey"], message: "This is required." });
  } else for (const k of ["method", "reference", "refundedOn", "idempotencyKey"] as const) if (c[k] !== undefined) x.addIssue({ code: "custom", path: [k], message: "Only a Refund takes this." });
});
export type ExtraChoiceIn = z.infer<typeof ExtraChoiceIn>;
/** What a refund answers: the refund as stored and the invoice read back after it. */
export const RefundView = z.strictObject({
  id: z.string(), paymentId: z.string(), amountMinor: z.number().int(), currency: MoneyCurrency, route: z.literal("OFFLINE"), reason: z.string(),
  replayed: z.boolean(), leftToRefundMinor: z.number().int(), invoice: InvoiceView,
});
export type RefundView = z.infer<typeof RefundView>;
/** What a choice answers: what was chosen, for how much, what is still waiting (0), and the invoice after it. */
export const ExtraChoiceView = z.strictObject({
  paymentId: z.string(), choice: z.enum(["REFUND", "KEEP_AS_CREDIT"]), amountMinor: z.number().int(), currency: MoneyCurrency,
  refundId: z.string().nullable(), creditEntryId: z.string().nullable(), waitingMinor: z.number().int(), replayed: z.boolean(), invoice: InvoiceView,
});
export type ExtraChoiceView = z.infer<typeof ExtraChoiceView>;
/** payment.refunded: ids and figures only (no name, no email). */
export const RefundEventPayload = z.strictObject({ refundId: uuid, paymentId: uuid, invoiceId: uuid, amountMinor: z.number().int(), currency: MoneyCurrency, route: z.enum(["OFFLINE", "CARD"]), fromExtra: z.boolean() });   // CARD: FO-7c part 3
/** POST …/payments/:paymentId/card-refund (FO-7c part 3, AG-6-23 r2, r4, r5): part or full, a reason, its own key. */
export const CardRefundIn = z.strictObject({ amountMinor: whole("The amount (in cents)", 1, MINOR_MAX), reason: words("The reason", 200), idempotencyKey: z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/, "8 to 200 letters, numbers, or : . _ -") });
export type CardRefundIn = z.infer<typeof CardRefundIn>;
/** What a card refund answers: "Refund requested" until Stripe's event confirms it (then a money_refund row exists). */
export const CardRefundView = z.strictObject({ paymentId: z.string(), amountMinor: z.number().int(), currency: MoneyCurrency, reason: z.string(), state: z.enum(["REQUESTED", "REFUNDED"]), stateWord: z.string(), replayed: z.boolean(), leftToRefundMinor: z.number().int() });
export type CardRefundView = z.infer<typeof CardRefundView>;
export type RefundEventPayload = z.infer<typeof RefundEventPayload>;
