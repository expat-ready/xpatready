// FO-7c part 3 (brief design/briefs/FO-7c.md part 3 and DW9; AG-6-23 rules 2, 4, 5): card refunds through Stripe on the
// fake rail. DW9 (no reason → refused; more than refundable → refused; Stripe refuses → 409 "Record an offline refund
// instead"; the refund row only after Stripe's event; the route needs agent/refund:create, not agent/payment:record), the
// "Refund requested" state, a request held against what is left until Stripe settles it, a failed refund released, the
// walls, and DW10 (never trust). A scratch database (every migration); the event path runs as the app does
// (PaymentAccounts.receive → CardPayments → CardRefunds). No network, no key, US$0.
//   tsx studio/tests/check_fo7c_card_refunds.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeCardRail } from "../api/src/client-money/card/rail.ts";
import { CardPayments } from "../api/src/client-money/card/payments.ts";
import { CardRefunds, OFFLINE_INSTEAD, REFUND_EVENTS } from "../api/src/client-money/card/refunds.ts";
import { CardRefundController } from "../api/src/client-money/card/routes.ts";
import { PLATFORM_ACCESS } from "../api/src/platform/identity/keys.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), FIX = join(STUDIO, "tests", "fixtures", "fo7c-stripe");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7c3_scratch_${process.pid}`, urlOf = (user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${DB}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const fixture = (name: string) => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as { source: string; event: Record<string, unknown> };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf();
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "APP_DATABASE_URL", "PLATFORM_STRIPE_SECRET_KEY", "PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET"]) delete process.env[k];

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PaymentAccounts } = await import("../api/src/client-money/card/account.ts");
const { Refunds } = await import("../api/src/client-money/invoices/refunds.ts");
const { default: feature, firmOfAccount } = await import("../api/src/features/client-money-card.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { InvoiceMoney } = await import("../api/src/client-money/invoices/money.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(), options: "-c TimeZone=UTC" }) });
const rail = fakeCardRail(), clock = { now: () => new Date() };
try {
  ok("setup: the fixtures say where they came from (not a recording) and name Stripe's types", ["payment_intent.succeeded"].every((n) => /NOT recorded from Stripe/.test(fixture(n).source) && fixture(n).event.type === n));
  ok("setup: the feature registers CardRefunds and its route beside parts 1, 2a and 2b", feature.providers.some((p) => (p as { provide: unknown }).provide === CardRefunds) && (feature.controllers as unknown[]).includes(CardRefundController));
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7c-3', now())`);
  const accountOf = async (firm: string) => { const { id } = await rail.createAccount({ firmId: firm, idempotencyKey: `fo7c3-${firm}` }); rail.set(id, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false });
    sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${firm}', '${id}', 'ACTIVE', true, true, now())`); return id; };
  const acctA = await accountOf(A), acctB = await accountOf(B);
  const person = (firm: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client', 'Sample', 'fo7c3.${Math.random().toString(36).slice(2)}@example.org', 'seed:FO-7c-3', now()) returning id`);
  const PA = person(A), PB = person(B);
  const money = new InvoiceMoney(db, auditEvent, clock, null, undefined, async () => "ALL");
  const ctxOf = (firm: string, actor: string) => ({ firmId: firm, staffId: staff(actor, firm), keys: [], authTime: Date.now() / 1000 }) as never;
  const invoice = async (firm: string, party: string, actor: string, unit = 100000) => {
    const id = sql(`insert into money_invoice (firm_id, person_id, currency, created_by, updated_at) values ('${firm}', '${party}', 'CAD', 'seed:FO-7c-3', now()) returning id`);
    sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${firm}', '${id}', 1, 'FEE', 'Professional fee (Sample)', 1, ${unit}, ${unit}, 0, 0, 'CAD')`);
    await withFirm(firm, () => money.issue(ctxOf(firm, actor), id, {}));
    return id;
  };
  const accounts = new PaymentAccounts(db, { rail, audit: auditEvent, clock, appUrl: "https://app.example.test", firmOfAccount: firmOfAccount(db) });
  const offline = new Refunds(db, auditEvent, clock, async () => "ALL");
  const refunds = new CardRefunds(db, { rail, audit: auditEvent, clock, refunds: offline, scopeOf: async () => "ALL" });
  const cards = new CardPayments(db, { rail, audit: auditEvent, clock, recorder: money, refunds });
  accounts.routePayments(cards);
  /** A hosted payment of the full amount on the firm's account, as part 2a's session makes it. */
  const page = async (account: string, firm: string, invoiceId: string, amountMinor: number, metaFirm = firm) =>
    (await rail.createHostedPayment({ account, amountMinor, currency: "CAD", description: "Invoice (Sample)", metadata: { firm_id: metaFirm, invoice_id: invoiceId }, successUrl: "https://app.example.test/done", cancelUrl: "https://app.example.test/", expiresAtSec: Math.floor(Date.now() / 1000) + 3600, idempotencyKey: `p-${invoiceId}-${Math.random()}` })).id;
  /** The connected-accounts webhook as Stripe sends it: the fixture's envelope, this event id, account and intent id, signed. */
  const hook = (name: string, id: string, account: string, intentId: string, sign = true) => {
    const f = fixture(name).event as { data: { object: Record<string, unknown> } }, body = JSON.stringify({ ...f, id, account, data: { object: { ...f.data.object, id: intentId } } });
    return accounts.receive(Buffer.from(body), sign ? rail.sign(body) : "t=1,v1=00");
  };
  /** The intent id of a hosted payment (as the fake made it: Stripe's shape, `pi_1Fake…`). */
  const intentOf = (cs: string) => `pi_1Fake${cs.split("_").pop()!.padStart(6, "0")}`;
  const cardPays = (inv: string, firm = A) => sql(`select count(*) || ':' || coalesce(string_agg(method || '/' || received_into || '/' || amount_minor, ','), '') from money_payment where firm_id = '${firm}' and invoice_id = '${inv}' and method = 'CARD'`);
  const events = (type: string, subject: string) => sql(`select count(*) from module_event where type = '${type}' and subject_id = '${subject}'`);
  const due = async (firm: string, inv: string) => (await withFirm(firm, () => db.$transaction((tx) => import("../api/src/client-money/invoices/facts.ts").then((m) => m.invoiceFacts(tx, firm, inv, new Date().toISOString().slice(0, 10))))))!.view.dueMinor;

  /** A refund event as Stripe sends it (refund.created / refund.updated), signed: only the envelope and the refund's id are read. */
  const refundHook = (type: string, id: string, account: string, refundId: string) => {
    const body = JSON.stringify({ id, object: "event", type, account, api_version: "2026-10-28.endive", created: Math.floor(Date.now() / 1000), data: { object: { id: refundId, object: "refund" } }, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null } });
    return accounts.receive(Buffer.from(body), rail.sign(body));
  };
  const status = async (f: () => Promise<unknown>) => { try { await f(); return { s: 200, code: "" }; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string; detail?: string } }; return { s: x.getStatus?.() ?? 500, code: x.getResponse?.().code ?? "", detail: x.getResponse?.().detail ?? String(e) }; } };
  const ask = (firm: string, actor: string, paymentId: string, body: unknown) => withFirm(firm, () => refunds.request(ctxOf(firm, actor), paymentId, body));
  const rows = (p: string) => sql(`select count(*) || ':' || coalesce(string_agg(route || '/' || amount_minor || '/' || coalesce(left(stripe_refund_id, 3), '-'), ',' order by created_at), '') from money_refund where payment_id = '${p}'`);
  const sentId = (p: string, key: string) => sql(`select detail->>'stripeRefundId' from audit_event where action = 'payment.card_refund_sent' and entity_key = '${p}' and detail->>'key' = '${key}'`);

  // A card payment of CAD 1,000.00, booked from Stripe's event (part 2b).
  const I1 = await invoice(A, PA, "user-R"), cs1 = await page(acctA, A, I1, 100000); rail.succeed(acctA, cs1, new Date());
  await hook("payment_intent.succeeded", "evt_fo7c3_paid", acctA, intentOf(cs1));
  const P1 = sql(`select id from money_payment where stripe_payment_intent_id = '${intentOf(cs1)}'`);
  ok("FO-7c part 3 setup: a card payment of CAD 1,000.00 booked from Stripe's event", /^[0-9a-f-]{36}$/.test(P1));

  // ---------------------------------------------------------------------------------------------- DW9
  const meta = Reflect.getMetadata(PLATFORM_ACCESS, CardRefundController.prototype.refund) as { keys?: string[] } | undefined;
  ok("FO-7c DW9 pass: the card refund route needs agent/refund:create (and only it: agent/payment:record alone is refused by PF-4's guard, 403)", JSON.stringify(meta?.keys) === JSON.stringify(["agent/refund:create"]), meta);
  const noReason = await status(() => ask(A, "user-R", P1, { amountMinor: 30000, idempotencyKey: "fo7c3-noreason" }));
  ok("FO-7c DW9 fail: no reason → refused with the field named, nothing asked of Stripe", noReason.s >= 400 && noReason.s < 500 && noReason.s !== 409 && !rail.calls().some((c) => c.name === "refund"), noReason);
  const over = await status(() => ask(A, "user-R", P1, { amountMinor: 100001, reason: "Client cancelled (Sample)", idempotencyKey: "fo7c3-over" }));
  ok("FO-7c DW9 fail: more than the payment → 409 OVER_REFUND with what is left, nothing asked of Stripe", over.s === 409 && over.code === "OVER_REFUND" && /CAD 1,000\.00/.test(over.detail ?? "") && !rail.calls().some((c) => c.name === "refund"), over);
  const a1 = await ask(A, "user-R", P1, { amountMinor: 30000, reason: "Part of the fee returned (Sample)", idempotencyKey: "fo7c3-part1" });
  ok("FO-7c DW9 pass: a part refund of CAD 300.00 is asked of Stripe on the payment's account and reads \"Refund requested\"; CAD 700.00 left", a1.state === "REQUESTED" && a1.stateWord === "Refund requested" && a1.leftToRefundMinor === 70000 && !!sentId(P1, "fo7c3-part1"), a1);
  ok("FO-7c DW9 fail: no refund row until Stripe confirms it", rows(P1) === "0:");
  const again = await ask(A, "user-R", P1, { amountMinor: 30000, reason: "Part of the fee returned (Sample)", idempotencyKey: "fo7c3-part1" });
  const keyUsed = await status(() => ask(A, "user-R", P1, { amountMinor: 20000, reason: "Part of the fee returned (Sample)", idempotencyKey: "fo7c3-part1" }));
  ok("FO-7c DW9 fail: the same key again is the one request (replayed, nothing more asked); another amount under it → 409 KEY_USED", again.replayed && rail.calls().filter((c) => c.name === "refund").length === 1 && keyUsed.code === "KEY_USED", { again, keyUsed });
  const held = await status(() => ask(A, "user-R", P1, { amountMinor: 80000, reason: "Rest returned (Sample)", idempotencyKey: "fo7c3-toomuch" }));
  ok("FO-7c held fail: while CAD 300.00 is asked and not settled, CAD 800.00 more is refused (only CAD 700.00 left)", held.s === 409 && held.code === "OVER_REFUND" && /CAD 700\.00/.test(held.detail ?? ""), held);

  const re1 = sentId(P1, "fo7c3-part1");
  await refundHook("refund.created", "evt_fo7c3_re1_pending", acctA, re1);
  ok("FO-7c DW9 fail: Stripe's event while the refund is still pending books nothing", rows(P1) === "0:");
  rail.settleRefund(acctA, re1, "succeeded"); await refundHook("refund.updated", "evt_fo7c3_re1_done", acctA, re1);
  const RF = sql(`select id from money_refund where payment_id = '${P1}'`);
  ok("FO-7c DW9 pass: Stripe confirms: one refund row, route CARD with Stripe's refund id, CAD 300.00", rows(P1) === "1:CARD/30000/re_", rows(P1));
  ok("FO-7c DW9 pass: payment.refunded once (route CARD) and one audit line by system:stripe-connect", sql(`select count(*) || '/' || max(payload->>'route') from module_event where type = 'payment.refunded' and subject_id = '${P1}'`) === "1/CARD" && sql(`select actor from audit_event where action = 'payment.refunded' and entity_key = '${RF}'`) === "system:stripe-connect");
  await refundHook("refund.updated", "evt_fo7c3_re1_done", acctA, re1); await refundHook("refund.updated", "evt_fo7c3_re1_done_again", acctA, re1);
  ok("FO-7c DW9 fail: the same event, or another event for the same refund, books nothing more", rows(P1) === "1:CARD/30000/re_");

  rail.refuseRefunds(true);
  const refused = await status(() => ask(A, "user-R", P1, { amountMinor: 10000, reason: "More returned (Sample)", idempotencyKey: "fo7c3-refused" }));
  rail.refuseRefunds(false);
  ok("FO-7c DW9 fail: Stripe refuses → 409 \"Record an offline refund instead\"", refused.s === 409 && refused.code === "CARD_REFUND_REFUSED" && refused.detail === OFFLINE_INSTEAD, refused);
  const a2 = await ask(A, "user-R", P1, { amountMinor: 70000, reason: "Rest returned (Sample)", idempotencyKey: "fo7c3-rest" });
  ok("FO-7c DW9 pass: the refused request held nothing back: the remaining CAD 700.00 can be asked", a2.state === "REQUESTED" && a2.leftToRefundMinor === 0, a2);
  const re2 = sentId(P1, "fo7c3-rest");
  rail.settleRefund(acctA, re2, "failed"); await refundHook("refund.updated", "evt_fo7c3_re2_failed", acctA, re2);
  ok("FO-7c failed pass: Stripe's failed refund books nothing and releases the request (one line; CAD 700.00 can be asked again)",
    rows(P1) === "1:CARD/30000/re_" && sql(`select count(*) from audit_event where action = 'payment.card_refund_failed' and entity_key = '${P1}'`) === "1" && (await ask(A, "user-R", P1, { amountMinor: 70000, reason: "Rest returned again (Sample)", idempotencyKey: "fo7c3-rest2" })).state === "REQUESTED");

  // ---------------------------------------------------------------------------------------------- not card, walls, trust
  const I2 = await invoice(A, PA, "user-R"), off = await withFirm(A, () => money.record(ctxOf(A, "user-R"), I2, { method: "E_TRANSFER", amountMinor: 100000, idempotencyKey: "fo7c3-offline-pay" }));
  const notCard = await status(() => ask(A, "user-R", off.id, { amountMinor: 1000, reason: "Returned (Sample)", idempotencyKey: "fo7c3-notcard" }));
  ok("FO-7c part 3 fail: a payment not made by card → 409 NOT_CARD (record an offline refund instead)", notCard.code === "NOT_CARD", notCard);
  const otherFirm = await status(() => ask(B, "user-S", P1, { amountMinor: 1000, reason: "Returned (Sample)", idempotencyKey: "fo7c3-walls" }));
  ok("FO-7c walls fail: firm B asking to refund firm A's card payment → 404", otherFirm.s === 404, otherFirm);
  const reW = (await rail.refund({ account: acctA, intentId: intentOf(cs1), amountMinor: 1000, idempotencyKey: "fo7c3-forged", metadata: { firm_id: B, payment_id: P1, refund_key: "fo7c3-part1" } })).id;
  rail.settleRefund(acctA, reW, "succeeded"); await refundHook("refund.updated", "evt_fo7c3_forged", acctA, reW);
  ok("FO-7c walls fail: a refund event whose metadata names another firm books nothing", rows(P1) === "1:CARD/30000/re_");
  ok("FO-7c DW10 pass: no card refund touches trust (no trust entry for a card payment's refund)", sql(`select count(*) from money_trust_entry e join money_payment p on p.id = e.payment_id where p.method = 'CARD'`) === "0");
  ok("FO-7c events pass: refund.created and refund.updated are routed (and only those)", REFUND_EVENTS.has("refund.created") && REFUND_EVENTS.has("refund.updated") && !REFUND_EVENTS.has("charge.refunded"));
} catch (e) { fail++; console.log(`FAIL  the check stopped: ${String((e as Error).message).replace(/\s+/g, " ").slice(0, 400)} | ${(e as Error).stack?.split("\n").filter((l) => l.includes("/studio/")).slice(0, 3).join(" | ")}`); }
finally { await db.$disconnect(); execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
