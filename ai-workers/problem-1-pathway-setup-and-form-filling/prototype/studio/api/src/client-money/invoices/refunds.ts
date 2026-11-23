// FO-7b part 1c (R1.96, R1.56; briefs/track-b/FO-7b-1c.md; Lead B's FO-7b.md amendment 1 and "refund with a reason and
// its own key (AG-6-23)"; P-603, P-567 (3), P-634 (1)): refunds of a payment recorded into operating, and a person's one
// choice on a payment's waiting extra, "Refund · Keep as credit".
// * OFFLINE refunds only (card refunds are FO-7c part 3). A payment received into trust is refused here: its money goes
//   back from the trust ledger (FO-7t part 2's REFUND_TO_CLIENT; P-603). Never more than the payment less its earlier
//   refunds; the database's refund_ordinal serialises two refunds of one payment at any isolation.
// * The extra is what the payment's own audit line stored under the invoice's lock when it was recorded (part 1b), less
//   what was already kept or refunded from that payment, and never more than the invoice is still paid over. A choice
//   takes exactly all of it, once; a second choice finds nothing waiting (409).
// * One lock order (FO-7lk): the party's trust lock, then the invoice row. Each change is one transaction with one audit
//   line (fail-closed) and its outbox row last. money_refund holds no method or reference: both are in the audit line.
// Readings: refunds and credit Unconfirmed: no accountant; trust Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { ExtraChoiceIn, ExtraChoiceView, MONEY_EVENT, RefundEventPayload, RefundIn, RefundView, type InvoiceView } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { holdsKey } from "../../platform/identity/catalogue.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound, parse } from "./drafts.ts";
import { failClosed, invoiceInScope, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { dayOf, invoiceFacts } from "./facts.ts";

type Tx = Prisma.TransactionClient;
export const REFUND_KEY = "agent/refund:create";
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
const TRUST_WORDS = "Money received into trust is refunded from the trust ledger. Nothing was refunded here.";
type Pay = { id: string; invoiceId: string; amountMinor: number; cleared: boolean; currency: "CAD" | "USD"; receivedInto: "OPERATING" | "TRUST"; method: string; receiptNumber: string | null; personId: string | null; companyId: string | null; caseId: string | null };

export class Refunds {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly scopeOf: ScopeOf = failClosed) {}   // C5 (#3305 M1)

  /** C5: the payment's invoice in the caller's scope, else the same 404 as a missing payment, before anything is written. */
  private async seen(tx: Tx, ctx: StaffContext, p: { invoiceId: string }, scope: MoneyScope) { await invoiceInScope(tx, firmScope(ctx.firmId).firmId, p.invoiceId, scope, "payment"); }

  /** POST /api/front-office/money/payments/:paymentId/refunds (agent/refund:create on the route). */
  async refund(ctx: StaffContext, paymentId: string, body: unknown): Promise<RefundView> {
    const id = UUID.test(paymentId) ? paymentId.toLowerCase() : notFound("payment"), r = parse(RefundIn, body);
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.write(async (tx) => {
      const pre = await this.row(tx, ctx.firmId, id); if (pre) await this.seen(tx, ctx, pre, scope);   // C5 before the locks and any write (review m2)
      const p = await this.lock(tx, ctx.firmId, id);
      const refundedOn = this.day("refundedOn", r.refundedOn);
      const had = await this.replay(tx, ctx.firmId, r.idempotencyKey, { paymentId: id, fromExtra: false, amountMinor: r.amountMinor, reason: r.reason, method: r.method, reference: r.reference ?? null, refundedOn: r.refundedOn ?? null });
      if (had) return this.refundView(tx, ctx.firmId, had, p, true);   // a double click or a retry: the one refund, never a second
      if (p.receivedInto === "TRUST") refuse("TRUST_REFUND", TRUST_WORDS);
      // Reading: AG-6-63 r7 only warns on applying uncleared money; refusing refunds of it is Lead B's reading (ruling on
      // #3036, 12:35 UTC 22 Nov: if the cheque bounces, the refund came out of operating money with nothing behind it; a
      // client who wants an undeposited cheque back gets the paper cheque back). Unconfirmed: no accountant.
      if (!p.cleared) refuse("NOT_CLEARED", "This cheque is not cleared yet: it can be refunded once it clears. Nothing was refunded.");
      const { left, heldAsCredit } = await this.leftToRefund(tx, ctx.firmId, p);
      if (r.amountMinor > left) refuse("OVER_REFUND", `Only ${p.currency} ${MONEY(left)} of this payment is left to refund${heldAsCredit ? ` (${p.currency} ${MONEY(heldAsCredit)} paid on this invoice is held as credit: reverse the kept credit first to refund it)` : ""}. Nothing was refunded.`, { leftMinor: left, heldAsCreditMinor: heldAsCredit });
      const refundId = await this.writeRefund(tx, ctx, p, r.amountMinor, r.reason, r.idempotencyKey, r.method, r.reference ?? null, refundedOn, false);
      return this.refundView(tx, ctx.firmId, refundId, p, false);
    });
  }

  /** FO-7q part 2 (read only: no lock, nothing written): what these two routes would take now for one payment, so
   *  reads/actions.ts offers Refund and Refund · Keep as credit by this file's own rules, never a copy of them. A trust
   *  payment or an uncleared cheque takes nothing (TRUST_REFUND / TRUST_EXTRA, NOT_CLEARED above); `refundableMinor` is
   *  leftToRefund's, `waitingMinor` waiting's (0 where its stored extra is missing, where the route answers 404). Null:
   *  no such payment on an invoice of the firm. */
  async standing(tx: Tx, firm: string, paymentId: string): Promise<{ refundableMinor: number; waitingMinor: number } | null> {
    const p = UUID.test(paymentId) ? await this.row(tx, firm, paymentId.toLowerCase()) : null;
    if (!p) return null;
    if (p.receivedInto === "TRUST" || !p.cleared) return { refundableMinor: 0, waitingMinor: 0 };
    const waiting = (await this.storedExtra(tx, firm, p)) === null ? 0 : await this.waiting(tx, firm, p);
    return { refundableMinor: (await this.leftToRefund(tx, firm, p)).left, waitingMinor: waiting };
  }

  /** POST /api/front-office/money/payments/:paymentId/extra (agent/payment:record on the route; a Refund also needs
   *  agent/refund:create). Exactly the waiting extra, once. */
  async choose(ctx: StaffContext, paymentId: string, body: unknown): Promise<ExtraChoiceView> {
    const id = UUID.test(paymentId) ? paymentId.toLowerCase() : notFound("payment"), c = parse(ExtraChoiceIn, body);
    if (c.choice === "REFUND" && !(await holdsKey(this.db, firmScope(ctx.firmId).firmId, ctx.staffId, REFUND_KEY)))
      problem(403, "Not allowed", "Refunding money needs the refund permission. Nothing was refunded.", { code: "MISSING_PERMISSION", missing: [REFUND_KEY] });
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.write(async (tx) => {
      const pre = await this.row(tx, ctx.firmId, id); if (pre) await this.seen(tx, ctx, pre, scope);   // C5 before the locks and any write (review m2)
      const p = await this.lock(tx, ctx.firmId, id);
      const refundedOn = c.choice === "REFUND" ? this.day("refundedOn", c.refundedOn) : null;
      if (c.choice === "REFUND") {   // the same key again: the one refund of the extra, answered again (never a plain refund's key)
        const had = await this.replay(tx, ctx.firmId, c.idempotencyKey!, { paymentId: id, fromExtra: true, amountMinor: null, reason: c.reason!, method: c.method!, reference: c.reference ?? null, refundedOn: c.refundedOn ?? null });
        if (had) return this.choiceView(tx, ctx.firmId, p, "REFUND", (await tx.moneyRefund.findFirst({ where: firmScope(ctx.firmId, { id: had }) }))!.amountMinor, had, null, true);
      }
      if (p.receivedInto === "TRUST") refuse("TRUST_EXTRA", "Money received into trust stays in the trust ledger: there is no Refund · Keep as credit choice here. Nothing was changed.");
      const waiting = await this.waiting(tx, ctx.firmId, p);
      // Money that has not arrived is neither kept nor paid back. The database refuses KEPT from an uncleared cheque. Reading:
      // AG-6-63 r7 only warns on applying uncleared money; refusing refunds of it is Lead B's reading (as in refund()).
      // Unconfirmed: no accountant.
      if (waiting > 0 && !p.cleared) refuse("NOT_CLEARED", "This cheque is not cleared yet: its extra waits until it clears, then a person chooses Refund or Keep as credit. Nothing was changed.");
      if (waiting <= 0) refuse("NOTHING_WAITING", "Nothing of this payment is waiting for a choice: it was chosen already, or it paid no more than was asked. Nothing was changed.", { waitingMinor: 0 });
      if (c.choice === "REFUND") {
        const refundId = await this.writeRefund(tx, ctx, p, waiting, c.reason!, c.idempotencyKey!, c.method!, c.reference ?? null, refundedOn!, true);
        return this.choiceView(tx, ctx.firmId, p, "REFUND", waiting, refundId, null);
      }
      if (c.reason !== undefined) {
        const [t] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${c.reason}, 200) as ok`;
        if (!t.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was changed.");
      }
      const entry = await tx.moneyCreditEntry.create({ data: { firmId: firmScope(ctx.firmId).firmId, personId: p.personId, companyId: p.companyId, caseId: p.caseId, kind: "KEPT", amountMinor: waiting, currency: p.currency, paymentId: id, createdBy: `staff:${ctx.staffId}` }, select: { id: true } });
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "payment.extra_kept", entity: "money_credit_entry", entityKey: entry.id,
        summary: `${p.currency} ${MONEY(waiting)} paid over invoice kept as credit (receipt ${p.receiptNumber}).`, detail: { paymentId: id, invoiceId: p.invoiceId, creditEntryId: entry.id, amountMinor: waiting },
        before: { waitingMinor: waiting }, after: { waitingMinor: 0, keptMinor: waiting, currency: p.currency, reason: c.reason ?? null } });
      return this.choiceView(tx, ctx.firmId, p, "KEEP_AS_CREDIT", waiting, null, entry.id);
    });
  }

  // ------------------------------------------------------------------------------------------------- helpers
  /** One writing transaction; a rule the database refused (its own words name the rule) is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      const meta = JSON.stringify((e as { meta?: unknown }).meta ?? "");
      if ((e as { code?: string }).code === "P2002" && /refund_ordinal/.test(meta)) refuse("OVER_REFUND", "Another refund of this payment was recorded at the same moment: read it again. Nothing was refunded.");
      if ((e as { code?: string }).code === "P2002" && /idempotency_key/.test(meta)) refuse("KEY_USED", "This idempotency key is already in use. Nothing was refunded.");
      // The database's own words in full: its remedy is often in brackets ("reverse the kept credit first", "this cheque is
      // not cleared yet"), so nothing is cut (review m2 on 5f49018bf).
      const said = /money_[a-z_]+: ([^\n]{1,400})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].trim().replace(/[.\s]+$/, "")}. Nothing was changed.`) : Promise.reject(e);
    }
  }
  /** The payment as both routes read it (on an invoice of the firm), with no lock; null when there is none. */
  private async row(tx: Tx, firm: string, id: string): Promise<Pay | null> {
    const firmId = firmScope(firm).firmId;
    const [p] = await tx.$queryRaw<Pay[]>`select p.id::text as id, p.invoice_id::text as "invoiceId", p.amount_minor as "amountMinor", p.currency::text as currency, p.received_into::text as "receivedInto", p.method::text as method, p.cleared,
        r.number as "receiptNumber", i.person_id::text as "personId", i.company_id::text as "companyId", i.case_id::text as "caseId"
      from money_payment p join money_invoice i on i.firm_id = p.firm_id and i.id = p.invoice_id left join money_receipt r on r.firm_id = p.firm_id and r.payment_id = p.id
      where p.firm_id = ${firmId}::uuid and p.id = ${id}::uuid`;
    return p ?? null;
  }
  /** The payment (on an invoice of the firm), the party's trust lock, then the invoice row (FO-7lk's order). */
  private async lock(tx: Tx, firm: string, id: string): Promise<Pay> {
    const firmId = firmScope(firm).firmId, p = await this.row(tx, firm, id);
    if (!p) return notFound("payment");
    await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${p.personId ?? p.companyId}::uuid, ${p.currency}::"MoneyCurrency")`;
    await tx.$queryRaw`select 1 from money_invoice where firm_id = ${firmId}::uuid and id = ${p.invoiceId}::uuid for update`;
    return p;
  }
  /** A date as sent, never in the future nor before 2000 (the clock's day when none is sent). */
  private day(field: string, d: string | undefined): string {
    const today = dayOf(this.clock.now()), v = d ?? today;
    if (v > today || v < "2000-01-01") badField(field, "The date can't be in the future, or before the year 2000. Nothing was refunded.");
    return v;
  }
  /** The refund an idempotency key already wrote, when the request is the same one again; another request under the same
   *  key (another payment, the other route, another amount, reason, method, reference, or a date that differs from the one sent) is 409 KEY_USED (break F1,
   *  F2; review M1 on 5f49018bf). `amountMinor` null: the choice's amount is the extra, not the request's. */
  private async replay(tx: Tx, firm: string, key: string, want: { paymentId: string; fromExtra: boolean; amountMinor: number | null; reason: string; method: string; reference: string | null; refundedOn: string | null }): Promise<string | null> {
    const had = await tx.moneyRefund.findFirst({ where: firmScope(firm, { idempotencyKey: key }) });
    if (!had) return null;
    const [a] = await tx.$queryRaw<{ d: Record<string, unknown> }[]>`select detail as d from audit_event where firm_id = ${firmScope(firm).firmId}::uuid and action = 'payment.refunded' and entity = 'money_refund' and entity_key = ${had.id}`;
    const same = !!a && had.paymentId === want.paymentId && a.d.fromExtra === want.fromExtra && (want.amountMinor === null || had.amountMinor === want.amountMinor) && had.reason === want.reason
      && a.d.method_after === want.method && (a.d.reference_after ?? null) === want.reference && (want.refundedOn === null || a.d.refundedOn_after === want.refundedOn);   // no date sent: the stored default is not compared (a retry next day is the same request; break R2-4)
    if (!same) refuse("KEY_USED", "This idempotency key already recorded a different refund. Nothing was refunded.");
    return had.id;
  }
  /** What of the payment may still be paid back: the payment less its refunds; and, while credit is kept from the
   *  invoice's payments, no more than the invoice is still paid over beyond that credit (the database's
   *  money_credit_kept_holds: kept credit stays backed; reverse the credit first). */
  private async leftToRefund(tx: Tx, firm: string, p: Pay): Promise<{ left: number; heldAsCredit: number }> {
    const own = p.amountMinor - (await this.refunded(tx, firm, p.id)) - (await this.kept(tx, firm, p.id));   // what was kept from this payment stays backed by it (break R2-1)
    const [k] = await tx.$queryRaw<{ n: string }[]>`select money_invoice_credit(${firmScope(firm).firmId}::uuid, ${p.invoiceId}::uuid, 'KEPT')::text as n`;
    const heldAsCredit = Number(k.n);
    if (heldAsCredit <= 0) return { left: Math.max(0, own), heldAsCredit: 0 };
    const facts = await invoiceFacts(tx, firm, p.invoiceId, dayOf(this.clock.now()));
    return { left: Math.max(0, Math.min(own, facts?.view.extraMinor ?? 0)), heldAsCredit };
  }
  private async kept(tx: Tx, firm: string, paymentId: string): Promise<number> {
    const [k] = await tx.$queryRaw<{ kept: string }[]>`select coalesce(sum(e.amount_minor + coalesce((select sum(r.amount_minor) from money_credit_entry r where r.firm_id = e.firm_id and r.reverses_entry_id = e.id), 0)), 0)::text as kept
      from money_credit_entry e where e.firm_id = ${firmScope(firm).firmId}::uuid and e.kind = 'KEPT' and e.payment_id = ${paymentId}::uuid`;
    return Number(k.kept);
  }
  private async refunded(tx: Tx, firm: string, paymentId: string): Promise<number> {
    const [r] = await tx.$queryRaw<{ n: string }[]>`select coalesce(sum(amount_minor), 0)::text as n from money_refund where firm_id = ${firmScope(firm).firmId}::uuid and payment_id = ${paymentId}::uuid`;
    return Number(r.n);
  }
  /** What of the payment's extra is still waiting: the extra its audit line stored (exactly one line, part 1b), less what
   *  was kept from it or refunded from it, and never more than the invoice is still paid over. */
  private async waiting(tx: Tx, firm: string, p: Pay): Promise<number> {
    const extra = await this.storedExtra(tx, firm, p);
    if (extra === null) return notFound("payment");
    const facts = await invoiceFacts(tx, firm, p.invoiceId, dayOf(this.clock.now()));
    return Math.max(0, Math.min(extra - (await this.kept(tx, firm, p.id)) - (await this.refunded(tx, firm, p.id)), facts?.view.extraMinor ?? 0));
  }
  /** The extra the payment's one audit line stored when it was recorded (part 1b); null when there is not exactly one. */
  private async storedExtra(tx: Tx, firm: string, p: Pay): Promise<number | null> {
    const firmId = firmScope(firm).firmId;
    const lines = await tx.$queryRaw<{ extra: unknown }[]>`select detail->'extraMinor' as extra from audit_event where firm_id = ${firmId}::uuid and action = 'payment.recorded' and entity = 'money_payment'
      and entity_key = ${p.id} and detail->>'paymentId' = ${p.id} and detail->>'receiptNumber' = ${p.receiptNumber}`;
    return lines.length === 1 && Number.isSafeInteger(lines[0].extra) && (lines[0].extra as number) >= 0 ? lines[0].extra as number : null;
  }
  private async writeRefund(tx: Tx, ctx: StaffContext, p: Pay, amount: number, reason: string, key: string, method: string, reference: string | null, refundedOn: string, fromExtra: boolean): Promise<string> {
    const [text] = await tx.$queryRaw<{ ok: boolean; ref: boolean }[]>`select money_text_ok(${reason}, 200) as ok, ${reference}::text is null or money_text_ok(${reference}, 200) as ref`;
    if (!text.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was refunded.");
    if (!text.ref) badField("reference", "The reference needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was refunded.");
    const firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const row = await tx.moneyRefund.create({ data: { firmId, paymentId: p.id, amountMinor: amount, currency: p.currency, reason, route: "OFFLINE", idempotencyKey: key, createdBy: by }, select: { id: true } });
    await this.audit.record(tx, { firmId: ctx.firmId, actor: by, action: "payment.refunded", entity: "money_refund", entityKey: row.id,
      summary: `${p.currency} ${MONEY(amount)} refunded${fromExtra ? " (money paid over the invoice)" : ""} from the payment with receipt ${p.receiptNumber}.`,
      detail: { paymentId: p.id, invoiceId: p.invoiceId, refundId: row.id, amountMinor: amount, fromExtra, route: "OFFLINE" },
      before: null, after: { amountMinor: amount, currency: p.currency, method, reference, refundedOn, reason, route: "OFFLINE" } });
    await tx.moduleEvent.create({ data: { firmId, type: MONEY_EVENT.PAYMENT_REFUNDED, subjectId: p.id, payload: RefundEventPayload.parse({ refundId: row.id, paymentId: p.id, invoiceId: p.invoiceId, amountMinor: amount, currency: p.currency, route: "OFFLINE", fromExtra }) } });
    return row.id;
  }
  private async invoice(tx: Tx, firm: string, invoiceId: string): Promise<InvoiceView> { return (await invoiceFacts(tx, firm, invoiceId, dayOf(this.clock.now())))?.view ?? notFound("invoice"); }
  private async refundView(tx: Tx, firm: string, refundId: string, p: Pay, replayed: boolean): Promise<RefundView> {
    const r = (await tx.moneyRefund.findFirst({ where: firmScope(firm, { id: refundId }) }))!;
    return RefundView.parse({ id: r.id, paymentId: r.paymentId, amountMinor: r.amountMinor, currency: r.currency, route: "OFFLINE", reason: r.reason, replayed,
      leftToRefundMinor: (await this.leftToRefund(tx, firm, p)).left, invoice: await this.invoice(tx, firm, p.invoiceId) });
  }
  private async choiceView(tx: Tx, firm: string, p: Pay, choice: "REFUND" | "KEEP_AS_CREDIT", amount: number, refundId: string | null, creditEntryId: string | null, replayed = false): Promise<ExtraChoiceView> {
    return ExtraChoiceView.parse({ paymentId: p.id, choice, amountMinor: amount, currency: p.currency, refundId, creditEntryId, waitingMinor: await this.waiting(tx, firm, p), replayed, invoice: await this.invoice(tx, firm, p.invoiceId) });
  }
}
