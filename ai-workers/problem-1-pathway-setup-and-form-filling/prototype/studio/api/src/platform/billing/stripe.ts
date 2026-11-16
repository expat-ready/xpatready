// PF-5: BillingPort's real adapter, Stripe Billing through Stripe's own library (tech gate entry 1; PF-L's exact version).
// Test-mode keys only (PLATFORM_STRIPE_SECRET_KEY; config refuses a live key outside production), never in a lane: CI runs
// this adapter on recorded Stripe answers through the library's fetch client (tests/check_pf5_signup_billing.ts). Each
// creating call carries an idempotency key, so a retried request never makes a second customer or session.
import Stripe from "stripe";
import { BillingPrice, CustomerInput, PriceId, TrialCheckoutInput, type BillingPort } from "../../../../ports/billing.ts";

export class StripeBilling implements BillingPort {
  constructor(private readonly stripe: Stripe) {}

  /** From a secret key; `fetchFn` replaces the network (recorded answers in CI). */
  static fromKey(secretKey: string, fetchFn?: typeof fetch): StripeBilling {
    return new StripeBilling(new Stripe(secretKey, { maxNetworkRetries: 2, ...(fetchFn ? { httpClient: Stripe.createFetchHttpClient(fetchFn) } : {}) }));
  }

  async prices(ids: string[]) {
    const out: BillingPrice[] = [];
    for (const id of new Set(ids.filter((i) => PriceId.safeParse(i).success))) {
      try {
        const p = await this.stripe.prices.retrieve(id);
        const interval = p.recurring?.interval;
        if (p.unit_amount === null || (interval !== "month" && interval !== "year")) continue;
        out.push(BillingPrice.parse({ id: p.id, unitAmount: p.unit_amount, currency: p.currency, interval, active: p.active }));
      } catch (e) { if ((e as { code?: string }).code !== "resource_missing") throw e; }
    }
    return out;
  }

  async ensureCustomer(input: CustomerInput) {
    const c = CustomerInput.parse(input), firmId = c.firmId.toLowerCase();
    const a = c.address;
    const created = await this.stripe.customers.create({
      email: c.email, name: c.name, metadata: { firm_id: firmId },
      ...(a ? { address: { line1: a.line1, line2: a.line2, city: a.city, state: a.province, postal_code: a.postalCode, country: a.country } } : {}),
    }, { idempotencyKey: `pf5-customer-${firmId}` });
    return { customerId: created.id };
  }

  async startTrialCheckout(input: TrialCheckoutInput) {
    const c = TrialCheckoutInput.parse(input), firmId = c.firmId.toLowerCase();
    // Step 0 facts 1 and 3 (step0.md): no card unless required, pause at trial end with no card; the address is asked here
    // and saved on the customer, so Stripe Tax can tax the first invoice (Lead B's ruling on fact 3).
    const s = await this.stripe.checkout.sessions.create({
      mode: "subscription", customer: c.customerId, client_reference_id: firmId, line_items: [{ price: c.priceId, quantity: 1 }],
      payment_method_collection: "if_required", billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: true },
      subscription_data: { trial_period_days: c.trialDays, trial_settings: { end_behavior: { missing_payment_method: "pause" } }, metadata: { firm_id: firmId } },
      metadata: { firm_id: firmId }, success_url: c.successUrl, cancel_url: c.cancelUrl,
    }, { idempotencyKey: `pf5-trial-${firmId}-${c.priceId}` });
    if (!s.url) throw new Error("Stripe answered a Checkout session without a url");
    return { sessionId: s.id, url: s.url };
  }
}
