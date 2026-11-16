// PF-5 part 2 (contracts §0.4, §7 §1.1; SA-4-11, -20, -21, -22, -25, -79; SA-3-46): Stripe's events and the moves they make.
//   * receive: the signature first (400 without it, nothing stored), then the event stored once in webhook_receipt by
//     Stripe's own id (a repeat is answered 200 and ignored), then the answer; handling runs after it, so the request never
//     calls Stripe back (contracts §0.4). A receipt whose handling did not finish is read again by the sweep job.
//   * handling reads the subscription as Stripe has it now, under a per-subscription lock, so events that arrive out of
//     order or twice converge on Stripe's state (paid-before-created ends Active either way).
//   * the moves: Stripe's status → ours (§7), refused moves kept and audited; the trial end and period end stored as Stripe
//     has them; the hold ends only on a paid invoice (Stripe also activates on "uncollectible", step 0 fact 2); an invoice
//     waiting for an address under Stripe Tax holds the firm ("business address needed") and a draft is kept from
//     finalizing (Lead B, step 0 fact 3: never invoiced untaxed). Each change, its audit line and its event (written last)
//     in one transaction.
import { HttpException } from "@nestjs/common";
import type { PlatformFirmStatus, PlatformSubscriptionStatus, Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { BillingSignatureError, type BillingEvent, type BillingPort, type BillingSubscription } from "../../../../ports/billing.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { EVENT } from "../../../../ports/events.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import { firmScope } from "../firm-scope.ts";

type Tx = Prisma.TransactionClient;
export type BillingPorts = { audit: AuditPort<Tx>; billing: BillingPort; clock: ClockPort; jobs?: JobPort | null; appUrl: string; notReady?: string | null };
export const SWEEP_JOB = "platform.billing.webhook_sweep";
export const ADDRESS_NEEDED = "business address needed";
const ACTOR = "system:billing";
const problem = (status: number, code: string, title: string, detail: string) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code }, status);

/** Stripe's status → ours (contracts §7). `incomplete` changes nothing (a Checkout not finished). */
const SUB_OF: Partial<Record<BillingSubscription["status"], PlatformSubscriptionStatus>> = {
  trialing: "TRIAL", active: "ACTIVE", past_due: "OVERDUE", unpaid: "PAYMENT_HOLD", paused: "PAYMENT_HOLD", canceled: "ENDED",
};
/** The moves allowed (contracts §7, SA-4-11): ENDED is final; a hold leaves only to Active (paid) or Ended. */
export const SUB_MOVES: Record<PlatformSubscriptionStatus, PlatformSubscriptionStatus[]> = {
  TRIAL: ["ACTIVE", "OVERDUE", "PAYMENT_HOLD", "ENDED"], ACTIVE: ["OVERDUE", "PAYMENT_HOLD", "ENDED"], OVERDUE: ["ACTIVE", "PAYMENT_HOLD", "ENDED"],
  PAYMENT_HOLD: ["ACTIVE", "ENDED"], ENDED: [],
};
/** The firm a subscription status gives: overdue is an indicator (the firm stays Active); an ended subscription leaves the
 *  firm on hold, where the 90-day clock runs (contracts §7 "Firm exit"; the clock and the close are part 3). */
const FIRM_OF: Record<PlatformSubscriptionStatus, PlatformFirmStatus> = { TRIAL: "TRIAL", ACTIVE: "ACTIVE", OVERDUE: "ACTIVE", PAYMENT_HOLD: "PAYMENT_HOLD", ENDED: "PAYMENT_HOLD" };
/** Billing moves a firm only between these; a security lock, an abandoned or a deleted firm is never moved by Stripe. */
export const FIRM_MOVES: Record<PlatformFirmStatus, PlatformFirmStatus[]> = {
  PROVISIONING: ["TRIAL", "ACTIVE", "PAYMENT_HOLD"], TRIAL: ["ACTIVE", "PAYMENT_HOLD"], ACTIVE: ["PAYMENT_HOLD"], PAYMENT_HOLD: ["ACTIVE"],
  SECURITY_LOCK: [], ABANDONED: [], DELETED: [],
};
export const canMove = <S extends string>(table: Record<S, S[]>, from: S, to: S) => from === to || table[from].includes(to);

