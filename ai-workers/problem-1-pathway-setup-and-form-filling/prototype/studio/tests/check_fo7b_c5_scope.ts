// FO-7b's C5 fix (R1.56; #3305 M1, ruled by Lead 13 on #3305 and #3306): every FO-7b route on an existing invoice
// answers as FO-7q's detail read does (AG-6-1 §8, C5: an invoice is visible exactly when its case is, or its person or
// company when it has no case). An invoice of the caller's own firm outside their scope is the same 404 as a missing one,
// with nothing written. Each route is a pass (in scope) and a fail (out of scope); the three named in #3305 first:
//   S1 GET …/invoices/:id · S2 GET …/:id/pdf · S3 POST …/:id/credit-notes;
//   the sweep (every other FO-7b route on an existing invoice): S4 receipt and credit-note PDFs · S5 POST …/:id/lines ·
//   S6 PUT …/:id/bill-to · S7 POST …/:id/issue · S8 POST …/:id/send · S9 POST …/:id/payments · S10 POST
//   …/payments/:id/refunds and …/extra · S11 GET …/tax-default?invoiceId= · S12 the 404 says nothing more than a missing one.
// Lead 14's ruling on #3321: S13 a new draft and the tax default for a party outside scope are 404, nothing written;
//   L1-L5 the linked parties of the caller's cases join the party scope, for invoices with no case only: L1 a client
//   opened on the case side (no prospect) whose case user-O sees is drafted, lined and issued; L2 the same client of a
//   case user-O does not see is 404 on create and on each route; L3 another firm's case link opens nothing; L4 an
//   invoice on a case user-O does not see stays 404 though its party is linked to a case they see; L5 the Owner reaches
//   L1's client.
// Fail first: every out-of-scope case answered 200/201 on main before the fix (the PR names the run).
// The caller: user-O, a Case Officer, given the money keys and limited to their own cases (agent/case:view.all taken
// from the role) in this database only (so only C5 decides), with "everyone
// sees all" off: user-O sees the subject of their own prospect (PI), not user-R's (PX) (CS-MV1's PgMoneyVisibility).
// A scratch database (every migration; prospects written with the replica role, as check_csmv1_money_visibility.ts does),
// FO-7b's, FO-7g's and the refunds features in a Nest app with PF-4's guard and PF-12's walls; the local sign-in
// stand-in; a fake mail port. No network, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7b_c5_scope.ts
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

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7bc5_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const invoicesFeature = (await import("../api/src/features/client-money-invoices.ts")).default;
const refundsFeature = (await import("../api/src/features/client-money-refunds.ts")).default;
const taxFeature = (await import("../api/src/features/client-money-tax.ts")).default;
const readsFeature = (await import("../api/src/features/client-money-reads.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7bc5-check-signing-key-0123456789abcdef", () => clock.now());
const mail = fakeMail();
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const features = [invoicesFeature, refundsFeature, taxFeature, readsFeature];
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...features.flatMap((f) => f.providers as unknown[])];
  @Module({ controllers: [PlatformIdentityController, ...features.flatMap((f) => f.controllers as unknown[])] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (token: string, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* bytes */ } return { status: r.status, body: b };
  };
  await seedSampleFirms(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  sql(`update platform_firm set business_address = '{"province_state":"ON"}'::jsonb where id = '${A}'`);
  sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7b-c5', now())`);
  const everyoneSeesAll = (on: boolean) => sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'; insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.everyone_sees_all', '${on}'::jsonb, 'seed:FO-7b-c5')`);
  everyoneSeesAll(true);   // while user-R makes the invoices of both parties; off before user-O is tried
  // the money keys for a Case Officer, in this database only: so only C5 decides what user-O reaches
  for (const k of ["agent/invoice:edit", "agent/invoice:issue", "agent/invoice:void", "agent/payment:record", "agent/refund:create"])
    sql(`insert into platform_role_permission (role, permission_key) select 'CASE_OFFICER', '${k}' where not exists (select 1 from platform_role_permission where role = 'CASE_OFFICER' and permission_key = '${k}')`);
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/case:view.all'`);   // own cases only (agent/case:view.own stays)
  const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
  const R = staff("user-R"), O = staff("user-O");
  const rep = (q: string) => sql(`set session_replication_role = replica; ${q}`);
  let pn = 0;
  const party = (name: string, ownerStaff: string) => { const id = randomUUID();
    rep(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${id}', '${A}', '${name}', 'Sample', 'fo7bc5.${id.slice(0, 6)}@example.org', 'seed:FO-7b-c5', now());
      insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at, won_via, won_at)
      values ('${randomUUID()}', '${A}', 'P-${String(++pn).padStart(5, "0")}', '${randomUUID()}', 'INDIVIDUAL', '${randomUUID()}', '${id}', '${id}', '${ownerStaff}', 'seed:FO-7b-c5', now(), 'CONVERTED', now())`);
    return id; };
  const PI = party("Client In", O), PX = party("Client Out", R);   // user-O owns PI's prospect; PX's is user-R's
  const signIn = async (actorId: string) => {
    const s = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) });
    const b = await s.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token; };
  const tR = await signIn("user-R"), tO = await signIn("user-O");
  const M = "/front-office/money/invoices";
  let k = 0;
  /** One invoice of `person`, made by user-R (who sees both): a draft, or issued and paid with one extra cent. */
  const make = async (person: string, how: "draft" | "issued" | "paid" | "credited") => {
    const d = await call(tR, "POST", M, { personId: person, currency: "CAD" }); if (d.status !== 201) throw new Error(JSON.stringify(d.body));
    await call(tR, "POST", `${M}/${d.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor: 10000 });
    if (how === "draft") return { id: d.body.id as string };
    await call(tR, "POST", `${M}/${d.body.id}/issue`);
    let payment: string | undefined, note: string | undefined;
    if (how === "paid") payment = (await call(tR, "POST", `${M}/${d.body.id}/payments`, { method: "CASH", amountMinor: 20000, idempotencyKey: `fo7bc5-${++k}` })).body?.id;
    if (how === "credited") note = (await call(tR, "POST", `${M}/${d.body.id}/credit-notes`, { full: false, amountMinor: 100, reason: "Goodwill (Sample)" })).body?.id;
    return { id: d.body.id as string, payment, note };
  };
  const inD = await make(PI, "draft"), outD = await make(PX, "draft"), inI = await make(PI, "issued"), outI = await make(PX, "issued");
  const inP = await make(PI, "paid"), outP = await make(PX, "paid"), inC = await make(PI, "credited"), outC = await make(PX, "credited");
  const inPay = await make(PI, "issued"), outPay = await make(PX, "issued");   // S9's own pair (S3 cancels inI)
  ok("setup: user-R made the invoices (drafts, issued, paid with an extra, credited) of both parties", [inD, outD, inI, outI, inPay, outPay].every((x) => x.id) && inP.payment && outP.payment && inC.note && outC.note, { inP, outP, inC, outC });
  everyoneSeesAll(false);
  const scopeO = await call(tO, "GET", `${M}?pageSize=200`);
  ok("setup: FO-7q's list (the C5 the routes must match) shows user-O PI's invoices and none of PX's", scopeO.status === 200 && scopeO.body.items.some((r: { id: string }) => r.id === inI.id) && !scopeO.body.items.some((r: { id: string }) => [outD.id, outI.id, outP.id, outC.id].includes(r.id)), scopeO.body?.items?.length);
  const count = (table: string) => sql(`select count(*) from ${table} where firm_id = '${A}'`);
  const missing = randomUUID();
  const notFound = (r: Res) => r.status === 404;

  // ------------------------------------------------------------------------- S1-S3: the three routes named in #3305
  const s1i = await call(tO, "GET", `${M}/${inI.id}`), s1o = await call(tO, "GET", `${M}/${outI.id}`);
  ok("FO-7b C5 S1 pass: GET …/:id of an invoice in user-O's scope → 200", s1i.status === 200 && s1i.body.id === inI.id, s1i.status);
  ok("FO-7b C5 S1 fail: GET …/:id of an invoice of the firm outside user-O's scope → 404", notFound(s1o), s1o);
  const s2i = await call(tO, "GET", `${M}/${inI.id}/pdf`), s2o = await call(tO, "GET", `${M}/${outI.id}/pdf`);
  ok("FO-7b C5 S2 pass: GET …/:id/pdf in scope → 200", s2i.status === 200, s2i.status);
  ok("FO-7b C5 S2 fail: GET …/:id/pdf outside scope → 404", notFound(s2o), s2o.status);
  const notes0 = count("money_credit_note"), audit0 = count("audit_event");
  const s3o = await call(tO, "POST", `${M}/${outI.id}/credit-notes`, { full: true, reason: "Cancelled (Sample)" });
  ok("FO-7b C5 S3 fail: POST …/:id/credit-notes outside scope → 404, no credit note and no audit line written", notFound(s3o) && count("money_credit_note") === notes0 && count("audit_event") === audit0, { status: s3o.status, notes: [notes0, count("money_credit_note")] });
  const s3i = await call(tO, "POST", `${M}/${inI.id}/credit-notes`, { full: true, reason: "Cancelled (Sample)" });
  ok("FO-7b C5 S3 pass: POST …/:id/credit-notes in scope → 201, one credit note", s3i.status === 201 && Number(count("money_credit_note")) === Number(notes0) + 1, s3i);

  // ---------------------------------------------------------------------------------------------- the sweep
  const s4o = await call(tO, "GET", `${M}/${outP.id}/payments/${outP.payment}/receipt.pdf`), s4c = await call(tO, "GET", `${M}/${outC.id}/credit-notes/${outC.note}/pdf`);
  const s4i = await call(tO, "GET", `${M}/${inP.id}/payments/${inP.payment}/receipt.pdf`), s4ic = await call(tO, "GET", `${M}/${inC.id}/credit-notes/${inC.note}/pdf`);
  ok("FO-7b C5 S4 pass: the receipt and the credit-note PDF in scope → 200", s4i.status === 200 && s4ic.status === 200, [s4i.status, s4ic.status]);
  ok("FO-7b C5 S4 fail: the receipt and the credit-note PDF outside scope → 404", notFound(s4o) && notFound(s4c), [s4o.status, s4c.status]);
  const lines0 = count("money_invoice_line");
  const s5o = await call(tO, "POST", `${M}/${outD.id}/lines`, { kind: "FEE", description: "Out (Sample)", unitMinor: 500 });
  ok("FO-7b C5 S5 fail: POST …/:id/lines on a draft outside scope → 404, no line written", notFound(s5o) && count("money_invoice_line") === lines0, { status: s5o.status });
  const s5i = await call(tO, "POST", `${M}/${inD.id}/lines`, { kind: "FEE", description: "In (Sample)", unitMinor: 500 });
  ok("FO-7b C5 S5 pass: POST …/:id/lines on a draft in scope → 201", s5i.status === 201, s5i.status);
  const s6o = await call(tO, "PUT", `${M}/${outD.id}/bill-to`, { province: "NS" }), s6i = await call(tO, "PUT", `${M}/${inD.id}/bill-to`, { province: "NS" });
  ok("FO-7b C5 S6 fail: PUT …/:id/bill-to outside scope → 404, the Bill-to unchanged", notFound(s6o) && sql(`select coalesce(bill_to_province, '') from money_invoice where id = '${outD.id}'`) === "ON", s6o.status);
  ok("FO-7b C5 S6 pass: PUT …/:id/bill-to in scope → 200", s6i.status === 200, s6i.status);
  const s7o = await call(tO, "POST", `${M}/${outD.id}/issue`);
  ok("FO-7b C5 S7 fail: POST …/:id/issue outside scope → 404, still a draft", notFound(s7o) && sql(`select issued_at is null from money_invoice where id = '${outD.id}'`) === "t", s7o.status);
  const s7i = await call(tO, "POST", `${M}/${inD.id}/issue`);
  ok("FO-7b C5 S7 pass: POST …/:id/issue in scope → 200", s7i.status === 200, s7i.status);
  const sent0 = mail.sent.length, s8o = await call(tO, "POST", `${M}/${outPay.id}/send`), s8i = await call(tO, "POST", `${M}/${inP.id}/send`);
  ok("FO-7b C5 S8 fail: POST …/:id/send outside scope → 404, no email for it", notFound(s8o) && !mail.sent.slice(sent0).some((m) => JSON.stringify(m).includes(outPay.id)), s8o.status);
  ok("FO-7b C5 S8 pass: POST …/:id/send in scope → 200", s8i.status === 200, s8i.status);
  const pays0 = count("money_payment"), s9o = await call(tO, "POST", `${M}/${outPay.id}/payments`, { method: "CASH", amountMinor: 100, idempotencyKey: "fo7bc5-out" });
  ok("FO-7b C5 S9 fail: POST …/:id/payments outside scope → 404, no payment written", notFound(s9o) && count("money_payment") === pays0, s9o.status);
  const s9i = await call(tO, "POST", `${M}/${inPay.id}/payments`, { method: "CASH", amountMinor: 100, idempotencyKey: "fo7bc5-in" });
  ok("FO-7b C5 S9 pass: POST …/:id/payments in scope → 201", s9i.status === 201, s9i);
  const refunds0 = count("money_refund"), P = "/front-office/money/payments";
  const s10o = await call(tO, "POST", `${P}/${outP.payment}/refunds`, { amountMinor: 100, reason: "Out (Sample)", method: "CASH", idempotencyKey: "fo7bc5-r-out" });
  const s10x = await call(tO, "POST", `${P}/${outP.payment}/extra`, { choice: "KEEP_AS_CREDIT" });
  ok("FO-7b C5 S10 fail: a refund and the extra's choice on a payment outside scope → 404, nothing refunded or kept", notFound(s10o) && notFound(s10x) && count("money_refund") === refunds0
    && sql(`select count(*) from money_credit_entry where firm_id = '${A}'`) === "0", [s10o.status, s10x.status]);
  const s10i = await call(tO, "POST", `${P}/${inP.payment}/extra`, { choice: "KEEP_AS_CREDIT" });
  ok("FO-7b C5 S10 pass: the extra's choice on a payment in scope → 201", s10i.status === 201, s10i);
  const T = "/front-office/money/tax-default";
  const s11o = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${PX}&invoiceId=${outD.id}`), s11i = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${PI}&invoiceId=${inD.id}`);
  ok("FO-7b C5 S11 fail: the tax default for an invoice outside scope → 404", notFound(s11o), s11o.status);
  ok("FO-7b C5 S11 pass: the tax default for an invoice in scope → 200", s11i.status === 200, s11i.status);
  const s11x = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${PX}&invoiceId=${randomUUID()}`), s11gone = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${randomUUID()}&invoiceId=${randomUUID()}`);
  ok("FO-7b C5 S11 fail (review/breaker m5, round 3): with an invoice id, a person outside scope answers word for word as a person who does not exist",
    notFound(s11x) && JSON.stringify(s11x.body) === JSON.stringify(s11gone.body), { out: s11x.body, gone: s11gone.body });

  // ------------------------------------------------------------- S13 + L1-L5: Lead 14's ruling on #3321
  const B = sql(`select id from platform_firm where key = 'sample-solo'`), WS = randomUUID(); let cn = 0;
  sql(`insert into workspace (id, key, label) values ('${WS}', 'fo7bc5-${WS.slice(0, 8)}', 'FO-7b C5 (Sample)')`);
  const bare = (firm: string, name: string) => { const id = randomUUID(); rep(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${id}', '${firm}', '${name}', 'Sample', 'fo7bc5.${id.slice(0, 6)}@example.org', 'seed:FO-7b-c5', now())`); return id; };
  const caseOf = (firm: string, firmKey: string, person: string) => { const id = randomUUID(), client = randomUUID(); cn++;
    rep(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values ('${client}', '${WS}', '${firmKey}', '${firm}', ${cn}, 'Client ${cn} (Sample)', 'PERSON', '${person}', 'seed:FO-7b-c5');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values ('${id}', '${WS}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(900 + cn).padStart(5, "0")}', '${firmKey}', '${firm}', '${client}', 'OPEN')`);
    return id; };
  const onTeam = (caseId: string, userId: string) => sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values ('${randomUUID()}', '${WS}', '${caseId}', '${userId}', 'OFFICER', 'user-R')`);
  // CS: a client opened on the case side (no prospect), of case K (user-O on its team); CL: of case L (user-T's team);
  // CX: a firm A person whom only a firm B case links (L3)
  const CS = bare(A, "Client Side"), CL = bare(A, "Client Elsewhere"), CX = bare(A, "Client Linked From B");
  const K = caseOf(A, "sample-firm", CS), L = caseOf(A, "sample-firm", CL); onTeam(K, "user-O"); onTeam(L, "user-T");
  caseOf(B, "sample-solo", CX);
  const PZ = bare(A, "Client Nobody");   // no prospect and no case: no one's
  const drafts0 = count("money_invoice"), tax0 = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${PZ}`);
  const s13 = await call(tO, "POST", M, { personId: PZ, currency: "CAD" }), s13gone = await call(tO, "POST", M, { personId: randomUUID(), currency: "CAD" });
  ok("FO-7b C5 S13 fail: a new draft for a party outside scope → 404 in the words of a missing person, nothing written", notFound(s13) && JSON.stringify(s13.body) === JSON.stringify(s13gone.body) && count("money_invoice") === drafts0, s13);
  ok("FO-7b C5 S13 fail: the tax default for a party outside scope → 404", notFound(tax0), tax0.status);
  const l1 = await call(tO, "POST", M, { personId: CS, currency: "CAD" });
  const l1line = l1.status === 201 ? await call(tO, "POST", `${M}/${l1.body.id}/lines`, { kind: "FEE", description: "Fee (Sample)", unitMinor: 10000 }) : l1;
  const l1issue = l1.status === 201 ? await call(tO, "POST", `${M}/${l1.body.id}/issue`) : l1, l1tax = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${CS}`);
  ok("FO-7b C5 L1 pass: CS, a case-side client with no prospect whose case K user-O sees, is drafted (201), lined (201) and issued (200); its tax default answers (200)",
    l1.status === 201 && l1line.status === 201 && l1issue.status === 200 && l1tax.status === 200, [l1.status, l1line.status, l1issue.status, l1tax.status]);
  const l2 = await call(tO, "POST", M, { personId: CL, currency: "CAD" });
  everyoneSeesAll(true); const rCL = await make(CL, "draft"), rCLi = await make(CL, "issued"); everyoneSeesAll(false);
  const l2r = [await call(tO, "GET", `${M}/${rCLi.id}`), await call(tO, "GET", `${M}/${rCLi.id}/pdf`), await call(tO, "POST", `${M}/${rCL.id}/lines`, { kind: "FEE", description: "x (Sample)", unitMinor: 100 }),
    await call(tO, "POST", `${M}/${rCL.id}/issue`), await call(tO, "POST", `${M}/${rCLi.id}/credit-notes`, { full: true, reason: "x (Sample)" })];
  ok("FO-7b C5 L2 fail: CL, the client of case L user-O does not see, is 404 on create and on read, PDF, lines, issue and credit", notFound(l2) && l2r.every(notFound), [l2.status, ...l2r.map((r) => r.status)]);
  const l3 = await call(tO, "POST", M, { personId: CX, currency: "CAD" }), l3r = await call(tR, "POST", M, { personId: CX, currency: "CAD" });
  ok("FO-7b C5 L3 fail: a firm A person linked only by a firm B case opens nothing in firm A, for user-O or the Owner", notFound(l3) && notFound(l3r), [l3.status, l3r.status]);
  everyoneSeesAll(true);
  const onL = await call(tR, "POST", M, { personId: CS, currency: "CAD" }); if (onL.status === 201) sql(`update money_invoice set case_id = '${L}' where id = '${onL.body.id}'`);
  everyoneSeesAll(false);
  const l4 = await call(tO, "GET", `${M}/${onL.body?.id}`), l4list = await call(tO, "GET", `${M}?pageSize=200`);
  ok("FO-7b C5 L4 fail: an invoice of CS put on case L (not user-O's) stays 404 and off the list, though CS is linked to K, which user-O sees",
    onL.status === 201 && notFound(l4) && !l4list.body.items.some((r: { id: string }) => r.id === onL.body.id), [onL.status, l4.status]);
  const l4tax = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${CS}&invoiceId=${onL.body?.id}`), l1taxInv = await call(tO, "GET", `${T}?partyKind=PERSON&partyId=${CS}&invoiceId=${l1.body?.id}`);
  ok("FO-7b C5 L4 fail (review m1): the tax default for that invoice (case L) is 404, though its party CS is in user-O's scope: judged by the invoice", notFound(l4tax), l4tax.status);
  ok("FO-7b C5 L1 pass (review m1): the tax default for L1's case-less invoice of CS answers 200", l1taxInv.status === 200, l1taxInv.status);
  const l5 = await call(tR, "POST", M, { personId: CS, currency: "CAD" });
  ok("FO-7b C5 L5 pass: the Owner (every case) reaches CS through case K: a draft (201), with no prospect anywhere", l5.status === 201, l5.status);

  // ---------------------------------------------------------------------------------------- S12: no hint
  const gone = await call(tO, "GET", `${M}/${missing}`), goneRefund = await call(tO, "POST", `${P}/${randomUUID()}/refunds`, { amountMinor: 100, reason: "x (Sample)", method: "CASH", idempotencyKey: "fo7bc5-r-gone" });
  ok("FO-7b C5 S12 pass: out of scope answers word for word as a missing invoice (and a refund as a missing payment)",
    JSON.stringify(s1o.body) === JSON.stringify(gone.body) && JSON.stringify(s10o.body) === JSON.stringify(goneRefund.body), { out: s1o.body, gone: gone.body });
  const rR = await call(tR, "GET", `${M}/${outI.id}`), rRin = await call(tR, "GET", `${M}/${inI.id}`);
  ok("FO-7b C5 S12 pass: user-R, whose prospect PX is, still reads PX's invoice (200): C5 narrows, it does not hide from the right person", rR.status === 200, rR.status);
  ok("FO-7b C5 S12 fail: and with \"everyone sees all\" off user-R no longer reads PI's (user-O's prospect): the same rule both ways", notFound(rRin), rRin.status);
} finally {
  await app?.close(); await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* best effort */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
