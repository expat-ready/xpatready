// FO-7b part 1c (written first, before the code; the row and brief are Lead B's, asked on the draft PR): refunds of a
// payment recorded by hand (AG-6-23: a reason, never more than the payment less its refunds, the refund key
// agent/refund:create, separate from recording payments, BR-11) and a person's choice on a payment's extra (AG-6-21 rules
// 3, 5; FO-7b amendment 1: "Refund · Keep as credit"; Keep writes FO-7ts's credit ledger, KEPT). Each rule a pass and a
// fail, through the routes, read back from money_refund and money_credit_entry. Cases marked "pending Lead B" follow
// AG-6-23 as written until the row says otherwise. Legal and tax readings: Unconfirmed: no counsel / no accountant.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and the client-money feature, with the
// local sign-in stand-in; the API connects as xr_app. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7b_refunds.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { FakeClock } from "../ports/clock.ts";
import { MONEY_EVENT, fakeClientMoney, invoiceStatus, type ClientMoneyPort, type InvoiceFacts } from "../ports/client-money.ts";
import { fakeMail } from "../ports/mail.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { documentRenderPortContract } from "../ports/contracts/document-render-port.contract.ts";
import { clientMoneyPortContract } from "../ports/contracts/client-money-port.contract.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7c_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

// --------------------------------------------------------------------------------------- the rule alone (no database)
/** The planted wrong implementations the cases must catch: half up through a float, and tax on the subtotal. */
const halfUp = (amount: number, ppm: number) => Math.round(amount * ppm / 1_000_000);
ok("FO-7b rule: JavaScript's Math.round(6.5) is 7 (half up), the reason taxForLine never uses it", Math.round(6.5) === 7 && halfUp(50, 130000) === 7);
ok("FO-7b rule pass: taxForLine is whole-number only: a float amount or rate, a negative, or a rate past 1,000,000 throws",
  [() => taxForLine(0.5, 130000), () => taxForLine(50, 0.13), () => taxForLine(-1, 130000), () => taxForLine(50, -1), () => taxForLine(50, 1_000_001), () => taxForLine(Number.MAX_SAFE_INTEGER + 1, 1)].every(throws)
  && taxForLine(0, 130000) === 0 && taxForLine(12345, 0) === 0 && taxForLine(100, 1_000_000) === 100);

