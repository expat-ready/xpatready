// FO-7q (R1.56; brief design/briefs/FO-7q.md): the money reads, paged on the server. Part 2 (BACKLOG FO-7q part 2): the
// refund actions on a payment, by invoices/refunds.ts's own rules (offered and withheld, each against the route). DW1 performance and the plan
// (10,000 invoices in each of two firms; the time is printed, not a gate: AG-6-30's 300 ms is an example), DW2 paging,
// DW3 the SQL status agrees with FO-7b's invoiceStatus on every word, DW4 allowedActions, DW5 trust off, DW6 currencies
// never summed, DW7 the firm walls, DW9 C5 through CS-MV1's PgMoneyVisibility (bound in the app; real cases and prospects). DW8 (the party money, ledger and To move reads) is not here:
// FO-7t and FO-7r are not on main (named in the PR). A pass and a fail each. A scratch database (every migration), a
// Nest app of PF-4's guard, PF-12's walls, FO-7b's and this row's features; the local sign-in stand-in. No network, no
// model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7q_reads.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fakeMail } from "../ports/mail.ts";
import { FakeClock } from "../ports/clock.ts";
import { allowedActions, paymentActions, type ActionFacts } from "../api/src/client-money/reads/actions.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7q_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// ------------------------------------------------------------------------------------- DW4: the actions table alone
const facts = (status: ActionFacts["status"], keys: string[], extra: Partial<ActionFacts> = {}): ActionFacts => ({ status, keys, startedByCaller: false, creditableMinor: 1000, ...extra });
const ALL = ["agent/invoice:create", "agent/invoice:edit", "agent/invoice:issue", "agent/invoice:void", "agent/invoice:show", "agent/payment:record"];
const eq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
ok("FO-7q DW4 pass: Draft with :create, :edit and :issue → EDIT, ISSUE; Open with :payment:record → RECORD_PAYMENT", eq(allowedActions(facts("Draft", ["agent/invoice:create", "agent/invoice:edit", "agent/invoice:issue"])), ["EDIT", "ISSUE"])
  && eq(allowedActions(facts("Open", ["agent/payment:record"])), ["RECORD_PAYMENT"]));
ok("FO-7q DW4 pass: a draft's creator with only :create may EDIT it; someone else with only :create may not", eq(allowedActions(facts("Draft", ["agent/invoice:create"], { startedByCaller: true })), ["EDIT"])
  && eq(allowedActions(facts("Draft", ["agent/invoice:create"])), []));
ok("FO-7q DW4 fail (break B7): :edit without :create gives no EDIT (FO-7b's line route needs :create)", eq(allowedActions(facts("Draft", ["agent/invoice:edit"])), []) && eq(allowedActions(facts("Draft", ["agent/invoice:edit"], { startedByCaller: true })), []));
ok("FO-7q DW4 fail: without agent/payment:record no status ever gives RECORD_PAYMENT; Paid gives no RECORD_PAYMENT and no credit note once nothing is creditable",
  (["Draft", "Open", "Part paid", "Paid", "Overdue", "Credited", "Refunded", "Written off"] as const).every((s) => !allowedActions(facts(s, ALL.filter((k) => k !== "agent/payment:record"))).includes("RECORD_PAYMENT"))
  && !allowedActions(facts("Paid", ALL)).includes("RECORD_PAYMENT") && !allowedActions(facts("Paid", ALL, { creditableMinor: 0 })).includes("CREDIT_NOTE"));
ok("FO-7q DW4 fail: Written off (even with an amount left), and Credited or Refunded with nothing creditable, offer only the PDF; no action names a pay link (no deposit invoice can get one)",
  eq(allowedActions(facts("Written off", ALL)), ["DOWNLOAD_PDF"]) && (["Credited", "Refunded"] as const).every((s) => eq(allowedActions(facts(s, ALL, { creditableMinor: 0 })), ["DOWNLOAD_PDF"]))
  && (["Draft", "Open", "Part paid", "Paid", "Overdue"] as const).every((s) => !allowedActions(facts(s, ALL)).some((a) => /PAY_LINK/.test(a))));

ok("FO-7q DW4 pass (review m2, break B5): a Refunded invoice with an amount creditable offers CREDIT_NOTE, as FO-7b's credit route takes it", eq(allowedActions(facts("Refunded", ALL)), ["CREDIT_NOTE", "DOWNLOAD_PDF"]));

