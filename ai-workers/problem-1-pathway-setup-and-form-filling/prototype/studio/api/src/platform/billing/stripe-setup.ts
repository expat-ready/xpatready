// R1.91 part 1 (PF-16 "the Stripe set-up script under api/src/platform/billing/"; shape product/screens/R1.91/shape.md):
// makes a Stripe test-mode account ready for our own billing of firms. Idempotent, safe to run again:
//   * each active plan with a Sample price gets a product and a monthly and a yearly CAD price, found again by the
//     price's `lookup_key` (`xr-plan-<code>-<month|year>-v1`); amounts and currency come from platform_plan (Sample,
//     QA-741), prices are tax-exclusive ("+ applicable taxes", Stripe Tax adds GST/HST/QST on top);
//   * a price already there under that key with another amount, currency or interval is a conflict: nothing is written
//     and the run fails (Stripe prices cannot change; a new price needs a new key version, the tech lead's call);
//   * the found or made price ids are written to platform_plan.stripe_monthly_price_id / stripe_yearly_price_id;
//   * the Customer Portal's one configuration (PORTAL_FEATURES: card, invoices, cancel at period end, plan switching off)
//     through ensurePortalConfiguration, the same function the portal hand-off uses;
//   * Smart Retries "within 14 days" has no API (Billing settings in the dashboard): printed as a checklist line.
// Test keys only, everywhere: a live key is refused before any call (sk_live_/rk_live_), whatever PLATFORM_ENVIRONMENT.
//   DATABASE_URL=… STRIPE_TEST_SECRET_KEY=sk_test_… tsx api/src/platform/billing/stripe-setup.ts [--dry-run]
// (PLATFORM_STRIPE_SECRET_KEY is read when STRIPE_TEST_SECRET_KEY is unset.) US$0: test mode charges nothing.
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import { ensurePortalConfiguration } from "./stripe.ts";

export type Interval = "month" | "year";
export type PlanRow = { code: string; name: string; monthlyPriceCents: number | null; yearlyPriceCents: number | null; currency: string };
export type PriceLine = { code: string; interval: Interval; priceId: string | null; created: boolean; amountCents: number };
export type Conflict = { code: string; interval: Interval; lookupKey: string; priceId: string; want: { amountCents: number; currency: string }; has: { amountCents: number | null; currency: string; interval: string | null } };
export type SetUpResult = { prices: PriceLine[]; conflicts: Conflict[]; portal: { id: string | null; created: boolean }; checklist: string[] };

export const SMART_RETRIES_LINE = "Dashboard › Billing › Revenue recovery › Retries: Smart Retries on, retry for up to 2 weeks, then pause or mark unpaid (PF-16; no API for this setting)";
export const lookupKey = (code: string, interval: Interval) => `xr-plan-${code}-${interval}-v1`;

/** A test key, or the reason it is refused. Checked before the library is even made. */
export function keyProblem(key: string | undefined): string | null {
  if (!key) return "no key: set STRIPE_TEST_SECRET_KEY (or PLATFORM_STRIPE_SECRET_KEY) to a test-mode key";
  if (/^(sk|rk)_live_/.test(key)) return "a live key is refused: the set-up script runs on test-mode keys only";
  if (!/^(sk|rk)_test_[A-Za-z0-9]{8,255}$/.test(key)) return "not a Stripe test key (sk_test_… or rk_test_…)";
  return null;
}

/** What each plan's two prices should be; a plan with no Sample price for a period gets none for it. */
export function wanted(plans: PlanRow[]) {
  return plans.flatMap((p) => ([["month", p.monthlyPriceCents], ["year", p.yearlyPriceCents]] as const)
    .filter(([, c]) => Number.isInteger(c) && (c as number) > 0)
    .map(([interval, c]) => ({ plan: p, interval: interval as Interval, amountCents: c as number, currency: p.currency.toLowerCase(), lookupKey: lookupKey(p.code, interval) })));
}

