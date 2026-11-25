// AUD-3b part 1 (R1.87; SA-2-16, SA-2-17, SA-2-18, SA-11-11; P-607 (4)): our staff's read-only support session into one
// firm. Each "Done when" line passes and fails, through PF-4s's real guard, AUD-3's interceptor and the walled pool:
// SS1 start: a reason, a fresh second step and system/firm:impersonate (Platform Owner, Support) start a READ session of
// exactly 60 minutes, with one platform.support_session.started line on the firm's trail (the reason, the session); no
// reason, a stale sign-in, no key, an unknown firm → refused, nothing opened; a second session while one is open → 409.
// SS2 a read of the firm in the session: its line carries the session id and the reason. SS3 always blocked: any change,
// another firm, a read across firms and starting another session → 403, with one refusal line on the session's firm.
// SS4 an ended (minute 61), unknown or another person's session → 401. SS5 the register: never deleted or rewritten;
// the app's own role reads nothing in it. One process, a scratch database (dropped at the end), no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud3b_support_session.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud3b_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (f: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(DB, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, user = "xr_studio") => { try { sql(q, user); return false; } catch { return true; } };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();
type Res = { status: number; body: any; requestId: string | null };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown; session?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "aud3b-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.session !== undefined) headers["x-support-session"] = o.session;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, requestId: r.headers.get("x-request-id") };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psqlFile(join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { appDatabaseUrl, wallUnscopedQueries, WalledPool } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard } = await import("../api/src/platform/system-identity/guard.ts");
const sysFeature = (await import("../api/src/features/platform-system-identity.ts")).default;
const holdsFeature = (await import("../api/src/features/platform-register-holds.ts")).default;
const consoleFeature = (await import("../api/src/features/platform-system-console.ts")).default;
const accessFeature = (await import("../api/src/features/audit-access.ts")).default;
const sessionFeature = (await import("../api/src/features/platform-support-session.ts")).default;
const { assertFirmDataDeclared } = await import("../api/src/platform/audit/access/lines.ts");
const { ALWAYS_BLOCKED, REFUSED, STARTED, SupportSessionCalls } = await import("../api/src/platform/support-session/service.ts");
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 6, options: "-c TimeZone=UTC" });
const apps: { close(): Promise<void> }[] = [];
const lines = (where: string) => Number(sql(`select count(*) from audit_event where ${where}`));
const sessions = (where = "true") => Number(sql(`select count(*) from plat_support_session where ${where}`));

