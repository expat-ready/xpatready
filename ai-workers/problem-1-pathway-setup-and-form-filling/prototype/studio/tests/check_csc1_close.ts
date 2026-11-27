// CS-C1a (map row 77; brief design/briefs/CS-C1.md part 1): decision, withdrawal, close and reopen, the two events, and
// core.ts's one-line hook (Lead 58's OK on #1818, comment 6892215478). Named cases CS-C1 DW1-DW8, each a pass and a fail,
// journey CS-C1 W1, Lead 58's four hook proofs (H1-H4) and the migration (M1-M3). It runs in this process: a scratch
// database (every migration, PF-3's Sample seed, staff of every starter role) and a small Nest app built from core.ts's
// ConfigReadGuard, PF-4's guard and identity routes (the local stand-in), this row's feature, and a stand-in for an
// existing undeclared /api/runtime route. Cases are fixtures written in SQL (replica role, as PF-21's check does): a case,
// its CURRENT stage, a group and filings; "submitted" is C8.2's filing_record row. No server, no browser, no model call
// (US$0). Both scratch databases are dropped at the end.
//   tsx studio/tests/check_csc1_close.ts
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CSW1_PART2, SAMPLE_FIRMS_SQL } from "./runtime/sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261115160000_csc1a_case_decision";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_csc1_${process.pid}`, DEMO = `xr_studio_csc1_demo_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, db = DB) => psql(db, ["-Atc", q]);
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; auth?: string; actor?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.auth) headers.authorization = o.auth;
  if (o.actor) headers["x-actor"] = o.actor;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const d of [DB, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }

// --------------------------------------------------------------------------------------------- M: the migration
const before = all.filter((d) => d < NEW).at(-1) ?? "";
ok(`CS-C1 M1 pass: the migration has its own stamp, later than every one before it (newest before it: ${before})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before >= "20261115120000_pf6b_permission_catalogue");
for (const d of all.filter((x) => x < NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
const W0 = randomUUID();
sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number) values ('${randomUUID()}', '${W0}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-00001'), ('${randomUUID()}', '${W0}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-00002')`, DEMO);
for (const d of all.filter((x) => x >= NEW)) { if (d.startsWith(CSW1_PART2)) sql(SAMPLE_FIRMS_SQL, DEMO); psql(DEMO, ["-f", join(MIG, d, "migration.sql")]); }   // CS-W1 part 2 needs the cases' firm
ok("CS-C1 M2 pass: on a copy with existing (OPEN) cases the migration applies; they stay OPEN with no closing fields",
  sql(`select count(*) from runtime_case where status = 'OPEN' and closed_at is null and close_outcome is null`, DEMO) === "2");
