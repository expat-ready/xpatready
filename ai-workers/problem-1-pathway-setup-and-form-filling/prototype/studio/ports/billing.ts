// PF-5 (contracts §0.3, §7 §1.1): the billing port, our one door to Stripe Billing for firms' subscriptions to us. Two
// adapters: the fake here (in-process, deterministic, every CI check) and the Stripe adapter
// (api/src/platform/billing/stripe.ts, test-mode keys only, never in a lane). Part 1 needs three calls: the plans' prices,
// the firm's customer, and the no-card trial's Checkout. This folder imports only zod and its own files.
import { z } from "zod";
import { FirmId } from "./audit.ts";

export const PriceId = z.string().regex(/^price_[A-Za-z0-9]{1,200}$/, "a Stripe price id");
export const CustomerId = z.string().regex(/^cus_[A-Za-z0-9]{1,200}$/, "a Stripe customer id");

/** A price as the pricing page shows it: amount in cents, before tax ("+ applicable taxes"). */
export const BillingPrice = z.strictObject({
  id: PriceId, unitAmount: z.number().int().min(0), currency: z.string().regex(/^[a-z]{3}$/), interval: z.enum(["month", "year"]), active: z.boolean(),
});
export type BillingPrice = z.infer<typeof BillingPrice>;

/** The business address (samples/firms.json's office shape, the fields Stripe Tax reads). */
export const BillingAddress = z.strictObject({
  line1: z.string().min(1).max(200), line2: z.string().max(200).optional(), city: z.string().min(1).max(100),
  province: z.string().min(1).max(100), postalCode: z.string().min(1).max(20), country: z.string().regex(/^[A-Z]{2}$/),
});
export type BillingAddress = z.infer<typeof BillingAddress>;

export const CustomerInput = z.strictObject({ firmId: FirmId, email: z.email(), name: z.string().min(1).max(200), address: BillingAddress.optional() });
export type CustomerInput = z.infer<typeof CustomerInput>;

/** The no-card trial (A46 row 90; step 0 fact 1): Checkout in subscription mode, card collected only if required, the
 *  trial's days, and at trial end with no card the subscription pauses. */
export const TrialCheckoutInput = z.strictObject({
  firmId: FirmId, customerId: CustomerId, priceId: PriceId, trialDays: z.number().int().min(1).max(90),
  successUrl: z.url(), cancelUrl: z.url(),
});
export type TrialCheckoutInput = z.infer<typeof TrialCheckoutInput>;
export const TrialCheckout = z.strictObject({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{1,300}$/), url: z.url() });
export type TrialCheckout = z.infer<typeof TrialCheckout>;

export interface BillingPort {
  /** The prices named (unknown ids are left out). */
  prices(ids: string[]): Promise<BillingPrice[]>;
  /** The firm's one Stripe customer: the same firm always gets the same customer (idempotent by firm id). */
  ensureCustomer(input: CustomerInput): Promise<{ customerId: string }>;
  /** A Checkout session that starts the trial with no card; the same firm and price give the same session. */
  startTrialCheckout(input: TrialCheckoutInput): Promise<TrialCheckout>;
}

/** What the fake keeps of one Checkout session: the parameters Stripe would receive. */
export type FakeCheckout = TrialCheckout & { input: TrialCheckoutInput; paymentMethodCollection: "if_required"; missingPaymentMethod: "pause" };

export type FakeBilling = BillingPort & {
  readonly customers: ReadonlyArray<CustomerInput & { customerId: string }>;
  readonly checkouts: ReadonlyArray<FakeCheckout>;
  /** How many calls reached the fake (each idempotent repeat counted). */
  readonly calls: number;
};

/** The fake: validates like the real adapter, keeps its customers and sessions in memory, and fails when `failOn` names
 *  the call. Ids are counters (`cus_fake000001`), so a run is deterministic. */
export function fakeBilling(opts: { prices?: BillingPrice[]; failOn?: (call: "prices" | "ensureCustomer" | "startTrialCheckout") => boolean } = {}): FakeBilling {
  const prices = (opts.prices ?? []).map((p) => BillingPrice.parse(p));
  const customers: (CustomerInput & { customerId: string })[] = [];
  const checkouts: FakeCheckout[] = [];
  let calls = 0;
  const gate = (call: "prices" | "ensureCustomer" | "startTrialCheckout") => { calls++; if (opts.failOn?.(call)) throw new Error(`forced billing failure: ${call}`); };
  const id = (prefix: string, n: number) => `${prefix}_fake${String(n).padStart(6, "0")}`;
  return {
    async prices(ids) { gate("prices"); const want = new Set(z.array(z.string()).parse(ids)); return prices.filter((p) => want.has(p.id)).map((p) => ({ ...p })); },
    async ensureCustomer(input) {
      gate("ensureCustomer");
      const c = CustomerInput.parse(input), firmId = c.firmId.toLowerCase();
      const had = customers.find((x) => x.firmId === firmId);
      if (had) return { customerId: had.customerId };
      const customerId = id("cus", customers.length + 1);
      customers.push({ ...c, firmId, customerId });
      return { customerId };
    },
    async startTrialCheckout(input) {
      gate("startTrialCheckout");
      const c = TrialCheckoutInput.parse(input);
      if (!customers.some((x) => x.customerId === c.customerId)) throw new Error(`no such customer: ${c.customerId}`);
      if (!prices.some((p) => p.id === c.priceId && p.active)) throw new Error(`no such active price: ${c.priceId}`);
      const had = checkouts.find((x) => x.input.firmId.toLowerCase() === c.firmId.toLowerCase() && x.input.priceId === c.priceId);
      if (had) return { sessionId: had.sessionId, url: had.url };
      const sessionId = id("cs", checkouts.length + 1);
      checkouts.push({ sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}`, input: c, paymentMethodCollection: "if_required", missingPaymentMethod: "pause" });
      return { sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` };
    },
    get customers() { return customers.map((c) => ({ ...c })); },
    get checkouts() { return checkouts.map((c) => ({ ...c, input: { ...c.input } })); },
    get calls() { return calls; },
  };
}
