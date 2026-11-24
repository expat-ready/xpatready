// FO-7t part 2 (R1.58; design/briefs/FO-7t.md part 2; AG-6-68 rules 1-5, 7-9, AG-6-23 rules 1-4, 9, AG-6-59 rule 6;
// P-603, P-607 (1), P-567 (3), P-584 (10); Code SOR/2022-128 s. 32(f) as FO-7a cites it; legal reading Unconfirmed: no
// counsel): money out of trust — Pay from trust (a withdrawal to an issued invoice, by the route or ticked at issue) and a
// refund to the client — through the routes under /api/front-office/money/trust and FO-7b's issue step.
// The named cases of part 2, each a pass and a fail: DW1 (trust off: the part 2 routes), DW7 (apply), DW8 (apply rules),
// DW9 (refund), DW10 (walls, C5 and audit on the part 2 routes) and DW18 (trust.applied, trust.refunded). Part 1's cases
// stay in check_fo7t_trust.ts, unchanged.
// Written before the build (tests first, red on main). The route contract it pins:
//   POST /trust/applications { invoiceId, amountMinor, unclearedAcknowledged?, pick?: { caseId?, personId?, companyId?, reason } }
//        (agent/invoice:issue) → 201 { entryId, invoiceId, amountMinor, currency, invoice: { number, statusWord, dueMinor } }
//     available = the money the payer (the invoice's party, or the pick's) holds on the money's case (the invoice's case,
//     or the pick's caseId; null = before a case) in the invoice's currency, read under the party's trust lock.
//     Refused (409): a draft (DRAFT), more than available ("Only CAD 169.50 is available.", NOT_AVAILABLE), more than is
//     due (OVER_DUE), uncleared money without the confirm (UNCLEARED, acknowledge: "unclearedAcknowledged"), a database
//     rule (MONEY_RULE, its words). A pick without a reason → 422.
//   POST /trust/refunds { personId | companyId, caseId?, currency, amountMinor, reason, method, reference, refundedOn?,
//        payee?: { personId? | companyId? | name?, reason? } } (agent/refund:create) → 201 { entryId, amountMinor, currency, balanceMinor }
//     The payee is the payer when none is given; another payee needs a reason (422). Never more than the payer holds on
//     that case (409 NOT_AVAILABLE). Offline only (card → 422).
//   POST /invoices/:id/issue?payFromTrustMinor=N[&unclearedAcknowledged=true]: the issue and the withdrawal in one
//     transaction, the withdrawal after the number; a refused withdrawal leaves the invoice a draft.
// Audit lines trust_money.applied and trust_money.refunded, one per change, in its transaction. Field errors 422.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices and FO-7t's trust,
// with the local sign-in stand-in; the mail is the fake. No network, no model call, no Stripe call (US$0). Amounts are
// Sample. Dropped at the end, also when the feature is missing.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_money_out.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7t2_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const fieldError = (status: number) => status === 422;   // PF-28 part 6; Lead 10, 23 Nov

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
const mail = fakeMail();
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
  const trust = (await import("../api/src/features/client-money-trust.ts")).default;
  const invoices = (await import("../api/src/features/client-money-invoices.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7t2-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...trust.providers, ...invoices.providers];
  @Module({ controllers: [PlatformIdentityController, ...trust.controllers, ...invoices.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}/api/front-office/money`;
  const raw = async (token: string, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  const call = (token: string, method: string, path: string, body?: unknown) => raw(token, method, `/trust${path}`, body);
  const signIn = async (actorId: string, firmKey: string) => {
    const r = await fetch(`${base.replace("/front-office/money", "")}/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) });
    const b = await r.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token;
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7t2.${n}@example.org', 'seed:FO-7t-2', now()) returning id`);
  const PA = person(A, "a"), PC = person(A, "c"), PD = person(A, "d"), PB = person(B, "b");
  // user-R: sample-firm's Owner (every money key); user-T: a Case Manager, given agent/payment:record here but holding
  // neither agent/refund:create nor agent/invoice:issue (BR-11: a clerk takes money but does not return it); user-O: a
  // Case Officer given agent/invoice:issue and agent/refund:create here but seeing no case and no client (C5's fail
  // closed); user-S: sample-solo's Owner.
  const tR = await signIn("user-R", "sample-firm"), tT = await signIn("user-T", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  const W = "00000000-0000-4000-8000-0000000f27a0", CLIENT_A = "00000000-0000-4000-8000-0000000f27a1", CLIENT_C = "00000000-0000-4000-8000-0000000f27a2", CLIENT_B = "00000000-0000-4000-8000-0000000f27a3";
  const CASE = "00000000-0000-4000-8000-0000000f27b1", CASE2 = "00000000-0000-4000-8000-0000000f27b2", CASE_C = "00000000-0000-4000-8000-0000000f27b3", CASE_B = "00000000-0000-4000-8000-0000000f27b4";
  sql(`set session_replication_role = replica;
    insert into workspace (id, key, label) values ('${W}', 'fo7t2-check', 'FO-7t part 2 (Sample)');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values
      ('${CLIENT_A}', '${W}', 'sample-firm', '${A}', 1, 'Client a (Sample)', 'PERSON', '${PA}', 'seed:FO-7t-2'),
      ('${CLIENT_C}', '${W}', 'sample-firm', '${A}', 2, 'Client c (Sample)', 'PERSON', '${PC}', 'seed:FO-7t-2'),
      ('${CLIENT_B}', '${W}', 'sample-solo', '${B}', 1, 'Client b (Sample)', 'PERSON', '${PB}', 'seed:FO-7t-2');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values
      ('${CASE}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07201', 'sample-firm', '${A}', '${CLIENT_A}', 'OPEN'),
      ('${CASE2}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07202', 'sample-firm', '${A}', '${CLIENT_A}', 'OPEN'),
      ('${CASE_C}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07203', 'sample-firm', '${A}', '${CLIENT_C}', 'OPEN'),
      ('${CASE_B}', '${W}', gen_random_uuid(), 'user-P', 'user-S', 'C-2026-07201', 'sample-solo', '${B}', '${CLIENT_B}', 'OPEN');
    insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values
      (gen_random_uuid(), '${A}', 'P-07201', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PA}', '${PA}', '${staffR}', 'seed:FO-7t-2', now()),
      (gen_random_uuid(), '${A}', 'P-07202', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PC}', '${PC}', '${staffR}', 'seed:FO-7t-2', now()),
      (gen_random_uuid(), '${A}', 'P-07203', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PD}', '${PD}', '${staffR}', 'seed:FO-7t-2', now());
    delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all');
    insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:issue'), ('CASE_OFFICER', 'agent/refund:create'), ('CASE_MANAGER', 'agent/payment:record')
      on conflict do nothing`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, trust_details, updated_by, updated_at) values ('${f}', 'Trust account (Sample)', 'seed:FO-7t-2', now())`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const events = (type: string) => Number(sql(`select count(*) from module_event where type = '${type}'`));
  const entries = (where = "true") => Number(sql(`select count(*) from money_trust_entry where ${where}`));
  const caseBalance = (party: string, caseId: string | null) => Number(sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where coalesce(person_id, company_id) = '${party}' and case_id ${caseId ? `= '${caseId}'` : "is null"}`));
  let k = 0;
  const deposit = async (personId: string, caseId: string | null, amountMinor: number, method = "E_TRANSFER", t = tR) => {
    const r = await call(t, "POST", "/deposits", { personId, ...(caseId ? { caseId } : {}), method, amountMinor, currency: "CAD", idempotencyKey: `fo7t2-dep-${++k}` });
    if (r.status !== 201) throw new Error(`deposit: ${JSON.stringify(r.body)}`); return r.body;
  };
  /** A draft of one untaxed fee line on the party and case (the case set as "Bill this" sets it), optionally issued. */
  const draft = async (personId: string, caseId: string | null, unitMinor: number) => {
    const d = await raw(tR, "POST", "/invoices", { personId, currency: "CAD" }); if (d.status !== 201) throw new Error(`draft: ${JSON.stringify(d.body)}`);
    const l = await raw(tR, "POST", `/invoices/${d.body.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 }); if (l.status >= 300) throw new Error(`line: ${JSON.stringify(l.body)}`);
    if (caseId) sql(`set session_replication_role = replica; update money_invoice set case_id = '${caseId}' where id = '${d.body.id}'`);
    return d.body.id as string;
  };
  const issue = (id: string, query = "") => raw(tR, "POST", `/invoices/${id}/issue${query}`);
  const issued = async (personId: string, caseId: string | null, unitMinor: number) => { const id = await draft(personId, caseId, unitMinor), r = await issue(id); if (r.status !== 200) throw new Error(`issue: ${JSON.stringify(r.body)}`); return id; };
  const apply = (body: Record<string, unknown>, t = tR) => call(t, "POST", "/applications", body);
  const refund = (body: Record<string, unknown>, t = tR) => call(t, "POST", "/refunds", { currency: "CAD", method: "E_TRANSFER", reference: "ET-88213", reason: "Matter closed (Sample)", ...body });

  // ------------------------------------------------------------------------------------- DW1: trust off (part 2 routes)
  const NIL = "00000000-0000-4000-8000-000000000001";
  const offB = await Promise.all([apply({ invoiceId: NIL, amountMinor: 100 }, tS), refund({ personId: PB, amountMinor: 100 }, tS)]);
  ok("FO-7t DW1 fail: firm B UNANSWERED with nothing held: Pay from trust and a refund answer 404 (no trust route answers), nothing written",
    offB.every((r) => r.status === 404) && entries() === 0, offB.map((r) => [r.status, r.body]));
  const bDraft = await raw(tS, "POST", "/invoices", { personId: PB, currency: "CAD" });
  await raw(tS, "POST", `/invoices/${bDraft.body.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor: 1000, ratePpm: 0 });
  const offTick = await raw(tS, "POST", `/invoices/${bDraft.body.id}/issue?payFromTrustMinor=100`);
  ok("FO-7t DW1 fail (break m3): trust unanswered, \"Pay from trust now\" ticked at issue → 409 TRUST_OFF saying the invoice was not issued; still a draft",
    offTick.status === 409 && offTick.body.code === "TRUST_OFF" && /The invoice was not issued\./.test(offTick.body.detail ?? "") && sql(`select issued_at is null from money_invoice where id = '${bDraft.body.id}'`) === "t", offTick.body);
  await call(tR, "PUT", "/answer", { answer: "YES" }); await call(tS, "PUT", "/answer", { answer: "YES" });
  const onB = await apply({ invoiceId: NIL, amountMinor: 100 }, tS);
  ok("FO-7t DW1 pass (the same route, trust on): with YES Pay from trust on an unknown invoice is 404 for the invoice (problem names the invoice), not a missing route",
    onB.status === 404 && /invoice/i.test(JSON.stringify(onB.body)), onB);

  // ------------------------------------------------------------------------------------------------ DW7: apply
  const dep1 = await deposit(PA, CASE, 113000);
  const draft1 = await draft(PA, CASE, 96050);
  const onDraft = await apply({ invoiceId: draft1, amountMinor: 1000 });
  ok("FO-7t DW7 fail (Code s. 32(f)): Pay from trust on a draft → 409 DRAFT, nothing written", onDraft.status === 409 && onDraft.body.code === "DRAFT" && entries("kind = 'WITHDRAWAL_TO_INVOICE'") === 0, onDraft.body);
  const keyless = await apply({ invoiceId: draft1, amountMinor: 1000 }, tT);
  ok("FO-7t DW7 fail (keys, AG-6-68 §8): a Case Manager (no agent/invoice:issue) → 403", keyless.status === 403, keyless.body);
  ok("FO-7t DW7 setup: the invoice issues with its number", (await issue(draft1)).status === 200);
  const overDue = await apply({ invoiceId: draft1, amountMinor: 100000 });
  ok("FO-7t DW7 fail: more than the balance due (CAD 1,000.00 of 960.50 due, 1,130.00 held) → 409 OVER_DUE naming 960.50, nothing written",
    overDue.status === 409 && overDue.body.code === "OVER_DUE" && /960\.50/.test(overDue.body.detail ?? "") && entries("kind = 'WITHDRAWAL_TO_INVOICE'") === 0, overDue.body);
  const a1 = await apply({ invoiceId: draft1, amountMinor: 96050 });
  ok("FO-7t DW7 pass (AG-6-68 test 1): CAD 960.50 from CAD 1,130.00 → 201, one WITHDRAWAL_TO_INVOICE on the case, the invoice Paid, 169.50 left on the case",
    a1.status === 201 && a1.body.invoice?.statusWord === "Paid" && a1.body.invoice?.dueMinor === 0 && a1.body.amountMinor === 96050 && caseBalance(PA, CASE) === 16950
    && sql(`select count(*) || ':' || min(amount_minor) || ':' || min(case_id::text) from money_trust_entry where kind = 'WITHDRAWAL_TO_INVOICE' and invoice_id = '${draft1}'`) === `1:-96050:${CASE}`, [a1.body, caseBalance(PA, CASE)]);
  const inv2 = await issued(PA, CASE, 50000);
  const short = await apply({ invoiceId: inv2, amountMinor: 20000 });
  ok("FO-7t DW7 fail (AG-6-68 rule 8): more than available → 409 \"Only CAD 169.50 is available.\", nothing written",
    short.status === 409 && short.body.code === "NOT_AVAILABLE" && (short.body.detail ?? "").includes("Only CAD 169.50 is available.") && entries(`invoice_id = '${inv2}'`) === 0, short.body);
  // Two connections at once (AG-6-68 test 3): CAD 1,000.00 each from CAD 1,130.00 on Client c's case.
  await deposit(PC, CASE_C, 113000);
  const [r1, r2] = [await issued(PC, CASE_C, 100000), await issued(PC, CASE_C, 100000)];
  const race = await Promise.all([apply({ invoiceId: r1, amountMinor: 100000 }), apply({ invoiceId: r2, amountMinor: 100000 })]);
  const won = race.filter((r) => r.status === 201), lost = race.filter((r) => r.status === 409);
  ok("FO-7t DW7 pass (AG-6-68 rule 7): two applications of CAD 1,000.00 at once from CAD 1,130.00 → one 201, the other 409 \"Only CAD 130.00 is available.\"; the case holds 130.00, never below zero",
    won.length === 1 && lost.length === 1 && (lost[0].body.detail ?? "").includes("Only CAD 130.00 is available.") && caseBalance(PC, CASE_C) === 13000
    && sql(`select count(*) from money_trust_entry where balance_after_minor < 0`) === "0", race.map((r) => [r.status, r.body.detail]));
  // Review and break M1: a double click on Pay from trust (the same amount from the same payer on one invoice, at once).
  const invC = await issued(PC, CASE_C, 20000);
  const twice = await Promise.all([apply({ invoiceId: invC, amountMinor: 3000 }), apply({ invoiceId: invC, amountMinor: 3000 })]);
  const firstC = twice.find((r) => r.status === 201)?.body.entryId, askedC = twice.find((r) => r.status === 409)?.body;
  ok("FO-7t DW7 fail (M1, double click): the same Pay from trust twice at once → one 201, the other 409 DUPLICATE asking \"Pay it again?\", naming the entry it duplicates; one withdrawal",
    twice.filter((r) => r.status === 201).length === 1 && askedC?.code === "DUPLICATE" && askedC?.acknowledge === "duplicateOf" && askedC?.duplicateOf === firstC && entries(`invoice_id = '${invC}'`) === 1, twice.map((r) => [r.status, r.body.code, r.body.duplicateOf]));
  // Round 3 (Lead 25's ruling after Lead B 6's read): a confirm names the duplicate it saw; a blind flag no longer works,
  // and of two confirms at once only one is written (the second sees the first's entry, under the same lock).
  const blindC = await apply({ invoiceId: invC, amountMinor: 3000, duplicateAcknowledged: true });
  ok("FO-7t DW7 fail (round 3): a blind confirm (duplicateAcknowledged: true) → 422 (unknown field), nothing written", fieldError(blindC.status) && entries(`invoice_id = '${invC}'`) === 1, blindC.body);
  const confirmsC = await Promise.all([apply({ invoiceId: invC, amountMinor: 3000, duplicateOf: firstC }), apply({ invoiceId: invC, amountMinor: 3000, duplicateOf: firstC })]);
  const secondC = confirmsC.find((r) => r.status === 201)?.body.entryId;
  ok("FO-7t DW7 fail (round 3): two confirms of the same duplicate at once → one 201, the other 409 DUPLICATE naming the newer entry; two withdrawals in all, never three",
    confirmsC.filter((r) => r.status === 201).length === 1 && confirmsC.some((r) => r.status === 409 && r.body.code === "DUPLICATE" && r.body.duplicateOf === secondC) && entries(`invoice_id = '${invC}'`) === 2, confirmsC.map((r) => [r.status, r.body.code]));
  const staleC = await apply({ invoiceId: invC, amountMinor: 3000, duplicateOf: firstC }), otherC = await apply({ invoiceId: invC, amountMinor: 3000, duplicateOf: "00000000-0000-4000-8000-0000000000aa" });
  ok("FO-7t DW7 fail (round 3): the same confirm again (a retry), or an id that is not the newest match → 409 DUPLICATE naming the newest; nothing written",
    staleC.status === 409 && staleC.body.duplicateOf === secondC && otherC.status === 409 && otherC.body.duplicateOf === secondC && entries(`invoice_id = '${invC}'`) === 2, [staleC.body, otherC.body]);
  const thirdC = await apply({ invoiceId: invC, amountMinor: 3000, duplicateOf: secondC });
  ok("FO-7t DW7 pass (round 3): a confirm naming the newest match → written (201); the case holds 40.00", thirdC.status === 201 && entries(`invoice_id = '${invC}'`) === 3 && caseBalance(PC, CASE_C) === 4000, thirdC.body);

  // ------------------------------------------------------------------------------------------ DW8: apply rules
  await deposit(PA, CASE2, 50000);
  const noPick = await apply({ invoiceId: inv2, amountMinor: 30000 });
  ok("FO-7t DW8 fail (AG-6-68 rule 4): CAD 300.00 for a case invoice whose case holds 169.50, while another case of the same payer holds 500.00, without the pick → 409 \"Only CAD 169.50 is available.\"",
    noPick.status === 409 && (noPick.body.detail ?? "").includes("Only CAD 169.50 is available.") && entries(`invoice_id = '${inv2}'`) === 0, noPick.body);
  const pickNoReason = await apply({ invoiceId: inv2, amountMinor: 30000, pick: { caseId: CASE2 } });
  ok("FO-7t DW8 fail: a pick without a reason → a field error (422), nothing written", fieldError(pickNoReason.status) && entries(`invoice_id = '${inv2}'`) === 0, pickNoReason.body);
  const pickZw = await apply({ invoiceId: inv2, amountMinor: 30000, pick: { caseId: CASE2, reason: "\u200b" } });
  ok("FO-7t DW8 fail (review m2): a pick whose reason has no visible character (a zero-width space) → 422, nothing written", fieldError(pickZw.status) && entries(`invoice_id = '${inv2}'`) === 0, pickZw.body);
  const picked = await apply({ invoiceId: inv2, amountMinor: 30000, pick: { caseId: CASE2, reason: "Client a asked to use the PR file's deposit (Sample)" } });
  ok("FO-7t DW8 pass: the deliberate pick of another case of the same payer → 201; the entry is on CASE2, recorded with who (the writer), when and why; the audit line names the pick",
    picked.status === 201 && sql(`select case_id || ':' || picked_other_funds_by || ':' || (picked_other_funds_at is not null) || ':' || picked_other_funds_reason from money_trust_entry where invoice_id = '${inv2}'`)
      === `${CASE2}:staff:${staffR}:true:Client a asked to use the PR file's deposit (Sample)` && caseBalance(PA, CASE2) === 20000
    && sql(`select count(*) from audit_event where action = 'trust_money.applied' and entity_key = '${picked.body.entryId}' and detail::text like '%${CASE2}%'`) === "1", [picked.body]);
  const otherPayer = await apply({ invoiceId: inv2, amountMinor: 1000, pick: { personId: PC, caseId: CASE_C, reason: "Sample" } });
  ok("FO-7t DW8 fail: another payer's money from another case → 409 with the database's words (a pick never crosses cases or clients), nothing written",
    otherPayer.status === 409 && otherPayer.body.code === "MONEY_RULE" && /same case/.test(otherPayer.body.detail ?? "") && caseBalance(PC, CASE_C) === 4000, otherPayer.body);
  await deposit(PA, CASE, 40000, "CHEQUE");   // CASE: 169.50 cleared + 400.00 cheque not yet cleared
  const inv3 = await issued(PA, CASE, 30000);
  // Money is spent cleared first: the 169.50 cleared pays without a confirm; after it, what is left on CASE is the cheque.
  const cleared = await apply({ invoiceId: inv2, amountMinor: 16950 });
  ok("FO-7t DW8 pass: an amount within the cleared money needs no confirm (169.50 of 169.50 cleared) → 201", cleared.status === 201 && caseBalance(PA, CASE) === 40000, [cleared.body, caseBalance(PA, CASE)]);
  const uncleared = await apply({ invoiceId: inv3, amountMinor: 30000 });
  ok("FO-7t DW8 fail (AG-6-68 rule 5): money that is a cheque not yet cleared → 409 UNCLEARED asking \"Apply anyway?\" (acknowledge unclearedAcknowledged), nothing written",
    uncleared.status === 409 && uncleared.body.code === "UNCLEARED" && uncleared.body.acknowledge === "unclearedAcknowledged" && /not yet cleared\. Apply anyway\?/.test(uncleared.body.detail ?? "") && entries(`invoice_id = '${inv3}'`) === 0, uncleared.body);
  const confirmed = await apply({ invoiceId: inv3, amountMinor: 30000, unclearedAcknowledged: true });
  ok("FO-7t DW8 pass: confirmed → 201, 100.00 left on the case", confirmed.status === 201 && caseBalance(PA, CASE) === 10000, [confirmed.body, caseBalance(PA, CASE)]);
  // At issue (FO-7s3b's Q5): ticked, unticked, and a refused withdrawal that rolls the issue back.
  const t1 = await draft(PA, CASE, 10000), ticked = await issue(t1, "?payFromTrustMinor=10000&unclearedAcknowledged=true");
  ok("FO-7t DW8 pass (at issue, ticked): the invoice issued and paid from trust in the same step: a number, one withdrawal of 100.00 written in the issue's own transaction (the same xmin), Paid",
    ticked.status === 200 && /^INV-/.test(ticked.body.invoice?.number ?? "") && ticked.body.invoice?.statusWord === "Paid"
    && sql(`select count(*) || ':' || min(e.amount_minor) || ':' || bool_and(e.xmin::text = i.xmin::text) from money_trust_entry e join money_invoice i on i.id = e.invoice_id where e.invoice_id = '${t1}'`) === "1:-10000:true", [ticked.body.invoice?.statusWord, sql(`select count(*) || ':' || min(e.amount_minor) || ':' || bool_and(e.xmin::text = i.xmin::text) from money_trust_entry e join money_invoice i on i.id = e.invoice_id where e.invoice_id = '${t1}'`)]);
  const t2 = await draft(PA, CASE, 10000), plain = await issue(t2);
  ok("FO-7t DW8 pass (at issue, unticked): issued, nothing applied", plain.status === 200 && plain.body.invoice?.status === "ISSUED" && entries(`invoice_id = '${t2}'`) === 0, plain.body);
  const t3 = await draft(PA, CASE, 900000), before3 = audits("invoice.issued"), refused = await issue(t3, "?payFromTrustMinor=900000&unclearedAcknowledged=true");
  ok("FO-7t DW8 fail (at issue): a withdrawal past what is available → 409 \"Only CAD …\", and the issue rolls back: still a draft, no number, no invoice.issued audit line",
    refused.status === 409 && /Only CAD [\d,.]+ is available\./.test(refused.body.detail ?? "") && sql(`select (issued_at is null) || ':' || (number is null) from money_invoice where id = '${t3}'`) === "true:true" && audits("invoice.issued") === before3, refused.body);
  const badTick = await issue(t3, "?payFromTrustMinor=abc");
  ok("FO-7t DW8 fail (at issue): an amount that is not a whole number of cents → 422, still a draft", fieldError(badTick.status) && sql(`select issued_at is null from money_invoice where id = '${t3}'`) === "t", badTick.body);

  // ----------------------------------------------------------------------------------------------- DW9: refund
  await deposit(PD, null, 60000);
  const clerk = await refund({ personId: PD, amountMinor: 60000 }, tT);
  ok("FO-7t DW9 fail (AG-6-23 rule 9): a person with agent/payment:record and not agent/refund:create → 403, nothing written", clerk.status === 403 && entries("kind = 'REFUND_TO_CLIENT'") === 0, clerk.body);
  const missing = await Promise.all(["reason", "method", "reference"].map((f) => call(tR, "POST", "/refunds", Object.fromEntries(Object.entries({ personId: PD, currency: "CAD", amountMinor: 100, method: "E_TRANSFER", reference: "ET-1", reason: "Sample" }).filter(([x]) => x !== f)))));
  const byCard = await refund({ personId: PD, amountMinor: 100, method: "CARD" });
  ok("FO-7t DW9 fail (AG-6-23 rules 2, 4): no reason, no method or no reference → 422 each; a card method → 422 (offline only, P-567 (3)); nothing written",
    missing.every((r) => fieldError(r.status)) && fieldError(byCard.status) && entries("kind = 'REFUND_TO_CLIENT'") === 0, [...missing, byCard].map((r) => r.status));
  const payeeNoReason = await refund({ personId: PD, amountMinor: 100, payee: { personId: PC } });
  ok("FO-7t DW9 fail (AG-6-23 rule 3): another payee without a reason → 422, nothing written", fieldError(payeeNoReason.status) && entries("kind = 'REFUND_TO_CLIENT'") === 0, payeeNoReason.body);
  const tooMuch = await refund({ personId: PD, amountMinor: 60001 });
  ok("FO-7t DW9 fail (AG-6-23 rule 4): more than the payer holds (600.01 of 600.00) → 409 \"Only CAD 600.00 is available.\", nothing written",
    tooMuch.status === 409 && (tooMuch.body.detail ?? "").includes("Only CAD 600.00 is available.") && entries("kind = 'REFUND_TO_CLIENT'") === 0, tooMuch.body);
  const payeeOnlyReason = await refund({ personId: PD, amountMinor: 100, payee: { reason: "Sample" } }), payeeSelf = await refund({ personId: PD, amountMinor: 100, payee: { personId: PD, reason: "Sample" } });
  ok("FO-7t DW9 fail (break m1): a payee given only a reason, or the payer named as payee with a reason → 422 each (a reason is never dropped silently), nothing written",
    fieldError(payeeOnlyReason.status) && fieldError(payeeSelf.status) && entries("kind = 'REFUND_TO_CLIENT'") === 0, [payeeOnlyReason.body, payeeSelf.body]);
  const dayAt = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const ahead = await refund({ personId: PD, amountMinor: 100, refundedOn: dayAt(2) });
  // Break m2: PA's CASE money is made 100 days old; CASE2's came in today. The database checks the party's first money
  // (any case) and would take a refund from CASE2 dated 50 days ago; the route checks the case's.
  sql(`set session_replication_role = replica; update money_trust_entry set created_at = created_at - interval '100 days' where case_id = '${CASE}'`);
  const early = await refund({ personId: PA, caseId: CASE2, amountMinor: 100, refundedOn: dayAt(-50) });
  ok("FO-7t DW9 fail (review m2, break m2): a refund dated in the future, or dated before that case's money came into trust → 422 each, nothing written",
    fieldError(ahead.status) && fieldError(early.status) && entries("kind = 'REFUND_TO_CLIENT'") === 0, [ahead.body, early.body]);
  const toOther = await refund({ personId: PD, amountMinor: 10000, reference: "ET-0001", payee: { personId: PC, reason: "Client d asked for the money to go to Client c (Sample)" } });
  ok("FO-7t DW9 pass: another payee with a reason → 201, the payee and its reason stored", toOther.status === 201
    && sql(`select payee_person_id || ':' || payee_reason from money_trust_entry where id = '${toOther.body.entryId}'`) === `${PC}:Client d asked for the money to go to Client c (Sample)`, toOther.body);
  // Review and break M1: a trust refund can't be corrected (P-603), so a double click must not write two.
  const dbl = await Promise.all([refund({ personId: PD, amountMinor: 20000, reference: "ET-555" }), refund({ personId: PD, amountMinor: 20000, reference: "ET-555" })]);
  const firstR = dbl.find((r) => r.status === 201)?.body.entryId, askedR = dbl.find((r) => r.status === 409)?.body;
  ok("FO-7t DW9 fail (M1, double click): the same refund twice at once → one 201, the other 409 DUPLICATE_REFERENCE asking \"Record anyway?\", naming the refund it duplicates; one refund written",
    dbl.filter((r) => r.status === 201).length === 1 && askedR?.code === "DUPLICATE_REFERENCE" && askedR?.acknowledge === "duplicateOf" && askedR?.duplicateOf === firstR
    && entries("kind = 'REFUND_TO_CLIENT' and refund_reference = 'ET-555'") === 1, dbl.map((r) => [r.status, r.body.code, r.body.duplicateOf]));
  // Round 3 (Lead 25's ruling): a trust refund can't be corrected (P-603), so a confirm names what it confirms.
  const blindR = await refund({ personId: PD, amountMinor: 5000, reference: "ET-555", duplicateReferenceAcknowledged: true });
  ok("FO-7t DW9 fail (round 3): a blind confirm (duplicateReferenceAcknowledged: true) → 422 (unknown field), nothing written", fieldError(blindR.status) && entries("kind = 'REFUND_TO_CLIENT' and refund_reference = 'ET-555'") === 1, blindR.body);
  const confirmsR = await Promise.all([refund({ personId: PD, amountMinor: 5000, reference: " et-555 ", duplicateOf: firstR }), refund({ personId: PD, amountMinor: 5000, reference: " et-555 ", duplicateOf: firstR })]);
  const secondR = confirmsR.find((r) => r.status === 201)?.body.entryId;
  ok("FO-7t DW9 fail (round 3): two confirms of the same duplicate at once (any case and spacing) → one refund written, the other 409 DUPLICATE_REFERENCE naming it",
    confirmsR.filter((r) => r.status === 201).length === 1 && confirmsR.some((r) => r.status === 409 && r.body.code === "DUPLICATE_REFERENCE" && r.body.duplicateOf === secondR) && entries("kind = 'REFUND_TO_CLIENT' and refund_reference ilike '%et-555%'") === 2, confirmsR.map((r) => [r.status, r.body.code]));
  const staleR = await refund({ personId: PD, amountMinor: 5000, reference: "ET-555", duplicateOf: firstR }), otherR = await refund({ personId: PD, amountMinor: 5000, reference: "ET-555", duplicateOf: toOther.body.entryId });
  ok("FO-7t DW9 fail (round 3): the same confirm again (a retry after a lost answer), or an id that is not the newest match → 409 naming the newest; nothing written",
    staleR.status === 409 && staleR.body.duplicateOf === secondR && otherR.status === 409 && otherR.body.duplicateOf === secondR && entries("kind = 'REFUND_TO_CLIENT' and refund_reference ilike '%et-555%'") === 2, [staleR.body, otherR.body]);
  const thirdR = await refund({ personId: PD, amountMinor: 5000, reference: "ET-555", duplicateOf: secondR });
  ok("FO-7t DW9 pass (round 3): a confirm naming the newest match → recorded (201)", thirdR.status === 201 && entries("kind = 'REFUND_TO_CLIENT' and refund_reference ilike '%et-555%'") === 3, thirdR.body);
  const rest = await refund({ personId: PD, amountMinor: 20000 });
  ok("FO-7t DW9 pass (AG-6-23 test 1): refunding the rest to the payer (no payee given) → 201, a REFUND_TO_CLIENT with method, date, reference and reason, payee empty (the payer), the balance 0",
    rest.status === 201 && rest.body.balanceMinor === 0 && caseBalance(PD, null) === 0
    && sql(`select kind || ':' || amount_minor || ':' || refund_method || ':' || (refunded_on is not null) || ':' || refund_reference || ':' || reason || ':' || (payee_person_id is null) from money_trust_entry where id = '${rest.body.entryId}'`)
      === "REFUND_TO_CLIENT:-20000:E_TRANSFER:true:ET-88213:Matter closed (Sample):true", rest.body);

  // ------------------------------------------------------------------------------------- DW10: walls, C5, audit
  const unseen = await Promise.all([apply({ invoiceId: inv3, amountMinor: 1 }, tO), refund({ personId: PA, caseId: CASE, amountMinor: 1 }, tO), refund({ personId: PA, amountMinor: 1 }, tO)]);
  ok("FO-7t DW10 fail (C5): a Case Officer holding the keys but seeing neither the case nor the client → 404 on Pay from trust and on a refund (case and no case), nothing written",
    unseen.every((r) => r.status === 404) && entries(`created_by = 'staff:' || (select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}')`) === 0, unseen.map((r) => r.status));
  await deposit(PB, CASE_B, 5000, "E_TRANSFER", tS);
  const crossFirm = await Promise.all([apply({ invoiceId: inv3, amountMinor: 1 }, tS), refund({ personId: PA, caseId: CASE, amountMinor: 1 }, tS), refund({ personId: PB, caseId: CASE, amountMinor: 1 }, tS)]);
  ok("FO-7t DW10 fail (walls): firm B on firm A's invoice, client or case → 404, nothing written for firm A by firm B",
    crossFirm.every((r) => r.status === 404) && entries(`firm_id = '${A}' and created_by like 'staff:%' and created_by not in (select 'staff:' || id from platform_staff where firm_id = '${A}')`) === 0, crossFirm.map((r) => r.status));
  // Review M2 (C5 on the pick): user-O is put on CASE's team, so sees CASE (and its client), never CASE2 or CASE_C.
  sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values (gen_random_uuid(), '${W}', '${CASE}', 'user-O', 'OFFICER', 'user-R')`);
  const invP = await issued(PA, CASE, 1000);
  const oPlain = await apply({ invoiceId: invP, amountMinor: 1000 }, tO);
  const oPicks = await Promise.all([apply({ invoiceId: invP, amountMinor: 100, pick: { caseId: CASE2, reason: "Sample" } }, tO), apply({ invoiceId: invP, amountMinor: 100, pick: { personId: PC, caseId: CASE_C, reason: "Sample" } }, tO)]);
  ok("FO-7t DW10 pass (C5): the on-team officer sees CASE's invoice: Pay from trust answers about the money (409 NOT_AVAILABLE: CASE holds 0.00), not 404", oPlain.status === 409 && oPlain.body.code === "NOT_AVAILABLE", oPlain.body);
  ok("FO-7t DW10 fail (review M2): the same officer picking money of a case it cannot see (CASE2 of the same payer; another payer's CASE_C) → 404 each, nothing written",
    oPicks.every((r) => r.status === 404) && entries(`invoice_id = '${invP}'`) === 0 && caseBalance(PA, CASE2) === 20000, oPicks.map((r) => [r.status, r.body.code]));
  const applied = entries("kind = 'WITHDRAWAL_TO_INVOICE'"), refunded = entries("kind = 'REFUND_TO_CLIENT'");
  ok("FO-7t DW10 pass (audit): one trust_money.applied line per withdrawal written by the routes and at issue, one trust_money.refunded per refund; every refusal above wrote none",
    applied === 9 && audits("trust_money.applied") === applied && refunded === 5 && audits("trust_money.refunded") === refunded, { applied, refunded, a: audits("trust_money.applied"), r: audits("trust_money.refunded") });

  // ----------------------------------------------------------------------------------------- DW18: the events
  const payloadKeys = sql(`select string_agg(distinct k, ',' order by k) from module_event, jsonb_object_keys(payload) k where type in ('trust.applied', 'trust.refunded')`);
  ok("FO-7t DW18 pass: trust.applied once per withdrawal and trust.refunded once per refund, from TRUST_EVENT", applied > 0 && refunded > 0 && events("trust.applied") === applied && events("trust.refunded") === refunded, { a: events("trust.applied"), r: events("trust.refunded") });
  ok("FO-7t DW18 fail (AG-6-33 §10): the payloads carry ids, the amount and its currency only — no name, email, reference, reason or payee name",
    !!payloadKeys && payloadKeys.split(",").every((x) => /Id$|^amountMinor$|^currency$/.test(x)) && !/reason|reference|name|email/i.test(payloadKeys), payloadKeys);
  ok("FO-7t DW18 pass: invoice.paid when Pay from trust settles an invoice (the route and at issue)", Number(sql(`select count(*) from module_event where type = 'invoice.paid' and subject_id in ('${draft1}', '${t1}', '${inv3}', '${r1}', '${r2}')`)) === 4,
    sql(`select string_agg(subject_id::text, ',') from module_event where type = 'invoice.paid'`));

  // -------------------------------------------------------- DW1: Yes → No with money held (AG-6-59 rule 6)
  await deposit(PA, CASE, 5000);   // money held when the Owner switches trust off
  await call(tR, "PUT", "/answer", { answer: "NO" });
  const inv4 = await issued(PA, CASE, 1000);
  const heldApply = await apply({ invoiceId: inv4, amountMinor: 1000, unclearedAcknowledged: true }), heldRefund = await refund({ personId: PA, caseId: CASE, amountMinor: 100, method: "CHEQUE", reference: "CHQ-1" });
  const newRequest = await call(tR, "POST", "/requests", { personId: PA, amountMinor: 100, currency: "CAD", purpose: "Retainer deposit (Sample)" });
  ok("FO-7t DW1 pass: trust off with money held → Pay from trust and a refund still answer 201 (AG-6-59 rule 6)", heldApply.status === 201 && heldRefund.status === 201, [heldApply.body, heldRefund.body]);
  ok("FO-7t DW1 fail: trust off with money held → a new trust request is refused (409 TRUST_OFF)", newRequest.status === 409 && newRequest.body.code === "TRUST_OFF", newRequest.body);
  const read = await raw(tR, "GET", `/invoices/${inv4}`);
  ok("FO-7t DW1 pass: an invoice read names no trust field (FO-7b's InvoiceView)", read.status === 200 && !Object.keys(read.body).some((x) => /trust/i.test(x)), Object.keys(read.body ?? {}));
  void dep1;
} catch (e) {
  ok("FO-7t part 2: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
