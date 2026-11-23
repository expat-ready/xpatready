// PF-5s part 2 (concept pf-5s-saas r2 §3 BR-8, BR-9, BR-10, BR-14, §7b B1, M5, M6; S6 Plan and billing): the shapes of
// PF-5 part 2's GET /api/platform/billing and GET /api/platform/billing/invoices, and the page's words worked out from
// them. No React and no "@/" imports, so the browser check reads the same words in Node. Plan names, prices and every
// wording Sample; tax readings Unconfirmed: no counsel.
import { z } from "zod";

const Address = z.object({ unit: z.string().nullable().optional(), street_number: z.string(), street_name: z.string(), city: z.string(), province_state: z.string(), postal_code: z.string() }).passthrough();
export const Billing = z.object({
  plan: z.object({ code: z.string(), name: z.string(), seatsLimit: z.number().nullable() }),
  status: z.enum(["TRIAL", "ACTIVE", "OVERDUE", "PAYMENT_HOLD", "ENDED"]), firmStatus: z.string(),
  trialEndsAt: z.string().nullable(), currentPeriodEnd: z.string().nullable(), seatsUsed: z.number(), seatsLimit: z.number().nullable(),
  cardOnFile: z.boolean().nullable(), cancelAtPeriodEnd: z.boolean().nullable(), billingAvailable: z.boolean(),
  hold: z.object({ reason: z.string(), since: z.string(), deletionDate: z.string() }).nullable(),
  businessAddress: z.unknown().nullable(),
});
export type Billing = z.infer<typeof Billing>;
export type AddressValue = z.infer<typeof Address>;
/** The saved address when it has the fields the tax needs; anything else counts as missing (B1). */
export const addressOf = (b: Billing): AddressValue | null => { const r = Address.safeParse(b.businessAddress); return r.success ? r.data : null; };
export const addressLines = (a: AddressValue) => [`${a.unit ? `${a.unit}-` : ""}${a.street_number} ${a.street_name}`, `${a.city} ${a.province_state} ${a.postal_code}`];

/** R1.21: each invoice's tax (null: the provider has not said; never shown as 0). */
export const InvoiceTax = z.object({ name: z.string(), jurisdiction: z.string().nullable(), ratePpm: z.number().nullable(), amountCents: z.number() });
export const Invoices = z.object({ invoices: z.array(z.object({ id: z.string(), number: z.string().nullable(), status: z.string().nullable(), amountDueCents: z.number(), currency: z.string(), createdAt: z.string(), hostedUrl: z.string().nullable(),
  subtotalCents: z.number().nullable().default(null), taxCents: z.number().nullable().default(null), taxLines: z.array(InvoiceTax).default([]) })) });
export const SetAddressAnswer = z.object({ saved: z.literal(true), onStripe: z.boolean().nullable(), next: z.string().optional() });
export const HandOff = z.object({ url: z.string() });

/** The permission keys (PF-3's catalogue, as PF-5 part 2's routes check them). */
export const KEY = { view: "agent/subscription:pay", card: "agent/subscription:update-card", portal: "agent/subscription:cancel", invoices: "agent/subscription-invoice:view" } as const;

/** Status in the requirement's words (contracts §7 l.76) and the chip's tone. */
export const STATUS: Record<Billing["status"], { label: string; tone: "info" | "ok" | "warn" | "danger" | "neutral"; tip: string }> = {
  TRIAL: { label: "Trial", tone: "info", tip: "Your firm is trying Expat Ready. Nothing has been charged." },
  ACTIVE: { label: "Active", tone: "ok", tip: "Your subscription is paid and running." },
  OVERDUE: { label: "Payment overdue", tone: "warn", tip: "The last payment didn't go through. Everything still works while you update your card." },
  PAYMENT_HOLD: { label: "Payment hold", tone: "danger", tip: "Most of the app is paused until a payment goes through." },
  ENDED: { label: "Ended", tone: "neutral", tip: "This subscription has ended." },
};

const DAY = 86_400_000;
/** "28 Nov 2026" (the concept's form), in the reader's own day. */
export const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "date not known" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
/** Whole days left, counting a part day as a day; 0 on the last day and after. */
export const daysLeft = (iso: string, now: number) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY));

/** BR-10 with r2's M6: the trial line, from the stored trial end. A next step only for people who can add a card (M5).
 *  cardOnFile null with Stripe unreachable: the card is not known, so no claim either way. Null when not in a trial. */
export function trialLine(b: Billing, now: number, canCard: boolean): { text: string; next: string | null; card: boolean } | null {
  if (b.status !== "TRIAL" || !b.trialEndsAt) return null;
  const n = daysLeft(b.trialEndsAt, now), end = day(b.trialEndsAt), past = new Date(b.trialEndsAt).getTime() < now;
  const left = past ? `Free trial: ended on ${end}.` : n === 0 ? `Free trial: ends today (${end}).` : `Free trial: ${n} ${n === 1 ? "day" : "days"} left (ends ${end}).`;
  // Break M3: a trial set to cancel takes no payment and needs no card; it says so instead of asking for one.
  if (b.cancelAtPeriodEnd) return { text: `${left} Your subscription ${past ? "was" : "is"} set to cancel then, so no payment will be taken.`, next: null, card: b.cardOnFile === true };
  // R2-m1: once the end has passed (the record not yet moved by Stripe's event), nothing is said as if it were ahead.
  if (b.cardOnFile === true) return { text: past ? `Card saved. The trial ended on ${end}; your first payment is being taken.` : `Card saved. Your first payment is on ${end}.`, next: null, card: true };
  const unknown = b.cardOnFile === null && !b.billingAvailable;
  return { text: left, next: canCard && !unknown && !past ? "Add a card before then to keep access." : null, card: false };
}