export class BillingEvents {
  constructor(private readonly db: PrismaClient, private readonly ports: BillingPorts) {}

  async registerJobs() {
    if (!this.ports.jobs) return;
    await this.ports.jobs.handle(SWEEP_JOB, async () => { await this.sweep(); });
    await this.ports.jobs.recurring(SWEEP_JOB, "*/5 * * * *", "UTC");
  }

  /** POST /api/hooks/stripe with the raw body and the Stripe-Signature header. */
  async receive(raw: unknown, signature: string | undefined) {
    if (this.ports.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.ports.notReady);
    const body = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : null;
    if (body === null) throw problem(400, "SIGNATURE", "Not signed", "A Stripe event needs its raw body and its Stripe-Signature header.");
    let ev: BillingEvent;
    try { ev = this.ports.billing.readEvent(body, signature); } catch (e) {
      if (e instanceof BillingSignatureError) throw problem(400, "SIGNATURE", "Not signed", "The Stripe-Signature header does not match this body.");
      throw problem(400, "NOT_AN_EVENT", "Not an event", "The body is not a Stripe event.");
    }
    const stored = await this.db.webhookReceipt.createMany({ data: [{ service: "stripe", eventId: ev.id }], skipDuplicates: true });
    if (stored.count === 0) return { received: true, duplicate: true };
    this.later(() => this.handle(ev));
    return { received: true };
  }

  /** Handles one stored event; a failure leaves its receipt unhandled for the sweep. Returns the outcome. */
  async handle(ev: BillingEvent): Promise<string> {
    const row = await this.findSubscription(ev);
    let outcome = "no firm matched";
    if (row) {
      if (ev.type === "checkout.session.completed" && ev.setupIntentId && row.stripeSubscriptionId) await this.ports.billing.useCardAndResume(row.stripeSubscriptionId, ev.setupIntentId);
      const subId = ev.subscriptionId ?? row.stripeSubscriptionId;
      outcome = subId ? await this.refresh(row.id, row.firmId, subId) : "no subscription yet";
    }
    await this.db.webhookReceipt.updateMany({ where: { service: "stripe", eventId: ev.id, handledAt: null }, data: { handledAt: this.ports.clock.now(), outcome: `${ev.type}: ${outcome}`.slice(0, 200), firmId: row?.firmId ?? null } });
    return outcome;
  }

  /** Receipts stored over 2 minutes ago and not handled: read again from Stripe and handled (each once). */
  async sweep(): Promise<number> {
    const due = await this.db.webhookReceipt.findMany({ where: { service: "stripe", handledAt: null, receivedAt: { lt: new Date(this.ports.clock.now().getTime() - 120_000) } }, take: 50, orderBy: { receivedAt: "asc" } });
    let n = 0;
    for (const r of due) { try { await this.handle(await this.ports.billing.event(r.eventId)); n++; } catch (e) { console.warn(`[billing] sweep: ${e instanceof Error ? e.name : "error"}`); } }
    return n;
  }

  /** Our subscription an event is about: by Stripe's subscription id, else the firm's live one (Checkout's first event
   *  names the firm), else the customer's. */
  private async findSubscription(ev: BillingEvent) {
    const live = { status: { not: "ENDED" as const } };
    if (ev.subscriptionId) { const s = await this.db.platformSubscription.findUnique({ where: { stripeSubscriptionId: ev.subscriptionId } }); if (s) return s; }
    if (ev.firmId) { const s = await this.db.platformSubscription.findFirst({ where: firmScope(ev.firmId, live), orderBy: { createdAt: "desc" } }); if (s) return s; }
    if (ev.customerId) return this.db.platformSubscription.findFirst({ where: { stripeCustomerId: ev.customerId, ...live }, orderBy: { createdAt: "desc" } });
    return null;
  }

