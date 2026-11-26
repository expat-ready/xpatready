// CS-C1s part 2 (screens lane; concept screens/CS-C1s/concept.md §6): the case page's read of a case's decisions and
// closing, GET /api/runtime/cases/:id/decisions (CaseClose.view). Named cases DS1 and DS2 of the brief, each a pass and
// a fail: DS1 the read lists every active filing of every stage with "submitted" and its decisions (newest first, the
// earlier ones kept), the closing fields and the newest withdrawal date; another firm's case is 404; `can` says exactly
// what each of the four POSTs answers in that state (pass and fail per BR-2, BR-4, BR-5, BR-6). DS2 a staff member
// without agent/case:show is 403. It runs in this process as check_csc1_close.ts does: a scratch database (every
// migration, PF-3's Sample seed), a small Nest app with PF-4's guard, the local stand-in sign-in and CS-C1's feature;
// fixtures in SQL. No server, no browser, no model call (US$0). The scratch database is dropped at the end.
//   tsx studio/tests/check_csc1s_view.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csc1s_${process.pid}`;
const URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql(["-f", join(MIG, d, "migration.sql")]);

process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const feature = (await import("../api/src/features/case-close.ts")).default;
const { CaseDecisionsView } = await import("../contracts/runtime.ts");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("csc1s-check-signing-key-0123456789abcdef", () => clock.now());
const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
@Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
const app = await NestFactory.create(TestApp, { logger: false });
await app.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  const FA = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const staff = async (tag: string, role: "CASE_MANAGER" | "CASE_OFFICER" | null) => {
    const s = await db.platformStaff.create({ data: { firmId: FA, actorId: `csc1s-${tag}`, email: `csc1s-${tag}@sample.invalid`, displayName: `Sample ${tag}` } });
    if (role) await db.platformRoleGrant.create({ data: { firmId: FA, staffId: s.id, role, grantedBy: "seed:csc1s" } });
    return s;
  };
  const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
    const r = await call("POST", "/api/platform/session/local", undefined, { firmKey, actorId, secondStep: true });
    if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const manager = await staff("manager", "CASE_MANAGER");
  await staff("officer", "CASE_OFFICER"); await staff("none", null);
  const TM = await tokenOf("csc1s-manager"), TO = await tokenOf("csc1s-officer"), TB = await tokenOf("user-S", "sample-solo");
  const TN = await tokenOf("csc1s-none");   // signed in, no role: no permission key at all

  const W = randomUUID(), pw = randomUUID(), pr = randomUUID(), cmb = randomUUID(), cmb1 = randomUUID(), pr1 = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csc1s-${process.pid}', 'CS-C1s check')`);
  sql(`set session_replication_role = replica;
    insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values ('${pw}', '${W}', 'csc1s-pw', 'PATHWAY', 'Sample pathway', 'INDIVIDUAL', 'seed'), ('${pr}', '${W}', 'csc1s-pr', 'PROGRAM', 'Sample program', null, 'seed'), ('${pr1}', '${W}', 'csc1s-pr1', 'PROGRAM', 'Sample earlier program', null, 'seed');
    update program_def set parent_node_key = 'csc1s-pw' where id in ('${pr}', '${pr1}');
    insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${cmb}', '${W}', '${pr}', 'csc1s', 'Sample', '[]', 'seed'), ('${cmb1}', '${W}', '${pr1}', 'csc1s-one', 'Sample earlier stage', '[]', 'seed')`);
  let n = 0;
  // Each filing its own created_at (clock_timestamp, not the transaction's now()): the read orders by created_at, and
  // equal times left the order to the plan (CS-W2 part filings' new indexes changed it; the code is unchanged).
  /** A case: stage 1 (earlier, ended) with `early` filings and stage 2 (CURRENT) with `filings`; each filing's person is
   *  an answer subject named "Sample Person <n>"; the first `submitted` of the current stage's filings are recorded. */
  const newCase = (o: { filings?: number; submitted?: number; early?: number; earlySubmitted?: boolean } = {}) => {
    const id = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), g1 = randomUUID(), g2 = randomUUID();
    const cur = Array.from({ length: o.filings ?? 1 }, () => [randomUUID(), randomUUID()]), early = Array.from({ length: o.early ?? 0 }, () => [randomUUID(), randomUUID()]);
    const fil = (f: string[], g: string, s: string) => `insert into answer_subject (id, workspace_id, party_id, subject_kind, label) values ('${f[1]}', '${W}', '${randomUUID()}', 'PERSON', 'Sample Person ${++n}');
      insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id, created_at) values ('${f[0]}', '${W}', '${id}', '${g}', '${f[1]}', 'csc1s', 'files_own', '${s}', clock_timestamp());`;
    sql(`set session_replication_role = replica;
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key) values ('${id}', '${W}', '${cmb}', 'user-P', 'user-O', 'C-2026-${String(++n).padStart(5, "0")}', 'sample-firm');
      insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values
        ${early.length ? `('${s1}', '${W}', '${id}', 'sample-firm', 1, 'one', 'Study permit (Sample)', 'Study permit', '${cmb1}', 'ENDED_NEXT_STARTED', '${randomUUID()}', 'BEGIN'),` : ""}
        ('${s2}', '${W}', '${id}', 'sample-firm', 2, 'two', 'Work permit (Sample)', 'Work permit', '${cmb}', 'CURRENT', '${randomUUID()}', 'BEGIN');
      insert into submission_group (id, workspace_id, case_id, kind, stage_id) values ${early.length ? `('${g1}', '${W}', '${id}', 'FAMILY', '${s1}'),` : ""} ('${g2}', '${W}', '${id}', 'FAMILY', '${s2}');
      ${early.map((f) => fil(f, g1, s1)).join("\n")} ${cur.map((f) => fil(f, g2, s2)).join("\n")}`);
    const filings = cur.map((f) => f[0]), earlier = early.map((f) => f[0]);
    for (const f of filings.slice(0, o.submitted ?? 0)) submit(f);
    if (o.earlySubmitted) for (const f of earlier) submit(f);
    return { id, s1, s2, filings, earlier };
  };
  const submit = (filing: string) => sql(`set session_replication_role = replica; insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts)
      select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-REF', '2026-11-02', 'V3000' || substr(md5(id::text), 1, 5), 'user-O', 'user-O', '[]' from filing where id = '${filing}'`);
  const P = (id: string, w: string) => `/api/runtime/cases/${id}/${w}`;
  const read = (id: string, t = TM) => call("GET", P(id, "decisions"), t);
  const decide = (id: string, filingId: string, over: Record<string, unknown> = {}) => call("POST", P(id, "decisions"), TM, { filingId, outcome: "APPROVED", decidedOn: "2026-11-16", note: "Sample decision", ...over });

  // ------------------------------------------------------------------------------------------------------------- DS1
  const a = newCase({ filings: 2, submitted: 1, early: 1 });
  let r = await read(a.id);
  const parsed = CaseDecisionsView.safeParse(r.body);
  ok("CS-C1s DS1 pass: the read answers 200 in the contract's shape (CaseDecisionsView)", r.status === 200 && parsed.success, [r.status, parsed.success ? null : parsed.error.issues.slice(0, 3)]);
  const v = r.body;
  ok("CS-C1s DS1 pass: every active filing of every stage is a row, earlier stage first, each with its person, stage words and current flag",
    v.filings.map((f: any) => f.id).join() === [...a.earlier, ...a.filings].join() && v.filings[0].stage.label === "Study permit (Sample)" && v.filings[0].current === false && v.filings[1].current === true
    && v.filings.every((f: any) => /^Sample Person \d+$/.test(f.person)), v.filings);
  ok("CS-C1s DS1 pass: the submitted flag and date follow C8.2's record (one submitted, two not)", v.filings.map((f: any) => `${f.submitted}:${f.submittedOn}`).join() === "false:null,true:2026-11-02,false:null", v.filings.map((f: any) => [f.submitted, f.submittedOn]));
  ok("CS-C1s DS1 pass: open with nothing decided: can.decide lists only the submitted filing, withdraw yes, close and reopen no; outcomes Sample",
    JSON.stringify(v.can) === JSON.stringify({ decide: [a.filings[0]], withdraw: true, close: false, reopen: false }) && v.sample === true && v.outcomes.join() === "APPROVED,REFUSED" && v.case.status === "OPEN" && v.case.currentStage.id === a.s2, v.can);
  // Parity: what `can` says no to, the POST refuses; what it says yes to, the POST accepts.
  r = await decide(a.id, a.filings[1]);
  ok("CS-C1s DS1 fail (BR-2 parity): a filing not in can.decide is refused by the POST (409 NOT_SUBMITTED)", r.status === 409 && r.body.code === "NOT_SUBMITTED", [r.status, r.body.code]);
  r = await call("POST", P(a.id, "close"), TM, { reason: "Too early (Sample)" });
  ok("CS-C1s DS1 fail (BR-5 parity): can.close false, and the POST refuses (409 NOT_DECIDED)", r.status === 409 && r.body.code === "NOT_DECIDED", [r.status, r.body.code]);
  r = await call("POST", P(a.id, "reopen"), TM, { reason: "Not closed (Sample)" });
  ok("CS-C1s DS1 fail (BR-6 parity): can.reopen false, and the POST refuses (409 CASE_OPEN)", r.status === 409 && r.body.code === "CASE_OPEN", [r.status, r.body.code]);
  r = await decide(a.id, a.filings[0], { outcome: "REFUSED", decidedOn: "2026-11-10", note: "First (Sample)" });
  const d1 = r.body.decision?.id;
  r = await decide(a.id, a.filings[0], { outcome: "APPROVED", decidedOn: "2026-11-16", note: "Corrected (Sample)" });
  ok("CS-C1s DS1 pass (BR-2 parity): the filing in can.decide takes a decision and a correction (201, 201)", r.status === 201 && !!d1, [r.status, d1]);
  r = await read(a.id);
  const row = r.body.filings.find((f: any) => f.id === a.filings[0]);
  ok("CS-C1s DS1 pass (BR-3): the latest decision first, the earlier one kept, each with its date, note and who recorded it by name",
    row.latest.outcome === "APPROVED" && row.latest.decidedOn === "2026-11-16" && row.latest.note === "Corrected (Sample)" && row.earlier.length === 1 && row.earlier[0].id === d1 && row.earlier[0].outcome === "REFUSED"
    && row.latest.recordedBy.staffId === manager.id && row.latest.recordedBy.name === "Sample manager", row);
  ok("CS-C1s DS1 pass (BR-4): a filing has a decision: can.withdraw false", r.body.can.withdraw === false, r.body.can);
  r = await call("POST", P(a.id, "withdraw"), TM, { reason: "Client withdrew (Sample)", withdrawnOn: "2026-11-17" });
  ok("CS-C1s DS1 fail (BR-4 parity): can.withdraw false, and the POST refuses (409 HAS_DECISION)", r.status === 409 && r.body.code === "HAS_DECISION", [r.status, r.body.code]);
  // An earlier-stage filing never submitted keeps Close off (concept §7 Q2).
  submit(a.filings[1]); await decide(a.id, a.filings[1]);
  r = await read(a.id);
  ok("CS-C1s DS1 fail (BR-5, every stage): both current filings decided, the earlier stage's not submitted: can.close stays false",
    r.body.can.close === false && r.body.filings.filter((f: any) => f.latest).length === 2, r.body.can);
  const b = newCase({ filings: 1, submitted: 1, early: 1, earlySubmitted: true });
  await decide(b.id, b.filings[0]); await decide(b.id, b.earlier[0]);
  r = await read(b.id);
  ok("CS-C1s DS1 pass (BR-5): every filing of every stage decided: can.close true", r.body.can.close === true && r.body.can.withdraw === false, r.body.can);
  r = await call("POST", P(b.id, "close"), TM, { reason: "Visa approved; file complete (Sample)" });
  ok("CS-C1s DS1 pass (BR-5 parity): and the POST closes it (200)", r.status === 200, [r.status, r.body]);
  r = await read(b.id);
  ok("CS-C1s DS1 pass (BR-5): closed, the read gives the closing fields (outcome, date, reason, the stage it closed from, the decision) and can: reopen only",
    r.body.case.status === "CLOSED" && r.body.case.closeOutcome === "CLOSED_BY_STAFF" && !!r.body.case.closedAt && r.body.case.closedReason === "Visa approved; file complete (Sample)"
    && r.body.case.closedFromStage?.id === b.s2 && r.body.case.decisions.map((d: any) => d.outcome).join() === "APPROVED,APPROVED" && JSON.stringify(r.body.can) === JSON.stringify({ decide: [], withdraw: false, close: false, reopen: true }), [r.body.case, r.body.can]);
  r = await decide(b.id, b.filings[0]);
  ok("CS-C1s DS1 fail (BR-5 parity): closed, can.decide is empty, and the POST refuses (409 CASE_CLOSED)", r.status === 409 && r.body.code === "CASE_CLOSED", [r.status, r.body.code]);
  r = await call("POST", P(b.id, "reopen"), TM, { reason: "IRCC reconsideration (Sample)" });
  ok("CS-C1s DS1 pass (BR-6 parity): can.reopen true, and the POST reopens (200)", r.status === 200, r.status);
  r = await read(b.id);
  ok("CS-C1s DS1 pass (BR-6): reopened, the closing fields are empty and the case is at the same stage", r.body.case.status === "OPEN" && r.body.case.closeOutcome === null && r.body.case.closedReason === null && r.body.case.currentStage.id === b.s2 && r.body.can.reopen === false, r.body.case);
  // Break M1: the header's decisions are each active filing's latest, never an inactive filing's.
  const m = newCase({ filings: 2, submitted: 2 });
  await decide(m.id, m.filings[0], { outcome: "APPROVED" }); await decide(m.id, m.filings[1], { outcome: "REFUSED" });
  sql(`set session_replication_role = replica; update filing set active = false where id = '${m.filings[1]}'`);
  r = await call("POST", P(m.id, "close"), TM, { reason: "Done (Sample)" });
  r = await read(m.id);
  ok("CS-C1s DS1 fail (break M1): a decision on a filing no longer active is not the case's decision: only the active filing's Approved",
    r.body.case.status === "CLOSED" && JSON.stringify(r.body.case.decisions.map((d: any) => d.outcome)) === '["APPROVED"]' && r.body.filings.length === 1, r.body.case);
  // Withdrawal: the newest WITHDRAWAL row's date.
  const c = newCase({ filings: 1 });
  r = await call("POST", P(c.id, "withdraw"), TM, { reason: "First withdrawal (Sample)", withdrawnOn: "2026-11-12" });
  await call("POST", P(c.id, "reopen"), TM, { reason: "Came back (Sample)" });
  r = await call("POST", P(c.id, "withdraw"), TM, { reason: "Client withdrew again (Sample)", withdrawnOn: "2026-11-15" });
  r = await read(c.id);
  ok("CS-C1s DS1 pass (BR-4): withdrawn twice, the read gives the newest withdrawal's date and reason, outcome WITHDRAWN, no decision",
    r.body.case.closeOutcome === "WITHDRAWN" && r.body.case.withdrawnOn === "2026-11-15" && r.body.case.withdrawReason === "Client withdrew again (Sample)" && r.body.case.decisions.length === 0 && r.body.filings[0].latest === null, r.body.case);
  // Another firm's case, an unknown id and a malformed id: 404 with the same words.
  const other = await Promise.all([read(a.id, TB), read(randomUUID()), read("not-a-uuid")]);
  ok("CS-C1s DS1 fail (BR-7): another firm's staff, an unknown id and a malformed id: 404 with the same words, nothing of the case",
    other.every((x) => x.status === 404 && x.body.code === "NOT_FOUND" && x.body.detail === "No such case in your firm.") && !JSON.stringify(other[0].body).includes(a.filings[0]), other.map((x) => [x.status, x.body.detail]));
  sql(`set session_replication_role = replica; update runtime_case set firm_key = 'sample-solo-missing' where id = '${c.id}'`);   // a fixture (CS-K1's client key would refuse it)
  r = await read(c.id);
  ok("CS-C1s DS1 fail (BR-7): a case whose firm key names no platform firm is 404 too", r.status === 404, r.status);

  // ------------------------------------------------------------------------------------------------------------- DS2
  r = await read(a.id, TO);
  ok("CS-C1s DS2 pass: the case officer (agent/case:show, no record-decision) reads the decisions (200)", r.status === 200 && r.body.filings.length === 3, r.status);
  const noRole = await read(a.id, TN);
  ok("CS-C1s DS2 fail: a staff member without agent/case:show (no role) is 403, never the rows", noRole.status === 403 && !JSON.stringify(noRole.body).includes(a.filings[0]), [noRole.status, noRole.body?.code]);
  r = await call("GET", P(a.id, "decisions"));
  ok("CS-C1s DS2 fail: no staff session is 401 NOT_SIGNED_IN (the simulated person never reads it)", r.status === 401 && r.body.code === "NOT_SIGNED_IN", [r.status, r.body.code]);
  const asActor = await fetch(`${BASE}${P(a.id, "decisions")}`, { headers: { "x-actor": "user-R" } });
  ok("CS-C1s DS2 fail: the simulated-person header alone (x-actor: user-R) is 401", asActor.status === 401, asActor.status);
} finally {
  await app.close().catch(() => undefined);
  await db.$disconnect();
  spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
