// FO-7r part 1 (R1.111; AG-6-28 rules 1, 3; AG-6-30; shape r1-111-shape.md, Lead 4 on #3634): the client statement as
// data, the source of the PDF and the emailed statement (part 2). Two accounts, each per currency, never added together:
//   * INVOICES: every fact that changes what the client owes on their issued invoices, in time order, each signed as it
//     moves the balance: the invoice issued (+ its stored total, money_invoice_total), a payment into operating (−), a
//     refund of a payment (+), trust applied (− the withdrawal) and a correction of it (+), money a credit note's "Refund
//     to the client" sent back from trust (+), credit applied (−) and its reversal (+), a credit note (−), a write-off (−),
//     and money paid beyond the bill and kept as credit (+, it leaves the invoice for the client's credit; its reversal −:
//     break M1, else kept credit applied elsewhere counted twice). These are, term for term, the facts status-sql.ts
//     FACTS_LATERAL reads (total − credited − written − paid + kept, paid = operating − refunded + trust + applied), so
//     the closing balance is Σ (due − extra) over the same invoices: what is owed less what was paid beyond the bill and
//     still waits for a person's choice (refund or keep), the invoice list's own figures (the row's rule: "the
//     statement's running balance equals the ledger"; tests/check_fo7r_statement.ts S1, S9). Credit held is the client's
//     own holding, in the summary, never in this balance.
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
import { kindOf, partyCol, partyFor, seenSql, sortMemory, type Party } from "./common.ts";

type Tx = Prisma.TransactionClient;
export const LINE_KINDS = ["INVOICE", "PAYMENT", "REFUND", "PAID_FROM_TRUST", "PAID_FROM_TRUST_CORRECTED", "RETURNED_FROM_TRUST", "CREDIT_APPLIED", "CREDIT_APPLIED_REVERSED", "CREDIT_NOTE", "WRITE_OFF", "KEPT_AS_CREDIT", "KEPT_AS_CREDIT_REVERSED"] as const;
export type Account = "INVOICES" | "TRUST";
export type StatementLine = { account: Account; currency: "CAD" | "USD"; at: string; kind: string; reference: string | null; invoiceId: string | null; caseId: string | null; amountMinor: number; balanceAfterMinor: number };
export type AccountTotals = { account: Account; currency: "CAD" | "USD"; openingMinor: number; closingMinor: number; lines: number };
export type Statement = { party: Party; period: { from: string | null; to: string | null }; trustShows: boolean; accounts: AccountTotals[]; items: StatementLine[]; pageSize: number; next: string | null };

const Query = z.strictObject({ from: Day.optional(), to: Day.optional(), caseId: z.string().regex(UUID).optional(), pageSize: z.string().optional(), after: z.string().optional() });
const Cursor = z.strictObject({ a: z.union([z.literal(0), z.literal(1)]), c: z.enum(["CAD", "USD"]), t: Stamp, o: z.number().int().min(0).max(2_147_483_647), r: Stamp, id: z.string().regex(UUID), v: z.string().regex(UUID) });
/** Trust lines sort by seq alone: one fixed key time (never created_at, the transaction's start: trust/reads.ts's break Major 1). */
const TRUST_KEY = "2000-01-01 00:00:00+00";

/** The CTEs `inv` (the client's issued invoices in scope) and `l` (every line of the client's accounts the caller may
 *  see, with its sort key (acct, currency, k, o, r, id, inv): r is the fact's own time, so facts moved to the issue time keep their order (break round 2 m1) and signed amount). summary.ts reads the same lines. */
