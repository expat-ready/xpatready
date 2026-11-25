// R1.91 part 1 (shape product/screens/R1.91/shape.md §2; PF-16's Stripe set-up script): the set-up script and the event
// relay, a pass and a fail per line, on recorded Stripe answers served to Stripe's own library through its fetch client
// (no network; CI and lanes never make a live call, MODULE.md). One scratch database with every migration (removed) for
// the price ids written to platform_plan. The relay's events are verified by the adapter our webhook route uses
// (StripeBilling.readEvent, the library's constructEvent). No server, no browser, no model call (US$0).
// With STRIPE_TEST_SECRET_KEY set to a test key (the live proof's GitHub Actions job, the Lead's ruling on #3636), one
// extra read-only line runs the script's dry run against Stripe test mode; without it that line is SKIPPED by name.
//   tsx studio/tests/check_pf16_stripe_setup.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { PORTAL_FEATURES } from "../ports/billing.ts";
import { StripeBilling, ensurePortalConfiguration } from "../api/src/platform/billing/stripe.ts";
import { SMART_RETRIES_LINE, applyToPlans, keyProblem, lookupKey, priceColumns, setUpStripe, wanted, type PlanRow } from "../api/src/platform/billing/stripe-setup.ts";
import { BILLING_EVENT_TYPES, StripeRelay, relayFromKey } from "./journeys/stripe-relay.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_r191s_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
/** Stripe's library sends a list as `name[0]`, `name[1]`, … */
const listOf = (q: URLSearchParams, name: string) => [...q.entries()].filter(([k]) => k.startsWith(`${name}[`) && /\[\d*\]$/.test(k)).map(([, v]) => v);
const throwsWith = async (f: () => unknown, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test((e as Error).message); } };

type Call = { method: string; path: string; form: URLSearchParams; query: URLSearchParams; headers: Headers };
/** Recorded Stripe answers with state: products, prices (found by lookup_key), portal configurations and events, in
 *  the shapes Stripe's API returns (cut to the fields read). Idempotency keys give the same answer, as Stripe does. */
function recordedStripe(seed: { events?: Array<Record<string, unknown>> } = {}) {
  const calls: Call[] = [], byKey = new Map<string, unknown>();
  const products: Array<{ id: string; name: string }> = [];
  const prices: Array<{ id: string; product: string; unit_amount: number; currency: string; recurring: { interval: string }; lookup_key: string | null; tax_behavior: string; active: boolean }> = [];
  const configs: Array<{ id: string; metadata: Record<string, string>; form: URLSearchParams }> = [];
  const events = [...(seed.events ?? [])];
  let n = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new globalThis.URL(String(input)), method = init?.method ?? "GET", headers = new Headers(init?.headers);
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : ""), query = url.searchParams;
    calls.push({ method, path: url.pathname, form, query, headers });
    const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": `req_rec${++n}` } });
    const key = headers.get("idempotency-key"), memo = key && `${url.pathname}:${key}`;
    if (memo && byKey.has(memo)) return answer(200, byKey.get(memo));
    let body: unknown;
    if (method === "GET" && url.pathname === "/v1/prices") {
      const keys = listOf(query, "lookup_keys"), active = query.get("active");
      body = { object: "list", has_more: false, data: prices.filter((p) => keys.includes(p.lookup_key ?? "") && (active === null || String(p.active) === active)).map((p) => ({ object: "price", ...p })) };
    } else if (method === "POST" && url.pathname === "/v1/products") {
      const p = { id: `prod_rec${String(++n).padStart(4, "0")}`, name: form.get("name") ?? "" }; products.push(p); body = { object: "product", ...p };
    } else if (method === "POST" && url.pathname === "/v1/prices") {
      const lk = form.get("lookup_key");
      if (lk && prices.some((p) => p.lookup_key === lk)) return answer(400, { error: { type: "invalid_request_error", message: "A price with this lookup_key already exists" } });
      const p = { id: `price_rec${String(++n).padStart(4, "0")}`, product: form.get("product") ?? "", unit_amount: Number(form.get("unit_amount")), currency: form.get("currency") ?? "", recurring: { interval: form.get("recurring[interval]") ?? "" }, lookup_key: lk, tax_behavior: form.get("tax_behavior") ?? "unspecified", active: true };
      prices.push(p); body = { object: "price", ...p };
    } else if (method === "GET" && url.pathname === "/v1/billing_portal/configurations") body = { object: "list", has_more: false, data: configs.map((c) => ({ object: "billing_portal.configuration", id: c.id, active: true, metadata: c.metadata })) };
    else if (method === "POST" && url.pathname === "/v1/billing_portal/configurations") {
      const c = { id: `bpc_rec${++n}`, metadata: { pf5: form.get("metadata[pf5]") ?? "" }, form }; configs.push(c); body = { object: "billing_portal.configuration", id: c.id, metadata: c.metadata };
    } else if (method === "GET" && url.pathname === "/v1/events") {
      const gte = Number(query.get("created[gte]") ?? 0), types = listOf(query, "types");
      body = { object: "list", has_more: false, data: events.filter((e) => (e.created as number) >= gte && (!types.length || types.includes(e.type as string))).sort((a, b) => (b.created as number) - (a.created as number)) };
    } else return answer(404, { error: { type: "invalid_request_error", message: `unrecorded ${method} ${url.pathname}` } });
    if (memo) byKey.set(memo, body);
    return answer(200, body);
  }) as typeof fetch;
  const stripe = new Stripe("sk_test_recordedOnly000000", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(fetchFn) });
  return { stripe, calls, products, prices, configs, events, posts: () => calls.filter((c) => c.method === "POST") };
}

