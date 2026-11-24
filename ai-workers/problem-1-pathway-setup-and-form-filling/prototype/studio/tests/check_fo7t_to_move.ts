// FO-7t part 3 (R1.58; design/briefs/FO-7t.md part 3; AG-6-73 rules 1, 5, 6, §9, §12; Lead B's conditions rev 16.31;
// Lead 96's lock ruling on FO-7ts part 3; Code SOR/2022-128 s. 32(g) as FO-7a cites it; legal reading Unconfirmed: no
// counsel): the "To move" list between the firm's trust and operating accounts, "I moved these", "Undo this batch" and
// the 25-day item, through the routes under /api/front-office/money/trust/to-move and the reminder's jobs.
// The named cases of part 3, each a pass and a fail: DW1 (trust off: the part 3 routes), DW10 (walls, C5 and audit on
// them), DW11 (the list), DW12 (I moved these), DW13 (undo), DW14 (the 25-day item, clock injected) and DW18 (trust.moved).
// Parts 1-2 stay in check_fo7t_trust.ts and check_fo7t_money_out.ts, unchanged.
// Written before the build (tests first). The route contract it pins:
//   GET  /trust/to-move[?currency=CAD] (agent/payment:record) → { lines: [{ sourceEntryId, kind, direction, currency, personId,
//        companyId, caseId, invoiceId, openMinor, sourceDate, over25Days }], totals: [{ currency, direction, openMinor, lines }] }
//        read from money_to_move only, the lines the person may see (C5, as the ledger).
//   POST /trust/to-move/batches { currency, direction, transferDate, lines: [{ sourceEntryId, amountMinor }] } (agent/payment:record)
//        → 201 { batchId, currency, direction, transferDate, totalMinor, lines: [{ lineId, sourceEntryId, amountMinor }] }
//        lines whose entries are in two currencies, or not the batch's → 422 (one batch per currency, AG-6-73 §12; the brief's 400 is PF-28's 422 since Lead B rev 17.21); the
//        database's refusal → 409 MOVE_REFUSED in its words; the route holds no cap of its own.
//   POST /trust/to-move/batches/:id/undo { reason } (agent/payment:record) → 201 { batchId, undoesBatchId }; no reason → 422 (PF-28).
// Audit lines trust_money.moved and trust_money.move_undone, one per change, in its transaction. Field errors 422 (PF-28).
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices and FO-7t's trust,
// with the local sign-in stand-in; the mail, jobs, clock and notifications are the fakes. No network, no model call (US$0).
// Amounts are Sample. Dropped at the end, also when the feature is missing.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_to_move.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { fakeNotifications } from "../ports/notifications.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7t3_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
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
  const { ToMoveReminder, TO_MOVE_SWEEP_JOB, TO_MOVE_WAITING_JOB } = await import("../api/src/client-money/trust/to-move-reminder.ts");
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7t3-check-signing-key-0123456789abcdef", () => clock.now());
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
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7t3.${n}@example.org', 'seed:FO-7t-3', now()) returning id`);
  // P1 < P2 < Q by id (Lead 96's deadlock case, FO-7ts part 3 break R3-m1); PA a plain client; PB firm B's.
  const [P1, P2, Q] = [person(A, "p1"), person(A, "p2"), person(A, "q")].sort();
  const PA = person(A, "a"), PB = person(B, "b");
  // user-R: sample-firm's Owner (every money key); user-T: a Case Manager, given agent/payment:record here; user-O: a Case
  // Officer, no money key until DW10 (then agent/payment:record, seeing no case and no client: C5 fails closed); user-S:
  // sample-solo's Owner.
  const tR = await signIn("user-R", "sample-firm"), tT = await signIn("user-T", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
  const [staffR, staffT, staffO] = [staff("user-R"), staff("user-T"), staff("user-O")];
  const W = "00000000-0000-4000-8000-0000000f37a0", CLIENT_A = "00000000-0000-4000-8000-0000000f37a1", CLIENT_Q = "00000000-0000-4000-8000-0000000f37a2", CLIENT_B = "00000000-0000-4000-8000-0000000f37a3";
  const CASE = "00000000-0000-4000-8000-0000000f37b1", CASE_Q = "00000000-0000-4000-8000-0000000f37b2", CASE_B = "00000000-0000-4000-8000-0000000f37b4";
  sql(`set session_replication_role = replica;
    insert into workspace (id, key, label) values ('${W}', 'fo7t3-check', 'FO-7t part 3 (Sample)');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values
      ('${CLIENT_A}', '${W}', 'sample-firm', '${A}', 1, 'Client a (Sample)', 'PERSON', '${PA}', 'seed:FO-7t-3'),
      ('${CLIENT_Q}', '${W}', 'sample-firm', '${A}', 2, 'Client q (Sample)', 'PERSON', '${Q}', 'seed:FO-7t-3'),
      ('${CLIENT_B}', '${W}', 'sample-solo', '${B}', 1, 'Client b (Sample)', 'PERSON', '${PB}', 'seed:FO-7t-3');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values
      ('${CASE}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07301', 'sample-firm', '${A}', '${CLIENT_A}', 'OPEN'),
      ('${CASE_Q}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07302', 'sample-firm', '${A}', '${CLIENT_Q}', 'OPEN'),
      ('${CASE_B}', '${W}', gen_random_uuid(), 'user-P', 'user-S', 'C-2026-07301', 'sample-solo', '${B}', '${CLIENT_B}', 'OPEN');
    insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/payment:record') on conflict do nothing`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, trust_details, updated_by, updated_at) values ('${f}', 'Trust account (Sample)', 'seed:FO-7t-3', now())`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const events = (type: string) => Number(sql(`select count(*) from module_event where type = '${type}'`));
  const batches = () => Number(sql(`select count(*) from money_move_batch`));
  const open = (src: string) => Number(sql(`select coalesce((select open_minor from money_to_move where source_entry_id = '${src}' and direction = 'TRUST_TO_OPERATING'), 0)`));
  let k = 0;
  const deposit = async (personId: string, caseId: string | null, amountMinor: number, t = tR) => {
    const r = await call(t, "POST", "/deposits", { personId, ...(caseId ? { caseId } : {}), method: "E_TRANSFER", amountMinor, currency: "CAD", idempotencyKey: `fo7t3-dep-${++k}` });
    if (r.status !== 201) throw new Error(`deposit: ${JSON.stringify(r.body)}`); return r.body;
  };
  const issued = async (personId: string, caseId: string | null, unitMinor: number) => {
    const d = await raw(tR, "POST", "/invoices", { personId, currency: "CAD" }); if (d.status !== 201) throw new Error(`draft: ${JSON.stringify(d.body)}`);
    const l = await raw(tR, "POST", `/invoices/${d.body.id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 }); if (l.status >= 300) throw new Error(`line: ${JSON.stringify(l.body)}`);
    if (caseId) sql(`set session_replication_role = replica; update money_invoice set case_id = '${caseId}' where id = '${d.body.id}'`);
    const r = await raw(tR, "POST", `/invoices/${d.body.id}/issue`); if (r.status !== 200) throw new Error(`issue: ${JSON.stringify(r.body)}`);
    return d.body.id as string;
  };
  const apply = async (body: Record<string, unknown>, t = tR) => call(t, "POST", "/applications", body);
  const applied = async (body: Record<string, unknown>) => { const r = await apply(body); if (r.status !== 201) throw new Error(`apply: ${JSON.stringify(r.body)}`); return r.body.entryId as string; };
  const list = (t = tR, q = "") => call(t, "GET", `/to-move${q}`);
  const today = new Date().toISOString().slice(0, 10);
  const move = (lines: { sourceEntryId: string; amountMinor: number }[], t = tR, o: Record<string, unknown> = {}) => call(t, "POST", "/to-move/batches", { currency: "CAD", direction: "TRUST_TO_OPERATING", transferDate: today, lines, ...o });
  const undo = (id: string, body: Record<string, unknown> = { reason: "The bank sent the transfer back (Sample)" }, t = tR) => call(t, "POST", `/to-move/batches/${id}/undo`, body);

  // ------------------------------------------------------------------------------------- DW1: trust off (part 3 routes)
  const NIL = "00000000-0000-4000-8000-000000000001";
  const offB = await Promise.all([list(tS), move([{ sourceEntryId: NIL, amountMinor: 1 }], tS), undo(NIL, undefined, tS)]);
  ok("FO-7t DW1 fail: firm B UNANSWERED with nothing held: the To move list, I moved these and Undo answer 404 (no trust route answers), nothing written",
    offB.every((r) => r.status === 404) && batches() === 0, offB.map((r) => [r.status, r.body]));
  await call(tR, "PUT", "/answer", { answer: "YES" }); await call(tS, "PUT", "/answer", { answer: "YES" });
  const onB = await list(tS);
  ok("FO-7t DW1 pass (the same route, trust on): with YES the list answers 200, empty, with no totals", onB.status === 200 && onB.body.lines?.length === 0 && onB.body.totals?.length === 0, onB);

  // ------------------------------------------------------------------------------------------ DW11: the To move list
  await deposit(PA, CASE, 113000);
  const I1 = await issued(PA, CASE, 16950), I2 = await issued(PA, CASE, 96050);
  const W1 = await applied({ invoiceId: I1, amountMinor: 16950 }), W2 = await applied({ invoiceId: I2, amountMinor: 96050 });
  const l1 = await list();
  const tot = (b: any, cur = "CAD", dir = "TRUST_TO_OPERATING") => b?.totals?.find((x: any) => x.currency === cur && x.direction === dir);   // eslint-disable-line @typescript-eslint/no-explicit-any
  ok("FO-7t DW11 pass (AG-6-73 test): INV 169.50 and INV 960.50 paid from trust → CAD 1,130.00 trust → operating, two lines, each its withdrawal's open amount",
    l1.status === 200 && tot(l1.body)?.openMinor === 113000 && tot(l1.body)?.lines === 2 && l1.body.lines.find((x: any) => x.sourceEntryId === W1)?.openMinor === 16950   // eslint-disable-line @typescript-eslint/no-explicit-any
    && l1.body.lines.every((x: any) => x.over25Days === false && x.direction === "TRUST_TO_OPERATING" && x.currency === "CAD"), l1.body);   // eslint-disable-line @typescript-eslint/no-explicit-any
  sql(`insert into money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, corrects_entry_id, reason, created_by) values ('${A}', '${PA}', '${CASE}', 'CORRECTION', 96050, 'CAD', '${W2}', 'Returned before moving: invoice disputed (Sample)', 'user-R')`);
  const l2 = await list();
  ok("FO-7t DW11 fail → pass (AG-6-73 test): a return of 960.50 before moving → the list says 169.50, one line; the returned withdrawal is no longer listed",
    tot(l2.body)?.openMinor === 16950 && tot(l2.body)?.lines === 1 && !l2.body.lines.some((x: any) => x.sourceEntryId === W2), l2.body);   // eslint-disable-line @typescript-eslint/no-explicit-any
  const lUsd = await list(tR, "?currency=USD");
  ok("FO-7t DW11 pass: ?currency=USD reads only USD lines (none here); a currency that is not one → 422", lUsd.status === 200 && lUsd.body.lines.length === 0 && fieldError((await list(tR, "?currency=EUR")).status), lUsd.body);

  // ------------------------------------------------------------------------------------------- DW12: I moved these
  const I3 = await issued(PA, CASE, 1000);
  const W3 = await applied({ invoiceId: I3, amountMinor: 1000 });
  const twoCur = await move([{ sourceEntryId: W1, amountMinor: 100 }], tR, { currency: "USD" });
  ok("FO-7t DW12 fail (AG-6-73 §12): a CAD line in a USD batch → 422 on lines (one batch per currency), nothing written", fieldError(twoCur.status) && /currency/i.test(JSON.stringify(twoCur.body)) && batches() === 0, twoCur.body);
  const noDate = await move([{ sourceEntryId: W1, amountMinor: 100 }], tR, { transferDate: undefined });
  const future = await move([{ sourceEntryId: W1, amountMinor: 100 }], tR, { transferDate: "2999-01-01" });
  ok("FO-7t DW12 fail: no transfer date, or one in the future → 422, nothing written", fieldError(noDate.status) && fieldError(future.status) && batches() === 0, [noDate.body, future.body]);
  const old1999 = await move([{ sourceEntryId: W1, amountMinor: 100 }], tR, { transferDate: "1999-12-31" }), old0001 = await move([{ sourceEntryId: W1, amountMinor: 100 }], tR, { transferDate: "0001-01-01" });
  ok("FO-7t DW12 fail (break M1): a transfer date before 2000 (the database's own bound, money_move_batch_date_check) → 422 on transferDate, never a 500, nothing written",
    [old1999, old0001].every((r) => fieldError(r.status) && r.body.fields?.transferDate) && batches() === 0, [old1999.body, old0001.body]);
  const keyless = await move([{ sourceEntryId: W1, amountMinor: 100 }], tO);
  ok("FO-7t DW12 fail (keys): a Case Officer without agent/payment:record → 403", keyless.status === 403, keyless.body);
  const over = await move([{ sourceEntryId: W1, amountMinor: 16951 }]);
  ok("FO-7t DW12 fail: a move over the open amount (169.51 of 169.50) → 409 MOVE_REFUSED with the database's words; the route holds no cap of its own (its input check passed, the database refused)",
    over.status === 409 && over.body.code === "MOVE_REFUSED" && /money_move_line|moves? /i.test(over.body.detail ?? "") && batches() === 0 && open(W1) === 16950, over.body);
  const race = await Promise.all([move([{ sourceEntryId: W1, amountMinor: 16950 }], tR), move([{ sourceEntryId: W1, amountMinor: 16950 }], tT)]);
  const won = race.filter((r) => r.status === 201), lost = race.filter((r) => r.status === 409);
  ok("FO-7t DW12 pass: two people ticking the same line at once → one batch (201), the other 409 MOVE_REFUSED; the line moved once",
    won.length === 1 && lost.length === 1 && lost[0].body.code === "MOVE_REFUSED" && batches() === 1 && open(W1) === 0, race.map((r) => [r.status, r.body]));
  const moved = won[0].body;
  ok("FO-7t DW12 pass: the batch answers its id, the transfer date, the total and its lines; the moved amount leaves the list",
    moved.totalMinor === 16950 && moved.transferDate === today && moved.lines?.length === 1 && moved.lines[0].sourceEntryId === W1 && !(await list()).body.lines.some((x: any) => x.sourceEntryId === W1), moved);   // eslint-disable-line @typescript-eslint/no-explicit-any
  const part = await move([{ sourceEntryId: W3, amountMinor: 400 }]);
  ok("FO-7t DW12 pass: part of a line (CAD 4.00 of 10.00) → 201; CAD 6.00 stays on the list", part.status === 201 && open(W3) === 600 && tot((await list()).body)?.openMinor === 600, part.body);
  const empty = await move([]);
  ok("FO-7t DW12 fail: no line → 422, nothing written", fieldError(empty.status) && batches() === 2, empty.body);
  const tooMany = await move(Array.from({ length: 101 }, () => ({ sourceEntryId: W3, amountMinor: 1 })));
  ok("FO-7t DW12 fail: 101 lines → 422 (at most 100 a batch, so its audit line names every line), nothing written", fieldError(tooMany.status) && batches() === 2, tooMany.body);
  const gone = await move([{ sourceEntryId: randomUUID(), amountMinor: 1 }]);
  ok("FO-7t DW12 fail: a line naming no trust entry of the firm → 404, nothing written", gone.status === 404 && batches() === 2, gone.body);

  // ------------------------------------------------------------------------------------------------- DW13: undo
  const noReason = await undo(moved.batchId, {});
  ok("FO-7t DW13 fail (AG-6-73 rule 6): an undo without a reason → 422, nothing written", fieldError(noReason.status) && batches() === 2, noReason.body);
  const u1 = await undo(moved.batchId);
  ok("FO-7t DW13 pass: an undo with a reason → 201 naming the batch it undoes; its lines go back to the list (169.50 open again)",
    u1.status === 201 && u1.body.undoesBatchId === moved.batchId && open(W1) === 16950 && (await list()).body.lines.some((x: any) => x.sourceEntryId === W1), u1.body);   // eslint-disable-line @typescript-eslint/no-explicit-any
  const uOld = await undo(moved.batchId, { reason: "Bank sent it back (Sample)", transferDate: "1999-12-31" });
  ok("FO-7t DW13 fail (break M1): an undo dated before 2000 → 422 on transferDate, never a 500, nothing written", fieldError(uOld.status) && uOld.body.fields?.transferDate && batches() === 3, uOld.body);
  const u2 = await undo(moved.batchId);
  ok("FO-7t DW13 fail: a second undo of the same batch → 409 MOVE_REFUSED (already undone), nothing written", u2.status === 409 && u2.body.code === "MOVE_REFUSED" && batches() === 3 && open(W1) === 16950, u2.body);
  const uu = await undo(u1.body.batchId);
  ok("FO-7t DW13 fail: an undo of an undo → 409 with the database's words", uu.status === 409 && /never undone/.test(uu.body.detail ?? ""), uu.body);

  // ------------------------------------------- Lead 96's lock ruling: 100 races of a batch against a pick, 0 deadlocks
  // P1 and P2 hold money on Q's case (written at the database: a deposit by the route names the case's own client);
  // each pays Q's invoice by the deliberate pick (FO-7ts P3). A batch moving P1's and P2's lines takes P1, then P2, then Q;
  // a pick by P2 on Q's invoice takes P2, then Q. Line by line the batch would hold Q and wait for P2 (R3-m1).
  for (const [p, amt] of [[P1, 20000], [P2, 40000]] as const) {
    const pay = randomUUID();
    sql(`insert into money_payment (id, firm_id, method, amount_minor, currency, received_into, received_at, idempotency_key, recorded_by, cleared) values ('${pay}', '${A}', 'E_TRANSFER', ${amt}, 'CAD', 'TRUST', now(), 'fo7t3-${pay}', 'user-R', true);
      insert into money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, payment_id, created_by) values ('${A}', '${p}', '${CASE_Q}', 'DEPOSIT', ${amt}, 'CAD', '${pay}', 'user-R')`);
  }
  const IQ = await issued(Q, CASE_Q, 60000);
  const WP1 = await applied({ invoiceId: IQ, amountMinor: 10000, pick: { personId: P1, reason: "P1 agreed to pay Q's fees (Sample)" } });
  const WP2 = await applied({ invoiceId: IQ, amountMinor: 10000, pick: { personId: P2, reason: "P2 agreed to pay Q's fees (Sample)" } });
  const rounds: Res[] = [];
  for (let i = 0; i < 100; i++) {
    rounds.push(...await Promise.all([move([{ sourceEntryId: WP1, amountMinor: 1 }, { sourceEntryId: WP2, amountMinor: 1 }]),
      apply({ invoiceId: IQ, amountMinor: 100 + i, pick: { personId: P2, reason: "P2 again (Sample)" } })]));
  }
  const bad = rounds.filter((r) => r.status !== 201);
  ok("FO-7t DW12 pass (Lead 96, R3-m1): 100 rounds of a two-line batch (P1's and P2's pick lines) against a pick by P2 on Q's invoice → all 200 answer 201, no deadlock (40P01), no 500",
    bad.length === 0 && open(WP1) === 9900 && open(WP2) === 9900, bad.slice(0, 3).map((r) => [r.status, r.body]));

  // ---------------------------------------------------------------------------- DW10: walls, C5 and audit
  const bList = await list(tS), bUndo = await undo(moved.batchId, undefined, tS), bMove = await move([{ sourceEntryId: W3, amountMinor: 1 }], tS);
  ok("FO-7t DW10 fail: firm B reads none of firm A's lines, and undoing or moving firm A's batch or line → 404", bList.body.lines?.length === 0 && bUndo.status === 404 && bMove.status === 404 && open(W3) === 600, [bList.body, bUndo.body, bMove.body]);
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all');
    insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/payment:record') on conflict do nothing`);
  const oList = await list(tO), oMove = await move([{ sourceEntryId: W3, amountMinor: 1 }], tO);
  ok("FO-7t DW10 fail (C5, fails closed): a Case Officer with agent/payment:record who sees no case and no client → an empty list, and moving a line it cannot see → 404, nothing written",
    oList.status === 200 && oList.body.lines.length === 0 && oList.body.totals.length === 0 && oMove.status === 404 && open(W3) === 600, [oList.body, oMove.body]);
  const before = batches(), oUndo = await undo(part.body.batchId, undefined, tO);
  ok("FO-7t DW10 fail (review M2, C5 on the undo): the same Case Officer undoing a batch whose line is on a case it cannot see → 404, nothing written, the batch still moved",
    oUndo.status === 404 && batches() === before && open(W3) === 600, oUndo.body);
  const tList = await list(tT);
  ok("FO-7t DW10 pass (C5): a Case Manager who sees the cases reads the same lines as the Owner", tList.status === 200 && tot(tList.body)?.openMinor === tot((await list()).body)?.openMinor, tList.body);
  const movedCount = Number(sql(`select count(*) from money_move_batch where undoes_batch_id is null`)), undone = Number(sql(`select count(*) from money_move_batch where undoes_batch_id is not null`));
  ok("FO-7t DW10 pass (audit): one trust_money.moved line per batch and one trust_money.move_undone per undo; every refusal above wrote none",
    movedCount === 102 && audits("trust_money.moved") === movedCount && undone === 1 && audits("trust_money.move_undone") === undone, { movedCount, undone, m: audits("trust_money.moved"), u: audits("trust_money.move_undone") });

  // ----------------------------------------------------------------------------------------- DW18: trust.moved
  const keys = sql(`select string_agg(distinct k, ',' order by k) from module_event, jsonb_object_keys(payload) k where type = 'trust.moved'`);
  ok("FO-7t DW18 pass: trust.moved once per batch and once per undo, from TRUST_EVENT", events("trust.moved") === movedCount + undone, events("trust.moved"));
  ok("FO-7t DW18 fail (AG-6-33 §10): its payload carries ids, the amount and its currency only — no name, reason or reference",
    !!keys && keys.split(",").every((x) => /Id$|^amountMinor$|^currency$/.test(x)) && !/reason|reference|name|email/i.test(keys), keys);

  // ------------------------------------------------------------------------- DW14: the 25-day item (clock injected)
  // The firm's open lines are minutes old (the database's time). The fake clock moves 25 and 26 days on; the job reads its
  // "now" from it, never the database's. Holders of agent/payment:record in firm A: user-R (Owner), user-T (Case Manager,
  // given it above), user-O (Case Officer, given it in DW10). Firm B's holder: user-S.
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = 'agent/payment:record'`);
  const fclock = new FakeClock(new Date()), jobs = fakeJobs(fclock), notes = fakeNotifications({ now: () => fclock.now() });
  const reminder = new ToMoveReminder({ db: owner as never, jobs, notifications: notes as never, clock: fclock });
  await reminder.register({ sweep: true });
  const start = fclock.now().getTime(), day = 86_400_000;
  const toA = () => notes.sent().filter((n) => n.kind === "trust-to-move-waiting" && n.item.id === A);
  const notifyCalls = () => jobs.jobs.filter((j) => j.name === TO_MOVE_WAITING_JOB && j.status === "done").length;
  await fclock.set(new Date(start + 25 * day - 60 * 60_000));
  ok("FO-7t DW14 fail: lines just under 25 days old (the daily sweep ran each day) → no item for anyone", toA().length === 0 && jobs.jobs.some((j) => j.name === TO_MOVE_SWEEP_JOB && j.status === "done"),
    jobs.jobs.filter((j) => j.status === "failed").map((j) => [j.name, j.error]));
  await fclock.set(new Date(start + 26 * day + 60 * 60_000));
  const firstRound = toA();
  ok("FO-7t DW14 pass (AG-6-73 rule 5): lines over 25 days old → one item for each holder of agent/payment:record (user-R, user-T), the item the firm, kind trust-to-move-waiting",
    firstRound.length === 2 && new Set(firstRound.map((n) => n.staffId)).size === 2 && [staffR, staffT].every((s) => firstRound.some((n) => n.staffId === s)) && firstRound.every((n) => n.item.kind === "firm"),
    { sent: notes.sent(), failed: jobs.jobs.filter((j) => j.status === "failed").map((j) => [j.name, j.error]) });
  ok("FO-7t DW14 fail: none for a person without agent/payment:record (user-O), none for firm B (nothing waiting there)", !toA().some((n) => n.staffId === staffO) && !notes.sent().some((n) => n.item.id === B), notes.sent());
  const calls = notifyCalls();
  await fclock.advance({ days: 2 });
  await reminder.sweep();
  ok("FO-7t DW14 pass (fires once): the sweep run again (two more days, and once by hand) → still one item each, and the reminder ran once (no second notify)",
    toA().length === 2 && calls === 1 && notifyCalls() === 1 && toA().every((n) => n.at.getTime() === firstRound[0].at.getTime()), { calls, now: notifyCalls(), sent: toA() });
  // Move everything left (each open line, its whole open amount), then a new line becomes old: a new episode.
  const left = (await list()).body.lines as { sourceEntryId: string; openMinor: number; direction: string }[];
  const outs = left.filter((x) => x.direction === "TRUST_TO_OPERATING").map((x) => ({ sourceEntryId: x.sourceEntryId, amountMinor: x.openMinor })), all: Res[] = [];
  for (let i = 0; i < outs.length; i += 100) all.push(await move(outs.slice(i, i + 100)));   // at most 100 lines a batch
  ok("FO-7t DW14 setup: every open line moved, 100 lines a batch → the list is empty", all.every((r) => r.status === 201) && (await list()).body.lines.length === 0, all.map((r) => r.body));
  await fclock.advance({ days: 1 });
  ok("FO-7t DW14 pass: after moving, the sweep finds nothing waiting and tells nobody again", notifyCalls() === 1 && toA().length === 2, { calls: notifyCalls() });
  // Break M2 (review round 2): the batch holding the line the first item was keyed on is undone; that same line is the
  // oldest waiting again → told once more, then once only. Without the move-line count in the key it never would be.
  const firstKey = jobs.jobs.find((j) => j.name === TO_MOVE_WAITING_JOB)!.key, keyedLine = firstKey.split(":")[2];
  const holding = all.find((r) => (r.body.lines as { sourceEntryId: string }[]).some((l) => l.sourceEntryId === keyedLine))!;
  ok("FO-7t DW14 setup (break M2): the first item's key names the oldest waiting line (W1), and one clean-up batch holds it", keyedLine === W1 && !!holding, { firstKey });
  const back = await undo(holding.body.batchId);
  await fclock.advance({ days: 1 });
  const afterUndo = notifyCalls();
  await fclock.advance({ days: 1 }); await reminder.sweep();
  ok("FO-7t DW14 pass (break M2): a batch undone puts old lines back on the list → the item is sent once more (unread again), and the sweep run again sends nothing more",
    back.status === 201 && afterUndo === 2 && notifyCalls() === 2 && toA().length === 2 && toA().every((n) => !n.read), { back: back.body, afterUndo, now: notifyCalls() });
  void Q; void staffO;
} catch (e) {
  ok("FO-7t part 3: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