// --------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { InvoiceDrafts } = await import("../api/src/client-money/invoices/drafts.ts");
const { InvoiceDraftsController, InvoiceMoneyController } = await import("../api/src/client-money/invoices/routes.ts");
const { MoneyDocuments, documentText, invoiceData } = await import("../api/src/client-money/invoices/documents.ts");
const { ClientMoney } = await import("../api/src/client-money/port.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const feature = (await import("../api/src/features/client-money-invoices.ts")).default;
const refundsFeature = (await import("../api/src/features/client-money-refunds.ts")).default;
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7b-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
const mail = fakeMail();
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...feature.providers, ...refundsFeature.providers];
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers, ...refundsFeature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the invoice controller and its service", feature.controllers.length === 2 && feature.controllers[0] === InvoiceDraftsController && feature.controllers[1] === InvoiceMoneyController && (feature.providers[0] as { provide: unknown }).provide === InvoiceDrafts);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7b.${n}@example.org', 'seed:FO-7b-1a', now()) returning id`);
  const PA = person(A, "a"), PB = person(B, "b");
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");
  const staffA = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);

  const noSettings = await call(tA, "POST", "/front-office/money/invoices", { personId: PA });
  ok("FO-7b setup fail: before the firm's payment settings exist, a draft is refused in words (409 PAYMENTS_NOT_SET_UP), nothing written",
    noSettings.status === 409 && noSettings.body?.code === "PAYMENTS_NOT_SET_UP" && sql(`select count(*) from money_invoice`) === "0", noSettings.body);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7b-1a', now())`);

  const draft = async (body: Record<string, unknown> = { personId: PA, currency: "CAD" }, t = tA) => call(t, "POST", "/front-office/money/invoices", body);
  const line = (id: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `/front-office/money/invoices/${id}/lines`, body);
  const stored = (id: string) => sql(`select string_agg(position || ':' || kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor || ':' || currency, ',' order by position) from money_invoice_line where invoice_id = '${id}'`);
  const fee = (unitMinor: number, ratePpm: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm, ...extra });
  /** One FEE line on a fresh CAD draft: the stored tax read back from money_invoice_line. */
  const taxOf = async (unitMinor: number, ratePpm: number) => { const d = await draft(); const r = await line(d.body.id, fee(unitMinor, ratePpm)); return { r, tax: Number(sql(`select tax_minor from money_invoice_line where invoice_id = '${d.body.id}'`)) }; };

  // ======================================================================================== FO-7b part 1b
  const M = "/front-office/money/invoices", post = (path: string, body: unknown = {}, t = tA) => call(t, "POST", `${M}/${path}`, body);
  const auditN = (action: string, key: string) => sql(`select count(*) from audit_event where action = '${action}' and (entity_key = '${key}' or detail->>'invoiceId' = '${key}')`);
  const events = (type: string, subject: string) => sql(`select count(*) from module_event where type = '${type}' and subject_id = '${subject}'`);
  const today = new Date().toISOString().slice(0, 10), plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  /** An issued invoice of one FEE line for a client of firm A. */
  const issued = async (unitMinor: number, ratePpm = 130000, body: Record<string, unknown> = {}, personId = PA) => { const d = await draft({ personId, currency: "CAD" }); await line(d.body.id, fee(unitMinor, ratePpm)); return (await post(`${d.body.id}/issue`, body)).body.invoice; };
  let key = 0; const pay = (id: string, amountMinor: number, extra: Record<string, unknown> = {}, t = tA) => post(`${id}/payments`, { method: "E_TRANSFER", amountMinor, idempotencyKey: `fo7b-1b-${++key}`, ...extra }, t);
  const pdfText = async (path: string) => { const r = await fetch(`${base}/api${M}/${path}`, { headers: { authorization: `Bearer ${tA}` } }); const b = Buffer.from(await r.arrayBuffer()).toString("latin1");
    return { status: r.status, type: r.headers.get("content-type"), pdf: b.startsWith("%PDF-1.4") && b.trimEnd().endsWith("%%EOF"), text: [...b.matchAll(/^\((.*)\) Tj T\*$/gm)].map((m) => m[1].replace(/\\([\\()])/g, "$1")).join("\n") }; };

  // ======================================================================================== FO-7b part 1c
  ok("setup: the refunds feature registers its controller and service", refundsFeature.controllers.length === 1 && refundsFeature.providers.length === 1);
  sql(`update money_payment_settings set operating_details = 'Payee: Sample Firm (Sample)' where firm_id = '${A}'`);
  const P = "/front-office/money/payments";
  const refund = (payment: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `${P}/${payment}/refunds`, body);
  const choose = (payment: string, body: Record<string, unknown>, t = tA) => call(t, "POST", `${P}/${payment}/extra`, body);
  let rk = 0; const rkey = () => `fo7c-refund-${++rk}`;
  const refunds = (payment: string) => sql(`select coalesce(string_agg(amount_minor || ':' || route || ':' || reason, ',' order by refund_ordinal), '') from money_refund where payment_id = '${payment}'`);
  const kept = (payment: string) => sql(`select coalesce(sum(amount_minor), 0) from money_credit_entry where payment_id = '${payment}' and kind = 'KEPT'`);
  // user-O (Case Officer): agent/invoice:create, :list, :show; neither agent/payment:record nor agent/refund:create.

  // ------------------------------------------------------------------- RF: refund of a payment recorded by hand
  const invF = await issued(10000, 0), pF = await pay(invF.id, 10000);
  const rNoWhy = await refund(pF.body.id, { amountMinor: 3000, method: "E_TRANSFER", idempotencyKey: rkey() });
  const rOver = await refund(pF.body.id, { amountMinor: 10001, method: "E_TRANSFER", reason: "Too much (Sample)", idempotencyKey: rkey() });
  const rKey = await refund(pF.body.id, { amountMinor: 3000, method: "E_TRANSFER", reason: "No key (Sample)", idempotencyKey: rkey() }, tO);
  const rB = await refund(pF.body.id, { amountMinor: 3000, method: "E_TRANSFER", reason: "Other firm (Sample)", idempotencyKey: rkey() }, tB), rBad = await refund("not-a-uuid", { amountMinor: 1, method: "CASH", reason: "x", idempotencyKey: rkey() });
  ok("FO-7c RF fail (AG-6-23 r4, r9): no reason → 422 at reason; more than the payment → 409 OVER_REFUND with what is left; without agent/refund:create → 403; firm B → 404; a malformed id → 404; nothing refunded",
    rNoWhy.status === 422 && rNoWhy.body.fields?.reason && rOver.status === 409 && rOver.body.code === "OVER_REFUND" && rOver.body.leftMinor === 10000 && rKey.status === 403 && rB.status === 404 && rBad.status === 404 && refunds(pF.body.id) === "", [rNoWhy.body, rOver.body, rKey.status, rB.status, rBad.status]);
  const k1 = rkey(), r1 = await refund(pF.body.id, { amountMinor: 3000, method: "E_TRANSFER", reference: "88213", reason: "Withdrawn (Sample)", idempotencyKey: k1 });
  ok("FO-7c RF pass (AG-6-23 r2, BR-9): a part refund of 30.00, offline by e-Transfer with a reason → 201, one OFFLINE refund row, 70.00 left to refund, one audit line (method and reference in it), payment.refunded written last; the payment row is not edited",
    r1.status === 201 && r1.body.route === "OFFLINE" && r1.body.leftToRefundMinor === 7000 && refunds(pF.body.id) === "3000:OFFLINE:Withdrawn (Sample)"
    && sql(`select count(*) || ':' || min(detail->>'method_after') || ':' || min(detail->>'reference_after') from audit_event where action = 'payment.refunded' and detail->>'paymentId' = '${pF.body.id}'`) === "1:E_TRANSFER:88213"
    && sql(`select count(*) from module_event where type = 'payment.refunded' and subject_id = '${pF.body.id}'`) === "1" && sql(`select amount_minor from money_payment where id = '${pF.body.id}'`) === "10000", r1.body);
  ok("FO-7c RF pass (brief: the derived status follows invoiceStatus): after the part refund the invoice reads Part paid with 30.00 due again (facts.ts subtracts refunds)",
    r1.body.invoice?.statusWord === "Part paid" && r1.body.invoice.dueMinor === 3000 && r1.body.invoice.paidMinor === 7000, r1.body.invoice);
  const again = await refund(pF.body.id, { amountMinor: 3000, method: "E_TRANSFER", reason: "Withdrawn (Sample)", idempotencyKey: k1 }), other = await refund(pF.body.id, { amountMinor: 4000, method: "E_TRANSFER", reason: "Withdrawn (Sample)", idempotencyKey: k1 });
  ok("FO-7c RF pass and fail (idempotent): the same key again → 200, the same refund (one row); the same key with other data → 409 KEY_USED",
    again.status === 200 && again.body.id === r1.body.id && again.body.replayed === true && other.status === 409 && other.body.code === "KEY_USED" && refunds(pF.body.id).split(",").length === 1, [again.body, other.body]);
  const race = await Promise.all([refund(pF.body.id, { amountMinor: 7000, method: "CASH", reason: "Race (Sample)", idempotencyKey: rkey() }), refund(pF.body.id, { amountMinor: 7000, method: "CASH", reason: "Race (Sample)", idempotencyKey: rkey() })]);
  ok("FO-7c RF fail (two at once): two refunds of 70.00 on the 70.00 left → one 201, the other 409 OVER_REFUND (it sees the first); refunds never exceed the payment",
    race.map((x) => x.status).sort().join() === "201,409" && race.find((x) => x.status === 409)?.body.code === "OVER_REFUND" && sql(`select sum(amount_minor) from money_refund where payment_id = '${pF.body.id}'`) === "10000", race.map((x) => [x.status, x.body.code]));
  ok("FO-7c RF pass: fully refunded, the invoice reads Refunded (invoiceStatus)", (await call(tA, "GET", `${M}/${invF.id}`)).body.statusWord === "Refunded");

  // ------------------------------------------------------------------------ RT: money received into trust
  sql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:FO-7b-1c' where firm_id = '${A}'`);
  const invT = await issued(10000, 0), pT = await pay(invT.id, 13000, { receivedInto: "TRUST" });
  const rT = await refund(pT.body.id, { amountMinor: 1000, method: "E_TRANSFER", reason: "Trust (Sample)", idempotencyKey: rkey() }), cT = await choose(pT.body.id, { choice: "KEEP_AS_CREDIT" });
  ok("FO-7c RT fail (P-603): refunding a payment received into trust → 409 \"Money received into trust is refunded from the trust ledger\"; no choice on its extra (409); nothing refunded or kept",
    rT.status === 409 && rT.body.code === "TRUST_REFUND" && /^Money received into trust is refunded from the trust ledger/.test(rT.body.detail) && cT.status === 409 && refunds(pT.body.id) === "" && kept(pT.body.id) === "0", [rT.body, cT.body]);

  // ---------------------------------------------- KC: "Keep as credit" (with the trust answer YES: amendment 1's "neither")
  const invK = await issued(10000, 0), pK = await pay(invK.id, 13000), trustBefore = sql(`select count(*) from money_trust_entry`);
  ok("FO-7c KC pass (amendment 1, \"neither\"): with the trust answer YES, 30.00 extra into operating still offers Refund · Keep as credit and makes no trust entry",
    pK.status === 201 && pK.body.extra?.waitingMinor === 3000 && pK.body.extra.choices.join() === "REFUND,KEEP_AS_CREDIT" && sql(`select count(*) from money_trust_entry where payment_id = '${pK.body.id}'`) === "0", pK.body);
  const kKey = await choose(pK.body.id, { choice: "KEEP_AS_CREDIT" }, tO), kB = await choose(pK.body.id, { choice: "KEEP_AS_CREDIT" }, tB), kNone = await choose(pF.body.id, { choice: "KEEP_AS_CREDIT" }), kAmt = await choose(pK.body.id, { choice: "KEEP_AS_CREDIT", amountMinor: 1 });
  ok("FO-7c KC fail: without agent/payment:record → 403; firm B → 404; a payment with no extra → 409 NOTHING_WAITING; an amount sent → 422 (always exactly the waiting extra); nothing kept",
    kKey.status === 403 && kB.status === 404 && kNone.status === 409 && kNone.body.code === "NOTHING_WAITING" && kAmt.status === 422 && kept(pK.body.id) === "0", [kKey.status, kB.status, kNone.body, kAmt.status]);
  const kc = await choose(pK.body.id, { choice: "KEEP_AS_CREDIT" });
  ok("FO-7c KC pass (AG-6-21 r3, r5): Keep as credit → one KEPT entry equal to the waiting 30.00, on the invoice's party and case, nothing waiting after, one audit line; no trust entry",
    kc.status === 201 && kc.body.choice === "KEEP_AS_CREDIT" && kc.body.amountMinor === 3000 && kc.body.waitingMinor === 0 && kept(pK.body.id) === "3000" && sql(`select count(*) from money_credit_entry where payment_id = '${pK.body.id}'`) === "1"
    && sql(`select person_id from money_credit_entry where payment_id = '${pK.body.id}'`) === PA && sql(`select count(*) from money_trust_entry`) === trustBefore
    && sql(`select count(*) from audit_event where action = 'payment.extra_kept' and detail->>'paymentId' = '${pK.body.id}'`) === "1", kc.body);
  const kTwice = await choose(pK.body.id, { choice: "KEEP_AS_CREDIT" }), kThen = await choose(pK.body.id, { choice: "REFUND", method: "CASH", reason: "Second choice (Sample)", idempotencyKey: rkey() });
  ok("FO-7c KC fail (chosen once): a second choice, Keep or Refund → 409 NOTHING_WAITING; still one KEPT entry and no refund", kTwice.status === 409 && kThen.status === 409 && kept(pK.body.id) === "3000" && refunds(pK.body.id) === "", [kTwice.body, kThen.body]);

  // ------------------------------------------------------------- RX: "Refund" on a payment's extra
  const invX = await issued(10000, 0), pX = await pay(invX.id, 12500);
  const xNoWhy = await choose(pX.body.id, { choice: "REFUND", method: "E_TRANSFER", idempotencyKey: rkey() });
  // BR-11 (AG-6-23 r9): taking money and returning it are separate keys. The Owner's role is given agent/payment:record
  // without agent/refund:create for one call (the catalogue row put back after), so only the service's own check stands.
  const roleR = sql(`select g.role from platform_role_grant g join platform_staff s on s.id = g.staff_id where s.actor_id = 'user-R' and g.firm_id = '${A}' and g.ended_at is null limit 1`);
  sql(`delete from platform_role_permission where role = '${roleR}' and permission_key = 'agent/refund:create'`);
  const xKeyNoRefund = await choose(pX.body.id, { choice: "REFUND", method: "E_TRANSFER", reason: "Extra (Sample)", idempotencyKey: rkey() }), xKeepStill = sql(`select count(*) from platform_role_permission where role = '${roleR}' and permission_key = 'agent/payment:record'`);
  sql(`insert into platform_role_permission (role, permission_key) values ('${roleR}', 'agent/refund:create')`);
  ok("FO-7c RX fail (BR-11): refunding the extra with no reason → 422; a staff member holding agent/payment:record but not agent/refund:create → 403 MISSING_PERMISSION from the service; nothing refunded",
    xNoWhy.status === 422 && xKeyNoRefund.status === 403 && xKeyNoRefund.body.code === "MISSING_PERMISSION" && xKeepStill === "1" && refunds(pX.body.id) === "", [xNoWhy.body, xKeyNoRefund.status, xKeyNoRefund.body]);
  const xk = rkey(), rx = await choose(pX.body.id, { choice: "REFUND", method: "E_TRANSFER", reason: "Paid 25.00 too much (Sample)", idempotencyKey: xk });
  ok("FO-7c RX pass: Refund on the extra → one OFFLINE refund of exactly the waiting 25.00, nothing waiting, the invoice stays Paid with nothing due, payment.refunded (from the extra)",
    rx.status === 201 && rx.body.choice === "REFUND" && rx.body.amountMinor === 2500 && rx.body.waitingMinor === 0 && refunds(pX.body.id) === "2500:OFFLINE:Paid 25.00 too much (Sample)" && rx.body.invoice?.statusWord === "Paid" && rx.body.invoice.dueMinor === 0
    && sql(`select payload->>'fromExtra' from module_event where type = 'payment.refunded' and subject_id = '${pX.body.id}'`) === "true", rx.body);
  const rxAgain = await choose(pX.body.id, { choice: "REFUND", method: "E_TRANSFER", reason: "Paid 25.00 too much (Sample)", idempotencyKey: xk });
  ok("FO-7c RX pass (idempotent): the same Refund again with its key answers the same refund; still one refund row", rxAgain.status === 201 && rxAgain.body.refundId === rx.body.refundId && refunds(pX.body.id).split(",").length === 1, rxAgain.body);
  const pM = await pay(invK.id, 1, { idempotencyKey: "fo7c-mixed-1" });   // a later 0.01 on the paid invoice: all extra, waiting
  const both = await Promise.all([choose(pM.body.id, { choice: "KEEP_AS_CREDIT" }), choose(pM.body.id, { choice: "REFUND", method: "CASH", reason: "Race (Sample)", idempotencyKey: rkey() })]);
  ok("FO-7c KC/RX fail (two choices at once on 0.01 waiting): one wins, the other 409; never both kept and refunded",
    both.map((x) => x.status).sort().join() === "201,409" && Number(kept(pM.body.id)) + Number(sql(`select coalesce(sum(amount_minor), 0) from money_refund where payment_id = '${pM.body.id}'`)) === 1, both.map((x) => [x.status, x.body.code]));

  ok("FO-7c audit pass: one line per change (every refund and every Keep), each by a typed staff actor",
    sql(`select count(*) from audit_event where action in ('payment.refunded', 'payment.extra_kept') and actor not like 'staff:%'`) === "0" && sql(`select count(*) from audit_event where action = 'payment.refunded'`) === sql(`select count(*) from money_refund`)
    && sql(`select count(*) from audit_event where action = 'payment.extra_kept'`) === sql(`select count(*) from money_credit_entry where kind = 'KEPT'`));
} catch (e) {
  ok("FO-7b: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
