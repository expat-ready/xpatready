// FO-7r part 1 (R1.111; AG-6-28 rules 1, 3; AG-6-30; shape product/screens/fo-7s-money/build/r1-111-shape.md, Lead 4 on
// #3634): a client's money summary and statement. Named per rule, each with a pass and a fail:
//   S1 the statement's closing INVOICES balance, per currency, equals Σ (total − credited − written off − paid) of the
//      client's issued invoices as FO-7b's invoiceFacts reads them, and each line's running balance is the one before it
//      plus its amount (the row's "running balance equals the ledger");
//   S2 two currencies are never added: one account row per currency, CAD and USD apart in the summary too;
//   S3 a period: opening + the period's lines = closing; an empty period is opening = closing, no lines; to < from → 422;
//   S4 the summary: billed, paid, paid from trust, credited, written off, refunded, owed (= Σ the invoice list's due),
//      days overdue, trust and credit as seeded; unbilled is null ("Not tracked yet", Lead 4 on #3634);
//   S5 trust: the TRUST account's closing equals the trust reads' balance; while trust does not show, no TRUST line and
//      the summary's trust is null;
//   S6 who: another firm's client, an unknown id, a bad kind, an empty scope → 404; a scope of one case sees only that
//      case's invoices; drafts and other clients never count; the route: 401 without a session, 403 without
//      agent/invoice:show;
//   S7 paging (AG-6-30): pages of 2 walk the same lines as one page; pageSize 500 and a forged cursor → 422;
//   S8 10,000 invoices: the statement's page 1 and the summary answer within the read budget (STANDARDS §9, 300 ms per
//      FO-7q DW1's measure).
// A scratch database (every migration), the money features in a Nest app with PF-4's guard and PF-12's walls; fixtures
// through FO-7b's and FO-7t's real routes, plus a write-off and an applied credit written by SQL (no route on main yet:
// R1.96). No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7r_statement.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7r1_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
const reports = (await import("../api/src/features/client-money-reports.ts")).default;
const features: { controllers: unknown[]; providers: unknown[] }[] = [(await import("../api/src/features/client-money-invoices.ts")).default, (await import("../api/src/features/client-money-reads.ts")).default,
  (await import("../api/src/features/client-money-refunds.ts")).default, (await import("../api/src/features/client-money-trust.ts")).default, reports];
