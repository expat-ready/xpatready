// R1.91 part 1 (PF-16 "the Stripe set-up script under api/src/platform/billing/"; shape product/screens/R1.91/shape.md):
// makes a Stripe test-mode account ready for our own billing of firms. Idempotent, safe to run again:
//   * each active plan with a Sample price gets a product and a monthly and a yearly CAD price, found again by the
//     price's `lookup_key` (`xr-plan-<code>-<month|year>-v1`); amounts and currency come from platform_plan (Sample,
//     QA-741), prices are tax-exclusive ("+ applicable taxes", Stripe Tax adds GST/HST/QST on top);
//   * a price already there under that key (active or archived) that differs in anything a charge depends on (amount,
//     currency, recurring, period and count, metered, tax behaviour, plan) is a conflict: nothing is written and the run
//     fails (Stripe prices cannot change; a new price needs a new key version, the tech lead's call);
//   * one product per plan (the product of a price already made, else one found by its metadata, else a new one);
//   * the found or made price ids are written to platform_plan.stripe_monthly_price_id / stripe_yearly_price_id, and a
//     period the plan table no longer prices is cleared (null), so an old price is never offered;
//   * the Customer Portal's one configuration (PORTAL_FEATURES: card, invoices, cancel at period end, plan switching off)
//     through ensurePortalConfiguration, the same function the portal hand-off uses, read back and compared: a
//     configuration that differs is a conflict;
//   * Smart Retries "within 14 days" and the account's tax registrations have no API here (dashboard): checklist lines.
// Test keys only, everywhere: a live key is refused before any call (sk_live_/rk_live_), and PLATFORM_ENVIRONMENT=production
// is refused. STRIPE_TEST_SECRET_KEY wins over PLATFORM_STRIPE_SECRET_KEY; the run prints which it used (never the key).
//   DATABASE_URL=… STRIPE_TEST_SECRET_KEY=sk_test_… tsx api/src/platform/billing/stripe-setup.ts [--dry-run]
// (PLATFORM_STRIPE_SECRET_KEY is read when STRIPE_TEST_SECRET_KEY is unset.) US$0: test mode charges nothing.
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import { ensurePortalConfiguration } from "./stripe.ts";

export type Interval = "month" | "year";
export type PlanRow = { code: string; name: string; monthlyPriceCents: number | null; yearlyPriceCents: number | null; currency: string };
export type PriceLine = { code: string; interval: Interval; priceId: string | null; created: boolean; amountCents: number };
export type Conflict = { code: string; interval: Interval; lookupKey: string; priceId: string; reasons: string[] };
export type SetUpResult = { prices: PriceLine[]; conflicts: Conflict[]; portal: { id: string | null; created: boolean; problems: string[] }; checklist: string[] };

export const SMART_RETRIES_LINE = "Dashboard › Billing › Revenue recovery › Retries: Smart Retries on, retry for up to 2 weeks, then pause or mark unpaid (PF-16; no API for this setting)";
export const TAX_LINE = "Dashboard › Tax: the account's Canadian registrations (GST/HST, and QST where registered) and a default product tax code; Stripe Tax adds tax only where the account is registered (A46 row 21)";
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
type Want = ReturnType<typeof wanted>[number];

/** Why a price Stripe holds under our lookup key is not the price the plan table asks for (empty: it is). Every field a
 *  charge depends on: archived, amount, currency, one-time or recurring, the period and its count, metered, tax
 *  behaviour (exclusive: "+ applicable taxes"), and the plan it was made for. */
export function priceProblems(p: Stripe.Price, w: Want): string[] {
  const out: string[] = [], r = p.recurring;
  if (!p.active) out.push("archived (a lookup key stays on an archived price: a new key version is needed)");
  if (p.unit_amount !== w.amountCents) out.push(`amount ${p.unit_amount} cents, the plan table says ${w.amountCents}`);
  if (p.currency !== w.currency) out.push(`currency ${p.currency}, the plan table says ${w.currency}`);
  if (p.type !== "recurring" || !r) out.push("not a recurring price");
  else {
    if (r.interval !== w.interval) out.push(`every ${r.interval}, the plan table says every ${w.interval}`);
    if (r.interval_count !== 1) out.push(`every ${r.interval_count} ${r.interval}s, not every 1`);
    if (r.usage_type !== "licensed") out.push(`usage ${r.usage_type}, not licensed`);
  }
  if (p.tax_behavior !== "exclusive") out.push(`tax ${p.tax_behavior ?? "unspecified"}, not exclusive ("+ applicable taxes")`);
  if (p.metadata?.xr_plan !== w.plan.code) out.push(`made for plan ${p.metadata?.xr_plan ?? "(none)"}, not ${w.plan.code}`);
  return out;
}

