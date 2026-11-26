// FO-7c part 2b (R1.57; brief design/briefs/FO-7c.md's named cases, shaped in product/screens/FO-7c/shape-r1.57.md, Lead 4's
// decisions (2) and (3) on #3633): card payments booked from Stripe's events on the fake rail. DW3 (the webhook door for
// payment events), DW4 (a firm's event never pays another firm's invoice), DW6 (paid by the event, never the redirect), DW7
// (the poll), DW10 (never trust), the declined card's reason (R1.57 "with the reason"), money past what is due is the extra,
// and #3633 round 4's carried minor (a processor's code is a fixed word). A scratch database (every migration); the event
// path runs as the app does (PaymentAccounts.receive → CardPayments → InvoiceMoney.recordCard). No network, no key, US$0.
//   tsx studio/tests/check_fo7c_card_events.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { codeWord, fakeCardRail } from "../api/src/client-money/card/rail.ts";
import { CardPayments, PAYMENT_EVENTS, POLL_QUEUE, reasonOf } from "../api/src/client-money/card/payments.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), FIX = join(STUDIO, "tests", "fixtures", "fo7c-stripe");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7c2b_scratch_${process.pid}`, urlOf = (user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${DB}`;
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
const { CardPay } = await import("../api/src/client-money/card/pay.ts");
const { default: feature, firmOfAccount } = await import("../api/src/features/client-money-card.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { InvoiceMoney } = await import("../api/src/client-money/invoices/money.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { FakeClock } = await import("../ports/clock.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(), options: "-c TimeZone=UTC" }) });
const rail = fakeCardRail(), clock = { now: () => new Date() };
try {
  ok("setup: the fixtures say where they came from (not a recording) and name Stripe's types", ["payment_intent.succeeded", "payment_intent.payment_failed"].every((n) => /NOT recorded from Stripe/.test(fixture(n).source) && fixture(n).event.type === n));
  ok("setup: the feature registers CardPayments beside part 1's and part 2a's", feature.providers.some((p) => (p as { provide: unknown }).provide === CardPayments));
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7c-2b', now())`);
  const accountOf = async (firm: string) => { const { id } = await rail.createAccount({ firmId: firm, idempotencyKey: `fo7c2b-${firm}` }); rail.set(id, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false });
    sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${firm}', '${id}', 'ACTIVE', true, true, now())`); return id; };
  const acctA = await accountOf(A), acctB = await accountOf(B);
  const person = (firm: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client', 'Sample', 'fo7c2b.${Math.random().toString(36).slice(2)}@example.org', 'seed:FO-7c-2b', now()) returning id`);
  const PA = person(A), PB = person(B);
  const money = new InvoiceMoney(db, auditEvent, clock, null, undefined, async () => "ALL");
  const ctxOf = (firm: string, actor: string) => ({ firmId: firm, staffId: staff(actor, firm), keys: [], authTime: Date.now() / 1000 }) as never;
  const invoice = async (firm: string, party: string, actor: string, unit = 100000) => {
    const id = sql(`insert into money_invoice (firm_id, person_id, currency, created_by, updated_at) values ('${firm}', '${party}', 'CAD', 'seed:FO-7c-2b', now()) returning id`);
    sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${firm}', '${id}', 1, 'FEE', 'Professional fee (Sample)', 1, ${unit}, ${unit}, 0, 0, 'CAD')`);
    await withFirm(firm, () => money.issue(ctxOf(firm, actor), id, {}));
    return id;
  };
  const accounts = new PaymentAccounts(db, { rail, audit: auditEvent, clock, appUrl: "https://app.example.test", firmOfAccount: firmOfAccount(db) });
  const cards = new CardPayments(db, { rail, audit: auditEvent, clock, recorder: money });
  accounts.routePayments(cards);
  const pay = new CardPay(db, { rail, audit: auditEvent, clock, appUrl: "https://app.example.test", scopeOf: async () => "ALL" });
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

  // ---------------------------------------------------------------------------------------------- DW6: paid by the event
  const I1 = await invoice(A, PA, "user-R"), cs1 = await page(acctA, A, I1, 100000), pi1 = intentOf(cs1);
  rail.succeed(acctA, cs1, new Date());
  ok("FO-7c DW6 fail: the client back from Stripe with no event: the invoice stays unpaid (nothing booked by the redirect)", cardPays(I1) === "0:" && (await due(A, I1)) === 100000);
  const r1 = await hook("payment_intent.succeeded", "evt_fo7c2b_paid1", acctA, pi1);
  const payId = sql(`select id from money_payment where firm_id = '${A}' and stripe_payment_intent_id = '${pi1}'`);
  ok("FO-7c DW6 pass: the event books one card payment of CAD 1,000.00 into OPERATING, with its receipt; the invoice is paid",
    r1.received === true && cardPays(I1) === "1:CARD/OPERATING/100000" && sql(`select count(*) from money_receipt where payment_id = '${payId}'`) === "1" && (await due(A, I1)) === 0, { r1, pays: cardPays(I1) });
  ok("FO-7c DW6 pass: payment.succeeded once (method CARD, the intent as its external id) and invoice.paid once",
    events("payment.succeeded", payId) === "1" && sql(`select payload->>'method' || '/' || (payload->>'externalId') from module_event where type = 'payment.succeeded' and subject_id = '${payId}'`) === `CARD/${pi1}` && events("invoice.paid", I1) === "1");
  ok("FO-7c DW6 pass: one audit line by system:stripe-connect, the receipt's figures stored (applied 1,000.00, no extra)",
    sql(`select actor || '/' || (detail->>'appliedMinor') || '/' || (detail->>'extraMinor') from audit_event where action = 'payment.recorded' and entity_key = '${payId}'`) === "system:stripe-connect/100000/0");
  await hook("payment_intent.succeeded", "evt_fo7c2b_paid1", acctA, pi1);
  ok("FO-7c DW6 fail: the same event again is stored once and books nothing more", cardPays(I1) === "1:CARD/OPERATING/100000" && sql(`select count(*) from webhook_receipt where event_id = 'evt_fo7c2b_paid1'`) === "1" && events("payment.succeeded", payId) === "1");
  await hook("payment_intent.succeeded", "evt_fo7c2b_paid1_again", acctA, pi1);
  ok("FO-7c DW6 fail: the same intent in a second event (a new event id) is still one payment", cardPays(I1) === "1:CARD/OPERATING/100000");

  // ---------------------------------------------------------------------------------------------- DW3: the door
  const before3 = sql(`select count(*) from webhook_receipt`);
  let unsigned = 0; try { await hook("payment_intent.succeeded", "evt_fo7c2b_unsigned", acctA, pi1, false); } catch (e) { unsigned = (e as { getStatus?: () => number }).getStatus?.() ?? 0; }
  ok("FO-7c DW3 fail: a payment event with a wrong signature → 400 and nothing stored", unsigned === 400 && sql(`select count(*) from webhook_receipt`) === before3, unsigned);
  ok("FO-7c DW3 pass: both payment event types are routed (and no others)", PAYMENT_EVENTS.has("payment_intent.succeeded") && PAYMENT_EVENTS.has("payment_intent.payment_failed") && !PAYMENT_EVENTS.has("charge.succeeded"));
  const unk = await hook("payment_intent.succeeded", "evt_fo7c2b_unknown_acct", "acct_1NotOurs00000", "pi_1Fake999999");
  ok("FO-7c DW3 pass: an event for an unknown account → 200 and nothing written", unk.received === true && sql(`select count(*) from webhook_receipt where event_id = 'evt_fo7c2b_unknown_acct'`) === "0");

  // ---------------------------------------------------------------------------------------------- DW4: walls
  const IB = await invoice(B, PB, "user-S");
  const csW = await page(acctA, A, IB, 100000, B); rail.succeed(acctA, csW, new Date());   // firm A's account, metadata naming firm B and B's invoice
  await hook("payment_intent.succeeded", "evt_fo7c2b_wall1", acctA, intentOf(csW));
  const csW2 = await page(acctA, A, IB, 100000); rail.succeed(acctA, csW2, new Date());    // firm A's metadata, firm B's invoice id
  await hook("payment_intent.succeeded", "evt_fo7c2b_wall2", acctA, intentOf(csW2));
  ok("FO-7c DW4 fail: firm A's event naming firm B (or firm B's invoice) pays nothing on firm B's invoice", cardPays(IB, B) === "0:" && sql(`select count(*) from money_payment where stripe_payment_intent_id in ('${intentOf(csW)}', '${intentOf(csW2)}')`) === "0" && (await due(B, IB)) === 100000);
  const csB = await page(acctB, B, IB, 100000); rail.succeed(acctB, csB, new Date());
  await hook("payment_intent.succeeded", "evt_fo7c2b_b", acctB, intentOf(csB));
  ok("FO-7c DW4 pass: firm B's own event on its own account pays firm B's invoice", cardPays(IB, B) === "1:CARD/OPERATING/100000");

  // ---------------------------------------------------------------------------------------------- the declined card
  const I2 = await invoice(A, PA, "user-R"), link2 = await withFirm(A, () => pay.makeLink(ctxOf(A, "user-R"), I2)), token2 = link2.url.split("/money/pay/")[1]!;
  const cs2 = await page(acctA, A, I2, 100000); rail.fail(acctA, cs2, "generic_decline", "Your card was declined.");
  await hook("payment_intent.payment_failed", "evt_fo7c2b_declined", acctA, intentOf(cs2));
  ok("FO-7c R1.57 fail: a declined card leaves the invoice unpaid: no payment, the amount due unchanged", sql(`select count(*) from money_payment where invoice_id = '${I2}'`) === "0" && (await due(A, I2)) === 100000);
  ok("FO-7c R1.57 pass: the reason is kept: one audit line on the invoice with Stripe's message and its decline code",
    sql(`select count(*) || '/' || max(detail->>'reason') || '/' || max(detail->>'code') from audit_event where action = 'payment.card_failed' and entity_key = '${I2}'`) === "1/Your card was declined./generic_decline");
  ok("FO-7c R1.57 pass: payment.failed once, with the code and no text", events("payment.failed", I2) === "1" && sql(`select payload->>'code' || '/' || (payload ? 'reason') from module_event where type = 'payment.failed' and subject_id = '${I2}'`) === "generic_decline/false");
  const read2 = await pay.read(token2);
  ok("FO-7c R1.57 pass: the client's pay answer carries the reason", read2.lastCardFailure?.reason === "Your card was declined.", read2.lastCardFailure);
  const link2b = await withFirm(A, () => pay.makeLink(ctxOf(A, "user-R"), I2)), read2b = await pay.read(link2b.url.split("/money/pay/")[1]!);
  ok("FO-7c R1.57 fail: a decline from before the current link was made is not shown on the new link", read2b.lastCardFailure === null, read2b.lastCardFailure);
  await hook("payment_intent.payment_failed", "evt_fo7c2b_declined", acctA, intentOf(cs2));
  ok("FO-7c R1.57 fail: the same decline event again writes no second line", sql(`select count(*) from audit_event where action = 'payment.card_failed' and entity_key = '${I2}'`) === "1");

  // ---------------------------------------------------------------------------------------------- the extra
  const I3 = await invoice(A, PA, "user-R"), cs3 = await page(acctA, A, I3, 100000);
  await withFirm(A, () => money.record(ctxOf(A, "user-R"), I3, { method: "E_TRANSFER", amountMinor: 40000, idempotencyKey: "fo7c2b-offline-part" }));   // paid in part offline while the page was open
  rail.succeed(acctA, cs3, new Date()); await hook("payment_intent.succeeded", "evt_fo7c2b_extra", acctA, intentOf(cs3));
  const pay3 = sql(`select id from money_payment where stripe_payment_intent_id = '${intentOf(cs3)}'`);
  ok("FO-7c extra pass: card money past what is due is booked whole; CAD 400.00 of it is the extra, waiting for Refund or Keep as credit (#3633 accepted residual)",
    sql(`select (detail->>'appliedMinor') || '/' || (detail->>'extraMinor') from audit_event where action = 'payment.recorded' and entity_key = '${pay3}'`) === "60000/40000" && (await due(A, I3)) === 0);
  ok("FO-7c extra fail: never refused, never into trust", cardPays(I3) === "1:CARD/OPERATING/100000");

  // ---------------------------------------------------------------------------------------------- DW7: the poll
  const I4 = await invoice(A, PA, "user-R"), cs4 = await page(acctA, A, I4, 100000); rail.succeed(acctA, cs4, new Date());   // the webhook never came
  const p1 = await cards.poll(), p2 = await cards.poll();
  ok("FO-7c DW7 pass: a succeeded intent whose event was missed is booked once by the poll", p1.booked === 1 && cardPays(I4) === "1:CARD/OPERATING/100000", p1);
  ok("FO-7c DW7 fail: the poll run twice is still one payment", p2.booked === 0 && cardPays(I4) === "1:CARD/OPERATING/100000", p2);
  await hook("payment_intent.succeeded", "evt_fo7c2b_late", acctA, intentOf(cs4));
  ok("FO-7c DW7 fail: the webhook arriving after the poll books no second payment", cardPays(I4) === "1:CARD/OPERATING/100000");
  const jc = new FakeClock(new Date()), jobs = fakeJobs(jc); await cards.register(jobs);
  const I5 = await invoice(A, PA, "user-R"), cs5 = await page(acctA, A, I5, 100000); rail.succeed(acctA, cs5, new Date());
  await jc.advance(61 * 60_000);
  ok("FO-7c DW7 pass: the poll runs by itself on the job runner within the hour (Sample) and books the missed payment", jobs.jobs.some((j) => j.name === POLL_QUEUE && j.status === "done") && cardPays(I5) === "1:CARD/OPERATING/100000", jobs.jobs.map((j) => `${j.name}:${j.status}`));

  // ---------------------------------------------------------------------------------------------- DW10, minors
  ok("FO-7c DW10 pass: no card money anywhere in trust (no trust entry for a card payment, none received into TRUST)",
    sql(`select count(*) from money_payment where method = 'CARD' and received_into = 'TRUST'`) === "0" && sql(`select count(*) from money_trust_entry e join money_payment p on p.id = e.payment_id where p.method = 'CARD'`) === "0");
  ok("FO-7c DW10 pass: no secret-looking value in any audit line or event of the run", sql(`select count(*) from audit_event where detail::text ~ '(sk|rk)_(test|live)_|whsec_'`) === "0" && sql(`select count(*) from module_event where payload::text ~ '(sk|rk)_(test|live)_|whsec_'`) === "0");
  ok("FO-7c #3633 round 4 minor pass: a processor's code is kept only as a fixed word, else \"other\"", codeWord("card_declined") === "card_declined" && codeWord("Your card\nwas declined") === "other" && codeWord("x".repeat(41)) === "other" && codeWord(undefined) === "other");
  ok("FO-7c reason (pure): one line, at most 200 characters, a plain default", reasonOf({ lastError: { code: null, message: "Your card\n  was declined." } }) === "Your card was declined." && reasonOf({ lastError: null }) === "The card payment did not go through." && reasonOf({ lastError: { code: null, message: "x".repeat(500) } }).length === 200);
} catch (e) { fail++; console.log(`FAIL  the check stopped: ${String((e as Error).message).replace(/\s+/g, " ").slice(0, 400)} | ${(e as Error).stack?.split("\n").filter((l) => l.includes("/studio/")).slice(0, 3).join(" | ")}`); }
finally { await db.$disconnect(); execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
