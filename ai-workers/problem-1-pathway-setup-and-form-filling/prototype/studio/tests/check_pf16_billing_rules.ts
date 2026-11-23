// PF-16 part 1a (SA-4-28..31, -49, -50, -55, -56; SA-3-58..61): plan changes, a pass and a fail per Done when line, on Stripe
// fakes and recorded answers (review and break rounds 1-2 included). A scratch database (removed), the Sample firms, PF-4's
// classes in a Nest app, a fake clock. No server, no browser, no model or Stripe call (US$0).
//   tsx studio/tests/check_pf16_billing_rules.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeBilling } from "../ports/billing.ts";
import { fakeCaseCount } from "../ports/case-count.ts";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { planChangePortContract } from "../ports/contracts/plan-change-port.contract.ts";
import { fakeMail } from "../ports/mail.ts";
import { fakePlanChange } from "../ports/plan-change.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf16_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return x.getStatus ? { status: x.getStatus(), body: x.getResponse?.() as Record<string, any> } : { status: 0, body: { error: String(e) } as Record<string, any> }; } };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const DAY = 86_400_000;
const PRICES = [
  { id: "price_teamMonth", unitAmount: 10_000, interval: "month" as const, currency: "cad" }, { id: "price_teamYear", unitAmount: 100_000, interval: "year" as const, currency: "cad" },
  { id: "price_liteMonth", unitAmount: 5_000, interval: "month" as const, currency: "cad" }, { id: "price_firmMonth", unitAmount: 20_000, interval: "month" as const, currency: "cad" },
];

/** Recorded Stripe answers for the plan-change calls (the shapes Stripe returns, cut to what the adapter reads); an
 *  idempotency key gives the same answer, as Stripe does. */
function recordedStripe(StripePlanChange: typeof import("../api/src/platform/billing/plan-change/stripe-plan-change.ts").StripePlanChange) {
  const end = Math.floor(Date.now() / 1000) + 15 * 86_400;
  let price = PRICES[0], schedule: string | null = null, scheduled: string | null = null, charges = 0, lastForm = new URLSearchParams();
  const byKey = new Map<string, unknown>();
  const sub = () => ({ id: "sub_r1", object: "subscription", status: "active", trial_end: null, schedule, items: { data: [{ id: "si_r1", current_period_end: end, price: { id: price.id, unit_amount: price.unitAmount, recurring: { interval: price.interval } } }] } });
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new globalThis.URL(String(input)), method = init?.method ?? "GET", key = new Headers(init?.headers).get("idempotency-key"), form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    if (method === "POST") lastForm = form;
    const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_rec" } });
    if (key && byKey.has(`${url.pathname}:${key}`)) return answer(byKey.get(`${url.pathname}:${key}`));
    let out: unknown;
    if (method === "GET" && url.pathname === "/v1/subscriptions/sub_r1") out = sub();
    else if (method === "POST" && url.pathname === "/v1/invoices/create_preview") {
      const to = PRICES.find((p) => p.id === form.get("subscription_details[items][0][price]"))!, prorate = form.get("subscription_details[proration_behavior]") === "always_invoice";
      const diff = prorate ? Math.round((to.unitAmount - price.unitAmount) / 2) : 0;
      out = { object: "invoice", amount_due: Math.max(0, diff), currency: "cad", lines: { data: [{ amount: diff, parent: { subscription_item_details: { proration: true } } }, { amount: 0, parent: { subscription_item_details: { proration: false } } }] } };
    } else if (method === "POST" && url.pathname === "/v1/subscriptions/sub_r1") {
      price = PRICES.find((p) => p.id === form.get("items[0][price]"))!;
      if (form.get("proration_behavior") === "always_invoice") charges++;
      out = sub();
    } else if (method === "POST" && url.pathname === "/v1/subscription_schedules") { schedule = "sub_sched_r1"; out = { id: schedule, object: "subscription_schedule" }; }
    else if (method === "GET" && url.pathname === "/v1/subscription_schedules/sub_sched_r1") out = { id: "sub_sched_r1", object: "subscription_schedule", current_phase: { start_date: end - 30 * 86_400, end_date: end },
      phases: [{ start_date: end - 30 * 86_400, end_date: end, items: [{ price: price.id, quantity: 1 }] }, ...(scheduled ? [{ start_date: end, items: [{ price: scheduled, quantity: 1 }] }] : [])] };
    else if (method === "POST" && url.pathname === "/v1/subscription_schedules/sub_sched_r1") { scheduled = form.get("phases[1][items][0][price]"); out = { id: "sub_sched_r1", object: "subscription_schedule" }; }
    else if (method === "POST" && url.pathname === "/v1/subscription_schedules/sub_sched_r1/release") { schedule = null; scheduled = null; out = { id: "sub_sched_r1", object: "subscription_schedule", status: "released" }; }
    else return answer({ error: { type: "invalid_request_error", message: `unrecorded ${method} ${url.pathname}` } }, 404);
    if (key) byKey.set(`${url.pathname}:${key}`, out);
    return answer(out);
  }) as typeof fetch;
  return { port: StripePlanChange.fromKey("sk_test_recordedOnly000000", fetchFn), subscriptionId: "sub_r1", fromPrice: PRICES[0].id, raisePrice: "price_firmMonth", charges: () => charges, scheduled: () => scheduled, lastForm: () => lastForm };
}

execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { PgEntitlements } = await import("../api/src/platform/entitlements/limits.ts");
const { PlanBookings } = await import("../api/src/platform/entitlements/plan-booking.ts");
const { PlanChanges } = await import("../api/src/platform/billing/plan-change/service.ts");
const { PLAN_CHANGES, PlanChangeController } = await import("../api/src/platform/billing/plan-change/routes.ts");
const { StripePlanChange } = await import("../api/src/platform/billing/plan-change/stripe-plan-change.ts");
const walls = await import("../api/src/platform/firm-scope.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const fake = new FakeClock(new Date());
const clock = new (class extends PlatformClock { override now() { return fake.now().getTime(); } })();
const local = new LocalIdentity("pf16-check-signing-key-0123456789abcdef", () => clock.now());
const billing = fakeBilling({ prices: PRICES.map((p) => ({ ...p, active: true })) });
let failOn: string | null = null;
/** "decline", "lost" or "fail" act on the change now; a call's own name makes that call fail. */
const stripe = fakePlanChange({ prices: PRICES, failOn: (c) => (failOn === c ? "fail" : c === "scheduleAtRenewal" && failOn === "half" ? "lost" : c === "changeNow" && (failOn === "decline" || failOn === "lost" || failOn === "fail") ? failOn : null) });
const cases = fakeCaseCount();
const bookings = new PlanBookings({ db, now: () => clock.now(), files: { usedBytes: async () => 0 }, cases: () => cases });
const changes = new PlanChanges({ db, billing, plans: stripe, bookings, audit: auditEvent, clock: fake });

let app: { close(): Promise<void> } | null = null;
try {
  // ---------------------------------------------------------------------------- PlanChangePort: fake and recorded
  await runContract(planChangePortContract, "fakePlanChange", () => {
    const f = fakePlanChange({ prices: PRICES });
    f.subs.set("sub_c1", { id: "sub_c1", itemId: "si_c1", priceId: PRICES[0].id, interval: "month", unitAmount: PRICES[0].unitAmount, status: "active", periodEnd: new Date(Date.now() + 15 * DAY), trialEnd: null, scheduleId: null, pendingPriceId: null });
    return { port: f, subscriptionId: "sub_c1", fromPrice: PRICES[0].id, raisePrice: "price_firmMonth", charges: () => f.charges.length, scheduled: () => f.renewals.get("sub_c1")?.priceId ?? null };
  }, ok);
  await runContract(planChangePortContract, "StripePlanChange", () => recordedStripe(StripePlanChange), ok);
  {   // review M3/M5: what the adapter sends Stripe (API 2026-10-28.endive, stripe 23.1.0's types)
    const r = recordedStripe(StripePlanChange), at = new Date();
    await r.port.changeNow({ subscriptionId: "sub_r1", priceId: "price_firmMonth", prorate: false, anchorNow: false, prorationDate: at }, "pf16-params-trial");
    const t = r.lastForm();
    await r.port.changeNow({ subscriptionId: "sub_r1", priceId: "price_teamYear", prorate: true, anchorNow: true, prorationDate: at }, "pf16-params-year");
    const y = r.lastForm();
    ok("PF-16 adapter pass: a trial switch sends proration_behavior none and no proration_date (Stripe refuses the two together); monthly → yearly sends always_invoice, the preview's proration_date, billing_cycle_anchor[type]=now and error_if_incomplete", t.get("proration_behavior") === "none" && !t.has("proration_date") && y.get("proration_behavior") === "always_invoice" && y.get("proration_date") === String(Math.floor(at.getTime() / 1000)) && y.get("billing_cycle_anchor[type]") === "now" && y.get("payment_behavior") === "error_if_incomplete", { t: t.toString(), y: y.toString() });
  }

  // ------------------------------------------------------------------------------------- the app and the Sample firms
  const changesForApp = { provide: PLAN_CHANGES, useValue: changes };
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: MAIL_PORT, useValue: fakeMail() }, changesForApp];
  @Module({ controllers: [PlatformIdentityController, PlanChangeController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(db);
  const FIRM = sql(`select id from platform_firm where key = 'sample-firm'`), TEAM = sql(`select plan_id from platform_subscription where firm_id = '${FIRM}' and status <> 'ENDED'`);
  sql(`update platform_plan set code = 'team' where id = '${TEAM}' and code <> 'team'`);
  sql(`update platform_plan set stripe_monthly_price_id = 'price_teamMonth', stripe_yearly_price_id = 'price_teamYear' where id = '${TEAM}'`);
  sql(`update platform_plan set stripe_monthly_price_id = 'price_firmMonth' where code = 'firm'`);

  const OWNER_ID = sql(`select s.id from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null where s.firm_id = '${FIRM}' limit 1`);
  const OWNER_ACTOR = sql(`select actor_id from platform_staff where id = '${OWNER_ID}'`);
  const ADMIN_ID = sql(`select s.id from platform_staff s where s.firm_id = '${FIRM}' and s.status = 'ACTIVE' and s.id <> '${OWNER_ID}' and not exists (select 1 from platform_role_grant g where g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null) limit 1`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${FIRM}', '${ADMIN_ID}', 'ADMIN', 'seed:pf16')`);
  const ADMIN_ACTOR = sql(`select actor_id from platform_staff where id = '${ADMIN_ID}'`);
  const used = Number(sql(`select ((select count(*) from platform_staff where firm_id = '${FIRM}' and status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation where firm_id = '${FIRM}' and accepted_at is null and revoked_at is null and expires_at > now()))::int`));
  // Team allows used + 5 seats here; the cheaper plan used + 2 seats and every other limit lower; Sample prices.
  const seatsTeam = used + 5;
  sql(`update platform_plan set seats_limit = ${seatsTeam} where id = '${TEAM}'`);
  const LITE = sql(`insert into platform_plan (id, code, name, seats_limit, stripe_monthly_price_id) values (gen_random_uuid(), 'pf16-lite', 'Lite (Sample)', ${used + 2}, 'price_liteMonth') returning id`).split("\n")[0];
  sql(`insert into platform_plan_limit (plan_id, metric, limit_value) values ('${LITE}', 'ACTIVE_INDIVIDUAL_CASES', 5), ('${LITE}', 'ACTIVE_CORPORATE_CASES', 1), ('${LITE}', 'STORAGE_MB', 100)`);
  const setSub = async (status: string, periodDays: number, trialEnd: string | null = null) => {
    await fake.advance({ seconds: 5 });   // each case previews at its own second (a preview's date is in Stripe's key)
    sql(`update platform_subscription set status = '${status}', stripe_subscription_id = 'sub_f1', stripe_customer_id = 'cus_f1', current_period_end = now() + interval '${periodDays} days', trial_ends_at = ${trialEnd ? `'${trialEnd}'` : "null"}, plan_id = '${TEAM}' where firm_id = '${FIRM}' and status <> 'ENDED'`);
    stripe.subs.set("sub_f1", { id: "sub_f1", itemId: "si_f1", priceId: "price_teamMonth", interval: "month", unitAmount: 10_000, status: status === "TRIAL" ? "trialing" : "active", periodEnd: new Date(clock.now() + periodDays * DAY), trialEnd: trialEnd ? new Date(trialEnd) : null, scheduleId: null, pendingPriceId: null });
    stripe.renewals.clear();
    sql(`update platform_subscription_change set withdrawn_at = now() where withdrawn_at is null and applied_at is null`);   // each case starts with nothing booked
  };
  const chargesF1 = () => stripe.charges.filter((c) => c.subscriptionId === "sub_f1").length;
  const planOf = () => sql(`select p.code from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${FIRM}' and s.status <> 'ENDED'`);
  const events = () => Number(sql(`select count(*) from module_event where type = 'plan.changed' and firm_id = '${FIRM}'`));
  const owner = { firmId: FIRM, staffId: OWNER_ID } as never;
  const preview = (plan: string, period: "month" | "year" = "month") => walls.withFirm(FIRM, () => changes.preview(owner, { plan, period }));
  type Shown = { prorationDate: string; kind: string; amountDueNowCents: number };
  const change = (plan: string, period: "month" | "year", p: Shown) => walls.withFirm(FIRM, () => changes.change(owner, { plan, period, prorationDate: p.prorationDate, kind: p.kind as never, amountDueNowCents: p.amountDueNowCents }));
  const confirm = async (plan: string, period: "month" | "year" = "month") => change(plan, period, await preview(plan, period));
  const signIn = async (actorId: string) => (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string;
  const open = () => sql(`select count(*) from platform_subscription_change where withdrawn_at is null and applied_at is null`);

  // --------------------------------------------------------------------------------------------- Owner only (route)
  await setSub("ACTIVE", 15);
  const tO = await signIn(OWNER_ACTOR), tA = await signIn(ADMIN_ACTOR);
  const before = stripe.charges.length;
  const adm = await call(base, "POST", "/api/platform/billing/change-plan", { token: tA, body: { plan: "firm", period: "month", prorationDate: fake.now().toISOString(), kind: "now", amountDueNowCents: 0 } });
  const admP = await call(base, "POST", "/api/platform/billing/change-plan/preview", { token: tA, body: { plan: "firm", period: "month" } });
  ok("PF-16 fail (Owner only): an Admin changing the plan → 403, and its preview → 403; nothing reaches Stripe", adm.status === 403 && admP.status === 403 && stripe.charges.length === before && planOf() === "team", { adm, admP });
  const ownP = await call(base, "POST", "/api/platform/billing/change-plan/preview", { token: tO, body: { plan: "firm", period: "month" } });
  const bad = await call(base, "POST", "/api/platform/billing/change-plan/preview", { token: tO, body: { plan: "firm", period: "month", coupon: "FREE" } });
  ok("PF-16 pass (Owner only): the Owner's preview → 200 (kind now, the amount due, before taxes); an unknown field → 422 (PF-28's input rule)", ownP.status === 200 && ownP.body.kind === "now" && ownP.body.amountDueNowCents > 0 && /before applicable taxes/.test(ownP.body.taxNote) && bad.status === 422, { ownP, bad });

  // ----------------------------------------------------------------------------- a raise: prorated, charged once
  const pr = await preview("firm");
  failOn = "decline";
  const declined = await problemOf(() => change("firm", "month", pr));
  const again = await problemOf(() => change("firm", "month", pr)); failOn = null;
  ok("PF-16 fail (raise): a declined card → 402 PAYMENT_FAILED, the plan unchanged, nothing charged, no plan.changed; the same preview again replays the decline (preview again)", declined?.status === 402 && again?.status === 402 && planOf() === "team" && stripe.charges.length === before && events() === 0, { declined, again });
  const pr2 = await (async () => { await fake.advance({ seconds: 2 }); return preview("firm"); })();
  const lie = await problemOf(() => change("firm", "month", { ...pr2, amountDueNowCents: pr2.amountDueNowCents - 1 }));
  ok("PF-16 fail (raise): a confirmation whose amount is not the one previewed at its date → 409 PREVIEW_STALE, nothing charged", lie?.body.code === "PREVIEW_STALE" && stripe.charges.length === before, lie);
  const both = await Promise.allSettled([change("firm", "month", pr2), change("firm", "month", pr2)]);
  const charged = stripe.charges.filter((c) => c.subscriptionId === "sub_f1");
  ok("PF-16 pass (raise): a dearer plan mid-period applies at once and charges the prorated difference once, the amount the preview showed; our plan, one audit line, one plan.changed", charged.length === 1 && charged[0].cents === pr2.amountDueNowCents && planOf() === "firm" && events() === 1 && sql(`select count(*) from audit_event where action = 'platform.plan.changed' and detail->>'firmId' = '${FIRM}'`) === "1", { both: both.map((b) => b.status), charged });
  ok("PF-16 fail (raise, double click at the same moment): the second is refused (409 PLAN_CHANGE_IN_PROGRESS, never waited for): no second charge, audit line or event", both.filter((b) => b.status === "rejected" && /PLAN_CHANGE_IN_PROGRESS|SAME_PLAN/.test(JSON.stringify((b.reason as { getResponse?: () => unknown }).getResponse?.()))).length === 1);
  await setSub("ACTIVE", 15);
  const t0 = Date.now(), pf = await preview("firm"), storm = Promise.allSettled(Array.from({ length: 12 }, () => change("firm", "month", pf))), other = await db.platformPlan.count(), stormed = await storm;
  ok("PF-16 pass (break round 2, the pool): 12 changes at the same moment freeze nothing: an unrelated read answers, all 12 end within 15 s, one charge", other > 0 && Date.now() - t0 < 15_000 && stormed.filter((r) => r.status === "fulfilled").length === 1 && planOf() === "firm", { ms: Date.now() - t0, ok: stormed.filter((r) => r.status === "fulfilled").length });

  // -------------------------------------------------------------------- Stripe and ours disagreeing (review M2, break B3)
  await setSub("ACTIVE", 15);
  failOn = "lost";
  const lost = await confirm("firm"); failOn = null;
  ok("PF-16 pass (lost answer): Stripe made the change but its answer was lost: Stripe is read back and our side is written (no false \"not charged\")", lost.kind === "now" && planOf() === "firm" && stripe.subs.get("sub_f1")?.priceId === "price_firmMonth", lost);
  await setSub("ACTIVE", 15);
  stripe.subs.set("sub_f1", { ...stripe.subs.get("sub_f1")!, priceId: "price_firmMonth", unitAmount: 20_000 });   // Stripe moved, our write failed
  const c2 = chargesF1(), rep = await confirm("firm");
  ok("PF-16 pass (repair): when Stripe already bills the plan and ours did not follow, the same change completes our side only: no Stripe call, no charge", rep.kind === "repair" && planOf() === "firm" && chargesF1() === c2, rep);
  sql(`insert into platform_plan (id, code, name, seats_limit, stripe_monthly_price_id) values (gen_random_uuid(), 'pf16-twin', 'Twin (Sample)', 1, 'price_liteMonth')`);
  await setSub("ACTIVE", 15);
  stripe.subs.set("sub_f1", { ...stripe.subs.get("sub_f1")!, priceId: "price_liteMonth", unitAmount: 5_000 });
  const shared = await problemOf(() => preview("pf16-lite"));
  sql(`update platform_plan set active = false where code = 'pf16-twin'`);
  sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, expires_at) select gen_random_uuid(), '${FIRM}', 'pf16r.' || g || '@example.com', '{CASE_OFFICER}', 'pf16r-' || g, 'seed:pf16r', now() + interval '72 hours' from generate_series(1, 5) g`);
  const repC = await problemOf(() => confirm("pf16-lite"));
  sql(`update platform_invitation set revoked_at = now() where invited_by = 'seed:pf16r'`);
  ok("PF-16 fail (repair, break round 2 + review R2-m1): a price two plans share repairs nothing (409 PLAN_PRICE_SHARED); a repair to a smaller plan with too many staff → 409 DOWNGRADE_CONFLICTS; the plan stays", shared?.body.code === "PLAN_PRICE_SHARED" && repC?.body.code === "DOWNGRADE_CONFLICTS" && planOf() === "team", { shared, repC });
  await setSub("ACTIVE", 15);
  failOn = "fail";
  const unconf = await problemOf(() => confirm("firm")); failOn = null;
  ok("PF-16 fail (unconfirmed): a failure that did not change Stripe → 503 BILLING_UNCONFIRMED (never \"not charged\" for a failure that is not a card's); nothing changed", unconf?.body.code === "BILLING_UNCONFIRMED" && planOf() === "team", unconf);

  // -------------------------------------------------------------------------- a lower move: conflicts, then booked
  await setSub("ACTIVE", 15);
  sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, expires_at) select gen_random_uuid(), '${FIRM}', 'pf16.' || g || '@example.com', '{CASE_OFFICER}', 'pf16-' || g, 'seed:pf16', now() + interval '72 hours' from generate_series(1, 5) g`);
  const pl = await preview("pf16-lite"), cl = await problemOf(() => change("pf16-lite", "month", pl));
  const seatC = cl?.body.conflicts?.find((c: { metric: string }) => c.metric === "seats");
  ok("PF-16 fail (lower): with too many staff the preview lists the conflict and the change is refused 409 DOWNGRADE_CONFLICTS (used, limit, reduce 3, SA-4-56's words); nothing scheduled or booked", pl.kind === "renewal" && pl.conflicts.some((c: { metric: string }) => c.metric === "seats") && cl?.status === 409 && seatC?.reduce === 3 && /Remove 3 staff/.test(cl.body.detail) && stripe.renewals.size === 0 && open() === "0", { pl, cl });
  sql(`update platform_invitation set revoked_at = now() where firm_id = '${FIRM}' and invited_by = 'seed:pf16'`);
  const cL = chargesF1(), lw = await confirm("pf16-lite");
  const seatsNow = (await new PgEntitlements(db, () => clock.now()).limitOf(FIRM, "seats")).limit;
  ok("PF-16 pass (lower): a cheaper plan books for the renewal (a Stripe schedule at the period's end, no charge, no refund) and the lower limits apply at once (PF-15: seats " + seatsTeam + " → " + (used + 2) + ")", lw.kind === "renewal" && !lw.chargedNow && stripe.renewals.get("sub_f1")?.priceId === "price_liteMonth" && planOf() === "team" && seatsNow === used + 2 && chargesF1() === cL && pl.refund === false, { lw, seatsNow });
  const blocked = await problemOf(() => preview("firm")), blockedY = await problemOf(() => preview("team", "year"));
  ok("PF-16 fail (review B1, break B1/M4): while a renewal change is booked, a raise now or a period change → 409 PLAN_CHANGE_BOOKED (withdraw first): Stripe's schedule and ours never disagree", blocked?.body.code === "PLAN_CHANGE_BOOKED" && blockedY?.body.code === "PLAN_CHANGE_BOOKED" && chargesF1() === cL, { blocked, blockedY });
  const wd = await walls.withFirm(FIRM, () => changes.withdraw(owner));
  ok("PF-16 pass (withdraw): withdrawing releases Stripe's schedule and our booking; the limits are the current plan's again; withdrawing again changes nothing ({ withdrawn: false })", wd.withdrawn && wd.scheduleReleased && stripe.renewals.size === 0 && (await new PgEntitlements(db, () => clock.now()).limitOf(FIRM, "seats")).limit === seatsTeam && (await walls.withFirm(FIRM, () => changes.withdraw(owner))).withdrawn === false, wd);
  failOn = "scheduleAtRenewal";
  const sf = await problemOf(() => confirm("pf16-lite")); failOn = null;
  ok("PF-16 fail (lower): Stripe refusing the schedule (none made, read back) → 503, and our booking is withdrawn (nothing left lowering the limits)", sf?.status === 503 && open() === "0" && stripe.renewals.size === 0, sf);

  failOn = "half";
  const half = await problemOf(() => confirm("pf16-lite")); failOn = null;
  ok("PF-16 fail (review R2-M1): a schedule Stripe made but whose phases it refused is not \"booked\": 503, the half schedule released, our booking withdrawn", half?.status === 503 && open() === "0" && !stripe.subs.get("sub_f1")!.scheduleId, half);
  stripe.subs.set("sub_f1", { ...stripe.subs.get("sub_f1")!, scheduleId: "sub_sched_lastphase" });   // a booked change already applied: its schedule stays in its last phase
  const after = await confirm("firm");
  ok("PF-16 pass (review R2-M2): a schedule left in its last phase blocks nothing: a raise goes through, the schedule is released quietly (no withdrawal line)", after.kind === "now" && planOf() === "firm" && !stripe.subs.get("sub_f1")!.scheduleId && sql(`select count(*) from audit_event where action = 'platform.plan.period_withdrawn'`) === "0", after);

  // --------------------------------------------------------------------------------- the period: month ↔ year
  await setSub("ACTIVE", 10);
  const c0 = chargesF1(), py = await preview("team", "year"), my = await change("team", "year", py);
  const fresh = stripe.subs.get("sub_f1")!, ourEnd = new Date(sql(`select to_char(current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from platform_subscription where firm_id = '${FIRM}' and status <> 'ENDED'`));
  ok("PF-16 pass (monthly → yearly): applies at once with a fresh year from today, charged once (the year less the unused month); our period end is Stripe's new one (break M5)", my.kind === "now" && fresh.interval === "year" && Math.abs(fresh.periodEnd!.getTime() - (fake.now().getTime() + 365 * DAY)) < 2000 && chargesF1() === c0 + 1 && my.chargedCents === py.amountDueNowCents && Math.abs(ourEnd.getTime() - fresh.periodEnd!.getTime()) < 2000, { my, fresh, py, ourEnd });
  stripe.subs.set("sub_f1", { ...fresh, periodEnd: new Date(clock.now() + 200 * DAY) });
  const ym = await confirm("team", "month");
  ok("PF-16 fail (yearly → monthly): not now: booked at the anniversary (a schedule), nothing charged, no plan booking (the plan stays), one audit line", ym.kind === "renewal" && stripe.renewals.get("sub_f1")?.priceId === "price_teamMonth" && chargesF1() === c0 + 1 && open() === "0" && sql(`select count(*) from audit_event where action = 'platform.plan.period_booked'`) === "1", ym);
  await walls.withFirm(FIRM, () => changes.withdraw(owner));
  const ym2 = await confirm("team", "month");
  ok("PF-16 pass (break M3, review m1): the same period change booked again after a withdrawal makes a new schedule at Stripe (a fresh key), and the withdrawal had its audit line", ym2.kind === "renewal" && stripe.renewals.get("sub_f1")?.priceId === "price_teamMonth" && sql(`select count(*) from audit_event where action = 'platform.plan.period_withdrawn'`) === "1", ym2);

  // ------------------------------------------------------------------------- a trial switch: free, end unchanged
  await setSub("TRIAL", 9, new Date(clock.now() + 9 * DAY).toISOString());
  const c1 = chargesF1(), endBefore = sql(`select trial_ends_at from platform_subscription where firm_id = '${FIRM}' and status <> 'ENDED'`), ev0 = events();
  const stripeEnd = stripe.subs.get("sub_f1")!.trialEnd?.getTime();
  const pt = await preview("firm"), tr = await change("firm", "month", pt);
  ok("PF-16 pass (trial): during the trial a switch up applies at once, charges nothing, and the trial end is unchanged, ours and Stripe's (SA-4-56); one plan.changed", pt.kind === "trial" && pt.amountDueNowCents === 0 && tr.kind === "trial" && !tr.chargedNow && planOf() === "firm" && sql(`select trial_ends_at from platform_subscription where firm_id = '${FIRM}' and status <> 'ENDED'`) === endBefore && stripe.subs.get("sub_f1")!.trialEnd?.getTime() === stripeEnd && chargesF1() === c1 && events() === ev0 + 1, { pt, tr });
  await setSub("TRIAL", 1, new Date(clock.now() + 1 * DAY).toISOString());
  const pt2 = await preview("firm");
  await fake.advance({ days: 1, minutes: 1 });   // the trial ends between the preview and the confirmation
  const ended = await problemOf(() => change("firm", "month", pt2));
  ok("PF-16 fail (trial, review M4/break M6): a trial switch previewed free and confirmed after the trial ended → 409 PREVIEW_STALE (no longer a trial on the server's clock), nothing charged", ended?.body.code === "PREVIEW_STALE" && chargesF1() === c1 && planOf() === "team", ended);
  const nope = await problemOf(() => preview("pf16-no-such")), same = await problemOf(() => preview("team"));
  ok("PF-16 fail: an unknown plan → 404; the plan and period it is already on → 409 SAME_PLAN; nothing charged", nope?.status === 404 && same?.body.code === "SAME_PLAN" && chargesF1() === c1, { nope, same });

  // ------------------------------------------------------------------------------------------ the rest refused
  await setSub("PAYMENT_HOLD", 5);
  const held = await problemOf(() => preview("firm"));
  await setSub("ACTIVE", 15);
  const old = await problemOf(() => change("firm", "month", { prorationDate: new Date(clock.now() - 31 * 60_000).toISOString(), kind: "now", amountDueNowCents: 0 }));
  ok("PF-16 fail: a held firm → 409 BILLING_NOT_ACTIVE (pay first); a preview older than 30 minutes → 409 PREVIEW_STALE; neither reaches Stripe", held?.body.code === "BILLING_NOT_ACTIVE" && old?.body.code === "PREVIEW_STALE" && planOf() === "team", { held, old });

  // --------------------------------------------------------------- PF-15 part 1b's review Minors r1 and r2 (#2763)
  await setSub("ACTIVE", 5);
  await walls.withFirm(FIRM, () => bookings.book(FIRM, "pf16-lite", "staff:pf16"));
  sql(`update platform_subscription set plan_id = (select id from platform_plan where code = 'firm') where firm_id = '${FIRM}' and status <> 'ENDED'`);   // the plan moved another way
  const rebook = await walls.withFirm(FIRM, () => bookings.book(FIRM, "pf16-lite", "staff:pf16"));
  ok("PF-15b r1 pass: a booking that can no longer apply no longer blocks a new one: book() withdraws it (reason STALE) and books", rebook.toPlan === "pf16-lite" && sql(`select count(*) from audit_event where action = 'plan.change.withdrawn' and detail->>'reason' = 'STALE' and detail->>'firmId' = '${FIRM}'`) === "1", rebook);
  sql(`update platform_subscription set status = 'PAYMENT_HOLD' where firm_id = '${FIRM}' and status <> 'ENDED'`);
  await fake.advance({ days: 6 });
  const d = await bookings.daily();
  ok("PF-15b r2 fail: a held firm's due booking is not applied and is not counted or logged as a failure (it waits for the hold to end)", d.applied === 0 && d.failed === 0 && open() === "1", d);
  sql(`update platform_subscription set status = 'ACTIVE' where firm_id = '${FIRM}' and status <> 'ENDED'`);
  const d2 = await bookings.daily();
  ok("PF-15b r2 pass: once the hold ends the same booking applies (one plan.changed for the renewal)", d2.applied === 1 && planOf() === "pf16-lite" && Number(sql(`select count(*) from module_event where type = 'plan.changed' and payload->>'when' = 'renewal'`)) === 1, d2);
} catch (e) {
  fail++; console.log(`FAIL  PF-16: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 900)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
