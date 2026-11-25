// R1.91 part 1 (shape product/screens/R1.91/shape.md §2; PF-16's Stripe set-up script): the set-up script and the event
// relay, a pass and a fail per line, on recorded Stripe answers served to Stripe's own library through its fetch client
// (no network; CI and lanes never make a live call, MODULE.md). The recorded answers keep state and follow Stripe's rules
// the code relies on: a lookup key stays on an archived price; an idempotency key replays its first answer, and the same
// key with other parameters is refused (400); lists page with has_more. One scratch database with every migration
// (removed) for the price ids written to platform_plan. The relay's events are verified by the adapter our webhook route
// uses (StripeBilling.readEvent, the library's constructEvent). No server, no browser, no model call (US$0).
// With STRIPE_TEST_SECRET_KEY set to a test key (the live proof's GitHub Actions job, the Lead's ruling on #3636), one
// extra line runs the script against Stripe test mode twice (the second run makes nothing); without it, SKIPPED by name.
//   tsx studio/tests/check_pf16_stripe_setup.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { PORTAL_FEATURES } from "../ports/billing.ts";
import { StripeBilling, ensurePortalConfiguration } from "../api/src/platform/billing/stripe.ts";
import { SMART_RETRIES_LINE, TAX_LINE, applyToPlans, cliArgs, keyProblem, lookupKey, priceColumns, setUpStripe, wanted, type PlanRow } from "../api/src/platform/billing/stripe-setup.ts";
import { BILLING_EVENT_TYPES, StripeRelay, relayArgs, relayFromKey } from "./journeys/stripe-relay.ts";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Call = { method: string; path: string; form: URLSearchParams; query: URLSearchParams; headers: Headers };
type Price = { id: string; object: "price"; product: string; unit_amount: number | null; currency: string; type: "recurring" | "one_time"; recurring: { interval: string; interval_count: number; usage_type: string } | null; lookup_key: string | null; tax_behavior: string | null; active: boolean; metadata: Record<string, string> };
type Config = { id: string; object: "billing_portal.configuration"; active: boolean; metadata: Record<string, string>; features: Record<string, Record<string, unknown>> };
/** Recorded Stripe answers with state, in the shapes Stripe's API returns (cut to the fields read). */
function recordedStripe(seed: { events?: Array<Record<string, unknown>>; pageSize?: number } = {}) {
  const calls: Call[] = [], byKey = new Map<string, { params: string; body: unknown }>();
  const products: Array<{ id: string; object: "product"; name: string; active: boolean; metadata: Record<string, string> }> = [];
  const prices: Price[] = [], configs: Config[] = [], events = [...(seed.events ?? [])];
  let n = 0;
  const page = <T extends { id: string }>(all: T[], q: URLSearchParams) => {   // Stripe's cursor lists: limit, starting_after, has_more
    const size = Math.min(Number(q.get("limit") ?? 10), seed.pageSize ?? 100), after = q.get("starting_after");
    const from = after ? all.findIndex((x) => x.id === after) + 1 : 0;
    return { object: "list", data: all.slice(from, from + size), has_more: from + size < all.length };
  };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new globalThis.URL(String(input)), method = init?.method ?? "GET", headers = new Headers(init?.headers);
    const raw = typeof init?.body === "string" ? init.body : "", form = new URLSearchParams(raw), query = url.searchParams;
    calls.push({ method, path: url.pathname, form, query, headers });
    const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": `req_rec${++n}` } });
    const refuse = (message: string) => answer(400, { error: { type: "invalid_request_error", message } });
    const key = headers.get("idempotency-key"), memo = key && `${url.pathname}:${key}`;
    if (memo && byKey.has(memo)) {
      const was = byKey.get(memo)!;
      return was.params === raw ? answer(200, was.body) : refuse("Keys for idempotent requests can only be used with the same parameters they were first used with.");
    }
    let body: unknown;
    const one = /^\/v1\/billing_portal\/configurations\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && url.pathname === "/v1/prices") {
      const keys = listOf(query, "lookup_keys"), active = query.get("active");
      body = page(prices.filter((p) => keys.includes(p.lookup_key ?? "") && (active === null || String(p.active) === active)), query);
    } else if (method === "GET" && url.pathname === "/v1/products") {
      const active = query.get("active");
      body = page(products.filter((p) => active === null || String(p.active) === active), query);
    } else if (method === "POST" && url.pathname === "/v1/products") {
      const p = { id: `prod_rec${String(++n).padStart(4, "0")}`, object: "product" as const, name: form.get("name") ?? "", active: true, metadata: { xr_plan: form.get("metadata[xr_plan]") ?? "" } };
      products.push(p); body = p;
    } else if (method === "POST" && url.pathname === "/v1/prices") {
      const lk = form.get("lookup_key");
      if (lk && prices.some((p) => p.lookup_key === lk)) return refuse("A price (price_…) already uses that lookup key.");
      const p: Price = { id: `price_rec${String(++n).padStart(4, "0")}`, object: "price", product: form.get("product") ?? "", unit_amount: Number(form.get("unit_amount")), currency: form.get("currency") ?? "", type: "recurring", recurring: { interval: form.get("recurring[interval]") ?? "", interval_count: Number(form.get("recurring[interval_count]") ?? 1), usage_type: form.get("recurring[usage_type]") ?? "licensed" }, lookup_key: lk, tax_behavior: form.get("tax_behavior") ?? "unspecified", active: true, metadata: { xr_plan: form.get("metadata[xr_plan]") ?? "" } };
      prices.push(p); body = p;
    } else if (method === "GET" && url.pathname === "/v1/billing_portal/configurations") body = page(configs.filter((c) => query.get("active") === null || String(c.active) === query.get("active")), query);
    else if (method === "GET" && one) { const c = configs.find((x) => x.id === one[1]); if (!c) return answer(404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such configuration" } }); body = c; }
    else if (method === "POST" && url.pathname === "/v1/billing_portal/configurations") {
      const f = (k: string) => form.get(`features[${k}]`);
      const c: Config = { id: `bpc_rec${++n}`, object: "billing_portal.configuration", active: true, metadata: { pf5: form.get("metadata[pf5]") ?? "" }, features: {
        subscription_update: { enabled: f("subscription_update][enabled") === "true" }, subscription_cancel: { enabled: f("subscription_cancel][enabled") === "true", mode: f("subscription_cancel][mode") },
        payment_method_update: { enabled: f("payment_method_update][enabled") === "true" }, invoice_history: { enabled: f("invoice_history][enabled") === "true" }, customer_update: { enabled: f("customer_update][enabled") === "true" } } };
      configs.push(c); body = c;
    } else if (method === "GET" && url.pathname === "/v1/events") {
      const gte = Number(query.get("created[gte]") ?? 0), types = listOf(query, "types");
      body = page(events.filter((e) => (e.created as number) >= gte && (!types.length || types.includes(e.type as string))).sort((a, b) => (b.created as number) - (a.created as number)) as Array<{ id: string }>, query);
    } else return answer(404, { error: { type: "invalid_request_error", message: `unrecorded ${method} ${url.pathname}` } });
    if (memo) byKey.set(memo, { params: raw, body });
    return answer(200, body);
  }) as typeof fetch;
  const stripe = new Stripe("sk_test_recordedOnly000000", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(fetchFn) });
  /** Stripe forgets idempotency keys after 24 hours. */
  const after24h = () => byKey.clear();
  return { stripe, calls, products, prices, configs, events, after24h, posts: () => calls.filter((c) => c.method === "POST"), lists: (path: string) => calls.filter((c) => c.method === "GET" && c.path === path).length };
}
const T = recordedStripe;   // a price put straight into the recorded account (made by someone else, or earlier)
const seedPrice = (s: ReturnType<typeof T>, p: Partial<Price> & { lookup_key: string }) => s.prices.push({ id: `price_seed${s.prices.length}`, object: "price", product: "prod_seed", unit_amount: 9900, currency: "cad", type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive", active: true, metadata: { xr_plan: "team" }, ...p });

const PLANS: PlanRow[] = [
  { code: "firm", name: "Firm (Sample)", monthlyPriceCents: 19900, yearlyPriceCents: 199000, currency: "CAD" },
  { code: "solo", name: "Solo (Sample)", monthlyPriceCents: 4900, yearlyPriceCents: 49000, currency: "CAD" },
  { code: "team", name: "Team (Sample)", monthlyPriceCents: 9900, yearlyPriceCents: 99000, currency: "CAD" },
];
const TEAM = [PLANS[2]], TEAM_MONTH = lookupKey("team", "month");
const conflictOf = async (p: Partial<Price>) => { const s = T(); seedPrice(s, { ...p, lookup_key: TEAM_MONTH }); const r = await setUpStripe(s.stripe, TEAM); return { r, s }; };

// ── keys and arguments ───────────────────────────────────────────────────────────────────────────────────────────────
ok("R1.91-1 key: a test key passes (sk_test_, rk_test_)", keyProblem("sk_test_abcdefgh12") === null && keyProblem("rk_test_abcdefgh12") === null);
ok("R1.91-1 key: a live key is refused (sk_live_, rk_live_), none, or not a key", /live key is refused/.test(keyProblem("sk_live_abcdefgh12") ?? "") && /live key/.test(keyProblem("rk_live_abcdefgh12") ?? "") && /no key/.test(keyProblem(undefined) ?? "") && /not a Stripe test key/.test(keyProblem("pk_test_abcdefgh12") ?? "") && /not a Stripe test key/.test(keyProblem(" sk_test_abcdefgh12") ?? ""));
ok("R1.91-1 arguments: --dry-run is the one flag; a mistyped one is refused, never a full run", JSON.stringify(cliArgs([])) === '{"dryRun":false}' && JSON.stringify(cliArgs(["--dry-run"])) === '{"dryRun":true}' && ["--dryrun", "-n", "--dry-run=1"].every((a) => "problem" in cliArgs([a])));
{
  const tsx = join(STUDIO, "node_modules", ".bin", "tsx"), script = join(STUDIO, "api", "src", "platform", "billing", "stripe-setup.ts");
  const run = (env: Record<string, string>, args: string[] = []) => spawnSync(tsx, [script, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://nobody@127.0.0.1:1/none", HTTPS_PROXY: "http://127.0.0.1:1", STRIPE_TEST_SECRET_KEY: "", PLATFORM_STRIPE_SECRET_KEY: "", PLATFORM_ENVIRONMENT: "local", ...env } });
  const live = run({ STRIPE_TEST_SECRET_KEY: "sk_live_abcdefgh12345678" }), prod = run({ STRIPE_TEST_SECRET_KEY: "sk_test_abcdefgh12345678", PLATFORM_ENVIRONMENT: "production" }), typo = run({ STRIPE_TEST_SECRET_KEY: "sk_test_abcdefgh12345678" }, ["--dryrun"]);
  ok("R1.91-1 the script with a live key exits 2 before any call or database read", live.status === 2 && /live key is refused/.test(live.stdout), { status: live.status, out: live.stdout + live.stderr });
  ok("R1.91-1 the script refuses PLATFORM_ENVIRONMENT=production and a mistyped flag (exit 2, nothing read)", prod.status === 2 && /production/.test(prod.stdout) && typo.status === 2 && /unknown argument/.test(typo.stdout), { prod: prod.stdout, typo: typo.stdout });
  const down = run({ STRIPE_TEST_SECRET_KEY: "sk_test_abcdefgh12345678" });
  ok("R1.91-1 the script names its key's source (never the key) and fails in one plain line, no stack trace", down.status === 1 && /key from STRIPE_TEST_SECRET_KEY/.test(down.stdout) && /stripe set-up: failed — .*platform_plan not written/.test(down.stdout) && !/sk_test_abcdefgh12345678/.test(down.stdout + down.stderr) && !/\n\s+at /.test(down.stdout + down.stderr), { out: down.stdout + down.stderr });
}

// ── the plan prices ──────────────────────────────────────────────────────────────────────────────────────────────────
ok("R1.91-1 wanted: two prices per plan with a Sample price; none for a period with no price", wanted(PLANS).length === 6 && wanted([{ ...PLANS[0], yearlyPriceCents: null }]).map((w) => w.interval).join() === "month" && wanted([{ ...PLANS[0], monthlyPriceCents: 0, yearlyPriceCents: null }]).length === 0);
{
  const s = T(), r = await setUpStripe(s.stripe, PLANS);
  const team = s.prices.filter((p) => p.lookup_key?.startsWith("xr-plan-team-"));
  ok("R1.91-1 first run: 3 products and 6 prices made, one product per plan", r.prices.length === 6 && r.prices.every((l) => l.created) && s.products.length === 3 && new Set(s.prices.map((p) => p.product)).size === 3, r.prices);
  ok("R1.91-1 first run: each price is CAD, tax-exclusive, every 1 month or year, licensed, tagged with its plan, with its lookup key and the plan table's amount", team.length === 2 && team.every((p) => p.currency === "cad" && p.tax_behavior === "exclusive" && p.recurring?.interval_count === 1 && p.recurring.usage_type === "licensed" && p.metadata.xr_plan === "team") && team.find((p) => p.lookup_key === TEAM_MONTH)?.unit_amount === 9900 && team.find((p) => p.lookup_key === lookupKey("team", "year"))?.recurring?.interval === "year" && team.find((p) => p.lookup_key === lookupKey("team", "year"))?.unit_amount === 99000, team);
  const c = s.configs[0]?.features;
  ok("R1.91-1 first run: the portal configuration is made once: card, invoices, cancel at period end on; plan switching and customer update off (PF-16), read back with no problem", r.portal.created && s.configs.length === 1 && c?.subscription_update.enabled === false && c.subscription_cancel.enabled === true && c.subscription_cancel.mode === "at_period_end" && c.payment_method_update.enabled === true && c.invoice_history.enabled === true && c.customer_update.enabled === false && r.portal.problems.length === 0, { c, problems: r.portal.problems });
  ok("R1.91-1 portal features are PORTAL_FEATURES (one definition): no plan switching on the portal", PORTAL_FEATURES.subscription_update.enabled === false && PORTAL_FEATURES.subscription_cancel.mode === "at_period_end");
  ok("R1.91-1 Smart Retries and the tax registrations are checklist lines (no API here)", r.checklist.includes(SMART_RETRIES_LINE) && r.checklist.includes(TAX_LINE) && /2 weeks/.test(SMART_RETRIES_LINE));
  ok("R1.91-1 every creating call carries an idempotency key", s.posts().every((p) => !!p.headers.get("idempotency-key")), s.posts().map((p) => p.path));

  const before = s.posts().length, again = await setUpStripe(s.stripe, PLANS);
  ok("R1.91-1 second run: nothing made (prices found by lookup key, the portal by its metadata), the same ids", s.posts().length === before && again.prices.every((l) => !l.created) && again.prices.map((l) => l.priceId).join() === r.prices.map((l) => l.priceId).join() && !again.portal.created && again.portal.id === r.portal.id, { posts: s.posts().length - before });
  s.after24h();
  ok("R1.91-1 a plan added later, a day on: only its two prices and its one product are made", (await setUpStripe(s.stripe, [...PLANS, { code: "pro", name: "Pro (Sample)", monthlyPriceCents: 29900, yearlyPriceCents: 299000, currency: "CAD" }])).prices.filter((l) => l.created).map((l) => l.code).join() === "pro,pro" && s.products.length === 4);

  const posts = s.posts().length, changed = await setUpStripe(s.stripe, PLANS.map((p) => (p.code === "team" ? { ...p, monthlyPriceCents: 10900 } : p)));
  ok("R1.91-1 conflict: a price under the key with another amount is named, and nothing is made", changed.conflicts.length === 1 && changed.conflicts[0].lookupKey === TEAM_MONTH && /amount 9900 cents, the plan table says 10900/.test(changed.conflicts[0].reasons.join()) && s.posts().length === posts && changed.portal.id === null, changed.conflicts);
  ok("R1.91-1 conflict: another currency is a conflict too", (await setUpStripe(s.stripe, [{ ...PLANS[2], currency: "USD" }])).conflicts.length === 2);
}
{
  const cases: Array<[string, Partial<Price>, RegExp]> = [
    ["archived (its lookup key is still taken)", { active: false }, /archived/],
    ["every year under the monthly key", { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }, /every year, the plan table says every month/],
    ["every 3 months", { recurring: { interval: "month", interval_count: 3, usage_type: "licensed" } }, /every 3 months/],
    ["metered", { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }, /usage metered/],
    ["one-time", { type: "one_time", recurring: null }, /not a recurring price/],
    ["tax-inclusive (CAD 99.00 with tax in it, not plus tax)", { tax_behavior: "inclusive" }, /tax inclusive, not exclusive/],
    ["tax unspecified", { tax_behavior: "unspecified" }, /tax unspecified/],
    ["made for another plan", { metadata: { xr_plan: "solo" } }, /made for plan solo, not team/],
  ];
  for (const [what, p, re] of cases) {
    const { r, s } = await conflictOf(p);
    ok(`R1.91-1 conflict: a price under the key that is ${what} is named, and nothing is made`, r.conflicts.length === 1 && re.test(r.conflicts[0].reasons.join("; ")) && s.posts().length === 0, r.conflicts);
  }
  const { r } = await conflictOf({});
  ok("R1.91-1 no conflict: the same price under the key is found and used (the pass beside the fails above)", r.conflicts.length === 0 && r.prices.find((l) => l.interval === "month")?.priceId === "price_seed0" && !r.prices.find((l) => l.interval === "month")?.created);
}
{
  const s = T(); seedPrice(s, { lookup_key: lookupKey("team", "year"), unit_amount: 99000, recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }, product: "prod_teamOnly" });
  const r = await setUpStripe(s.stripe, TEAM);
  ok("R1.91-1 one product per plan: the yearly price exists, the monthly is made on the same product (no second product)", s.products.length === 0 && s.prices.find((p) => p.lookup_key === TEAM_MONTH)?.product === "prod_teamOnly" && r.prices.filter((l) => l.created).length === 1, { products: s.products, prices: s.prices });
}
{
  const s = T(); s.products.push({ id: "prod_leftOver", object: "product", name: "Team (Sample)", active: true, metadata: { xr_plan: "team" } }); s.after24h();
  await setUpStripe(s.stripe, TEAM);
  ok("R1.91-1 one product per plan: a run that stopped after the product (a day ago) reuses it, found by its metadata", s.products.length === 1 && s.prices.every((p) => p.product === "prod_leftOver"), s.products);
}
{
  const s = T(); seedPrice(s, { id: "price_wrongAnswer", lookup_key: "xr-plan-other-month-v1" });
  const orig = s.stripe.prices.create.bind(s.stripe.prices);
  (s.stripe.prices as { create: unknown }).create = async () => (await s.stripe.prices.list({ lookup_keys: ["xr-plan-other-month-v1"] })).data[0];
  ok("R1.91-1 a made price is read back: an answer with another key or terms stops the run in words, nothing written", await throwsWith(() => setUpStripe(s.stripe, TEAM), /Stripe answered the new xr-plan-team-month-v1 price with price_wrongAnswer/));
  (s.stripe.prices as { create: unknown }).create = orig;
}
{
  const s = T(), r = await setUpStripe(s.stripe, PLANS, { dryRun: true });
  ok("R1.91-1 dry run: reads only, makes nothing, no portal", s.posts().length === 0 && r.prices.every((l) => l.priceId === null && !l.created) && r.portal.id === null);
}
{
  const s = T({ pageSize: 2 });
  for (let i = 0; i < 5; i++) s.configs.push({ id: `bpc_other${i}`, object: "billing_portal.configuration", active: true, metadata: {}, features: {} });
  const found = await ensurePortalConfiguration(s.stripe), again = await ensurePortalConfiguration(s.stripe);
  const billing = new StripeBilling(s.stripe), url = await billing.portal({ customerId: "cus_rec1", returnUrl: "https://app.example.com/billing" }).catch((e: Error) => e.message);
  ok("R1.91-1 the portal hand-off and the script share one configuration, found past the first page (not made again)", found.created && !again.created && again.id === found.id && s.configs.length === 6 && typeof url === "string", { url, configs: s.configs.length });
}
{
  const s = T(); s.configs.push({ id: "bpc_drifted", object: "billing_portal.configuration", active: true, metadata: { pf5: "pf5-portal-v1" }, features: { subscription_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "immediately" }, payment_method_update: { enabled: true }, invoice_history: { enabled: true } } });
  const r = await setUpStripe(s.stripe, TEAM);
  ok("R1.91-1 a tagged portal configuration that switches plans or cancels at once is a conflict (it would skip checkDowngrade)", r.portal.id === "bpc_drifted" && r.portal.problems.some((p) => /plan switching is on/.test(p)) && r.portal.problems.some((p) => /at period end/.test(p)), r.portal);
}
ok("R1.91-1 priceColumns: each period's id, and null for a period the plan table no longer prices", JSON.stringify([...priceColumns({ prices: [{ code: "team", interval: "month", priceId: "price_a", created: true, amountCents: 1 }], conflicts: [], portal: { id: null, created: false, problems: [] }, checklist: [] }, TEAM)]) === JSON.stringify([["team", { stripeMonthlyPrice: "price_a", stripeYearlyPrice: null }]]));

// ── the price ids reach platform_plan (scratch database) ────────────────────────────────────────────────────────────
execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  const s = T(), r = await applyToPlans(db, s.stripe);
  const rows = () => sql(`select code || ':' || coalesce(stripe_monthly_price_id, '-') || ':' || coalesce(stripe_yearly_price_id, '-') from platform_plan where active order by code`).split("\n");
  const id = (code: string, i: "month" | "year") => r.prices.find((l) => l.code === code && l.interval === i)?.priceId;
  ok("R1.91-1 apply: each Sample plan's monthly and yearly price ids are written to platform_plan", rows().length === 3 && rows().every((row) => { const [code, m, y] = row.split(":"); return m === id(code, "month") && y === id(code, "year"); }), rows());
  sql(`update platform_plan set yearly_price_cents = null where code = 'solo'`);
  await applyToPlans(db, s.stripe);
  ok("R1.91-1 apply: a period the plan table no longer prices is cleared (an old price is never offered)", sql(`select coalesce(stripe_yearly_price_id, '-') from platform_plan where code = 'solo'`) === "-" && sql(`select stripe_monthly_price_id from platform_plan where code = 'solo'`) === id("solo", "month"));
  sql(`update platform_plan set monthly_price_cents = 12345 where code = 'solo'`);
  sql(`update platform_plan set stripe_yearly_price_id = 'price_keptAsIs' where code = 'firm'`);
  const c = await applyToPlans(db, s.stripe);
  ok("R1.91-1 apply with a conflict: platform_plan is left as it was (nothing written)", c.conflicts.length === 1 && sql(`select stripe_yearly_price_id from platform_plan where code = 'firm'`) === "price_keptAsIs", c.conflicts);
  const d = await applyToPlans(db, s.stripe, { dryRun: true });
  ok("R1.91-1 apply as a dry run writes nothing", d.conflicts.length === 1 && sql(`select stripe_yearly_price_id from platform_plan where code = 'firm'`) === "price_keptAsIs");
  sql(`update platform_plan set monthly_price_cents = 4900 where code = 'solo'`);
  s.configs[0].features.subscription_update = { enabled: true };
  const p = await applyToPlans(db, s.stripe);
  ok("R1.91-1 apply with a portal conflict: platform_plan is left as it was", p.portal.problems.length > 0 && sql(`select stripe_yearly_price_id from platform_plan where code = 'firm'`) === "price_keptAsIs", p.portal);
} finally { await db.$disconnect(); execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); }

