// FO-7b part 1a (QA-482; R1.59; brief build-lead-c-briefs/FO-7b-1a.md): the shared shapes of a draft invoice, as the
// client-money routes read and answer them. Only what these routes need (FO-7b amendment 5): ClientMoneyPort itself
// (what other modules ask, with its fake and contract) arrives with FO-7b part 1b. Money is integers in minor units with
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
}).refine((d) => (d.personId ? 1 : 0) + (d.companyId ? 1 : 0) === 1, { message: "Name one client: a person or a company.", path: ["personId"] });
export type DraftIn = z.infer<typeof DraftIn>;

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
});
export type LineView = z.infer<typeof LineView>;

/** A draft read back: its stored lines and the sums of the stored figures (the total is money_invoice_total's). */
export const InvoiceView = z.strictObject({
  id: z.string(), status: z.literal("DRAFT").or(z.literal("ISSUED")), number: z.string().nullable(),
  personId: z.string().nullable(), companyId: z.string().nullable(), currency: MoneyCurrency, lines: z.array(LineView),
  subtotalMinor: z.number().int(), taxMinor: z.number().int(), totalMinor: z.number().int(),
});
export type InvoiceView = z.infer<typeof InvoiceView>;
