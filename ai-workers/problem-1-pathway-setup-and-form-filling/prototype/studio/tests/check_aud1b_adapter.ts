// AUD-1b (map row 8, R1.8 part 2; SA-11-2, AG-13-40, SA-11 BR-3; P-607 (3) fail-closed; case-side contract §2.5): every
// audit line written through AuditPort carries its firm, its actor type and its request's or job's correlation id, read
// from PF-23's request scope (hook.ts's middleware, the guard's req.platform) and a job's scope; a failed line rolls the
// change back with one audit_write_failed alert and no retry; a line never lands on another firm's trail. DW1-DW7, a pass
// and a fail each. A scratch database (every migration, PF-3's Sample firms) and a small Nest app built from PF-4's own
// session classes, the guard and PF-23's request middleware, plus one probe route that records through the adapter in a
// transaction across awaits. No browser, no model call (US$0). The scratch database is dropped at the end.
// R1.8: DW8 (QA-594) a line's before and after in full through the adapter; DW9 (QA-595) a case line's firm is its case's,
// and a case line for another firm is refused.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud1b_adapter.ts
import "reflect-metadata";
import { Body, Controller, HttpCode, Inject, Module, Post, Req } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
import { fakeAudit, flattenValues } from "../ports/audit.ts";
import { fakeMail } from "../ports/mail.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { auditPortContract } from "../ports/contracts/audit-port.contract.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud1b_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const rejects = async (f: () => Promise<unknown>, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };
const refusedSql = (q: string, like: RegExp) => { try { sql(q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Res = { status: number; body: any; requestId: string | null };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown; requestId?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.requestId !== undefined) headers["x-request-id"] = o.requestId;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, requestId: r.headers.get("x-request-id") };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { AnyStaff, staffOf } = await import("../api/src/platform/identity/keys.ts");
const { actorWord } = await import("../api/src/platform/identity/audit.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController } = await import("../api/src/platform/identity/session/routes.ts");
const { AuditEventAdapter, AuditRefused, auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { auditContext } = await import("../api/src/platform/audit/context.ts");
const { requestMiddleware, auditOf } = await import("../api/src/platform/observability/hook.ts");
const { requestScope } = await import("../api/src/platform/observability/log.ts");
const { useAlerts } = await import("../api/src/platform/observability/alerts.ts");
const { observed } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { PgBossJobs } = await import("../api/src/platform/jobs/pgboss-jobs.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("aud1b-check-signing-key-0123456789abcdef", () => clock.now());
const alerts = fakeAlerts(); const restoreAlerts = useAlerts(alerts);
const failed = () => alerts.raised.filter((a) => a.kind === "audit_write_failed");

/** The probe: a change (a moduleEvent-free row: a workspace) and its audit line in one transaction, across awaits. The
 *  body may name another firm (DW6) or a key the forced-failure trigger refuses (DW4). */
@Controller("api/platform/aud1b-probe")
class ProbeController {
  constructor(@Inject(Db) private readonly dbx: InstanceType<typeof Db>) {}
  @Post() @HttpCode(200) @AnyStaff("AUD-1b's check: one change and its audit line")
  async probe(@Req() r: any, @Body() b: { key: string; firmId?: string; waitMs?: number; change?: boolean; actor?: string }) {
    const s = staffOf(r);
    // CodeQL (resource exhaustion): the probe waits only the test's own small number (at most 250 ms); anything else, none.
    const asked = Number(b.waitMs);
    const waitMs = asked > 0 && asked <= 250 ? asked : 0;
    await pause(waitMs);
    return withFirm(s.firmId, () => (this.dbx as unknown as PrismaClient).$transaction(async (tx) => {
      if (b.change) await tx.workspace.create({ data: { key: `aud1b-${b.key}`, label: "AUD-1b check change" } });
      await pause(waitMs);
      await auditEvent.record(tx, { firmId: b.firmId ?? s.firmId, actor: b.actor ?? actorWord(s.staffId), action: "platform.check.probe", entity: "platform_staff", entityKey: b.key, summary: "AUD-1b check line." });
      return { ok: true };
    }, { timeout: 20_000 }));
  }
}

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, ProbeController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  nest.use(requestMiddleware());   // PF-23's middleware, as observe() adds it in main.ts
  await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  const staff = async (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { actorId }, select: { id: true, firmId: true, firm: { select: { key: true } } } });
  const R = await staff("user-R"), S = await staff("user-S");
  const FIRM_A = R.firmId, FIRM_B = S.firmId;
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const row = (where: string) => sql(`select coalesce(firm_id::text,'') || '|' || actor_type || '|' || coalesce(correlation_id,'') || '|' || actor from audit_event where ${where} order by at desc limit 1`);
  ok("setup: two firms (A, B), each with a staff member", FIRM_A !== FIRM_B && R.firm.key && S.firm.key, { FIRM_A, FIRM_B });

  // ------------------------------------------------------------------------- DW1: a PF route's line, from the request
  const tR = await signIn("user-R", R.firm.key);
  const out = await call(base, "POST", "/api/platform/session/sign-out", { token: tR, requestId: "aud1b-dw1-given.1" });
  ok("AUD-1b DW1 pass: PF-4's sign-out line has firm_id, actor_type FIRM_STAFF and the request's own X-Request-Id as its correlation id",
    out.status === 200 && out.requestId === "aud1b-dw1-given.1" && row(`action = 'platform.staff.signed_out' and entity_key = '${R.id}'`) === `${FIRM_A}|FIRM_STAFF|aud1b-dw1-given.1|staff:${R.id}`, [out.status, row(`action = 'platform.staff.signed_out'`)]);
  clock.t += 1000;
  const tR2 = await signIn("user-R", R.firm.key);
  const bad = await call(base, "POST", "/api/platform/session/sign-out", { token: tR2, requestId: "Client A <a@example.com>" });
  const badRow = row(`action = 'platform.staff.signed_out' and entity_key = '${R.id}'`);
  ok("AUD-1b DW1 fail: a malformed X-Request-Id is replaced, never stored: the line carries the new id the answer sent back",
    bad.status === 200 && !!bad.requestId && bad.requestId !== "Client A <a@example.com>" && badRow === `${FIRM_A}|FIRM_STAFF|${bad.requestId}|staff:${R.id}` && sql(`select count(*) from audit_event where correlation_id like '%example.com%'`) === "0", [bad.requestId, badRow]);

  clock.t += 1000;
  const tR3 = await signIn("user-R", R.firm.key);
  const forged = await call(base, "POST", "/api/platform/session/sign-out", { token: tR3, requestId: "job:aud1b-forged" });
  ok("AUD-1b DW1 fail (breaker m1): a caller's X-Request-Id in a job's form (job:…) is replaced, so a request's line never passes for a job's",
    forged.status === 200 && forged.requestId !== "job:aud1b-forged" && sql("select count(*) from audit_event where correlation_id ilike 'job:aud1b-forged'") === "0", forged.requestId);

  // ------------------------------------------------------------------------- DW2: a job's line; a line outside any scope
  const jobKey = "aud1b-dw2-job-1";
  const runJob = observed("aud1b-check", async (j) => {
    await pause(5);
    await db.$transaction((tx) => auditEvent.record(tx, { firmId: j.firmId!, actor: "system:aud1b-check", action: "platform.check.job", entity: "platform_staff", entityKey: jobKey, summary: "AUD-1b job line." }));
  });
  await runJob({ name: "aud1b-check", key: jobKey, firmId: FIRM_B, payload: {}, runAt: new Date(clock.now()), attempt: 1 });
  let jobCtx: unknown;
  await observed("aud1b-check", async () => { jobCtx = auditContext(); })({ name: "aud1b-check", key: "aud1b-dw2-ctx", firmId: FIRM_B, payload: {}, runAt: new Date(clock.now()), attempt: 1 });
  ok("AUD-1b DW2 pass: a job's line has actor_type SYSTEM, the job's firm and the job's correlation id (job:<key>); the job's context says SYSTEM",
    row(`entity_key = '${jobKey}'`) === `${FIRM_B}|SYSTEM|job:${jobKey}|system:aud1b-check` && (jobCtx as any)?.actorType === "SYSTEM" && (jobCtx as any)?.firmId === FIRM_B, [row(`entity_key = '${jobKey}'`), jobCtx]);
  const jobOther = await rejects(() => observed("aud1b-check", async () => { await db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: "system:aud1b-check", action: "platform.check.job", entity: "platform_staff", entityKey: "aud1b-dw2-other", summary: "AUD-1b job line." })); })({ name: "aud1b-check", key: "aud1b-dw2-other", firmId: FIRM_B, payload: {}, runAt: new Date(clock.now()), attempt: 1 }), (e) => e instanceof AuditRefused);
  await db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: "seed:aud1b-check", action: "platform.check.seed", entity: "platform_staff", entityKey: "aud1b-dw2-none", summary: "AUD-1b line outside any scope." }));
  ok("AUD-1b DW2 fail: a line outside any request or job has no correlation id and its actor word's type (seed: → SEED); a job's entry for another firm is refused",
    auditContext() === undefined && row(`entity_key = 'aud1b-dw2-none'`) === `${FIRM_A}|SEED||seed:aud1b-check` && jobOther && sql(`select count(*) from audit_event where entity_key = 'aud1b-dw2-other'`) === "0", row(`entity_key = 'aud1b-dw2-none'`));

  // Review round 2 minor 2 (breaker m2): a handler on the real pg-boss runner, registered and started inside a firm A
  // request scope, runs a firm B job: the job's own firm wins, so a firm A entry is refused and a firm B one is written.
  const boss = new PgBossJobs({ connectionString: urlOf(DB), pollingIntervalSeconds: 0.5 });
  const seen: { ctx?: unknown; refusedA?: boolean; wroteB?: boolean } = {};
  try {
    await requestScope.run({ correlationId: "aud1b-dw2-request", firmId: () => FIRM_A }, async () => {
      await boss.handle("aud1b.dw2", async (j) => {
        seen.ctx = auditContext();
        const line = (firmId: string, key: string) => db.$transaction((tx) => auditEvent.record(tx, { firmId, actor: "system:aud1b-boss", action: "platform.check.job", entity: "platform_staff", entityKey: key, summary: "AUD-1b pg-boss line." }));
        seen.refusedA = await rejects(() => line(FIRM_A, "aud1b-dw2-boss-a"), (e) => e instanceof AuditRefused);
        await line(j.firmId!, "aud1b-dw2-boss-b"); seen.wroteB = true;
      });
      await boss.start();
      await boss.enqueue("aud1b.dw2", {}, { key: "aud1b-dw2-boss", firmId: FIRM_B });
    });
    for (let i = 0; i < 60 && seen.wroteB === undefined; i++) await pause(250);
  } finally { await boss.stop(); }
  ok("AUD-1b DW2 fail (review minor 2): inside a pg-boss job started from a firm A request, the job's firm B wins: a firm A entry is refused, the firm B line is written",
    seen.wroteB === true && seen.refusedA === true && (seen.ctx as any)?.firmId === FIRM_B && (seen.ctx as any)?.actorType === "SYSTEM" && sql("select count(*) from audit_event where entity_key = 'aud1b-dw2-boss-a'") === "0" && row(`entity_key = 'aud1b-dw2-boss-b'`).startsWith(`${FIRM_B}|SYSTEM|`), seen);

  // ------------------------------------------------------------------------- DW3: a scope marked ours
  // AUD-3a: one of ExpatReady's own staff (PF-4s's guard puts them on req.systemStaff, never req.platform) acts as
  // ourstaff:<id>, OUR_STAFF; a firm's staff member as staff:<id>, FIRM_STAFF.
  const OURS = "0f0f0f0f-0000-4000-8000-00000000a3a1";
  const ours = { systemStaff: { staffId: OURS } }, theirs = { platform: { staffId: R.id, firmId: FIRM_A } };
  const inScope = <T>(req: object, fn: () => T) => requestScope.run({ correlationId: "aud1b-dw3", firmId: () => (("platform" in req) ? FIRM_A : undefined), audit: () => auditOf(req as never) }, fn);
  const ctxOurs = inScope(ours, () => auditContext()), ctxTheirs = inScope(theirs, () => auditContext());
  ok("AUD-1b DW3 pass (AUD-3a): our staff's request (req.systemStaff) acts as ourstaff:<id>, OUR_STAFF, with no firm of its own; a firm's staff gives staff:<id>, FIRM_STAFF",
    ctxOurs?.actorType === "OUR_STAFF" && ctxOurs.actor === `ourstaff:${OURS}` && ctxOurs.firmId === undefined && ctxOurs.correlationId === "aud1b-dw3" && ctxTheirs?.actorType === "FIRM_STAFF" && ctxTheirs.actor === `staff:${R.id}`, { ctxOurs, ctxTheirs });
  const write = (req: object, actor: string, key: string) => inScope(req, () => db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor, action: "platform.check.ours", entity: "platform_staff", entityKey: key, summary: "AUD-1b ours." })));
  const oursRefusedWith = (req: object, actor: string, key: string, re: RegExp) => rejects(() => write(req, actor, key), (e) => e instanceof AuditRefused && re.test((e as Error).message));
  const oursRefused = [await oursRefusedWith(ours, `staff:${OURS}`, "aud1b-dw3-staffword", /OUR_STAFF/), await oursRefusedWith(ours, `staff:${R.id}`, "aud1b-dw3", /OUR_STAFF/), await oursRefusedWith(ours, "system:support", "aud1b-dw3-system", /OUR_STAFF/),
    await oursRefusedWith(ours, `ourstaff:${OURS.toUpperCase()}`, "aud1b-dw3-upper", /this request is ourstaff/), await oursRefusedWith(ours, "ourstaff:0f0f0f0f-0000-4000-8000-00000000a3a2", "aud1b-dw3-other", /this request is ourstaff/)];
  ok("AUD-1b DW3 fail (breaker M1; AUD-3a): in our staff's request a line under any word but their own is refused (staff: with their id or another's, system:, ourstaff: in another case or of another person); nothing written",
    oursRefused.every(Boolean) && sql(`select count(*) from audit_event where entity_key like 'aud1b-dw3%'`) === "0", oursRefused);
  const elsewhere = [await oursRefusedWith(theirs, `ourstaff:${OURS}`, "aud1b-dw3-firmreq", /our staff's word/), await rejects(() => db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: `ourstaff:${OURS}`, action: "platform.check.ours", entity: "platform_staff", entityKey: "aud1b-dw3-noreq", summary: "AUD-1b ours." })), (e) => e instanceof AuditRefused && /our staff's word/.test((e as Error).message))];
  ok("AUD-1b DW3 fail (AUD-3a): our staff's word is never written outside our staff's request (a firm staff member's request, no request at all)", elsewhere.every(Boolean) && sql(`select count(*) from audit_event where entity_key like 'aud1b-dw3%'`) === "0", elsewhere);
  await write(ours, `ourstaff:${OURS}`, "aud1b-dw3-own");
  ok("AUD-3a pass: in our staff's request their own line is written on the firm's trail, OUR_STAFF, under ourstaff:<id>, with the request's correlation id",
    sql(`select firm_id || '|' || actor_type || '|' || actor || '|' || correlation_id from audit_event where entity_key = 'aud1b-dw3-own'`) === `${FIRM_A}|OUR_STAFF|ourstaff:${OURS}|aud1b-dw3`);
  ok("AUD-3a pass (database): the insert trigger maps ourstaff:<id> to OUR_STAFF, and refuses a writer that passes it as FIRM_STAFF",
    sql(`select aud_event_actor_type('ourstaff:${OURS}')::text || '|' || aud_event_actor_type('staff:${OURS}')::text || '|' || coalesce(aud_event_actor_type('ourstaff:')::text, 'none')`) === "OUR_STAFF|FIRM_STAFF|none"
    && refusedSql(`insert into audit_event (id, workspace_id, actor, actor_type, action, entity, entity_key, summary) select gen_random_uuid(), id, 'ourstaff:${OURS}', 'FIRM_STAFF', 'x', 'platform_staff', 'aud1b-dw3-trigger', 'x' from workspace limit 1`, /is OUR_STAFF, not FIRM_STAFF/));
  const badId = await rejects(() => write({ systemStaff: { staffId: "bad id!" } }, "staff:x", "aud1b-dw3-badid"), (e) => /not an actor id/.test(String(e)));
  ok("AUD-3a fail (review n1): our staff's request whose id is not an actor id fails closed: no line at all, under any word", badId && sql(`select count(*) from audit_event where entity_key = 'aud1b-dw3-badid'`) === "0", badId);
  const pf25Checks = sql(`select string_agg(conname || '=' || (pg_get_constraintdef(oid) like '%(staff|ourstaff|system|seed):%')::text, ',' order by conname) from pg_constraint where conname in ('platform_firm_web_address_set_by', 'platform_firm_address_history_changed_by')`);
  ok("AUD-3a pass (database): PF-25's two actor columns (set_by, changed_by) accept the word too, for PF-25w's change by our staff; nothing else in their patterns changed",
    pf25Checks === "platform_firm_address_history_changed_by=true,platform_firm_web_address_set_by=true", pf25Checks);

  // ------------------------------------------------------------------------- DW4: a forced audit failure, fail-closed
  sql(`create sequence aud1b_tries; create function aud1b_force() returns trigger language plpgsql as $$ begin perform nextval('aud1b_tries'); raise exception 'aud1b forced audit failure'; end $$;
       create trigger aud1b_force before insert on audit_event for each row when (new.entity_key like 'aud1b-dw4%') execute function aud1b_force();`);
  const tS = await signIn("user-S", S.firm.key);
  const f0 = failed().length, ws0 = sql("select count(*) from workspace");
  const forced = await call(base, "POST", "/api/platform/aud1b-probe", { token: tS, body: { key: "aud1b-dw4", change: true }, requestId: "aud1b-dw4-req" });
  const tries = sql("select last_value || ':' || is_called from aud1b_tries");
  const alarm = failed().slice(f0);
  ok("AUD-1b DW4 pass: a forced failure of the adapter's own write rolls the change back (no workspace row) and the request fails",
    forced.status >= 500 && sql("select count(*) from workspace") === ws0 && sql("select count(*) from workspace where key = 'aud1b-aud1b-dw4'") === "0" && sql("select count(*) from audit_event where entity_key like 'aud1b-dw4%'") === "0", forced);
  ok("AUD-1b DW4 fail: exactly one audit_write_failed alert, ids only (firm, entity, key), and no retry (the write was tried once)",
    alarm.length === 1 && alarm[0].detail.firmId === FIRM_B && alarm[0].detail.entity === "platform_staff" && alarm[0].detail.entityKey === "aud1b-dw4" && Object.keys(alarm[0].detail).sort().join() === "entity,entityKey,firmId,rule" && tries === "1:true", { alarm, tries });
  // Review M2: count the adapter's own inserts through a proxy on the transaction (inside PostgreSQL a second try would
  // fail before the trigger, so the sequence alone cannot show it).
  let creates = 0, tries4 = 0; const f4 = failed().length;
  await rejects(() => db.$transaction(async (tx) => {
    // Each try starts with the platform-audit workspace read (platformAuditWorkspaceId), then the insert: count both.
    const spy = new Proxy(tx, { get: (o, k) => { if (k === "workspace") tries4++; return k === "auditEvent" ? new Proxy(o.auditEvent, { get: (ae, m) => m === "create" ? (...a: unknown[]) => { creates++; return (ae.create as (...x: unknown[]) => unknown)(...a); } : (ae as any)[m] }) : (o as any)[k]; } });
    await auditEvent.record(spy as typeof tx, { firmId: FIRM_B, actor: "system:aud1b-check", action: "platform.check.forced", entity: "platform_staff", entityKey: "aud1b-dw4-count", summary: "AUD-1b forced line." });
  }));
  ok("AUD-1b DW4 fail (review M2): the adapter tries a failing line exactly once (one workspace read, one insert: no retry), with one more alert",
    creates === 1 && tries4 === 1 && failed().length === f4 + 1, { creates, tries4, alerts: failed().length - f4 });
  sql("drop trigger aud1b_force on audit_event; drop function aud1b_force(); drop sequence aud1b_tries;");

  // ------------------------------------------------------------------------- DW5: 100 interleaved requests, two firms
  const tokens = { A: await signIn("user-R", R.firm.key), B: tS };
  const N = 100, reqs = Array.from({ length: N }, (_, i) => ({ i, firm: i % 2 ? "B" : "A", rid: `aud1b-dw5-${i}`, wait: (i * 7) % 23 }));
  const answers = await Promise.all(reqs.map((q) => call(base, "POST", "/api/platform/aud1b-probe", { token: tokens[q.firm as "A" | "B"], body: { key: `aud1b-dw5-${q.i}`, waitMs: q.wait }, requestId: q.rid })));
  const got = new Map(sql(`select entity_key || '|' || firm_id || '|' || coalesce(correlation_id,'') from audit_event where entity_key like 'aud1b-dw5-%'`).split("\n").filter(Boolean).map((l) => { const [k, f, c] = l.split("|"); return [k, { f, c }]; }));
  const swapped = reqs.filter((q) => { const g = got.get(`aud1b-dw5-${q.i}`); return !g || g.c !== q.rid || g.f !== (q.firm === "A" ? FIRM_A : FIRM_B); });
  ok(`AUD-1b DW5 pass: ${N} interleaved requests (own X-Request-Id each, two firms, awaits inside and outside the transaction) give ${N} lines, each with its own correlation id and firm`,
    answers.every((a) => a.status === 200) && got.size === N && swapped.length === 0, { statuses: [...new Set(answers.map((a) => a.status))], size: got.size, swapped: swapped.slice(0, 5) });
  ok("AUD-1b DW5 fail: no correlation id is on two lines, and none is on a line of the other firm",
    Number(sql(`select count(distinct correlation_id) from audit_event where entity_key like 'aud1b-dw5-%'`)) === N && sql(`select count(*) from audit_event where entity_key like 'aud1b-dw5-%' and ((substring(entity_key from 11)::int % 2 = 0) <> (firm_id = '${FIRM_A}'))`) === "0");

  // ------------------------------------------------------------------------- DW6: an entry for another firm
  const f6 = failed().length, ws6 = sql("select count(*) from workspace");
  const other = await call(base, "POST", "/api/platform/aud1b-probe", { token: tokens.A, body: { key: "aud1b-dw6", firmId: FIRM_B, change: true } });
  ok("AUD-1b DW6 fail: an entry whose firm differs from the request's firm is refused: the request fails, nothing is written, the change rolls back, one alert",
    other.status >= 500 && sql("select count(*) from audit_event where entity_key = 'aud1b-dw6'") === "0" && sql("select count(*) from workspace") === ws6 && failed().length === f6 + 1 && failed().at(-1)!.detail.entityKey === "aud1b-dw6" && failed().at(-1)!.detail.firmId === FIRM_A, [other, failed().at(-1)]);
  const words = [`staff:${S.id}`, `staff:${R.id.toUpperCase()}`, "system:aud1b-door", "seed:aud1b-row"];
  const wrong = await Promise.all(words.map((actor, i) => call(base, "POST", "/api/platform/aud1b-probe", { token: tokens.A, body: { key: `aud1b-dw6-actor-${i}`, actor, change: true } })));
  ok("AUD-1b DW6 fail (review M1, breaker M1): in a signed-in request, a line naming any actor but the request's own (another staff member, its own id in upper case, system:, seed:) is refused; nothing written, the changes roll back",
    wrong.every((w) => w.status >= 500) && sql("select count(*) from audit_event where entity_key like 'aud1b-dw6-actor-%'") === "0" && sql("select count(*) from workspace where key like 'aud1b-aud1b-dw6-actor-%'") === "0", wrong.map((w) => w.status));

  const own = await call(base, "POST", "/api/platform/aud1b-probe", { token: tokens.A, body: { key: "aud1b-dw6-own", firmId: FIRM_A.toUpperCase(), change: true } });
  ok("AUD-1b DW6 pass: the same entry naming the request's own firm (any letter case) is written, lower-cased, with its change",
    own.status === 200 && row(`entity_key = 'aud1b-dw6-own'`).startsWith(`${FIRM_A}|FIRM_STAFF|`) && sql("select count(*) from workspace where key = 'aud1b-aud1b-dw6-own'") === "1", own);

  // ------------------------------------------------------------------------- DW7: the port's contract, caseId included
  const CASE = "0c0c0c0c-0000-4000-8000-0000000000c3";
  await runContract(auditPortContract, "fakeAudit", () => { const a = fakeAudit(); return { audit: a, commit: (fn) => a.transaction(fn), rollback: (fn) => a.transaction(async (tx) => { await fn(tx); throw new Error("roll back"); }).catch(() => undefined), lines: async (firm, prefix) => a.entries.filter((e) => e.firmId.toLowerCase() === firm && e.entityKey.startsWith(prefix)).map((e) => ({ ...e, values: flattenValues(e.before, e.after) })) }; }, ok);
  await runContract(auditPortContract, "AuditEventAdapter", () => ({ audit: new AuditEventAdapter(), commit: (fn) => db.$transaction((tx) => fn(tx)), rollback: (fn) => db.$transaction(async (tx) => { await fn(tx); throw new Error("roll back"); }).catch(() => undefined),
    lines: async (firm, prefix) => (await db.auditEvent.findMany({ where: { firmId: firm, entityKey: { startsWith: prefix } }, orderBy: [{ at: "asc" }, { entityKey: "asc" }] })).map((e) => ({ actor: e.actor, action: e.action, entity: e.entity, entityKey: e.entityKey ?? "", summary: e.summary, caseId: e.caseId, values: Object.fromEntries(Object.entries((e.detail ?? {}) as Record<string, unknown>).filter(([k]) => /_(before|after)$/.test(k))) })) }), ok);
  await db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: "system:aud1b-check", action: "platform.check.case", entity: "platform_staff", entityKey: "aud1b-dw7", summary: "AUD-1b case line.", caseId: CASE }));
  ok("AUD-1b DW7 pass: the adapter keeps the entry's caseId in case_id and the firm in both firm_id and detail.firmId",
    sql(`select case_id || '|' || firm_id || '|' || (detail->>'firmId') from audit_event where entity_key = 'aud1b-dw7'`) === `${CASE}|${FIRM_A}|${FIRM_A}`);
  ok("AUD-1b DW7 fail: a caseId that is not a uuid is refused and writes nothing",
    await rejects(() => db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: "system:aud1b-check", action: "platform.check.case", entity: "platform_staff", entityKey: "aud1b-dw7-bad", summary: "AUD-1b case line.", caseId: "case-1" }))) && sql("select count(*) from audit_event where entity_key = 'aud1b-dw7-bad'") === "0");

  // ------------------------------------------------------------------------- DW8 (R1.8, QA-594): before and after in full
  const pf = (key: string, o: Record<string, unknown>) => db.$transaction((tx) => auditEvent.record(tx, { firmId: FIRM_A, actor: "system:aud1b-check", action: "fo.person.phone_edited", entity: "fo_person", entityKey: key, summary: "Phone changed.", detail: { foPersonId: key }, ...o }));
  await pf("aud1b-dw8", { before: { phone: "+1 416 555 0100", ownerStaffId: R.id }, after: { phone: "+1 416 555 0199", ownerStaffId: R.id } });
  await pf("aud1b-dw8-new", { before: null, after: { name: "Client A", email: "client.a@example.com" } });
  const d8 = JSON.parse(sql("select detail::text from audit_event where entity_key = 'aud1b-dw8'") || "{}"), d8n = JSON.parse(sql("select detail::text from audit_event where entity_key = 'aud1b-dw8-new'") || "{}");
  ok("AUD-1b DW8 pass (QA-594, P-687): a change's before and after land on the line in full, personal values included, as <field>_before / <field>_after; an unchanged field is left out; a create has lone _after values",
    d8.phone_before === "+1 416 555 0100" && d8.phone_after === "+1 416 555 0199" && !("ownerStaffId_before" in d8) && d8.foPersonId === "aud1b-dw8" && d8.firmId === FIRM_A
    && d8n.name_after === "Client A" && d8n.email_after === "client.a@example.com" && !("name_before" in d8n), { d8, d8n });
  const secret = await rejects(() => pf("aud1b-dw8-secret", { before: null, after: { passwordHash: "x" } }));
  const inDetail = await rejects(() => pf("aud1b-dw8-detail", { detail: { phone_after: "+1 416 555 0199" } }));
  ok("AUD-1b DW8 fail: a secret in after (a password hash) and a <field>_after in detail are refused; nothing written",
    secret && inDetail && sql("select count(*) from audit_event where entity_key in ('aud1b-dw8-secret', 'aud1b-dw8-detail')") === "0");

  // ------------------------------------------------------------------------- DW9 (R1.8, QA-595): a case line carries its firm
  // Two cases on the scratch copy, written as the owner with triggers off (only the firm columns matter here): one with
  // firm A's id, one with firm A's key and no id yet (the lookup gives its firm).
  const WS9 = sql("insert into workspace (id, key, label) values (gen_random_uuid(), 'aud1b-dw9', 'AUD-1b DW9') returning id");
  const CASE_A = "0c0c0c0c-0000-4000-8000-0000000009a1", CASE_K = "0c0c0c0c-0000-4000-8000-0000000009a2", CASE_NONE = "0c0c0c0c-0000-4000-8000-0000000009ff";
  sql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, client_id, firm_key, firm_id) values
       ('${CASE_A}', '${WS9}', gen_random_uuid(), 'user-P', 'aud1b', 'C-2026-90001', gen_random_uuid(), '${R.firm.key}', '${FIRM_A}'),
       ('${CASE_K}', '${WS9}', gen_random_uuid(), 'user-P', 'aud1b', 'C-2026-90002', gen_random_uuid(), '${R.firm.key}', null);`);
  const caseLine = (key: string, o: Record<string, unknown> = {}) => db.$transaction((tx) => auditEvent.record(tx, { workspaceId: WS9, actor: "system:aud1b-check", action: "answered", entity: "case", entityKey: key, summary: "AUD-1b DW9 case line.", ...o }));
  const inFirm = <T>(firm: string, fn: () => Promise<T>) => requestScope.run({ correlationId: `aud1b-dw9-${firm.slice(0, 4)}`, firmId: () => firm }, fn);
  const firmOfLine = (key: string) => sql(`select coalesce(firm_id::text, '-') from audit_event where entity_key = '${key}'`);
  await caseLine("aud1b-dw9-a", { caseId: CASE_A });
  await caseLine("aud1b-dw9-k", { caseId: CASE_K });
  await inFirm(FIRM_A, () => caseLine("aud1b-dw9-own", { caseId: CASE_A, firmId: FIRM_A.toUpperCase() }));
  await caseLine("aud1b-dw9-config");
  await inFirm(FIRM_B, () => caseLine("aud1b-dw9-config-b"));
  ok("AUD-1b DW9 pass (QA-595): a case line carries its case's firm, outside any request (firm_id, else the firm key's platform firm) and in its own firm's request naming its own firm; a configuration line has the request's firm, else none",
    firmOfLine("aud1b-dw9-a") === FIRM_A && firmOfLine("aud1b-dw9-k") === FIRM_A && firmOfLine("aud1b-dw9-own") === FIRM_A && firmOfLine("aud1b-dw9-config") === "-" && firmOfLine("aud1b-dw9-config-b") === FIRM_B,
    ["a", "k", "own", "config", "config-b"].map((k) => firmOfLine(`aud1b-dw9-${k}`)));
  const f9 = failed().length;
  const crossScope = await inFirm(FIRM_B, () => rejects(() => caseLine("aud1b-dw9-cross", { caseId: CASE_A }), (e) => e instanceof AuditRefused && /belongs to firm/.test((e as Error).message)));
  const crossNamed = await rejects(() => caseLine("aud1b-dw9-named", { caseId: CASE_A, firmId: FIRM_B }), (e) => e instanceof AuditRefused);
  const crossConfig = await inFirm(FIRM_A, () => rejects(() => caseLine("aud1b-dw9-named-config", { firmId: FIRM_B }), (e) => e instanceof AuditRefused));
  const noCase = await rejects(() => caseLine("aud1b-dw9-nocase", { caseId: CASE_NONE }), (e) => e instanceof AuditRefused && /does not exist/.test((e as Error).message));
  ok("AUD-1b DW9 fail (QA-595): a case line refused when firm B's request writes about firm A's case, when it names firm B for firm A's case, when a configuration line names another firm than its request's, and when its case does not exist; nothing written, one alert each, never spent on the other firm",
    crossScope && crossNamed && crossConfig && noCase && sql("select count(*) from audit_event where entity_key in ('aud1b-dw9-cross', 'aud1b-dw9-named', 'aud1b-dw9-named-config', 'aud1b-dw9-nocase')") === "0"
    && failed().length === f9 + 4 && failed().slice(f9)[0].detail.firmId === FIRM_B, { crossScope, crossNamed, crossConfig, noCase, alerts: failed().slice(f9).map((a) => a.detail) });
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${(e as Error).stack ?? e}`);
} finally {
  useAlerts(restoreAlerts);
  await app?.close(); await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
