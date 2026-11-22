// PF-16 part 1a (SA-4-28..31, -49, -50, -55; SA-3-58): the Stripe calls our own plan change needs beside BillingPort (the
// portal's plan switching is off): the one item and price, a preview (invoices.createPreview, stripe 23.1.0), the change now,
// a change at the renewal (a schedule) and its release. Preview and change share one proration date, so the amount charged
// is the amount shown. Fake here, Stripe adapter in billing/plan-change/; one contract. This folder imports only zod.
import { z } from "zod";
import { PriceId, STRIPE_STATUSES, SubscriptionId } from "./billing.ts";

export const ItemId = z.string().regex(/^si_[A-Za-z0-9]{1,200}$/, "a Stripe subscription item id");
export const ScheduleId = z.string().regex(/^sub_sched_[A-Za-z0-9]{1,200}$/, "a Stripe subscription schedule id");

/** The subscription's one item as a plan change needs it. */
export const PlanSubscription = z.strictObject({
  id: SubscriptionId, itemId: ItemId, priceId: PriceId, interval: z.enum(["month", "year"]), unitAmount: z.number().int().min(0),
  status: z.enum(STRIPE_STATUSES), periodEnd: z.date().nullable(), trialEnd: z.date().nullable(), scheduleId: ScheduleId.nullable(),
  /** The price of a schedule phase still ahead; null if none (no schedule, or one left in its last phase: review R2-M2). */
  pendingPriceId: PriceId.nullable(),
});
export type PlanSubscription = z.infer<typeof PlanSubscription>;

/** A change to `priceId`: with Stripe's proration (a raise now) or none (a trial switch); `anchorNow` starts a fresh
 *  period today (monthly to yearly). The preview and the change carry the same `prorationDate`. */
export const PriceChange = z.strictObject({ subscriptionId: SubscriptionId, priceId: PriceId, prorate: z.boolean(), anchorNow: z.boolean(), prorationDate: z.date() });
export type PriceChange = z.infer<typeof PriceChange>;
/** What the change would invoice now: the invoice's amount due and its proration lines (a credit is negative). */
export const ChangePreview = z.strictObject({ amountDueCents: z.number().int().min(0), prorationCents: z.number().int(), currency: z.string().regex(/^[a-z]{3}$/) });
export type ChangePreview = z.infer<typeof ChangePreview>;
export const RenewalChange = z.strictObject({ subscriptionId: SubscriptionId, priceId: PriceId });
export const IdempotencyKey = z.string().regex(/^[A-Za-z0-9:_-]{8,255}$/, "an idempotency key");

/** A card error: nothing charged or changed. Any other failure may have reached Stripe: the caller reads Stripe back. */
export class PaymentDeclined extends Error { constructor() { super("the payment was declined"); this.name = "PaymentDeclined"; } }

export interface PlanChangePort {
  current(subscriptionId: string): Promise<PlanSubscription>;
  preview(change: PriceChange): Promise<ChangePreview>;
  /** Changes the price now; Stripe charges the proration at once and refuses an incomplete payment (nothing changes then).
   *  The same key never changes or charges twice. */
  changeNow(change: PriceChange, idempotencyKey: string): Promise<void>;
  /** From the current period's end the subscription is on `priceId` (no proration, no refund). The same key, one schedule. */
  scheduleAtRenewal(change: z.infer<typeof RenewalChange>, idempotencyKey: string): Promise<{ scheduleId: string }>;
  /** Drops a booked renewal change (the subscription stays as it is now). */
  releaseSchedule(subscriptionId: string): Promise<void>;
}

const DAY = 86_400_000, LENGTH = { month: 30 * DAY, year: 365 * DAY } as const;
export type FakePlanChange = PlanChangePort & {
  readonly subs: Map<string, PlanSubscription>;
  /** Each charge Stripe would make now (one per distinct key) and each renewal change booked. */
  readonly charges: { key: string; subscriptionId: string; cents: number }[];
  readonly renewals: Map<string, { priceId: string; at: Date | null }>;
};

/** The fake: deterministic proration (the price difference times the share of the period left, a fresh period credits
 *  the unused share), keyed like Stripe's idempotency, and `failOn` to make a call fail (a declined card). */