const PLANS: PlanRow[] = [
  { code: "firm", name: "Firm (Sample)", monthlyPriceCents: 19900, yearlyPriceCents: 199000, currency: "CAD" },
  { code: "solo", name: "Solo (Sample)", monthlyPriceCents: 4900, yearlyPriceCents: 49000, currency: "CAD" },
  { code: "team", name: "Team (Sample)", monthlyPriceCents: 9900, yearlyPriceCents: 99000, currency: "CAD" },
];

// ── keys: test keys only ─────────────────────────────────────────────────────────────────────────────────────────────
ok("R1.91-1 key: a test key passes (sk_test_, rk_test_)", keyProblem("sk_test_abcdefgh12") === null && keyProblem("rk_test_abcdefgh12") === null);
ok("R1.91-1 key: a live key is refused (sk_live_, rk_live_), none, or not a key", /live key is refused/.test(keyProblem("sk_live_abcdefgh12") ?? "") && /live key/.test(keyProblem("rk_live_abcdefgh12") ?? "") && /no key/.test(keyProblem(undefined) ?? "") && /not a Stripe test key/.test(keyProblem("pk_test_abcdefgh12") ?? ""));
{
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [join(STUDIO, "api", "src", "platform", "billing", "stripe-setup.ts")], { encoding: "utf8", env: { ...process.env, STRIPE_TEST_SECRET_KEY: "sk_live_abcdefgh12345678", DATABASE_URL: "postgresql://nobody@127.0.0.1:1/none", HTTPS_PROXY: "http://127.0.0.1:1" } });
  ok("R1.91-1 key: the script with a live key exits 2 before any call or database read", r.status === 2 && /live key is refused/.test(r.stdout), { status: r.status, out: r.stdout + r.stderr });
}

