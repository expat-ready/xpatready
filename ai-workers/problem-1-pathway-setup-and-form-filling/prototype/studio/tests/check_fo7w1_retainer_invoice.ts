// FO-7w1 (R1.56 W1; AG-6-65 rule 1, AG-6-64 rule 2, AG-6-61; Code s. 32, trust reading Unconfirmed: no counsel): a
// draft invoice started from the client's signed retainer, through RetainerFeesPort (ports/retainer-fees.ts). The
// row's cases, each a pass and a fail:
//   R1 a 1,500.00 WHEN_SUBMITTED row arrives as one FEE line of 150000, taxed by the draft's default (ON 13 %);
//   R2 an ON_SIGNING row (a deposit) is left out by itself, and taken when named in feeRowIds; that draft is a deposit;
//   R3 a row with no amount is left out; named, it is refused 422;
//   R4 DRAFT, SENT, CLIENT_SIGNED, WITHDRAWN → 409 RETAINER_NOT_SIGNED; SIGNED_OFFLINE is billed;
//   R5 another client's retainer, a consultation agreement, firm B's retainer → 404, nothing written;
//   R6 a USD draft on a CAD retainer → 422 at currency; the CAD draft takes it;
//   R7 billed once: the same retainer twice → 409 NOTHING_TO_BILL, no empty draft (break m1); named again → 409 ROW_ON_INVOICE; two at
//      once → one line only; the database's unique index refuses a second line of the same row;
//   R8 a Case Officer (agent/invoice:create) may start it; issuing still needs agent/invoice:issue (403);
//   R9 one transaction, one invoice.draft_created audit line naming the retainer and the row ids; a refusal writes none;
//   R10 the line's source and the invoice's deposit mark are fixed once written (the database's gate).
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and FO-7b's draft routes, with the
// local sign-in stand-in. No network, no model call (US$0). Sample data only. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7w1_retainer_invoice.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { PROVINCE_TAX_RATES as T } from "../api/src/client-money/tax/canada-gst-hst.ts";
import { moneyVisible } from "./lib/money-visible.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261125140000_client-money__fo7w1_invoice_from_retainer";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7w1_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, why: RegExp) => { try { sql(q); return false; } catch (e) { return why.test(String((e as { stderr?: string }).stderr ?? e)); } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
ok("FO-7w1 pass: the migration has its own stamp, later than every one before it (P-600)", all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && all.filter((d) => d < NEW).every((d) => d.slice(0, 14) < NEW.slice(0, 14)));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  for (const d of all) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
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
  const invoices = (await import("../api/src/features/client-money-invoices.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7w1-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...invoices.providers];
  @Module({ controllers: [PlatformIdentityController, ...invoices.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  let n = 0;
  const person = (firm: string) => moneyVisible(sql, firm, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${++n}', 'Sample', 'fo7w1.${n}@example.org', 'seed:FO-7w1', now()) returning id`));
  const PA = person(A), PA2 = person(A), PB = person(B);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  // user-R: sample-firm's Owner; user-O: a Case Officer (agent/invoice:create, not :issue); user-S: sample-solo's Owner.
  const tA = await signIn("user-R", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  sql(`update platform_firm set business_address = jsonb_build_object('street_name', 'Sample St', 'city', 'Toronto', 'province_state', 'ON', 'country', 'CA') where id in ('${A}', '${B}')`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, tax_registered, tax_number, updated_by, updated_at) values ('${f}', true, '123456789RT0001', 'seed:FO-7w1', now())`);
  const staffA = sql(`select id from platform_staff where firm_id = '${A}' and actor_id = 'user-R'`), staffB = sql(`select id from platform_staff where firm_id = '${B}' and actor_id = 'user-S'`);

  // A retainer fixture (Sample): written with the replica role, as tests/lib/money-visible.ts writes its fixtures (FO-5's
  // and FO-6's own checks prove the retainer's path; here only its rows and status are read, through the port).
  type Row = { label?: string; amount: number | null; when: string; currency?: string };
  const retainer = (firm: string, staff: string, personId: string, status: string, rows: Row[], kind = "RETAINER") => {
    const R = sql(`select gen_random_uuid()`), V = sql(`select gen_random_uuid()`), Tm = sql(`select gen_random_uuid()`);
    const ids = rows.map(() => sql(`select gen_random_uuid()`));
    sql(`set session_replication_role = replica;
      insert into fo_retainer (id, firm_id, kind, prospect_id, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, status, created_by, updated_at) values ('${R}', '${firm}', '${kind}', gen_random_uuid(), '${personId}', '${staff}', '${Tm}', 1, 'retainer-templates/${Tm}/v1.docx', '${status === "WITHDRAWN" || status === "SIGNED_OFFLINE" ? "DRAFT" : status}', 'seed:FO-7w1', now());
      ${status === "WITHDRAWN" ? `update fo_retainer set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_reason = 'Client chose another firm (Sample)', withdrawn_by = 'staff:${staff}' where id = '${R}';` : status === "SIGNED_OFFLINE" ? `update fo_retainer set status = 'SIGNED_OFFLINE', offline_at = now(), offline_reason = 'Signed on paper in the office (Sample)', offline_by = 'staff:${staff}', offline_file_key = 'retainers/${R}/signed-offline.pdf', offline_file_sha256 = repeat('c', 64) where id = '${R}';` : ""}
      insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${V}', '${firm}', '${R}', 1, '{}', 'retainers/${R}/v1.pdf', repeat('b', 64), 'seed:FO-7w1');
      ${rows.map((r, i) => `insert into fo_retainer_fee_row (id, firm_id, version_id, position, label, amount_minor, currency, "when") values ('${ids[i]}', '${firm}', '${V}', ${i + 1}, '${r.label ?? `Fee ${i + 1} (Sample)`}', ${r.amount ?? "null"}, '${r.currency ?? "CAD"}', '${r.when}');`).join("\n")}`);
    return { id: R, rows: ids };
  };
  const M = "/front-office/money/invoices";
  const start = (body: Record<string, unknown>, t = tA) => call(t, "POST", M, { personId: PA, currency: "CAD", ...body });
  const lines = (id: string) => sql(`select coalesce(string_agg(kind || ':' || amount_minor || ':' || tax_rate_ppm || ':' || tax_minor || ':' || coalesce(source_fee_row_id::text, '-'), ',' order by position), '') from money_invoice_line where invoice_id = '${id}'`);
  const drafts = () => Number(sql(`select count(*) from money_invoice where firm_id = '${A}'`));
  const audits = () => Number(sql(`select count(*) from audit_event where action = 'invoice.draft_created'`));
  const ON = T.ON.ratePpm, tax = (m: number) => taxForLine(m, ON);

  // ---------------------------------------------------------------------- R1: the fee row arrives as one FEE line
  const r1 = retainer(A, staffA, PA, "SIGNED", [{ amount: 200000, when: "ON_SIGNING" }, { label: "Professional fee: application (Sample)", amount: 150000, when: "WHEN_SUBMITTED" }, { amount: null, when: "WHEN_DECIDED" }, { amount: 50000, when: "WHEN_DONE" }]);
  const a0 = audits(), d1 = await start({ retainerId: r1.id });
  ok("FO-7w1 R1 pass (AG-6-65 r1, j_56 W1): a draft from the signed retainer carries its 1,500.00 WHEN_SUBMITTED row as FEE:150000, taxed at the draft's default (ON 13 %), with its label and its row id",
    d1.status === 201 && lines(d1.body.id) === `FEE:150000:${ON}:${tax(150000)}:${r1.rows[1]},FEE:50000:${ON}:${tax(50000)}:${r1.rows[3]}` && d1.body.lines[0].description === "Professional fee: application (Sample)" && d1.body.lines[0].sourceFeeRowId === r1.rows[1] && d1.body.lines[0].quantity === 1, [d1.status, d1.body, d1.body?.id && lines(d1.body.id)]);
  ok("FO-7w1 R1 fail: a rate is never the retainer's or the request's: a draft sent ratePpm is refused at the field (strict body)", (await start({ retainerId: r1.id, ratePpm: 0 })).status === 422);
  // The rate is the draft's own default, not a fixed 13 % (review m1): firm B in British Columbia (GST 5 %), then not registered (0).
  sql(`update platform_firm set business_address = jsonb_build_object('street_name', 'Sample St', 'city', 'Victoria', 'province_state', 'BC', 'country', 'CA') where id = '${B}'`);
  const rBC = retainer(B, staffB, PB, "SIGNED", [{ amount: 100000, when: "WHEN_DONE" }]), dBC = await call(tB, "POST", M, { personId: PB, currency: "CAD", retainerId: rBC.id });
  sql(`update money_payment_settings set tax_registered = false, tax_number = null where firm_id = '${B}'`);
  const rNo = retainer(B, staffB, PB, "SIGNED", [{ amount: 100000, when: "WHEN_DONE" }]), dNo = await call(tB, "POST", M, { personId: PB, currency: "CAD", retainerId: rNo.id });
  sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001' where firm_id = '${B}'`);
  ok("FO-7w1 R1 pass: the line takes the draft's default as a typed line does: a BC firm's 5 % GST, an unregistered firm's 0",
    dBC.status === 201 && lines(dBC.body.id) === `FEE:100000:${T.BC.ratePpm}:${taxForLine(100000, T.BC.ratePpm)}:${rBC.rows[0]}` && T.BC.ratePpm !== ON && dNo.status === 201 && lines(dNo.body.id) === `FEE:100000:0:0:${rNo.rows[0]}`, [dBC.body, dNo.body]);
  // A row larger than one line holds (fee rows go to 1e10 minor; a line to MINOR_MAX): refused, nothing written (review m3).
  const rBig = retainer(A, staffA, PA, "SIGNED", [{ amount: 2_147_483_648, when: "WHEN_DONE" }]), cBig = drafts(), dBig = await start({ retainerId: rBig.id });
  ok("FO-7w1 R1 fail: a fee row above what one line holds (21,474,836.47) → 422 at feeRowIds, nothing written", dBig.status === 422 && dBig.body.fields?.feeRowIds && drafts() === cBig, dBig.body);
  // Break m3: one row, or rows together, whose total with tax is more than issue accepts → refused, so no draft can never be issued.
  const rTot = retainer(A, staffA, PA, "SIGNED", [{ amount: 1_100_000_000, when: "WHEN_DONE" }, { amount: 1_000_000_000, when: "WHEN_DONE" }]), cTot = drafts(), dTot = await start({ retainerId: rTot.id });
  ok("FO-7w1 R1 fail (break m3): rows that together with tax pass 21,474,836.47 → 422 at feeRowIds, nothing written; one of them alone is billed", dTot.status === 422 && dTot.body.fields?.feeRowIds && drafts() === cTot
    && (await start({ retainerId: rTot.id, feeRowIds: [rTot.rows[1]] })).status === 201, dTot.body);
  // Break m2: a label with an invisible direction mark (the fee row's own check accepts it) is copied without the mark.
  const rMark = retainer(A, staffA, PA, "SIGNED", [{ label: "Fee \u202eSample", amount: 10000, when: "WHEN_DONE" }]), dMark = await start({ retainerId: rMark.id });
  ok("FO-7w1 R1 pass (break m2): a label holding a direction mark is copied without it (\"Fee Sample\"), not refused", dMark.status === 201 && dMark.body.lines[0]?.description === "Fee Sample", dMark.body);
  // Break m4: a firm whose default is USD, no currency sent → the retainer's CAD, never a refusal at a field not sent.
  sql(`update money_payment_settings set default_currency = 'USD' where firm_id = '${A}'`);
  const rCur = retainer(A, staffA, PA, "SIGNED", [{ amount: 10000, when: "WHEN_DONE" }]), dCur = await call(tA, "POST", M, { personId: PA, retainerId: rCur.id }), dPlain = await call(tA, "POST", M, { personId: PA });
  sql(`update money_payment_settings set default_currency = 'CAD' where firm_id = '${A}'`);
  ok("FO-7w1 R6 pass (break m4): a USD-default firm's draft from a retainer with no currency sent is CAD; a plain draft still takes USD", dCur.status === 201 && dCur.body.currency === "CAD" && dPlain.status === 201 && dPlain.body.currency === "USD", [dCur.body, dPlain.body]);
  // ---------------------------------------------------------------------- R2: the deposit is never copied by itself
  ok("FO-7w1 R2 fail (AG-6-61, Code s. 32): the ON_SIGNING deposit row is not copied by itself; that draft is not a deposit", d1.status === 201 && !lines(d1.body.id).includes(r1.rows[0]) && d1.body.deposit === false);
  const d2 = await start({ retainerId: r1.id, feeRowIds: [r1.rows[0]] });
  ok("FO-7w1 R2 pass: named in feeRowIds, the ON_SIGNING row is copied (FEE:200000) and the draft is a deposit (never a pay link, P-567 (3))",
    d2.status === 201 && lines(d2.body.id) === `FEE:200000:${ON}:${tax(200000)}:${r1.rows[0]}` && d2.body.deposit === true && sql(`select deposit from money_invoice where id = '${d2.body.id}'`) === "t", [d2.status, d2.body]);
  // ---------------------------------------------------------------------- R3: a row with no amount
  ok("FO-7w1 R3 pass: a row with no amount is left out (R1's draft holds rows 2 and 4 only)", d1.status === 201 && !lines(d1.body.id).includes(r1.rows[2]));
  const c3 = drafts(), d3 = await start({ retainerId: r1.id, feeRowIds: [r1.rows[2]] });
  ok("FO-7w1 R3 fail: naming the row with no amount → 422 at feeRowIds, nothing written", d3.status === 422 && d3.body.fields?.feeRowIds && drafts() === c3, d3.body);
  const d3b = await start({ retainerId: r1.id, feeRowIds: [r1.rows[0].replace(/.$/, (c) => (c === "0" ? "1" : "0"))] });
  ok("FO-7w1 R3 fail: a fee row not on this retainer → 422 at feeRowIds; feeRowIds without a retainer → 422", d3b.status === 422 && d3b.body.fields?.feeRowIds && (await call(tA, "POST", M, { personId: PA, feeRowIds: [r1.rows[1]] })).status === 422, d3b.body);

  // ---------------------------------------------------------------------- R4: only a signed retainer
  const notSigned: Record<string, number> = {};
  for (const st of ["DRAFT", "SENT", "CLIENT_SIGNED", "WITHDRAWN"]) { const r = retainer(A, staffA, PA, st, [{ amount: 10000, when: "WHEN_DONE" }]), c = drafts(), x = await start({ retainerId: r.id }); notSigned[st] = x.body?.code === "RETAINER_NOT_SIGNED" && drafts() === c ? x.status : -x.status; }
  ok("FO-7w1 R4 fail (AG-6-64 r2): DRAFT, SENT, CLIENT_SIGNED and WITHDRAWN retainers → 409 RETAINER_NOT_SIGNED, no draft written", Object.values(notSigned).every((s) => s === 409), notSigned);
  const r4 = retainer(A, staffA, PA, "SIGNED_OFFLINE", [{ amount: 30000, when: "ON_DATE" }]), d4 = await start({ retainerId: r4.id });
  ok("FO-7w1 R4 pass: a retainer signed on paper (SIGNED_OFFLINE) is billed", d4.status === 201 && lines(d4.body.id) === `FEE:30000:${ON}:${tax(30000)}:${r4.rows[0]}`, d4.body);

  // ---------------------------------------------------------------------- R5: whose retainer
  const rOther = retainer(A, staffA, PA2, "SIGNED", [{ amount: 10000, when: "WHEN_DONE" }]), rConsult = retainer(A, staffA, PA, "SIGNED", [{ amount: 10000, when: "WHEN_DONE" }], "CONSULTATION");
  const rB = retainer(B, staffB, PB, "SIGNED", [{ amount: 10000, when: "WHEN_DONE" }]);
  const c5 = drafts(), x5 = [await start({ retainerId: rOther.id }), await start({ retainerId: rConsult.id }), await start({ retainerId: rB.id }), await start({ retainerId: sql(`select gen_random_uuid()`) })];
  ok("FO-7w1 R5 fail: another client's retainer, a consultation agreement, firm B's retainer and an unknown id → 404, no draft written", x5.every((x) => x.status === 404) && drafts() === c5, x5.map((x) => x.status));
  const p5 = await start({ retainerId: rOther.id, personId: PA2 });
  ok("FO-7w1 R5 pass: the same retainer billed to its own signer → 201; firm B bills its own retainer", p5.status === 201 && (await call(tB, "POST", M, { personId: PB, currency: "CAD", retainerId: rB.id })).status === 201, p5.body);

  // ---------------------------------------------------------------------- R6: currency
  const r6 = retainer(A, staffA, PA, "SIGNED", [{ amount: 10000, when: "WHEN_DONE" }]), c6 = drafts(), d6 = await start({ retainerId: r6.id, currency: "USD" });
  ok("FO-7w1 R6 fail: a USD draft on a CAD retainer row → 422 at currency, nothing written", d6.status === 422 && d6.body.fields?.currency && drafts() === c6, d6.body);
  const d6c = await start({ retainerId: r6.id, currency: "CAD" });   // a fee row is CAD only (fo_retainer_fee_row_currency_check)
  ok("FO-7w1 R6 pass: the same row on a CAD draft (the row's currency) → 201, the line in CAD", d6c.status === 201 && sql(`select currency from money_invoice_line where invoice_id = '${d6c.body.id}'`) === "CAD", d6c.body);

  // ---------------------------------------------------------------------- R7: billed once
  const cAgain = drafts(), twice = await start({ retainerId: r1.id });
  ok("FO-7w1 R7 fail (break m1): the same retainer again (a double click, a reload) → 409 NOTHING_TO_BILL, no empty draft", twice.status === 409 && twice.body.code === "NOTHING_TO_BILL" && drafts() === cAgain, twice.body);
  const rDep = retainer(A, staffA, PA, "SIGNED", [{ amount: 50000, when: "ON_SIGNING" }, { amount: null, when: "WHEN_DONE" }]), cDep = drafts(), dDep = await start({ retainerId: rDep.id });
  ok("FO-7w1 R7 fail (break m1): a retainer with only a deposit and an open-amount row → 409 NOTHING_TO_BILL, no draft; naming the deposit bills it", dDep.status === 409 && dDep.body.code === "NOTHING_TO_BILL" && drafts() === cDep
    && (await start({ retainerId: rDep.id, feeRowIds: [rDep.rows[0]] })).status === 201, dDep.body);
  const again = await start({});   // a draft typed by hand, for the index and line cases below
  const c7 = drafts(), named = await start({ retainerId: r1.id, feeRowIds: [r1.rows[1]] });
  ok("FO-7w1 R7 fail: a billed row named again → 409 ROW_ON_INVOICE, nothing written", named.status === 409 && named.body.code === "ROW_ON_INVOICE" && drafts() === c7, named.body);
  const r7 = retainer(A, staffA, PA, "SIGNED", [{ amount: 12345, when: "WHEN_DONE" }]);
  // Five rounds of three at once (two unnamed, one named): with the retainer's lock, an unnamed start waits and then
  // skips a billed row (201, empty); without it, it would collide on the unique index and answer 409 (review m2).
  const rounds: string[] = [];
  for (let k = 0; k < 5; k++) {
    const r7 = retainer(A, staffA, PA, "SIGNED", [{ amount: 12345, when: "WHEN_DONE" }]);
    const both = await Promise.all([start({ retainerId: r7.id }), start({ retainerId: r7.id }), start({ retainerId: r7.id, feeRowIds: [r7.rows[0]] })]);
    const withLine = both.filter((x) => x.status === 201 && x.body.lines.length === 1).length, unnamedOk = both.slice(0, 2).every((x) => (x.status === 201 && x.body.lines.length === 1) || (x.status === 409 && x.body.code === "NOTHING_TO_BILL"));
    const namedOk = both[2].status === 201 || (both[2].status === 409 && both[2].body.code === "ROW_ON_INVOICE");
    if (!(withLine === 1 && unnamedOk && namedOk && Number(sql(`select count(*) from money_invoice_line where source_fee_row_id = '${r7.rows[0]}'`)) === 1)) rounds.push(JSON.stringify(both.map((x) => [x.status, x.body?.code, x.body?.lines?.length])));
  }
  ok("FO-7w1 R7 pass (two at once, 5 rounds): three drafts started at once from one row → the row is on exactly one line; each unnamed start bills it or answers 409 NOTHING_TO_BILL (never a collision); the named one 201 or 409 ROW_ON_INVOICE", rounds.length === 0, rounds);
  ok("FO-7w1 R7 fail: the database refuses a second line of the same row (the unique index)",
    refused(`insert into money_invoice_line (firm_id, invoice_id, position, kind, description, unit_amount_minor, amount_minor, currency, source_fee_row_id) values ('${A}', '${again.body.id}', 1, 'FEE', 'x', 1, 1, 'CAD', '${r1.rows[1]}')`, /unique|duplicate/));

  // ---------------------------------------------------------------------- R8: roles
  const r8 = retainer(A, staffA, PA, "SIGNED", [{ amount: 40000, when: "WHEN_DONE" }]), d8 = await start({ retainerId: r8.id }, tO);
  ok("FO-7w1 R8 pass (AG-6-65 r8): a Case Officer (agent/invoice:create) starts the draft from the retainer", d8.status === 201 && lines(d8.body.id).startsWith("FEE:40000:"), d8.body);
  ok("FO-7w1 R8 fail: the Case Officer cannot issue it (agent/invoice:issue → 403); no session → 401",
    (await call(tO, "POST", `${M}/${d8.body.id}/issue`)).status === 403 && (await call(undefined, "POST", M, { personId: PA, retainerId: r8.id })).status === 401);

  // ---------------------------------------------------------------------- R9: one audit line
  const line1 = sql(`select detail::text from audit_event where action = 'invoice.draft_created' and entity_key = '${d1.body.id}'`);
  ok("FO-7w1 R9 pass: one invoice.draft_created line names the retainer and the row ids billed", d1.status === 201 && line1.includes(r1.id) && line1.includes(r1.rows[1]) && line1.includes(r1.rows[3]) && !line1.includes(r1.rows[0])
    && Number(sql(`select count(*) from audit_event where entity_key = '${d1.body.id}'`)) === 1 && audits() > a0, line1);
  const a9 = audits(); await start({ retainerId: rB.id });
  ok("FO-7w1 R9 fail: a refused start writes no audit line", audits() === a9);

  // ---------------------------------------------------------------------- R10: fixed once written
  ok("FO-7w1 R10 fail: a line's source row and an invoice's deposit mark cannot be changed (the database's gate)",
    refused(`update money_invoice_line set source_fee_row_id = null where invoice_id = '${d1.body.id}'`, /fixed when the line is made/) && refused(`update money_invoice set deposit = false where id = '${d2.body.id}'`, /fixed when the draft is made/));
  ok("FO-7w1 R10 pass: other changes still pass the gate: a draft's Bill-to and a line's description change, and the draft from the retainer issues",
    !refused(`update money_invoice set bill_to_province = 'ON' where id = '${d2.body.id}'`, /./) && !refused(`update money_invoice_line set description = 'Fee (Sample)' where invoice_id = '${d2.body.id}'`, /./) && (await call(tA, "POST", `${M}/${d1.body.id}/issue`)).status === 200);
  ok("FO-7w1 R10 pass: a hand-typed line keeps a null source (FO-7b's line route unchanged)",
    (await call(tA, "POST", `${M}/${again.body.id}/lines`, { kind: "FEE", description: "Typed fee (Sample)", unitMinor: 1000 })).status === 201 && lines(again.body.id).endsWith(":-"));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\nFO-7w1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
