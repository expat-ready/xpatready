// PF-16 part 1a: PlanChangePort's Stripe adapter (stripe 23.1.0, API 2026-10-28.endive); test-mode keys only, recorded answers
// in CI; each changing call has an idempotency key. Preview: invoices.createPreview; now: subscriptions.update (always_invoice
// or none, error_if_incomplete); at the renewal: a schedule from the subscription, end_behavior release. Unconfirmed on a
// live test-mode account (no lane reaches Stripe): run once on the Mac with test keys before the first real firm.
import Stripe from "stripe";
import { ChangePreview, IdempotencyKey, PaymentDeclined, PlanSubscription, PriceChange, RenewalChange, type PlanChangePort } from "../../../../../ports/plan-change.ts";
import { SubscriptionId } from "../../../../../ports/billing.ts";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);
const at = (s: number | null | undefined) => (typeof s === "number" ? new Date(s * 1000) : null);
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

export class StripePlanChange implements PlanChangePort {
  constructor(private readonly stripe: Stripe) {}
  static fromKey(secretKey: string, fetchFn?: typeof fetch) {
    return new StripePlanChange(new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000, ...(fetchFn ? { httpClient: Stripe.createFetchHttpClient(fetchFn) } : {}) }));
  }

  async current(id: string) {
    const s = await this.stripe.subscriptions.retrieve(SubscriptionId.parse(id), { expand: ["items.data.price"] });
    const item = s.items.data[0], price = item?.price, schedId = idOf(s.schedule as string | { id: string } | null);
    // The price a phase still ahead moves to (review R2-M1, R2-M2): a schedule only half made, or left in its last phase, has none.
    const ahead = schedId ? (await this.stripe.subscriptionSchedules.retrieve(schedId)).phases.find((p) => p.start_date > Math.floor(Date.now() / 1000)) : undefined;
    return PlanSubscription.parse({ pendingPriceId: ahead?.items[0] ? idOf(ahead.items[0].price as string | { id: string }) : null,
      id: s.id, itemId: item?.id, priceId: idOf(price), interval: price?.recurring?.interval, unitAmount: price?.unit_amount, status: s.status,
      periodEnd: at(item?.current_period_end), trialEnd: at(s.trial_end), scheduleId: idOf(s.schedule as string | { id: string } | null),
    });
  }

  /** API 2026-10-28: the anchor is an object ({ type: "now" }); a proration date is sent only with proration (Stripe refuses
   *  `proration_date` with `proration_behavior: none`, InvoiceCreatePreviewParams.SubscriptionDetails.proration_date). */
  private details(c: PriceChange, itemId: string) {
    return { items: [{ id: itemId, price: c.priceId }], proration_behavior: c.prorate ? "always_invoice" as const : "none" as const,
      ...(c.prorate ? { proration_date: secs(c.prorationDate) } : {}), ...(c.anchorNow ? { billing_cycle_anchor: { type: "now" as const } } : {}) };
  }

  async preview(change: PriceChange) {
    const c = PriceChange.parse(change), cur = await this.current(c.subscriptionId);
    const inv = await this.stripe.invoices.createPreview({ subscription: c.subscriptionId, subscription_details: this.details(c, cur.itemId) });
    const proration = inv.lines.data.filter((l) => (l.parent as { subscription_item_details?: { proration?: boolean } } | null)?.subscription_item_details?.proration).reduce((n, l) => n + l.amount, 0);
    return ChangePreview.parse({ amountDueCents: inv.amount_due, prorationCents: proration, currency: inv.currency });
  }

  async changeNow(change: PriceChange, idempotencyKey: string) {
    const c = PriceChange.parse(change), key = IdempotencyKey.parse(idempotencyKey), cur = await this.current(c.subscriptionId);
    const d = this.details(c, cur.itemId);
    try { await this.stripe.subscriptions.update(c.subscriptionId, { ...d, payment_behavior: "error_if_incomplete" }, { idempotencyKey: key }); } catch (e) {
      if ((e as { type?: string }).type === "StripeCardError") throw new PaymentDeclined();   // a card error: nothing charged, nothing changed
      throw e;
    }
  }

  async scheduleAtRenewal(change: { subscriptionId: string; priceId: string }, idempotencyKey: string) {
    const c = RenewalChange.parse(change), key = IdempotencyKey.parse(idempotencyKey), cur = await this.current(c.subscriptionId);
    const id = cur.scheduleId ?? (await this.stripe.subscriptionSchedules.create({ from_subscription: c.subscriptionId }, { idempotencyKey: `${key}-from` })).id;
    const sched = await this.stripe.subscriptionSchedules.retrieve(id);
    const now = sched.current_phase, first = sched.phases?.[0];
    if (!now) throw new Error("the subscription schedule has no current phase");
    // The current phase as Stripe made it from the subscription (its items' tax rates and its discounts kept; review m7).
    const keep = first ? { items: first.items.map((i) => ({ price: idOf(i.price as string | { id: string })!, quantity: i.quantity ?? 1, ...(i.tax_rates?.length ? { tax_rates: i.tax_rates.map((t) => idOf(t as string | { id: string })!) } : {}) })),
      ...(first.discounts?.length ? { discounts: first.discounts.map((x) => { const d = idOf(x.discount as string | { id: string } | null); return d ? { discount: d } : { coupon: idOf(x.coupon as string | { id: string } | null) ?? undefined }; }) } : {}) } : { items: [{ price: cur.priceId, quantity: 1 }] };
    await this.stripe.subscriptionSchedules.update(id, { end_behavior: "release", proration_behavior: "none", phases: [
      { ...keep, start_date: now.start_date, end_date: now.end_date },
      { items: [{ price: c.priceId, quantity: 1 }], duration: { interval: cur.interval, interval_count: 1 } },
    ] }, { idempotencyKey: key });
    return { scheduleId: id };
  }

  async releaseSchedule(subscriptionId: string) {
    const cur = await this.current(subscriptionId);
    if (cur.scheduleId) await this.stripe.subscriptionSchedules.release(cur.scheduleId);
  }
}