// ── the plan prices ──────────────────────────────────────────────────────────────────────────────────────────────────
ok("R1.91-1 wanted: two prices per plan with a Sample price; none for a period with no price", wanted(PLANS).length === 6 && wanted([{ ...PLANS[0], yearlyPriceCents: null }]).map((w) => w.interval).join() === "month" && wanted([{ ...PLANS[0], monthlyPriceCents: 0, yearlyPriceCents: null }]).length === 0);
{
  const s = recordedStripe(), r = await setUpStripe(s.stripe, PLANS);
  const team = s.prices.filter((p) => p.lookup_key?.startsWith("xr-plan-team-"));
  ok("R1.91-1 first run: 3 products and 6 prices made, one product per plan", r.prices.length === 6 && r.prices.every((l) => l.created) && s.products.length === 3 && new Set(s.prices.map((p) => p.product)).size === 3, r.prices);
  ok("R1.91-1 first run: each price is CAD, tax-exclusive, recurring by its period, with its lookup key and the plan table's amount", team.length === 2 && team.every((p) => p.currency === "cad" && p.tax_behavior === "exclusive") && team.find((p) => p.lookup_key === lookupKey("team", "month"))?.unit_amount === 9900 && team.find((p) => p.lookup_key === lookupKey("team", "year"))?.recurring.interval === "year" && team.find((p) => p.lookup_key === lookupKey("team", "year"))?.unit_amount === 99000, team);
  const c = s.configs[0]?.form;
  ok("R1.91-1 first run: the portal configuration is made once: card, invoices, cancel at period end on; plan switching and customer update off (PF-16)", r.portal.created && s.configs.length === 1 && c?.get("features[subscription_update][enabled]") === "false" && c?.get("features[subscription_cancel][enabled]") === "true" && c?.get("features[subscription_cancel][mode]") === "at_period_end" && c?.get("features[payment_method_update][enabled]") === "true" && c?.get("features[invoice_history][enabled]") === "true" && c?.get("features[customer_update][enabled]") === "false", c && Object.fromEntries(c));
  ok("R1.91-1 portal features are PORTAL_FEATURES (one definition): no plan switching on the portal", PORTAL_FEATURES.subscription_update.enabled === false && PORTAL_FEATURES.subscription_cancel.mode === "at_period_end");
  ok("R1.91-1 Smart Retries is a checklist line (no API)", r.checklist.includes(SMART_RETRIES_LINE) && /2 weeks/.test(SMART_RETRIES_LINE));
  ok("R1.91-1 every creating call carries an idempotency key", s.posts().every((p) => !!p.headers.get("idempotency-key")), s.posts().map((p) => p.path));

  const before = s.posts().length, again = await setUpStripe(s.stripe, PLANS);
  ok("R1.91-1 second run: nothing made (prices found by lookup key, the portal by its metadata), the same ids", s.posts().length === before && again.prices.every((l) => !l.created) && again.prices.map((l) => l.priceId).join() === r.prices.map((l) => l.priceId).join() && !again.portal.created && again.portal.id === r.portal.id, { posts: s.posts().length - before });
  ok("R1.91-1 a plan added later: only its two prices are made", (await setUpStripe(s.stripe, [...PLANS, { code: "pro", name: "Pro (Sample)", monthlyPriceCents: 29900, yearlyPriceCents: 299000, currency: "CAD" }])).prices.filter((l) => l.created).map((l) => l.code).join() === "pro,pro");

  const posts = s.posts().length, changed = await setUpStripe(s.stripe, PLANS.map((p) => (p.code === "team" ? { ...p, monthlyPriceCents: 10900 } : p)));
  ok("R1.91-1 conflict: a price under the key with another amount is named, and nothing is made", changed.conflicts.length === 1 && changed.conflicts[0].lookupKey === lookupKey("team", "month") && changed.conflicts[0].has.amountCents === 9900 && changed.conflicts[0].want.amountCents === 10900 && s.posts().length === posts && changed.portal.id === null, changed.conflicts);
  ok("R1.91-1 conflict: another currency is a conflict too", (await setUpStripe(s.stripe, [{ ...PLANS[2], currency: "USD" }])).conflicts.length === 2);
}
{
  const s = recordedStripe(), r = await setUpStripe(s.stripe, PLANS, { dryRun: true });
  ok("R1.91-1 dry run: reads only, makes nothing, no portal", s.posts().length === 0 && r.prices.every((l) => l.priceId === null && !l.created) && r.portal.id === null);
}
{
  const s = recordedStripe(), found = await ensurePortalConfiguration(s.stripe), again = await ensurePortalConfiguration(s.stripe);
  const billing = new StripeBilling(s.stripe), url = await billing.portal({ customerId: "cus_rec1", returnUrl: "https://app.example.com/billing" }).catch((e: Error) => e.message);
  ok("R1.91-1 the portal hand-off and the script share one configuration (found, not made again)", found.created && !again.created && again.id === found.id && s.configs.length === 1 && typeof url === "string", { url });
}
ok("R1.91-1 priceColumns: month → stripeMonthlyPrice, year → stripeYearlyPrice; a period with no id is left out", JSON.stringify([...priceColumns({ prices: [{ code: "team", interval: "month", priceId: "price_a", created: true, amountCents: 1 }, { code: "team", interval: "year", priceId: null, created: false, amountCents: 1 }], conflicts: [], portal: { id: null, created: false }, checklist: [] })]) === JSON.stringify([["team", { stripeMonthlyPrice: "price_a" }]]));