const { MoneyStatement } = await import("../api/src/client-money/reports/statement.ts");
const { MoneySummary } = await import("../api/src/client-money/reports/summary.ts");
const { MoneyReportsController } = await import("../api/src/client-money/reports/routes.ts");
const { InvoiceReads } = await import("../api/src/client-money/reads/invoices.ts");
const { invoiceFacts, dayOf } = await import("../api/src/client-money/invoices/facts.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7r1-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...features.flatMap((x) => x.providers)];
  @Module({ controllers: [PlatformIdentityController, ...features.flatMap((x) => x.controllers)] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the reports feature registers its controller and its two services", reports.controllers.length === 1 && reports.controllers[0] === MoneyReportsController && reports.providers.length === 2);
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7r.${n}@example.org', 'seed:FO-7r', now()) returning id`));
  const PA = person(A, "a"), PA2 = person(A, "a2"), PB = person(B, "b"), PBULK = person(A, "bulk");
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7r', now())`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tA = await signIn("user-R", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  const keysOf = (roles: string[]) => sql(`select string_agg(permission_key, ',') from platform_role_permission where role::text in (${roles.map((r) => `'${r}'`).join(",")})`).split(",");
  const ctxOf = (actor: string, firm: string, roles: string[]) => ({ staffId: staff(actor, firm), firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles, keys: keysOf(roles), duties: [], authTime: 0, via: "local" }) as never;
  const ctxR = ctxOf("user-R", A, ["OWNER", "CASE_MANAGER"]), ctxB = ctxOf("user-S", B, ["OWNER", "CASE_MANAGER"]);
  const db = nest.get(Db), inA = <T>(fn: () => Promise<T>) => withFirm(A, fn), inB = <T>(fn: () => Promise<T>) => withFirm(B, fn);
  const ALL = async () => "ALL" as const;
  const allStmt = new MoneyStatement(db, ALL), allSum = new MoneySummary(db, ALL), allInv = new InvoiceReads(db, ALL);
  /** Every line of a statement, page by page. */
  const walk = async (s: InstanceType<typeof MoneyStatement>, id: string, q: Record<string, string> = {}, firm = A) => {
    const items: any[] = []; let next: string | null = null, first: any = null;   // eslint-disable-line @typescript-eslint/no-explicit-any -- the page as answered
    do { const p: any = await withFirm(firm, () => s.statement(ctxR, "person", id, { ...q, ...(next ? { after: next } : {}) })); first ??= p; items.push(...p.items); next = p.next; } while (next);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as above
    return { ...first, items };
  };

  // ------------------------------------------------- trust off first (S5 fail): the summary and statement say nothing of trust
  const M = "/front-office/money/invoices";
  const make = async (unitMinor: number, who = PA, currency = "CAD", t = tA) => { const d = await call(t, "POST", M, { personId: who, currency }); await call(t, "POST", `${M}/${d.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor, ratePpm: 0 }); return d.body.id as string; };
  const issue = async (id: string, dueDate?: string, t = tA) => (await call(t, "POST", `${M}/${id}/issue${dueDate ? `?dueDate=${dueDate}` : ""}`)).body;
  let key = 0; const pay = async (id: string, amountMinor: number, t = tA, method = "CHEQUE") => (await call(t, "POST", `${M}/${id}/payments`, { method, amountMinor, reference: `CHQ-${++key}`, idempotencyKey: `fo7r-pay-${key}` })).body;
  const inv1 = await make(265550); await issue(inv1, "2026-01-05"); const p1 = await pay(inv1, 100000);
  const cn = await call(tA, "POST", `${M}/${inv1}/credit-notes`, { amountMinor: 10000, reason: "Goodwill (Sample)" });
  const off = await inA(() => allSum.summary(ctxR, "person", PA)), offS = await walk(allStmt, PA);
  ok("FO-7r S5 fail (trust off): the summary's trust is null and the statement holds no TRUST line or account", !off.trustShows && off.totals.every((t) => t.trustMinor === null) && !offS.trustShows && offS.items.every((l: any) => l.account === "INVOICES") && offS.accounts.every((a: any) => a.account === "INVOICES"), { off, offS });   // eslint-disable-line @typescript-eslint/no-explicit-any -- lines as answered

  // ---------------------------------------------------------------------------------- the rest of the fixtures (Sample)
  await call(tA, "PUT", "/front-office/money/trust/answer", { answer: "YES" });
  const dep = await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PA, method: "E_TRANSFER", amountMinor: 150000, currency: "CAD", reference: "ET-1", idempotencyKey: "fo7r-dep-1" });
  const inv2 = await make(100000); await issue(inv2); const p2 = await pay(inv2, 100000, tA, "CASH");   // cash is cleared at once, so it can be refunded
  const rf = await call(tA, "POST", `/front-office/money/payments/${p2.id}/refunds`, { amountMinor: 30000, method: "E_TRANSFER", reason: "Returned in part (Sample)", idempotencyKey: "fo7r-refund-1" });
  const inv3 = await make(50000); await issue(inv3);
  sql(`insert into money_write_off (firm_id, invoice_id, amount_minor, currency, reason, created_by) values ('${A}', '${inv3}', 50000, 'CAD', 'Small balance (Sample)', 'seed:FO-7r')`);
  const inv4 = await make(40000); await issue(inv4);
  const ap = await call(tA, "POST", "/front-office/money/trust/applications", { invoiceId: inv4, amountMinor: 25000 });
  const inv5 = await make(30000); await issue(inv5);
  const usd = await make(500000, PA, "USD"); await issue(usd);
  // received yesterday, recorded today after the issue: stored at yesterday 00:00 UTC, before the invoice's issue time (review m1)
  const pUsd = await call(tA, "POST", `${M}/${usd}/payments`, { method: "BANK_TRANSFER", amountMinor: 200000, reference: "BT-USD", receivedOn: dayOf(new Date(Date.now() - 86_400_000)), idempotencyKey: "fo7r-pay-usd" });
  const draft = await make(99900);
  const other = await make(77700, PA2); await issue(other);
  const bInv = await make(55500, PB, "CAD", tB); await issue(bInv, undefined, tB);
  ok("setup: payments, a credit note, a trust deposit, a refund, trust applied and the other clients' invoices are recorded through the real routes",
    !!p1?.id && cn.status === 201 && dep.status === 201 && rf.status === 201 && ap.status === 201 && pUsd.status === 201 && !!draft && !!other && !!bInv, { rf: rf.body, cn: cn.status, dep: dep.status, ap: ap.body, pUsd: pUsd.body });

  // ---------------------------------------------------------------------------------------------------- S1, S2
  const today = dayOf(new Date());
  const factsOf = (ids: string[]) => inA(() => db.$transaction(async (tx) => Promise.all(ids.map(async (id) => (await invoiceFacts(tx, A, id, today))!.view))));
  const views = await factsOf([inv1, inv2, inv3, inv4, inv5, usd]);
  // the ledger: what is owed less what was paid beyond the bill and still waits for a choice, invoice by invoice (facts.ts's dueMinor, extraMinor)
  const ledger = (cur: string) => views.filter((v) => v.currency === cur).reduce((s, v) => s + v.dueMinor - v.extraMinor, 0);
  const all = await walk(allStmt, PA), closing = (acct: string, cur: string) => all.accounts.find((a: any) => a.account === acct && a.currency === cur)?.closingMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok(`FO-7r S1 pass: the closing INVOICES balance per currency equals Σ (due − extra) of invoiceFacts (CAD ${ledger("CAD")}, USD ${ledger("USD")})`,
    closing("INVOICES", "CAD") === ledger("CAD") && closing("INVOICES", "USD") === ledger("USD") && ledger("CAD") === 265550 - 100000 - 10000 + (100000 - 100000 + 30000) + 0 + (40000 - 25000) + 30000, { accounts: all.accounts, ledger: [ledger("CAD"), ledger("USD")] });
  const chained = (lines: any[]) => { const last = new Map<string, number>(); return lines.every((l) => { const k = `${l.account}|${l.currency}`, prev = last.get(k) ?? 0; last.set(k, l.balanceAfterMinor); return l.balanceAfterMinor === prev + l.amountMinor; }); };   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S1 pass: each line's running balance is the one before it plus its amount, and the last line's equals the closing balance", chained(all.items)
    && ["CAD", "USD"].every((c) => all.items.filter((l: any) => l.account === "INVOICES" && l.currency === c).at(-1)?.balanceAfterMinor === closing("INVOICES", c)), all.items);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const kinds = new Set(all.items.filter((l: any) => l.account === "INVOICES").map((l: any) => l.kind));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S1 pass: the lines name each fact: invoice, payment, credit note, refund, write-off, paid from trust (S9 has the other four)", ["INVOICE", "PAYMENT", "CREDIT_NOTE", "REFUND", "WRITE_OFF", "PAID_FROM_TRUST"].every((k) => kinds.has(k)), [...kinds]);
  // review m1: a payment recorded with today's date is stored at 00:00 UTC, before the invoice issued later today; it still
  // follows its invoice (each fact is dated no earlier than its invoice's issue)
  const firstOf = (lines: any[]) => lines.filter((l) => l.account === "INVOICES").every((l, i, xs) => l.kind === "INVOICE" || xs.slice(0, i).some((p) => p.kind === "INVOICE" && p.invoiceId === l.invoiceId));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const stored = sql(`select count(*) from money_payment p join money_invoice i on i.id = p.invoice_id where i.person_id = '${PA}' and p.received_at < i.issued_at`);
  ok(`FO-7r S1 pass: each fact follows its own invoice's line, though ${stored} payment(s) are stored before their invoice's issue time`, Number(stored) > 0 && firstOf(all.items), all.items.map((l: any) => l.kind));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S1 fail: the same check on the lines in reverse order fails", !firstOf([...all.items].reverse()));
  ok("FO-7r S6 fail: a draft, another client's invoice and another firm's never appear", !all.items.some((l: any) => [draft, other, bInv].includes(l.invoiceId)));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S2 pass: one account row per currency (CAD and USD apart), and no field adds them", all.accounts.filter((a: any) => a.account === "INVOICES").map((a: any) => a.currency).join() === "CAD,USD"   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
    && !Object.keys(all).some((k) => /total|sum/i.test(k)));
  ok("FO-7r S2 fail: the USD invoice's lines are never in the CAD running balance", all.items.filter((l: any) => l.currency === "CAD").every((l: any) => l.invoiceId !== usd));   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  // S1 fail, on the code: a payment recorded on another client's invoice moves that client's closing balance by exactly
  // its amount and leaves this client's as it was
  const before2 = await walk(allStmt, PA2); await pay(other, 7700, tA, "CASH"); const after2 = await walk(allStmt, PA2), againA = await walk(allStmt, PA);
  const cl = (st: any) => st.accounts.find((a: any) => a.account === "INVOICES" && a.currency === "CAD")?.closingMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S1 fail: a payment on another client's invoice changes that client's closing by −77.00 and not this client's", cl(after2) === cl(before2) - 7700 && cl(againA) === cl(all) && cl(all) === ledger("CAD"), { before2: cl(before2), after2: cl(after2), a: cl(againA) });

  // ---------------------------------------------------------------------------------------------------- S4, S5
  const sum = await inA(() => allSum.summary(ctxR, "person", PA)), cad = sum.totals.find((t) => t.currency === "CAD")!, usdT = sum.totals.find((t) => t.currency === "USD")!;
  const listDue = (await inA(() => allInv.list(ctxR, { partyKind: "PERSON", partyId: PA, pageSize: "200" }))).items.filter((r) => r.currency === "CAD").reduce((s, r) => s + r.dueMinor, 0);
  ok("FO-7r S4 pass: CAD billed, paid, paid from trust, credited, written off, refunded and credit as seeded; owed equals the invoice list's due",
    cad.billedMinor === 265550 + 100000 + 50000 + 40000 + 30000 && cad.paidMinor === 100000 + 70000 + 25000 && cad.paidFromTrustMinor === 25000 && cad.creditedMinor === 10000
    && cad.writtenOffMinor === 50000 && cad.refundedMinor === 30000 && cad.creditMinor === 0 && cad.owedMinor === listDue && cad.owedMinor === 155550 + 30000 + 15000 + 30000, { cad, listDue });
  ok("FO-7r S4 pass: the oldest overdue invoice (due 2026-01-05) gives its days; unbilled is null, never a guessed zero",
    cad.oldestOverdueDays === Math.round((Date.parse(today) - Date.parse("2026-01-05")) / 86_400_000) && cad.unbilledMinor === null && usdT.oldestOverdueDays === null, cad);
  ok("FO-7r S2 pass: the summary has a CAD and a USD row, USD billed 5,000.00, paid 2,000.00, owed 3,000.00", sum.totals.length === 2 && usdT.billedMinor === 500000 && usdT.paidMinor === 200000 && usdT.owedMinor === 300000, sum.totals);
  ok("FO-7r S4 pass: nothing was paid beyond the bill here, so the closing balance equals owed", closing("INVOICES", "CAD") === cad.owedMinor, { closing: closing("INVOICES", "CAD"), owed: cad.owedMinor });
  const bal = await call(tA, "GET", `/front-office/money/trust/balances?personId=${PA}`);
  const trustCad = bal.body?.totals?.find((t: any) => t.currency === "CAD")?.amountMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S5 pass: the TRUST account's closing and the summary's trust equal the trust reads' balance (CAD 1,250.00)", trustCad === 125000 && closing("TRUST", "CAD") === trustCad && cad.trustMinor === trustCad
    && all.items.filter((l: any) => l.account === "TRUST").map((l: any) => l.kind).join() === "DEPOSIT,WITHDRAWAL_TO_INVOICE", { trustCad, accounts: all.accounts });   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered

  // ---------------------------------------------------------------------------------------------------- S9
  // Every other fact, written with the database's own triggers and checks on (review M2): an overpayment kept as credit
  // (FO-7b's real route), credit applied and its reversal (FO-7ts part 2's ledger rows; no route on main), and credit
  // notes on a trust-paid invoice that move part back to trust (its trigger writes the CORRECTION) or refund part to the
  // client (OVERPAID_REFUND). Each closing equals invoiceFacts; owed equals the invoice list's due; closing = owed − the
  // overpayment kept as credit (the shape's rule).
  const PC = person(A, "c");
  await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PC, method: "E_TRANSFER", amountMinor: 100000, currency: "CAD", reference: "ET-C", idempotencyKey: "fo7r-dep-c" });
  const x = await make(60000, PC); await issue(x); const wx = await call(tA, "POST", "/front-office/money/trust/applications", { invoiceId: x, amountMinor: 60000 });
  const W = sql(`select id from money_trust_entry where invoice_id = '${x}' and kind = 'WITHDRAWAL_TO_INVOICE'`);
  // the trust money moves to operating first (FO-7t's To move route): only moved money takes an overpaid choice
  const moved = await call(tA, "POST", "/front-office/money/trust/to-move/batches", { currency: "CAD", direction: "TRUST_TO_OPERATING", transferDate: dayOf(new Date()), lines: [{ sourceEntryId: W, amountMinor: 60000 }] });
  sql(`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, reason, overpaid_choice, overpaid_minor, overpaid_entry_id, created_by) values ('${A}', '${x}', 20000, 'CAD', 'Back to trust (Sample)', 'OVERPAID_TO_TRUST', 20000, '${W}', 'seed:FO-7r')`);
  sql(`insert into money_credit_note (firm_id, invoice_id, amount_minor, currency, reason, overpaid_choice, overpaid_minor, overpaid_entry_id, created_by) values ('${A}', '${x}', 5000, 'CAD', 'Refunded to the client (Sample)', 'OVERPAID_REFUND', 5000, '${W}', 'seed:FO-7r')`);
  const y = await make(10000, PC); await issue(y); const py = await pay(y, 15000, tA, "CASH");
  const keep = await call(tA, "POST", `/front-office/money/payments/${py.id}/extra`, { choice: "KEEP_AS_CREDIT" });
  const z = await make(8000, PC); await issue(z);
  const ap1 = sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, invoice_id, created_by) values ('${A}', '${PC}', 'APPLIED', -3000, 'CAD', '${z}', 'seed:FO-7r') returning id`);
  sql(`insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, reverses_entry_id, reason, created_by) values ('${A}', '${PC}', 'REVERSED', 1000, 'CAD', '${ap1}', 'Applied too much (Sample)', 'seed:FO-7r')`);
  const w = await make(5000, PC); await issue(w); await pay(w, 7000, tA, "CASH");   // CAD 20.00 beyond the bill, no choice made yet
  const sc = await walk(allStmt, PC), sumC = await inA(() => allSum.summary(ctxR, "person", PC)), cC = sumC.totals[0]!;
  const vC = await factsOf([x, y, z, w]), ledgerC = vC.reduce((s, v) => s + v.dueMinor - v.extraMinor, 0);
  const dueC = (await inA(() => allInv.list(ctxR, { partyKind: "PERSON", partyId: PC, pageSize: "200" }))).items.reduce((s, r) => s + r.dueMinor, 0);
  const kindsC = new Set(sc.items.map((l: any) => l.kind)), closingC = sc.accounts.find((a: any) => a.account === "INVOICES")?.closingMinor;   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("setup S9: the trust payment and its move, both credit notes, the overpayment kept as credit and the credit rows are accepted by the database's checks", wx.status === 201 && moved.status === 201 && keep.status === 201 && !!ap1, { wx: wx.body, moved: moved.body, keep: keep.body });
  ok("FO-7r S9 pass: the corrected trust payment, the money returned from trust, credit kept, credit applied and its reversal each show as a line",
    ["PAID_FROM_TRUST", "PAID_FROM_TRUST_CORRECTED", "RETURNED_FROM_TRUST", "KEPT_AS_CREDIT", "CREDIT_APPLIED", "CREDIT_APPLIED_REVERSED", "CREDIT_NOTE", "PAYMENT"].every((k) => kindsC.has(k)), [...kindsC]);
  ok(`FO-7r S9 pass: with every fact, the closing balance equals Σ (due − extra) of invoiceFacts (CAD ${ledgerC}), owed equals the invoice list's due (CAD ${dueC}), the chain holds`, closingC === ledgerC && cC.owedMinor === dueC && chained(sc.items), { closingC, ledgerC, owed: cC.owedMinor, dueC });
  ok("FO-7r S9 pass (break M1): closing = owed − the CAD 20.00 still waiting for a choice (60.00 − 20.00); kept credit applied elsewhere is never counted twice",
    closingC === cC.owedMinor - cC.waitingMinor && cC.owedMinor === 6000 && cC.waitingMinor === 2000 && closingC === 4000, { closingC, owed: cC.owedMinor, waiting: cC.waitingMinor });
  const withoutKept = sc.items.filter((l: any) => l.account === "INVOICES" && !l.kind.startsWith("KEPT_AS_CREDIT")).reduce((s: number, l: any) => s + l.amountMinor, 0);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S9 fail (break M1): without the kept-as-credit line the balance would be CAD 50.00 lower than owed − waiting (the double count)", withoutKept === closingC - 5000 && withoutKept !== cC.owedMinor - cC.waitingMinor, { withoutKept, closingC });
  ok("FO-7r S9 pass: the summary's paid is money received (trust 350.00 + 150.00 + 70.00), credit applied its own figure (20.00), credit held 30.00 (50.00 kept, 30.00 applied, 10.00 back)",
    cC.paidMinor === 35000 + 15000 + 7000 && cC.creditAppliedMinor === 2000 && cC.creditMinor === 5000 - 3000 + 1000, { paid: cC.paidMinor, applied: cC.creditAppliedMinor, credit: cC.creditMinor });
  ok("FO-7r S9 pass: paid from trust is what trust paid less what came back (600.00 − 200.00 − 50.00 = 350.00), as FACTS_LATERAL counts it", cC.paidFromTrustMinor === 35000 && vC[0]!.paidMinor === 35000, { trust: cC.paidFromTrustMinor, factsPaid: vC[0]!.paidMinor });
  const q422 = await call(tA, "GET", `/front-office/money/parties/person/${PC}/summary?foo=1`);
  ok("FO-7r S9 fail (break m1): the summary refuses a query field it does not take, 422 naming it", q422.status === 422 && JSON.stringify(q422.body).includes("foo"), q422.body);

  // break round 2 m1: payments received on three days before the invoice was issued all count from the issue, and keep
  // the order they were received in (the fact's own time breaks the tie, never the row's random id)
  const PD = person(A, "d"), dInv = await make(10000, PD); await issue(dInv);
  for (const [days, amount] of [[3, 2000], [2, 1000], [1, 500]] as const)
    await call(tA, "POST", `${M}/${dInv}/payments`, { method: "CASH", amountMinor: amount, receivedOn: dayOf(new Date(Date.now() - days * 86_400_000)), idempotencyKey: `fo7r-pre-${days}` });
  const dPays = (await walk(allStmt, PD)).items.filter((l: any) => l.kind === "PAYMENT").map((l: any) => l.amountMinor);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S1 pass: payments received before the issue follow the invoice in the order received (−20.00, −10.00, −5.00)", JSON.stringify(dPays) === JSON.stringify([-2000, -1000, -500]), dPays);
  ok("FO-7r S1 fail: the same three in any other order fail the comparison", JSON.stringify([...dPays].reverse()) !== JSON.stringify([-2000, -1000, -500]));

  // review R3-2: trust lines run by seq but a period cuts them by time. Entry 2 was written in the last second before
  // today (its transaction started then) but took its seq after entry 1 of today: with today as the period, entry 3's
  // running balance still counts entry 2, on any page size
  const PE = person(A, "e"), today0 = `${dayOf(new Date())}T00:00:00Z`;
  for (const [n, amount] of [[1, 10000], [2, 300], [3, 5000]] as const)
    await call(tA, "POST", "/front-office/money/trust/deposits", { personId: PE, method: "E_TRANSFER", amountMinor: amount, currency: "CAD", reference: `ET-E${n}`, idempotencyKey: `fo7r-dep-e${n}` });
  // the times as two transactions racing past midnight would leave them (the rows' own times only; insert-only trigger off for the fixture)
  sql(`set session_replication_role = replica;
    update money_trust_entry set created_at = '${today0}'::timestamptz + interval '1 minute' where person_id = '${PE}' and seq = 1;
    update money_trust_entry set created_at = '${today0}'::timestamptz - interval '1 second' where person_id = '${PE}' and seq = 2;
    update money_trust_entry set created_at = '${today0}'::timestamptz + interval '2 minutes' where person_id = '${PE}' and seq = 3`);
  const eQ = { from: dayOf(new Date()), to: dayOf(new Date()) };
  const eBy = async (pageSize: string) => (await walk(allStmt, PE, { ...eQ, pageSize })).items.map((l: any) => l.balanceAfterMinor);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const e1 = await eBy("1"), e3 = await eBy("3");
  ok("FO-7r S5 pass (review R3-2): today's trust lines show 100.00 then 153.00 (the 3.00 written before midnight, ordered between them, counts) on pages of 1 and of 3", JSON.stringify(e1) === "[10000,15300]" && JSON.stringify(e3) === "[10000,15300]", { e1, e3 });
  ok("FO-7r S5 fail: a running sum of the period's own lines only (150.00) is not the ledger's balance", 10000 + 5000 !== e3.at(-1));

  // ---------------------------------------------------------------------------------------------------- S3
  const yesterday = dayOf(new Date(Date.now() - 86_400_000)), tomorrow = dayOf(new Date(Date.now() + 86_400_000));
  const pToday = await walk(allStmt, PA, { from: today, to: today }), pPast = await walk(allStmt, PA, { from: "2025-01-01", to: yesterday }), pNext = await walk(allStmt, PA, { from: tomorrow });
  const adds = (p: any) => p.accounts.every((a: any) => a.openingMinor + p.items.filter((l: any) => l.account === a.account && l.currency === a.currency).reduce((s: number, l: any) => s + l.amountMinor, 0) === a.closingMinor);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S3 pass: today's period: opening 0 + its lines = closing, which equals the all-time closing", adds(pToday) && pToday.accounts.every((a: any) => a.openingMinor === 0 && a.closingMinor === closing(a.account, a.currency)), pToday.accounts);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  ok("FO-7r S3 pass: an empty period (before anything, or after today) has no lines and opening = closing", pPast.items.length === 0 && pNext.items.length === 0 && adds(pPast) && pNext.accounts.every((a: any) => a.openingMinor === a.closingMinor && a.openingMinor === closing(a.account, a.currency)), pNext.accounts);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const rev = await call(tA, "GET", `/front-office/money/parties/person/${PA}/statement?from=2026-02-01&to=2026-01-01`), badDay = await call(tA, "GET", `/front-office/money/parties/person/${PA}/statement?from=2026-02-30`);
  ok("FO-7r S3 fail: to before from → 422 naming to; a day that does not exist → 422 naming from", rev.status === 422 && JSON.stringify(rev.body).includes('"to"') && badDay.status === 422 && JSON.stringify(badDay.body).includes("from"), { rev: rev.body, badDay: badDay.body });

  // ---------------------------------------------------------------------------------------------------- S6
  const route = await call(tA, "GET", `/front-office/money/parties/person/${PA}/statement`), routeSum = await call(tA, "GET", `/front-office/money/parties/person/${PA}/summary`);
  ok("FO-7r S6 pass: the Owner's routes answer 200 (scoped by CS-MV1's adapter), the same figures as the service", route.status === 200 && routeSum.status === 200
    && route.body.accounts.find((a: any) => a.account === "INVOICES" && a.currency === "CAD")?.closingMinor === ledger("CAD") && routeSum.body.totals.find((t: any) => t.currency === "CAD")?.owedMinor === cad.owedMinor, { route: route.body?.accounts, s: routeSum.status });   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
  const noTok = await call(undefined, "GET", `/front-office/money/parties/person/${PA}/summary`);
  // a Case Officer (user-O) whose role loses agent/invoice:show in this scratch database only, signed in after
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:show'`);
  const noKey = await call(await signIn("user-O", "sample-firm"), "GET", `/front-office/money/parties/person/${PA}/summary`), noKeyS = await call(await signIn("user-O", "sample-firm"), "GET", `/front-office/money/parties/person/${PA}/statement`);
  ok("FO-7r S6 fail: no session → 401; a Case Officer without agent/invoice:show → 403 on both routes", noTok.status === 401 && noKey.status === 403 && noKeyS.status === 403, { noTok: noTok.status, noKey: noKey.status, noKeyS: noKeyS.status });
  const notFound = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() === 404; } };
  ok("FO-7r S6 fail: firm B's client from firm A, an unknown id, a malformed id and a kind other than person or company → 404",
    await notFound(() => inA(() => allStmt.statement(ctxR, "person", PB, {}))) && await notFound(() => inA(() => allSum.summary(ctxR, "person", "0b6a1e9a-1c2d-4e5f-8a9b-0c1d2e3f4a5b")))
    && await notFound(() => inA(() => allSum.summary(ctxR, "person", "nope"))) && await notFound(() => inA(() => allSum.summary(ctxR, "case", PA))) && (await call(tA, "GET", `/front-office/money/parties/person/${PB}/summary`)).status === 404);
  ok("FO-7r S6 fail: an empty scope (fail closed) sees no client: 404", await notFound(() => inA(() => new MoneySummary(db).summary(ctxR, "person", PA))) && await notFound(() => inA(() => new MoneyStatement(db).statement(ctxR, "person", PA, {}))));
  const ownB = await inB(() => allSum.summary(ctxB, "person", PB));
  ok("FO-7r S6 pass: firm B's Owner sees firm B's client, and only firm B's invoice", ownB.totals.length === 1 && ownB.totals[0]!.billedMinor === 55500, ownB.totals);
  // a scope of one case: put inv4 on a case and see only it
  const caseId: string | null = randomUUID();   // a case id (triggers and keys off for the fixture: C5 reads only the id)
  if (caseId) {
    sql(`set session_replication_role = replica; update money_invoice set case_id = '${caseId}' where id = '${inv4}'; update money_trust_entry set case_id = '${caseId}' where invoice_id = '${inv4}'`);
    const caseOnly = { cases: [caseId], parties: [PA] }, cs = await walk(new MoneyStatement(db, async () => caseOnly), PA, { caseId });
    const narrow = { cases: [caseId], parties: [] as string[] };
    const n404 = await notFound(() => inA(() => new MoneyStatement(db, async () => narrow).statement(ctxR, "person", PA, {})));
    ok("FO-7r S6 pass: caseId narrows the statement to that case's invoice; a scope without the client in its party half is 404",
      cs.items.filter((l: any) => l.account === "INVOICES").every((l: any) => l.invoiceId === inv4) && cs.accounts.find((a: any) => a.account === "INVOICES")?.closingMinor === 40000 - 25000 && n404, cs.accounts);   // eslint-disable-line @typescript-eslint/no-explicit-any -- as answered
    const sCase = await inA(() => allSum.summary(ctxR, "person", PA));
    ok("FO-7r S4 pass: per case: the case row holds inv4's figures and its trust movement; the client's totals are unchanged", sCase.cases.some((c) => c.caseId === caseId && c.billedMinor === 40000 && c.owedMinor === 15000 && c.trustMinor === -25000)
      && sCase.totals.find((t) => t.currency === "CAD")!.owedMinor === cad.owedMinor, sCase.cases);
  } else ok("FO-7r S6: no case seeded on sample-firm to scope by", false);

  // ---------------------------------------------------------------------------------------------------- S7
  const small = await walk(allStmt, PA, { pageSize: "2" }), one = await walk(allStmt, PA, { pageSize: "200" });
  ok("FO-7r S7 pass: pages of 2 walk exactly the lines of one page of 200, in the same order", JSON.stringify(small.items) === JSON.stringify(one.items) && one.items.length > 4 && one.next === null, { small: small.items.length, one: one.items.length });
  const big = await call(tA, "GET", `/front-office/money/parties/person/${PA}/statement?pageSize=500`), forged = await call(tA, "GET", `/front-office/money/parties/person/${PA}/statement?after=bm9wZQ`);
  ok("FO-7r S7 fail: pageSize 500 → 422 naming pageSize; a cursor the list did not give → 422 naming after", big.status === 422 && JSON.stringify(big.body).includes("pageSize") && forged.status === 422 && JSON.stringify(forged.body).includes("after"), { big: big.body, forged: forged.body });

  // ---------------------------------------------------------------------------------------------------- S8
  sql(`set session_replication_role = replica;
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${PBULK}', 'BULK-' || g, 'CAD', date '2026-03-01' + (g % 200), now() - (g || ' minutes')::interval, 'seed:FO-7r-bulk', 'seed:FO-7r-bulk', now() from generate_series(1, 10000) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency)
      select '${A}', i.id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice i where i.person_id = '${PBULK}';
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by)
      select '${A}', i.id, 'CASH', 400, 'CAD', 'OPERATING', now(), 'bulk-' || i.id, 'seed:FO-7r-bulk' from money_invoice i where i.person_id = '${PBULK}' and i.number like 'BULK-%5';
    -- break M2's realistic mix on the same client: a credit note and a trust withdrawal on every invoice, 1,000 corrections
    -- of a withdrawal, 100 credit applications (performance rows: written with triggers off)
    insert into money_credit_note (firm_id, invoice_id, number, amount_minor, currency, reason, created_by) select '${A}', i.id, 'BCN-' || i.number, 10, 'CAD', 'Bulk (Sample)', 'seed:FO-7r-bulk' from money_invoice i where i.person_id = '${PBULK}';
    insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PBULK}', 'WITHDRAWAL_TO_INVOICE', -20, 'CAD', row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.person_id = '${PBULK}';
    insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, corrects_entry_id, correction_kind, reason, created_by) select '${A}', '${PBULK}', 'CORRECTION', 20, 'CAD', 20000 + row_number() over (), 0, e.id, 'OTHER', 'Bulk (Sample)', 'seed:FO-7r-bulk' from money_trust_entry e where e.person_id = '${PBULK}' and e.kind = 'WITHDRAWAL_TO_INVOICE' and e.seq <= 1000;
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PBULK}', 'APPLIED', -5, 'CAD', row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.person_id = '${PBULK}' and i.number like 'BULK-%00';
    -- review R3-1: thousands of the client's own credit applications, each reversed in part (a reversal looked up per entry)
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PBULK}', 'APPLIED', -5, 'CAD', 50000 + row_number() over (), 0, i.id, 'seed:FO-7r-bulk-r3' from money_invoice i where i.person_id = '${PBULK}' and substring(i.number from 6)::int % 3 = 1;
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, reverses_entry_id, reason, created_by) select '${A}', '${PBULK}', 'REVERSED', 2, 'CAD', 90000 + row_number() over (), 0, e.id, 'Bulk (Sample)', 'seed:FO-7r-bulk-r3' from money_credit_entry e where e.created_by = 'seed:FO-7r-bulk-r3';
    -- other clients' facts in the same firm (review M1: an OR join cost grew with the firm's credit entries): 3,000 invoices
    -- of another client, each with credit applied and a trust withdrawal (performance rows: written with triggers off)
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${PA2}', 'OTHER-' || g, 'CAD', date '2026-03-01', now(), 'seed:FO-7r-bulk', 'seed:FO-7r-bulk', now() from generate_series(1, 3000) g;
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PA2}', 'APPLIED', -100, 'CAD', 1000 + row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.number like 'OTHER-%';
    insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PA2}', 'WITHDRAWAL_TO_INVOICE', -100, 'CAD', 1000 + row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.number like 'OTHER-%';
    -- break round 2 M1: a large firm: another client with 50,000 invoices, each with a line, a payment, a credit note, credit
    -- applied and a trust withdrawal (performance rows: written with triggers off)
    insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) select '${A}', '${PA2}', 'BIG-' || g, 'CAD', date '2026-03-01', now(), 'seed:FO-7r-bulk', 'seed:FO-7r-bulk', now() from generate_series(1, 50000) g;
    insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) select '${A}', i.id, 1, 'FEE', 'Fee (Sample)', 1, 1000, 1000, 0, 0, 'CAD' from money_invoice i where i.number like 'BIG-%';
    insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by) select '${A}', i.id, 'CASH', 100, 'CAD', 'OPERATING', now(), 'big-' || i.id, 'seed:FO-7r-bulk' from money_invoice i where i.number like 'BIG-%';
    insert into money_credit_note (firm_id, invoice_id, number, amount_minor, currency, reason, created_by) select '${A}', i.id, 'BIGCN-' || i.number, 10, 'CAD', 'Bulk (Sample)', 'seed:FO-7r-bulk' from money_invoice i where i.number like 'BIG-%';
    insert into money_credit_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PA2}', 'APPLIED', -5, 'CAD', 10000 + row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.number like 'BIG-%';
    insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, invoice_id, created_by) select '${A}', '${PA2}', 'WITHDRAWAL_TO_INVOICE', -20, 'CAD', 10000 + row_number() over (), 0, i.id, 'seed:FO-7r-bulk' from money_invoice i where i.number like 'BIG-%';
    analyze`);
  await inA(() => allStmt.statement(ctxR, "person", PBULK, {}));   // warm
  let t0 = performance.now(); const bs = await inA(() => allStmt.statement(ctxR, "person", PBULK, {})); const msS = Math.round(performance.now() - t0);
  t0 = performance.now(); const bsum = await inA(() => allSum.summary(ctxR, "person", PBULK)); const msSum = Math.round(performance.now() - t0);
  await call(tA, "GET", `/front-office/money/parties/person/${PBULK}/statement`);   // warm the route
  t0 = performance.now(); const viaRoute = await call(tA, "GET", `/front-office/money/parties/person/${PBULK}/statement`); const msRoute = Math.round(performance.now() - t0);
  t0 = performance.now(); const sumRoute = await call(tA, "GET", `/front-office/money/parties/person/${PBULK}/summary`); const msSumRoute = Math.round(performance.now() - t0);
  const inv0 = bs.accounts.find((x) => x.account === "INVOICES")!, b0 = bsum.totals[0]!, nR3 = Number(sql(`select count(*) from money_credit_entry where created_by = 'seed:FO-7r-bulk-r3' and kind = 'APPLIED'`));
  const applied = 500 + nR3 * 3;   // 100 × 5.00 cents, then each R3 application of 5 less its reversal of 2
  ok(`FO-7r S8 pass: 10,000 invoices, each with a credit note and a trust withdrawal, plus 1,000 payments, 1,000 corrections, 3,433 credit applications (3,333 of them reversed in part), in a firm holding 53,000 other invoices with their payments, credit and trust rows: page 1 in ${msS} ms (route ${msRoute} ms), the summary in ${msSum} ms (route ${msSumRoute} ms), each within 300 ms`,
    msS < 300 && msSum < 300 && msRoute < 300 && msSumRoute < 300 && viaRoute.status === 200 && sumRoute.status === 200 && bs.items.length === 50 && !!bs.next
    && b0.billedMinor === 10_000_000 && b0.paidMinor === 400_000 + 180_000 && b0.creditedMinor === 100_000 && nR3 > 3000 && b0.creditAppliedMinor === applied && inv0.closingMinor === 10_000_000 - 100_000 - 580_000 - applied && inv0.closingMinor === b0.owedMinor,
    { msS, msSum, msRoute, msSumRoute, closing: bs.accounts, totals: bsum.totals });
  ok("FO-7r S8 fail (AG-6-30's failure case): a request without a page size gets the default, 50, never every line", bs.pageSize === 50 && bs.items.length === 50 && inv0.lines === 10_000 + 1_000 + 10_000 + 10_000 + 1_000 + 100 + 2 * nR3, { pageSize: bs.pageSize, n: bs.items.length, lines: inv0.lines });
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${(e as Error).stack ?? e}`);
} finally {
  await app?.close(); await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* a later prune drops it */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
