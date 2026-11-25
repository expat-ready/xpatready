// R1.91 part 1 (shape product/screens/R1.91/shape.md §2): a webhook path for a copy Stripe cannot reach (a GitHub runner,
// a cloud lane). Stripe test mode keeps every event it makes for 30 days; the relay lists them (`GET /v1/events`, created
// at or after the walk's start, only the types asked), oldest first, and POSTs each event's own JSON to the copy's
// webhook route, signed with the copy's own webhook secret (a random whsec_ made per run: no endpoint is registered in
// the Stripe account, so no dashboard secret exists or is needed; the Lead's ruling on #3636). The events and their data
// are Stripe's; only the transport is ours. Our webhook route then does what it does for any event: checks the
// signature, stores the event once by its id, and reads Stripe's current subscription (webhook.ts).
// Each event is delivered once: a 2xx marks it delivered; any other answer, a network error or a POST over its time
// limit leaves it for the next poll (as Stripe retries), up to `maxAttempts`, then it is given up and listed. `only`
// keeps a run to its own events (the test account is shared). `stop()` stops for good. Shared with R1.57's builder (firms charging clients, FO-7c): `account` lists one connected
// account's events (the Stripe-Account header) for the Connect route and its own secret.
// Test keys only: a live key is refused before any call.
//   STRIPE_TEST_SECRET_KEY=sk_test_… RELAY_SECRET=whsec_… tsx studio/tests/journeys/stripe-relay.ts http://127.0.0.1:4431/api/hooks/stripe [--since <unix s>]
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import { keyProblem } from "../../api/src/platform/billing/stripe-setup.ts";

/** The SA-4-35 minimum of what our billing webhook handles (webhook.ts acts on every customer.subscription.*, invoice.*
 *  and checkout.session.* event; these are the ones a walk needs). */
export const BILLING_EVENT_TYPES = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "invoice.created", "invoice.finalized", "invoice.paid",
  "invoice.payment_failed", "invoice.voided",
] as const;

export type RelayOptions = {
  stripe: Stripe; webhookUrl: string; signingKey: string; sinceSeconds: number;
  types?: readonly string[]; account?: string; fetchFn?: typeof fetch; intervalMs?: number; log?: (line: string) => void;
  /** Only this run's events (the test account is shared by every runner and by R1.57): e.g. one customer's. Default: all. */
  only?: (e: Stripe.Event) => boolean;
  /** One POST's limit (default 10 s): a webhook that never answers fails that attempt, never the relay. */
  postTimeoutMs?: number;
  /** Attempts per event before the relay gives up on it (default 5): a refused event is not sent forever. */
  maxAttempts?: number;
};
export type Delivery = { id: string; type: string; status: number };
const MAX_FAILURES_KEPT = 100;

export class StripeRelay {
  readonly delivered = new Map<string, Delivery>();
  readonly failures: Array<{ id: string; type: string; status: number | null; error?: string }> = [];
  readonly gaveUp = new Map<string, { id: string; type: string; attempts: number }>();
  private readonly attempts = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<number> | null = null;
  private state: "idle" | "polling" | "stopped" = "idle";
  constructor(private readonly o: RelayOptions) {
    if (!/^whsec_[A-Za-z0-9+/=]{8,255}$/.test(o.signingKey)) throw new Error("the relay's signing key is not a whsec_… value");
  }

