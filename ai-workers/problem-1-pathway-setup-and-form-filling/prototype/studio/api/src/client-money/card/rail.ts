// FO-7c part 1 (R1.57; AG-16-14..18, AG-6-14; contracts §7 §2.5): the card rail, client money's own port to the payment
// processor. Nothing outside api/src/client-money/ calls it. Every call that acts on a firm's account names that account
// (a direct charge: the money, the fees and the disputes are the firm's, P-567 (3)); no call takes or returns a secret
// (AG-16-18). The interface holds the eight calls the row names; part 1 uses four (create account, account link, read
// account, verify an event), parts 2 and 3 use the rest and add their tests. `fakeCardRail` is the rail of every test and
// of a server with no Stripe key; the Stripe adapter is card/stripe-rail.ts.
import Stripe from "stripe";
import { z } from "zod";

export const AccountId = z.string().regex(/^acct_[A-Za-z0-9]{1,64}$/, "a connected account id (acct_…)");
const Firm = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "a firm id (lower-case uuid)");
const Key = z.string().min(1).max(200);
const Url = z.url().max(2000);
const Currency = z.enum(["CAD", "USD"]);
const Minor = z.number().int().positive().max(99_999_999_99);

/** What the processor says about a connected account now: the two switches and whether it asks for more information. */
export type RailAccount = { id: string; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: boolean };
/** A verified event's envelope: its id, its type and the connected account it is about (null: not an account's event). */
export type RailEvent = { id: string; type: string; account: string | null };
export type RailIntent = { id: string; status: string; amountMinor: number; currency: "CAD" | "USD"; metadata: Record<string, string> };

export const CreateAccountInput = z.strictObject({ firmId: Firm, idempotencyKey: Key });
export const AccountLinkInput = z.strictObject({ account: AccountId, refreshUrl: Url, returnUrl: Url });
export const HostedPaymentInput = z.strictObject({ account: AccountId, amountMinor: Minor, currency: Currency, description: z.string().min(1).max(200), metadata: z.record(z.string().max(40), z.string().max(200)), successUrl: Url, cancelUrl: Url, expiresAtSec: z.number().int().positive().optional(), idempotencyKey: Key });
export const RefundInput = z.strictObject({ account: AccountId, intentId: z.string().regex(/^pi_[A-Za-z0-9_]{1,200}$/), amountMinor: Minor, idempotencyKey: Key });
export type CreateAccountInput = z.input<typeof CreateAccountInput>;
export type AccountLinkInput = z.input<typeof AccountLinkInput>;
export type HostedPaymentInput = z.input<typeof HostedPaymentInput>;
export type RefundInput = z.input<typeof RefundInput>;

/** The event's signature does not match its body (or is missing, or too old): the door answers 400 and stores nothing. */
export class RailSignatureError extends Error { constructor() { super("the event's signature does not match"); } }
/** The account can no longer be read with our platform's access (the firm removed it, or it never was ours). */
export class RailAccountGone extends Error { constructor() { super("the connected account cannot be read"); } }
/** The processor refused a refund (part 3: "Record an offline refund instead"). */
export class RailRefused extends Error {}

export interface CardRail {
  /** A new connected account for the firm, by controller properties: the firm pays the processor's fees, the processor
   *  carries payment losses and collects requirements, and the firm has the full dashboard. The same key → the same account. */
  createAccount(input: CreateAccountInput): Promise<{ id: string }>;
  /** A fresh hosted sign-up link for the account (short-lived; never stored). */
  accountLink(input: AccountLinkInput): Promise<{ url: string }>;
  /** The account as the processor has it now. Throws RailAccountGone when it cannot be read. */
  readAccount(account: string): Promise<RailAccount>;
  /** Part 2: a hosted payment page for the full amount, charged on the firm's account (a direct charge). */
  createHostedPayment(input: HostedPaymentInput): Promise<{ id: string; url: string }>;
  /** Part 2: one payment intent of the firm's account. */
  /** Break N1 (#3633): expires every other open hosted payment of this invoice on the account, so one page at most takes a card. */
  expireOtherHostedPayments(account: string, invoiceId: string, keepId: string): Promise<number>;
  readPaymentIntent(account: string, intentId: string): Promise<RailIntent>;
  /** Part 2: the account's succeeded intents created since `since` (the reconciliation poll). */
  listSucceededIntents(account: string, since: Date): Promise<RailIntent[]>;
  /** Part 3: a refund on the account the payment used. Throws RailRefused when the processor refuses it. */
  refund(input: RefundInput): Promise<{ id: string; status: string }>;
  /** Checks the signature over the exact bytes received, then reads the envelope. Throws RailSignatureError. */
  verifyEvent(rawBody: string, signature: string | undefined): RailEvent;
}

/** The envelope of a signed event. Not strict: the processor adds fields over time, and the signature proves the sender. */
export const EventEnvelope = z.object({ id: z.string().regex(/^evt_[A-Za-z0-9_]{1,250}$/), object: z.literal("event"), type: z.string().min(1).max(100), account: AccountId.nullish() });

export type FakeCardRail = CardRail & {
  /** Sets what the processor says about an account (as the hosted sign-up, or the processor's own review, would). */
  set(account: string, state: Partial<Omit<RailAccount, "id">>): void;
  /** The firm removed our platform from its account: it can no longer be read. */
  deauthorize(account: string): void;
  /** A paid hosted payment (part 2's tests). */
  succeed(account: string, paymentId: string, at: Date): RailIntent;
  refuseRefunds(on: boolean): void;
  /** A signature header for a body, as the processor signs it (`t=<seconds>,v1=<hmac>`), with this or another secret. */
  sign(rawBody: string, secret?: string, at?: Date): string;
  calls(): { name: string; key?: string }[];
};