/** Why the portal configuration is not PORTAL_FEATURES (empty: it is). Plan switching there would skip checkDowngrade. */
export function portalProblems(c: Stripe.BillingPortal.Configuration): string[] {
  const f = c.features, out: string[] = [];
  if (!c.active) out.push("the configuration is deactivated");
  if (f.subscription_update?.enabled) out.push("plan switching is on (it must be off: PF-16, SA-3-58)");
  if (!f.subscription_cancel?.enabled || f.subscription_cancel.mode !== "at_period_end") out.push("cancel is not 'at period end'");
  if (!f.payment_method_update?.enabled) out.push("card update is off");
  if (!f.invoice_history?.enabled) out.push("invoice history is off");
  return out;
}

/** Finds or makes the prices and the portal configuration. Reads first; with conflicts, or with `dryRun`, makes nothing. */
export async function setUpStripe(stripe: Stripe, plans: PlanRow[], opts: { dryRun?: boolean } = {}): Promise<SetUpResult> {
  const want = wanted(plans), conflicts: Conflict[] = [], prices: PriceLine[] = [];
  const found = new Map<string, Stripe.Price>();
  for (let i = 0; i < want.length; i += 10) {   // lookup_keys: at most 10 per list call; active and archived both
    const keys = want.slice(i, i + 10).map((w) => w.lookupKey);
    for await (const p of stripe.prices.list({ lookup_keys: keys, limit: 100 })) if (p.lookup_key) found.set(p.lookup_key, p);
  }
  for (const w of want) {
    const p = found.get(w.lookupKey), reasons = p ? priceProblems(p, w) : [];
    if (p && reasons.length) conflicts.push({ code: w.plan.code, interval: w.interval, lookupKey: w.lookupKey, priceId: p.id, reasons });
  }
  const checklist = [SMART_RETRIES_LINE, TAX_LINE];
  if (conflicts.length || opts.dryRun) {
    for (const w of want) prices.push({ code: w.plan.code, interval: w.interval, priceId: found.get(w.lookupKey)?.id ?? null, created: false, amountCents: w.amountCents });
    return { prices, conflicts, portal: { id: null, created: false, problems: [] }, checklist };
  }
  // One product per plan: the product of a price already made for it, else one made before (by its metadata; a run that
  // stopped between the product and its price), else a new one.
  const products = new Map<string, string>();
  for (const w of want) { const had = found.get(w.lookupKey); if (had) products.set(w.plan.code, typeof had.product === "string" ? had.product : had.product.id); }
  if (want.some((w) => !found.has(w.lookupKey) && !products.has(w.plan.code)))
    for await (const pr of stripe.products.list({ active: true, limit: 100 })) { const code = pr.metadata?.xr_plan; if (code && !products.has(code)) products.set(code, pr.id); }
  for (const w of want) {
    const had = found.get(w.lookupKey);
    if (had) { prices.push({ code: w.plan.code, interval: w.interval, priceId: had.id, created: false, amountCents: w.amountCents }); continue; }
    let product = products.get(w.plan.code);
    if (!product) {
      product = (await stripe.products.create({ name: w.plan.name, metadata: { xr_plan: w.plan.code } }, { idempotencyKey: `xr-product-${w.plan.code}-v1` })).id;
      products.set(w.plan.code, product);
    }
    const made = await stripe.prices.create({
      product, currency: w.currency, unit_amount: w.amountCents, recurring: { interval: w.interval, interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive",
      lookup_key: w.lookupKey, nickname: `${w.plan.name} ${w.interval === "month" ? "monthly" : "yearly"}`, metadata: { xr_plan: w.plan.code },
    }, { idempotencyKey: `xr-price-${w.lookupKey}-${w.amountCents}` });
    const bad = priceProblems(made, w);
    if (made.lookup_key !== w.lookupKey || bad.length) throw new Error(`Stripe answered the new ${w.lookupKey} price with ${made.id}: ${bad.join("; ") || "another lookup key"}`);
    prices.push({ code: w.plan.code, interval: w.interval, priceId: made.id, created: true, amountCents: w.amountCents });
  }
  const { id, created } = await ensurePortalConfiguration(stripe);
  const problems = portalProblems(await stripe.billingPortal.configurations.retrieve(id));
  return { prices, conflicts, portal: { id, created, problems }, checklist };
}

/** The ids to write to platform_plan, per plan: the found or made price of each period, or null for a period the plan
 *  table no longer prices (an old id would still be offered and sold: signup.ts, plan-change/service.ts). */
export function priceColumns(r: SetUpResult, plans: PlanRow[]) {
  const id = (code: string, i: Interval) => r.prices.find((l) => l.code === code && l.interval === i)?.priceId ?? null;
  return new Map(plans.map((p) => [p.code, { stripeMonthlyPrice: id(p.code, "month"), stripeYearlyPrice: id(p.code, "year") }]));
}

type PlanTable = {
  platformPlan: {
    findMany(a: { where: { active: true }; orderBy: { code: "asc" }; select: Record<keyof PlanRow, true> }): Promise<PlanRow[]>;
    update(a: { where: { code: string }; data: { stripeMonthlyPrice: string | null; stripeYearlyPrice: string | null } }): Promise<unknown>;
  };
};

/** The script's work on one copy: reads the active plans, sets Stripe up, and (no conflict, not a dry run) writes the ids. */
export async function applyToPlans(db: PlanTable, stripe: Stripe, opts: { dryRun?: boolean } = {}) {
  const plans = await db.platformPlan.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { code: true, name: true, monthlyPriceCents: true, yearlyPriceCents: true, currency: true } });
  const r = await setUpStripe(stripe, plans, opts);
  if (!r.conflicts.length && !r.portal.problems.length && !opts.dryRun) for (const [code, cols] of priceColumns(r, plans)) await db.platformPlan.update({ where: { code }, data: cols });
  return r;
}

