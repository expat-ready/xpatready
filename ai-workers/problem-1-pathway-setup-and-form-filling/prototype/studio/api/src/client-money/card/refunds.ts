// FO-7c part 3 (brief design/briefs/FO-7c.md part 3, DW9; AG-6-23 rules 2, 4, 5; P-567 (3)): card refunds through Stripe, on
// the account the payment used. A person asks (`agent/refund:create`, a reason, an amount up to what is refundable, its own
// idempotency key); the money_refund row (route CARD, stripe_refund_id) is written only when Stripe confirms by its event,
// and until then the refund reads "Refund requested".
//   * No Stripe call while a lock or connection is held (as parts 2a and 2b): (1) under the party's trust lock and the
//     invoice row, what is left to refund is read (FO-7b's own `standing` less the refunds already asked of Stripe and not
//     yet settled) and the request is reserved as one audit line, `payment.card_refund_requested`; (2) Stripe is asked, with
//     the request's key; (3) the answer is one more audit line: `payment.card_refund_sent` (Stripe's refund id) or
//     `payment.card_refund_refused` (the reservation released; 409 "Record an offline refund instead").
//   * Stripe's `refund.created` / `refund.updated` (routed by card/payments.ts): the refund is read back from Stripe; when it
//     has succeeded, one money_refund row and `payment.refunded` (route CARD), once; when it failed or was cancelled, one
//     `payment.card_refund_failed` line and the reservation released. Metadata must name this firm and the payment (walls).
// money_refund is insert-only and has no state column: the requested and refused states live in the audit lines (no
// migration). Readings: Unconfirmed: no accountant.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { CardRefundIn, CardRefundView, MONEY_EVENT, RefundEventPayload } from "../../../../ports/client-money.ts";
import { firmScope, withFirm } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { logPort } from "../../platform/observability/log.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import type { Refunds } from "../invoices/refunds.ts";
import { failClosed, invoiceInScope, type ScopeOf } from "../reads/visibility.ts";
import { RailAccountGone, RailRefused, type CardRail, type RailEvent, type RailRefund } from "./rail.ts";

type Tx = Prisma.TransactionClient;
export const REFUND_EVENTS = new Set(["refund.created", "refund.updated"]);
export const OFFLINE_INSTEAD = "Stripe refused this card refund. Record an offline refund instead. Nothing was refunded by card.";
const ACTOR = "system:stripe-connect";
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
type Pay = { id: string; invoiceId: string; amountMinor: number; currency: "CAD" | "USD"; method: string; intentId: string | null; party: string; receiptNumber: string | null };
type Asked = { key: string; amountMinor: number; reason: string; by: string };
export type CardRefundPorts = { rail: CardRail; audit: AuditPort<Tx>; clock: ClockPort; refunds: Pick<Refunds, "standing">; scopeOf?: ScopeOf };

export class CardRefunds {
  constructor(private readonly db: PrismaClient, private readonly p: CardRefundPorts) {}