/** In memory, no network. Signs and checks events with Stripe's own library and its own test secret, so the door's
 *  signature-first path is the real one. */
export function fakeCardRail(opts: { webhookSecret?: string; now?: () => Date } = {}): FakeCardRail {
  const signing = opts.webhookSecret ?? "fake-rail-signing-value", now = opts.now ?? (() => new Date());
  const accounts = new Map<string, RailAccount>(), byKey = new Map<string, unknown>(), gone = new Set<string>(), log: { name: string; key?: string }[] = [];
  const payments = new Map<string, { account: string; intent: RailIntent; created: Date; paid: Date | null; expiresAt: number | null; open: boolean }>(), sent = new Map<string, string>();
  let n = 0, refusing = false;
  const once = <T>(name: string, key: string, make: () => T): T => { log.push({ name, key }); if (!byKey.has(`${name}:${key}`)) byKey.set(`${name}:${key}`, make()); return byKey.get(`${name}:${key}`) as T; };
  const have = (account: string) => { const a = gone.has(account) ? undefined : accounts.get(AccountId.parse(account)); if (!a) throw new RailAccountGone(); return a; };
  return {
    async createAccount(input) {
      const i = CreateAccountInput.parse(input);
      return once("createAccount", i.idempotencyKey, () => { const id = `acct_1Fake${String(++n).padStart(6, "0")}`; accounts.set(id, { id, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: true }); return { id }; });
    },
    async accountLink(input) { const i = AccountLinkInput.parse(input); have(i.account); log.push({ name: "accountLink" }); return { url: `https://connect.fake-rail.example/setup/${i.account}/${++n}` }; },
    async readAccount(account) { log.push({ name: "readAccount" }); return { ...have(account) }; },
    async createHostedPayment(input) {
      const i = HostedPaymentInput.parse(input); if (!have(i.account).chargesEnabled) throw new RailRefused("charges are not enabled on this account");
      // As Stripe: a key reused with other parameters is refused (idempotency_error), never the old answer (break M1, #3633).
      const { idempotencyKey: _k, ...asked } = i, said = JSON.stringify(asked), was = sent.get(i.idempotencyKey);
      if (was !== undefined && was !== said) { log.push({ name: "createHostedPayment", key: i.idempotencyKey }); throw new RailRefused("this idempotency key was used with other parameters"); }
      sent.set(i.idempotencyKey, said);
      return once("createHostedPayment", i.idempotencyKey, () => { const id = `cs_fake_${++n}`, intent: RailIntent = { id: `pi_fake_${n}`, status: "requires_payment_method", amountMinor: i.amountMinor, currency: i.currency, metadata: { ...i.metadata } }; payments.set(id, { account: i.account, intent, created: now(), paid: null, expiresAt: i.expiresAtSec ? i.expiresAtSec * 1000 : null, open: true }); return { id, url: `https://pay.fake-rail.example/${id}` }; });
    },
    async expireOtherHostedPayments(account, invoiceId, keepId) {
      have(account); log.push({ name: "expireOtherHostedPayments" }); let n = 0;
      for (const [id, p] of payments) if (p.account === account && id !== keepId && p.open && !p.paid && p.intent.metadata.invoice_id === invoiceId) { p.open = false; n++; }
      return n;
    },
    async readPaymentIntent(account, intentId) { have(account); const p = [...payments.values()].find((x) => x.account === account && x.intent.id === intentId); if (!p) throw new Error("no such payment intent on this account"); return { ...p.intent }; },
    async listSucceededIntents(account, since) { have(account); return [...payments.values()].filter((p) => p.account === account && p.intent.status === "succeeded" && p.created >= since)   // by creation time, as Stripe lists them (review m6)
      .map((p) => ({ ...p.intent })); },
    async refund(input) {
      const i = RefundInput.parse(input); have(i.account); if (refusing) throw new RailRefused("the processor refused this refund");
      return once("refund", i.idempotencyKey, () => ({ id: `re_fake_${++n}`, status: "pending" }));
    },
    verifyEvent(rawBody, signature) {
      // Checked by Stripe's own library (its signature rule and 300 seconds' tolerance), so the fake and the adapter cannot
      // read a header differently (round 2 n2).
      try { Stripe.webhooks.signature!.verifyHeader(rawBody, signature ?? "", signing); } catch { throw new RailSignatureError(); }
      const e = EventEnvelope.parse(JSON.parse(rawBody));
      return { id: e.id, type: e.type, account: e.account ?? null };
    },
    set(account, state) { Object.assign(have(account), state); },
    deauthorize(account) { gone.add(account); },
    succeed(account, paymentId, at) { const p = payments.get(paymentId); if (!p || p.account !== account) throw new Error("no such hosted payment on this account");
      // As Stripe (break n4): an expired page, or one past its expires_at, takes no card.
      if (!p.open || (p.expiresAt !== null && at.getTime() >= p.expiresAt)) throw new Error("this hosted payment has expired"); p.intent.status = "succeeded"; p.paid = at; return { ...p.intent }; },
    refuseRefunds(on) { refusing = on; },
    sign(rawBody, withSecret = signing, at = now()) { return Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: withSecret, timestamp: Math.floor(at.getTime() / 1000) }); },
    calls: () => log.map((c) => ({ ...c })),
  };
}