/** The command line's words: `--dry-run` only; anything else is refused (a mistyped flag never does a full run). */
export function cliArgs(argv: string[]): { dryRun: boolean } | { problem: string } {
  const unknown = argv.filter((a) => a !== "--dry-run");
  return unknown.length ? { problem: `unknown argument ${JSON.stringify(unknown[0])} (the one flag is --dry-run)` } : { dryRun: argv.includes("--dry-run") };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = cliArgs(process.argv.slice(2));
  if ("problem" in args) { console.log(`stripe set-up: refused — ${args.problem}`); process.exit(2); }
  const { dryRun } = args, from = process.env.STRIPE_TEST_SECRET_KEY ? "STRIPE_TEST_SECRET_KEY" : "PLATFORM_STRIPE_SECRET_KEY";
  const key = process.env.STRIPE_TEST_SECRET_KEY || process.env.PLATFORM_STRIPE_SECRET_KEY;
  const bad = keyProblem(key);
  if (bad) { console.log(`stripe set-up: refused — ${bad}`); process.exit(2); }
  if (process.env.PLATFORM_ENVIRONMENT === "production") { console.log("stripe set-up: refused — PLATFORM_ENVIRONMENT=production: test price ids never go into a production plan table"); process.exit(2); }
  if (!process.env.DATABASE_URL) { console.log("stripe set-up: refused — DATABASE_URL is not set (the copy whose plans get the price ids)"); process.exit(2); }
  console.log(`stripe set-up: test-mode key from ${from}${dryRun ? ", dry run" : ""}`);
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC" }) });
  let code = 0;
  try {
    const r = await applyToPlans(db, new Stripe(key!, { maxNetworkRetries: 2, timeout: 20_000 }), { dryRun });
    for (const l of r.prices) console.log(`price  ${l.code} ${l.interval}: ${l.priceId ?? "(none yet)"}${l.created ? " (made)" : ""}  ${l.amountCents} cents`);
    for (const c of r.conflicts) console.log(`CONFLICT  ${c.lookupKey} is ${c.priceId}: ${c.reasons.join("; ")}`);
    for (const pp of r.portal.problems) console.log(`CONFLICT  portal configuration ${r.portal.id}: ${pp}`);
    console.log(`portal configuration: ${r.portal.id ?? "(not made: dry run or a conflict)"}${r.portal.created ? " (made)" : ""}`);
    for (const c of r.checklist) console.log(`CHECKLIST  ${c}`);
    if (r.conflicts.length || r.portal.problems.length) { console.log("stripe set-up: stopped — platform_plan not written (fix the conflicts above, or a new lookup key version: the tech lead's call)"); code = 1; }
    else console.log(`stripe set-up: ${dryRun ? "dry run, nothing written" : `done, ${r.prices.filter((l) => l.created).length} price(s) made, platform_plan updated`}`);
  } catch (e) {
    const why = String((e as Error).message ?? e).split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "unknown error";   // one line: the cause (a Prisma or Stripe message's last line)
    console.log(`stripe set-up: failed — ${why}. platform_plan not written; Stripe objects already made are found again by the next run.`);
    code = 1;
  } finally { await db.$disconnect(); }
  process.exit(code);
}
