// FO-7c part 2a (R1.57; brief design/briefs/FO-7c.md's named cases, shaped in product/screens/FO-7c/shape-r1.57.md, Lead 4
// on #3633): the pay link and the client's pay door on the fake rail. DW4 (the pay link's walls), DW5 (the pay link),
// DW8 (account down), DW11 (no write on a GET), PF-27's stand-in, the door's headers and its rate limit. DW6, DW7 and DW4's
// payment events are part 2b; DW9 is part 3. A scratch database (every migration), a Nest app of PF-4's guard, PF-12's
// walls and this part's classes with the local sign-in stand-in; the API connects as xr_app. No network, no key, US$0.
//   tsx studio/tests/check_fo7c_pay_link.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CARD_DOWN, CardPay, LINK_NOT_WORKING, NOT_AVAILABLE } from "../api/src/client-money/card/pay.ts";
import { fakeCardRail } from "../api/src/client-money/card/rail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7c2a_scratch_${process.pid}`, urlOf = (user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${DB}`;
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf();
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL", "PLATFORM_STRIPE_SECRET_KEY", "PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PayLinkController, PublicPayController } = await import("../api/src/client-money/card/routes.ts");
const { default: feature } = await import("../api/src/features/client-money-card.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { InvoiceMoney } = await import("../api/src/client-money/invoices/money.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { failClosed } = await import("../api/src/client-money/reads/visibility.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7c2a-check-signing-key-0123456789abcdef", () => clock.now());
const rail = fakeCardRail();
let scoped = true;   // false: the C5 scope fails closed (FO-7b's own suite tests the real one)
type Res = { status: number; body: any; headers: Headers };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const ports = (db: InstanceType<typeof Db>) => new CardPay(db, { rail, audit: auditEvent, clock: { now: () => new Date() }, appUrl: "https://app.example.test", scopeOf: async (ctx) => (scoped ? "ALL" : failClosed(ctx)) });
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: CardPay, useFactory: ports, inject: [Db] }];
  @Module({ controllers: [PlatformIdentityController, PayLinkController, PublicPayController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const read = async (r: Response): Promise<Res> => { const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b, headers: r.headers }; };
  const call = async (token: string | undefined, method: string, path: string, body?: unknown, ip?: string) => read(await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { "x-forwarded-for": ip } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
  ok("setup: the feature registers the pay link's and the door's controllers and CardPay beside part 1's", feature.controllers.length === 4 && feature.providers.some((p) => (p as { provide: unknown }).provide === CardPay));

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tOwner = await signIn("user-R", "sample-firm"), tOfficer = await signIn("user-O", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7c-2a', now())`);
  sql(`update platform_firm set business_address = '{"city":"Toronto","province_state":"ON","country":"CA","phone":"+1 416 555 0100"}'::jsonb, billing_email = 'billing@sample-firm.example' where id = '${A}'`);
  const person = (firm: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client', 'Sample', 'fo7c2a.${Math.random().toString(36).slice(2)}@example.org', 'seed:FO-7c-2a', now()) returning id`);
  const PA = person(A), PB = person(B);
  const money = new InvoiceMoney(owner, auditEvent, { now: () => new Date() }, null, undefined, async () => "ALL");
  const ctxOf = (firm: string, actor: string) => ({ firmId: firm, staffId: staff(actor, firm), keys: [], authTime: Date.now() / 1000 }) as never;
  /** An invoice of one 1,000.00 fee line (Sample), issued through FO-7b's own route unless `draft`. */
  const invoice = async (firm: string, party: string, actor: string, draft = false) => {
    const id = sql(`insert into money_invoice (firm_id, person_id, currency, created_by, updated_at) values ('${firm}', '${party}', 'CAD', 'seed:FO-7c-2a', now()) returning id`);
    sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${firm}', '${id}', 1, 'FEE', 'Professional fee (Sample)', 1, 100000, 100000, 0, 0, 'CAD')`);
    if (!draft) await withFirm(firm, () => money.issue(ctxOf(firm, actor), id, {}));
    return id;
  };
  const pay = (firm: string, id: string, actor: string, amountMinor: number, key: string) => withFirm(firm, () => money.record(ctxOf(firm, actor), id, { method: "E_TRANSFER", amountMinor, idempotencyKey: key }));
  const LINK = (id: string) => `/front-office/money/invoices/${id}/pay-link`;
  const tokenOf = (r: Res) => String(r.body?.url ?? "").split("/money/pay/")[1] ?? "";
  const sessions = () => rail.calls().filter((c) => c.name === "createHostedPayment");
  const hashOf = (id: string, firm = A) => sql(`select coalesce(pay_link_token_hash, 'none') from money_invoice where firm_id = '${firm}' and id = '${id}'`);

  const I1 = await invoice(A, PA, "user-R"), D1 = await invoice(A, PA, "user-R", true);

  // ------------------------------------------------------------------------------------------ DW5: the pay link
  const mk = await call(tOwner, "POST", LINK(I1)), T1 = tokenOf(mk);
  ok("FO-7c DW5 pass: the Owner makes a pay link for an issued invoice with 1,000.00 due → a link on the client's page, firm-first token; only its SHA-256 is stored; one audit line by the Owner",
    mk.status === 200 && mk.body.amountDueMinor === 100000 && mk.body.currency === "CAD" && /^https:\/\/app\.example\.test\/money\/pay\/[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(mk.body.url) && T1.startsWith(A.replace(/-/g, ""))
    && hashOf(I1) === createHash("sha256").update(T1).digest("hex") && !sql(`select row_to_json(i)::text from money_invoice i where id = '${I1}'`).includes(T1.split(".")[1])
    && sql(`select count(*) || ':' || min(actor) from audit_event where action = 'invoice.pay_link_made' and entity_key = '${I1}'`) === `1:staff:${staff("user-R", A)}`, mk.body);
  const part = await call(tOwner, "POST", LINK(I1), { amountMinor: 5000 });
  ok("FO-7c DW5 fail: a part amount → refused (422, the field named); the stored link unchanged (full amount only, AG-6-14 rule 2)", part.status === 422 && JSON.stringify(part.body).includes("amountMinor") && hashOf(I1) === createHash("sha256").update(T1).digest("hex"), part.body);
  sql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:FO-7c-2a' where firm_id = '${A}'`);   // a trust request needs trust on
  const draft = await call(tOwner, "POST", LINK(D1)), trustReq = sql(`insert into money_trust_request (firm_id, person_id, currency, amount_minor, purpose, created_by, updated_at) values ('${A}', '${PA}', 'CAD', 50000, 'Deposit for the application (Sample)', 'seed:FO-7c-2a', now()) returning id`).split("\n")[0];
  const tr = await call(tOwner, "POST", LINK(trustReq)), bad = await call(tOwner, "POST", LINK("not-an-id"));
  ok("FO-7c DW5 fail: a draft → 409 DRAFT; a trust request's id (not an invoice) and a malformed id → the one 404; nothing stored", draft.status === 409 && draft.body.code === "DRAFT" && tr.status === 404 && bad.status === 404 && hashOf(D1) === "none", [draft.body, tr.body]);
  const I2 = await invoice(A, PA, "user-R"); await pay(A, I2, "user-R", 100000, "fo7c2a-paid-in-full");
  const paid = await call(tOwner, "POST", LINK(I2));
  const I3 = await invoice(A, PA, "user-R"); await withFirm(A, () => money.credit(ctxOf(A, "user-R"), I3, { full: true, reason: "Issued by mistake (Sample)" }));
  const credited = await call(tOwner, "POST", LINK(I3));
  ok("FO-7c DW5 fail: a paid invoice → 409 NOTHING_DUE; a credited one → 409 SETTLED; no link stored", paid.status === 409 && paid.body.code === "NOTHING_DUE" && credited.status === 409 && credited.body.code === "SETTLED" && hashOf(I2) === "none" && hashOf(I3) === "none", [paid.body, credited.body]);
  const officer = await call(tOfficer, "POST", LINK(I1)), anon = await call(undefined, "POST", LINK(I1));
  ok("FO-7c DW5 fail: a person without agent/payment:online → 403; not signed in → 401", officer.status === 403 && anon.status === 401, [officer.body, anon.body]);
  sql(`update platform_firm set status = 'SECURITY_LOCK' where id = '${A}'`); const locked = await call(tOwner, "POST", LINK(I1)); sql(`update platform_firm set status = 'ACTIVE' where id = '${A}'`);
  ok("FO-7c DW5 fail (PF-27's stand-in): a locked firm → PF-27's neutral refusal (409 NOT_AVAILABLE), the word \"lock\" nowhere; the link unchanged",
    (locked.status === 409 && locked.body.code === "NOT_AVAILABLE" && locked.body.detail === NOT_AVAILABLE && !/lock/i.test(JSON.stringify(locked.body))), locked.body);

  // --------------------------------------------------------------------------------------------- DW4: the walls
  const other = await call(tB, "POST", LINK(I1));
  scoped = false; const outOfScope = await call(tOwner, "POST", LINK(I1)); scoped = true;
  ok("FO-7c DW4 fail: firm B's Owner asking for firm A's invoice's pay link → 404; outside the caller's C5 scope → the same 404; firm A's link unchanged", other.status === 404 && outOfScope.status === 404 && hashOf(I1) === createHash("sha256").update(T1).digest("hex"), [other.body, outOfScope.body]);
  const IB = await invoice(B, PB, "user-S"), mkB = await call(tB, "POST", LINK(IB)), TB = tokenOf(mkB);
  const forged = `${A.replace(/-/g, "")}.${TB.split(".")[1]}`, fA = await call(undefined, "GET", `/public/pay/${forged}`);
  ok("FO-7c DW4 fail: firm B's verifier under firm A's id (a forged firm-first token) → the one not-found; firm B's own link opens firm B's invoice only", mkB.status === 200 && fA.status === 404 && fA.body.code === "LINK_NOT_WORKING" && (await call(undefined, "GET", `/public/pay/${TB}`)).body.invoice.number === sql(`select number from money_invoice where id = '${IB}'`), fA.body);

  // ------------------------------------------------------------------------------ DW8: account down, DW11: no write
  const before = sessions().length, g1 = await call(undefined, "GET", `/public/pay/${T1}`), g2 = await call(undefined, "GET", `/public/pay/${T1}`);
  ok("FO-7c DW8 pass (not connected): the client's answer has the invoice and the full amount due, no card, and the contact line (no operating details saved: AG-6-49 r1(b))",
    g1.status === 200 && g1.body.invoice.dueMinor === 100000 && g1.body.invoice.lines.length === 1 && g1.body.card.offered === false && g1.body.offline.message === CARD_DOWN && g1.body.offline.details === null
    && g1.body.offline.contact === "Please contact Sample Immigration Firm, +1 416 555 0100, billing@sample-firm.example to arrange payment.".replace("Sample Immigration Firm", sql(`select operating_name from platform_firm where id = '${A}'`)), g1.body);
  ok("FO-7c DW11 pass: the GET twice creates no hosted payment and nothing in the database (no audit line, no payment)", sessions().length === before && g2.status === 200 && Number(sql(`select count(*) from audit_event where action not in ('invoice.pay_link_made', 'invoice.issued', 'payment.recorded', 'invoice.credited') and firm_id = '${A}' and at > now() - interval '1 minute' and actor like 'system:%'`)) === 0);
  ok("FO-7c door pass: every answer of the door carries Cache-Control no-store and Referrer-Policy no-referrer, the not-found included", [g1, fA].every((r) => r.headers.get("cache-control") === "no-store" && r.headers.get("referrer-policy") === "no-referrer"));
  const down = await call(undefined, "POST", `/public/pay/${T1}/session`);
  ok("FO-7c DW8 fail: asking for a card session with no connected account → 409 CARD_NOT_OFFERED with the offline answer, no hosted payment", down.status === 409 && down.body.code === "CARD_NOT_OFFERED" && down.body.offline?.contact?.startsWith("Please contact") && sessions().length === before, down.body);
  sql(`update money_payment_settings set operating_details = 'Interac e-Transfer to billing@sample-firm.example (Sample)' where firm_id = '${A}'`);
  const acct = (await rail.createAccount({ firmId: A, idempotencyKey: "fo7c2a-acct-A" })).id;
  for (const [status, charges] of [["PENDING", false], ["RESTRICTED", true], ["RESTRICTED", false], ["DISCONNECTED", false]] as const) {
    sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${A}', '${acct}', '${status}', ${charges}, false, now()) on conflict (firm_id) do update set status = excluded.status, charges_enabled = excluded.charges_enabled`);
    const r = await call(undefined, "GET", `/public/pay/${T1}`);
    ok(`FO-7c DW8 pass (${status}, charges ${charges ? "on" : "off"}): no card; the operating details block, no contact line`, r.status === 200 && r.body.card.offered === false && r.body.offline.details?.startsWith("Interac") && r.body.offline.contact === null && r.body.offline.reference === r.body.invoice.number, r.body);
  }

  // ------------------------------------------------------------------------------------- the card session (ACTIVE)
  rail.set(acct, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false });
  sql(`update money_payment_account set status = 'ACTIVE', charges_enabled = true, payouts_enabled = true where firm_id = '${A}'`);
  const open = await call(undefined, "GET", `/public/pay/${T1}`), s1 = await call(undefined, "POST", `/public/pay/${T1}/session`), s2 = await call(undefined, "POST", `/public/pay/${T1}/session`);
  const made = sessions().slice(before);
  ok("FO-7c DW11 pass: ACTIVE with charges on → the card offered, no offline block; each POST asks the rail once with the same idempotency key while nothing changed, and gets the same hosted page",
    open.body.card.offered === true && open.body.offline === null && s1.status === 200 && /^https:\/\/pay\.fake-rail\.example\/cs_fake_/.test(s1.body.url) && s2.body.url === s1.body.url && made.length === 2 && made[0].key === made[1].key && made[0].key === `fo7c-pay-${I1}-100000-0`, { open: open.body, made });
  await pay(A, I1, "user-R", 40000, "fo7c2a-part-offline");
  const s3 = await call(undefined, "POST", `/public/pay/${T1}/session`), k3 = sessions().at(-1)?.key;
  ok("FO-7c DW5 pass (AG-6-14 rule 2): after 400.00 paid another way, the session is for exactly the 600.00 still due, under a new key", s3.status === 200 && k3 === `fo7c-pay-${I1}-60000-1` && (await call(undefined, "GET", `/public/pay/${T1}`)).body.invoice.dueMinor === 60000, k3);
  sql(`update platform_firm set status = 'SECURITY_LOCK' where id = '${A}'`);
  const lg = await call(undefined, "GET", `/public/pay/${T1}`), ls = await call(undefined, "POST", `/public/pay/${T1}/session`); sql(`update platform_firm set status = 'ACTIVE' where id = '${A}'`);
  ok("FO-7c DW5 fail (PF-27's stand-in): a locked firm's link offers no card and its session is refused in PF-27's neutral words (no word \"lock\")",
    lg.status === 200 && lg.body.card.offered === false && ls.status === 409 && ls.body.code === "NOT_AVAILABLE" && !/lock/i.test(JSON.stringify([lg.body, ls.body])), [lg.body, ls.body]);

  // ---------------------------------------------------------------------- a replaced or settled link stops working
  const mk2 = await call(tOwner, "POST", LINK(I1)), T2 = tokenOf(mk2), oldOne = await call(undefined, "GET", `/public/pay/${T1}`);
  ok("FO-7c DW5 pass: a new link replaces the old one: the old answers the one not-found, the new one opens; the audit line says so", mk2.status === 200 && oldOne.status === 404 && oldOne.body.detail === LINK_NOT_WORKING && (await call(undefined, "GET", `/public/pay/${T2}`)).status === 200
    && sql(`select (detail->>'replaced') from audit_event where action = 'invoice.pay_link_made' and entity_key = '${I1}' order by at desc limit 1`) === "true", oldOne.body);
  await pay(A, I1, "user-R", 60000, "fo7c2a-rest-offline");
  const settled = await call(undefined, "GET", `/public/pay/${T2}`), settledS = await call(undefined, "POST", `/public/pay/${T2}/session`);
  ok("FO-7c DW5 fail: once paid in full the link is the same not-found as an unknown one (GET and POST), no session", settled.status === 404 && settledS.status === 404 && settled.body.detail === LINK_NOT_WORKING && sessions().length === before + 3, settled.body);
  const unknown = await call(undefined, "GET", `/public/pay/${A.replace(/-/g, "")}.${"A".repeat(43)}`), malformed = await call(undefined, "GET", "/public/pay/nonsense");
  ok("FO-7c DW5 fail: an unknown and a malformed link → the same 404 and words", unknown.status === 404 && malformed.status === 404 && unknown.body.detail === malformed.body.detail, [unknown.body, malformed.body]);

  // -------------------------------------------------------------------------------------------------- the limit
  const burst: number[] = [];
  for (let i = 0; i < 32; i++) burst.push((await call(undefined, "GET", `/public/pay/${TB}`)).status);
  ok("FO-7c door fail: more than 30 calls a minute on one link from one address → 429 (Sample limit), the first 30 answered", burst.slice(0, 29).every((s) => s === 200) && burst.slice(-2).every((s) => s === 429), burst);

  // ------------------------------------------------------------------------------------------- no trust, no money
  ok("FO-7c pass: part 2a writes no payment, refund or trust entry of its own (the four payments are FO-7b's, recorded here by staff), and no card payment at all",
    sql(`select (select count(*) from money_payment where method = 'CARD') + (select count(*) from money_refund) + (select count(*) from money_trust_entry)`) === "0" && sql(`select count(*) from money_payment`) === "3");
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
