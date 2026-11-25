// R1.96 part 1 (design/briefs/R1.96-shape.md; CAPABILITIES R1.96 "a refund or credit note never exceeds what was paid; a
// write-off needs a reason and the key; the ledger stays balanced each time"; BACKLOG FO-7r; AG-6-76, AG-6-23, AG-6-48):
// writing off what is due on an issued invoice, the caps on refunds and credit notes it sits next to, and the ledger check
// after every write. Each rule a pass and a fail. The route it pins:
//   POST /api/front-office/money/invoices/:id/write-off { reason } (agent/invoice:void) → 201 { id, invoiceId, amountMinor,
//        currency, reason, createdBy, invoice } · 422 no reason · 403 without the key · 404 another firm or out of scope ·
//        409 DRAFT, ALREADY_WRITTEN_OFF, NOTHING_DUE; a credit note afterwards → 409 WRITTEN_OFF "Already settled by write-off".
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices and refunds, FO-7t's
// trust and this part's write-offs, with the local sign-in stand-in; the mail is the fake. No network, no model call, no
// Stripe call (US$0). Amounts are Sample. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_r196_write_offs.ts
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
const DB = `xr_studio_r196wo_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
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
  const feats = await Promise.all(["client-money-trust", "client-money-invoices", "client-money-refunds", "client-money-write-offs"].map(async (f) => (await import(`../api/src/features/${f}.ts`)).default as { controllers: unknown[]; providers: unknown[] }));
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("r196-check-signing-key-0123456789abcdef", () => clock.now());
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
  // user-R: sample-firm's Owner (every money key); user-O: a Case Officer who reads invoices but holds no agent/invoice:void.
  sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/invoice:show') on conflict do nothing;
       delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/invoice:void'`);
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
  const writeOff = (inv: string, body: unknown, t: string | null = tR) => raw(t, "POST", `/invoices/${inv}/write-off`, body);
  const writeOffs = (inv?: string) => Number(sql(`select count(*) from money_write_off${inv ? ` where invoice_id = '${inv}'` : ""}`));
  const audits = () => Number(sql(`select count(*) from audit_event where action = 'invoice.written_off'`));
  const balanced = async (what: string, inv?: string) => { const c = await ledgerCheck(owner, A, inv); ok(`R1.96 ledger balanced after ${what}`, c.balanced, c.problems); };

  // ---------------------------------------------------------------------------------- WO1: a reason is needed
  const i1 = await issued(PA, 50000); await pay(i1, 20000); await balanced("an invoice part paid by cheque", i1);
  const noReason = await writeOff(i1, {}), blank = await writeOff(i1, { reason: "   " }), long = await writeOff(i1, { reason: "x".repeat(201) }), hidden = await writeOff(i1, { reason: "​" });
  ok("R1.96 WO1 fail: no reason, a blank one, 201 characters and a hidden-only one → 422 naming the reason; nothing written",
    [noReason, blank, long, hidden].every((r) => r.status === 422 && r.body.fields?.reason) && writeOffs() === 0 && audits() === 0, [noReason.body, hidden.body]);

  // ---------------------------------------------------------------------------------- WO2: the key
  const noKey = await writeOff(i1, { reason: "Small balance (Sample)" }, tO), noSession = await writeOff(i1, { reason: "Small balance (Sample)" }, null);
  ok("R1.96 WO2 fail: a Case Officer without agent/invoice:void → 403; no session → 401; nothing written", noKey.status === 403 && noSession.status === 401 && writeOffs() === 0, [noKey.status, noSession.status]);

  // ---------------------------------------------------------------------------------- WO3: pass, with the reason and the key
  const w1 = await writeOff(i1, { reason: "Small balance (Sample)" });
  ok("R1.96 WO3 pass: the Owner writes off the 300.00 still due → 201, the invoice reads Written off with nothing due, one row and one audit line naming the reason",
    w1.status === 201 && w1.body.amountMinor === 30000 && w1.body.reason === "Small balance (Sample)" && w1.body.invoice.statusWord === "Written off" && w1.body.invoice.dueMinor === 0
      && w1.body.invoice.writtenOffMinor === 30000 && writeOffs(i1) === 1 && audits() === 1
      && sql(`select detail::text from audit_event where action = 'invoice.written_off'`).includes("Small balance (Sample)"), w1.body);
  await balanced("the write-off", i1);

  // ---------------------------------------------------------------------------------- WO4: once; WO5: credit note after it
  const again = await writeOff(i1, { reason: "Again (Sample)" });
  ok("R1.96 WO4 fail: a second write-off of the same invoice → 409 ALREADY_WRITTEN_OFF; still one row", again.status === 409 && again.body.code === "ALREADY_WRITTEN_OFF" && writeOffs(i1) === 1, again.body);
  const cn = await raw(tR, "POST", `/invoices/${i1}/credit-notes`, { amountMinor: 1000, reason: "After the write-off (Sample)" });
  ok("R1.96 WO5 fail: a credit note after the write-off → 409 \"Already settled by write-off\"; no credit note written",
    cn.status === 409 && /Already settled by write-off/.test(cn.body.detail) && Number(sql(`select count(*) from money_credit_note where invoice_id = '${i1}'`)) === 0, cn.body);
  await pay(i1, 5000);
  const late = await raw(tR, "GET", `/invoices/${i1}`);
  ok("R1.96 WO5 pass (FO-7r): a payment after the write-off is kept and counts as extra money; the invoice stays Written off",
    late.status === 200 && late.body.statusWord === "Written off" && late.body.extraMinor === 5000, late.body);
  await balanced("a payment after the write-off", i1);

  // ---------------------------------------------------------------------------------- WO6: draft; nothing due
  const d6 = await draft(PC, 10000);
  const onDraft = await writeOff(d6, { reason: "Draft (Sample)" });
  ok("R1.96 WO6 fail: a draft → 409 DRAFT; nothing written", onDraft.status === 409 && onDraft.body.code === "DRAFT" && writeOffs(d6) === 0, onDraft.body);
  const i6 = await issued(PC, 10000); await pay(i6, 10000);
  const paid = await writeOff(i6, { reason: "Paid (Sample)" });
  ok("R1.96 WO6 fail: a paid invoice → 409 NOTHING_DUE; nothing written", paid.status === 409 && paid.body.code === "NOTHING_DUE" && writeOffs(i6) === 0, paid.body);

  // ---------------------------------------------------------------------------------- WO7: walls; two at once
  const i7 = await issued(PD, 20000);
  const otherFirm = await writeOff(i7, { reason: "Other firm (Sample)" }, tS), ghost = await writeOff("00000000-0000-4000-8000-000000000999", { reason: "Ghost (Sample)" }), notId = await writeOff("not-an-id", { reason: "x" });
  ok("R1.96 WO7 fail: firm B on firm A's invoice, an unknown id and a malformed one → 404; nothing written", [otherFirm, ghost, notId].every((r) => r.status === 404) && writeOffs(i7) === 0, [otherFirm.body, ghost.body]);
  const both = await Promise.all([writeOff(i7, { reason: "At once 1 (Sample)" }), writeOff(i7, { reason: "At once 2 (Sample)" })]);
  ok("R1.96 WO7 pass: two write-offs at once → one 201 and one 409 ALREADY_WRITTEN_OFF; one row", both.filter((r) => r.status === 201).length === 1 && both.some((r) => r.status === 409 && r.body.code === "ALREADY_WRITTEN_OFF") && writeOffs(i7) === 1, both.map((r) => r.body));

  // ---------------------------------------------------------------------------------- WO8: the refund and credit-note caps (on main)
  const i8 = await issued(PD, 40000), p8 = await pay(i8, 40000, "E_TRANSFER");
  const over = await raw(tR, "POST", `/payments/${p8}/refunds`, { amountMinor: 40001, method: "E_TRANSFER", reason: "Over (Sample)", idempotencyKey: "r196-ref-over" });
  const r8 = await raw(tR, "POST", `/payments/${p8}/refunds`, { amountMinor: 15000, method: "E_TRANSFER", reason: "Part back (Sample)", idempotencyKey: "r196-ref-1" });
  const over2 = await raw(tR, "POST", `/payments/${p8}/refunds`, { amountMinor: 25001, method: "E_TRANSFER", reason: "Past the rest (Sample)", idempotencyKey: "r196-ref-2" });
  ok("R1.96 WO8 refunds: one of 400.01 on a 400.00 payment → refused; 150.00 → 201; then 250.01 (past the 250.00 left) → refused; refunds total 150.00",
    over.status >= 400 && over.status < 500 && r8.status === 201 && over2.status >= 400 && over2.status < 500 && Number(sql(`select coalesce(sum(amount_minor), 0) from money_refund where payment_id = '${p8}'`)) === 15000, [over.body, r8.body, over2.body]);
  await balanced("refunds", i8);
  const i9 = await issued(PD, 30000);
  const cOver = await raw(tR, "POST", `/invoices/${i9}/credit-notes`, { amountMinor: 30001, reason: "Over (Sample)" }), cOk = await raw(tR, "POST", `/invoices/${i9}/credit-notes`, { amountMinor: 10000, reason: "Part (Sample)" });
  const wo9 = await writeOff(i9, { reason: "The rest (Sample)" });
  ok("R1.96 WO8 credit notes: 300.01 on a 300.00 invoice → 409 OVER_CREDIT; 100.00 → 201; the write-off then takes the 200.00 left, never the credited part",
    cOver.status === 409 && cOver.body.code === "OVER_CREDIT" && cOk.status === 201 && wo9.status === 201 && wo9.body.amountMinor === 20000, [cOver.body, cOk.body, wo9.body]);
  await balanced("a credit note and a write-off", i9);
  await balanced("every write of this check (the whole firm)");

  // ---------------------------------------------------------------------------------- L: the ledger check finds what is wrong
  // Rows written past the database's own triggers (replica role) stand for a ledger gone wrong; the check must name each.
  const PZ = person(A, "z"), iz = await issued(PZ, 10000), pz = await pay(iz, 10000);
  const before = await ledgerCheck(owner, A, iz);
  const broken = (q: string) => { try { sql(q); } catch (e) { throw new Error(`a broken row was not written: ${String((e as { stderr?: string }).stderr ?? e)}`); } };
  broken(`set session_replication_role = replica;
    insert into money_refund (firm_id, payment_id, amount_minor, currency, reason, route, idempotency_key, refund_ordinal, created_by) values ('${A}', '${pz}', 10001, 'CAD', 'Broken (Sample)', 'OFFLINE', 'r196-broken', 99, 'seed:R1.96');
    insert into money_credit_note (firm_id, invoice_id, number, amount_minor, currency, reason, created_by) values ('${A}', '${iz}', 'CN-R196-BROKEN', 10001, 'CAD', 'Broken (Sample)', 'seed:R1.96');
    insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, seq, balance_after_minor, payment_id, created_by) values ('${A}', '${PZ}', 'DEPOSIT', 500, 'CAD', 1, 700, '${pz}', 'seed:R1.96')`);
  const after = await ledgerCheck(owner, A, iz);
  ok("R1.96 L pass: the check of a sound invoice is balanced", before.balanced && before.problems.length === 0, before.problems);
  ok("R1.96 L fail: an over-refund (L4), an over-credit (L3) and a trust balance that is not the running sum (L1) are each named",
    !after.balanced && ["L1 ", "L3 ", "L4 "].every((p) => after.problems.some((x) => x.startsWith(p))), after.problems);
  const firmB = await ledgerCheck(owner, B);
  ok("R1.96 L pass: firm B's check never sees firm A's broken rows", firmB.balanced, firmB.problems);
  ok("R1.96: no write-off ever reached firm B", Number(sql(`select count(*) from money_write_off where firm_id = '${B}'`)) === 0 && PB.length > 0);
} catch (e) {
  ok("R1.96 part 1: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