  /** POST /api/front-office/money/payments/:paymentId/card-refund (agent/refund:create on the route). */
  async request(ctx: StaffContext, paymentId: string, body: unknown): Promise<CardRefundView> {
    const id = UUID.test(paymentId) ? paymentId.toLowerCase() : notFound("payment"), r = parse(CardRefundIn, body), firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const scope = await (this.p.scopeOf ?? failClosed)(ctx);   // read before the transaction (a write never holds two connections)
    // (1) Reserve, under the locks.
    const res = await this.write(async (tx) => {
      const pay = await this.row(tx, firmId, id);
      if (!pay) return notFound("payment");
      await invoiceInScope(tx, firmId, pay.invoiceId, scope, "payment");   // C5 first: out of scope is the same 404
      await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${pay.party}::uuid, ${pay.currency}::"MoneyCurrency")`;
      await tx.$queryRaw`select 1 from money_invoice where firm_id = ${firmId}::uuid and id = ${pay.invoiceId}::uuid for update`;
      const was = await this.asked(tx, firmId, id, r.idempotencyKey);
      if (was) {   // a double click or a retry: the one request, answered again (another request under the key is 409)
        if (was.amountMinor !== r.amountMinor || was.reason !== r.reason) refuse("KEY_USED", "This idempotency key already asked for a different card refund. Nothing was refunded.");
        return { pay, replay: true as const, state: await this.stateOf(tx, firmId, r.idempotencyKey) };
      }
      if (pay.method !== "CARD" || !pay.intentId) refuse("NOT_CARD", "This payment was not made by card: record an offline refund instead. Nothing was refunded.");
      const [t] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${r.reason}, 200) as ok`;
      if (!t.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was refunded.");
      const left = await this.left(tx, firmId, pay);
      if (r.amountMinor > left) refuse("OVER_REFUND", `Only ${pay.currency} ${MONEY(left)} of this card payment is left to refund. Nothing was refunded.`, { leftMinor: left });
      await this.p.audit.record(tx, { firmId, actor: by, action: "payment.card_refund_requested", entity: "money_payment", entityKey: id,
        summary: `Card refund of ${pay.currency} ${MONEY(r.amountMinor)} asked of Stripe for the payment with receipt ${pay.receiptNumber}.`,
        detail: { paymentId: id, invoiceId: pay.invoiceId, key: r.idempotencyKey, amountMinor: r.amountMinor, reason: r.reason }, before: null, after: null });
      return { pay, replay: false as const, state: "REQUESTED" as const };
    });
    if (res.replay) return this.view(firmId, res.pay, r, res.state, true);
    // (2) Ask Stripe, no lock held. (3) Its answer, one line.
    const account = await withFirm(firmId, () => this.db.moneyPaymentAccount.findFirst({ where: firmScope(firmId), select: { stripeAccountId: true } }));
    let sent: { id: string } | null = null, kind = "no account";
    if (account?.stripeAccountId) {
      try { sent = await this.p.rail.refund({ account: account.stripeAccountId, intentId: res.pay.intentId!, amountMinor: r.amountMinor, idempotencyKey: `fo7c-refund-${id}-${r.idempotencyKey}`, metadata: { firm_id: firmId, payment_id: id, refund_key: r.idempotencyKey } }); }
      catch (e) { if (!(e instanceof RailRefused || e instanceof RailAccountGone)) throw e; kind = e instanceof RailAccountGone ? "account gone" : e.kind; }
    }
    await withFirm(firmId, () => this.db.$transaction(async (tx) => {
      await this.p.audit.record(tx, sent
        ? { firmId, actor: by, action: "payment.card_refund_sent", entity: "money_payment", entityKey: id, summary: `Stripe took the card refund request (${res.pay.currency} ${MONEY(r.amountMinor)}); it is booked when Stripe confirms it.`, detail: { paymentId: id, key: r.idempotencyKey, stripeRefundId: sent.id }, before: null, after: null }
        : { firmId, actor: by, action: "payment.card_refund_refused", entity: "money_payment", entityKey: id, summary: `Stripe refused the card refund of ${res.pay.currency} ${MONEY(r.amountMinor)}: record an offline refund instead.`, detail: { paymentId: id, key: r.idempotencyKey, kind }, before: null, after: null });
    }));
    if (!sent) { logPort.warn("card_refund_refused", { paymentId: id, kind }); refuse("CARD_REFUND_REFUSED", OFFLINE_INSTEAD); }
    return this.view(firmId, res.pay, r, "REQUESTED", false);
  }

