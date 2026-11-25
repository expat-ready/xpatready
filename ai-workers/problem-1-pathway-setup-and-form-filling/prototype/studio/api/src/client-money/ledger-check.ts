// R1.96 part 1 ("the ledger stays balanced each time"; design/briefs/R1.96-shape.md): one read-only check of a firm's
// client-money ledgers, from the stored rows alone (never facts.ts's derived figures, so it checks them rather than
// repeating them). Each rule names what it found; an empty list is balanced. Per currency, never summed across two.
//   L1 trust: each entry's balance_after_minor is the running sum of its party's entries in that currency, in seq order.
//   L2 credit: the same per holder (the case, else the party), and never below zero.
//   L3 invoice: credit notes + write-off never exceed the invoice's total; neither on a draft (one write-off per
//      invoice is the database's unique index, so not repeated here).
//   L4 refunds: the refunds of one payment never exceed it.
//   L5 trust paid: what trust paid on an invoice (less what a credit note's "Refund to the client" sent back, as the
//      database's money_invoice_due and money_write_off_write count it) never exceeds what is left on it after credit
//      notes and write-off.
//   L6 currency: every credit note, write-off and payment of an invoice is in the invoice's currency.
// The approved definition (Lead 4 on #3631): per invoice total = credited + written off + paid + due − extra, each term
// ≥ 0 (L3, L4, L5 bound the stored terms; due and extra are derived from them, facts.ts); per holder and currency each
// ledger's last balance is the sum of its entries (L1, L2). Trust may be below zero (a reversal, P-634): L1 checks the
// sum, not the sign. L2 sums a credit holder (a case) over all its payers, then keeps the holders the party touches. Optional `invoiceId` narrows L3-L6 to one
// invoice and L1-L2 to its party. Firm-scoped in every query (PF-12); reads only.
import type { Prisma, PrismaClient } from "@prisma/client";
import { firmScope } from "../platform/firm-scope.ts";

type Reader = Prisma.TransactionClient | PrismaClient;
export type LedgerCheck = { balanced: boolean; problems: string[] };

export async function ledgerCheck(db: Reader, firm: string, invoiceId?: string): Promise<LedgerCheck> {
  const f = firmScope(firm).firmId, inv = invoiceId ?? null;
  const party = inv === null ? null : ((await db.$queryRaw<{ p: string | null }[]>`select coalesce(person_id, company_id)::text as p from money_invoice where firm_id = ${f}::uuid and id = ${inv}::uuid`)[0]?.p ?? null);
  const rows = await db.$queryRaw<{ problem: string }[]>`
    with t as (select id, seq, balance_after_minor as b, sum(amount_minor) over (partition by coalesce(person_id, company_id), currency order by seq) as s
               from money_trust_entry where firm_id = ${f}::uuid and (${party}::uuid is null or person_id = ${party}::uuid or company_id = ${party}::uuid)),
         ch as (select id, currency, seq, amount_minor, balance_after_minor, coalesce(case_id::text, 'party:' || coalesce(person_id, company_id)::text) as holder
               from money_credit_entry where firm_id = ${f}::uuid),
         c as (select id, balance_after_minor as b, sum(amount_minor) over (partition by holder, currency order by seq) as s
               from ch where ${party}::uuid is null or holder in (select x.holder from ch x join money_credit_entry y on y.firm_id = ${f}::uuid and y.id = x.id
                 where y.person_id = ${party}::uuid or y.company_id = ${party}::uuid)),
         i as (select i.id, i.number, i.currency, i.issued_at, money_invoice_total(i.firm_id, i.id) as total,
                 (select coalesce(sum(amount_minor), 0) from money_credit_note n where n.firm_id = i.firm_id and n.invoice_id = i.id) as credited,
                 (select coalesce(sum(amount_minor), 0) from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id) as written,
                                  greatest(money_trust_paid(i.firm_id, i.id) - (select coalesce(sum(n.overpaid_minor), 0) from money_credit_note n where n.firm_id = i.firm_id and n.invoice_id = i.id and n.overpaid_choice = 'OVERPAID_REFUND'), 0) as trust
               from money_invoice i where i.firm_id = ${f}::uuid and (${inv}::uuid is null or i.id = ${inv}::uuid))
    select 'L1 trust entry ' || id || ': balance ' || b || ' is not the running sum ' || s as problem from t where b <> s
    union all select 'L2 credit entry ' || id || ': balance ' || b || ' is not the running sum ' || s || ' or is below zero' from c where b <> s or b < 0
    union all select 'L3 invoice ' || coalesce(number, id::text) || ': credited ' || credited || ' + written off ' || written || ' is more than its total ' || total from i where credited + written > total
    union all select 'L3 invoice ' || id || ': a draft has a credit note or a write-off' from i where issued_at is null and credited + written > 0
    union all select 'L4 payment ' || p.id || ': refunds ' || sum(r.amount_minor) || ' are more than its ' || p.amount_minor
      from money_payment p join money_refund r on r.firm_id = p.firm_id and r.payment_id = p.id
      where p.firm_id = ${f}::uuid and (${inv}::uuid is null or p.invoice_id = ${inv}::uuid) group by p.id, p.amount_minor having sum(r.amount_minor) > p.amount_minor
    union all select 'L5 invoice ' || coalesce(number, id::text) || ': trust paid ' || trust || ' is more than is left after credit notes and write-off (' || (total - credited - written) || ')' from i where trust > total - credited - written
    union all select 'L6 invoice ' || coalesce(i.number, i.id::text) || ': a credit note, write-off or payment in another currency' from i
      where exists (select 1 from money_credit_note n where n.firm_id = ${f}::uuid and n.invoice_id = i.id and n.currency <> i.currency)
         or exists (select 1 from money_write_off w where w.firm_id = ${f}::uuid and w.invoice_id = i.id and w.currency <> i.currency)
         or exists (select 1 from money_payment p where p.firm_id = ${f}::uuid and p.invoice_id = i.id and p.currency <> i.currency)
    order by 1`;
  const problems = rows.map((r) => r.problem);
  return { balanced: problems.length === 0, problems };
}