/** The dates line under the plan (BR-8). */
export function datesLine(b: Billing, now: number = Date.now()): string | null {
  const endOf = b.status === "TRIAL" ? b.trialEndsAt ?? b.currentPeriodEnd : b.currentPeriodEnd;
  if (b.cancelAtPeriodEnd && endOf) return new Date(endOf).getTime() < now ? (b.status === "TRIAL" ? `Trial ended ${day(endOf)} (set to cancel)` : `Set to cancel on ${day(endOf)}`) : `Cancels on ${day(endOf)}`;
  if (b.status === "TRIAL") return b.trialEndsAt ? `${new Date(b.trialEndsAt).getTime() < now ? "Trial ended" : "Trial ends"} ${day(b.trialEndsAt)}` : null;
  if ((b.status === "ACTIVE" || b.status === "OVERDUE") && b.currentPeriodEnd) return `Next billing date ${day(b.currentPeriodEnd)}`;
  return null;
}

/** BR-9 (review M1): after a return from Stripe, the record confirms the change when it shows a card that keeps access
 *  (trial or active, not held) and either the first read after the return already did (the webhook was first) or the
 *  record moved from that first read (an overdue firm whose old card was on file, now paid). */
const good = (b: Billing) => b.cardOnFile === true && (b.status === "TRIAL" || b.status === "ACTIVE") && b.firmStatus !== "PAYMENT_HOLD";
const moved = (a: Billing, b: Billing) => a.status !== b.status || a.firmStatus !== b.firmStatus || a.cardOnFile !== b.cardOnFile || a.currentPeriodEnd !== b.currentPeriodEnd;
export const confirmed = (first: Billing, now: Billing) => good(now) && (good(first) || moved(first, now));

export const seatsLine = (b: Billing) => b.seatsLimit === null ? `${b.seatsUsed} ${b.seatsUsed === 1 ? "seat" : "seats"} used` : `${b.seatsUsed} of ${b.seatsLimit} seats used`;

/** The card button's words: "Add a card" while none is known on file in a trial, else "Update card or pay". */
export const cardLabel = (b: Billing) => b.status === "TRIAL" && b.cardOnFile !== true ? "Add a card" : "Update card or pay";

/** Only Stripe's own https pages are followed (a hand-off answer is never trusted to send the browser elsewhere). */
export function stripeUrl(raw: string): string | null {
  try { const u = new URL(raw); return u.protocol === "https:" && /(^|\.)stripe\.com$/.test(u.hostname) ? u.href : null; } catch { return null; }
}
/** R1.21 (P-796): the billing stand-in's own invoice page, on this app's own address only. */
export const STAND_IN_INVOICE_PATH = "/api/demo/billing/invoices/";
export function standInUrl(raw: string, origin: string = globalThis.location?.origin ?? ""): string | null {
  try { const u = new URL(raw); return origin && u.origin === origin && u.pathname.startsWith(STAND_IN_INVOICE_PATH) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
/** An invoice's hosted link: Stripe's own https page, or the stand-in's page on this app's own address. */
export const invoiceUrl = (raw: string | null) => raw ? stripeUrl(raw) ?? standInUrl(raw) : null;
/** R1.21: the tax cell's words, e.g. "$6.37 CAD (HST 13 %, ON)"; "Not worked out yet" when the provider has not said. */
export function taxWords(i: { taxCents: number | null; currency: string; taxLines: { name: string; jurisdiction: string | null; ratePpm: number | null }[] }): string {
  if (i.taxCents === null) return "Not worked out yet";
  const named = i.taxLines.map((t) => [t.name, t.ratePpm === null ? "" : `${(t.ratePpm / 10_000).toLocaleString("en-CA", { maximumFractionDigits: 4 })} %`].filter(Boolean).join(" ") + (t.jurisdiction ? `, ${t.jurisdiction}` : "")).join("; ");
  return `${money(i.taxCents, i.currency)}${named ? ` (${named})` : ""}`;
}
/** Break m8: a currency code the browser does not know falls back to plain digits, never a blank page. */
export const money = (cents: number, currency: string) => { try { return `${(cents / 100).toLocaleString("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" })} ${currency}`; } catch { return `${(cents / 100).toFixed(2)} ${currency}`; } };

export const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export const WORDS = {
  hint: "Opens Stripe's secure billing page. You'll come back here.",
  adminOnly: "Only the Owner can change the plan or cancel.",
  addressNeeded: "Needed before your first invoice: we use it to work out tax.",
  beforeCard: "Before you add a card: your business address. We use it to work out tax.",
  retryStripe: "We couldn't send your address to Stripe last time. Save it again so Stripe has it for tax.",
  stripeDown: "We couldn't open Stripe. Try again.",
  checking: "Checking for changes from Stripe…",
  slow: "This is taking longer than usual. We haven't seen the change from Stripe yet; refresh in a minute.",
  noView: "Plan details are for the firm's Owner and Admin.",
} as const;