// ── the price ids reach platform_plan (scratch database) ────────────────────────────────────────────────────────────
execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  const s = recordedStripe(), r = await applyToPlans(db, s.stripe);
  const rows = sql(`select code || ':' || coalesce(stripe_monthly_price_id, '-') || ':' || coalesce(stripe_yearly_price_id, '-') from platform_plan where active order by code`).split("\n");
  const id = (code: string, i: "month" | "year") => r.prices.find((l) => l.code === code && l.interval === i)?.priceId;
  ok("R1.91-1 apply: each Sample plan's monthly and yearly price ids are written to platform_plan", rows.length === 3 && rows.every((row) => { const [code, m, y] = row.split(":"); return m === id(code, "month") && y === id(code, "year"); }), rows);
  sql(`update platform_plan set monthly_price_cents = 12345 where code = 'solo'`);
  sql(`update platform_plan set stripe_yearly_price_id = 'price_keptAsIs' where code = 'firm'`);
  const c = await applyToPlans(db, s.stripe);
  ok("R1.91-1 apply with a conflict: platform_plan is left as it was (nothing written)", c.conflicts.length === 1 && sql(`select stripe_yearly_price_id from platform_plan where code = 'firm'`) === "price_keptAsIs", c.conflicts);
  const d = await applyToPlans(db, s.stripe, { dryRun: true });
  ok("R1.91-1 apply as a dry run writes nothing", d.conflicts.length === 1 && sql(`select stripe_yearly_price_id from platform_plan where code = 'firm'`) === "price_keptAsIs");
} finally { await db.$disconnect(); execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); }

