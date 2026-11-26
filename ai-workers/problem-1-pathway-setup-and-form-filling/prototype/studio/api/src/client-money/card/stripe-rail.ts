// FO-7c part 1: CardRail's real adapter, Stripe Connect through Stripe's own library (the `stripe` package PF-5 installed;
// no new package). A firm's account is made by controller properties and every payment call names it (`stripeAccount`:
// the Stripe-Account header, a direct charge). Test-mode keys only, never in CI or a lane: there the rail is the fake.
// NOT PROVEN ON STRIPE YET: step 0's docs read was blocked on the cloud network, so only the event check below runs in
// the suite (it needs no network); the calls are written to the library's types and wait on the founder's test account.
import Stripe from "stripe";
import { AccountId, AccountLinkInput, codeWord, CreateAccountInput, EventEnvelope, railEvent, HostedPaymentInput, RailAccountGone, RailRefused, RailSignatureError, RefundInput, type CardRail, type RailAccount, type RailIntent } from "./rail.ts";

const currencyOf = (c: string): "CAD" | "USD" => { const u = c.toUpperCase(); if (u !== "CAD" && u !== "USD") throw new Error(`a payment in ${u} is not ours`); return u; };
const intentOf = (p: Stripe.PaymentIntent): RailIntent => ({ id: p.id, status: p.status, amountMinor: p.amount, currency: currencyOf(p.currency), metadata: { ...p.metadata },
  lastError: p.last_payment_error ? { code: p.last_payment_error.decline_code ?? p.last_payment_error.code ?? null, message: (p.last_payment_error.message ?? "The card payment did not go through.").slice(0, 300) } : null });

export class StripeCardRail implements CardRail {
  constructor(private readonly stripe: Stripe, private readonly connectWebhookSecret: string | null = null) {}

