// FO-7b part 1b (R1.56, R1.60): an invoice read back from its stored rows, with the facts its status is derived from
// (ports/client-money.ts invoiceStatus: the one derivation, never stored). Paid is the money received on it: payments
// into operating less their refunds, plus trust applied and not returned (the database's money_trust_paid, less what a
// credit note's "Refund to the client" sent back, as the database's own checks count it). Money received into trust
// counts only through its application, so nothing is counted twice. Amounts in two currencies never meet here: every
// row of an invoice is in its currency (FO-7a's checks). Credit applied to the invoice counts as paid and credit kept from
// its payments is no longer waiting extra (FO-7ts part 2's money_invoice_due and money_invoice_credit: review M5 on d6948072e).
import type { Prisma } from "@prisma/client";
import { InvoiceView, invoiceStatus } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";

type Tx = Prisma.TransactionClient;
/** The day (YYYY-MM-DD, UTC) of a clock reading. Sample: the firm's own time zone is not read yet (no source read). */
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export type Facts = { view: InvoiceView; caseId: string | null; issuedOn: string | null; trustPaidMinor: number; openMinor: number };

export async function invoiceFacts(tx: Tx, firmId: string, id: string, today: string): Promise<Facts | null> {
  const inv = await tx.moneyInvoice.findFirst({ where: firmScope(firmId, { id }), include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv) return null;
  const [f] = await tx.$queryRaw<{ total: string; credited: string; written: string; write_offs: string; operating: string; refunded: string; trust: string; applied: string; kept: string; due: string | null; issued: string | null }[]>`
    select money_invoice_total(i.firm_id, i.id)::text as total, to_char(i.due_date, 'YYYY-MM-DD') as due, to_char(i.issued_at at time zone 'UTC', 'YYYY-MM-DD') as issued,
      (select coalesce(sum(c.amount_minor), 0) from money_credit_note c where c.firm_id = i.firm_id and c.invoice_id = i.id)::text as credited,
      (select coalesce(sum(w.amount_minor), 0) from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id)::text as written,
      (select count(*) from money_write_off w where w.firm_id = i.firm_id and w.invoice_id = i.id)::text as write_offs,
      (select coalesce(sum(p.amount_minor), 0) from money_payment p where p.firm_id = i.firm_id and p.invoice_id = i.id and p.received_into = 'OPERATING')::text as operating,
      (select coalesce(sum(r.amount_minor), 0) from money_refund r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id where r.firm_id = i.firm_id and p.invoice_id = i.id)::text as refunded,
      greatest(money_trust_paid(i.firm_id, i.id) - (select coalesce(sum(c.overpaid_minor), 0) from money_credit_note c where c.firm_id = i.firm_id and c.invoice_id = i.id and c.overpaid_choice = 'OVERPAID_REFUND'), 0)::text as trust,
      (-money_invoice_credit(i.firm_id, i.id, 'APPLIED'))::text as applied, money_invoice_credit(i.firm_id, i.id, 'KEPT')::text as kept
    from money_invoice i where i.firm_id = ${inv.firmId}::uuid and i.id = ${inv.id}::uuid`;
  const n = (s: string) => Number(s), totalMinor = n(f.total), creditedMinor = n(f.credited), writtenOffMinor = n(f.written), refundedMinor = n(f.refunded), trustPaidMinor = n(f.trust);
  const paidMinor = n(f.operating) - refundedMinor + trustPaidMinor + n(f.applied), openMinor = totalMinor - creditedMinor - writtenOffMinor;
  const lines = inv.lines.map((x) => ({ id: x.id, position: x.position, kind: x.kind, description: x.description, quantity: x.quantity, unitMinor: x.unitAmountMinor, amountMinor: x.amountMinor, ratePpm: x.taxRatePpm, taxMinor: x.taxMinor, currency: x.currency, sourceFeeRowId: x.sourceFeeRowId }));
  const issued = inv.issuedAt !== null;
  const view = InvoiceView.parse({ id: inv.id, status: issued ? "ISSUED" : "DRAFT", number: inv.number, personId: inv.personId, companyId: inv.companyId, currency: inv.currency, billToProvince: inv.billToProvince, deposit: inv.deposit, lines,
    subtotalMinor: lines.reduce((s, x) => s + x.amountMinor, 0), taxMinor: lines.reduce((s, x) => s + x.taxMinor, 0), totalMinor,
    statusWord: invoiceStatus({ issued, totalMinor, creditedMinor, writtenOffMinor, hasWriteOff: n(f.write_offs) > 0, paidMinor, refundedMinor, dueDate: f.due, today }),
    dueDate: f.due, paidMinor, creditedMinor, writtenOffMinor, dueMinor: issued ? Math.max(0, openMinor - paidMinor) : 0, extraMinor: Math.max(0, paidMinor - openMinor - n(f.kept)) });
  return { view, caseId: inv.caseId, issuedOn: f.issued, trustPaidMinor, openMinor };
}
