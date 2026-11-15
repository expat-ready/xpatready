// PF-5 part 1 (contracts §7 §1.1; P-566; Lead B's rulings on #1815): sign-up to a no-card trial. The migration and its
// rules, BillingPort's contract (the fake and the Stripe adapter on recorded Stripe answers through the library's fetch
// client: no network), and the sign-up service, each "Done when" line of part 1 with a pass and a fail. One scratch
// database with every migration; the clock is a FakeClock; the identity side is the local stand-in; mail is fakeMail;
// audit is the real interim adapter (a wrapper forces its failure). No browser, no model call, no Stripe call (US$0).
//   tsx studio/tests/check_pf5_signup_billing.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { fakeBilling, type BillingPrice } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { billingPortContract } from "../ports/contracts/billing-port.contract.ts";
import { EVENT } from "../ports/events.ts";
import { fakeMail } from "../ports/mail.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { StripeBilling } from "../api/src/platform/billing/stripe.ts";
import { PlatformSignUpController } from "../api/src/platform/firms/routes.ts";
import { LocalSignUp } from "../api/src/platform/firms/signup-identity.ts";
import { ACCEPTED, ALREADY, FirmSignUp, TAX_NOTE, type SignUpPorts } from "../api/src/platform/firms/signup.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261115090000_pf5_signup_terms";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf5_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `pf5-check-${process.pid}`);
const PASSWORD = "correct horse battery staple 77";
const PRICES: BillingPrice[] = [{ id: "price_teamMonthly", unitAmount: 4900, currency: "cad", interval: "month", active: true }, { id: "price_teamYearly", unitAmount: 49000, currency: "cad", interval: "year", active: true }];

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return x.getStatus ? { status: x.getStatus(), body: x.getResponse?.() as Record<string, unknown> } : { status: 0, body: { error: String(e) } }; } };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Recorded Stripe answers (the shapes Stripe's API returns, cut to the fields the adapter reads), served to the library's
 *  fetch client: idempotency keys give the same answer, as Stripe does within 24 hours. */
function recordedStripe() {
  const byKey = new Map<string, { status: number; body: unknown }>();
  let n = 0, lastCheckout: URLSearchParams | null = null;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new globalThis.URL(String(input)), method = init?.method ?? "GET";
    const headers = new Headers(init?.headers), key = headers.get("idempotency-key");
    const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": `req_rec${++n}` } });
    if (key && byKey.has(`${url.pathname}:${key}`)) { const a = byKey.get(`${url.pathname}:${key}`)!; return answer(a.status, a.body); }
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    let out: { status: number; body: unknown };
    const price = method === "GET" && /^\/v1\/prices\/(.+)$/.exec(url.pathname);
    if (price) {
      const p = PRICES.find((x) => x.id === price[1]);
      out = p ? { status: 200, body: { id: p.id, object: "price", active: p.active, currency: p.currency, unit_amount: p.unitAmount, recurring: { interval: p.interval } } }
        : { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such price: '${price[1]}'` } } };
    } else if (method === "POST" && url.pathname === "/v1/customers") out = { status: 200, body: { id: `cus_rec${String(++n).padStart(6, "0")}`, object: "customer", email: form.get("email") } };
    else if (method === "POST" && url.pathname === "/v1/checkout/sessions") {
      lastCheckout = form;
      const id = `cs_test_rec${String(++n).padStart(6, "0")}`;
      out = { status: 200, body: { id, object: "checkout.session", mode: form.get("mode"), url: `https://checkout.stripe.com/c/pay/${id}` } };
    } else out = { status: 404, body: { error: { type: "invalid_request_error", message: `unrecorded ${method} ${url.pathname}` } } };
    if (key) byKey.set(`${url.pathname}:${key}`, out);
    return answer(out.status, out.body);
  }) as typeof fetch;
  return {
    port: StripeBilling.fromKey("sk_test_recordedOnly000000", fetchFn), priceId: PRICES[0].id,
    lastCheckoutParams: () => lastCheckout && { mode: lastCheckout.get("mode"), payment_method_collection: lastCheckout.get("payment_method_collection"),
      missing_payment_method: lastCheckout.get("subscription_data[trial_settings][end_behavior][missing_payment_method]"), trial_period_days: Number(lastCheckout.get("subscription_data[trial_period_days]")),
      automatic_tax: lastCheckout.get("automatic_tax[enabled]"), customer_update_address: lastCheckout.get("customer_update[address]") },
  };
}

