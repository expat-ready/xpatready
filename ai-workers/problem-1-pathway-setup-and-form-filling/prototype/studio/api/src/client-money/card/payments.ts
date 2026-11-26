// FO-7c part 2b (R1.57; brief design/briefs/FO-7c.md part 2, shaped in product/screens/FO-7c/shape-r1.57.md and approved by
// Lead 4 on #3633, decisions (2) and (3); AG-6-14 r10, AG-6-16 r5, AG-6-17; P-567 (3)): a card payment is booked by Stripe's
// word, never by the client's return to the page.
//   * `payment_intent.succeeded` on the connected-accounts webhook (card/account.ts routes it here, signature checked and
//     the firm found from the account first): the intent is read back from the processor (the event's body is not
//     trusted), outside any transaction; its metadata must name this firm and one of its invoices (DW4, a firm's event
//     never pays another firm's invoice). Then, in one transaction as the firm: the event stored once in `webhook_receipt`,
//     and FO-7b's `recordCard` books one CARD payment into OPERATING with its receipt (the same intent twice → one payment).
//   * `payment_intent.payment_failed`: the invoice is unchanged; one audit line on the invoice with the processor's message
//     (the reason the client and the firm read) and its decline code, and the `payment.failed` event. No column, no
//     migration (decision (3)).
//   * The poll (AG-6-16 r5): hourly (Sample), per firm with an ACTIVE account, the account's succeeded intents of the last
//     72 hours (Sample) with no payment yet are booked through the same path; run twice, still once.
// No Stripe call runs while a database lock or connection is held (as part 2a). Legal reading: Unconfirmed: no counsel.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { MONEY_EVENT, PaymentFailedPayload } from "../../../../ports/client-money.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import { firmScope, withFirm } from "../../platform/firm-scope.ts";
import { logPort } from "../../platform/observability/log.ts";
import { UUID } from "../invoices/drafts.ts";
import { codeWord, RailAccountGone, type CardRail, type RailEvent, type RailIntent } from "./rail.ts";

type Tx = Prisma.TransactionClient;
export const PAYMENT_EVENTS = new Set(["payment_intent.succeeded", "payment_intent.payment_failed"]);
export const POLL_QUEUE = "client_money.card_poll", POLL_CRON = "17 * * * *", POLL_WINDOW_MS = 72 * 3600_000;   // Sample: hourly, 72 hours
const RECEIPT_SERVICE = "stripe-connect", ACTOR = "system:stripe-connect";

/** FO-7b's card booking (invoices/money.ts InvoiceMoney.recordCard / afterCard). */
export interface CardRecorder {
  recordCard(tx: Tx, firmId: string, invoiceId: string, c: { intentId: string; amountMinor: number; currency: "CAD" | "USD" }): Promise<{ paymentId: string; replayed: boolean }>;
  afterCard(firmId: string, paymentId: string): Promise<unknown>;
}
export type CardPaymentPorts = { rail: CardRail; audit: AuditPort<Tx>; clock: ClockPort; recorder: CardRecorder };

/** The reason a declined card shows (the processor's message to the payer), kept short and on one line. */
export const reasonOf = (i: Pick<RailIntent, "lastError">) => (i.lastError?.message ?? "The card payment did not go through.").replace(/\s+/g, " ").trim().slice(0, 200);

export class CardPayments {
  constructor(private readonly db: PrismaClient, private readonly p: CardPaymentPorts) {}

  /** From the webhook, the signature checked and the firm found from the account (card/account.ts). */
  async onEvent(firmId: string, ev: RailEvent & { account: string }): Promise<{ received: true }> {
    if (!ev.objectId?.startsWith("pi_")) return { received: true };
    let intent: RailIntent;
    try { intent = await this.p.rail.readPaymentIntent(ev.account, ev.objectId); } catch (e) {
      if (e instanceof RailAccountGone) { logPort.info("card_payment_event_account_gone", { eventId: ev.id }); return { received: true }; }
      throw e;   // the processor did not answer: 500, and Stripe sends the event again
    }
    await this.book(firmId, intent, ev);
    return { received: true };
  }