  /** Reads Stripe's subscription and applies it, one at a time per subscription (the read is inside the lock, so an older
   *  read never lands after a newer one). */
  async refresh(rowId: string, firmId: string, stripeSubId: string): Promise<string> {
    let draft: string | null = null;
    const out = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat_billing:${firmId}`}))`;
      const row = await tx.platformSubscription.findFirstOrThrow({ where: firmScope(firmId, { id: rowId }) });
      const firm = await tx.platformFirm.findUniqueOrThrow({ where: { id: firmId } });
      const snap = await this.ports.billing.subscription(stripeSubId);
      if ((row.stripeCustomerId && snap.customerId !== row.stripeCustomerId) || (snap.firmId && snap.firmId !== firmId)) return "subscription belongs to another customer: ignored";
      let next = SUB_OF[snap.status] ?? row.status, reason = `stripe ${snap.status}`;
      const inv = snap.latestInvoice;
      if (inv?.taxNeedsAddress && (inv.status === "draft" || inv.status === "open")) { next = "PAYMENT_HOLD"; reason = ADDRESS_NEEDED; if (inv.status === "draft") draft = inv.id; }
      else if (row.status === "PAYMENT_HOLD" && next !== "ENDED" && next !== "PAYMENT_HOLD" && inv?.status !== "paid") { next = "PAYMENT_HOLD"; reason = "hold ends only on a paid invoice"; }
      const notes: string[] = [];
      if (!canMove(SUB_MOVES, row.status, next)) { notes.push(`subscription ${row.status} → ${next} refused`); next = row.status; }
      await tx.platformSubscription.updateMany({ where: firmScope(firmId, { id: row.id }), data: {
        status: next, stripeSubscriptionId: snap.id, stripeCustomerId: row.stripeCustomerId ?? snap.customerId,
        trialEndsAt: snap.trialEnd ?? row.trialEndsAt, currentPeriodEnd: snap.periodEnd ?? row.currentPeriodEnd,
      } });
      let firmNext = FIRM_OF[next];
      if (!canMove(FIRM_MOVES, firm.status, firmNext)) { notes.push(`firm ${firm.status} → ${firmNext} refused`); firmNext = firm.status; }
      if (firmNext !== firm.status) await tx.platformFirm.update({ where: { id: firmId }, data: { status: firmNext } });
      const ends = { trialEndsAt: (snap.trialEnd ?? row.trialEndsAt)?.toISOString() ?? null, periodEnd: (snap.periodEnd ?? row.currentPeriodEnd)?.toISOString() ?? null };
      await this.ports.audit.record(tx, { firmId, actor: ACTOR, action: notes.length ? "platform.subscription.move_refused" : "platform.subscription.synced", entity: "platform_subscription", entityKey: row.id,
        summary: notes.length ? `Billing move refused: ${notes.join("; ")}` : `Subscription ${row.status} → ${next}; firm ${firm.status} → ${firmNext} (${reason})`,
        detail: { from: row.status, to: next, firmFrom: firm.status, firmTo: firmNext, reason, stripeStatus: snap.status, ...ends } });
      // Events last in the transaction (PF-3 review m8).
      if (next !== row.status) await tx.moduleEvent.create({ data: { firmId, type: EVENT.FIRM_SUBSCRIPTION_CHANGED, subjectId: row.id, payload: { firmId, old: row.status, new: next, reason } } });
      if (firmNext !== firm.status && firmNext === "ACTIVE") await tx.moduleEvent.create({ data: { firmId, type: EVENT.FIRM_ACTIVATED, subjectId: firmId, payload: { firmId } } });
      if (firmNext !== firm.status && firmNext === "PAYMENT_HOLD") await tx.moduleEvent.create({ data: { firmId, type: EVENT.FIRM_PAYMENT_HOLD, subjectId: firmId, payload: { firmId, reason } } });
      return notes.length ? notes.join("; ") : `${row.status} → ${next}`;
    }, { timeout: 30_000 });
    if (draft) await this.ports.billing.holdDraftInvoice(draft);
    return out;
  }

  /** Work started after an answer; its failure leaves the receipt for the sweep. `settled()` waits for it (tests). */
  private readonly inflight = new Set<Promise<void>>();
  private later(fn: () => Promise<unknown>) {
    const p: Promise<void> = fn().then(() => undefined, (e) => console.warn(`[billing] event handling failed (the sweep retries): ${e instanceof Error ? e.name : "error"}`)).finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }
  async settled() { while (this.inflight.size) await Promise.all([...this.inflight]); }
}