ok("CS-C1 M2 fail: the migration does not apply twice", (() => { try { psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());
for (const d of all) psql(DB, ["-f", join(MIG, d, "migration.sql")]);
{
  mkdirSync(join(STUDIO, "var"), { recursive: true });
  const cfg = join(STUDIO, "var", `csc1-${process.pid}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(DB))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--script"], { cwd: STUDIO, encoding: "utf8" });
  const mine = `${r.stdout}`.split("\n").filter((l) => /case_decision|closed_|close_outcome|withdraw/.test(l));
  rmSync(cfg, { force: true });
  ok("CS-C1 M3 pass: migrate diff from the migrated database to the schema names nothing of this row", r.status === 0 && mine.length === 0, mine.length ? mine : r.stderr);
  ok("CS-C1 M3 pass: every function this migration adds is named case_*", sql(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'case_decision%'`) === "case_decision_check_insert,case_decision_refuse_change"
    && !/CREATE FUNCTION (?!case_)/.test(readFileSync(join(MIG, NEW, "migration.sql"), "utf8")));
}

// ------------------------------------------------------------------------------------------------ the app
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { CaseClose } = await import("../api/src/case-close.ts");
const { PermissionKeys } = await import("../api/src/platform/identity/keys.ts");
const feature = (await import("../api/src/features/case-close.ts")).default;
const { CaseCloseController } = await import("../api/src/features/case-close.ts");
const { EVENT, CaseClosedPayload, CaseReopenedPayload } = await import("../ports/events.ts");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

// An existing case route that declares nothing (as every x-actor route today): core.ts still refuses a bearer token on it.
@Controller("api/runtime/probe") class RuntimeProbeController { @Get() read() { return { ok: true }; } }

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("csc1-check-signing-key-0123456789abcdef", () => clock.now());
const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
@Module({ controllers: [RuntimeProbeController, PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
const app = await NestFactory.create(TestApp, { logger: false });
await app.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

try {
  ok("setup: the app starts with this row's routes (the platform guard's start-up rule passes)", feature.controllers.includes(CaseCloseController) && !!BASE);
  await seedSampleFirms(db);
  const firmOf = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id;
  const FA = await firmOf("sample-firm"), FB = await firmOf("sample-solo");
  // One staff member per starter role in firm A (PF-3's seeded keys decide; no key is granted here).
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  for (const role of ROLES) {
    const s = await db.platformStaff.create({ data: { firmId: FA, actorId: `csc1-${role.toLowerCase()}`, email: `csc1-${role.toLowerCase()}@sample.invalid`, displayName: `Sample ${role}` } });
    await db.platformRoleGrant.create({ data: { firmId: FA, staffId: s.id, role, grantedBy: "seed:csc1" } });
  }
  const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
    const r = await call(BASE, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } });
    if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const T: Record<string, string> = {};
  for (const role of ROLES) T[role] = await tokenOf(`csc1-${role.toLowerCase()}`);
  const TB = await tokenOf("user-S", "sample-solo");   // firm B's Owner and Case Manager

  // Fixtures: one workspace, an INDIVIDUAL and a CORPORATE pathway with one combination each.
  const W = randomUUID();
  sql(`insert into workspace (id, key, label) values ('${W}', 'csc1-${process.pid}', 'CS-C1 check')`);
  const combo = (type: string) => {
    const pw = randomUUID(), pr = randomUUID(), c = randomUUID(), k = `csc1-${type.toLowerCase()}`;
    sql(`set session_replication_role = replica;
      insert into program_def (id, workspace_id, program_node_key, node_kind, label, client_type, created_by) values ('${pw}', '${W}', '${k}-pw', 'PATHWAY', 'Sample ${type}', '${type}', 'seed'), ('${pr}', '${W}', '${k}-pr', 'PROGRAM', 'Sample program', null, 'seed');
      update program_def set parent_node_key = '${k}-pw' where id = '${pr}';
      insert into combination (id, workspace_id, program_def_id, combination_key, label, participants, created_by) values ('${c}', '${W}', '${pr}', '${k}', 'Sample', '[]', 'seed')`);
    return { id: c, key: k };
  };
  const IND = combo("INDIVIDUAL"), CORP = combo("CORPORATE");
  let n = 0;
  /** A case with its CURRENT stage, one group and `filings` filings, the first `submitted` of them recorded (C8.2). */
  const newCase = (o: { firmKey?: string; filings?: number; submitted?: number; cmb?: { id: string; key: string } } = {}) => {
    const id = randomUUID(), stage = randomUUID(), group = randomUUID(), cmb = o.cmb ?? IND, firmKey = o.firmKey ?? "sample-firm";
    const filings = Array.from({ length: o.filings ?? 1 }, () => randomUUID());
    sql(`set session_replication_role = replica;
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key) values ('${id}', '${W}', '${cmb.id}', 'user-P', 'user-O', 'C-2026-${String(++n).padStart(5, "0")}', '${firmKey}');
      insert into case_stage (id, workspace_id, case_id, firm_key, ord, stage_key, staff_name, client_name, combination_id, state, application_subject_id, started_from) values ('${stage}', '${W}', '${id}', '${firmKey}', 1, 'only', 'Application', 'Application', '${cmb.id}', 'CURRENT', '${randomUUID()}', 'BEGIN');
      insert into submission_group (id, workspace_id, case_id, kind, stage_id) values ('${group}', '${W}', '${id}', 'FAMILY', '${stage}');
      ${filings.map((f) => `insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) values ('${f}', '${W}', '${id}', '${group}', '${randomUUID()}', '${cmb.key}', 'files_own', '${stage}');`).join("\n")}`);
    for (const f of filings.slice(0, o.submitted ?? 0)) submit(id, f);
    return { id, stage, filings, group };
  };
  /** C8.2's record of a submission (the row "Record the submission" writes). */
  const submit = (caseId: string, filing: string) => sql(`set session_replication_role = replica; insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts)
      select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-REF', current_date, 'V3000' || substr(md5(id::text), 1, 5), 'user-O', 'user-O', '[]' from filing where id = '${filing}'`);
  const P = (id: string, what: string) => `/api/runtime/cases/${id}/${what}`;
  const decide = (c: { id: string; filings: string[] }, token: string, over: Record<string, unknown> = {}) => call(BASE, "POST", P(c.id, "decisions"), { token, body: { filingId: c.filings[0], outcome: "APPROVED", decidedOn: "2027-03-03", note: "Sample decision", ...over } });
  const rows = (caseId: string, kind = "DECISION") => sql(`select count(*) from case_decision where case_id = '${caseId}' and kind = '${kind}'`);
  const caseRow = (id: string) => sql(`select status || '|' || coalesce(close_outcome, '') || '|' || coalesce(closed_from_stage::text, '') || '|' || (closed_at is not null) || '|' || coalesce(withdraw_reason, '') from runtime_case where id = '${id}'`);
  const events = (caseId: string, type: string) => Number(sql(`select count(*) from module_event where subject_id = '${caseId}' and type = '${type}'`));

  // ------------------------------------------------------------------------------- H: core.ts's hook opens nothing else
  const hc = newCase({ submitted: 1 });
  const noToken = await Promise.all(["decisions", "withdraw", "close", "reopen"].map((w) => call(BASE, "POST", P(hc.id, w), { body: { reason: "x" } })));
  ok("CS-C1 H1 fail: a declared case route with no token is 401 NOT_SIGNED_IN on all four routes (PF-4's guard still runs)", noToken.every((r) => r.status === 401 && r.body.code === "NOT_SIGNED_IN"), noToken.map((r) => [r.status, r.body.code]));
  const actorOnly = await call(BASE, "POST", P(hc.id, "close"), { actor: "user-R", body: { reason: "x" } });
  ok("CS-C1 H1 fail: the simulated-person header alone (x-actor: user-R) gives nothing on a declared case route (401)", actorOnly.status === 401 && actorOnly.body.code === "NOT_SIGNED_IN", actorOnly);
  const linkToken = randomBytes(32).toString("base64url");   // an adult's link session token (person-link.ts: 43 characters)
  const asLink = await Promise.all([call(BASE, "POST", P(hc.id, "decisions"), { auth: `Bearer ${linkToken}`, body: {} }), call(BASE, "POST", P(hc.id, "reopen"), { auth: `Bearer ${linkToken}`, actor: "user-R", body: { reason: "x" } })]);
  ok("CS-C1 H2 fail: a link-session token on a declared case route is refused (401 TOKEN_REFUSED), also with a simulated person beside it", asLink.every((r) => r.status === 401 && r.body.code === "TOKEN_REFUSED"), asLink.map((r) => [r.status, r.body.code]));
  const probe = await Promise.all([call(BASE, "GET", "/api/runtime/probe", { token: T.OWNER }), call(BASE, "GET", "/api/runtime/probe", { auth: `Bearer ${linkToken}` }), call(BASE, "GET", "/api/runtime/probe", { actor: "user-A" })]);
  ok("CS-C1 H3 fail: an undeclared /api/runtime/* route with a staff or link Bearer token still gives 403 link-only", probe[0].status === 403 && /link-only/.test(probe[0].body.type) && probe[1].status === 403 && /link-only/.test(probe[1].body.type), probe.map((r) => [r.status, r.body.type]));
  ok("CS-C1 H3 pass: the same undeclared route with the simulated-person header (a configuration person) behaves as before (200)", probe[2].status === 200, probe[2]);
  const mixed = await Promise.all([call(BASE, "POST", `/API/Runtime/cases/${hc.id}/close`, { token: T.OWNER, body: { reason: "x" } }), call(BASE, "POST", `/api/RUNTIME/cases/${hc.id}/close`, { body: { reason: "x" } })]);
  ok("CS-C1 H3 fail: a declared case route in other letter case is never answered: a staff token → 403 link-only (as before the hook), no token → 401; the case unchanged",
    mixed[0].status === 403 && /link-only/.test(mixed[0].body.type) && mixed[1].status === 401 && caseRow(hc.id).startsWith("OPEN|"), mixed.map((r) => [r.status, r.body.type ?? r.body.code]));
  // The hook takes only routes declaring permission keys (break M1): AnyStaff and StaffSignIn on /api/runtime stay core's.
  const { AnyStaff, StaffSignIn } = await import("../api/src/platform/identity/keys.ts");
  const access = (kind: "keys" | "any" | "sign") => ({ switchToHttp: () => ({ getRequest: () => ({ method: "POST", path: `/api/runtime/cases/${hc.id}/x`, headers: { authorization: `Bearer ${T.OWNER}` } }) }), getHandler: () => H[kind], getClass: () => Object });
  const H = { keys: function k() {}, any: function a() {}, sign: function s() {} };
  PermissionKeys("agent/case:record-decision")(H.keys); AnyStaff("probe")(H.any); StaffSignIn("probe")(H.sign);
  const g = new ConfigReadGuard(new Reflector());
  const take = (kind: "keys" | "any" | "sign") => { try { return g.canActivate(access(kind) as never) ? "passed" : "refused"; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? "error"; } };
  ok("CS-C1 H3 fail: on /api/runtime a Bearer route declaring AnyStaff or StaffSignIn is still refused 403 link-only; only PermissionKeys passes to PF-4's guard",
    take("keys") === "passed" && take("any") === 403 && take("sign") === 403, [take("keys"), take("any"), take("sign")]);
  const coreLine = readFileSync(join(STUDIO, "api", "src", "core.ts"), "utf8").split("\n").find((l) => l.includes("PLATFORM_ACCESS, [ctx.getHandler()"));
  ok("CS-C1 H4 pass: core.ts's hook is one line with its why comment naming CS-C1a and Lead 58's comment on #1818", !!coreLine && /CS-C1a/.test(coreLine) && /#1818/.test(coreLine) && /6892215478/.test(coreLine), coreLine);

  // ------------------------------------------------------------------------------- DW1: a decision on a submitted filing
  const c1 = newCase({ filings: 2, submitted: 1 });
  let r = await decide(c1, T.CASE_MANAGER);
  ok("CS-C1 DW1 pass: a decision on a submitted filing → 201 and one case_decision row", r.status === 201 && r.body.decision?.outcome === "APPROVED" && r.body.decision?.decidedOn === "2027-03-03" && rows(c1.id) === "1" && r.body.everyFilingDecided === false, r.body);
  r = await decide(c1, T.CASE_MANAGER, { filingId: c1.filings[1] });
  ok("CS-C1 DW1 fail: a decision on an unsubmitted filing → 409 NOT_SUBMITTED; no row", r.status === 409 && r.body.code === "NOT_SUBMITTED" && rows(c1.id) === "1", r.body);
  r = await decide(c1, T.CASE_MANAGER, { outcome: "MAYBE" });
  const r2 = await decide(c1, T.CASE_MANAGER, { decidedOn: "2027-02-30" }), r3 = await decide(c1, T.CASE_MANAGER, { filingId: hc.filings[0] });
  const odd = await Promise.all([decide(c1, T.CASE_MANAGER, { decidedOn: "0000-01-01" }), decide(c1, T.CASE_MANAGER, { note: "a\u0000b" }),
    call(BASE, "POST", P(c1.id, "close"), { token: T.CASE_MANAGER, body: { reason: "\u200B" } }), call(BASE, "POST", P(c1.id, "close"), { token: T.CASE_MANAGER, body: { reason: "x\u0000" } })]);
  ok("CS-C1 DW1 fail (break m1, m2, m4): year 0000, a NUL in a note or reason, an invisible-only reason → 400, never a 500", odd[0].status === 400 && odd[1].status === 400 && odd[2].status === 400 && odd[3].status === 400 && rows(c1.id) === "1", odd.map((x) => [x.status, x.body.code]));
  ok("CS-C1 DW1 fail: an outcome outside the Sample list or an impossible date → 400 on its field; another case's filing → 404", r.status === 400 && !!r.body.fields?.outcome && r2.status === 400 && !!r2.body.fields?.decidedOn && r3.status === 404 && rows(c1.id) === "1", [r.body, r2.body, r3.body]);
  r = await decide(c1, T.CASE_MANAGER, { outcome: "REFUSED" });
  ok("CS-C1 DW1 pass: a second decision on the same filing is a correction, a new row (AG-7-33 §10), never an overwrite", r.status === 201 && rows(c1.id) === "2" && sql(`select string_agg(outcome, ',' order by recorded_at, outcome) from case_decision where case_id = '${c1.id}'`).split(",").sort().join(",") === "APPROVED,REFUSED", r.body);

  // STANDARDS §4 (Devin review on #1818): a retried decision with its key returns the first row; the key with another body is refused.
  const ci = newCase({ submitted: 1 });
  const k1 = await decide(ci, T.OWNER, { idempotencyKey: "csc1-retry-1" });
  const k2 = await Promise.all([decide(ci, T.OWNER, { idempotencyKey: "csc1-retry-1" }), decide(ci, T.OWNER, { idempotencyKey: "csc1-retry-1" })]);
  ok("CS-C1 DW1 pass (idempotent create): the same key again, also twice at once, returns the first decision; one row, one audit line",
    k1.status === 201 && k2.every((x) => x.status === 201 && x.body.decision?.id === k1.body.decision?.id && x.body.replayed === true) && rows(ci.id) === "1" && sql(`select count(*) from audit_event where entity_key = '${ci.id}'`) === "1", [k1.body, k2.map((x) => x.body)]);
  const k3 = await decide(ci, T.OWNER, { idempotencyKey: "csc1-retry-1", outcome: "REFUSED" }), k4 = await decide(ci, T.OWNER, { idempotencyKey: "bad key!" });
  ok("CS-C1 DW1 fail (idempotent create): the key with another decision → 409 IDEMPOTENCY_KEY_REUSED; a malformed key → 400; still one row", k3.status === 409 && k3.body.code === "IDEMPOTENCY_KEY_REUSED" && k4.status === 400 && rows(ci.id) === "1", [k3.body, k4.body]);

  // ------------------------------------------------------------------------------- DW2: the key decides, never the role name
  const without = ["READ_ONLY", "BILLING_FINANCE", "CASE_OFFICER"], withKey = ["OWNER", "ADMIN", "CASE_MANAGER"];
  const c2 = newCase({ submitted: 1 });
  const refusedAll = (await Promise.all(without.flatMap((role) => [decide(c2, T[role]), call(BASE, "POST", P(c2.id, "withdraw"), { token: T[role], body: { reason: "x", withdrawnOn: "2027-01-01" } }), call(BASE, "POST", P(c2.id, "close"), { token: T[role], body: { reason: "x" } })])));
  ok("CS-C1 DW2 fail: decision, withdraw and close without agent/case:record-decision (READ_ONLY, BILLING_FINANCE, CASE_OFFICER) → 403 MISSING_PERMISSION (PF-4's guard's code); nothing written",
    refusedAll.every((x) => x.status === 403 && x.body.code === "MISSING_PERMISSION") && rows(c2.id) === "0" && caseRow(c2.id).startsWith("OPEN|"), refusedAll.map((x) => [x.status, x.body.code]));
  const okAll: number[][] = [];
  for (const role of withKey) {
    const a = newCase({ submitted: 1 }), b = newCase({ submitted: 1 });
    const d = await decide(a, T[role]), cl = await call(BASE, "POST", P(a.id, "close"), { token: T[role], body: { reason: "Decision received" } });
    const wd = await call(BASE, "POST", P(b.id, "withdraw"), { token: T[role], body: { reason: "The client stopped", withdrawnOn: "2027-01-05" } });
    okAll.push([d.status, cl.status, wd.status]);
  }
  ok("CS-C1 DW2 pass: with the key (OWNER, ADMIN, CASE_MANAGER) decision 201, close 200, withdraw 200", okAll.every(([d, c, w]) => d === 201 && c === 200 && w === 200), okAll);

  // ------------------------------------------------------------------------------- DW3: withdraw only before the decision
  const c3 = newCase({ filings: 2, submitted: 2 });
  await decide(c3, T.OWNER); await decide(c3, T.OWNER, { filingId: c3.filings[1] });
  r = await call(BASE, "POST", P(c3.id, "withdraw"), { token: T.OWNER, body: { reason: "The client stopped", withdrawnOn: "2027-03-04" } });
  ok("CS-C1 DW3 fail: withdraw after every filing has a decision → 409 HAS_DECISION; the case stays OPEN, no withdrawal row, no event", r.status === 409 && r.body.code === "HAS_DECISION" && caseRow(c3.id).startsWith("OPEN|") && rows(c3.id, "WITHDRAWAL") === "0" && events(c3.id, EVENT.CASE_CLOSED) === 0, r.body);
  const c3b = newCase({ filings: 2, submitted: 1 });
  await decide(c3b, T.OWNER);
  r = await call(BASE, "POST", P(c3b.id, "withdraw"), { token: T.OWNER, body: { reason: "The client stopped", withdrawnOn: "2027-03-04" } });
  ok("CS-C1 DW3 fail: withdraw while one filing already has a decision → 409 (AG-7-50 rule 4: it is not closed WITHDRAWN)", r.status === 409 && r.body.code === "HAS_DECISION" && caseRow(c3b.id).startsWith("OPEN|"), r.body);
  const c3d = newCase({ filings: 2, submitted: 1 });
  await decide(c3d, T.OWNER);
  sql(`update filing set active = false where id = '${c3d.filings[0]}'`);
  r = await call(BASE, "POST", P(c3d.id, "withdraw"), { token: T.OWNER, body: { reason: "The client stopped", withdrawnOn: "2027-03-04" } });
  ok("CS-C1 DW3 fail (review m2): a decision on a filing later set inactive still blocks withdrawal → 409 HAS_DECISION", r.status === 409 && r.body.code === "HAS_DECISION" && caseRow(c3d.id).startsWith("OPEN|"), r.body);
  const c3c = newCase({ filings: 2, submitted: 1 });
  r = await call(BASE, "POST", P(c3c.id, "withdraw"), { token: T.OWNER, body: { withdrawnOn: "2027-03-04" } });
  const r3b = await call(BASE, "POST", P(c3c.id, "withdraw"), { token: T.OWNER, body: { reason: "The client stopped" } });
  ok("CS-C1 DW3 fail: withdraw without a reason → 400 REASON_REQUIRED; without a date → 400 on withdrawnOn", r.status === 400 && r.body.code === "REASON_REQUIRED" && r3b.status === 400 && !!r3b.body.fields?.withdrawnOn && caseRow(c3c.id).startsWith("OPEN|"), [r.body, r3b.body]);
  r = await call(BASE, "POST", P(c3c.id, "withdraw"), { token: T.OWNER, body: { reason: "The client stopped", withdrawnOn: "2027-03-04" } });
  ok("CS-C1 DW3 pass: withdraw before any decision → the case closes WITHDRAWN, withdrawn_at and the reason set, one WITHDRAWAL row with the date",
    r.status === 200 && r.body.case?.status === "CLOSED" && r.body.case?.closeOutcome === "WITHDRAWN" && !!r.body.case?.withdrawnAt && caseRow(c3c.id) === `CLOSED|WITHDRAWN|${c3c.stage}|true|The client stopped` && rows(c3c.id, "WITHDRAWAL") === "1" && sql(`select decided_on from case_decision where case_id = '${c3c.id}'`) === "2027-03-04", r.body);

  // ------------------------------------------------------------------------------- DW4: close with a reason
  const c4 = newCase({ submitted: 1 });
  r = await call(BASE, "POST", P(c4.id, "close"), { token: T.CASE_MANAGER, body: { reason: "Decision received" } });
  ok("CS-C1 DW4 fail: close before every filing has a decision → 409 NOT_DECIDED (AG-7-34 rule 2: before the decision, withdraw)", r.status === 409 && r.body.code === "NOT_DECIDED" && caseRow(c4.id).startsWith("OPEN|"), r.body);
  await decide(c4, T.CASE_MANAGER);
  const noReason = await Promise.all([{}, { reason: "" }, { reason: "   " }].map((b) => call(BASE, "POST", P(c4.id, "close"), { token: T.CASE_MANAGER, body: b })));
  ok("CS-C1 DW4 fail: close without a reason (none, empty, spaces) → 400 REASON_REQUIRED; the case stays OPEN", noReason.every((x) => x.status === 400 && x.body.code === "REASON_REQUIRED") && caseRow(c4.id).startsWith("OPEN|"), noReason.map((x) => x.body));
  r = await call(BASE, "POST", P(c4.id, "close"), { token: T.CASE_MANAGER, body: { reason: "Decision received" } });
  ok("CS-C1 DW4 pass: close with a reason → CLOSED, CLOSED_BY_STAFF, closed_from_stage set to the stage it was at", r.status === 200 && caseRow(c4.id) === `CLOSED|CLOSED_BY_STAFF|${c4.stage}|true|` && r.body.case?.closedReason === "Decision received", r.body);
  const again = await Promise.all([call(BASE, "POST", P(c4.id, "close"), { token: T.CASE_MANAGER, body: { reason: "again" } }), decide(c4, T.CASE_MANAGER), call(BASE, "POST", P(c4.id, "withdraw"), { token: T.CASE_MANAGER, body: { reason: "x", withdrawnOn: "2027-01-01" } })]);
  ok("CS-C1 DW4 fail: a closed case has no moves (AG-7-34 rule 4): close, decision and withdraw → 409 CASE_CLOSED", again.every((x) => x.status === 409 && x.body.code === "CASE_CLOSED") && rows(c4.id) === "1", again.map((x) => x.body.code));

  // ------------------------------------------------------------------------------- DW5: reopen
  r = await call(BASE, "POST", P(c4.id, "reopen"), { token: T.ADMIN, body: { reason: "Late document" } });
  const r5 = await call(BASE, "POST", P(c4.id, "reopen"), { token: T.CASE_MANAGER, body: {} });
  ok("CS-C1 DW5 fail: reopen without agent/case:reopen (ADMIN holds record-decision, not reopen) → 403; without a reason → 400; the case stays CLOSED",
    r.status === 403 && r.body.code === "MISSING_PERMISSION" && r5.status === 400 && r5.body.code === "REASON_REQUIRED" && caseRow(c4.id).startsWith("CLOSED|"), [r.body, r5.body]);
  const closedAt = sql(`select to_char(closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') from runtime_case where id = '${c4.id}'`);
  r = await call(BASE, "POST", P(c4.id, "reopen"), { token: T.CASE_MANAGER, body: { reason: "Late document" } });
  const line = JSON.parse(sql(`select detail::text from audit_event where entity = 'case' and entity_key = '${c4.id}' and action = 'case.reopened'`) || "{}");
  ok("CS-C1 DW5 pass: reopen with the key and a reason → OPEN at closed_from_stage; the closing fields are cleared",
    r.status === 200 && r.body.case?.status === "OPEN" && r.body.stageId === c4.stage && r.body.currentStageId === c4.stage && caseRow(c4.id) === "OPEN|||false|", r.body);
  ok("CS-C1 DW5 pass: the reopen's audit line keeps the old close values (outcome, reason, closed at, stage) and the reopen reason",
    line.closeOutcome === "CLOSED_BY_STAFF" && line.closedReason === "Decision received" && String(line.closedAt).startsWith(closedAt) && line.closedFromStage === c4.stage && line.reason === "Late document", line);
  r = await call(BASE, "POST", P(c4.id, "reopen"), { token: T.CASE_MANAGER, body: { reason: "again" } });
  ok("CS-C1 DW5 fail: reopening an open case → 409 CASE_OPEN", r.status === 409 && r.body.code === "CASE_OPEN", r.body);
  r = await call(BASE, "POST", P(c3c.id, "reopen"), { token: T.OWNER, body: { reason: "The client came back" } });
  ok("CS-C1 DW5 pass: reopening a withdrawn case clears withdrawn_at and the withdraw reason; the WITHDRAWAL row stays (insert-only)", r.status === 200 && caseRow(c3c.id) === "OPEN|||false|" && rows(c3c.id, "WITHDRAWAL") === "1", r.body);

  // ------------------------------------------------------------------------------- DW6: the events, in the change's transaction
  const c6 = newCase({ submitted: 1, cmb: CORP });
  await decide(c6, T.OWNER);
  await call(BASE, "POST", P(c6.id, "close"), { token: T.OWNER, body: { reason: "Decision received" } });
  await call(BASE, "POST", P(c6.id, "close"), { token: T.OWNER, body: { reason: "twice" } });   // 409: no second event
  const ev = JSON.parse(sql(`select json_build_object('firm', firm_id, 'payload', payload)::text from module_event where subject_id = '${c6.id}' and type = '${EVENT.CASE_CLOSED}'`) || "{}");
  ok("CS-C1 DW6 pass: case.closed written once, on the case's platform firm, its payload the shared type (ids and facts: a CORPORATE pathway's case says CORPORATE; no reason words)",
    events(c6.id, EVENT.CASE_CLOSED) === 1 && ev.firm === FA && CaseClosedPayload.safeParse(ev.payload).success && ev.payload.clientType === "CORPORATE" && ev.payload.reason === "DECISION" && ev.payload.outcome === "CLOSED_BY_STAFF" && !JSON.stringify(ev.payload).includes("Decision received"), ev);
  await call(BASE, "POST", P(c6.id, "reopen"), { token: T.OWNER, body: { reason: "Late document" } });
  const evr = JSON.parse(sql(`select payload::text from module_event where subject_id = '${c6.id}' and type = '${EVENT.CASE_REOPENED}'`) || "{}");
  ok("CS-C1 DW6 pass: case.reopened written once, with the stage it returned to and the outcome it had", events(c6.id, EVENT.CASE_REOPENED) === 1 && CaseReopenedPayload.safeParse(evr).success && evr.stageId === c6.stage && evr.previousOutcome === "CLOSED_BY_STAFF", evr);
  // A forced rollback: the same service with a step that fails after every write of the transaction.
  class FailingClose extends CaseClose { protected override async beforeCommit() { throw new Error("forced rollback (CS-C1 DW6)"); } }
  const failing = new FailingClose(new Db());
  const ctxOwner = { staffId: (await db.platformStaff.findFirstOrThrow({ where: { actorId: "csc1-owner" } })).id, firmId: FA, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: Date.now(), via: "local" as const };
  const audits = (id: string) => sql(`select count(*) from audit_event where entity_key = '${id}'`);
  const before6 = [events(c6.id, EVENT.CASE_CLOSED), audits(c6.id)];
  const threw = await failing.close(ctxOwner, c6.id, { reason: "Decision received" }).then(() => false, (e) => /forced rollback/.test(String(e)));
  ok("CS-C1 DW6 fail: a forced rollback after the close writes none: no event, no audit line, the case still OPEN", threw && events(c6.id, EVENT.CASE_CLOSED) === before6[0] && audits(c6.id) === before6[1] && caseRow(c6.id).startsWith("OPEN|"), [threw, before6, caseRow(c6.id)]);
  await call(BASE, "POST", P(c6.id, "close"), { token: T.OWNER, body: { reason: "Decision received" } });
  const threw2 = await failing.reopen(ctxOwner, c6.id, { reason: "x" }).then(() => false, (e) => /forced rollback/.test(String(e)));
  ok("CS-C1 DW6 fail: a forced rollback of a reopen writes no case.reopened; the case stays CLOSED", threw2 && events(c6.id, EVENT.CASE_REOPENED) === 1 && caseRow(c6.id).startsWith("CLOSED|"), [threw2, caseRow(c6.id)]);

  // Four closes at the same instant: the case row lock lets exactly one through (review m5).
  const cr = newCase({ submitted: 1 });
  await decide(cr, T.OWNER);
  const race = await Promise.all([...Array.from({ length: 4 }, (_, i) => call(BASE, "POST", P(cr.id, "close"), { token: T.OWNER, body: { reason: `race ${i}` } }))]);
  ok("CS-C1 DW6 fail: four closes at the same instant → one 200, the rest 409; one case.closed (the case row is locked first)",
    race.filter((x) => x.status === 200).length === 1 && race.filter((x) => x.status === 409).length === 3 && events(cr.id, EVENT.CASE_CLOSED) === 1, race.map((x) => [x.status, x.body.code]));

  // ------------------------------------------------------------------------------- DW7: the database keeps decisions
  ok("CS-C1 DW7 fail: UPDATE on case_decision is refused by the database", refused(`update case_decision set outcome = 'REFUSED' where case_id = '${c1.id}'`, /case_decision: update is refused/));
  ok("CS-C1 DW7 fail: DELETE and TRUNCATE on case_decision are refused by the database", refused(`delete from case_decision where case_id = '${c1.id}'`, /case_decision: delete is refused/) && refused(`truncate case_decision`, /case_decision: truncate is refused/) && rows(c1.id) === "2");
  ok("CS-C1 DW7 fail: a filing with a decision cannot be deleted on its own", refused(`delete from filing where id = '${c1.filings[0]}'`, /foreign key|case_decision_filing_id_fkey/) && rows(c1.id) === "2");
  ok("CS-C1 DW7 fail: the database refuses a decision naming another firm, another case's filing, or a filing on a withdrawal",
    refused(`insert into case_decision (id, firm_id, case_id, filing_id, kind, outcome, decided_on, recorded_by) values (gen_random_uuid(), '${FB}', '${c1.id}', '${c1.filings[0]}', 'DECISION', 'APPROVED', current_date, 'x')`, /is not the firm of case/)
    && refused(`insert into case_decision (id, firm_id, case_id, filing_id, kind, outcome, decided_on, recorded_by) values (gen_random_uuid(), '${FA}', '${c1.id}', '${hc.filings[0]}', 'DECISION', 'APPROVED', current_date, 'x')`, /is not a filing of case/)
    && refused(`insert into case_decision (id, firm_id, case_id, filing_id, kind, outcome, decided_on, recorded_by) values (gen_random_uuid(), '${FA}', '${c1.id}', '${c1.filings[0]}', 'WITHDRAWAL', 'WITHDRAWN', current_date, 'x')`, /case_decision_kind_check/));
  ok("CS-C1 DW7 fail (break m6): the database refuses a decision on a filing not recorded as submitted",
    refused(`insert into case_decision (id, firm_id, case_id, filing_id, kind, outcome, decided_on, recorded_by) values (gen_random_uuid(), '${FA}', '${c1.id}', '${c1.filings[1]}', 'DECISION', 'APPROVED', current_date, 'x')`, /is not recorded as submitted/));
  ok("CS-C1 DW7 fail: the database refuses a closed case without its closing fields, or an open one keeping them", refused(`update runtime_case set status = 'CLOSED' where id = '${c1.id}'`, /runtime_case_closing_fields_check/)
    && refused(`update runtime_case set closed_reason = 'x' where id = '${c1.id}'`, /runtime_case_closing_fields_check/)
    && refused(`update runtime_case set status = 'CLOSED', closed_at = now(), close_outcome = 'CLOSED_BY_STAFF', closed_reason = null where id = '${c1.id}'`, /runtime_case_closing_fields_check/) && refused(`update runtime_case set status = 'ARCHIVED' where id = '${c1.id}'`, /runtime_case_(status|closing_fields)_check/));
  ok("CS-C1 DW7 fail: a DELETE from inside another trigger is refused while the case exists (only the case's own cascade passes)",
    refused(`begin; create temp table csc1_t (x int); create function pg_temp.csc1_del() returns trigger language plpgsql as $f$ begin delete from case_decision where case_id = '${c1.id}'; return new; end $f$;
      create trigger csc1_t_del after insert on csc1_t for each row execute function pg_temp.csc1_del(); insert into csc1_t values (1); commit;`, /case_decision: delete is refused/) && rows(c1.id) === "2");
  sql(`delete from runtime_case where id = '${c1.id}'`);
  ok("CS-C1 DW7 pass: deleting the case itself (as the demo reset does) removes its decisions with it", rows(c1.id) === "0");

  // ------------------------------------------------------------------------------- DW8: firm B never reaches firm A's case
  const c8 = newCase({ submitted: 1 });
  await decide(c8, T.OWNER);
  const b8 = await Promise.all([decide(c8, TB), ...["withdraw", "close", "reopen"].map((w) => call(BASE, "POST", P(c8.id, w), { token: TB, body: { reason: "x", withdrawnOn: "2027-01-01" } }))]);
  ok("CS-C1 DW8 fail: firm B's token on firm A's case → 404 NOT_FOUND on all four routes; firm A's case unchanged", b8.every((x) => x.status === 404 && x.body.code === "NOT_FOUND") && caseRow(c8.id).startsWith("OPEN|") && rows(c8.id) === "1", b8.map((x) => [x.status, x.body.code]));
  const b8own = newCase({ firmKey: "sample-solo", submitted: 1 });
  const a8 = await Promise.all([decide(b8own, T.OWNER), call(BASE, "POST", P(b8own.id, "withdraw"), { token: T.OWNER, body: { reason: "x", withdrawnOn: "2027-01-01" } })]);
  r = await decide(b8own, TB);
  ok("CS-C1 DW8 pass: firm B's own case answers firm B (201) and firm A's token on it → 404, firm B's case unchanged by A", a8.every((x) => x.status === 404) && r.status === 201 && rows(b8own.id) === "1" && caseRow(b8own.id).startsWith("OPEN|") && sql(`select firm_id from case_decision where case_id = '${b8own.id}'`) === FB, [a8.map((x) => x.status), r.body]);
  const bad = await call(BASE, "POST", P("not-a-uuid", "close"), { token: T.OWNER, body: { reason: "x" } });
  ok("CS-C1 DW8 fail: a malformed case id → 404, never a 500", bad.status === 404, bad);

  // ------------------------------------------------------------------------------- W1: the journey
  const w = newCase({ submitted: 0, cmb: IND });
  const steps: [string, number][] = [];
  r = await decide(w, T.CASE_MANAGER); steps.push(["decision before the submission (refused)", r.status]);
  submit(w.id, w.filings[0]); steps.push(["submission recorded (C8.2 filing_record)", 0]);
  r = await decide(w, T.CASE_MANAGER); steps.push(["decision", r.status]);
  r = await call(BASE, "POST", P(w.id, "close"), { token: T.CASE_MANAGER, body: { reason: "Decision received" } }); steps.push(["close", r.status]);
  r = await call(BASE, "POST", P(w.id, "reopen"), { token: T.CASE_MANAGER, body: { reason: "Late document" } }); steps.push(["reopen", r.status]);
  r = await call(BASE, "POST", P(w.id, "close"), { token: T.CASE_MANAGER, body: { reason: "Late document filed" } }); steps.push(["close again", r.status]);
  ok("CS-C1 W1 pass: open → submit (C8.2 record) → decision → close → reopen → close again; the outbox holds case.closed twice and case.reopened once, in that order",
    JSON.stringify(steps.map((s) => s[1])) === JSON.stringify([409, 0, 201, 200, 200, 200]) && events(w.id, EVENT.CASE_CLOSED) === 2 && events(w.id, EVENT.CASE_REOPENED) === 1
    && sql(`select string_agg(type, ',' order by seq) from module_event where subject_id = '${w.id}'`) === "case.closed,case.reopened,case.closed" && caseRow(w.id) === `CLOSED|CLOSED_BY_STAFF|${w.stage}|true|`, [steps, sql(`select string_agg(type, ',' order by seq) from module_event where subject_id = '${w.id}'`)]);
  ok("CS-C1 W1 pass: each step left one audit line on the case (decision, close, reopen, close)", sql(`select string_agg(action, ',' order by at, id) from audit_event where entity_key = '${w.id}'`).split(",").sort().join(",") === "case.closed,case.closed,case.decision.recorded,case.reopened");
} finally {
  await app.close().catch(() => undefined);
  await db.$disconnect();
  for (const d of [DB, DEMO]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