/** Finds or makes the prices and the portal configuration. Reads first; with conflicts, or with `dryRun`, makes nothing. */
export async function setUpStripe(stripe: Stripe, plans: PlanRow[], opts: { dryRun?: boolean } = {}): Promise<SetUpResult> {
  const want = wanted(plans), conflicts: Conflict[] = [], prices: PriceLine[] = [];
  const found = new Map<string, Stripe.Price>();
  for (let i = 0; i < want.length; i += 10) {   // lookup_keys: at most 10 per list call
    const keys = want.slice(i, i + 10).map((w) => w.lookupKey);
    for (const p of (await stripe.prices.list({ lookup_keys: keys, active: true, limit: 100 })).data) if (p.lookup_key) found.set(p.lookup_key, p);
  }
  for (const w of want) {
    const p = found.get(w.lookupKey);
    if (!p) continue;
    const interval = p.recurring?.interval ?? null;
    if (p.unit_amount !== w.amountCents || p.currency !== w.currency || interval !== w.interval)
      conflicts.push({ code: w.plan.code, interval: w.interval, lookupKey: w.lookupKey, priceId: p.id, want: { amountCents: w.amountCents, currency: w.currency }, has: { amountCents: p.unit_amount, currency: p.currency, interval } });
  }
  const checklist = [SMART_RETRIES_LINE];
  if (conflicts.length || opts.dryRun) {
    for (const w of want) prices.push({ code: w.plan.code, interval: w.interval, priceId: found.get(w.lookupKey)?.id ?? null, created: false, amountCents: w.amountCents });
    return { prices, conflicts, portal: { id: null, created: false }, checklist };
  }
  const products = new Map<string, string>();
  for (const w of want) {
    const had = found.get(w.lookupKey);
    if (had) { prices.push({ code: w.plan.code, interval: w.interval, priceId: had.id, created: false, amountCents: w.amountCents }); products.set(w.plan.code, typeof had.product === "string" ? had.product : had.product.id); continue; }
    let product = products.get(w.plan.code);
    if (!product) {
      product = (await stripe.products.create({ name: w.plan.name, metadata: { xr_plan: w.plan.code } }, { idempotencyKey: `xr-product-${w.plan.code}-v1` })).id;
      products.set(w.plan.code, product);
    }
    const made = await stripe.prices.create({
      product, currency: w.currency, unit_amount: w.amountCents, recurring: { interval: w.interval }, tax_behavior: "exclusive",
      lookup_key: w.lookupKey, nickname: `${w.plan.name} ${w.interval === "month" ? "monthly" : "yearly"}`, metadata: { xr_plan: w.plan.code },
    }, { idempotencyKey: `xr-price-${w.lookupKey}` });
    prices.push({ code: w.plan.code, interval: w.interval, priceId: made.id, created: true, amountCents: w.amountCents });
  }
  const portal = await ensurePortalConfiguration(stripe);
  return { prices, conflicts, portal, checklist };
}

/** The ids to write to platform_plan, per plan code (only a period that has a price). */
export function priceColumns(r: SetUpResult) {
  const out = new Map<string, { stripeMonthlyPrice?: string; stripeYearlyPrice?: string }>();
  for (const l of r.prices) {
    if (!l.priceId) continue;
    const row = out.get(l.code) ?? {};
    row[l.interval === "month" ? "stripeMonthlyPrice" : "stripeYearlyPrice"] = l.priceId;
    out.set(l.code, row);
  }
  return out;
}

type PlanTable = {
  platformPlan: {
    findMany(a: { where: { active: true }; orderBy: { code: "asc" }; select: Record<keyof PlanRow, true> }): Promise<PlanRow[]>;
    update(a: { where: { code: string }; data: { stripeMonthlyPrice?: string; stripeYearlyPrice?: string } }): Promise<unknown>;
  };
};

/** The script's work on one copy: reads the active plans, sets Stripe up, and (no conflict, not a dry run) writes the ids. */
export async function applyToPlans(db: PlanTable, stripe: Stripe, opts: { dryRun?: boolean } = {}) {
  const plans = await db.platformPlan.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { code: true, name: true, monthlyPriceCents: true, yearlyPriceCents: true, currency: true } });
  const r = await setUpStripe(stripe, plans, opts);
  if (!r.conflicts.length && !opts.dryRun) for (const [code, cols] of priceColumns(r)) await db.platformPlan.update({ where: { code }, data: cols });
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes("--dry-run");
  const key = process.env.STRIPE_TEST_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY;
  const bad = keyProblem(key);
  if (bad) { console.log(`stripe set-up: refused — ${bad}`); process.exit(2); }
  if (!process.env.DATABASE_URL) { console.log("stripe set-up: refused — DATABASE_URL is not set (the copy whose plans get the price ids)"); process.exit(2); }
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC" }) });
  try {
    const r = await applyToPlans(db, new Stripe(key!, { maxNetworkRetries: 2, timeout: 20_000 }), { dryRun });
    for (const l of r.prices) console.log(`price  ${l.code} ${l.interval}: ${l.priceId ?? "(none yet)"}${l.created ? " (made)" : ""}  ${l.amountCents} cents`);
    for (const c of r.conflicts) console.log(`CONFLICT  ${c.lookupKey} is ${c.priceId}: ${JSON.stringify(c.has)}, the plan table says ${JSON.stringify(c.want)} — nothing written`);
    if (r.conflicts.length) process.exit(1);
    console.log(`portal configuration: ${r.portal.id ?? "(dry run: not made)"}${r.portal.created ? " (made)" : ""}`);
    for (const c of r.checklist) console.log(`CHECKLIST  ${c}`);
    console.log(`stripe set-up: ${dryRun ? "dry run, nothing written" : `done, ${r.prices.filter((l) => l.created).length} price(s) made, platform_plan updated`}`);
  } finally { await db.$disconnect(); }
}