/** DW6's scan: any field whose name says total, sum or all, outside one invoice's own figures, is a sum across currencies. */
const sumsAcross = (page: Record<string, unknown>) => Object.keys(page).some((k) => /total|sum|all/i.test(k));

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
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const invoicesFeature = (await import("../api/src/features/client-money-invoices.ts")).default;
const readsFeature = (await import("../api/src/features/client-money-reads.ts")).default;
const refundsFeature = (await import("../api/src/features/client-money-refunds.ts")).default;   // part 2: its routes answer the "route agrees" cases
const { InvoiceReads } = await import("../api/src/client-money/reads/invoices.ts");
const { PaymentReads, paymentRows } = await import("../api/src/client-money/reads/payments.ts");
const { InvoiceReadsController } = await import("../api/src/client-money/reads/routes.ts");
const { invoiceFacts, dayOf } = await import("../api/src/client-money/invoices/facts.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7q-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...invoicesFeature.providers, ...readsFeature.providers, ...refundsFeature.providers];
  @Module({ controllers: [PlatformIdentityController, ...invoicesFeature.controllers, ...readsFeature.controllers, ...refundsFeature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the reads feature registers its three controllers and its three services (part 3 adds the party search)", readsFeature.controllers.length === 3 && readsFeature.controllers[0] === InvoiceReadsController && readsFeature.providers.length === 3);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7q.${n}@example.org', 'seed:FO-7q', now()) returning id`);
  const PA = person(A, "a"), PA2 = person(A, "a2"), PB = person(B, "b");
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7q', now())`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm");
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  const keysOf = (roles: string[]) => sql(`select string_agg(permission_key, ',') from platform_role_permission where role::text in (${roles.map((r) => `'${r}'`).join(",")})`).split(",");
  const ctxOf = (actor: string, firm: string, roles: string[]) => ({ staffId: staff(actor, firm), firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles, keys: keysOf(roles), duties: [], authTime: 0, via: "local" }) as never;
  const ctxR = ctxOf("user-R", A, ["OWNER", "CASE_MANAGER"]), ctxO = ctxOf("user-O", A, ["CASE_OFFICER"]), ctxB = ctxOf("user-S", B, ["OWNER", "CASE_MANAGER"]);
  const db = nest.get(Db);
  const all = new InvoiceReads(db, async () => "ALL" as const), allPay = new PaymentReads(db, async () => "ALL" as const);
  const inA = <T>(fn: () => Promise<T>) => withFirm(A, fn), inB = <T>(fn: () => Promise<T>) => withFirm(B, fn);

  // ---------------------------------------------------------------- the invoices of the status table, through FO-7b's routes
  const M = "/front-office/money/invoices";
  const make = async (unitMinor: number, person = PA, currency = "CAD") => { const d = await call(tA, "POST", M, { personId: person, currency }); await call(tA, "POST", `${M}/${d.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor, ratePpm: 0 }); return d.body.id as string; };
  // the due date is issue's query (?dueDate=, batch #3016 on main), never its body
  const issue = async (id: string, dueDate?: string) => (await call(tA, "POST", `${M}/${id}/issue${dueDate ? `?dueDate=${dueDate}` : ""}`)).body;
  let key = 0; const pay = async (id: string, amountMinor: number) => (await call(tA, "POST", `${M}/${id}/payments`, { method: "CASH", amountMinor, idempotencyKey: `fo7q-pay-${++key}` })).body;
  const S: Record<string, string> = {};
  S.Draft = await make(1000);
  S.Open = await make(1000); await issue(S.Open);
  S["Part paid"] = await make(1000); await issue(S["Part paid"]); await pay(S["Part paid"], 400);
  S.Paid = await make(1000); await issue(S.Paid); const paidPay = await pay(S.Paid, 1000);
  S.Overdue = await make(1000); const od = await issue(S.Overdue, "2026-01-05");
  S.Credited = await make(1000); await issue(S.Credited); await call(tA, "POST", `${M}/${S.Credited}/credit-notes`, { full: true, reason: "Cancelled (Sample)" });
  S.Refunded = await make(1000); await issue(S.Refunded); const rp = await pay(S.Refunded, 1000);
  sql(`insert into money_refund (firm_id, payment_id, amount_minor, currency, reason, route, idempotency_key, created_by) values ('${A}', '${rp.id}', 1000, 'CAD', 'Returned (Sample)', 'OFFLINE', 'fo7q-refund-1', 'seed:FO-7q')`);
  S["Written off"] = await make(1000); await issue(S["Written off"]);
  sql(`insert into money_write_off (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${A}', '${S["Written off"]}', 1000, 'CAD', 'Small balance (Sample)', 'seed:FO-7q')`);
  const usd = await make(5000, PA2, "USD"); await issue(usd);
  ok("setup: the eight invoices of the status table exist (an overdue one issued with a past due date)", Object.values(S).every(Boolean) && od?.invoice?.dueDate === "2026-01-05", od);

  // ------------------------------------------------------------------------------------- DW3: the status in SQL
  const listA = (q: Record<string, string>) => inA(() => all.list(ctxR, q));
  const page = await listA({ pageSize: "200" });
  const today = dayOf(new Date());
  const views = await inA(() => db.$transaction(async (tx) => Promise.all(page.items.map(async (r) => [r.id, (await invoiceFacts(tx, A, r.id, today))!.view.statusWord] as const))));
  /** The check: every row's SQL word equals invoiceStatus's word for the same invoice. */
  const agree = (rows: { id: string; statusWord: string }[], js: readonly (readonly [string, string])[]) => rows.length === js.length && rows.every((r) => js.find((j) => j[0] === r.id)?.[1] === r.statusWord);
  ok("FO-7q DW3 pass: the SQL status equals FO-7b's invoiceStatus for every invoice, and the eight words each appear on the invoice made for it",
    agree(page.items, views) && Object.entries(S).every(([w, id]) => page.items.find((r) => r.id === id)?.statusWord === w), page.items.map((r) => [r.statusWord, r.id.slice(0, 4)]));
  ok("FO-7q DW3 fail: one deliberately mismatched fixture (Paid read as Open) fails the agreement check", !agree(page.items.map((r) => (r.id === S.Paid ? { ...r, statusWord: "Open" } : r)), views));
  const byCode = await Promise.all(["DRAFT", "OPEN", "PART_PAID", "PAID", "OVERDUE", "CREDITED", "REFUNDED", "WRITTEN_OFF"].map((c) => listA({ status: c })));
  ok("FO-7q DW3 pass: each status filter answers exactly its word's invoices (the filter runs in SQL)", byCode.every((p, i) => p.items.length >= 1 && p.items.every((r) => r.statusWord === Object.keys(S)[i])), byCode.map((p) => p.items.length));
  const od2 = await listA({ overdue: "true" }), odOpen = await listA({ overdue: "true", status: "OPEN" });
  ok("FO-7q pass: overdue=true gives the overdue invoice only; with status=OPEN both must hold, so nothing", od2.items.length === 1 && od2.items[0].id === S.Overdue && odOpen.items.length === 0);
  const pPA2 = await listA({ partyKind: "PERSON", partyId: PA2 }), issuedToday = await listA({ issuedFrom: today, issuedTo: today, status: "DRAFT" });
  ok("FO-7q pass: the party filter gives that party's invoices only; issued from/to never holds a draft", pPA2.items.length === 1 && pPA2.items[0].id === usd && issuedToday.items.length === 0);

  // ------------------------------------------------- bad queries (AG-6-37 r3, in PF-28's one rule: 422 naming the field)
  const bad = await Promise.all([{ status: "FOO" }, { pageSize: "500" }, { pageSize: "0" }, { pageSize: "abc" }, { colour: "red" }, { after: "not-a-cursor" }, { partyKind: "PERSON" }, { issuedFrom: "2026-02-01", issuedTo: "2026-01-01" },
    { issuedFrom: "2026-02-30" }, { issuedFrom: "2026-13-45" }, { issuedTo: "0000-01-01" }, { overdue: "false" }, ...["2026-99-99T00:00:00.000000", "2026-02-30T00:00:00.000000", "0000-01-01T00:00:00.000000", "2026-01-01T25:00:00.000000"]
      .map((t) => ({ after: Buffer.from(JSON.stringify({ d: 0, t, id: "00000000-0000-4000-8000-000000000000" })).toString("base64url") }))]
    .map((q) => call(tA, "GET", `${M}?${new URLSearchParams(q as unknown as Record<string, string>)}`)));
  const named = (r: Res) => r.status === 422 && r.body?.code === "INVALID" && typeof r.body.fields === "object" && Object.keys(r.body.fields).length >= 1;
  ok("FO-7q DW2 fail: page size 500 → 422 naming pageSize, \"at most 200\"; a bad status, size, unknown field, cursor, date or date range → 422 naming its field (PF-28's one rule), before any read",
    bad.every(named) && /at most 200/.test(bad[1].body.fields?.pageSize ?? "") && bad[4].body.fields?.colour !== undefined && bad[0].body.fields?.status !== undefined, bad.map((r) => [r.status, r.body?.fields]));
  const badPay = await Promise.all([{ from: "2026-02-30" }, { to: "2026-13-01" }, { after: Buffer.from(JSON.stringify({ t: "2026-02-30T00:00:00.000000", id: "00000000-0000-4000-8000-000000000000" })).toString("base64url") }]
    .map((q) => call(tA, "GET", `/front-office/money/payments?${new URLSearchParams(q as unknown as Record<string, string>)}`)));
  ok("FO-7q fail (review M2, break B2): a date or cursor time that does not exist → 422 naming its field on both lists, never a database 500", badPay.every(named) && badPay[0].body.fields?.from !== undefined, badPay.map((r) => [r.status, r.body?.detail]));

  // --------------------------------------------------------------------------------------- DW5: trust off, then on
  const scanTrust = (v: unknown) => /"(receivedInto|trustRequestId|trustPaidMinor|trust[A-Za-z]*)"\s*:/.test(JSON.stringify(v));
  const off = [await listA({}), await inA(() => all.detail(ctxR, S.Paid)), await inA(() => allPay.list(ctxR, {})), await inA(() => allPay.one(ctxR, paidPay.id))];
  ok("FO-7q DW5 pass: trust Unanswered → no invoice or payment answer carries a trust field (a key scan of every answer)", off.every((a) => !scanTrust(a)));
  sql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:FO-7q' where firm_id = '${A}'`);
  const on = await inA(() => all.detail(ctxR, S.Paid)), onPay = await inA(() => allPay.one(ctxR, paidPay.id));
  ok("FO-7q DW5 fail: trust Yes → the detail answers trustPaidMinor and a payment its receivedInto (so the scan finds what is there)", scanTrust(on) && onPay.receivedInto === "OPERATING" && on.trustPaidMinor === 0, { on, onPay });
  sql(`update money_payment_settings set trust_answer = 'NO' where firm_id = '${A}'`);
  ok("FO-7q DW5 pass: trust No with nothing held → no trust field again", !scanTrust(await inA(() => all.detail(ctxR, S.Paid))));
  // A payment received into trust on an invoice (trust Yes): applied to it, so the invoice is paid from trust (review m4).
  sql(`update money_payment_settings set trust_answer = 'YES' where firm_id = '${A}'`);
  const tInv = await make(1000); await issue(tInv);
  const tPay = (await call(tA, "POST", `${M}/${tInv}/payments`, { method: "BANK_TRANSFER", amountMinor: 600, receivedInto: "TRUST", idempotencyKey: "fo7q-trust-1" })).body;
  const tRow = (await listA({ partyKind: "PERSON", partyId: PA, status: "PART_PAID" })).items.find((r) => r.id === tInv);
  const tView = (await inA(() => db.$transaction((tx) => invoiceFacts(tx, A, tInv, today))))!;
  ok("FO-7q DW3 pass (review m4): an invoice part paid from trust: the SQL word and paid figure equal FO-7b's (the trust facts column is read)", tPay?.receivedInto === "TRUST" && tView.trustPaidMinor === 600
    && tRow?.statusWord === tView.view.statusWord && tRow?.paidMinor === tView.view.paidMinor, { tPay, tRow, w: tView.view.statusWord });
  const tDet = await inA(() => all.detail(ctxR, tInv));
  ok("FO-7q DW4 pass (review m3, break B4): creditableMinor leaves out what was paid from trust (FO-7b refuses it as TRUST_PAID): 1,000 open less 600 from trust = 400", tDet.creditableMinor === 400 && tDet.allowedActions.includes("CREDIT_NOTE"), tDet.creditableMinor);
  const rowsWith = (show: boolean) => inA(() => db.$transaction((tx) => paymentRows(tx, A, { invoiceId: tInv }, show)));
  const shown = await rowsWith(true), hidden = await rowsWith(false);
  ok("FO-7q DW5 fail (break B3): money received into trust is a payment row only while trust shows; with trust off the row is not answered at all (not just its field)",
    shown.length === 1 && shown[0].receivedInto === "TRUST" && hidden.length === 0, { shown: shown.length, hidden: hidden.length });

  // ------------------------------------------------------------------------------------------- DW4 on the detail
  const dR = await inA(() => all.detail(ctxR, S.Open)), dO = await inA(() => all.detail(ctxO, S.Open)), dPaid = await inA(() => all.detail(ctxR, S.Paid));
  ok("FO-7q DW4 pass: an Open invoice for an Owner and Case Manager → RECORD_PAYMENT, SEND, CREDIT_NOTE, DOWNLOAD_PDF (keys read from the role grants)", eq(dR.allowedActions, ["RECORD_PAYMENT", "SEND", "CREDIT_NOTE", "DOWNLOAD_PDF"]), dR.allowedActions);
  ok("FO-7q DW4 fail: a Case Officer (no agent/payment:record) never gets RECORD_PAYMENT; a Paid invoice offers no RECORD_PAYMENT", !dO.allowedActions.includes("RECORD_PAYMENT") && !dPaid.allowedActions.includes("RECORD_PAYMENT"), { o: dO.allowedActions, p: dPaid.allowedActions });
  ok("FO-7q pass: the detail holds the invoice's payments and credit notes (Paid: one CASH payment with its receipt; Credited: one full credit note)",
    dPaid.payments.length === 1 && dPaid.payments[0].receiptNumber?.startsWith("R-") && !("t" in dPaid.payments[0]) && (await inA(() => all.detail(ctxR, S.Credited))).creditNotes[0]?.full === true, dPaid.payments);

  // ------------------------------------- FO-7q part 2: refund actions on a payment, by invoices/refunds.ts's own rules
  const pa = (keys: string[], refundableMinor: number, waitingMinor: number) => paymentActions({ keys, refundableMinor, waitingMinor });
  const RF = "agent/refund:create", PR = "agent/payment:record";
  ok("FO-7q part 2 pass (table): Refund with the refund key and something left; Keep as credit and Refund the extra with both keys and an extra waiting",
    eq(pa([RF], 1000, 0), ["REFUND"]) && eq(pa([RF, PR], 1300, 300), ["REFUND", "KEEP_AS_CREDIT", "REFUND_EXTRA"]));
  ok("FO-7q part 2 fail (table): no refund key → no Refund and no Refund of the extra (Keep stays); no payment:record → no choice; nothing left or waiting → nothing",
    eq(pa([PR], 1000, 300), ["KEEP_AS_CREDIT"]) && eq(pa([RF], 0, 300), []) && eq(pa([RF, PR], 0, 0), []));
  type PayRow = { id: string; refundableMinor?: number; waitingMinor?: number; allowedActions?: string[] };
  const payIn = async (ctx: never, inv: string, id: string) => ((await inA(() => all.detail(ctx, inv))).payments as PayRow[]).find((x) => x.id === id);
  const noRefund = { ...(ctxR as { keys: string[] }), keys: (ctxR as { keys: string[] }).keys.filter((k) => k !== RF) } as never;
  const rbody = (amountMinor: number) => ({ amountMinor, method: "E_TRANSFER", reason: "Sample refund", idempotencyKey: `fo7q-r-${++key}` });
  const paidRow = await payIn(ctxR, S.Paid, paidPay.id);
  ok("FO-7q part 2 pass: a cleared operating payment with money left offers Refund to an Owner (refundable CAD 10.00), and no choice (nothing waiting)",
    paidRow?.refundableMinor === 1000 && paidRow?.waitingMinor === 0 && eq(paidRow?.allowedActions ?? [], ["REFUND"]), paidRow);
  ok("FO-7q part 2 fail (key missing): the same payment offers no Refund to a person without agent/refund:create", !(await payIn(noRefund, S.Paid, paidPay.id))?.allowedActions?.includes("REFUND"));
  const trustRow = await payIn(ctxR, tInv, tPay.id);
  ok("FO-7q part 2 fail (trust): money received into trust offers nothing here (refunds.ts's TRUST_REFUND): refundable 0, no action", trustRow?.refundableMinor === 0 && eq(trustRow?.allowedActions ?? ["x"], []), trustRow);
  const cInv = await make(1000); await issue(cInv);
  const chq = (await call(tA, "POST", `${M}/${cInv}/payments`, { method: "CHEQUE", amountMinor: 400, idempotencyKey: `fo7q-chq-${++key}` })).body;
  const chqRow = await payIn(ctxR, cInv, chq.id), chqRoute = await call(tA, "POST", `/front-office/money/payments/${chq.id}/refunds`, rbody(100));
  ok("FO-7q part 2 fail (uncleared): a cheque not yet cleared offers no Refund, and the refund route agrees (409 NOT_CLEARED)",
    chq?.cleared === false && chqRow?.refundableMinor === 0 && !chqRow?.allowedActions?.includes("REFUND") && chqRoute.status === 409 && chqRoute.body?.code === "NOT_CLEARED", { chqRow, r: chqRoute.body?.code });
  const doneRow = await payIn(ctxR, S.Refunded, rp.id), doneRoute = await call(tA, "POST", `/front-office/money/payments/${rp.id}/refunds`, rbody(1));
  ok("FO-7q part 2 fail (nothing left): a payment refunded in full offers no Refund, and the route agrees (409 OVER_REFUND)",
    doneRow?.refundableMinor === 0 && !doneRow?.allowedActions?.includes("REFUND") && doneRoute.status === 409 && doneRoute.body?.code === "OVER_REFUND", { doneRow, r: doneRoute.body?.code });
  const xInv = await make(1000); await issue(xInv); const over = await pay(xInv, 1300);
  const xR = await payIn(ctxR, xInv, over.id), xNo = await payIn(noRefund, xInv, over.id), xO = await payIn(ctxO, xInv, over.id);
  ok("FO-7q part 2 pass (extra waiting): CAD 3.00 paid over the invoice offers Refund, Keep as credit and Refund the extra to an Owner; without the refund key only Keep as credit",
    xR?.waitingMinor === 300 && eq(xR?.allowedActions ?? [], ["REFUND", "KEEP_AS_CREDIT", "REFUND_EXTRA"]) && eq(xNo?.allowedActions ?? [], ["KEEP_AS_CREDIT"]), { xR, xNo });
  ok("FO-7q part 2 fail (keys): a Case Officer (neither agent/payment:record nor agent/refund:create) gets no action on it", eq(xO?.allowedActions ?? ["x"], []), xO);
  const kept = await call(tA, "POST", `/front-office/money/payments/${over.id}/extra`, { choice: "KEEP_AS_CREDIT" }), xAfter = await payIn(ctxR, xInv, over.id);
  ok("FO-7q part 2 fail (nothing waiting): once the extra is kept as credit (the route answers 201), Keep and Refund the extra are no longer offered",
    kept.status === 201 && xAfter?.waitingMinor === 0 && !xAfter?.allowedActions?.includes("KEEP_AS_CREDIT") && !xAfter?.allowedActions?.includes("REFUND_EXTRA"), { k: kept.status, xAfter });
  const offered = await call(tA, "POST", `/front-office/money/payments/${paidPay.id}/refunds`, rbody(100)), oneRead = await inA(() => allPay.one(ctxR, paidPay.id)) as PayRow;
  ok("FO-7q part 2 pass (route agrees): an offered Refund is taken by the route (201), and the one-payment read then shows CAD 9.00 left with Refund still offered",
    offered.status === 201 && oneRead.refundableMinor === 900 && eq(oneRead.allowedActions ?? [], ["REFUND"]), { s: offered.status, oneRead });
  ok("FO-7q part 2: the payments list carries no actions (they are read per payment on the detail and the one-payment read)", (await inA(() => allPay.list(ctxR, {}))).items.every((x) => !("allowedActions" in x)));

  // ---------------------------------------------------------------------------------------------- DW6: currencies
  const mixed = await listA({});
  ok("FO-7q DW6 pass: a CAD and a USD invoice in one page: each row carries its own currency and the page has no total field", mixed.items.some((r) => r.currency === "USD") && mixed.items.some((r) => r.currency === "CAD")
    && mixed.items.every((r) => r.currency === "CAD" || r.currency === "USD") && !sumsAcross(mixed) && eq(Object.keys(mixed).sort(), ["items", "next", "pageSize"]));
  ok("FO-7q DW6 fail: a planted page with a totalMinor across currencies is caught by the scan", sumsAcross({ ...mixed, totalMinor: 1 }));

  // ------------------------------------------------------------------------------------------------- DW7: walls
  const hisA = await Promise.all([inB(() => all.detail(ctxB, S.Paid)).then(() => 200, (e) => e.status ?? e.getStatus?.()), inB(() => all.detail(ctxB, "00000000-0000-4000-8000-000000000000")).then(() => 200, (e) => e.getStatus?.()),
    inB(() => allPay.one(ctxB, paidPay.id)).then(() => 200, (e) => e.getStatus?.())]);
  const bList = await inB(() => all.list(ctxB, { partyKind: "PERSON", partyId: PA })), cursorA = mixed.next ?? Buffer.from(JSON.stringify({ d: 0, t: "2026-01-01T00:00:00.000000", id: S.Paid })).toString("base64url");
  const bCursor = await inB(() => all.list(ctxB, { after: cursorA }));
  ok("FO-7q DW7 pass: firm B asking for firm A's invoice or payment → 404, the same as an unknown id; A's party filter and A's cursor give B nothing of A's",
    eq(hisA.map(String), ["404", "404", "404"]) && bList.items.length === 0 && bCursor.items.every((r) => !Object.values(S).includes(r.id)), hisA);
  const pb = await make(700, PA); void PB;
  ok("FO-7q DW7 fail: the same reads in firm A find A's invoice (so the 404 above is the wall, not a broken read)", (await inA(() => all.detail(ctxR, pb))).invoice.id === pb);

  // ------------------------------------------------- DW9: C5 through CS-MV1's adapter (PgMoneyVisibility), real cases
  // Firm A's cases X (user-O on its team) and Y (user-T's), and a prospect of user-O's whose subject is PA2 (Sample).
  const WS = randomUUID(); let cn = 0;
  sql(`insert into workspace (id, key, label) values ('${WS}', 'fo7q-${WS.slice(0, 8)}', 'FO-7q (Sample)')`);
  const realCase = () => { const id = randomUUID(), client = randomUUID(); cn++;
    sql(`set session_replication_role = replica;
      insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values ('${client}', '${WS}', 'sample-firm', '${A}', ${cn}, 'Client ${cn} (Sample)', 'PERSON', '${PA}', 'seed:FO-7q');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values ('${id}', '${WS}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(cn).padStart(5, "0")}', 'sample-firm', '${A}', '${client}', 'OPEN')`);
    return id; };
  const team = (caseId: string, userId: string) => sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values ('${randomUUID()}', '${WS}', '${caseId}', '${userId}', 'OFFICER', 'user-R')`);
  const X = realCase(), Y = realCase(); team(X, "user-O"); team(Y, "user-T");
  sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values ('${randomUUID()}', '${A}', 'P-07001', '${randomUUID()}', 'INDIVIDUAL', '${randomUUID()}', '${PA2}', null, '${PA2}', '${staff("user-O", A)}', 'seed:FO-7q', now())`);
  const onCase = (c: string) => sql(`insert into money_invoice (firm_id, person_id, case_id, currency, created_by, updated_at) values ('${A}', '${PA}', '${c}', 'CAD', 'seed:FO-7q', now()) returning id`);
  const iX = onCase(X), iY = onCase(Y);
  // X's invoice issued with one line and paid in part, so the officer's payments read has something to find (review n2)
  sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${A}', '${iX}', 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD')`);
  await issue(iX); const xPay = await pay(iX, 300);
  // the app as wired (features/client-money-reads.ts): user-R holds agent/case:view.all (PF-3's seed)
  const app1 = await call(tA, "GET", `${M}?pageSize=200`), app2 = await call(tA, "GET", `${M}/${iY}/detail`), app3 = await call(tA, "GET", `${M}/${S.Paid}/detail`);
  const appIds = (app1.body?.items ?? []).map((r: { id: string }) => r.id);
  ok("FO-7q DW9 pass (CS-MV1 bound in the app): user-R, who may see every case, lists X's and Y's invoices and opens Y's",
    app1.status === 200 && appIds.includes(iX) && appIds.includes(iY) && app2.status === 200 && app2.body.invoice.id === iY, { s: app1.status, n: appIds.length, d: app2.status });
  ok("FO-7q DW9 fail (still fail closed where no rule reaches): an invoice on a person with no case and no prospect is in no one's scope: absent from the list, its detail 404",
    !appIds.includes(S.Paid) && app3.status === 404, app3.status);
  // the real reads with the real adapter, for a case officer who may see only their own cases (view.all taken away)
  const { PgMoneyVisibility } = await import("../api/src/client-money/visibility-adapter.ts");
  const vis = new PgMoneyVisibility(db), real = new InvoiceReads(db, (c) => vis.scopeOf(c)), realPay = new PaymentReads(db, (c) => vis.scopeOf(c));
  const own = { ...(ctxO as { keys: string[] }), keys: (ctxO as { keys: string[] }).keys.filter((k) => k !== "agent/case:view.all" && k !== "agent/prospect:view.all").concat("agent/case:view.own", "agent/prospect:view.own") } as never;
  const oPage = await inA(() => real.list(own, { pageSize: "200" })), oIds = oPage.items.map((r) => r.id);
  const oY = await inA(() => real.detail(own, iY)).then(() => 200, (e) => e.getStatus?.()), oX = await inA(() => real.detail(own, iX)).then((d) => d.invoice.id, () => null);
  ok("FO-7q DW9 pass: with the real adapter a case officer limited to their own cases gets X's invoice and their prospect's party's (PA2, no case), and opens X's",
    oIds.includes(iX) && oIds.includes(usd) && oX === iX, oIds.length);
  ok("FO-7q DW9 fail: never Y's invoice (another officer's case: 404) nor a case-less invoice of a person they hold no prospect for (PA)", !oIds.includes(iY) && oY === 404 && !oIds.includes(S.Paid), { oY });
  const oPays = await inA(() => realPay.list(own, {}));
  ok("FO-7q DW9 pass: payments follow their invoice's scope: the officer sees the payment on X's invoice, and none on PA's case-less invoices",
    oPays.items.some((x) => x.id === xPay.id) && oPays.items.every((x) => x.invoiceId !== S.Paid && x.invoiceId !== S["Part paid"]), { n: oPays.items.length, xPay: xPay?.id });
  const bReal = await inB(() => real.list(ctxB, {})), bScope = await inB(() => vis.scopeOf(ctxB));
  // the adapter's own answer for firm B, not only the list's wall (review n1): a leak of A's ids would show here
  ok("FO-7q DW9 fail: firm B's widest scope through the adapter names none of firm A's cases or parties, and its list holds none of A's invoices",
    ![X, Y].some((c) => bScope.cases.includes(c)) && ![PA, PA2].some((p) => bScope.parties.includes(p)) && bReal.items.every((r) => ![iX, iY, usd, S.Paid].includes(r.id)), bScope);

  // ------------------------------------------------------------------------- DW1 + DW2: 10,000 invoices per firm
  for (const [f, p] of [[A, PA], [B, PB]]) {
    // due dates spread over 120 days from 1 Jan 2027: on the fixed day 1 Mar 2027 about half are overdue and half open, so
    // every status filter does real work (review M1, break B1: a seed all due later skipped it)
    sql(`insert into money_invoice (firm_id, person_id, currency, due_date, created_by, updated_at) select '${f}', '${p}', 'CAD', date '2027-01-01' + (g % 120), 'seed:FO-7q-bulk', now() from generate_series(1, 10000) g`);
    sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency)
      select firm_id, id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice where created_by = 'seed:FO-7q-bulk' and firm_id = '${f}'`);
    sql(`update money_invoice set issued_at = now(), issued_by = 'seed:FO-7q' where created_by = 'seed:FO-7q-bulk' and firm_id = '${f}'`);
  }
  sql("analyze");
  const t0 = performance.now(); const p1 = await listA({}); const ms = Math.round(performance.now() - t0);
  const perf = new InvoiceReads(db, async () => "ALL" as const, new FakeClock("2027-03-01T12:00:00Z")), timed = async (q: Record<string, string>) => { const t = performance.now(); const r = await inA(() => perf.list(ctxR, q)); return { ms: Math.round(performance.now() - t), n: r.items.length }; };
  const odT = await timed({ status: "OVERDUE" }), open = await timed({ status: "OPEN" }), rare = await timed({ status: "REFUNDED" }), msOd = odT.ms;
  console.log(`INFO  FO-7q DW1 (fixed day 1 Mar 2027): status=OVERDUE ${odT.ms} ms (${odT.n} rows), OPEN ${open.ms} ms (${open.n}), REFUNDED ${rare.ms} ms (${rare.n}: a word with almost no matches reads every candidate)`);
  console.log(`INFO  FO-7q DW1: page 1 of 10,000+ invoices in ${ms} ms; status=OVERDUE in ${msOd} ms (AG-6-30's 300 ms: page 1 reported, OVERDUE asserted below)`);
  const planOf = async (q: Record<string, string>) => { const b = await inA(() => all.listSql(ctxR, q)); return (await owner.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`explain ${b.sql!}`)).map((r) => r["QUERY PLAN"]).join("\n"); };
  const plan = await planOf({});
  const firmFirst = (p: string) => /Index (Only )?Scan.* on money_invoice\b|Bitmap Index Scan on money_invoice_firm/.test(p) && !/Seq Scan on money_invoice\b/.test(p);
    // Page 1 needs FO-7ts part 3's index (firm_id, issued_at DESC, id), #2368: until it is on main this case fails (the Ready-when).
  ok("FO-7q DW1 pass: page 1 reads money_invoice through a firm_id-first index, with no sequential scan of it", firmFirst(plan), plan);
  // status=OVERDUE: no index covers due_date yet (a later FO-7ts index step), so its proof is the time against AG-6-30's
  // 300 ms (Lead 4 on #3001, comment 7077540661, answer 1); the plan shape is not asserted.
  // With #2368's index each half stops after a page of matches; until then this case fails with page 1's plan (the Ready-when).
  ok(`FO-7q DW1 pass: status=OVERDUE over 10,000+ invoices, half of them overdue, answers a full page within 300 ms (${msOd} ms)`, msOd < 300 && odT.n === 50, odT);
  ok("FO-7q DW1 fail: a time past 300 ms fails the same comparison", !(301 < 300));
  ok("FO-7q DW1 fail: a plan with a sequential scan of money_invoice is caught by the same check", !firmFirst("Seq Scan on money_invoice i  (cost=0.00..1.00 rows=1 width=8)"));
  ok("FO-7q DW2 pass: no page size → 50, and 200 → 200", p1.items.length === 50 && p1.pageSize === 50 && (await listA({ pageSize: "200" })).items.length === 200);
  const seen = new Set<string>(); let next: string | null = null, repeats = 0, pages = 0;
  const order = sql(`select string_agg(id::text, ',' order by (issued_at is null)::int, coalesce(issued_at, created_at) desc, id) from (select * from money_invoice where firm_id = '${A}' order by (issued_at is null)::int, coalesce(issued_at, created_at) desc, id limit 600) x`).split(",");
  do {
    const pg = await listA({ pageSize: "200", ...(next ? { after: next } : {}) });
    for (const r of pg.items) { if (seen.has(r.id)) repeats++; seen.add(r.id); }
    next = pg.next; pages++;
    if (pages === 1) await issue(await make(300));   // a new invoice issued between two calls goes before page 1, never into the pages still to come
  } while (next && pages < 3);
  ok("FO-7q DW2 pass: three pages by `after` hold the first 600 rows in order, none repeated or skipped, while an invoice was issued between calls", repeats === 0 && seen.size === 600 && order.every((id) => seen.has(id)), { repeats, size: seen.size });
} finally {
  await app?.close(); await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* best effort */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
