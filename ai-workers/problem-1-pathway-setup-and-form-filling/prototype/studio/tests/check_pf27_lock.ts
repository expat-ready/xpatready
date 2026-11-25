// PF-27 part 3a (R1.22; SA-2-34, SA-2-8, SA-2-4): our Platform Owner locks a firm and lifts the lock. Each line a pass and a
// fail: who may (Platform Owner only; Support, Admin, a firm's token refused), a reason required, lock → the firm's staff
// token answers 401 on its next request and sign-in is refused in plain words; lift → the prior status (TRIAL stays TRIAL;
// a held firm goes back on hold), sign-in works again; from DELETED or a lock → 409; one firm line, one event, our line per
// change; firm B untouched; billing never moves a locked firm. Scratch database, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf27_lock.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf27_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf27-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { wallUnscopedQueries } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity, FIRM_LOCKED } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { FIRM_MOVES, canMove } = await import("../api/src/platform/billing/webhook.ts");
const feature = (await import("../api/src/features/platform-firm-lock.ts")).default;
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const apps: { close(): Promise<void> }[] = [];
try {
  const clock = new (class extends PlatformClock { t = Date.parse("2026-11-25T15:00:00Z"); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf27-firm-standin-key-0123456789abcdef0", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf27-system-standin-key-0123456789abcd", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: PlatformJobs, useValue: { handle: async () => undefined, recurring: async () => undefined } }, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(owner);
  const staff = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf27@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await staff("Owner", ["platform-owner"]), SUPPORT = await staff("Support", ["platform-support"]), ADMIN = await staff("Admin", ["platform-admin"]), BILLING = await staff("Billing", ["platform-billing-ops"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const [ownerT, supportT, adminT, billingT] = [await tokenOf(OWNER), await tokenOf(SUPPORT), await tokenOf(ADMIN), await tokenOf(BILLING)];
  const firmSignIn = (key = "sample-firm") => call(base, "POST", "/api/platform/session/local", { body: { firmKey: key, actorId: key === "sample-firm" ? "user-R" : "user-S", secondStep: true } });
  const firmT = (await firmSignIn()).body.token as string, firmBT = (await firmSignIn("sample-solo")).body.token as string;
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const st = (f: string) => sql(`select status from platform_firm where id = '${f}'`);
  const lines = (f: string, action: string) => Number(sql(`select count(*) from audit_event where firm_id = '${f}' and action = '${action}'`));
  const events = (f: string, type: string) => Number(sql(`select count(*) from module_event where firm_id = '${f}' and type = '${type}'`));
  sql(`update platform_firm set status = 'TRIAL' where id = '${A}'`);
  const me = (t: string) => call(base, "GET", "/api/platform/me", { token: t });
  ok("setup: the firm's Owner reaches GET me before any lock (200)", (await me(firmT)).status === 200);

  // ------------------------------------------------------------------------------------------------ who may, a reason
  const L = `/api/system/firms/${A}/lock`, U = `/api/system/firms/${A}/unlock`;
  const who = await Promise.all([supportT, adminT, billingT].map((t) => call(base, "POST", L, { token: t, body: { reason: "Sample: suspected account takeover" } })));
  const firmTry = await call(base, "POST", L, { token: firmT, body: { reason: "Sample" } }), none = await call(base, "POST", L, { body: { reason: "Sample" } });
  ok("PF-27 fail: Support, Admin and Billing are refused 403; a firm's token 403 (the system plane's wall) and no session 401; nothing moved",
    who.every((r) => r.status === 403) && firmTry.status === 403 && none.status === 401 && st(A) === "TRIAL", [who.map((r) => r.status), firmTry.status, none.status]);
  const noReason = await call(base, "POST", L, { token: ownerT, body: {} });
  ok("PF-27 fail: no reason → refused with the reason field named; nothing moved", noReason.status >= 400 && noReason.status < 500 && /reason/i.test(JSON.stringify(noReason.body)) && st(A) === "TRIAL", noReason.body);
  const junk = await call(base, "POST", "/api/system/firms/not-a-firm/lock", { token: ownerT, body: { reason: "Sample" } }), nobody = await call(base, "POST", `/api/system/firms/${crypto.randomUUID()}/lock`, { token: ownerT, body: { reason: "Sample" } });
  ok("PF-27 fail: a malformed or unknown firm id → 404", junk.status === 404 && nobody.status === 404, [junk.status, nobody.status]);

  // ------------------------------------------------------------------------------------------------ the lock
  const locked = await call(base, "POST", L, { token: ownerT, body: { reason: "Sample: suspected account takeover" } });
  ok("PF-27 pass: the Platform Owner locks (200): the firm is SECURITY_LOCK, the prior TRIAL named", locked.status === 200 && locked.body.status === "SECURITY_LOCK" && locked.body.prior === "TRIAL" && st(A) === "SECURITY_LOCK", locked.body);
  const after = await me(firmT), again = await firmSignIn();
  ok("PF-27 pass: the firm's staff token answers 401 FIRM_LOCKED on its next request, and sign-in is refused in the same plain words (no reason given)",
    after.status === 401 && after.body.code === "FIRM_LOCKED" && again.status === 401 && again.body.code === "FIRM_LOCKED" && again.body.detail === FIRM_LOCKED && !/takeover/i.test(JSON.stringify([after.body, again.body])), [after.body, again.body]);
  ok("PF-27 pass: one firm line (with the reason, before and after), one firm.locked event naming the prior status, our console's ALLOWED line",
    lines(A, "platform.firm.locked") === 1 && sql(`select detail->>'reason' from audit_event where firm_id = '${A}' and action = 'platform.firm.locked'`).includes("takeover")
    && sql(`select payload->>'prior' from module_event where firm_id = '${A}' and type = 'firm.locked'`) === "TRIAL" && Number(sql(`select count(*) from plat_system_audit where outcome = 'ALLOWED' and route = '/api/system/firms/:id/lock'`)) === 1, sql(`select string_agg(action, ' ') from audit_event where firm_id = '${A}'`));
  ok("PF-27 pass: firm B is untouched (its Owner still reaches GET me, no line or event)", (await me(firmBT)).status === 200 && lines(B, "platform.firm.locked") === 0 && events(B, "firm.locked") === 0);
  const twice = await call(base, "POST", L, { token: ownerT, body: { reason: "Sample" } });
  ok("PF-27 fail: locking a locked firm → 409 ALREADY_LOCKED, one REFUSED line, no second event", twice.status === 409 && twice.body.code === "ALREADY_LOCKED" && events(A, "firm.locked") === 1 && Number(sql(`select count(*) from plat_system_audit where outcome = 'REFUSED' and code = 'ALREADY_LOCKED'`)) === 1, twice.body);
  ok("PF-27 pass: billing never moves a locked firm (FIRM_MOVES: SECURITY_LOCK to nothing)", !canMove(FIRM_MOVES, "SECURITY_LOCK", "ACTIVE") && !canMove(FIRM_MOVES, "SECURITY_LOCK", "PAYMENT_HOLD"));

  // ------------------------------------------------------------------------------------------------ the lift
  const supportLift = await call(base, "POST", U, { token: supportT, body: { reason: "Sample" } });
  const lifted = await call(base, "POST", U, { token: ownerT, body: { reason: "Sample: the Owner's identity is confirmed" } });
  ok("PF-27 pass/fail: Support cannot lift (403); the Platform Owner lifts (200) back to the prior TRIAL, not ACTIVE", supportLift.status === 403 && lifted.status === 200 && lifted.body.status === "TRIAL" && st(A) === "TRIAL", [supportLift.status, lifted.body]);
  ok("PF-27 pass: sign-in works again and the firm line and firm.unlocked event are written", (await firmSignIn()).status === 200 && lines(A, "platform.firm.unlocked") === 1 && sql(`select payload->>'to' from module_event where firm_id = '${A}' and type = 'firm.unlocked'`) === "TRIAL");
  const notLocked = await call(base, "POST", U, { token: ownerT, body: { reason: "Sample" } });
  ok("PF-27 fail: lifting a firm that is not locked → 409 NOT_LOCKED", notLocked.status === 409 && notLocked.body.code === "NOT_LOCKED", notLocked.body);
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${A}'`);
  await call(base, "POST", L, { token: ownerT, body: { reason: "Sample: second lock while on hold" } });
  const back = await call(base, "POST", U, { token: ownerT, body: { reason: "Sample" } });
  ok("PF-27 pass: a firm locked while on payment hold returns to PAYMENT_HOLD (the newest lock's prior status, not the first)", back.status === 200 && st(A) === "PAYMENT_HOLD", [back.body, st(A)]);
  sql(`update platform_firm set status = 'DELETED' where id = '${A}'`);
  const closed = await call(base, "POST", L, { token: ownerT, body: { reason: "Sample" } });
  ok("PF-27 fail: a closed (DELETED) firm cannot be locked → 409 NOT_LOCKABLE, nothing moved", closed.status === 409 && closed.body.code === "NOT_LOCKABLE" && st(A) === "DELETED", closed.body);
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
