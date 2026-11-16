// PF-5: BillingPort's contract (ports/billing.ts). Run by fakeBilling and by StripeBilling (on recorded Stripe answers in
// CI; on test-mode keys only on the Mac). What callers rely on: prices answer only the ids asked, a firm has one customer,
// and the trial's Checkout asks for no card and pauses at trial end (step 0 fact 1), once per firm and price.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { BillingPort } from "../billing.ts";

/** The adapter, plus what the contract may read back: the parameters its last Checkout session was created with. */
export type BillingHarness = { port: BillingPort; priceId: string; lastCheckoutParams(): Record<string, unknown> | null };
const FIRM = "0f5a0000-0000-4000-8000-000000000001";

export const billingPortContract = defineContract("BillingPort", (make: () => BillingHarness) => [
  {
    name: "prices answer only the ids asked, with amount, currency and interval",
    async run() {
      const h = make(), got = await h.port.prices([h.priceId, "price_unknown0"]);
      expect(got.length === 1 && got[0].id === h.priceId && Number.isInteger(got[0].unitAmount) && /^[a-z]{3}$/.test(got[0].currency) && ["month", "year"].includes(got[0].interval), "one price, shaped", got);
    },
  },
  {
    name: "a firm has one customer (the same firm twice gives the same id)",
    async run() {
      const h = make(), a = await h.port.ensureCustomer({ firmId: FIRM, email: "owner@firm.example.com", name: "Firm" });
      const b = await h.port.ensureCustomer({ firmId: FIRM, email: "owner@firm.example.com", name: "Firm" });
      expect(/^cus_/.test(a.customerId) && a.customerId === b.customerId, "one customer id", [a, b]);
    },
  },
  {
    name: "the trial's Checkout asks for no card and pauses at trial end, once per firm and price",
    async run() {
      const h = make(), { customerId } = await h.port.ensureCustomer({ firmId: FIRM, email: "owner@firm.example.com", name: "Firm" });
      const input = { firmId: FIRM, customerId, priceId: h.priceId, trialDays: 14, successUrl: "https://app.example.com/ok", cancelUrl: "https://app.example.com/no" };
      const a = await h.port.startTrialCheckout(input), b = await h.port.startTrialCheckout(input), p = h.lastCheckoutParams();
      expect(/^cs_/.test(a.sessionId) && a.sessionId === b.sessionId && /^https:\/\//.test(a.url), "one session with a url", [a, b]);
      expect(p?.payment_method_collection === "if_required" && p?.missing_payment_method === "pause" && p?.trial_period_days === 14 && p?.mode === "subscription", "no card, pause, 14 days", p);
    },
  },
  {
    name: "a malformed input is refused before any call",
    async run() {
      const h = make();
      await expectRefused(() => h.port.ensureCustomer({ firmId: "not-a-firm", email: "x@y.example.com", name: "X" }), "a bad firm id");
      await expectRefused(() => h.port.startTrialCheckout({ firmId: FIRM, customerId: "cus_x", priceId: "nope", trialDays: 14, successUrl: "https://a.example.com", cancelUrl: "https://a.example.com" }), "a bad price id");
    },
  },
]);