// ── the relay ───────────────────────────────────────────────────────────────────────────────────────────────────────
const WHSEC = "whsec_relayPerRun000000000", OTHER_KEY = "whsec_otherKey000000", T0 = 1_764_000_000;
const ev = (id: string, type: string, created: number) => ({ id, object: "event", type, created, livemode: false, api_version: "2026-10-28.endive", data: { object: { object: "subscription", id: "sub_r1", customer: "cus_r1", metadata: { firm_id: "0f5a0000-0000-4000-8000-000000000001" } } } });
{
  const s = recordedStripe({ events: [ev("evt_3", "invoice.paid", T0 + 30), ev("evt_1", "customer.subscription.created", T0 + 10), ev("evt_2", "customer.subscription.updated", T0 + 20), ev("evt_old", "customer.subscription.updated", T0 - 5), ev("evt_x", "customer.created", T0 + 15)] });
  const verifier = new StripeBilling(s.stripe, WHSEC), got: Array<{ id: string; ok: boolean; firm: string | null }> = [];
  let answer = 200;
  const hook = (async (_u: string | URL | Request, init?: RequestInit) => {
    const raw = String(init?.body), sig = new Headers(init?.headers).get("stripe-signature") ?? undefined;
    let facts: { id: string; firmId: string | null } | null = null;
    try { facts = verifier.readEvent(raw, sig); } catch { /* refused below */ }
    got.push({ id: JSON.parse(raw).id, ok: !!facts, firm: facts?.firmId ?? null });
    return new Response(null, { status: answer });
  }) as typeof fetch;
  const relay = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://127.0.0.1:1/api/hooks/stripe", signingKey: WHSEC, sinceSeconds: T0, fetchFn: hook });
  const n = await relay.poll();
  ok("R1.91-1 relay: the asked types since the start, oldest first (an older event and another type are not sent)", n === 3 && got.map((g) => g.id).join() === "evt_1,evt_2,evt_3", got);
  ok("R1.91-1 relay: each body is Stripe's event, signed so our webhook's own check (constructEvent) accepts it", got.every((g) => g.ok && g.firm === "0f5a0000-0000-4000-8000-000000000001"), got);
  const list = s.calls.find((c) => c.path === "/v1/events");
  ok("R1.91-1 relay: the list asks Stripe for created ≥ the start and our billing types only", list?.query.get("created[gte]") === String(T0) && listOf(list.query, "types").join() === BILLING_EVENT_TYPES.join(), list && Object.fromEntries(list.query));
  ok("R1.91-1 relay: a second poll sends nothing again", (await relay.poll()) === 0 && got.length === 3);
  s.events.push(ev("evt_4", "invoice.payment_failed", T0 + 40));
  answer = 500;
  ok("R1.91-1 relay: an event the route does not take (500) is kept, not marked delivered", (await relay.poll()) === 0 && !relay.delivered.has("evt_4") && relay.failures.some((f) => f.id === "evt_4" && f.status === 500));
  answer = 200;
  ok("R1.91-1 relay: and is delivered once on the next poll", (await relay.poll()) === 1 && relay.delivered.has("evt_4") && got.filter((g) => g.id === "evt_4").length === 2 && (await relay.poll()) === 0);
  const tampered = got.length;
  const bad = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: OTHER_KEY, sinceSeconds: T0, fetchFn: hook });
  await bad.poll();
  ok("R1.91-1 relay: signed with another secret, our webhook refuses every event (the secret is the copy's own)", got.slice(tampered).length === 4 && got.slice(tampered).every((g) => !g.ok));
  const p1 = relay.poll(), p2 = relay.poll();
  ok("R1.91-1 relay: two polls at once are one pass (no event sent twice by overlap)", p1 === p2);
  await p1;
  s.events.push(ev("evt_5", "invoice.paid", T0 + 50));
  ok("R1.91-1 relay.waitFor: finds an event once delivered", (await relay.waitFor("invoice.paid", (d) => d.id === "evt_5", 5000)).id === "evt_5");
  ok("R1.91-1 relay.waitFor: fails loudly when none comes", await throwsWith(() => relay.waitFor("customer.subscription.deleted", () => true, 1200), /no customer\.subscription\.deleted event delivered within 1200 ms/));
}
{
  const s = recordedStripe({ events: [ev("evt_c1", "checkout.session.completed", T0 + 1)] });
  await new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, account: "acct_rec1", types: ["checkout.session.completed"], fetchFn: (async () => new Response(null, { status: 200 })) as unknown as typeof fetch }).poll();
  ok("R1.91-1 relay (R1.57's Connect use): one connected account's events through the Stripe-Account header", s.calls.find((c) => c.path === "/v1/events")?.headers.get("stripe-account") === "acct_rec1");
}
ok("R1.91-1 relay: refused with a live key, no key, or a secret that is not whsec_", await throwsWith(() => relayFromKey("sk_live_abcdefgh12345678", { webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: 0 }), /live key is refused/) && await throwsWith(() => relayFromKey(undefined, { webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: 0 }), /no key/) && await throwsWith(() => relayFromKey("sk_test_abcdefgh12345678", { webhookUrl: "http://x", signingKey: "secret", sinceSeconds: 0 }), /not a whsec_/));

// ── live proof (Stripe test mode; read-only): only where the key is given ────────────────────────────────────────────
const live = process.env.STRIPE_TEST_SECRET_KEY;
if (live && !keyProblem(live)) {
  const r = await setUpStripe(new Stripe(live, { maxNetworkRetries: 2, timeout: 20_000 }), PLANS, { dryRun: true });
  ok("R1.91-1 live (test mode): the dry run reads the account's prices by lookup key with no conflict", r.conflicts.length === 0 && r.prices.length === 6, { conflicts: r.conflicts, found: r.prices.map((l) => l.priceId) });
} else console.log(`SKIP  R1.91-1 live (test mode): ${live ? keyProblem(live) : "no STRIPE_TEST_SECRET_KEY on this machine (the GitHub Actions job runs it)"}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
