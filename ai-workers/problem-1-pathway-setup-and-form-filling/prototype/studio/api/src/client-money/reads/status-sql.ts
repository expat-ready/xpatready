// FO-7q (R1.56; brief design/briefs/FO-7q.md): the derived status in SQL, the twin of ports/client-money.ts invoiceStatus
// (AG-6-1 rule 7: never stored). The facts are invoices/facts.ts's, column for column, so a status filter over 10,000
// invoices runs in the database and never in a loop here (AG-6-30 rule 4). tests/check_fo7q_reads.ts DW3 proves the two
// agree on every status word. Amounts never meet across currencies: every row of an invoice is in its own currency.
import { Prisma } from "@prisma/client";
import type { StatusWord } from "../../../../ports/client-money.ts";

/** The status words as query codes (the list's `status` filter), in FO-7b's order. */
export const STATUS_CODES = { DRAFT: "Draft", OPEN: "Open", PART_PAID: "Part paid", PAID: "Paid", OVERDUE: "Overdue", CREDITED: "Credited", REFUNDED: "Refunded", WRITTEN_OFF: "Written off" } as const satisfies Record<string, StatusWord>;
export type StatusCode = keyof typeof STATUS_CODES;

/** The per-invoice facts of `money_invoice i` (as facts.ts reads them), for a lateral join: `f.total`, `f.credited`,
 *  `f.written`, `f.write_offs`, `f.operating`, `f.refunded`, `f.trust`, `f.applied`, `f.kept`, all bigint minor units. */
export const FACTS_LATERAL = Prisma.sql`lateral (select
    money_invoice_total(i.firm_id, i.id)::bigint as total,
    (select coalesce(sum(c.amount_minor), 0) from money_credit_note c where c.firm_id = i.firm_id and c.invoice_id = i.id)::bigint as credited,
    (select coalesce(sum(w.amount_minor), 0) from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id)::bigint as written,
    (select count(*) from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id)::bigint as write_offs,
    (select coalesce(sum(p.amount_minor), 0) from money_payment p where p.firm_id = i.firm_id and p.invoice_id = i.id and p.received_into = 'OPERATING')::bigint as operating,
    (select coalesce(sum(r.amount_minor), 0) from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id where r.firm_id = i.firm_id and p.invoice_id = i.id)::bigint as refunded,
    greatest(money_trust_paid(i.firm_id, i.id) - (select coalesce(sum(c.overpaid_minor), 0) from money_credit_note c where c.firm_id = i.firm_id and c.invoice_id = i.id and c.overpaid_choice = 'OVERPAID_REFUND'), 0)::bigint as trust,
    (-money_invoice_credit(i.firm_id, i.id, 'APPLIED'))::bigint as applied,
    money_invoice_credit(i.firm_id, i.id, 'KEPT')::bigint as kept) f`;

/** Paid, as facts.ts: operating less refunds, plus trust applied and not returned, plus credit applied. */
const PAID = Prisma.sql`(f.operating - f.refunded + f.trust + f.applied)`;

/** The status word of `i` with `f` (FACTS_LATERAL) on `today` (YYYY-MM-DD), in invoiceStatus's order. */
export const statusSql = (today: string) => Prisma.sql`case
    when i.issued_at is null then 'Draft'
    when f.write_offs > 0 then 'Written off'
    when f.credited > 0 and f.credited >= f.total then 'Credited'
    when f.refunded > 0 and ${PAID} <= 0 then 'Refunded'
    when f.total - f.credited - f.written - ${PAID} <= 0 then 'Paid'
    when i.due_date is not null and ${today}::date > i.due_date then 'Overdue'
    when ${PAID} > 0 then 'Part paid'
    else 'Open' end`;

/** Still due on an issued invoice (never below zero), as facts.ts's dueMinor. */
export const DUE_SQL = Prisma.sql`case when i.issued_at is null then 0 else greatest(0, f.total - f.credited - f.written - ${PAID}) end`;
export const PAID_SQL = PAID;