  /** One intent, as the firm: stored once per event (when there is one), then booked or its failure recorded. */
  async book(firmId: string, intent: RailIntent, ev: Pick<RailEvent, "id" | "type"> | null): Promise<string> {
    const invoiceId = intent.metadata.invoice_id ?? "";
    // DW4: the metadata must name this firm; the invoice is then read as this firm only (PF-12's walls).
    if (intent.metadata.firm_id !== firmId || !UUID.test(invoiceId)) { logPort.info("card_payment_not_this_firm", { eventId: ev?.id ?? null, intentId: intent.id }); return "not this firm's invoice: nothing booked"; }
    const after: (() => Promise<unknown>)[] = [];
    const outcome = await withFirm(firmId, () => this.db.$transaction(async (tx) => {
      if (ev) {
        const stored = await tx.webhookReceipt.createMany({ data: [{ service: RECEIPT_SERVICE, eventId: ev.id, firmId }], skipDuplicates: true });
        if (stored.count === 0) return "duplicate event";
      }
      const said = await this.apply(tx, firmId, invoiceId, intent, ev, after);
      if (ev) await tx.webhookReceipt.updateMany({ where: firmScope(firmId, { service: RECEIPT_SERVICE, eventId: ev.id }), data: { handledAt: this.p.clock.now(), outcome: `${ev.type}: ${said}`.slice(0, 200) } });
      return said;
    }, { timeout: 30_000 }));
    for (const a of after) await a();   // the receipt email, only once the payment is saved
    return outcome;
  }

  private async apply(tx: Tx, firmId: string, invoiceId: string, intent: RailIntent, ev: Pick<RailEvent, "type"> | null, after: (() => Promise<unknown>)[]): Promise<string> {
    if (intent.status === "succeeded") {
      try {
        const r = await this.p.recorder.recordCard(tx, firmId, invoiceId, { intentId: intent.id, amountMinor: intent.amountMinor, currency: intent.currency });
        if (!r.replayed) after.push(() => this.p.recorder.afterCard(firmId, r.paymentId));
        return r.replayed ? "already booked" : "booked";
      } catch (e) {
        // Another firm's or an unknown invoice id is the one 404 under the walls: nothing booked (DW4), logged by id only.
        if ((e as { status?: number }).status === 404 || (e as { getStatus?: () => number }).getStatus?.() === 404) { logPort.info("card_payment_invoice_unknown", { intentId: intent.id }); return "unknown invoice: nothing booked"; }
        throw e;
      }
    }
    if (ev?.type === "payment_intent.payment_failed" && intent.status !== "succeeded" && intent.lastError) {
      const inv = await tx.moneyInvoice.findFirst({ where: firmScope(firmId, { id: invoiceId.toLowerCase() }), select: { id: true, number: true } });
      if (!inv) return "unknown invoice: nothing recorded";
      const code = codeWord(intent.lastError.code), reason = reasonOf(intent);
      await this.p.audit.record(tx, { firmId, actor: ACTOR, action: "payment.card_failed", entity: "money_invoice", entityKey: inv.id,
        summary: `A card payment on ${inv.number} did not go through: ${reason}`, detail: { invoiceId: inv.id, intentId: intent.id, amountMinor: intent.amountMinor, currency: intent.currency, code, reason }, before: null, after: null });
      await tx.moduleEvent.create({ data: { firmId, type: MONEY_EVENT.PAYMENT_FAILED, subjectId: inv.id, payload: PaymentFailedPayload.parse({ externalId: intent.id, invoiceId: inv.id, amountMinor: intent.amountMinor, currency: intent.currency, code }) } });
      return "card declined: invoice unchanged";
    }
    return `intent ${codeWord(intent.status)}: nothing to do`;
  }

  /** The poll: every firm with an ACTIVE account, its succeeded intents of the window with no payment yet. */
  async poll(): Promise<{ firms: number; booked: number }> {
    const out = { firms: 0, booked: 0 }, since = new Date(this.p.clock.now().getTime() - POLL_WINDOW_MS);
    for (const f of await this.db.platformFirm.findMany({ select: { id: true }, orderBy: { id: "asc" } })) {
      const account = await withFirm(f.id, () => this.db.moneyPaymentAccount.findFirst({ where: firmScope(f.id, { status: "ACTIVE" as const, chargesEnabled: true }), select: { stripeAccountId: true } }));
      if (!account?.stripeAccountId) continue;
      out.firms++;
      try {
        for (const i of await this.p.rail.listSucceededIntents(account.stripeAccountId, since)) {
          if (i.metadata.firm_id !== f.id || !UUID.test(i.metadata.invoice_id ?? "")) continue;
          const known = await withFirm(f.id, () => this.db.moneyPayment.findFirst({ where: firmScope(f.id, { stripePaymentIntentId: i.id }), select: { id: true } }));
          if (!known && (await this.book(f.id, i, null)) === "booked") out.booked++;
        }
      } catch (e) { logPort.warn("card_poll_failed", { firmId: f.id, kind: e instanceof RailAccountGone ? "account gone" : e instanceof Error ? e.constructor.name : "unknown" }); }
    }
    if (out.booked) logPort.info("card_poll_booked", out);
    return out;
  }

  /** Registers the poll on PF-14's runner (before it starts). */
  async register(jobs: JobPort) {
    await jobs.handle(POLL_QUEUE, async () => { await this.poll(); });
    await jobs.recurring(POLL_QUEUE, POLL_CRON, "UTC");
  }
}
