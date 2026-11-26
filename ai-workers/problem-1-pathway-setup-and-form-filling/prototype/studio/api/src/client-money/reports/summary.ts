// FO-7r part 1 (R1.111; AG-6-28 rules 1-2; shape r1-111-shape.md, Lead 4 on #3634): the money summary of one client,
// per case (and before a case) and per currency, then per currency for the client: billed, paid, paid from trust,
// credited, written off, refunded, owed, days the oldest invoice is overdue, trust balance, credit. Paid is money
// received (into operating less its refunds, plus trust applied): credit applied is the same money again, so it is its
// own figure, `creditAppliedMinor`, never added to paid (break M1). `waitingMinor` is money paid beyond the bill that
// waits for a person's choice (refund or keep as credit); the statement's closing balance is owed − waiting. Unbilled items have
// no source on main, so `unbilledMinor` is null ("Not tracked yet", Lead 4), never a guessed zero.
// Every figure is summed in the database from the statement's own INVOICES lines (statement.ts ledgerCtes), per invoice
// in FACTS_LATERAL's terms (status-sql.ts: the invoice list's and status's own; tests/check_fo7r_statement.ts S4 holds
// owed equal to the invoice list's due), over the client's issued invoices the caller may see (C5). "Refunded" is money
// refunded of payments on those invoices (FACTS_LATERAL's `refunded`); a refund out of trust is a TRUST line, a credit
// refund a change in credit. Currencies are never added:
// each row is one currency. Trust figures only while trust shows (AG-6-59 rules 5-6). Reads only.
import { Prisma, type PrismaClient } from "@prisma/client";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import { z } from "zod";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { dayOf } from "../invoices/facts.ts";
import { trustShows } from "../reads/common.ts";
import { failClosed, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { labelsOf } from "../reads/parties.ts";
import { invoiceIdsOf, ledgerCtes } from "./statement.ts";
import { kindOf, partyCol, partyFor, seenSql, sortMemory, type Party } from "./common.ts";

export type Figures = { currency: "CAD" | "USD"; billedMinor: number; paidMinor: number; paidFromTrustMinor: number; creditedMinor: number; writtenOffMinor: number;
  refundedMinor: number; creditAppliedMinor: number; waitingMinor: number; owedMinor: number; oldestOverdueDays: number | null; trustMinor: number | null; creditMinor: number; unbilledMinor: null };
export type CaseFigures = Figures & { caseId: string | null; caseLabel: string | null };
export type Summary = { party: Party; today: string; trustShows: boolean; totals: Figures[]; cases: CaseFigures[] };

type Row = { caseId: string | null; currency: "CAD" | "USD"; billed: string; paid: string; trust: string; credited: string; written: string; refunded: string; applied: string; waiting: string; owed: string; overdue: number | null };
const zero = (currency: "CAD" | "USD", showTrust: boolean): Figures => ({ currency, billedMinor: 0, paidMinor: 0, paidFromTrustMinor: 0, creditedMinor: 0, writtenOffMinor: 0, refundedMinor: 0, creditAppliedMinor: 0, waitingMinor: 0, owedMinor: 0,
  oldestOverdueDays: null, trustMinor: showTrust ? 0 : null, creditMinor: 0, unbilledMinor: null });
/** Adds b into a (same currency only: the caller groups by currency first). */
function add(a: Figures, b: Figures): Figures {
  if (a.currency !== b.currency) throw new Error("summary: two currencies are never added");
  const max = (x: number | null, y: number | null) => x === null ? y : y === null ? x : Math.max(x, y);
  return { ...a, billedMinor: a.billedMinor + b.billedMinor, paidMinor: a.paidMinor + b.paidMinor, paidFromTrustMinor: a.paidFromTrustMinor + b.paidFromTrustMinor, creditedMinor: a.creditedMinor + b.creditedMinor,
    writtenOffMinor: a.writtenOffMinor + b.writtenOffMinor, refundedMinor: a.refundedMinor + b.refundedMinor, creditAppliedMinor: a.creditAppliedMinor + b.creditAppliedMinor, waitingMinor: a.waitingMinor + b.waitingMinor, owedMinor: a.owedMinor + b.owedMinor, oldestOverdueDays: max(a.oldestOverdueDays, b.oldestOverdueDays),
    trustMinor: a.trustMinor === null || b.trustMinor === null ? null : a.trustMinor + b.trustMinor, creditMinor: a.creditMinor + b.creditMinor };
}

/** The per-case, per-currency invoice figures' SQL (exported for the plan check). */
export function summarySql(f: string, party: Party, scope: MoneyScope, today: string, invoiceIds: string): Prisma.Sql {
  return Prisma.sql`${ledgerCtes(f, party, scope, undefined, false, invoiceIds)},
        -- each invoice's facts summed once from the lines (materialized), then joined to the invoices by id: a join of the
        -- invoices straight onto the lines' union re-ran the union per invoice when statistics lagged (break round 2 M1)
        agg as materialized (select l.inv,
            coalesce(-sum(l.amount) filter (where l.kind = 'CREDIT_NOTE'), 0) as credited, coalesce(-sum(l.amount) filter (where l.kind = 'WRITE_OFF'), 0) as written,
            coalesce(-sum(l.amount) filter (where l.kind = 'PAYMENT'), 0) as operating, coalesce(sum(l.amount) filter (where l.kind = 'REFUND'), 0) as refunded,
            greatest(coalesce(-sum(l.amount) filter (where l.kind in ('PAID_FROM_TRUST', 'PAID_FROM_TRUST_CORRECTED', 'RETURNED_FROM_TRUST')), 0), 0) as trust,
            coalesce(-sum(l.amount) filter (where l.kind in ('CREDIT_APPLIED', 'CREDIT_APPLIED_REVERSED')), 0) as applied,
            coalesce(sum(l.amount) filter (where l.kind in ('KEPT_AS_CREDIT', 'KEPT_AS_CREDIT_REVERSED')), 0) as kept
          from l where l.acct = 0 group by l.inv),
        per as (select inv.id, inv.case_id, inv.currency, inv.due_date, inv.total, coalesce(a.credited, 0) as credited, coalesce(a.written, 0) as written,
            coalesce(a.operating, 0) as operating, coalesce(a.refunded, 0) as refunded, coalesce(a.trust, 0) as trust, coalesce(a.applied, 0) as applied, coalesce(a.kept, 0) as kept
          from inv left join agg a on a.inv = inv.id),
        -- FACTS_LATERAL's paid (with credit applied) for due and extra, as facts.ts: due = open − paid, extra = paid − open − kept
        net as (select per.*, per.total - per.credited - per.written - (per.operating - per.refunded + per.trust + per.applied) as open_left from per),
        due as (select net.*, greatest(0, net.open_left) as owed, greatest(0, -net.open_left - net.kept) as waiting from net)
        select due.case_id::text as "caseId", due.currency::text as currency, sum(due.total)::text as billed, sum(due.operating - due.refunded + due.trust)::text as paid, sum(due.trust)::text as trust,
          sum(due.credited)::text as credited, sum(due.written)::text as written, sum(due.refunded)::text as refunded, sum(due.applied)::text as applied, sum(due.waiting)::text as waiting, sum(due.owed)::text as owed,
          max(case when due.owed > 0 and due.due_date < ${today}::date then ${today}::date - due.due_date end)::int as overdue
        from due group by due.case_id, due.currency`;
}

const NoQuery = z.strictObject({});

export class MoneySummary {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed, private readonly clock: ClockPort = systemClock) {}

  /** GET /api/front-office/money/parties/:kind/:id/summary. */
  async summary(ctx: StaffContext, kindRaw: string, id: string, query: unknown = {}): Promise<Summary> {
    parseInput(NoQuery, query ?? {});   // break m1: an unknown query field is 422 naming it, as the statement's
    const kind = kindOf(kindRaw), f = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), today = dayOf(this.clock.now());
    return this.db.$transaction(async (tx) => {
      await sortMemory(tx);
      const party = await partyFor(tx, f, kind, id, scope);
      return summaryIn(tx, f, party, scope, today, await trustShows(tx, f));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

/** The summary of a party already found, inside the caller's transaction (part 2 reads it with the statement's lines in
 *  one snapshot: break M4 on #3753). */
export async function summaryIn(tx: Prisma.TransactionClient, f: string, party: Party, scope: MoneyScope, today: string, showTrust: boolean): Promise<Summary> {
      // per invoice from the statement's own lines (ledgerCtes, the INVOICES account: one source for both reads), as
      // FACTS_LATERAL's terms: trust paid is never below zero per invoice (its greatest(…, 0)), and due never below zero
      const inv = await tx.$queryRaw<Row[]>(summarySql(f, party, scope, today, await invoiceIdsOf(tx, f, party, scope, undefined)));
      const held = showTrust ? await tx.$queryRaw<{ caseId: string | null; currency: "CAD" | "USD"; amount: string }[]>`select e.case_id::text as "caseId", e.currency::text as currency, sum(e.amount_minor)::text as amount
        from money_trust_entry e where e.firm_id = ${f}::uuid and ${partyCol(party, "e")} = ${party.id}::uuid and ${seenSql(scope, "e")} group by e.case_id, e.currency` : [];
      const credit = await tx.$queryRaw<{ caseId: string | null; currency: "CAD" | "USD"; amount: string }[]>`select e.case_id::text as "caseId", e.currency::text as currency, sum(e.amount_minor)::text as amount
        from money_credit_entry e where e.firm_id = ${f}::uuid and coalesce(e.person_id, e.company_id) = ${party.id}::uuid and ${partyCol(party, "e")} = ${party.id}::uuid and ${seenSql(scope, "e")} group by e.case_id, e.currency`;   // the coalesce matches money_credit_entry_party_seq (firm, coalesce(person, company), currency, seq), which holds only entries before a case: it serves a scope without cases; otherwise the firm's credit entries are read (review R3-3; within budget in S8)
      // one row per (case, currency) any of the three reads names
      const rows = new Map<string, CaseFigures>(), key = (c: string | null, cur: string) => `${c ?? "-"}|${cur}`;
      const at = (caseId: string | null, currency: "CAD" | "USD") => { const k = key(caseId, currency); let r = rows.get(k); if (!r) { r = { ...zero(currency, showTrust), caseId, caseLabel: null }; rows.set(k, r); } return r; };
      for (const r of inv) Object.assign(at(r.caseId, r.currency), { billedMinor: Number(r.billed), paidMinor: Number(r.paid), paidFromTrustMinor: Number(r.trust), creditedMinor: Number(r.credited),
        writtenOffMinor: Number(r.written), refundedMinor: Number(r.refunded), creditAppliedMinor: Number(r.applied), waitingMinor: Number(r.waiting), owedMinor: Number(r.owed), oldestOverdueDays: r.overdue });
      for (const r of held) at(r.caseId, r.currency).trustMinor = Number(r.amount);
      for (const r of credit) at(r.caseId, r.currency).creditMinor = Number(r.amount);
      const caseIds = [...new Set([...rows.values()].map((r) => r.caseId).filter((x): x is string => !!x))];
      // the case numbers by FO-7q's labelsOf (the one money read of the case table, firm-scoped: CS-W3's allow-list)
      const labels = new Map(caseIds.map((c) => [c, null as string | null])), got = caseIds.length ? await labelsOf(tx, f, caseIds.map((caseId) => ({ personId: null, companyId: null, caseId }))) : [];
      got.forEach((l, i) => labels.set(caseIds[i]!, l.caseLabel));
      const cases = [...rows.values()].map((r) => ({ ...r, caseLabel: r.caseId ? labels.get(r.caseId) ?? null : null }))
        .sort((a, b) => (a.caseId === null ? -1 : b.caseId === null ? 1 : (a.caseLabel ?? a.caseId).localeCompare(b.caseLabel ?? b.caseId)) || a.currency.localeCompare(b.currency));
      const totals = (["CAD", "USD"] as const).flatMap((cur) => { const mine = cases.filter((c) => c.currency === cur); return mine.length ? [mine.map(({ caseId: _c, caseLabel: _l, ...x }) => x).reduce(add, zero(cur, showTrust))] : []; });
      return { party, today, trustShows: showTrust, totals, cases };
}
