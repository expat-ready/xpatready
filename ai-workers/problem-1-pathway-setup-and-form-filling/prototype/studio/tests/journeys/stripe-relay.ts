// R1.91 part 1 (shape product/screens/R1.91/shape.md §2): a webhook path for a copy Stripe cannot reach (a GitHub runner,
// a cloud lane). Stripe test mode keeps every event it makes for 30 days; the relay lists them (`GET /v1/events`, created
// at or after the walk's start, only the types asked), oldest first, and POSTs each event's own JSON to the copy's
// webhook route, signed with the copy's own webhook secret (a random whsec_ made per run: no endpoint is registered in
// the Stripe account, so no dashboard secret exists or is needed; the Lead's ruling on #3636). The events and their data
// are Stripe's; only the transport is ours. Our webhook route then does what it does for any event: checks the
// signature, stores the event once by its id, and reads Stripe's current subscription (webhook.ts).
// Each event is delivered once: a 2xx marks it delivered; any other answer or a network error leaves it for the next
// poll (as Stripe retries). Shared with R1.57's builder (firms charging clients, FO-7c): `account` lists one connected
// account's events (the Stripe-Account header) for the Connect route and its own secret.
// Test keys only: a live key is refused before any call.
//   STRIPE_TEST_SECRET_KEY=sk_test_… RELAY_SECRET=whsec_… tsx studio/tests/journeys/stripe-relay.ts http://127.0.0.1:4431/api/hooks/stripe [--since <unix s>]
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import { keyProblem } from "../../api/src/platform/billing/stripe-setup.ts";

/** What our billing webhook handles (webhook.ts reads these prefixes; SA-4-35's minimum). */
export const BILLING_EVENT_TYPES = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "invoice.created", "invoice.finalized", "invoice.paid",
  "invoice.payment_failed", "invoice.voided",
] as const;

export type RelayOptions = {
  stripe: Stripe; webhookUrl: string; signingKey: string; sinceSeconds: number;
  types?: readonly string[]; account?: string; fetchFn?: typeof fetch; intervalMs?: number; log?: (line: string) => void;
};
export type Delivery = { id: string; type: string; status: number };

export class StripeRelay {
  readonly delivered = new Map<string, Delivery>();
  readonly failures: Array<{ id: string; type: string; status: number | null; error?: string }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<number> | null = null;
  constructor(private readonly o: RelayOptions) {
    if (!/^whsec_[A-Za-z0-9+/=]{8,255}$/.test(o.signingKey)) throw new Error("the relay's webhook secret is not a whsec_… value");
  }

  /** One pass: lists the events since the start, oldest first, and delivers each not yet delivered. Returns how many it delivered now. */
  poll(): Promise<number> {
    if (this.running) return this.running;   // never two passes at once: an event is never sent twice by overlap
    this.running = this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  private async pass(): Promise<number> {
    const types = [...(this.o.types ?? BILLING_EVENT_TYPES)], events: Stripe.Event[] = [];
    const opts = this.o.account ? { stripeAccount: this.o.account } : undefined;
    for await (const e of this.o.stripe.events.list({ created: { gte: this.o.sinceSeconds }, types, limit: 100 }, opts)) events.push(e);
    events.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));   // Stripe lists newest first
    let n = 0;
    for (const e of events) {
      if (this.delivered.has(e.id)) continue;
      const payload = JSON.stringify(e);
      const { signingKey } = this.o, signature = this.o.stripe.webhooks.generateTestHeaderString({ payload, secret: signingKey });
      try {
        const r = await (this.o.fetchFn ?? fetch)(this.o.webhookUrl, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload });
        if (r.ok) { this.delivered.set(e.id, { id: e.id, type: e.type, status: r.status }); n++; this.o.log?.(`relay  ${e.type} ${e.id} → ${r.status}`); }
        else { this.failures.push({ id: e.id, type: e.type, status: r.status }); this.o.log?.(`relay  ${e.type} ${e.id} → ${r.status} (kept for the next poll)`); }
      } catch (err) { this.failures.push({ id: e.id, type: e.type, status: null, error: (err as Error).message }); }
    }
    return n;
  }

  /** Polls every `intervalMs` (default 2 s) until stopped. */
  start(): this {
    const tick = async () => { try { await this.poll(); } catch (e) { this.o.log?.(`relay  poll failed: ${(e as Error).message}`); } this.timer = setTimeout(tick, this.o.intervalMs ?? 2000); };
    void tick();
    return this;
  }

  /** Stops polling, after one last pass so an event made just before the stop is still delivered. */
  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.poll().catch(() => 0);
  }

  /** Waits until an event of `type` matching `when` is delivered (fails loudly on time-out). */
  async waitFor(type: string, when: (e: Delivery) => boolean = () => true, timeoutMs = 30_000): Promise<Delivery> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const hit = [...this.delivered.values()].find((d) => d.type === type && when(d));
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`relay: no ${type} event delivered within ${timeoutMs} ms`);
      await this.poll();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** A relay from a test key (refused otherwise). */
export function relayFromKey(key: string | undefined, o: Omit<RelayOptions, "stripe">): StripeRelay {
  const bad = keyProblem(key);
  if (bad) throw new Error(`relay: ${bad}`);
  return new StripeRelay({ ...o, stripe: new Stripe(key!, { maxNetworkRetries: 2, timeout: 20_000 }) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [url] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const at = process.argv.indexOf("--since"), since = at > 0 ? Number(process.argv[at + 1]) : Math.floor(Date.now() / 1000) - 60;
  if (!url || !process.env.RELAY_SECRET) { console.log("usage: RELAY_SECRET=whsec_… STRIPE_TEST_SECRET_KEY=sk_test_… tsx stripe-relay.ts <webhook url> [--since <unix s>]"); process.exit(2); }
  const key = process.env.STRIPE_TEST_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY, signingKey = process.env.RELAY_SECRET;
  const relay = relayFromKey(key, { webhookUrl: url, signingKey, sinceSeconds: since, log: (l) => console.log(l) }).start();
  const end = async () => { await relay.stop(); console.log(`relay stopped: ${relay.delivered.size} delivered, ${relay.failures.length} failed attempt(s)`); process.exit(0); };
  process.on("SIGTERM", end); process.on("SIGINT", end);
}