export function fakePlanChange(opts: { prices: { id: string; unitAmount: number; interval: "month" | "year"; currency: string }[]; failOn?: (call: keyof PlanChangePort) => "fail" | "decline" | "lost" | null | boolean }): FakePlanChange {
  const subs = new Map<string, PlanSubscription>(), charges: FakePlanChange["charges"] = [], renewals = new Map<string, { priceId: string; at: Date | null }>(), done = new Map<string, unknown>();
  const price = (id: string) => { const p = opts.prices.find((x) => x.id === id); if (!p) throw new Error(`no such price: ${id}`); return p; };
  const sub = (id: string) => { const s = subs.get(SubscriptionId.parse(id)); if (!s) throw new Error(`no such subscription: ${id}`); return s; };
  /** "fail" (or true): a refusal; "decline": a card error; "lost": Stripe made the change but the answer never came back. */
  const mode = (c: keyof PlanChangePort) => { const m = opts.failOn?.(c); return m === true ? "fail" : m || null; };
  const gate = (c: keyof PlanChangePort) => { const m = mode(c); if (m === "decline") throw new PaymentDeclined(); if (m === "fail") throw new Error(`forced plan-change failure: ${c}`); };
  const quote = (c: PriceChange): ChangePreview => {
    const s = sub(c.subscriptionId), to = price(c.priceId);
    if (!c.prorate) return { amountDueCents: 0, prorationCents: 0, currency: to.currency };
    const left = s.periodEnd ? Math.max(0, Math.min(1, (s.periodEnd.getTime() - c.prorationDate.getTime()) / LENGTH[s.interval])) : 0;
    const proration = c.anchorNow ? to.unitAmount - Math.round(s.unitAmount * left) : Math.round((to.unitAmount - s.unitAmount) * left);
    return { amountDueCents: Math.max(0, proration), prorationCents: proration, currency: to.currency };
  };
  return {
    subs, charges, renewals,
    async current(id) { gate("current"); return PlanSubscription.parse({ ...sub(id), pendingPriceId: renewals.get(id)?.priceId ?? null }); },
    async preview(change) { gate("preview"); return quote(PriceChange.parse(change)); },
    async changeNow(change, key) {
      const c = PriceChange.parse(change), k = IdempotencyKey.parse(key);
      if (done.get(k) === "declined") throw new PaymentDeclined();   // Stripe replays a stored decline under its key (break m6)
      if (done.has(k)) return;
      if (mode("changeNow") === "decline") { done.set(k, "declined"); throw new PaymentDeclined(); }
      gate("changeNow");
      const q = quote(c), s = sub(c.subscriptionId), to = price(c.priceId);
      subs.set(s.id, { ...s, priceId: to.id, interval: to.interval, unitAmount: to.unitAmount, ...(c.anchorNow ? { periodEnd: new Date(c.prorationDate.getTime() + LENGTH[to.interval]) } : {}) });
      if (q.amountDueCents > 0) charges.push({ key: k, subscriptionId: s.id, cents: q.amountDueCents });
      done.set(k, true);
      if (mode("changeNow") === "lost") throw new Error("forced plan-change failure: the answer was lost");
    },
    async scheduleAtRenewal(change, key) {
      const c = RenewalChange.parse(change), k = IdempotencyKey.parse(key);
      if (done.has(k)) return done.get(k) as { scheduleId: string };
      const s = sub(c.subscriptionId), half = mode("scheduleAtRenewal") === "lost";
      if (half) { subs.set(s.id, { ...s, scheduleId: s.scheduleId ?? "sub_sched_fakehalf" }); throw new Error("forced plan-change failure: the schedule was made, its phases refused"); }
      gate("scheduleAtRenewal"); price(c.priceId);
      const scheduleId = s.scheduleId ?? `sub_sched_fake${String(renewals.size + 1).padStart(6, "0")}`;
      subs.set(s.id, { ...s, scheduleId }); renewals.set(s.id, { priceId: c.priceId, at: s.periodEnd });
      done.set(k, { scheduleId }); return { scheduleId };
    },
    async releaseSchedule(id) { gate("releaseSchedule"); const s = sub(id); subs.set(s.id, { ...s, scheduleId: null }); renewals.delete(s.id); },
  };
}