export function ledgerCtes(f: string, p: Party, scope: MoneyScope, caseId: string | undefined, showTrust: boolean): Prisma.Sql {
  const IDS = Prisma.sql`(select ids.a from ids)::uuid[]`;
  const onCase = (x: string) => caseId ? Prisma.sql`and ${Prisma.raw(x)}.case_id = ${caseId}::uuid` : Prisma.empty;
  const trust = showTrust ? Prisma.sql`union all
    select 1, e.currency::text, ${TRUST_KEY}::timestamptz, e.seq, e.created_at, e.id, e.id, e.created_at, e.kind::text,
        coalesce(p.reference, r.number, i.number), e.invoice_id, e.case_id, e.amount_minor::bigint
      from money_trust_entry e left join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id
        left join money_trust_request r on r.firm_id = e.firm_id and r.id = e.trust_request_id left join money_invoice i on i.firm_id = e.firm_id and i.id = e.invoice_id
      where e.firm_id = ${f}::uuid and ${partyCol(p, "e")} = ${p.id}::uuid and ${seenSql(scope, "e")} ${onCase("e")}` : Prisma.empty;
  // inv: the client's issued invoices in scope; each later branch is one fact of FACTS_LATERAL, joined to them by invoice
  // the stored total: money_invoice_total's own sum, read for the client's invoices in one grouped (hashed) read
  return Prisma.sql`with inv0 as materialized (select i.id, i.case_id, i.currency, i.number, i.issued_at, i.due_date from money_invoice i
      where i.firm_id = ${f}::uuid and ${partyCol(p, "i")} = ${p.id}::uuid and i.issued_at is not null and ${scopeSql(scope)} ${onCase("i")}),
    -- their ids, once: every fact table is read through its (firm, invoice) index for these ids only, so the cost follows
    -- the client's facts, never the firm's (break round 2 M1: a hash join read each table of the whole firm)
    ids as materialized (select coalesce(array_agg(inv0.id), '{}'::uuid[]) as a from inv0),
    inv as materialized (select inv0.*, coalesce(t.total, 0) as total from inv0 left join (select x.invoice_id, sum(x.amount_minor::bigint + x.tax_minor) as total
        from money_invoice_line x join inv0 on inv0.id = x.invoice_id where x.firm_id = ${f}::uuid and x.invoice_id = any(${IDS}) group by x.invoice_id) t on t.invoice_id = inv0.id),
    -- credit applied to one of these invoices: money_invoice_credit's "e.invoice_id = inv or p.invoice_id = inv", as two
    -- plain joins the database can hash (an OR join loops over every credit entry of the firm: review M1), the second
    -- only where the payment's invoice is another one (so an entry naming one invoice both ways counts once, as the OR does)
    ca as materialized (select e.id, e.kind, e.created_at, e.amount_minor, e.invoice_id as inv from money_credit_entry e join inv on inv.id = e.invoice_id where e.firm_id = ${f}::uuid and e.invoice_id = any(${IDS}) and e.kind in ('APPLIED', 'KEPT')
      union all select e.id, e.kind, e.created_at, e.amount_minor, p.invoice_id from money_credit_entry e join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id join inv on inv.id = p.invoice_id
        where e.firm_id = ${f}::uuid and p.invoice_id = any(${IDS}) and e.kind in ('APPLIED', 'KEPT') and e.invoice_id is distinct from p.invoice_id),
    -- a fact dated before its invoice was issued (a payment recorded with its real day, stored at 00:00 UTC; credit applied
    -- to the draft) counts from the issue: greatest(…, i.issued_at) in each branch, so it never sorts before the invoice,
    -- nor falls in a period before it (review m1, m2)
    l (acct, currency, k, o, r, id, inv, at, kind, reference, invoice_id, case_id, amount) as (
      select 0, i.currency::text, i.issued_at, 1, i.issued_at, i.id, i.id, i.issued_at, 'INVOICE', i.number, i.id, i.case_id, i.total::bigint from inv i
      union all select 0, i.currency::text, greatest(p.received_at, i.issued_at), 2, p.received_at, p.id, i.id, greatest(p.received_at, i.issued_at), 'PAYMENT', coalesce(p.reference, i.number), i.id, i.case_id, -p.amount_minor::bigint
        from money_payment p join inv i on i.id = p.invoice_id where p.firm_id = ${f}::uuid and p.invoice_id = any(${IDS}) and p.received_into = 'OPERATING'
      union all select 0, i.currency::text, greatest(r.created_at, i.issued_at), 3, r.created_at, r.id, i.id, greatest(r.created_at, i.issued_at), 'REFUND', coalesce(p.reference, i.number), i.id, i.case_id, r.amount_minor::bigint
        from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id join inv i on i.id = p.invoice_id where r.firm_id = ${f}::uuid and p.invoice_id = any(${IDS})
      union all select 0, i.currency::text, greatest(e.created_at, i.issued_at), 4, e.created_at, e.id, i.id, greatest(e.created_at, i.issued_at), 'PAID_FROM_TRUST', i.number, i.id, i.case_id, e.amount_minor::bigint
        from money_trust_entry e join inv i on i.id = e.invoice_id where e.firm_id = ${f}::uuid and e.invoice_id = any(${IDS}) and e.kind = 'WITHDRAWAL_TO_INVOICE'
      union all select 0, i.currency::text, greatest(c.created_at, i.issued_at), 5, c.created_at, c.id, i.id, greatest(c.created_at, i.issued_at), 'PAID_FROM_TRUST_CORRECTED', i.number, i.id, i.case_id, c.amount_minor::bigint
        from money_trust_entry c join money_trust_entry w on w.firm_id = c.firm_id and w.id = c.corrects_entry_id join inv i on i.id = w.invoice_id where c.firm_id = ${f}::uuid and w.invoice_id = any(${IDS}) and c.kind = 'CORRECTION'
      union all select 0, i.currency::text, greatest(c.created_at, i.issued_at), 6, c.created_at, c.id, i.id, greatest(c.created_at, i.issued_at), 'RETURNED_FROM_TRUST', coalesce(c.number, i.number), i.id, i.case_id, coalesce(c.overpaid_minor, 0)::bigint
        from money_credit_note c join inv i on i.id = c.invoice_id where c.firm_id = ${f}::uuid and c.invoice_id = any(${IDS}) and c.overpaid_choice = 'OVERPAID_REFUND'
      union all select 0, i.currency::text, greatest(e.created_at, i.issued_at), 7, e.created_at, e.id, i.id, greatest(e.created_at, i.issued_at), 'CREDIT_APPLIED', i.number, i.id, i.case_id, e.amount_minor::bigint
        from ca e join inv i on i.id = e.inv where e.kind = 'APPLIED'
      union all select 0, i.currency::text, greatest(r.created_at, i.issued_at), 8, r.created_at, r.id, i.id, greatest(r.created_at, i.issued_at), 'CREDIT_APPLIED_REVERSED', i.number, i.id, i.case_id, r.amount_minor::bigint
        from money_credit_entry r join ca e on e.id = r.reverses_entry_id join inv i on i.id = e.inv where r.firm_id = ${f}::uuid and e.kind = 'APPLIED'
      union all select 0, i.currency::text, greatest(e.created_at, i.issued_at), 11, e.created_at, e.id, i.id, greatest(e.created_at, i.issued_at), 'KEPT_AS_CREDIT', i.number, i.id, i.case_id, e.amount_minor::bigint
        from ca e join inv i on i.id = e.inv where e.kind = 'KEPT'
      union all select 0, i.currency::text, greatest(r.created_at, i.issued_at), 12, r.created_at, r.id, i.id, greatest(r.created_at, i.issued_at), 'KEPT_AS_CREDIT_REVERSED', i.number, i.id, i.case_id, r.amount_minor::bigint
        from money_credit_entry r join ca e on e.id = r.reverses_entry_id join inv i on i.id = e.inv where r.firm_id = ${f}::uuid and e.kind = 'KEPT'
      union all select 0, i.currency::text, greatest(c.created_at, i.issued_at), 9, c.created_at, c.id, i.id, greatest(c.created_at, i.issued_at), 'CREDIT_NOTE', coalesce(c.number, i.number), i.id, i.case_id, -c.amount_minor::bigint
        from money_credit_note c join inv i on i.id = c.invoice_id where c.firm_id = ${f}::uuid and c.invoice_id = any(${IDS})
      union all select 0, i.currency::text, greatest(w.created_at, i.issued_at), 10, w.created_at, w.id, i.id, greatest(w.created_at, i.issued_at), 'WRITE_OFF', i.number, i.id, i.case_id, -w.amount_minor::bigint
        from money_write_off w join inv i on i.id = w.invoice_id where w.firm_id = ${f}::uuid and w.invoice_id = any(${IDS})
      ${trust})`;
}
/** ledgerCtes plus `run`: the lines, read once (the totals, the page and the balance before the page all read it). */
export const runSql = (ctes: Prisma.Sql) => Prisma.sql`${ctes}, run as materialized (select * from l)`;

