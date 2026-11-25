// FO-7r part 1 (R1.111; AG-6-28 rules 1, 3; AG-6-30; shape r1-111-shape.md, Lead 4 on #3634): the client statement as
// data, the source of the PDF and the emailed statement (part 2). Two accounts, each per currency, never added together:
//   * INVOICES: every fact that changes what the client owes on their issued invoices, in time order, each signed as it
//     moves the balance: the invoice issued (+ its stored total, money_invoice_total), a payment into operating (−), a
//     refund of a payment (+), trust applied (− the withdrawal) and a correction of it (+), money a credit note's "Refund
//     to the client" sent back from trust (+), credit applied (−) and its reversal (+), a credit note (−), a write-off (−).
//     These are, term for term, the facts status-sql.ts FACTS_LATERAL reads (total − credited − written − paid, paid =
//     operating − refunded + trust + applied), so the closing balance is Σ of (total − credited − written off − paid)
//     over the same invoices: the invoice list's own figures (the row's rule: "the statement's running balance equals
//     the ledger"; tests/check_fo7r_statement.ts S1). A balance below zero is money paid beyond what was billed (shown,
//     never hidden); what is owed is the summary's (never below zero per invoice). Credit kept is a holding, in the summary.
//     Known limit: FACTS_LATERAL takes greatest(trust paid − returned, 0) per invoice; a return above what trust paid
//     would differ here by the excess (no write path on main allows it: FO-7a2's checks).
//   * TRUST (only while trust shows, AG-6-59 rules 5-6): the client's trust entries in the ledger's own order (seq, as
//     trust/reads.ts), with the running balance per currency.
// The running balance is summed in the database over every line of the account (window, never a loop here), then the
// period (from/to, days in UTC as facts.ts's dayOf, Sample) keeps its lines; opening is the balance before `from`,
// closing the balance at the end of `to`. Paged on the server (AG-6-30: 50 by default, at most 200, keyset cursor).
// Who: the caller's C5 scope (invoices by scopeSql, trust entries by their case or party); firm: the session's. Reads only.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { UUID } from "../invoices/drafts.ts";
import { Day, Stamp, bad, cursorOf, cursorText, pageSizeOf, trustShows } from "../reads/common.ts";
import { failClosed, scopeSql, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { kindOf, partyCol, partyFor, seenSql, type Party } from "./common.ts";

type Tx = Prisma.TransactionClient;
export const LINE_KINDS = ["INVOICE", "PAYMENT", "REFUND", "PAID_FROM_TRUST", "PAID_FROM_TRUST_CORRECTED", "RETURNED_FROM_TRUST", "CREDIT_APPLIED", "CREDIT_APPLIED_REVERSED", "CREDIT_NOTE", "WRITE_OFF"] as const;
export type Account = "INVOICES" | "TRUST";
export type StatementLine = { account: Account; currency: "CAD" | "USD"; at: string; kind: string; reference: string | null; invoiceId: string | null; caseId: string | null; amountMinor: number; balanceAfterMinor: number };
export type AccountTotals = { account: Account; currency: "CAD" | "USD"; openingMinor: number; closingMinor: number; lines: number };
export type Statement = { party: Party; period: { from: string | null; to: string | null }; trustShows: boolean; accounts: AccountTotals[]; items: StatementLine[]; pageSize: number; next: string | null };

const Query = z.strictObject({ from: Day.optional(), to: Day.optional(), caseId: z.string().regex(UUID).optional(), pageSize: z.string().optional(), after: z.string().optional() });
const Cursor = z.strictObject({ a: z.union([z.literal(0), z.literal(1)]), c: z.enum(["CAD", "USD"]), t: Stamp, o: z.number().int().min(0).max(2_147_483_647), id: z.string().regex(UUID), v: z.string().regex(UUID) });
/** Trust lines sort by seq alone: one fixed key time (never created_at, the transaction's start: trust/reads.ts's break Major 1). */
const TRUST_KEY = "2000-01-01 00:00:00+00";

/** The CTEs `inv` (the client's issued invoices in scope) and `l` (every line of the client's accounts the caller may
 *  see, with its sort key (acct, currency, k, o, id, inv) and signed amount). summary.ts reads the same lines. */
export function ledgerCtes(f: string, p: Party, scope: MoneyScope, caseId: string | undefined, showTrust: boolean): Prisma.Sql {
  const onCase = (x: string) => caseId ? Prisma.sql`and ${Prisma.raw(x)}.case_id = ${caseId}::uuid` : Prisma.empty;
  const trust = showTrust ? Prisma.sql`union all
    select 1, e.currency::text, ${TRUST_KEY}::timestamptz, e.seq, e.id, e.id, e.created_at, e.kind::text, coalesce(p.reference, r.number, i.number), e.invoice_id, e.case_id, e.amount_minor::bigint
      from money_trust_entry e left join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id
        left join money_trust_request r on r.firm_id = e.firm_id and r.id = e.trust_request_id left join money_invoice i on i.firm_id = e.firm_id and i.id = e.invoice_id
      where e.firm_id = ${f}::uuid and ${partyCol(p, "e")} = ${p.id}::uuid and ${seenSql(scope, "e")} ${onCase("e")}` : Prisma.empty;
  // inv: the client's issued invoices in scope; each later branch is one fact of FACTS_LATERAL, joined to them by invoice
  // the stored total: money_invoice_total's own sum, by the line index (firm, invoice), once per invoice
  return Prisma.sql`with inv as materialized (select i.id, i.case_id, i.currency, i.number, i.issued_at, i.due_date, coalesce(t.total, 0) as total from money_invoice i
        left join lateral (select sum(x.amount_minor::bigint + x.tax_minor) as total from money_invoice_line x where x.firm_id = i.firm_id and x.invoice_id = i.id) t on true
      where i.firm_id = ${f}::uuid and ${partyCol(p, "i")} = ${p.id}::uuid and i.issued_at is not null and ${scopeSql(scope)} ${onCase("i")}),
    -- credit applied to one of these invoices: money_invoice_credit's "e.invoice_id = inv or p.invoice_id = inv", as two
    -- plain joins the database can hash (an OR join loops over every credit entry of the firm: review M1), the second
    -- only where the payment's invoice is another one (so an entry naming one invoice both ways counts once, as the OR does)
    ca as materialized (select e.id, e.created_at, e.amount_minor, e.invoice_id as inv from money_credit_entry e join inv on inv.id = e.invoice_id where e.firm_id = ${f}::uuid and e.kind = 'APPLIED'
      union all select e.id, e.created_at, e.amount_minor, p.invoice_id from money_credit_entry e join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id join inv on inv.id = p.invoice_id
        where e.firm_id = ${f}::uuid and e.kind = 'APPLIED' and e.invoice_id is distinct from p.invoice_id),
    f0 (acct, currency, k, o, id, inv, at, kind, reference, invoice_id, case_id, amount) as (
      select 0, i.currency::text, i.issued_at, 1, i.id, i.id, i.issued_at, 'INVOICE', i.number, i.id, i.case_id, i.total::bigint from inv i
      union all select 0, i.currency::text, p.received_at, 2, p.id, i.id, p.received_at, 'PAYMENT', coalesce(p.reference, i.number), i.id, i.case_id, -p.amount_minor::bigint
        from money_payment p join inv i on i.id = p.invoice_id where p.firm_id = ${f}::uuid and p.received_into = 'OPERATING'
      union all select 0, i.currency::text, r.created_at, 3, r.id, i.id, r.created_at, 'REFUND', coalesce(p.reference, i.number), i.id, i.case_id, r.amount_minor::bigint
        from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id join inv i on i.id = p.invoice_id where r.firm_id = ${f}::uuid
      union all select 0, i.currency::text, e.created_at, 4, e.id, i.id, e.created_at, 'PAID_FROM_TRUST', i.number, i.id, i.case_id, e.amount_minor::bigint
        from money_trust_entry e join inv i on i.id = e.invoice_id where e.firm_id = ${f}::uuid and e.kind = 'WITHDRAWAL_TO_INVOICE'
      union all select 0, i.currency::text, c.created_at, 5, c.id, i.id, c.created_at, 'PAID_FROM_TRUST_CORRECTED', i.number, i.id, i.case_id, c.amount_minor::bigint
        from money_trust_entry c join money_trust_entry w on w.firm_id = c.firm_id and w.id = c.corrects_entry_id join inv i on i.id = w.invoice_id where c.firm_id = ${f}::uuid and c.kind = 'CORRECTION'
      union all select 0, i.currency::text, c.created_at, 6, c.id, i.id, c.created_at, 'RETURNED_FROM_TRUST', coalesce(c.number, i.number), i.id, i.case_id, coalesce(c.overpaid_minor, 0)::bigint
        from money_credit_note c join inv i on i.id = c.invoice_id where c.firm_id = ${f}::uuid and c.overpaid_choice = 'OVERPAID_REFUND'
      union all select 0, i.currency::text, e.created_at, 7, e.id, i.id, e.created_at, 'CREDIT_APPLIED', i.number, i.id, i.case_id, e.amount_minor::bigint
        from ca e join inv i on i.id = e.inv
      union all select 0, i.currency::text, r.created_at, 8, r.id, i.id, r.created_at, 'CREDIT_APPLIED_REVERSED', i.number, i.id, i.case_id, r.amount_minor::bigint
        from money_credit_entry r join ca e on e.id = r.reverses_entry_id join inv i on i.id = e.inv where r.firm_id = ${f}::uuid
      union all select 0, i.currency::text, c.created_at, 9, c.id, i.id, c.created_at, 'CREDIT_NOTE', coalesce(c.number, i.number), i.id, i.case_id, -c.amount_minor::bigint
        from money_credit_note c join inv i on i.id = c.invoice_id where c.firm_id = ${f}::uuid
      union all select 0, i.currency::text, w.created_at, 10, w.id, i.id, w.created_at, 'WRITE_OFF', i.number, i.id, i.case_id, -w.amount_minor::bigint
        from money_write_off w join inv i on i.id = w.invoice_id where w.firm_id = ${f}::uuid
    ),
    -- a fact dated before its invoice was issued (a payment recorded with its real day, stored at 00:00 UTC; credit applied
    -- to the draft) counts from the issue: it never sorts before the invoice, nor falls in a period before it (review m1, m2)
    l as (select f0.acct, f0.currency, greatest(f0.k, inv.issued_at) as k, f0.o, f0.id, f0.inv, greatest(f0.at, inv.issued_at) as at, f0.kind, f0.reference, f0.invoice_id, f0.case_id, f0.amount
        from f0 join inv on inv.id = f0.inv
      ${trust})`;
}
/** ledgerCtes plus `run`: each line with its running balance per account and currency. */
const runSql = (ctes: Prisma.Sql) => Prisma.sql`${ctes}, run as (select l.*, sum(l.amount) over (partition by l.acct, l.currency order by l.k, l.o, l.id, l.inv rows unbounded preceding) as balance from l)`;

export class MoneyStatement {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}

  /** GET /api/front-office/money/parties/:kind/:id/statement?from=&to=&caseId=&pageSize=&after=. */
  async statement(ctx: StaffContext, kindRaw: string, id: string, query: unknown): Promise<Statement> {
    const kind = kindOf(kindRaw), q = parseInput(Query, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, Cursor);
    if (q.from && q.to && q.from > q.to) bad("to", "to is before from.");
    const f = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), caseId = q.caseId?.toLowerCase();
    return this.db.$transaction(async (tx) => {
      const party = await partyFor(tx, f, kind, id, scope), showTrust = await trustShows(tx, f);
      return { party, period: { from: q.from ?? null, to: q.to ?? null }, trustShows: showTrust, ...(await read(tx, runSql(ledgerCtes(f, party, scope, caseId, showTrust)), q.from, q.to, pageSize, after)) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

/** The period's totals per account and currency, and one page of its lines (each with its running balance). */
async function read(tx: Tx, base: Prisma.Sql, from: string | undefined, to: string | undefined, pageSize: number, after: z.infer<typeof Cursor> | null) {
  const start = from ? Prisma.sql`(${from}::date::timestamp at time zone 'UTC')` : null, end = to ? Prisma.sql`((${to}::date + 1)::timestamp at time zone 'UTC')` : null;
  const inPeriod = Prisma.sql`${start ? Prisma.sql`run.at >= ${start}` : Prisma.sql`true`} and ${end ? Prisma.sql`run.at < ${end}` : Prisma.sql`true`}`;
  const totals = await tx.$queryRaw<{ acct: number; currency: "CAD" | "USD"; opening: string; closing: string; lines: number }[]>`${base}
    select run.acct, run.currency, coalesce(sum(run.amount) filter (where ${start ? Prisma.sql`run.at < ${start}` : Prisma.sql`false`}), 0)::text as opening,
      coalesce(sum(run.amount) filter (where ${end ? Prisma.sql`run.at < ${end}` : Prisma.sql`true`}), 0)::text as closing, (count(*) filter (where ${inPeriod}))::int as lines
    from run group by run.acct, run.currency order by run.acct, run.currency`;
  const cur = after ? Prisma.sql`(run.acct, run.currency, run.k, run.o, run.id, run.inv) > (${after.a}::int, ${after.c}::text, (${after.t}::timestamp at time zone 'UTC'), ${after.o}::int, ${after.id}::uuid, ${after.v}::uuid)` : Prisma.sql`true`;
  const rows = await tx.$queryRaw<{ acct: number; currency: "CAD" | "USD"; k: string; o: number; id: string; inv: string; at: string; kind: string; reference: string | null; invoiceId: string | null; caseId: string | null; amount: string; balance: string }[]>`${base}
    select run.acct, run.currency, to_char(run.k at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as k, run.o, run.id::text as id, run.inv::text as inv,
      to_char(run.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as at, run.kind, run.reference, run.invoice_id::text as "invoiceId", run.case_id::text as "caseId", run.amount::text as amount, run.balance::text as balance
    from run where ${inPeriod} and ${cur} order by run.acct, run.currency, run.k, run.o, run.id, run.inv limit ${pageSize + 1}`;
  const page = rows.slice(0, pageSize), last = page.at(-1), acct = (a: number): Account => a === 0 ? "INVOICES" : "TRUST";
  return {
    accounts: totals.map((t) => ({ account: acct(t.acct), currency: t.currency, openingMinor: Number(t.opening), closingMinor: Number(t.closing), lines: t.lines })),
    items: page.map((r) => ({ account: acct(r.acct), currency: r.currency, at: `${r.at}Z`, kind: r.kind, reference: r.reference, invoiceId: r.invoiceId, caseId: r.caseId, amountMinor: Number(r.amount), balanceAfterMinor: Number(r.balance) })),
    pageSize, next: rows.length > pageSize && last ? cursorText({ a: last.acct, c: last.currency, t: last.k, o: last.o, id: last.id, v: last.inv }) : null,
  };
}