  /** From the platform's secret key and the Connect endpoint's signing secret; `fetchFn` replaces the network. */
  static fromKey(secretKey: string, connectWebhookSecret: string | null = null, fetchFn?: typeof fetch): StripeCardRail {
    return new StripeCardRail(new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000, ...(fetchFn ? { httpClient: Stripe.createFetchHttpClient(fetchFn) } : {}) }), connectWebhookSecret);
  }

  async createAccount(input: CreateAccountInput) {
    const i = CreateAccountInput.parse(input);
    const a = await this.stripe.accounts.create({
      country: "CA", metadata: { firm_id: i.firmId },
      controller: { fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe", stripe_dashboard: { type: "full" } },
    }, { idempotencyKey: i.idempotencyKey });
    return { id: AccountId.parse(a.id) };
  }

  async accountLink(input: AccountLinkInput) {
    const i = AccountLinkInput.parse(input);
    return { url: (await this.stripe.accountLinks.create({ account: i.account, type: "account_onboarding", refresh_url: i.refreshUrl, return_url: i.returnUrl })).url };
  }

  async readAccount(account: string): Promise<RailAccount> {
    let a: Stripe.Account;
    try { a = await this.stripe.accounts.retrieve(AccountId.parse(account)); } catch (e) {
      if (e instanceof Stripe.errors.StripePermissionError || (e as { code?: string }).code === "account_invalid") throw new RailAccountGone();
      throw e;
    }
    const due = [...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])];
    return { id: a.id, chargesEnabled: a.charges_enabled, payoutsEnabled: a.payouts_enabled, detailsSubmitted: a.details_submitted, requirementsDue: due.length > 0 };
  }

  async createHostedPayment(input: HostedPaymentInput) {
    const i = HostedPaymentInput.parse(input);
    let s: Stripe.Checkout.Session;
    try {
      s = await this.stripe.checkout.sessions.create({
        mode: "payment", success_url: i.successUrl, cancel_url: i.cancelUrl, metadata: i.metadata, payment_intent_data: { metadata: i.metadata },
        ...(i.expiresAtSec ? { expires_at: i.expiresAtSec } : {}),
        line_items: [{ quantity: 1, price_data: { currency: i.currency.toLowerCase(), unit_amount: i.amountMinor, product_data: { name: i.description } } }],
      }, { stripeAccount: i.account, idempotencyKey: i.idempotencyKey });
    } catch (e) {
      // Break m1 (#3633): the account revoked or invalid → gone; any other refusal (a reused key, live charges not
      // possible, a bad request) → refused. Either way the client gets the offline details, never a 500.
      if (e instanceof Stripe.errors.StripePermissionError || (e as { code?: string }).code === "account_invalid") throw new RailAccountGone();
      // Break n2: Stripe down, rate-limited or refusing our key is still "card not offered now" for the client (offline
      // details, never a 500); the reason, with Stripe's type and code (never a key), goes to the log by the caller.
      if (e instanceof Stripe.errors.StripeError) { throw new RailRefused("the processor refused this hosted payment", `stripe ${codeWord(e.rawType)}${e.code ? `/${codeWord(e.code)}` : ""}${e.statusCode ? ` (${Number(e.statusCode) | 0})` : ""}`); }   // #3633 round 4: fixed words only
      throw e;
    }
    if (!s.url) throw new Error("Stripe answered a Checkout session without a url");
    return { id: s.id, url: s.url };
  }

  async expireOtherHostedPayments(account: string, invoiceId: string, keepId: string) {
    const acct = AccountId.parse(account); let n = 0;
    for await (const s of this.stripe.checkout.sessions.list({ status: "open", created: { gte: Math.floor(Date.now() / 1000) - 25 * 3600 }, limit: 100 }, { stripeAccount: acct })) {
      if (s.id === keepId || s.metadata?.invoice_id !== invoiceId) continue;
      try { await this.stripe.checkout.sessions.expire(s.id, {}, { stripeAccount: acct }); n++; } catch (e) { if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e; }   // completed meanwhile: not ours to expire
    }
    return n;
  }

  async readPaymentIntent(account: string, intentId: string) { return intentOf(await this.stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount: AccountId.parse(account) })); }

  async listSucceededIntents(account: string, since: Date) {
    const out: RailIntent[] = [];
    for await (const p of this.stripe.paymentIntents.list({ created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 }, { stripeAccount: AccountId.parse(account) })) if (p.status === "succeeded") out.push(intentOf(p));
    return out;
  }

  async refund(input: RefundInput) {
    const i = RefundInput.parse(input);
    try {
      const r = await this.stripe.refunds.create({ payment_intent: i.intentId, amount: i.amountMinor, ...(i.metadata ? { metadata: i.metadata } : {}) }, { stripeAccount: i.account, idempotencyKey: i.idempotencyKey });
      return { id: r.id, status: r.status ?? "pending" };
    } catch (e) { if (e instanceof Stripe.errors.StripeInvalidRequestError || e instanceof Stripe.errors.StripeCardError) throw new RailRefused("the processor refused this refund", `stripe ${codeWord(e.code)}`); throw e; }
  }

  async readRefund(account: string, refundId: string) {
    const r = await this.stripe.refunds.retrieve(refundId, {}, { stripeAccount: AccountId.parse(account) });
    return { id: r.id, status: r.status ?? "pending", amountMinor: r.amount, currency: currencyOf(r.currency), intentId: typeof r.payment_intent === "string" ? r.payment_intent : (r.payment_intent?.id ?? null), metadata: { ...(r.metadata ?? {}) } };
  }

  verifyEvent(rawBody: string, signature: string | undefined) {
    if (!this.connectWebhookSecret) throw new Error("PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET is not set");
    // The signature over the exact bytes first (Stripe's own check, 300 seconds' tolerance); the body is read after it.
    try { this.stripe.webhooks.signature!.verifyHeader(rawBody, signature ?? "", this.connectWebhookSecret); } catch { throw new RailSignatureError(); }
    return railEvent(EventEnvelope.parse(JSON.parse(rawBody)));
  }
}
