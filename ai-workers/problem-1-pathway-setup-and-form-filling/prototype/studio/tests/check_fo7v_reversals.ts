// FO-7v part T (R1.58; design/briefs/FO-7v.md as narrowed by P-694 and Lead 1's ruling on #3493, 24 Nov; AG-6-75 rules 1-3,
// 7, §6, §8-§10; P-603, P-634 (1), P-653 (2); legal reading Unconfirmed: no counsel): reversing a trust deposit recorded by
// hand, and the shortfall list, through the routes under /api/front-office/money.
// The named cases of part T, each a pass and a fail: DW1 (card and operating), DW2 (reason), DW3 (the preview is the
// plan), DW8 (twice), DW11 (walls, C5, audit), DW12 (the event), and P-694 (below zero, on the shortfall list, the
// invoice paid from that trust stays paid). The route contract it pins:
//   GET  /payments/:id/reverse-preview (agent/payment:record) → { paymentId, depositEntryId, reverseMinor, balanceBeforeMinor,
//        balanceAfterMinor, shortfallMinor, reasonsAllowed, invoicesStayPaid, words, hash }
//   POST /payments/:id/reverse { reasonCode, reason?, previewHash } (agent/payment:record) → 201 { paymentId, entryId,
//        status: "Reversed", reasonCode, amountMinor, currency, balanceAfterMinor, shortfallMinor }
//   GET  /trust/shortfall[?currency=] (agent/invoice:show) → { items: [{ personId, companyId, name, currency, balanceMinor,
//        reversalEntryId, paymentId, caseId, reasonCode, belowZero }] }
// Audit line trust_money.reversed and event payment.reversed, one per reversal, in its transaction. Field errors 422.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices, FO-7t's trust and
// FO-7v's reversals, with the local sign-in stand-in; the mail is the fake. No network, no model call, no Stripe call
// (US$0). Amounts are Sample. Dropped at the end, also when the feature is missing.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7v_reversals.ts
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
const DB = `xr_studio_fo7v_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
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
  const { PaymentReversedPayload } = await import("../ports/events/client-money-reversals.ts");
  const { Reversals } = await import("../api/src/client-money/reversals/reverse.ts");
  const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
  const trust = (await import("../api/src/features/client-money-trust.ts")).default;
  const invoices = (await import("../api/src/features/client-money-invoices.ts")).default;
  const reversals = (await import("../api/src/features/client-money-reversals.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7v-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...trust.providers, ...invoices.providers, ...reversals.providers];
  @Module({ controllers: [PlatformIdentityController, ...trust.controllers, ...invoices.controllers, ...reversals.controllers] as never[], providers: providers as never[] }) class TestApp {}
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
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7v.${n}@example.org', 'seed:FO-7v', now()) returning id`);
  const PA = person(A, "a"), PC = person(A, "c"), PD = person(A, "d"), PB = person(B, "b");
  // user-R: sample-firm's Owner (every money key); user-O: a Case Officer given agent/payment:record and
  // agent/invoice:show here but seeing no case and no client (C5 fails closed); user-S: sample-solo's Owner.
  const tR = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  const W = "00000000-0000-4000-8000-0000000f7a00", CLIENT_A = "00000000-0000-4000-8000-0000000f7a01", CASE = "00000000-0000-4000-8000-0000000f7b01";
  const PE = person(A, "e"), CLIENT_E = "00000000-0000-4000-8000-0000000f7a02", E1 = "00000000-0000-4000-8000-0000000f7b02", E2 = "00000000-0000-4000-8000-0000000f7b03";
  sql(`set session_replication_role = replica;
    insert into workspace (id, key, label) values ('${W}', 'fo7v-check', 'FO-7v part T (Sample)');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values
      ('${CLIENT_A}', '${W}', 'sample-firm', '${A}', 1, 'Client a (Sample)', 'PERSON', '${PA}', 'seed:FO-7v'),
      ('${CLIENT_E}', '${W}', 'sample-firm', '${A}', 2, 'Client e (Sample)', 'PERSON', '${PE}', 'seed:FO-7v');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values
      ('${CASE}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07501', 'sample-firm', '${A}', '${CLIENT_A}', 'OPEN'),
      ('${E1}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07502', 'sample-firm', '${A}', '${CLIENT_E}', 'OPEN'),
      ('${E2}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07503', 'sample-firm', '${A}', '${CLIENT_E}', 'OPEN');
    insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values
      (gen_random_uuid(), '${A}', 'P-07501', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PA}', '${PA}', '${staffR}', 'seed:FO-7v', now()),
      (gen_random_uuid(), '${A}', 'P-07502', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PC}', '${PC}', '${staffR}', 'seed:FO-7v', now()),
      (gen_random_uuid(), '${A}', 'P-07503', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PD}', '${PD}', '${staffR}', 'seed:FO-7v', now());
    delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all');
    insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/payment:record'), ('CASE_OFFICER', 'agent/invoice:show') on conflict do nothing`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, trust_details, updated_by, updated_at) values ('${f}', 'Trust account (Sample)', 'seed:FO-7v', now())`);
  const audits = () => Number(sql(`select count(*) from audit_event where action = 'trust_money.reversed'`));
  const events = () => Number(sql(`select count(*) from module_event where type = 'payment.reversed'`));
  const corrections = () => Number(sql(`select count(*) from money_trust_entry where kind = 'CORRECTION'`));
  const balance = (party: string) => Number(sql(`select coalesce((select balance_after_minor from money_trust_entry where coalesce(person_id, company_id) = '${party}' and currency = 'CAD' order by seq desc limit 1), 0)`));
  let k = 0;
  const deposit = async (personId: string, caseId: string | null, amountMinor: number, method = "E_TRANSFER") => {
    const r = await raw(tR, "POST", "/trust/deposits", { personId, ...(caseId ? { caseId } : {}), method, amountMinor, currency: "CAD", idempotencyKey: `fo7v-dep-${++k}` });
    if (r.status !== 201) throw new Error(`deposit: ${JSON.stringify(r.body)}`); return r.body.paymentId as string;
  };
  const issued = async (personId: string, caseId: string | null, unitMinor: number) => {
    const d = await raw(tR, "POST", "/invoices", { personId, currency: "CAD" }); if (d.status !== 201) throw new Error(`draft: ${JSON.stringify(d.body)}`);
    const l = await raw(tR, "POST", `/invoices/${d.body.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 }); if (l.status >= 300) throw new Error(`line: ${JSON.stringify(l.body)}`);
    if (caseId) sql(`set session_replication_role = replica; update money_invoice set case_id = '${caseId}' where id = '${d.body.id}'`);
    const i = await raw(tR, "POST", `/invoices/${d.body.id}/issue`); if (i.status !== 200) throw new Error(`issue: ${JSON.stringify(i.body)}`);
    return d.body.id as string;
  };
  const preview = (id: string, t: string | null = tR) => raw(t, "GET", `/payments/${id}/reverse-preview`);
  const reverse = (id: string, body: Record<string, unknown>, t: string | null = tR) => raw(t, "POST", `/payments/${id}/reverse`, body);
  const shortfall = (t: string | null = tR) => raw(t, "GET", "/trust/shortfall");
  await raw(tR, "PUT", "/trust/answer", { answer: "YES" }); await raw(tS, "PUT", "/trust/answer", { answer: "YES" });

  // ------------------------------------------------------------------------------------- DW1: card and operating
  const invOp = await issued(PD, null, 50000);
  const op = await raw(tR, "POST", `/invoices/${invOp}/payments`, { method: "CHEQUE", amountMinor: 10000, receivedOn: new Date().toISOString().slice(0, 10), reference: "CHQ-OP-1", idempotencyKey: "fo7v-op-1" });
  if (op.status !== 201) throw new Error(`operating payment: ${JSON.stringify(op.body)}`);
  const opId = (op.body.id ?? op.body.paymentId) as string;
  const card = sql(`set session_replication_role = replica; insert into money_payment (firm_id, invoice_id, method, amount_minor, currency, received_into, received_at, stripe_payment_intent_id, idempotency_key)
    values ('${A}', '${invOp}', 'CARD', 5000, 'CAD', 'OPERATING', now(), 'pi_fo7vSample', 'fo7v-card-1') returning id`);
  const [pc, po] = await Promise.all([preview(card), preview(opId)]);
  ok("FO-7v DW1 fail (AG-6-75 rule 1): a card payment → 409 USE_A_REFUND \"Use a refund\", for the preview and the reverse; nothing written",
    pc.status === 409 && pc.body.code === "USE_A_REFUND" && /Use a refund/.test(pc.body.detail) && (await reverse(card, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: "0".repeat(32) })).status === 409 && corrections() === 0, pc.body);
  ok("FO-7v DW1 fail (part T only): a payment received into operating → 409 NOT_YET (its reversal needs schema, FO-7v's later part)", po.status === 409 && po.body.code === "NOT_YET", po.body);

  // ------------------------------------------------------------------------------------- DW2: reason; DW3: the preview is the plan
  const d1 = await deposit(PA, CASE, 30000);   // e-Transfer: never "Returned"
  const p1 = await preview(d1);
  ok("FO-7v DW3 pass: the preview of a held 300.00 deposit → 200 with the plan: 300.00 out, balance 300.00 → 0.00, no shortfall, invoices stay paid, a 32-hex hash, Returned not offered for an e-Transfer",
    p1.status === 200 && p1.body.reverseMinor === 30000 && p1.body.balanceBeforeMinor === 30000 && p1.body.balanceAfterMinor === 0 && p1.body.shortfallMinor === 0 && p1.body.invoicesStayPaid === true
      && /^[0-9a-f]{32}$/.test(p1.body.hash) && !p1.body.reasonsAllowed.includes("RETURNED") && p1.body.reasonsAllowed.includes("RECORDED_BY_MISTAKE") && corrections() === 0, p1.body);
  const bad = await Promise.all([reverse(d1, { previewHash: p1.body.hash }), reverse(d1, { reasonCode: "OTHER", previewHash: p1.body.hash }), reverse(d1, { reasonCode: "RECORDED_BY_MISTAKE" }), reverse(d1, { reasonCode: "LOST", previewHash: p1.body.hash })]);
  ok("FO-7v DW2 fail: no reason code, OTHER with no typed reason, no previewHash, an unknown code → 422 each (PF-28), nothing written", bad.every((r) => r.status === 422) && corrections() === 0, bad.map((r) => [r.status, r.body?.detail ?? r.body]));
  const ret = await reverse(d1, { reasonCode: "RETURNED", previewHash: p1.body.hash });
  ok("FO-7v DW2 fail (P-634 (1)): \"Returned\" on an e-Transfer → 409 NOT_RETURNED with the reasons allowed, nothing written",
    ret.status === 409 && ret.body.code === "NOT_RETURNED" && Array.isArray(ret.body.reasonsAllowed) && corrections() === 0, ret.body);
  await deposit(PA, CASE, 1000);   // the ledger moves after the preview
  const stale = await reverse(d1, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: p1.body.hash });
  ok("FO-7v DW3 fail (AG-6-75 §10): money recorded for the client after the preview → 409 CHANGED \"Changed since the preview\", nothing written",
    stale.status === 409 && stale.body.code === "CHANGED" && /Changed since the preview/.test(stale.body.detail) && corrections() === 0 && audits() === 0 && events() === 0, stale.body);
  const p1b = await preview(d1);
  const typed = await reverse(d1, { reasonCode: "OTHER", reason: "Entered on the wrong day (Sample)", previewHash: p1b.body.hash });
  const entry1 = sql(`select amount_minor || ':' || correction_kind || ':' || reason || ':' || (corrects_entry_id = (select id from money_trust_entry where payment_id = '${d1}')) from money_trust_entry where id = '${typed.body.entryId}'`);
  ok("FO-7v DW2 + DW3 pass: OTHER with a typed reason, on the fresh preview → 201 Reversed; one CORRECTION of −300.00 naming exactly the deposit, kind OTHER, the typed reason; the balance is the preview's",
    typed.status === 201 && typed.body.status === "Reversed" && entry1 === "-30000:OTHER:Entered on the wrong day (Sample):true" && balance(PA) === p1b.body.balanceAfterMinor && balance(PA) === 1000, [typed.body, entry1, balance(PA)]);

  // ------------------------------------------------------------------------------------- DW8: twice; DW11: audit; DW12: event
  const again = await reverse(d1, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: p1b.body.hash }), againPreview = await preview(d1);
  ok("FO-7v DW8 fail: a second reverse of the same payment → 409 ALREADY_REVERSED (its preview too), nothing written",
    again.status === 409 && again.body.code === "ALREADY_REVERSED" && againPreview.status === 409 && corrections() === 1, [again.body, againPreview.body]);
  const ev = sql(`select payload::text from module_event where type = 'payment.reversed'`), au = sql(`select (detail->>'reasonCode') || ':' || (detail->>'balanceMinor_before') || ':' || (detail->>'balanceMinor_after') from audit_event where action = 'trust_money.reversed'`);
  ok("FO-7v DW11 + DW12 pass: one audit line trust_money.reversed (reason code, balance before and after) and one payment.reversed event, its payload ids, code, amount and currency only",
    audits() === 1 && au === "OTHER:31000:1000" && events() === 1 && PaymentReversedPayload.safeParse(JSON.parse(ev)).success && !/Sample|wrong day|fo7v\./.test(ev), [au, ev]);
  ok("FO-7v DW12 fail: a payload carrying a person's email or the typed reason is refused by the event's payload type",
    !PaymentReversedPayload.safeParse({ ...JSON.parse(ev), email: "fo7v.a@example.org" }).success && !PaymentReversedPayload.safeParse({ ...JSON.parse(ev), reason: "Entered on the wrong day" }).success);

  // ------------------------------------------------------------------------------------- P-694: below zero, red, the invoice stays paid
  // j_58 W5's shape: 300.00 by e-Transfer and a 200.00 cheque, 500.00 refunded, then the cheque reversed as Returned.
  await deposit(PC, null, 30000); const chq = await deposit(PC, null, 20000, "CHEQUE");
  // The cheque is not yet cleared: once FO-7t part 3 (#3493) is on main the refund asks first (409 UNCLEARED), so it is
  // acknowledged then; before it, the refund takes no such field.
  const refundBody = { personId: PC, currency: "CAD", amountMinor: 50000, reason: "Unused money returned (Sample)", method: "E_TRANSFER", reference: "FO7V-RF1" };
  let rf = await raw(tR, "POST", "/trust/refunds", refundBody);
  if (rf.status === 409 && rf.body?.code === "UNCLEARED") rf = await raw(tR, "POST", "/trust/refunds", { ...refundBody, unclearedAcknowledged: true });
  if (rf.status !== 201) throw new Error(`refund: ${JSON.stringify(rf.body)}`);
  const before = await shortfall();
  ok("FO-7v P-694 fail: before the reversal the shortfall list is empty (nobody is below zero)", before.status === 200 && Array.isArray(before.body.items) && before.body.items.length === 0, before.body);
  const pR = await preview(chq);
  const returned = await reverse(chq, { reasonCode: "RETURNED", previewHash: pR.body.hash });
  ok("FO-7v P-694 pass (AG-6-75 r2, r4 as P-653 (2) reads it): the 200.00 cheque, its money already refunded, reversed as Returned → 201; the preview said −200.00 and a shortfall of 200.00; the balance is −200.00",
    pR.status === 200 && pR.body.shortfallMinor === 20000 && /below zero/.test(pR.body.words) && returned.status === 201 && returned.body.balanceAfterMinor === -20000 && returned.body.shortfallMinor === 20000 && balance(PC) === -20000, [pR.body, returned.body]);
  const sf = await shortfall(), row = sf.body.items?.find((x: { personId: string }) => x.personId === PC);
  ok("FO-7v P-694 pass: GET /trust/shortfall names the client at −200.00 CAD, in red (belowZero), with the reversal, its payment and Returned",
    sf.status === 200 && row?.balanceMinor === -20000 && row.currency === "CAD" && row.belowZero === true && row.reversalEntryId === returned.body.entryId && row.paymentId === chq && row.reasonCode === "RETURNED" && /Client c/.test(row.name), sf.body);
  const clearTick = (() => { try { sql(`update money_payment set cleared = true where id = '${chq}'`); return false; } catch { return true; } })();
  ok("FO-7v DW8 fail (FO-7a2 B-17, underneath): the returned cheque is never ticked cleared afterwards", clearTick);
  // Applied, then reversed: the invoice paid from that trust stays paid (P-653 (2)); the client goes below zero.
  const d3 = await deposit(PD, null, 40000), inv = await issued(PD, null, 40000);
  const ap = await raw(tR, "POST", "/trust/applications", { invoiceId: inv, amountMinor: 40000 });
  if (ap.status !== 201) throw new Error(`apply: ${JSON.stringify(ap.body)}`);
  const p3 = await preview(d3), r3 = await reverse(d3, { reasonCode: "WRONG_CLIENT", previewHash: p3.body.hash }), invAfter = await raw(tR, "GET", `/invoices/${inv}`);
  ok("FO-7v P-694 pass (P-653 (2)): a 400.00 deposit that paid an invoice, reversed as Wrong client → 201, the invoice stays Paid (due 0), the client is at −400.00",
    r3.status === 201 && invAfter.status === 200 && invAfter.body.dueMinor === 0 && balance(PD) === -40000 && corrections() === 3, [r3.body, invAfter.body?.statusWord, invAfter.body?.dueMinor, balance(PD)]);
  const out = await raw(tR, "POST", "/trust/refunds", { personId: PD, currency: "CAD", amountMinor: 100, reason: "Sample", method: "E_TRANSFER", reference: "FO7V-RF2" });
  ok("FO-7v P-694 fail: below zero after a reversal, any other way out is still refused (a refund → 409, \"Only CAD 0.00 is available\")", out.status === 409 && /Only CAD 0\.00 is available/.test(out.body.detail), out.body);

  // ------------------------------------------------------------------------------------- DW11: walls and C5
  const d4 = await deposit(PA, CASE, 5000);
  const [bP, bR, bS, oP, oR, oS, nP] = await Promise.all([preview(d4, tS), reverse(d4, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: "0".repeat(32) }, tS), shortfall(tS),
    preview(d4, tO), reverse(d4, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: "0".repeat(32) }, tO), shortfall(tO), preview(d4, null)]);
  ok("FO-7v DW11 fail: firm B against firm A's payment → 404 (preview and reverse); firm B's shortfall list holds none of firm A's; no session → 401; nothing written",
    bP.status === 404 && bR.status === 404 && bS.status === 200 && bS.body.items.length === 0 && nP.status === 401 && corrections() === 3, [bP.status, bR.status, bS.body, nP.status]);
  ok("FO-7v DW11 fail (C5): an officer who sees neither the case nor the client → 404 on the preview and the reverse, an empty shortfall list, nothing written",
    oP.status === 404 && oR.status === 404 && oS.status === 200 && oS.body.items.length === 0 && corrections() === 3 && audits() === 3, [oP.status, oR.status, oS.body]);
  // Review M1: C5 comes before every refusal, so an unseen payment's state is never said (card, operating, reversed).
  const unseen = await Promise.all([preview(card, tO), preview(opId, tO), preview(d1, tO), reverse(d1, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: "0".repeat(32) }, tO)]);
  ok("FO-7v DW11 fail (C5 first, review M1): an officer who may not see them → 404 for a card payment, an operating payment and an already reversed deposit (never USE_A_REFUND, NOT_YET or ALREADY_REVERSED)",
    unseen.every((r) => r.status === 404), unseen.map((r) => [r.status, r.body?.code]));

  // ------------------------------------------------------------------------------------- break M1: typed reasons the database refuses
  const pT = await preview(d4), alarmsBefore = Number(sql(`select count(*) from audit_event where action = 'trust_money.reversed'`));
  const odd = await Promise.all(["\u200b\u200b", "\u202eSample reason", "a\u0085b", "\u0301\u0301", "\u3164", "ok \ud800 x"].map((reason) => reverse(d4, { reasonCode: "OTHER", reason, previewHash: pT.body.hash })));
  ok("FO-7v DW2 fail (break M1): six typed reasons the database's text rule refuses (hidden, direction-changing, control, combining-only, filler, a broken character) → 422 on reason each, never 500; nothing written",
    odd.every((r) => r.status === 422) && corrections() === 3 && audits() === alarmsBefore, odd.map((r) => [r.status, r.body?.detail]));
  ok("FO-7v DW2 pass: a non-English typed reason is stored as typed", (await reverse(d4, { reasonCode: "OTHER", reason: "Saisi deux fois (Sample)", previewHash: pT.body.hash })).status === 201
    && sql(`select reason from money_trust_entry where corrects_entry_id = (select id from money_trust_entry where payment_id = '${d4}')`) === "Saisi deux fois (Sample)");

  // ------------------------------------------------------------------------------------- review m1: at once; cash; nothing left
  const d5 = await deposit(PA, CASE, 7000), p5 = await preview(d5);
  const many = await Promise.all(Array.from({ length: 6 }, () => reverse(d5, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: p5.body.hash })));
  ok("FO-7v DW8 fail (at once): six reverses of one deposit with one preview → exactly one 201, five 409 (ALREADY_REVERSED or CHANGED), one correction, one audit line, one event",
    many.filter((r) => r.status === 201).length === 1 && many.filter((r) => r.status === 409 && ["ALREADY_REVERSED", "CHANGED"].includes(r.body.code)).length === 5
      && Number(sql(`select count(*) from money_trust_entry where corrects_entry_id = (select id from money_trust_entry where payment_id = '${d5}')`)) === 1 && audits() === 5 && events() === 5, many.map((r) => [r.status, r.body?.code]));
  const cash = await deposit(PA, CASE, 3000, "CASH"), pc2 = await preview(cash), cashRet = await reverse(cash, { reasonCode: "RETURNED", previewHash: pc2.body.hash });
  ok("FO-7v DW2 fail (P-634 (1)): \"Returned\" on cash → 409 NOT_RETURNED", cashRet.status === 409 && cashRet.body.code === "NOT_RETURNED", cashRet.body);
  const cashEntry = sql(`select id from money_trust_entry where payment_id = '${cash}'`);
  sql(`insert into money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, corrects_entry_id, correction_kind, reason, created_by)
    values ('${A}', '${PA}', '${CASE}', 'CORRECTION', -3000, 'CAD', '${cashEntry}', 'WRONG_ACCOUNT', 'Belonged in operating (Sample)', 'seed:FO-7v')`);
  const none = await preview(cash);
  ok("FO-7v DW8 fail: a deposit already corrected in full (WRONG_ACCOUNT) → 409 NOTHING_LEFT", none.status === 409 && none.body.code === "NOTHING_LEFT", none.body);

  // ------------------------------------------------------------------------------------- review M2: the shortfall list never shows money on an unseen case
  // Client e: 100.00 on E1; a 200.00 cheque on E2, refunded, then reversed as Returned → −100.00, all of it from E2.
  const dE1 = await raw(tR, "POST", "/trust/deposits", { personId: PE, caseId: E1, method: "E_TRANSFER", amountMinor: 10000, currency: "CAD", idempotencyKey: "fo7v-dep-e1" });
  const dE2 = await raw(tR, "POST", "/trust/deposits", { personId: PE, caseId: E2, method: "CHEQUE", amountMinor: 20000, currency: "CAD", idempotencyKey: "fo7v-dep-e2" });
  if (dE1.status !== 201 || dE2.status !== 201) throw new Error(`client e deposits: ${JSON.stringify([dE1.body, dE2.body])}`);
  const chqE = dE2.body.paymentId as string;
  const rfE = { personId: PE, caseId: E2, currency: "CAD", amountMinor: 20000, reason: "Unused money returned (Sample)", method: "E_TRANSFER", reference: "FO7V-RFE" };
  let rE = await raw(tR, "POST", "/trust/refunds", rfE); if (rE.status === 409 && rE.body?.code === "UNCLEARED") rE = await raw(tR, "POST", "/trust/refunds", { ...rfE, unclearedAcknowledged: true });
  const pE = await preview(chqE), revE = await reverse(chqE, { reasonCode: "RETURNED", previewHash: pE.body.hash });
  // Then a 50.00 deposit on E1, reversed: the latest reversal is on E1, the case the officer sees (the reviewer's shape).
  const dE3 = await raw(tR, "POST", "/trust/deposits", { personId: PE, caseId: E1, method: "E_TRANSFER", amountMinor: 5000, currency: "CAD", idempotencyKey: "fo7v-dep-e3" });
  const pE3 = await preview(dE3.body.paymentId), revE3 = await reverse(dE3.body.paymentId, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: pE3.body.hash });
  if (rE.status !== 201 || revE.status !== 201 || revE3.status !== 201) throw new Error(`client e: ${JSON.stringify([rE.body, revE.body, revE3.body])}`);
  // Round 3 (n1): 10.00 of client e's money before a case (no case), so a scope of both cases and no parties sees all
  // of e's case money but not that entry.
  const dE4 = await raw(tR, "POST", "/trust/deposits", { personId: PE, method: "E_TRANSFER", amountMinor: 1000, currency: "CAD", idempotencyKey: "fo7v-dep-e4" });
  if (dE4.status !== 201) throw new Error(`client e no case: ${JSON.stringify(dE4.body)}`);
  const ctxA = { firmId: A, staffId: staffR } as never;
  const listFor = (scope: { cases: string[]; parties: string[] }) => new Reversals(owner, auditEvent, async () => scope).shortfall(ctxA, {}) as Promise<{ items: { personId: string | null; balanceMinor: number }[] }>;
  const partial = await listFor({ cases: [E1], parties: [PE] }), whole = await listFor({ cases: [E1, E2], parties: [PE] });
  ok("FO-7v DW11 fail (review M2): an officer who sees case E1 only never gets client e's row, though the latest reversal is on E1 (its −100.00 is money on E2)", !partial.items.some((x) => x.personId === PE), partial.items);
  ok("FO-7v DW11 pass: a caller who sees both of client e's cases and client e gets the row at −90.00", whole.items.find((x) => x.personId === PE)?.balanceMinor === -9000, whole.items);
  const noParty = await listFor({ cases: [E1, E2], parties: [] });
  ok("FO-7v DW11 fail (round 3, n1): a scope of both cases but not client e (so not e's money before a case) never gets the row: the list fails closed by itself, not only through the visibility adapter",
    !noParty.items.some((x) => x.personId === PE), noParty.items);

  const ghost = await preview("00000000-0000-4000-8000-000000000999");
  ok("FO-7v DW11 fail: an unknown payment id → 404", ghost.status === 404, ghost.body);
} catch (e) {
  ok("FO-7v part T: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
