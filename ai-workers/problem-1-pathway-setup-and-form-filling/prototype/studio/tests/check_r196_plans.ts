// R1.96 part 2 (design/briefs/R1.96-shape.md; CAPABILITIES R1.96 "instalments sum exactly to the invoice; the ledger stays
// balanced each time"; BACKLOG FO-7p ledger rules, P-574 (5), P-578): payment plans of an issued invoice, through the
// routes and underneath in the database. Each rule a pass and a fail. The routes it pins:
//   POST /api/front-office/money/invoices/:id/plan { instalments: [{ dueDate, amountMinor }] } (agent/invoice:issue) → 201
//        { id, invoiceId, currency, amountMinor, status, settledMinor, instalments: [{ position, dueDate, amountMinor,
//        settledMinor, status }] } · 422 fewer than 2 or more than 12 (Sample), a past or non-rising date · 409 DRAFT,
//        NOTHING_DUE, PLAN_EXISTS, SUM_MISMATCH (with differenceMinor)
//   GET  …/invoices/:id/plan (agent/invoice:show) → 200 the plan · 404 none
//   POST …/invoices/:id/plan/cancel { reason } (agent/invoice:issue) → 200 CANCELLED · 409 NO_PLAN
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices and refunds, FO-7t's
// trust and this part's plans, with the local sign-in stand-in. No network, no model call, no Stripe call (US$0). Sample
// amounts and dates. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_r196_plans.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_r196pl_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
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
  const { ledgerCheck } = await import("../api/src/client-money/ledger-check.ts");
  const { settle } = await import("../api/src/client-money/plans/plan.ts");
  type F = { controllers: unknown[]; providers: unknown[] };
  const feats: F[] = [(await import("../api/src/features/client-money-trust.ts")).default, (await import("../api/src/features/client-money-invoices.ts")).default,
    (await import("../api/src/features/client-money-refunds.ts")).default, (await import("../api/src/features/client-money-plans.ts")).default];
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("r196p-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...feats.flatMap((f) => f.providers)];
  @Module({ controllers: [PlatformIdentityController, ...feats.flatMap((f) => f.controllers)] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}/api/front-office/money`;
  const raw = async (token: string | null, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  const signIn = async (actorId: string, firmKey: string) => {
    const r = await fetch(`${base.replace("/front-office/money", "")}/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) });
    const b = await r.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token;
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'r196.${n}@example.org', 'seed:R1.96', now()) returning id`));
  const PA = person(A, "a"), PC = person(A, "c"), PD = person(A, "d"), PB = person(B, "b");
  // user-R: sample-firm's Owner (every money key); user-O: a Case Officer who reads invoices but holds no agent/invoice:issue.
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:show') on conflict do nothing;
       delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:issue'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, trust_details, updated_by, updated_at) values ('${f}', 'Trust account (Sample)', 'seed:R1.96', now())`);
  const tR = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  await raw(tR, "PUT", "/trust/answer", { answer: "YES" });
  const today = new Date().toISOString().slice(0, 10);
  let k = 0;
  const draft = async (personId: string, unitMinor: number, t = tR) => {
    const d = await raw(t, "POST", "/invoices", { personId, currency: "CAD" }); if (d.status !== 201) throw new Error(`draft: ${JSON.stringify(d.body)}`);
    const l = await raw(t, "POST", `/invoices/${d.body.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 }); if (l.status >= 300) throw new Error(`line: ${JSON.stringify(l.body)}`);
    return d.body.id as string;
  };
  const issued = async (personId: string, unitMinor: number, t = tR) => { const id = await draft(personId, unitMinor, t); const i = await raw(t, "POST", `/invoices/${id}/issue`); if (i.status !== 200) throw new Error(`issue: ${JSON.stringify(i.body)}`); return id; };
  const pay = async (inv: string, amountMinor: number, method = "CHEQUE") => { const r = await raw(tR, "POST", `/invoices/${inv}/payments`, { method, amountMinor, receivedOn: today, reference: `CHQ-${++k}`, idempotencyKey: `r196-pay-${k}` }); if (r.status !== 201) throw new Error(`pay: ${JSON.stringify(r.body)}`); return (r.body.id ?? r.body.paymentId) as string; };
  const plan = (inv: string, instalments: unknown, t: string | null = tR) => raw(t, "POST", `/invoices/${inv}/plan`, { instalments });
  const plans = (inv?: string) => Number(sql(`select count(*) from money_payment_plan${inv ? ` where invoice_id = '${inv}'` : ""}`));
  const insts = () => Number(sql(`select count(*) from money_instalment`));
  const balanced = async (what: string, inv?: string) => { const c = await ledgerCheck(owner, A, inv); ok(`R1.96 ledger balanced after ${what}`, c.balanced, c.problems); };
  const addDays = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const three = (a: number, b: number, c: number) => [{ dueDate: today, amountMinor: a }, { dueDate: addDays(30), amountMinor: b }, { dueDate: addDays(60), amountMinor: c }];

  // ---------------------------------------------------------------------------------- P1: sums exactly (pass and fail)
  const i1 = await issued(PA, 100000), p1first = await pay(i1, 10000, "E_TRANSFER");
  const off = await plan(i1, three(30000, 30000, 29999)), over = await plan(i1, three(30000, 30000, 30001));
  ok("R1.96 P1 fail: instalments 1 cent short of the 900.00 due → 409 SUM_MISMATCH naming 0.01 to add; 1 cent over → names 0.01 to remove; nothing written",
    off.status === 409 && off.body.code === "SUM_MISMATCH" && off.body.differenceMinor === 1 && /add CAD 0\.01/.test(off.body.detail)
      && over.status === 409 && over.body.differenceMinor === -1 && /remove CAD 0\.01/.test(over.body.detail) && plans() === 0 && insts() === 0, [off.body, over.body]);
  const p1 = await plan(i1, three(30000, 30000, 30000));
  ok("R1.96 P1 pass: three instalments of 300.00 summing to the 900.00 due → 201, the plan covers 900.00, nothing settled yet, the first due today",
    p1.status === 201 && p1.body.amountMinor === 90000 && p1.body.status === "ACTIVE" && p1.body.instalments.length === 3 && p1.body.settledMinor === 0
      && p1.body.instalments.map((x: { status: string }) => x.status).join() === "Due,Due,Due" && plans(i1) === 1 && insts() === 3
      && Number(sql(`select count(*) from audit_event where action = 'invoice.plan_created'`)) === 1, p1.body);
  await balanced("a plan", i1);

  // ---------------------------------------------------------------------------------- P2: shape (422)
  const one = await plan(i1, [{ dueDate: today, amountMinor: 90000 }]);
  const many = await plan(i1, Array.from({ length: 13 }, (_, n) => ({ dueDate: addDays(n), amountMinor: n === 0 ? 90000 - 12 : 1 })));
  const back = await plan(i1, [{ dueDate: addDays(30), amountMinor: 45000 }, { dueDate: addDays(30), amountMinor: 45000 }]);
  const past = await plan(i1, [{ dueDate: addDays(-1), amountMinor: 45000 }, { dueDate: addDays(30), amountMinor: 45000 }]);
  const frac = await plan(i1, [{ dueDate: today, amountMinor: 450.5 }, { dueDate: addDays(30), amountMinor: 45000 }]);
  const fake = await plan(i1, [{ dueDate: "2026-02-30", amountMinor: 45000 }, { dueDate: addDays(30), amountMinor: 45000 }]);
  ok("R1.96 P2 fail: 1 instalment, 13 (Sample maximum 12), the same date twice, a past date, a fraction of a cent and 30 February → 422 each; nothing more written",
    [one, many, back, past, frac, fake].every((r) => r.status === 422) && plans() === 1 && insts() === 3, [one, many, back, past, frac, fake].map((r) => r.body.detail ?? r.body));

  // ---------------------------------------------------------------------------------- P3: one plan; draft; nothing due; keys and walls
  const again = await plan(i1, three(30000, 30000, 30000));
  ok("R1.96 P3 fail: a second plan while one is active → 409 PLAN_EXISTS", again.status === 409 && again.body.code === "PLAN_EXISTS" && plans(i1) === 1, again.body);
  const d3 = await draft(PC, 20000), onDraft = await plan(d3, [{ dueDate: today, amountMinor: 10000 }, { dueDate: addDays(30), amountMinor: 10000 }]);
  const i3 = await issued(PC, 20000); await pay(i3, 20000, "E_TRANSFER");
  const paid = await plan(i3, [{ dueDate: today, amountMinor: 10000 }, { dueDate: addDays(30), amountMinor: 10000 }]);
  ok("R1.96 P3 fail: a draft → 409 DRAFT; a paid invoice → 409 NOTHING_DUE", onDraft.status === 409 && onDraft.body.code === "DRAFT" && paid.status === 409 && paid.body.code === "NOTHING_DUE", [onDraft.body, paid.body]);
  const i4 = await issued(PD, 20000), two = [{ dueDate: today, amountMinor: 10000 }, { dueDate: addDays(30), amountMinor: 10000 }];
  const noKey = await plan(i4, two, tO), noSession = await plan(i4, two, null), otherFirm = await plan(i4, two, tS), readOther = await raw(tS, "GET", `/invoices/${i4}/plan`);
  ok("R1.96 P3 fail: a Case Officer without agent/invoice:issue → 403; no session → 401; firm B → 404 to make and to read; nothing written",
    noKey.status === 403 && noSession.status === 401 && otherFirm.status === 404 && readOther.status === 404 && plans(i4) === 0, [noKey.status, noSession.status, otherFirm.body, readOther.status]);
  const both = await Promise.all([plan(i4, two), plan(i4, two)]);
  ok("R1.96 P3 pass: two plans at once on one invoice → one 201 and one 409 PLAN_EXISTS", both.filter((r) => r.status === 201).length === 1 && both.some((r) => r.status === 409 && r.body.code === "PLAN_EXISTS") && plans(i4) === 1, both.map((r) => r.body));

  // ---------------------------------------------------------------------------------- P4: underneath, the database
  const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { const s = String((e as { stderr?: string }).stderr ?? e); if (!re.test(s)) console.log(`      (refused otherwise: ${s.split("\n").find((l) => /ERROR/.test(l))})`); return re.test(s); } };
  const i5 = await issued(PD, 30000);
  ok("R1.96 P4 fail (database): a plan written by SQL whose instalments sum 1 cent short is refused at commit",
    refused(`begin; with p as (insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${i5}', 'CAD', 'seed:R1.96') returning id, firm_id)
      insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) select firm_id, id, n, current_date + n, case when n = 1 then 15000 else 14999 end, 'CAD' from p, generate_series(1, 2) n; commit;`, /add up to 29999 but the plan covers 30000/) && plans(i5) === 0);
  ok("R1.96 P4 pass (database): the same plan summing exactly commits",
    !refused(`begin; with p as (insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${i5}', 'CAD', 'seed:R1.96') returning id, firm_id)
      insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) select firm_id, id, n, current_date + n, 15000, 'CAD' from p, generate_series(1, 2) n; commit;`, /./) && plans(i5) === 1);
  const pid5 = sql(`select id from money_payment_plan where invoice_id = '${i5}'`);
  ok("R1.96 P4 fail (database): an instalment added later, a changed amount, a deleted instalment or plan, and a plan changed other than by cancelling are each refused",
    refused(`insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) values ('${A}', '${pid5}', 3, current_date + 9, 1, 'CAD')`, /written with their plan/)
      && refused(`update money_instalment set amount_minor = 1 where plan_id = '${pid5}'`, /never removed/) && refused(`delete from money_instalment where plan_id = '${pid5}'`, /never removed/)
      && refused(`delete from money_payment_plan where id = '${pid5}'`, /never removed/) && refused(`update money_payment_plan set amount_minor = 1 where id = '${pid5}'`, /only changes once/)
      && refused(`update money_payment_plan set status = 'CANCELLED' where id = '${pid5}'`, /only changes once|cancel_check/));
  ok("R1.96 P4 fail (database): a plan on a draft is refused; the plan written by SQL covers exactly what was due (the database writes its amount)",
    refused(`begin; insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${d3}', 'CAD', 'seed:R1.96'); commit;`, /only for an issued invoice/)
      && sql(`select amount_minor from money_payment_plan where id = '${pid5}'`) === "30000");

  // One failing SQL write per database rule (review M2), each in its own transaction and refused in its own words.
  const planSql = (inv: string, rows: [number, number, number, string?][], cur = "CAD") => `begin; with p as (insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${inv}', '${cur}', 'seed:R1.96') returning id, firm_id)
    insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) select firm_id, id, r.pos, current_date + r.d, r.amt, r.cur::"MoneyCurrency" from p,
    (values ${rows.map(([pos, d, amt, c]) => `(${pos}, ${d}, ${amt}, '${c ?? "CAD"}')`).join(", ")}) as r(pos, d, amt, cur); commit;`;
  const i7 = await issued(PD, 30000), plans7 = () => plans(i7);
  // A deposit invoice (FO-7w1's "On signing" bill, money_invoice.deposit; review round 4): a draft marked deposit is made
  // as the retainer route makes it (written here as a seed row), then issued through the API.
  const iDep = sql(`insert into money_invoice (id, firm_id, person_id, currency, deposit, created_by, updated_at) values (gen_random_uuid(), '${A}', '${PD}', 'CAD', true, 'seed:R1.96', now()) returning id`);
  sql(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, currency) values ('${A}', '${iDep}', 1, 'FEE', 'On signing (Sample)', 1, 20000, 20000, 'CAD')`);
  const depIssued = await raw(tR, "POST", `/invoices/${iDep}/issue`);
  const depPlan = await plan(iDep, [{ dueDate: addDays(1), amountMinor: 10000 }, { dueDate: addDays(2), amountMinor: 10000 }]);
  ok("R1.96 P3 fail (P-567, review round 4): a plan on an issued deposit invoice → 409 DEPOSIT in words; no plan",
    depIssued.status === 200 && depPlan.status === 409 && depPlan.body.code === "DEPOSIT" && /never by a plan/.test(depPlan.body.detail) && plans(iDep) === 0, [depIssued.body, depPlan.body]);
  const dbRules: [string, string, RegExp][] = [
    ["one instalment, summing exactly", planSql(i7, [[1, 1, 30000]]), /2 to 12 instalments/],
    ["positions 1 and 3 (a gap)", planSql(i7, [[1, 1, 15000], [3, 2, 15000]]), /2 to 12 instalments, numbered 1 to n/],
    ["position 13", planSql(i7, [[1, 1, 15000], [13, 2, 15000]]), /money_instalment_position_check/],
    ["two instalments on one date", planSql(i7, [[1, 5, 15000], [2, 5, 15000]]), /due after the one before/],
    ["dates falling", planSql(i7, [[1, 9, 15000], [2, 5, 15000]]), /due after the one before/],
    ["an instalment in USD", planSql(i7, [[1, 1, 15000], [2, 2, 15000, "USD"]]), /in its plan's currency/],
    ["a plan in USD on a CAD invoice", planSql(i7, [[1, 1, 15000, "USD"], [2, 2, 15000, "USD"]], "USD"), /in its invoice's currency/],
    ["an instalment due yesterday", planSql(i7, [[1, -1, 15000], [2, 2, 15000]]), /due today or later/],
    ["a plan on a paid invoice", planSql(i3, [[1, 1, 10000], [2, 2, 10000]]), /nothing is due on this invoice/],
    ["a plan on a deposit invoice (P-567)", planSql(iDep, [[1, 1, 10000], [2, 2, 10000]]), /a deposit invoice is never paid by a plan/],
    ["a second ACTIVE plan (i5 has one)", planSql(i5, [[1, 1, 15000], [2, 2, 15000]]), /money_payment_plan_one_active/],
    ["an instalment for a plan cancelled in the same transaction", `begin; insert into money_payment_plan (firm_id, invoice_id, currency, created_by) values ('${A}', '${i7}', 'CAD', 'seed:R1.96');
      update money_payment_plan set status = 'CANCELLED', cancelled_by = 'seed:R1.96', cancel_reason = 'Test (Sample)' where invoice_id = '${i7}';
      insert into money_instalment (firm_id, plan_id, position, due_date, amount_minor, currency) select '${A}', id, 1, current_date + 1, 30000, 'CAD' from money_payment_plan where invoice_id = '${i7}'; commit;`, /written with their plan/],
  ];
  for (const [what, q, re] of dbRules) ok(`R1.96 P4 fail (database): ${what} → refused in its words; nothing written`, refused(q, re) && plans7() === 0 && plans(i3) === 0 && plans(i5) === 1 && plans(iDep) === 0);
  ok("R1.96 P4 pass (database): the same plan with 2 rising instalments in CAD summing exactly commits", !refused(planSql(i7, [[1, 1, 15000], [2, 2, 15000]]), /./) && plans7() === 1);

  // ---------------------------------------------------------------------------------- P5: settled in order, derived
  await pay(i1, 30000, "E_TRANSFER");
  const r1 = await raw(tR, "GET", `/invoices/${i1}/plan`);
  await pay(i1, 15000, "E_TRANSFER");
  const r2 = await raw(tR, "GET", `/invoices/${i1}/plan`);
  ok("R1.96 P5 pass: 300.00 paid settles instalment 1; 150.00 more part-settles instalment 2; the instalment rows keep only their amounts (no paid column), so settling is derived",
    r1.status === 200 && r1.body.settledMinor === 30000 && r1.body.instalments.map((x: { status: string }) => x.status).join() === "Settled,Due,Due"
      && r2.body.settledMinor === 45000 && r2.body.instalments[1].settledMinor === 15000 && r2.body.instalments[1].status === "Part settled" && insts() >= 3, [r1.body, r2.body]);
  await balanced("payments under a plan", i1);
  const u = settle([{ position: 2, dueDate: "2026-01-02", amountMinor: 100 }, { position: 1, dueDate: "2026-01-01", amountMinor: 100 }], 50, "2026-01-05");
  ok("R1.96 P5 settle(): in position order; a part-settled first and an unpaid past one is Overdue; nothing settled past the amount",
    u.map((x) => `${x.position}:${x.status}:${x.settledMinor}`).join() === "1:Part settled:50,2:Overdue:0" && settle([{ position: 1, dueDate: "2026-01-01", amountMinor: 100 }], 500, "2026-01-01")[0].settledMinor === 100, u);

  // ---------------------------------------------------------------------------------- P6: cancel
  const payments = () => sql(`select count(*) || ':' || coalesce(sum(amount_minor), 0) from money_payment where invoice_id = '${i1}'`), before = payments();
  const noReason = await raw(tR, "POST", `/invoices/${i1}/plan/cancel`, {}), cKey = await raw(tO, "POST", `/invoices/${i1}/plan/cancel`, { reason: "Client asked (Sample)" });
  ok("R1.96 P6 fail: cancel with no reason → 422; without agent/invoice:issue → 403; the plan stays active", noReason.status === 422 && cKey.status === 403 && sql(`select status from money_payment_plan where invoice_id = '${i1}'`) === "ACTIVE", [noReason.body, cKey.status]);
  const c1 = await raw(tR, "POST", `/invoices/${i1}/plan/cancel`, { reason: "Client asked (Sample)" });
  ok("R1.96 P6 pass: cancel → 200 CANCELLED with who and why; every payment on the invoice is as it was",
    c1.status === 200 && c1.body.status === "CANCELLED" && c1.body.cancelReason === "Client asked (Sample)" && /^staff:/.test(c1.body.cancelledBy) && payments() === before, c1.body);
  const c2 = await raw(tR, "POST", `/invoices/${i1}/plan/cancel`, { reason: "Again (Sample)" });
  ok("R1.96 P6 fail: a second cancel → 409 NO_PLAN", c2.status === 409 && c2.body.code === "NO_PLAN", c2.body);
  const due1 = 100000 - 10000 - 30000 - 15000;
  const p6 = await plan(i1, [{ dueDate: addDays(1), amountMinor: due1 - 20000 }, { dueDate: addDays(31), amountMinor: 20000 }]);
  ok("R1.96 P6 pass: after the cancel a new plan covers exactly what is still due (450.00)", p6.status === 201 && p6.body.amountMinor === due1 && plans(i1) === 2, p6.body);
  ok("R1.96 P6 pass (review m5): the cancelled plan's unsettled instalments read Cancelled, its settled one stays Settled, with when it was cancelled; one audit line for the cancel",
    c1.body.instalments.map((x: { status: string }) => x.status).join() === "Settled,Cancelled,Cancelled" && Boolean(c1.body.cancelledAt) && c1.body.uncoveredMinor === 0
      && Number(sql(`select count(*) from audit_event where action = 'invoice.plan_cancelled'`)) === 1, c1.body);
  const ref = await raw(tR, "POST", `/payments/${p1first}/refunds`, { amountMinor: 10000, method: "E_TRANSFER", reason: "Paid before the plan, sent back (Sample)", idempotencyKey: "r196p-ref-1" });
  const after = await raw(tR, "GET", `/invoices/${i1}/plan`);
  ok("R1.96 P6 pass (review m4): a refund of money paid before the plan raises what is due past it; the plan says 100.00 is not covered",
    ref.status === 201 && after.body.dueNowMinor === due1 + 10000 && after.body.uncoveredMinor === 10000 && after.body.status === "ACTIVE", [ref.body, after.body]);
  const odd = await Promise.all(["Small \ud800 balance", "Client\u0000asked", "Two\nlines", "\u200b"].map((reason) => raw(tR, "POST", `/invoices/${i1}/plan/cancel`, { reason })));
  ok("R1.96 P6 fail (review M1): a cancel reason with a broken character, a NUL, a line break or only a hidden character → 422 naming the reason, never a 500; the plan stays active",
    odd.every((r) => r.status === 422 && r.body.fields?.reason) && /One line/.test(String(odd[2].body.detail)) && sql(`select status from money_payment_plan where id = '${p6.body.id}'`) === "ACTIVE", odd.map((r) => [r.status, r.body.detail]));
  // C5 (review M2): an officer holding the keys but seeing no case and no client gets the same 404 on make, read and cancel.
  const i8 = await issued(PD, 20000);
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:issue') on conflict do nothing;
       delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all')`);
  const scoped = [await plan(i8, [{ dueDate: addDays(1), amountMinor: 10000 }, { dueDate: addDays(2), amountMinor: 10000 }], tO), await raw(tO, "GET", `/invoices/${i1}/plan`), await raw(tO, "POST", `/invoices/${i1}/plan/cancel`, { reason: "Out of scope (Sample)" })];
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:issue'`);
  ok("R1.96 P3 fail (C5): an officer with the keys who sees no case and no client → 404 to make, read and cancel; nothing written or changed",
    scoped.every((r) => r.status === 404) && plans(i8) === 0 && sql(`select status from money_payment_plan where id = '${p6.body.id}'`) === "ACTIVE", scoped.map((r) => [r.status, r.body.code]));
  await balanced("a cancel and a new plan", i1);
  await balanced("every write of this check (the whole firm)");
  ok("R1.96: no plan ever reached firm B", Number(sql(`select count(*) from money_payment_plan where firm_id = '${B}'`)) === 0 && PB.length > 0);
} catch (e) {
  ok("R1.96 part 2: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