  /** One pass: lists the events since the start, oldest first, and delivers each not yet delivered. Returns how many it
   *  delivered now. Two calls at once share one pass, so an event is never sent twice by overlap. */
  poll(): Promise<number> {
    if (this.running) return this.running;
    this.running = this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  private async pass(): Promise<number> {
    const types = [...(this.o.types ?? BILLING_EVENT_TYPES)], events: Stripe.Event[] = [];
    const opts = this.o.account ? { stripeAccount: this.o.account } : undefined;
    for await (const e of this.o.stripe.events.list({ created: { gte: this.o.sinceSeconds }, types, limit: 100 }, opts)) if (!this.o.only || this.o.only(e)) events.push(e);
    events.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));   // Stripe lists newest first
    let n = 0;
    for (const e of events) {
      if (this.delivered.has(e.id) || this.gaveUp.has(e.id)) continue;
      const tries = (this.attempts.get(e.id) ?? 0) + 1;
      this.attempts.set(e.id, tries);
      const payload = JSON.stringify(e);
      const { signingKey } = this.o, signature = this.o.stripe.webhooks.generateTestHeaderString({ payload, secret: signingKey });
      let status: number | null = null, error: string | undefined;
      // A plain timer, not AbortSignal.timeout (unref'd: a lone hanging POST would let the process end mid-pass).
      const ac = new AbortController(), limit = setTimeout(() => ac.abort(new Error(`no answer within ${this.o.postTimeoutMs ?? 10_000} ms`)), this.o.postTimeoutMs ?? 10_000);
      try {
        const r = await (this.o.fetchFn ?? fetch)(this.o.webhookUrl, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload, signal: ac.signal });
        status = r.status;
        if (r.ok) { this.delivered.set(e.id, { id: e.id, type: e.type, status }); n++; this.o.log?.(`relay  ${e.type} ${e.id} → ${status}`); continue; }
      } catch (err) { error = (err as Error).message; } finally { clearTimeout(limit); }
      this.failures.push({ id: e.id, type: e.type, status, ...(error ? { error } : {}) });
      if (this.failures.length > MAX_FAILURES_KEPT) this.failures.splice(0, this.failures.length - MAX_FAILURES_KEPT);
      if (tries >= (this.o.maxAttempts ?? 5)) { this.gaveUp.set(e.id, { id: e.id, type: e.type, attempts: tries }); this.o.log?.(`relay  ${e.type} ${e.id}: gave up after ${tries} attempts (${status ?? error})`); }
      else this.o.log?.(`relay  ${e.type} ${e.id} → ${status ?? error} (kept for the next poll)`);
    }
    return n;
  }

  /** Polls every `intervalMs` (default 2 s) until stopped. A second start while polling does nothing; after stop, none. */
  start(): this {
    if (this.state !== "idle") return this;
    this.state = "polling";
    const tick = async () => {
      try { await this.poll(); } catch (e) { this.o.log?.(`relay  poll failed: ${(e as Error).message}`); }
      if (this.state === "polling") this.timer = setTimeout(tick, this.o.intervalMs ?? 2000);
    };
    void tick();
    return this;
  }

  /** Stops for good: no tick after it returns. One last pass first (bounded by `withinMs`, default 15 s), so an event
   *  made just before the stop is still delivered. */
  async stop(withinMs = 15_000): Promise<void> {
    this.state = "stopped";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await within(this.poll().catch(() => 0), withinMs).catch(() => 0);
    if (this.timer) clearTimeout(this.timer);   // a tick that was running when stop began does not re-arm (state), but be sure
    this.timer = null;
  }

  /** Waits until an event of `type` matching `when` is ACCEPTED by the webhook route (a 2xx: stored, not yet handled; the
   *  route handles it after answering, webhook.ts), and fails loudly when none comes within `timeoutMs`, even if a pass hangs. */
  async waitFor(type: string, when: (e: Delivery) => boolean = () => true, timeoutMs = 30_000): Promise<Delivery> {
    const end = Date.now() + timeoutMs, hit = () => [...this.delivered.values()].find((d) => d.type === type && when(d));
    for (;;) {
      const h = hit();
      if (h) return h;
      const left = end - Date.now();
      if (left <= 0) throw new Error(`relay: no ${type} event delivered within ${timeoutMs} ms`);
      await within(this.poll(), left).catch(() => 0);
      if (!hit() && end - Date.now() > 0) await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(0, end - Date.now()))));
    }
  }
}

/** `p`, or a rejection after `ms` (the timer never keeps the process alive). */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, no) => { t = setTimeout(() => no(new Error(`timed out after ${ms} ms`)), ms); t.unref?.(); });
  return Promise.race([p, late]).finally(() => clearTimeout(t));
}

/** A relay from a test key (refused otherwise). */
export function relayFromKey(key: string | undefined, o: Omit<RelayOptions, "stripe">): StripeRelay {
  const bad = keyProblem(key);
  if (bad) throw new Error(`relay: ${bad}`);
  return new StripeRelay({ ...o, stripe: new Stripe(key!, { maxNetworkRetries: 2, timeout: 20_000 }) });
}

/** The command line: one webhook URL and an optional `--since <unix seconds>`; anything else is refused. */
export function relayArgs(argv: string[], nowSeconds: number): { url: string; since: number } | { problem: string } {
  let url: string | null = null, since = nowSeconds - 60;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") {
      const v = argv[++i];
      if (!v || !/^\d{9,11}$/.test(v)) return { problem: `--since needs unix seconds, got ${JSON.stringify(v ?? "")}` };
      since = Number(v);
    } else if (a.startsWith("--")) return { problem: `unknown argument ${JSON.stringify(a)}` };
    else if (url) return { problem: `one webhook URL only (got ${JSON.stringify(url)} and ${JSON.stringify(a)})` };
    else if (!/^https?:\/\/[^\s]+$/.test(a)) return { problem: `not a webhook URL: ${JSON.stringify(a)}` };
    else url = a;
  }
  return url ? { url, since } : { problem: "the webhook URL is missing" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = relayArgs(process.argv.slice(2), Math.floor(Date.now() / 1000));
  if ("problem" in args || !process.env.RELAY_SECRET) { console.log(`relay: ${"problem" in args ? args.problem : "RELAY_SECRET is not set"}\nusage: RELAY_SECRET=whsec_… STRIPE_TEST_SECRET_KEY=sk_test_… tsx stripe-relay.ts <webhook url> [--since <unix s>]`); process.exit(2); }
  const key = process.env.STRIPE_TEST_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY, signingKey = process.env.RELAY_SECRET;
  const relay = relayFromKey(key, { webhookUrl: args.url, signingKey, sinceSeconds: args.since, log: (l) => console.log(l) }).start();
  const end = async () => { await relay.stop(); console.log(`relay stopped: ${relay.delivered.size} delivered, ${relay.gaveUp.size} given up, ${relay.failures.length} failed attempt(s) kept`); process.exit(0); };
  process.on("SIGTERM", end); process.on("SIGINT", end);
}
