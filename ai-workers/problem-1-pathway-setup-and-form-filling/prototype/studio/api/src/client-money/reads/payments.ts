// FO-7q: GET …/money/payments (filters: invoiceId, method, received from/to; keyset paging 50, at most 200) and
// GET …/money/payments/:id (and trustRequestId, read only while trust shows). A payment is visible exactly when its invoice is (visibility.ts, fail closed); a payment on
// no invoice (a trust deposit) is answered only while trust shows and the scope is the whole firm. "Received into" and
// the trust request are answered only while trust shows (AG-6-59 rules 5-6). Each amount with its currency; never summed.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HandMethod } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { UUID, notFound } from "../invoices/drafts.ts";
import { Day, Stamp, bad, cursorOf, cursorText, pageSizeOf, trustShows } from "./common.ts";
import { failClosed, scopeSql, type MoneyScope, type ScopeOf } from "./visibility.ts";

type Tx = Prisma.TransactionClient;
const Method = z.enum([...HandMethod.options, "CARD"]);
const Query = z.strictObject({ invoiceId: z.string().regex(UUID).optional(), trustRequestId: z.string().regex(UUID).optional(), method: Method.optional(), from: Day.optional(), to: Day.optional(), pageSize: z.string().optional(), after: z.string().optional() });
const PaymentCursor = z.strictObject({ t: Stamp, id: z.string().regex(UUID) });

export type PaymentRow = { id: string; invoiceId: string | null; invoiceNumber: string | null; method: string; amountMinor: number; currency: string; receivedOn: string;
  reference: string | null; cleared: boolean; receiptNumber: string | null; refundedMinor: number;
  refunds: { id: string; amountMinor: number; currency: string; reason: string; createdAt: string }[]; receivedInto?: string; trustRequestId?: string | null };

type Where = { invoiceId?: string; trustRequestId?: string; paymentId?: string; method?: string; from?: string; to?: string; after?: { t: string; id: string } | null; scope?: MoneyScope; limit?: number };

/** The payments that match, newest received first, in one read; a test or the detail passes the invoice already scoped. */
export async function paymentRows(tx: Tx, firm: string, w: Where, showTrust: boolean): Promise<(PaymentRow & { t: string })[]> {
  const firmId = firmScope(firm).firmId, c: Prisma.Sql[] = [Prisma.sql`p.firm_id = ${firmId}::uuid`];
  if (w.invoiceId) c.push(Prisma.sql`p.invoice_id = ${w.invoiceId}::uuid`);
  if (w.trustRequestId) c.push(Prisma.sql`p.trust_request_id = ${w.trustRequestId}::uuid`);
  if (w.paymentId) c.push(Prisma.sql`p.id = ${w.paymentId}::uuid`);
  if (w.method) c.push(Prisma.sql`p.method::text = ${w.method}`);
  if (w.from) c.push(Prisma.sql`p.received_at >= (${w.from}::date::timestamp at time zone 'UTC')`);
  if (w.to) c.push(Prisma.sql`p.received_at < ((${w.to}::date + 1)::timestamp at time zone 'UTC')`);
  if (w.after) c.push(Prisma.sql`(p.received_at, p.id) < ((${w.after.t}::timestamp at time zone 'UTC'), ${w.after.id}::uuid)`);
  // scoped through the invoice; no invoice → only while trust shows and the scope is the whole firm
  if (w.scope) c.push(Prisma.sql`(case when p.invoice_id is null then ${showTrust && w.scope === "ALL"} else exists (select 1 from money_invoice i where i.firm_id = p.firm_id and i.id = p.invoice_id and ${scopeSql(w.scope)}) end)`);
  // trust off: no money received into trust and nothing without an invoice is answered at all, only the field-free
  // operating payments (AG-6-59 r5; break B3: a row with its "received into" stripped still showed trust money)
  if (!showTrust) c.push(Prisma.sql`p.invoice_id is not null and p.received_into = 'OPERATING'`);
  const rows = await tx.$queryRaw<{ id: string; invoice_id: string | null; number: string | null; method: string; amount_minor: number; currency: string; received_on: string; reference: string | null; cleared: boolean;
    receipt: string | null; into: string; trust_request_id: string | null; t: string; refunds: { id: string; amountMinor: number; currency: string; reason: string; createdAt: string }[] }[]>`
    select p.id::text, p.invoice_id::text, i.number, p.method::text, p.amount_minor, p.currency::text, to_char(p.received_at at time zone 'UTC', 'YYYY-MM-DD') as received_on, p.reference, p.cleared,
      (select r.number from money_receipt r where r.firm_id = p.firm_id and r.payment_id = p.id) as receipt, p.received_into::text as into, p.trust_request_id::text,
      to_char(p.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as t,
      coalesce((select json_agg(json_build_object('id', f.id, 'amountMinor', f.amount_minor, 'currency', f.currency, 'reason', f.reason, 'createdAt', to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by f.refund_ordinal)
        from money_refund f where f.firm_id = p.firm_id and f.payment_id = p.id), '[]'::json) as refunds
    from money_payment p left join money_invoice i on i.firm_id = p.firm_id and i.id = p.invoice_id
    where ${Prisma.join(c, " and ")} order by p.received_at desc, p.id desc ${w.limit ? Prisma.sql`limit ${w.limit}` : Prisma.empty}`;
  return rows.map((r) => ({ id: r.id, invoiceId: r.invoice_id, invoiceNumber: r.number, method: r.method, amountMinor: r.amount_minor, currency: r.currency, receivedOn: r.received_on,
    reference: r.reference, cleared: r.cleared, receiptNumber: r.receipt, refunds: r.refunds, refundedMinor: r.refunds.reduce((s, x) => s + x.amountMinor, 0), t: r.t,
    ...(showTrust ? { receivedInto: r.into, trustRequestId: r.trust_request_id } : {}) }));
}
const strip = ({ t: _t, ...p }: PaymentRow & { t: string }): PaymentRow => p;

export class PaymentReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}

  /** GET /api/front-office/money/payments. */
  async list(ctx: StaffContext, query: unknown): Promise<{ items: PaymentRow[]; pageSize: number; next: string | null }> {
    const q = parseInput(Query, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, PaymentCursor);
    if (q.from && q.to && q.from > q.to) return bad("to", "from is after to.");
    const scope = await this.scopeOf(ctx);
    const rows = await this.db.$transaction(async (tx) => paymentRows(tx, ctx.firmId, { invoiceId: q.invoiceId?.toLowerCase(), trustRequestId: q.trustRequestId?.toLowerCase(), method: q.method, from: q.from, to: q.to, after, scope, limit: pageSize + 1 }, await trustShows(tx, ctx.firmId)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const page = rows.slice(0, pageSize), last = page.at(-1);
    return { items: page.map(strip), pageSize, next: rows.length > pageSize && last ? cursorText({ t: last.t, id: last.id }) : null };
  }

  /** GET /api/front-office/money/payments/:id: another firm's, unknown or out of scope, the same 404. */
  async one(ctx: StaffContext, paymentId: string): Promise<PaymentRow> {
    if (!UUID.test(paymentId)) notFound("payment");
    const scope = await this.scopeOf(ctx);
    const [p] = await this.db.$transaction(async (tx) => paymentRows(tx, ctx.firmId, { paymentId: paymentId.toLowerCase(), scope }, await trustShows(tx, ctx.firmId)), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return p ? strip(p) : notFound("payment");
  }
}
