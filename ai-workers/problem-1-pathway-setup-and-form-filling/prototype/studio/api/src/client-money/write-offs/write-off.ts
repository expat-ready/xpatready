// R1.96 part 1 (design/briefs/R1.96-shape.md; BACKLOG FO-7r "write off a small balance"; AG-6-76; P-634): write off what
// is still due on one issued invoice, with a reason, by a person holding agent/invoice:void (the route's key).
// * Only an issued invoice (a draft is edited or deleted, never written off); at most one write-off per invoice (the
//   database's unique index); the amount is what is still due, never what trust paid (FO-7a2's money_write_off_write
//   refuses that too) and never a typed amount: "no automatic threshold", and nothing is left to write off afterwards.
// * After it: the invoice reads "Written off" (ports/client-money.ts invoiceStatus), a credit note is refused "Already
//   settled by write-off" (invoices/money.ts), and a later payment counts as extra money (facts.ts).
// * One transaction, the FO-7lk lock order (the party's trust lock, then the invoice row), one audit line
//   `invoice.written_off` (fail-closed), the event `invoice.written_off` (MONEY_EVENT), then the ledger check on that invoice and its party: anything unbalanced rolls
//   the whole write back (409 UNBALANCED), so the ledger is balanced after each write-off.
// * C5: an invoice outside the caller's scope is the same 404, read before any lock or write (as InvoiceMoney).
// Legal and accounting reading: Unconfirmed: no counsel; no accountant.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { InvoiceEventPayload, InvoiceView, MONEY_EVENT, WriteOffIn } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { liveParty } from "../live-party.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import { dayOf, invoiceFacts } from "../invoices/facts.ts";
import { failClosed, invoiceInScope, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { ledgerCheck } from "../ledger-check.ts";

type Tx = Prisma.TransactionClient;
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
export const WriteOffView = z.strictObject({ id: z.string(), invoiceId: z.string(), amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]), reason: z.string(), createdBy: z.string(), invoice: InvoiceView });
export type WriteOffView = z.infer<typeof WriteOffView>;

export class WriteOffs {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly scopeOf: ScopeOf = failClosed) {}

  /** POST /api/front-office/money/invoices/:id/write-off { reason } → 201 the write-off and the invoice after it. */
  async writeOff(ctx: StaffContext, invoiceId: string, body: unknown): Promise<WriteOffView> {
    const id = UUID.test(invoiceId) ? invoiceId.toLowerCase() : notFound("invoice");
    const w = parse(WriteOffIn, body), today = dayOf(this.clock.now()), firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const scope = await this.scopeOf(ctx);   // before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.write(async (tx) => {
      await invoiceInScope(tx, firmId, id, scope);
      const inv = await this.lock(tx, firmId, id, scope);
      if (!inv.issued) refuse("DRAFT", "A draft cannot be written off: edit or delete it instead. Nothing was saved.");
      const before = (await invoiceFacts(tx, firmId, id, today)) ?? notFound("invoice");
      if (before.view.statusWord === "Written off") refuse("ALREADY_WRITTEN_OFF", `${inv.number} is already written off. Nothing was saved.`);
      const amount = before.view.dueMinor;
      if (amount <= 0) refuse("NOTHING_DUE", `Nothing is due on ${inv.number}, so there is nothing to write off. Nothing was saved.`);
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${w.reason}, 200) as ok`;
      if (!text.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
      const row = await tx.moneyWriteOff.create({ data: { firmId, invoiceId: id, amountMinor: amount, currency: inv.currency, reason: w.reason, createdBy: by }, select: { id: true } });
      const after = (await invoiceFacts(tx, firmId, id, today)) ?? notFound("invoice");
      await this.audit.record(tx, { firmId, actor: by, action: "invoice.written_off", entity: "money_write_off", entityKey: row.id,
        summary: `${inv.number} written off: ${inv.currency} ${MONEY(amount)}.`, detail: { invoiceId: id, writeOffId: row.id, amountMinor: amount },
        before: { dueMinor: before.view.dueMinor, statusWord: before.view.statusWord }, after: { dueMinor: after.view.dueMinor, statusWord: after.view.statusWord, reason: w.reason } });
      const v = after.view;   // the event, last (contracts §0.5): ids and the stored figures, as InvoiceMoney's invoice events
      await tx.moduleEvent.create({ data: { firmId, type: MONEY_EVENT.INVOICE_WRITTEN_OFF, subjectId: id, payload: InvoiceEventPayload.parse({ invoiceId: id, number: v.number, personId: v.personId, companyId: v.companyId, caseId: after.caseId,
        currency: v.currency, subtotalMinor: v.subtotalMinor, taxMinor: v.taxMinor, totalMinor: v.totalMinor, dueDate: v.dueDate }) } });
      const check = await ledgerCheck(tx, firmId, id);
      if (!check.balanced) refuse("UNBALANCED", "The ledger would not balance after this write-off. Nothing was saved.", { problems: check.problems });
      return WriteOffView.parse({ id: row.id, invoiceId: id, amountMinor: amount, currency: inv.currency, reason: w.reason, createdBy: by, invoice: after.view });
    });
  }

  /** One writing transaction; a rule the database refused in its own words is a 409, never a 500 (as InvoiceMoney). */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: string }).code === "P2002") refuse("ALREADY_WRITTEN_OFF", "This invoice is already written off. Nothing was saved.");   // two at once: the unique index keeps one
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
  /** The party's trust lock first, then the invoice row (FO-7lk's one order, as InvoiceMoney.lock). */
  private async lock(tx: Tx, firmId: string, id: string, scope: MoneyScope) {
    const [p] = await tx.$queryRaw<{ party: string; currency: string }[]>`select coalesce(person_id, company_id)::text as party, currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid`;
    if (!p) return notFound("invoice");
    await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${p.party}::uuid, ${p.currency}::"MoneyCurrency")`;
    await liveParty(tx, firmId, p.party, scope);   // FO-9b part 2m (review m4 on #3702): never a write-off on a merged-away client, under its lock
    const [inv] = await tx.$queryRaw<{ issued: boolean; number: string | null; currency: "CAD" | "USD" }[]>`select issued_at is not null as issued, number, currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
    return inv ?? notFound("invoice");
  }
}