try {
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("aud3b-firm-standin-key-0123456789abcdefg", () => clock.now());
  const systemLocal = new SystemLocalIdentity("aud3b-system-standin-key-0123456789abc", () => clock.now());
  const sysProviders = sysFeature.providers.filter((p: any) => p !== PlatformClock && p?.provide !== SYSTEM_IDENTITY_PORT && p?.provide !== APP_GUARD);
  @Module({ controllers: [PlatformIdentityController, ...sysFeature.controllers, ...holdsFeature.controllers, ...consoleFeature.controllers, ...accessFeature.controllers, ...sessionFeature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, ...sysProviders, { provide: APP_GUARD, useExisting: SystemGuard },
      ...accessFeature.providers, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...holdsFeature.providers, ...consoleFeature.providers, { provide: PlatformJobs, useValue: { handle: async () => undefined, recurring: async () => undefined } }, ...sessionFeature.providers] as never[] }) class TestApp {}   // the app's order: audit-access.ts first, platform-support-session.ts inside it
  const app = await NestFactory.create(TestApp, { logger: ["error"], abortOnError: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("AUD-3b setup: the app runs the session interceptor, and every route our staff call declares its firm data (the new route included)",
    app.get(SupportSessionCalls) instanceof SupportSessionCalls && (() => { try { assertFirmDataDeclared([...sessionFeature.controllers], app.get(Reflector)); return true; } catch { return false; } })());

  await seedSampleFirms(owner);
  const newFirm = async () => { const k = `aud3b-${uuid().slice(0, 8)}`; return (await owner.$queryRaw<{ id: string }[]>`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at)
    values (gen_random_uuid(), ${k}, 'Sample session firm', 'CA', ${`${k}@sample-firm.example`}, now()) returning id::text as id`)[0].id; };
  const firmA = await newFirm(), firmB = await newFirm();
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.aud3b@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), BILLING = await person("Billing", ["platform-billing-ops"]), AUDITOR = await person("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), billingT = await tokenOf(BILLING), auditorT = await tokenOf(AUDITOR);
  const START = (f: string) => `/api/system/firms/${f}/support-sessions`, REASON = "Sample: ticket 42, the firm cannot see its invoices";

  // ------------------------------------------------------------------------------------------------ SS1: start
  ok("AUD-3b SS1 (catalogue, SA-07 Appendix A \"Start a support session\"): system/firm:impersonate is the Platform Owner's and Support's",
    sql(`select string_agg(role_code, ',' order by role_code) from plat_system_role_permission where permission_key = 'system/firm:impersonate'`) === "platform-owner,platform-support");
  const a0 = lines(`firm_id = '${firmA}'`), b0 = lines(`firm_id = '${firmB}'`);
  const started = await call(base, "POST", START(firmA), { token: supportT, body: { reason: REASON } });
  const S = started.body?.id as string;
  const startLine = sql(`select actor_type || '|' || actor || '|' || entity_key || '|' || (detail->>'reason') || '|' || (detail->>'mode') from audit_event where firm_id = '${firmA}' and action = '${STARTED}'`);
  const span = Number(sql(`select extract(epoch from ends_at - started_at) from plat_support_session where id = '${S}'`));
  ok("AUD-3b SS1 pass (SA-2-16, SA-2-18): our Support with a reason starts a READ session of exactly 60 minutes (201), answered with its end, the header to send and SA-2-17's always-blocked list",
    started.status === 201 && /^[0-9a-f-]{36}$/.test(S) && started.body.mode === "READ" && started.body.reason === REASON && span === 3600 && started.body.header === "X-Support-Session"
    && Date.parse(started.body.endsAt) - Date.parse(started.body.startedAt) === 3_600_000 && JSON.stringify(started.body.alwaysBlocked) === JSON.stringify(ALWAYS_BLOCKED) && ALWAYS_BLOCKED.includes("Starting another session"), started.body);
  ok("AUD-3b SS1 pass (SA-11-11, SA-2-29): one platform.support_session.started line on firm A's own trail, OUR_STAFF, naming our Support, the session, the reason and the mode; none on firm B's",
    startLine === `OUR_STAFF|ourstaff:${SUPPORT}|${S}|${REASON}|READ` && lines(`firm_id = '${firmA}'`) === a0 + 1 && lines(`firm_id = '${firmB}'`) === b0, startLine);
  const n0 = sessions(), l0 = lines("true");
  const noReason = await call(base, "POST", START(firmB), { token: ownerT, body: {} });
  const blank = await call(base, "POST", START(firmB), { token: ownerT, body: { reason: "   " } });
  const long = await call(base, "POST", START(firmB), { token: ownerT, body: { reason: "x".repeat(201) } });
  const extra = await call(base, "POST", START(firmB), { token: ownerT, body: { reason: REASON, mode: "CHANGE" } });
  ok("AUD-3b SS1 fail (SA-2-16, BR-11: blank reason rejected): no reason, a blank one, one over 200 characters, or a field it does not take (mode CHANGE) → 422; nothing opened, no line",
    noReason.status === 422 && noReason.body.code === "REASON_REQUIRED" && blank.status === 422 && long.status === 422 && extra.status === 422 && sessions() === n0 && lines("true") === l0,
    { noReason: noReason.body?.code, blank: blank.status, long: long.status, extra: extra.status });
  const noKey = await call(base, "POST", START(firmB), { token: billingT, body: { reason: REASON } });
  const auditorStart = await call(base, "POST", START(firmB), { token: auditorT, body: { reason: REASON } });
  const noToken = await call(base, "POST", START(firmB), { body: { reason: REASON } });
  ok("AUD-3b SS1 fail (the key): Billing and the Auditor (no system/firm:impersonate) get 403, no token 401; nothing opened",
    noKey.status === 403 && auditorStart.status === 403 && noToken.status === 401 && sessions() === n0 && lines("true") === l0, { noKey: noKey.status, auditor: auditorStart.status, noToken: noToken.status });
  clock.t += 6 * 60_000;
  const stale = await call(base, "POST", START(firmB), { token: ownerT, body: { reason: REASON } });
  clock.t -= 6 * 60_000;
  ok("AUD-3b SS1 fail (SA-2-16's step-up, SA7-D35): a sign-in more than 5 minutes old → 401 STEP_UP_REQUIRED, nothing opened", stale.status === 401 && stale.body.code === "STEP_UP_REQUIRED" && sessions() === n0, stale.body);
  const ghost = await call(base, "POST", START(uuid()), { token: ownerT, body: { reason: REASON } }), bad = await call(base, "POST", START("not-a-firm"), { token: ownerT, body: { reason: REASON } });
  ok("AUD-3b SS1 fail: an unknown or malformed firm → 404, nothing opened, no line", ghost.status === 404 && bad.status === 404 && sessions() === n0 && lines("true") === l0, { ghost: ghost.status, bad: bad.status });
  const second = await call(base, "POST", START(firmB), { token: supportT, body: { reason: REASON } });
  ok("AUD-3b SS1 fail (SA-2-17: starting another session): while our Support's session is open, a second one (any firm) → 409 SUPPORT_SESSION_OPEN naming the open one; nothing opened",
    second.status === 409 && second.body.code === "SUPPORT_SESSION_OPEN" && second.body.sessionId === S && sessions() === n0, second.body);
  const both = await Promise.all([call(base, "POST", START(firmB), { token: ownerT, body: { reason: REASON } }), call(base, "POST", START(firmA), { token: ownerT, body: { reason: REASON } })]);
  ok("AUD-3b SS1 fail (one at a time): two starts at once by one person open exactly one session (201 and 409)",
    both.map((r) => r.status).sort().join(",") === "201,409" && sessions(`staff_id = '${OWNER}'`) === 1, both.map((r) => [r.status, r.body?.code]));
  const O = both.find((r) => r.status === 201)!.body.id as string, oFirm = both.find((r) => r.status === 201)!.body.firmId as string;

  // ---------------------------------------------------------------------------------------- SS2: a read in session
  const read = await call(base, "GET", `/api/system/firms/${firmA}`, { token: supportT, session: S });
  const readLine = sql(`select coalesce(support_session_id::text, 'none') || '|' || coalesce(detail->>'supportReason', 'none') || '|' || actor from audit_event where firm_id = '${firmA}' and action = 'platform.system.firm_read' and correlation_id = '${read.requestId}'`);
  ok("AUD-3b SS2 pass (SA-11-11, SA-2-17 \"every action is tagged with the support person and session\"): our Support reads firm A's health in the session (200); its line on firm A's trail carries the session id and the reason",
    read.status === 200 && readLine === `${S}|${REASON}|ourstaff:${SUPPORT}`, { status: read.status, readLine });
  const plain = await call(base, "GET", `/api/system/firms/${firmA}`, { token: supportT });
  const plainLine = sql(`select coalesce(support_session_id::text, 'none') || '|' || coalesce(detail->>'supportReason', 'none') from audit_event where firm_id = '${firmA}' and action = 'platform.system.firm_read' and correlation_id = '${plain.requestId}'`);
  ok("AUD-3b SS2 fail: the same read without the session header carries no session and no reason", plain.status === 200 && plainLine === "none|none", plainLine);
  const me = await call(base, "GET", "/api/system/me", { token: supportT, session: S });
  ok("AUD-3b SS2 pass: our own identity read (no firm data) still answers in a session", me.status === 200, me.status);

  // ---------------------------------------------------------------------------------------- SS3: always blocked
  const r0 = lines(`firm_id = '${firmA}' and action = '${REFUSED}'`), bAll = lines(`firm_id = '${firmB}'`);
  const other = await call(base, "GET", `/api/system/firms/${firmB}`, { token: supportT, session: S });
  const across = await call(base, "GET", "/api/system/firms", { token: supportT, session: S });
  const nested = await call(base, "POST", START(firmA), { token: supportT, session: S, body: { reason: REASON } });
  const refusals = sql(`select string_agg(detail->>'route' || '=' || coalesce(support_session_id::text, 'none'), ',' order by at) from audit_event where firm_id = '${firmA}' and action = '${REFUSED}' and correlation_id in ('${other.requestId}', '${across.requestId}', '${nested.requestId}')`);
  ok("AUD-3b SS3 fail (one firm, SA-2-17): in firm A's session, a read of firm B, the firms list and starting another session each → 403 SUPPORT_SESSION_REFUSED, nothing of firm B read, no session opened",
    [other, across, nested].every((r) => r.status === 403 && r.body.code === "SUPPORT_SESSION_REFUSED") && /starting another session/.test(nested.body.detail) && lines(`firm_id = '${firmB}'`) === bAll && sessions(`staff_id = '${SUPPORT}'`) === 1,
    [other, across, nested].map((r) => [r.status, r.body?.code, r.body?.detail]));
  ok("AUD-3b SS3 pass (SA-2-17: a refusal is logged): each refusal wrote one platform.support_session.refused line on firm A's trail, naming the route, under the session",
    lines(`firm_id = '${firmA}' and action = '${REFUSED}'`) === r0 + 3 && refusals === `/api/system/firms/:id=${S},/api/system/firms=${S},/api/system/firms/:id/support-sessions=${S}`, refusals);
  const h0 = Number(sql(`select count(*) from plat_legal_hold`));
  const hold = await call(base, "POST", "/api/system/register/holds", { token: ownerT, session: O, body: { reason: REASON, firmId: oFirm, scope: { kind: "FIRM" } } });
  ok("AUD-3b SS3 fail (read-only, P-607 (4)): a change in a session (our Platform Owner placing a legal hold) → 403 before it runs; no hold placed; one refusal line on the session's firm",
    hold.status === 403 && hold.body.code === "SUPPORT_SESSION_REFUSED" && /read-only/.test(hold.body.detail) && Number(sql(`select count(*) from plat_legal_hold`)) === h0
    && lines(`firm_id = '${oFirm}' and action = '${REFUSED}' and correlation_id = '${hold.requestId}'`) === 1, hold.body);

  // ------------------------------------------------------------------------------------------- SS4: an ended session
  const notMine = await call(base, "GET", `/api/system/firms/${firmA}`, { token: ownerT, session: S });
  const unknown = await call(base, "GET", `/api/system/firms/${firmA}`, { token: supportT, session: uuid() });
  const junk = await call(base, "GET", `/api/system/firms/${firmA}`, { token: supportT, session: "not-a-session" });
  ok("AUD-3b SS4 fail: another person's session, an unknown one or a malformed id → 401 SUPPORT_SESSION_ENDED, nothing read",
    [notMine, unknown, junk].every((r) => r.status === 401 && r.body.code === "SUPPORT_SESSION_ENDED") && lines(`correlation_id in ('${notMine.requestId}', '${unknown.requestId}', '${junk.requestId}')`) === 0, [notMine, unknown, junk].map((r) => r.status));
  // Minute 61: the session's end moved into the past by the table owner, triggers off for this one statement (test only).
  sql(`alter table plat_support_session disable trigger user; update plat_support_session set started_at = now() - interval '61 minutes', ends_at = now() - interval '1 minute' where id = '${S}'; alter table plat_support_session enable trigger user`);
  const late = await call(base, "GET", `/api/system/firms/${firmA}`, { token: supportT, session: S });
  ok("AUD-3b SS4 fail (SA-2-18: 60 minutes, never refreshed): at minute 61 the session answers 401 SUPPORT_SESSION_ENDED and nothing is read", late.status === 401 && late.body.code === "SUPPORT_SESSION_ENDED"
    && lines(`correlation_id = '${late.requestId}'`) === 0, late.body);
  const again = await call(base, "POST", START(firmB), { token: supportT, body: { reason: REASON } });
  ok("AUD-3b SS4 pass: once the session has ended, our Support may start a new one (201)", again.status === 201 && again.body.id !== S, again.status);

  // ------------------------------------------------------------------------------------------------ SS5: the register
  ok("AUD-3b SS5 fail (SA-2-19: kept): a session cannot be deleted or truncated, its reason or end time cannot be changed, and it cannot be ended twice (by any user, the owner included)",
    refused(`delete from plat_support_session where id = '${O}'`) && refused(`truncate plat_support_session`) && refused(`update plat_support_session set reason = 'x' where id = '${O}'`)
    && refused(`update plat_support_session set ends_at = ends_at + interval '1 hour' where id = '${O}'`) && sessions(`id = '${O}'`) === 1);
  sql(`update plat_support_session set ended_at = now(), end_reason = 'Sample: test end' where id = '${O}'`);
  ok("AUD-3b SS5 pass/fail: an open session ends once (its end the database's time, at most its 60 minutes); a second end is refused",
    sql(`select (ended_at <= ends_at)::text from plat_support_session where id = '${O}'`) === "true" && refused(`update plat_support_session set ended_at = now(), end_reason = 'again' where id = '${O}'`));
  ok("AUD-3b SS5 fail (walls, PF-12's OWN list): the app's own role reads no session directly, and cannot insert one; a CHANGE session is refused at the database in this part",
    sql(`select count(*) from plat_support_session`, "xr_app") === "0" && refused(`insert into plat_support_session (id, firm_id, staff_id, reason, ends_at) values (gen_random_uuid(), '${firmA}', '${OWNER}', 'x', now())`, "xr_app")
    && refused(`insert into plat_support_session (id, firm_id, staff_id, reason, mode, ends_at) values (gen_random_uuid(), '${firmA}', '${OWNER}', 'x', 'CHANGE', now())`));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