// ── the relay ───────────────────────────────────────────────────────────────────────────────────────────────────────
const WHSEC = "whsec_relayPerRun000000000", OTHER_KEY = "whsec_otherKey000000", T0 = 1_764_000_000;
const ev = (id: string, type: string, created: number, customer = "cus_r1") => ({ id, object: "event", type, created, livemode: false, api_version: "2026-10-28.endive", data: { object: { object: "subscription", id: "sub_r1", customer, metadata: { firm_id: "0f5a0000-0000-4000-8000-000000000001" } } } });
const accept = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
{
  const s = T({ events: [ev("evt_3", "invoice.paid", T0 + 30), ev("evt_1", "customer.subscription.created", T0 + 10), ev("evt_2", "customer.subscription.updated", T0 + 20), ev("evt_old", "customer.subscription.updated", T0 - 5), ev("evt_x", "customer.created", T0 + 15)] });
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
  const before = got.length;
  await new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: OTHER_KEY, sinceSeconds: T0, fetchFn: hook }).poll();
  ok("R1.91-1 relay: signed with another key, our webhook refuses every event (the key is the copy's own)", got.slice(before).length === 4 && got.slice(before).every((g) => !g.ok));
  const p1 = relay.poll(), p2 = relay.poll();
  ok("R1.91-1 relay: two polls at once are one pass (no event sent twice by overlap)", p1 === p2);
  await p1;
  s.events.push(ev("evt_5", "invoice.paid", T0 + 50));
  ok("R1.91-1 relay.waitFor: finds an event once delivered", (await relay.waitFor("invoice.paid", (d) => d.id === "evt_5", 5000)).id === "evt_5");
  ok("R1.91-1 relay.waitFor: fails loudly when none comes", await throwsWith(() => relay.waitFor("customer.subscription.deleted", () => true, 1200), /no customer\.subscription\.deleted event delivered within 1200 ms/));
}
{
  const s = T({ pageSize: 2, events: Array.from({ length: 7 }, (_, i) => ev(`evt_p${i}`, "invoice.paid", T0 + i)) });
  ok("R1.91-1 relay: every page of events is read (has_more)", (await new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: accept }).poll()) === 7);
}
{
  const s = T({ events: [ev("evt_mine", "invoice.paid", T0 + 1, "cus_mine"), ev("evt_theirs", "invoice.paid", T0 + 2, "cus_theirs")] });
  const r = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: accept, only: (e) => (e.data.object as { customer?: string }).customer === "cus_mine" });
  ok("R1.91-1 relay `only`: a run sends only its own events (the test account is shared)", (await r.poll()) === 1 && r.delivered.has("evt_mine") && !r.delivered.has("evt_theirs"));
}
{
  const s = T({ events: [ev("evt_r1", "invoice.paid", T0 + 1)] });
  let posts = 0;
  const refuse = (async () => { posts++; return new Response(null, { status: 400 }); }) as unknown as typeof fetch;
  const r = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: refuse, maxAttempts: 3 });
  for (let i = 0; i < 6; i++) await r.poll();
  ok("R1.91-1 relay: an event refused every time is given up after maxAttempts (3 POSTs, not one per poll forever)", posts === 3 && r.gaveUp.get("evt_r1")?.attempts === 3 && r.failures.length === 3, { posts, gaveUp: [...r.gaveUp.values()] });
}
{
  const s = T({ events: [ev("evt_h1", "invoice.paid", T0 + 1)] });
  const hang = ((_u: unknown, init?: RequestInit) => new Promise<Response>((_, no) => init?.signal?.addEventListener("abort", () => no(init.signal?.reason)))) as unknown as typeof fetch;
  const never = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;   // ignores the abort too
  const r = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: hang, postTimeoutMs: 200 });
  const t0 = Date.now(), n = await r.poll();
  ok("R1.91-1 relay: a webhook that never answers fails that attempt at its time limit, the relay goes on", n === 0 && Date.now() - t0 < 2000 && r.failures.some((f) => f.id === "evt_h1" && f.status === null), r.failures);
  const stuck = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: never });
  const t1 = Date.now(), loud = await throwsWith(() => stuck.waitFor("invoice.paid", () => true, 800), /within 800 ms/);
  ok("R1.91-1 relay.waitFor: fails at its time limit even while a pass hangs", loud && Date.now() - t1 < 2500, { ms: Date.now() - t1 });
  const t2 = Date.now(); await stuck.stop(500);
  ok("R1.91-1 relay.stop: returns within its bound even while a pass hangs", Date.now() - t2 < 1500, { ms: Date.now() - t2 });
}
{
  const s = T({ events: [ev("evt_s1", "invoice.paid", T0 + 1)] });
  let slow = true;
  const lag = (async () => { if (slow) await sleep(150); return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
  const r = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: lag, intervalMs: 20 }).start();
  r.start();   // a second start: still one loop
  await sleep(60);   // a pass is running now (its POST takes 150 ms)
  await r.stop();
  slow = false;
  const at = s.lists("/v1/events");
  await sleep(300);
  ok("R1.91-1 relay.stop: called during a pass, no tick after it returns (no list call in the next 300 ms)", s.lists("/v1/events") === at && r.delivered.has("evt_s1"), { before: at, after: s.lists("/v1/events") });
  r.start();
  await sleep(100);
  ok("R1.91-1 relay.start after stop does nothing (stopped for good)", s.lists("/v1/events") === at);
}
{
  const s = T({ events: [ev("evt_d1", "invoice.paid", T0 + 1)] });
  const r = new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, fetchFn: accept, intervalMs: 50 });
  r.start(); r.start(); r.start();
  await sleep(240);
  await r.stop();
  const loops = s.lists("/v1/events");
  ok("R1.91-1 relay.start three times runs one loop (about one list per 50 ms, not three)", loops >= 2 && loops <= 7, { loops });
}
{
  const s = T({ events: [ev("evt_c1", "checkout.session.completed", T0 + 1)] });
  await new StripeRelay({ stripe: s.stripe, webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: T0, account: "acct_rec1", types: ["checkout.session.completed"], fetchFn: accept }).poll();
  ok("R1.91-1 relay (R1.57's Connect use): one connected account's events through the Stripe-Account header", s.calls.find((c) => c.path === "/v1/events")?.headers.get("stripe-account") === "acct_rec1");
}
ok("R1.91-1 relay: refused with a live key, no key, or a signing key that is not whsec_", await throwsWith(() => relayFromKey("sk_live_abcdefgh12345678", { webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: 0 }), /live key is refused/) && await throwsWith(() => relayFromKey(undefined, { webhookUrl: "http://x", signingKey: WHSEC, sinceSeconds: 0 }), /no key/) && await throwsWith(() => relayFromKey("sk_test_abcdefgh12345678", { webhookUrl: "http://x", signingKey: "plain", sinceSeconds: 0 }), /not a whsec_/));
{
  const good = relayArgs(["http://127.0.0.1:4431/api/hooks/stripe", "--since", "1764000000"], 1_764_000_500), dflt = relayArgs(["http://a.example/h"], 1_764_000_500);
  const bad = [["--since", "1764000000", "http://a.example/h", "http://b.example/h"], ["--since", "soon", "http://a.example/h"], ["--since"], [], ["not-a-url"], ["--sincee", "1", "http://a.example/h"]].map((a) => relayArgs(a, 0));
  ok("R1.91-1 relay arguments: a URL and --since in either order; a missing or non-numeric --since, two URLs, no URL or an unknown flag refused", "url" in good && good.since === 1_764_000_000 && "url" in dflt && dflt.since === 1_764_000_440 && bad.every((b) => "problem" in b), { good, bad });
}

// ── live proof (Stripe test mode): only where the key is given ──────────────────────────────────────────────────────
const live = process.env.STRIPE_TEST_SECRET_KEY;
if (live && !keyProblem(live)) {
  const stripe = new Stripe(live, { maxNetworkRetries: 2, timeout: 20_000 });
  const first = await setUpStripe(stripe, PLANS), second = await setUpStripe(stripe, PLANS);
  ok("R1.91-1 live (test mode): set-up runs with no conflict, every plan period has a price, and a second run makes nothing", first.conflicts.length === 0 && first.portal.problems.length === 0 && first.prices.length === 6 && first.prices.every((l) => /^price_/.test(l.priceId ?? "")) && second.prices.every((l) => !l.created) && second.prices.map((l) => l.priceId).join() === first.prices.map((l) => l.priceId).join() && !second.portal.created, { conflicts: first.conflicts, portal: first.portal, made: first.prices.filter((l) => l.created).length });
} else console.log(`SKIP  R1.91-1 live (test mode): ${live ? keyProblem(live) : "no STRIPE_TEST_SECRET_KEY on this machine (the GitHub Actions job runs it)"}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