  /** From the webhook (card/payments.ts), the signature checked and the firm found from the account. */
  async onEvent(firmId: string, ev: RailEvent & { account: string }): Promise<string> {
    if (!ev.objectId?.startsWith("re_")) return "not a refund";
    let rf: RailRefund;
    try { rf = await this.p.rail.readRefund(ev.account, ev.objectId); } catch (e) { if (e instanceof RailAccountGone) return "account gone"; throw e; }
    const paymentId = rf.metadata.payment_id ?? "", key = rf.metadata.refund_key ?? "";
    if (rf.metadata.firm_id !== firmId || !UUID.test(paymentId) || !key) { logPort.info("card_refund_not_this_firm", { eventId: ev.id, refundId: rf.id }); return "not this firm's refund"; }
    return withFirm(firmId, () => this.write(async (tx) => {
      const stored = await tx.webhookReceipt.createMany({ data: [{ service: "stripe-connect", eventId: ev.id, firmId }], skipDuplicates: true });
      if (stored.count === 0) return "duplicate event";
      const pay = await this.row(tx, firmId, paymentId), asked = pay ? await this.asked(tx, firmId, paymentId, key) : null;
      let said: string;
      if (!pay || !asked || pay.intentId !== rf.intentId) said = "no such request: nothing booked";
      else if (await tx.moneyRefund.findFirst({ where: firmScope(firmId, { stripeRefundId: rf.id }), select: { id: true } })) said = "already booked";
      else if (rf.status === "succeeded") {
        await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${pay.party}::uuid, ${pay.currency}::"MoneyCurrency")`;
        await tx.$queryRaw`select 1 from money_invoice where firm_id = ${firmId}::uuid and id = ${pay.invoiceId}::uuid for update`;
        const row = await tx.moneyRefund.create({ data: { firmId, paymentId, amountMinor: rf.amountMinor, currency: pay.currency, reason: asked.reason, route: "CARD", stripeRefundId: rf.id, idempotencyKey: `card:${key}`.slice(0, 200), createdBy: asked.by }, select: { id: true } });
        await this.p.audit.record(tx, { firmId, actor: ACTOR, action: "payment.refunded", entity: "money_refund", entityKey: row.id,
          summary: `${pay.currency} ${MONEY(rf.amountMinor)} refunded by card from the payment with receipt ${pay.receiptNumber} (Stripe confirmed it).`,
          detail: { paymentId, invoiceId: pay.invoiceId, refundId: row.id, amountMinor: rf.amountMinor, fromExtra: false, route: "CARD", key }, before: null,
          after: { amountMinor: rf.amountMinor, currency: pay.currency, method: "CARD", reference: null, refundedOn: this.p.clock.now().toISOString().slice(0, 10), reason: asked.reason, route: "CARD" } });
        await tx.moduleEvent.create({ data: { firmId, type: MONEY_EVENT.PAYMENT_REFUNDED, subjectId: paymentId, payload: RefundEventPayload.parse({ refundId: row.id, paymentId, invoiceId: pay.invoiceId, amountMinor: rf.amountMinor, currency: pay.currency, route: "CARD", fromExtra: false }) } });
        said = "refund booked";
      } else if (rf.status === "failed" || rf.status === "canceled") {
        if (await this.released(tx, firmId, paymentId, key)) said = "already released";
        else {
          await this.p.audit.record(tx, { firmId, actor: ACTOR, action: "payment.card_refund_failed", entity: "money_payment", entityKey: paymentId, summary: `Stripe did not complete the card refund of ${pay.currency} ${MONEY(asked.amountMinor)}: record an offline refund instead.`, detail: { paymentId, key, stripeRefundId: rf.id, status: rf.status }, before: null, after: null });
          said = "refund failed: released";
        }
      } else said = `refund ${rf.status.replace(/[^a-z_]/g, "").slice(0, 20)}: waiting`;
      await tx.webhookReceipt.updateMany({ where: firmScope(firmId, { service: "stripe-connect", eventId: ev.id }), data: { handledAt: this.p.clock.now(), outcome: `${ev.type}: ${said}`.slice(0, 200) } });
      return said;
    }));
  }

  // ------------------------------------------------------------------------------------------------- helpers
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn, { timeout: 30_000 }); } catch (e) {
      if (e instanceof HttpException) throw e;
      const said = /money_[a-z_]+: ([^\n]{1,400})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].trim().replace(/[.\s]+$/, "")}. Nothing was changed.`) : Promise.reject(e);
    }
  }
  private async row(tx: Tx, firmId: string, id: string): Promise<Pay | null> {
    const [p] = await tx.$queryRaw<Pay[]>`select p.id::text as id, p.invoice_id::text as "invoiceId", p.amount_minor as "amountMinor", p.currency::text as currency, p.method::text as method,
        p.stripe_payment_intent_id as "intentId", coalesce(i.person_id, i.company_id)::text as party, r.number as "receiptNumber"
      from money_payment p join money_invoice i on i.firm_id = p.firm_id and i.id = p.invoice_id left join money_receipt r on r.firm_id = p.firm_id and r.payment_id = p.id
      where p.firm_id = ${firmId}::uuid and p.id = ${id}::uuid`;
    return p ?? null;
  }
  /** The request a key reserved on this payment (its audit line), or null. */
  private async asked(tx: Tx, firmId: string, paymentId: string, key: string): Promise<Asked | null> {
    const [a] = await tx.$queryRaw<{ d: Record<string, unknown>; actor: string }[]>`select detail as d, actor from audit_event where firm_id = ${firmId}::uuid and action = 'payment.card_refund_requested' and entity_key = ${paymentId} and detail->>'key' = ${key} order by at limit 1`;
    return a ? { key, amountMinor: Number(a.d.amountMinor), reason: String(a.d.reason), by: a.actor } : null;
  }
  private async released(tx: Tx, firmId: string, paymentId: string, key: string): Promise<boolean> {
    const [r] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from audit_event where firm_id = ${firmId}::uuid and entity_key = ${paymentId} and action in ('payment.card_refund_refused', 'payment.card_refund_failed') and detail->>'key' = ${key}`;
    return r.n > 0n;
  }
  private async stateOf(tx: Tx, firmId: string, key: string): Promise<"REQUESTED" | "REFUNDED"> {
    return (await tx.moneyRefund.findFirst({ where: firmScope(firmId, { idempotencyKey: `card:${key}`.slice(0, 200) }), select: { id: true } })) ? "REFUNDED" : "REQUESTED";
  }
  /** Left to refund: FO-7b's rule (the payment less its refunds and kept credit) less what is asked of Stripe and still open. */
  private async left(tx: Tx, firmId: string, pay: Pay): Promise<number> {
    const s = await this.p.refunds.standing(tx, firmId, pay.id);
    const [o] = await tx.$queryRaw<{ n: string }[]>`select coalesce(sum((q.detail->>'amountMinor')::bigint), 0)::text as n from audit_event q where q.firm_id = ${firmId}::uuid and q.action = 'payment.card_refund_requested' and q.entity_key = ${pay.id}
      and not exists (select 1 from audit_event x where x.firm_id = q.firm_id and x.entity_key = q.entity_key and x.action in ('payment.card_refund_refused', 'payment.card_refund_failed') and x.detail->>'key' = q.detail->>'key')
      and not exists (select 1 from money_refund m where m.firm_id = q.firm_id and m.payment_id = ${pay.id}::uuid and m.idempotency_key = left('card:' || (q.detail->>'key'), 200))`;
    return Math.max(0, (s?.refundableMinor ?? 0) - Number(o.n));
  }
  private async view(firmId: string, pay: Pay, r: { amountMinor: number; reason: string }, state: "REQUESTED" | "REFUNDED", replayed: boolean): Promise<CardRefundView> {
    const left = await withFirm(firmId, () => this.db.$transaction((tx) => this.left(tx, firmId, pay)));
    return CardRefundView.parse({ paymentId: pay.id, amountMinor: r.amountMinor, currency: pay.currency, reason: r.reason, state, stateWord: state === "REFUNDED" ? "Refunded" : "Refund requested", replayed, leftToRefundMinor: left });
  }
}