export class MoneyStatement {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}

  /** GET /api/front-office/money/parties/:kind/:id/statement?from=&to=&caseId=&pageSize=&after=. */
  async statement(ctx: StaffContext, kindRaw: string, id: string, query: unknown): Promise<Statement> {
    const kind = kindOf(kindRaw), q = parseInput(Query, query ?? {}), pageSize = pageSizeOf(q.pageSize), after = cursorOf(q.after, Cursor);
    if (q.from && q.to && q.from > q.to) bad("to", "to is before from.");
    const f = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), caseId = q.caseId?.toLowerCase();
    return this.db.$transaction(async (tx) => {
      await sortMemory(tx);
      const party = await partyFor(tx, f, kind, id, scope), showTrust = await trustShows(tx, f);
      return { party, period: { from: q.from ?? null, to: q.to ?? null }, trustShows: showTrust, ...(await read(tx, runSql(ledgerCtes(f, party, scope, caseId, showTrust)), q.from, q.to, pageSize, after)) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

/** The period's totals per account and currency, and one page of its lines (each with its running balance). */
async function read(tx: Tx, base: Prisma.Sql, from: string | undefined, to: string | undefined, pageSize: number, after: z.infer<typeof Cursor> | null) {
  const start = from ? Prisma.sql`(${from}::date::timestamp at time zone 'UTC')` : null, end = to ? Prisma.sql`((${to}::date + 1)::timestamp at time zone 'UTC')` : null;
  const inPeriod = Prisma.sql`${start ? Prisma.sql`run.at >= ${start}` : Prisma.sql`true`} and ${end ? Prisma.sql`run.at < ${end}` : Prisma.sql`true`}`;
  const cur = after ? Prisma.sql`(run.acct, run.currency, run.k, run.o, run.r, run.id, run.inv) > (${after.a}::int, ${after.c}::text, (${after.t}::timestamp at time zone 'UTC'), ${after.o}::int, (${after.r}::timestamp at time zone 'UTC'), ${after.id}::uuid, ${after.v}::uuid)` : Prisma.sql`true`;
  // one statement: the lines are computed once (run, materialized), the totals and the page both read from it (break
  // M2: two statements computed the whole ledger twice)
  const [one] = await tx.$queryRaw<{ totals: { acct: number; currency: "CAD" | "USD"; opening: string; closing: string; lines: number }[];
      rows: { acct: number; currency: "CAD" | "USD"; k: string; o: number; r: string; id: string; inv: string; at: string; kind: string; reference: string | null; invoiceId: string | null; caseId: string | null; amount: string; balance: string }[] }[]>(readSql(base, start, end, inPeriod, cur, pageSize));
  const totals = one?.totals ?? [], rows = one?.rows ?? [];
  const page = rows.slice(0, pageSize), last = page.at(-1), acct = (a: number): Account => a === 0 ? "INVOICES" : "TRUST";
  return {
    accounts: totals.map((t) => ({ account: acct(t.acct), currency: t.currency, openingMinor: Number(t.opening), closingMinor: Number(t.closing), lines: t.lines })),
    items: page.map((r) => ({ account: acct(r.acct), currency: r.currency, at: `${r.at}Z`, kind: r.kind, reference: r.reference, invoiceId: r.invoiceId, caseId: r.caseId, amountMinor: Number(r.amount), balanceAfterMinor: Number(r.balance) })),
    pageSize, next: rows.length > pageSize && last ? cursorText({ a: last.acct, c: last.currency, t: last.k, o: last.o, r: last.r, id: last.id, v: last.inv }) : null,
  };
}

/** The page read's SQL (exported for the plan check in tests/check_fo7r_statement.ts). */
export function readSql(base: Prisma.Sql, start: Prisma.Sql | null, end: Prisma.Sql | null, inPeriod: Prisma.Sql, cur: Prisma.Sql, pageSize: number): Prisma.Sql {
  return Prisma.sql`${base},
    t as (select run.acct, run.currency, coalesce(sum(run.amount) filter (where ${start ? Prisma.sql`run.at < ${start}` : Prisma.sql`false`}), 0)::text as opening,
        coalesce(sum(run.amount) filter (where ${end ? Prisma.sql`run.at < ${end}` : Prisma.sql`true`}), 0)::text as closing, (count(*) filter (where ${inPeriod}))::int as lines
      from run group by run.acct, run.currency),
    -- the page: the first lines after the cursor, by a top-N sort (never a sort of every line: break round 2 M1); each
    -- line's running balance is everything of its account and currency before the page's first line of that group (one
    -- linear sum per group on the page), plus every line from there up to it: the same figure as a running sum over all
    pg as materialized (select run.* from run where ${inPeriod} and ${cur} order by run.acct, run.currency, run.k, run.o, run.r, run.id, run.inv limit ${pageSize + 1}),
    g1 as materialized (select distinct on (pg.acct, pg.currency) pg.acct, pg.currency, pg.k, pg.o, pg.r, pg.id, pg.inv from pg order by pg.acct, pg.currency, pg.k, pg.o, pg.r, pg.id, pg.inv),
    g9 as materialized (select distinct on (pg.acct, pg.currency) pg.acct, pg.currency, pg.k, pg.o, pg.r, pg.id, pg.inv from pg order by pg.acct, pg.currency, pg.k desc, pg.o desc, pg.r desc, pg.id desc, pg.inv desc),
    st as materialized (select g1.acct, g1.currency, (select coalesce(sum(x.amount), 0) from run x where x.acct = g1.acct and x.currency = g1.currency and (x.k, x.o, x.r, x.id, x.inv) < (g1.k, g1.o, g1.r, g1.id, g1.inv)) as s from g1),
    -- the running sum over every line of the group from the page's first line to its last, whatever its period (review
    -- R3-2: a trust line sorts by seq but is cut by its time, so one outside the period can sit between the page's lines)
    sp as materialized (select x.acct, x.currency, x.k, x.o, x.r, x.id, x.inv, st.s + sum(x.amount) over (partition by x.acct, x.currency order by x.k, x.o, x.r, x.id, x.inv rows unbounded preceding) as balance
      from run x join g1 on g1.acct = x.acct and g1.currency = x.currency join g9 on g9.acct = x.acct and g9.currency = x.currency join st on st.acct = x.acct and st.currency = x.currency
      where (x.k, x.o, x.r, x.id, x.inv) >= (g1.k, g1.o, g1.r, g1.id, g1.inv) and (x.k, x.o, x.r, x.id, x.inv) <= (g9.k, g9.o, g9.r, g9.id, g9.inv)),
    p as (select pg.acct, pg.currency, to_char(pg.k at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as k, pg.o, to_char(pg.r at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as r, pg.id::text as id, pg.inv::text as inv,
        to_char(pg.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as at, pg.kind, pg.reference, pg.invoice_id::text as "invoiceId", pg.case_id::text as "caseId", pg.amount::text as amount, sp.balance::text as balance,
        row_number() over (order by pg.acct, pg.currency, pg.k, pg.o, pg.r, pg.id, pg.inv) as n
      from pg join sp on sp.acct = pg.acct and sp.currency = pg.currency and sp.k = pg.k and sp.o = pg.o and sp.r = pg.r and sp.id = pg.id and sp.inv = pg.inv)
    select (select coalesce(json_agg(t order by t.acct, t.currency), '[]'::json) from t) as totals, (select coalesce(json_agg(p order by p.n), '[]'::json) from p) as rows`;
}