function pf5Diff(): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(URL)} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return r.stdout.split("\n").filter((l) => /terms|signup_pending|PlatformBillingPeriod/i.test(l));
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  // --------------------------------------------------------------------------------------------- the migration (P-600)
  ok(`PF-5 the migration's stamp is later than every migration before it and its own (rows rev 16.7; newest before it: ${all.filter((d) => d < NEW).at(-1)})`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && (all.filter((d) => d < NEW).at(-1) ?? "") < NEW);
  for (const d of all.filter((x) => x < NEW)) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  ok("PF-5 fail: before PF-5's migration the schema differs on its tables", pf5Diff().length > 0);
  execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, NEW, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  ok("PF-5 pass: right after its own migration, migrate diff names none of its tables (measured before any later one)", pf5Diff().length === 0, pf5Diff());
  for (const d of all.filter((x) => x > NEW)) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  ok("PF-5 pass: three Sample terms versions, one of each kind", sql(`select string_agg(kind::text, ',' order by kind) from platform_terms_version`) === "TERMS_OF_SERVICE,PRIVACY_NOTICE,DATA_PROCESSING");
  ok("PF-5 fail: a terms version is never changed or removed", refused(`update platform_terms_version set url = '/x'`, /insert_only/) && refused(`delete from platform_terms_version`, /insert_only/));
  const tv = sql(`select id from platform_terms_version limit 1`);
  const pend = (email: string, hash: string, ago = "0 hours", life = "24 hours") => `insert into platform_signup_pending (id, email, firm_name, country_code, plan_code, identity_subject, terms_version_ids, terms_accepted_at, token_hash, created_at, expires_at) values (gen_random_uuid(), '${email}', 'F', 'CA', 'team', 's', array['${tv}']::uuid[], now(), '${hash}', now() - interval '${ago}', now() - interval '${ago}' + interval '${life}') returning id`;
  const live = sql(pend("rule@firm.example.com", "h1"));
  ok("PF-5 fail: one live pending sign-up per email (a second is refused)", refused(pend("rule@firm.example.com", "h2"), /one_live/));
  ok("PF-5 fail: a pending sign-up changes only its used_at, once; a live one is never removed",
    refused(`update platform_signup_pending set firm_name = 'G' where id = '${live}'`, /changes only once/) && refused(`delete from platform_signup_pending where id = '${live}'`, /only after it expires/)
    && sql(`update platform_signup_pending set used_at = now() where id = '${live}' returning 1`) === "1" && refused(`update platform_signup_pending set used_at = now() where id = '${live}'`, /changes only once/));
  ok("PF-5 fail: a pending sign-up lives at most 24 hours, names existing terms and keeps the email in lower case",
    refused(pend("long@firm.example.com", "h3", "0 hours", "25 hours"), /life/) && refused(pend("Upper@firm.example.com", "h4"), /email_lower/)
    && refused(`insert into platform_signup_pending (email, id, firm_name, country_code, plan_code, identity_subject, terms_version_ids, terms_accepted_at, token_hash, expires_at) values ('t@f.example.com', gen_random_uuid(), 'F', 'CA', 'team', 's', array[gen_random_uuid()], now(), 'h5', now() + interval '1 hour')`, /do not exist/));
  ok("PF-5 pass: no password column anywhere in the pending sign-up", sql(`select count(*) from information_schema.columns where table_name = 'platform_signup_pending' and column_name ~ 'pass'`) === "0");
  sql(`update platform_plan set stripe_monthly_price_id = 'price_teamMonthly', stripe_yearly_price_id = 'price_teamYearly' where code = 'team'`);

  // ------------------------------------------------------------------------------------------------ BillingPort contract
  await runContract(billingPortContract, "fakeBilling", () => { const f = fakeBilling({ prices: PRICES }); return { port: f, priceId: PRICES[0].id, lastCheckoutParams: () => { const c = f.checkouts.at(-1); return c ? { mode: "subscription", payment_method_collection: c.paymentMethodCollection, missing_payment_method: c.missingPaymentMethod, trial_period_days: c.input.trialDays } : null; } }; }, ok);
  await runContract(billingPortContract, "StripeBilling", recordedStripe, ok);
  const rec = recordedStripe();
  const { customerId: cust } = await rec.port.ensureCustomer({ firmId: "0f5a0000-0000-4000-8000-000000000009", email: "a@b.example.com", name: "A" });
  await rec.port.startTrialCheckout({ firmId: "0f5a0000-0000-4000-8000-000000000009", customerId: cust, priceId: PRICES[0].id, trialDays: 14, successUrl: "https://a.example.com/ok", cancelUrl: "https://a.example.com/no" });
  ok("PF-5 (Lead B, fact 3): the trial's Checkout turns Stripe Tax on and saves the address to the customer", rec.lastCheckoutParams()?.automatic_tax === "true" && rec.lastCheckoutParams()?.customer_update_address === "auto", rec.lastCheckoutParams());

  // ------------------------------------------------------------------------------------------------------ the service
  const clock = new FakeClock(new Date());
  const mail = fakeMail({ clock });
  let failAudit: string | null = null, failBilling = false;
  const billing = fakeBilling({ prices: PRICES, failOn: () => failBilling });
  const identity = new LocalSignUp(() => clock.now());
  const ports: SignUpPorts = { audit: { record: async (tx, e) => { if (failAudit && e.action === failAudit) throw new Error("forced audit failure"); await auditEvent.record(tx, e); } }, billing, identity, mail, clock, appUrl: "https://app.expatready.test" };
  const s = new FirmSignUp(db, ports);
  const plans = await s.plans();
  const team = plans.plans.find((p) => p.code === "team"), solo = plans.plans.find((p) => p.code === "solo");
  ok("PF-5 pass: GET plans reads Stripe's prices through BillingPort, marked \"+ applicable taxes\", with the current terms",
    team?.monthly?.amountCents === 4900 && team.yearly?.interval === "year" && plans.taxNote === TAX_NOTE && plans.terms.length === 3 && plans.defaultPlan === "team", plans);
  ok("PF-5 fail: a plan with no Stripe price shows no price (never an invented one)", solo?.monthly === null && solo?.yearly === null);
  const terms = plans.terms.map((t) => t.id);
  const form = async (over: Record<string, unknown> = {}) => { const p = await s.plans(); await clock.advance({ seconds: 5 }); return { email: "owner@maple.example.com", password: PASSWORD, firmName: "Maple Immigration", countryCode: "CA", acceptedTerms: terms, formStamp: p.formStamp, ...over }; };
  const pendingCount = (email: string) => sql(`select count(*) from platform_signup_pending where email = '${email}'`);
  const verifyMails = (to: string) => identity.sent.filter((m) => m.to === to);

  const noTerms = await problemOf(async () => s.signUp(await form({ acceptedTerms: terms.slice(0, 2) }), "10.0.0.1"));
  ok("PF-5 fail: a sign-up without accepting every current terms version is refused at the field, nothing stored",
    noTerms?.status === 400 && JSON.stringify(noTerms.body.errors).includes("acceptedTerms") && pendingCount("owner@maple.example.com") === "0", noTerms);
  const bot = await s.signUp(await form({ email: "bot@maple.example.com", website: "http://spam.example.com" }), "10.0.0.2");
  const fastForm = await form({ email: "fast@maple.example.com" });
  const fast = await s.signUp({ ...fastForm, formStamp: (await s.plans()).formStamp }, "10.0.0.3");   // sent at once: too fast
  ok("PF-5 fail: the honeypot or a too-fast fill is answered like any other sign-up, nothing stored or sent",
    bot.message === ACCEPTED && fast.message === ACCEPTED && pendingCount("bot@maple.example.com") === "0" && pendingCount("fast@maple.example.com") === "0" && identity.sent.length === 0);
  const first = await s.signUp(await form(), "10.0.0.4");
  const second = await s.signUp(await form({ firmName: "Another Name" }), "10.0.0.5");
  ok("PF-5 pass/fail: a second sign-up for the same email while a link is live → one pending sign-up and one email, the same answer",
    first.message === ACCEPTED && second.message === ACCEPTED && pendingCount("owner@maple.example.com") === "1" && verifyMails("owner@maple.example.com").length === 1);
  ok("PF-5 fail: the password is never stored (not in the pending row, an audit line or an email)",
    !sql(`select row_to_json(p)::text from platform_signup_pending p`).includes(PASSWORD) && !sql(`select coalesce(string_agg(row_to_json(a)::text, ''), '') from audit_event a`).includes(PASSWORD) && !identity.sent.some((m) => m.text.includes(PASSWORD)));
  ok("PF-5 fail: an unverified sign-up creates no firm", sql(`select count(*) from platform_firm where contact_email = 'owner@maple.example.com'`) === "0");

  const link = verifyMails("owner@maple.example.com")[0].text;
  const token = /token=([A-Za-z0-9_-]{43})/.exec(link)?.[1] ?? "", code = /code=(\d{6})/.exec(link)?.[1] ?? "";
  const wrong = await problemOf(() => s.verify({ token, code: code === "000000" ? "111111" : "000000" }, "10.0.1.1"));
  ok("PF-5 fail: a wrong code is refused and makes no firm", wrong?.status === 400 && sql(`select count(*) from platform_firm where contact_email = 'owner@maple.example.com'`) === "0", wrong);
  failAudit = "platform.terms.accepted";
  const rolled = await problemOf(() => s.verify({ token, code }, "10.0.1.2"));
  failAudit = null;
  ok("PF-5 fail: a forced audit failure rolls the whole sign-up back (no firm, no Owner, the link still unused)",
    rolled !== null && sql(`select count(*) from platform_firm where contact_email = 'owner@maple.example.com'`) === "0" && sql(`select count(*) from platform_staff where email = 'owner@maple.example.com'`) === "0"
    && sql(`select count(*) from platform_signup_pending where email = 'owner@maple.example.com' and used_at is null`) === "1", rolled);
  const [a, b] = await Promise.allSettled([s.verify({ token, code }, "10.0.1.3"), s.verify({ token, code }, "10.0.1.4")]);
  const made = a.status === "fulfilled" ? a.value : b.status === "fulfilled" ? b.value : null;
  const firmId = sql(`select id from platform_firm where contact_email = 'owner@maple.example.com'`);
  ok("PF-5 pass/fail: a double submit of the verification makes one firm (PROVISIONING) and one Owner; the other is the 404",
    !!made && [a, b].filter((x) => x.status === "fulfilled").length === 1 && made.status === "PROVISIONING" && sql(`select count(*) from platform_firm where contact_email = 'owner@maple.example.com'`) === "1"
    && sql(`select string_agg(g.role::text, ',') from platform_role_grant g join platform_staff p on p.id = g.staff_id where p.email = 'owner@maple.example.com'`) === "OWNER", [a, b].map((x) => x.status === "rejected" ? String(x.reason) : "ok"));
  ok("PF-5 pass: an acceptance row per current terms version records kind, version, time and who (the Owner)",
    sql(`select string_agg(v.kind::text || '@' || v.version, ',' order by v.kind) from platform_terms_acceptance t join platform_terms_version v on v.id = t.version_id join platform_staff p on p.id = t.staff_id and p.firm_id = t.firm_id where t.firm_id = '${firmId}' and p.email = 'owner@maple.example.com' and t.accepted_at is not null`)
      === "TERMS_OF_SERVICE@sample-2026-11-15,PRIVACY_NOTICE@sample-2026-11-15,DATA_PROCESSING@sample-2026-11-15");
  const co = billing.checkouts.at(-1);
  ok("PF-5 pass (A46's weak point, tested): the trial starts through Checkout with no card (if_required), pause at trial end, the plan's 14 days and price, on the firm's own customer",
    !!made?.checkoutUrl && co?.paymentMethodCollection === "if_required" && co.missingPaymentMethod === "pause" && co.input.trialDays === 14 && co.input.priceId === "price_teamMonthly" && co.input.firmId === firmId
    && sql(`select status::text || ':' || coalesce(stripe_customer_id, '-') from platform_subscription where firm_id = '${firmId}'`) === `TRIAL:${co.input.customerId}`, { made, co });
  ok("PF-5 pass: each change has its audit line in its transaction, and firm.created is in the outbox once (written last)",
    sql(`select string_agg(action, ',' order by action) from audit_event where detail->>'firmId' = '${firmId}'`) === "firm.created,platform.staff.owner_created,platform.subscription.created,platform.subscription.customer_linked,platform.terms.accepted"
    && sql(`select count(*) from module_event where firm_id = '${firmId}' and type = '${EVENT.FIRM_CREATED}'`) === "1");
  const again = await problemOf(() => s.verify({ token, code }, "10.0.1.5"));
  ok("PF-5 fail: a verification link used twice → 404", again?.status === 404, again);
  const known = await s.signUp(await form(), "10.0.0.6");
  ok("PF-5 pass/fail: a sign-up for an email that already has an account → the same answer, an email saying \"You already have an account. Sign in.\", nothing stored",
    known.message === ACCEPTED && mail.inbox("owner@maple.example.com").some((m) => m.text.startsWith(ALREADY)) && pendingCount("owner@maple.example.com") === "1" && verifyMails("owner@maple.example.com").length === 1);

  sql(pend("late@firm.example.com", sha("L".repeat(43)), "25 hours"));
  const late = await problemOf(() => s.verify({ token: "L".repeat(43), code: "123456" }, "10.0.1.6"));
  const junk = await problemOf(() => s.verify({ token: "Z".repeat(43), code: "123456" }, "10.0.1.7"));
  ok("PF-5 fail: an expired or unknown verification link → the same 404", late?.status === 404 && junk?.status === 404 && JSON.stringify(late.body) === JSON.stringify(junk.body), [late, junk]);
  const purged = await s.purgeExpired();
  ok("PF-5 pass/fail (Lead B (3)): the sweep removes expired pending sign-ups (used or not) and keeps the live ones",
    purged >= 1 && pendingCount("late@firm.example.com") === "0" && sql(`select count(*) from platform_signup_pending where expires_at > now()`) !== "0", purged);
  const resign = await s.signUp(await form({ email: "again@firm.example.com" }), "10.0.0.7");
  ok("PF-5 pass: a new email signs up and gets its one verification email", resign.message === ACCEPTED && verifyMails("again@firm.example.com").length === 1 && pendingCount("again@firm.example.com") === "1");

  failBilling = true;
  const down = await s.plans();
  ok("PF-5 fail: Stripe unreachable → the plans still show, without prices, saying so", down.pricesAvailable === false && down.plans.length === 3 && down.plans.every((p) => p.monthly === null), down);
  await s.signUp(await form({ email: "nostripe@firm.example.com", firmName: "No Stripe Law" }), "10.0.0.8");
  const ns = verifyMails("nostripe@firm.example.com")[0].text;
  const nsOut = await s.verify({ token: /token=([A-Za-z0-9_-]{43})/.exec(ns)?.[1], code: /code=(\d{6})/.exec(ns)?.[1] }, "10.0.1.8");
  failBilling = false;
  ok("PF-5 fail: Stripe unreachable after the commit → the firm stays setting up (PROVISIONING), no checkout, a plain next step",
    nsOut.checkoutUrl === null && /Sign in/.test(String(nsOut.next)) && sql(`select status from platform_firm where key = '${nsOut.firmKey}'`) === "PROVISIONING", nsOut);

  let limited: Awaited<ReturnType<typeof problemOf>> = null;
  for (let i = 0; i < 11 && !limited; i++) limited = await problemOf(async () => s.signUp(await form({ email: `burst${i}@firm.example.com` }), "10.9.9.9"));
  const otherIp = await s.signUp(await form({ email: "calm@firm.example.com" }), "10.9.9.8");
  ok("PF-5 pass/fail: the door's per-IP limit answers 429 after 10 tries in 10 minutes; another address is not held", limited?.status === 429 && otherIp.message === ACCEPTED, limited);

  const routes = Object.getOwnPropertyNames(PlatformSignUpController.prototype).filter((k) => k !== "constructor").map((k) => {
    const h = (PlatformSignUpController.prototype as unknown as Record<string, () => unknown>)[k];
    return `${["GET", "POST"][Reflect.getMetadata(METHOD_METADATA, h) as number] ?? "?"} ${Reflect.getMetadata(PATH_METADATA, h)}`;
  });
  ok("PF-5 fail: the verification is POST only (opening the email's link changes nothing)", routes.includes("POST signup/verify") && !routes.some((r) => r.startsWith("GET signup")), routes);
} catch (e) {
  ok("PF-5 the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
