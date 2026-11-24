// PF-17 part 1 (R1.93; brief design/briefs/track-b/PF-17-1.md; P-581): our team's firms list with health and usage per
// firm, GET /api/system/firms and GET /api/system/firms/:id behind PF-4s's @SystemKeys("system/firm:read"). Each "Done
// when" line passes and fails: DW1 who may read (a firm's staff and a Content publisher 403; Support, Billing, Admin,
// Auditor, Owner 200); DW2 every figure equals PF-15's own read for that firm, and follows a change; DW3 the health rules
// (one seat over → ATTENTION "seats over the limit", a held firm → HELD, nothing wrong → OK, a trial ending soon); DW4
// last staff sign-in is the newest, null when nobody signed in; DW5 one PF-4s audit line per call (a refusal too), never
// on a firm's own trail; DW6 the two bypass uses are declared beside the module (firms.bypass.ts, P-785 (2)) for these
// routes only, run only by their declared values, and refused anywhere else;
// DW7 an unknown or malformed id → 404, never 500; DW8 paging, the order and ?health= / ?q= return the right rows; DW9
// (break M1, Lead 10 on #3155) 400 firms answer under 2 s, ?health= checks at most PAGE_SIZE × 4 firms' figures and says
// so, storage is StorageWatch's stored measure with its date; DW10 (PF-17's failed-jobs part, Lead 15's answer on #3225;
// j_93 W2 "each firm's failed jobs are its own dead letters") each firm's failedJobs is the count of its own entries on
// PF-14's dead-letter list (PlatformJobs.deadLetters), one read per call, null (never a 500) when that read fails. One process, a
// scratch database (dropped at the end), a small Nest app built from the features' own classes. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_console.ts
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
const DB = `xr_studio_pf17_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
type Res = { status: number; body: any };
const call = async (base: string, path: string, token?: string): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { headers: { "user-agent": "pf17-check/1", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
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
const { BYPASS_USES, BypassRefused, asBypass, bypassUses, inRequest, wallUnscopedQueries, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { FIRMS_LIST, FIRM_READ } = await import("../api/src/platform/system-console/firms.bypass.ts");
const { StorageWatch } = await import("../api/src/platform/entitlements/storage.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { SystemFirms, PAGE_SIZE, FIGURES_PER_CALL, healthOf } = await import("../api/src/platform/system-console/firms.ts");
const { SystemFirmsController } = await import("../api/src/platform/system-console/routes.ts");
const { PgEntitlements, seatsUsed, mbOf } = await import("../api/src/platform/entitlements/limits.ts");
const { PgCaseCount } = await import("../api/src/case-count.ts");
const feature = (await import("../api/src/features/platform-system-console.ts")).default;
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");

/** PF-14's dead-letter list as PlatformJobs.deadLetters answers it (a fake here: the list's own reader is PF-14's suite's). */
const dead: { name: string; key: string; firmId: string | null; error: string; failedAt: Date }[] = [];
let deadFails = false, deadReads = 0;
const deadLetters = async (limit = 100) => { deadReads++; if (deadFails) throw new Error("jobs: the job queue is not running"); return dead.slice(0, limit); };
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
/** Storage in bytes per firm id, measured by StorageWatch (PF-15's own measure), whose stored figure the console shows. */
const bytes = new Map<string, number>();
const files = { usedBytes: async (id: string) => bytes.get(id) ?? 0 };
const apps: { close(): Promise<void> }[] = [];
try {
  await seedSampleFirms(owner);
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmS = sql(`select id from platform_firm where key = 'sample-solo'`);

  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf17-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf17-system-standin-key-0123456789abc", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, SystemFirmsController] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor },
      { provide: SystemFirms, useFactory: (db: InstanceType<typeof Db>) => new SystemFirms({ db, cases: (k, tx) => new PgCaseCount(tx, k), now: () => clock.now(), deadLetters }), inject: [Db] }] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("PF-17 pass: the feature registers the firms controller and the service (bound to PlatformClock and the case side's PgCaseCount)",
    feature.controllers.includes(SystemFirmsController) && (feature.providers as { provide?: unknown }[]).some((p) => p.provide === SystemFirms));

  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.pf17@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await (await fetch(`${base}/api/system/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, secondStep: true }) })).json(); return r.token as string; };
  const roles = { owner: "platform-owner", admin: "platform-admin", support: "platform-support", billing: "platform-billing-ops", auditor: "platform-auditor", publisher: "platform-content-publisher" } as const;
  const tokens: Record<keyof typeof roles, string> = {} as never;
  for (const [k, r] of Object.entries(roles)) tokens[k as keyof typeof roles] = await tokenOf(await person(`${k} PF17`, [r]));
  const firmToken = (await (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token as string;
  const sysLines = () => Number(sql(`select count(*) from plat_system_audit`));

  // ---------------------------------------------------------------------------------------- DW1: who may read
  const allowed = await Promise.all((["owner", "admin", "support", "billing", "auditor"] as const).map((k) => call(base, "/api/system/firms", tokens[k])));
  ok("PF-17 DW1 pass: Platform Owner, Admin, Support, Billing and Auditor (system/firm:read) → 200 with the firms", allowed.every((r) => r.status === 200 && Array.isArray(r.body.firms) && r.body.total >= 2), allowed.map((r) => r.status));
  const pub = await call(base, "/api/system/firms", tokens.publisher), firm = await call(base, "/api/system/firms", firmToken), none = await call(base, "/api/system/firms");
  const pubOne = await call(base, `/api/system/firms/${firmA}`, tokens.publisher), firmOne = await call(base, `/api/system/firms/${firmA}`, firmToken);
  ok("PF-17 DW1 fail: a Content publisher (no system/firm:read) → 403, a firm staff token → 403 FIRM_SESSION_REFUSED, no token → 401; the same on one firm",
    pub.status === 403 && firm.status === 403 && firm.body.code === "FIRM_SESSION_REFUSED" && none.status === 401 && pubOne.status === 403 && firmOne.status === 403, { pub, firm, none: none.status, pubOne: pubOne.status, firmOne: firmOne.status });
  const upper = await call(base, "/API/System/Firms", firmToken);
  ok("PF-17 DW1 fail (breaker): the firm token on a mixed-case path is refused too (403)", upper.status === 403, upper);

  // ----------------------------------------------------------------------------- DW2: PF-15's own figures
  const watch = new StorageWatch({ db: owner, files, mail: null, now: () => clock.now() });
  const measure = (id: string) => withFirm(id, () => watch.measure(id));
  const storageLimitA = (await new PgEntitlements(owner, () => clock.now()).limitOf(firmA, "storage_mb")).limit as number;
  bytes.set(firmA, (storageLimitA + 1) * 1024 * 1024 + 1);
  await measure(firmA);   // over: StorageWatch stores its measure (platform_storage_over)
  const stored = () => JSON.parse(sql(`select json_build_object('bytes', used_bytes::text, 'at', to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) from platform_storage_over where firm_id = '${firmA}'`));
  const pf15 = async (id: string, key: string) => {
    const ent = new PgEntitlements(owner, () => clock.now()), counts = await new PgCaseCount(owner, key).activeCounts(owner);
    const row = sql(`select used_bytes::text from platform_storage_over where firm_id = '${id}'`);
    return { seats: { used: await seatsUsed(owner, id), limit: (await ent.limitOf(id, "seats")).limit }, active_individual_cases: { used: counts.individual, limit: (await ent.limitOf(id, "active_individual_cases")).limit },
      active_corporate_cases: { used: counts.corporate, limit: (await ent.limitOf(id, "active_corporate_cases")).limit }, storage_mb: { used: row ? mbOf(Number(row)) : null, limit: (await ent.limitOf(id, "storage_mb")).limit } } as Record<string, { used: number | null; limit: number | null }>;
  };
  const same = (got: any, want: Record<string, { used: number | null; limit: number | null }>) => got.usage.length === 4 && got.usage.every((u: any) => want[u.metric] && want[u.metric].used === u.used && want[u.metric].limit === u.limit);
  const aOne = await call(base, `/api/system/firms/${firmA}`, tokens.support), aWant = await pf15(firmA, "sample-firm"), aStore = aOne.body.usage?.find((u: any) => u.metric === "storage_mb");
  ok("PF-17 DW2 pass: firm A's seats, active individual and corporate cases (PF-15's reads) and storage (StorageWatch's stored measure, with its date) equal PF-15's figures for A",
    aOne.status === 200 && same(aOne.body, aWant) && aStore.used === storageLimitA + 2 && aStore.over === true && aStore.asOf === stored().at && aOne.body.reasons.includes("storage over the limit"), { got: aOne.body.usage, want: aWant, stored: stored() });
  bytes.set(firmA, 7 * 1024 * 1024 + 1);
  const aLive = await call(base, `/api/system/firms/${firmA}`, tokens.support);
  ok("PF-17 DW2 pass (Lead 10 on #3155): the console never lists the firm's files itself: until StorageWatch measures again, storage stays at its stored figure",
    aLive.body.usage.find((u: any) => u.metric === "storage_mb").used === storageLimitA + 2, aLive.body.usage);
  clock.t += 60_000; await measure(firmA);   // back under: the stored measure follows
  const aUnder = await call(base, `/api/system/firms/${firmA}`, tokens.support), under = aUnder.body.usage.find((u: any) => u.metric === "storage_mb");
  ok("PF-17 DW2 fail: StorageWatch's next measure (back under) moves the console's storage to 8 MB, not over, as of that measure",
    under.used === 8 && under.over === false && under.asOf === stored().at && under.asOf !== aStore.asOf && !aUnder.body.reasons.includes("storage over the limit"), { under, stored: stored() });
  const sStore = (await call(base, `/api/system/firms/${firmS}`, tokens.support)).body.usage.find((u: any) => u.metric === "storage_mb");
  ok("PF-17 DW2 pass: a firm StorageWatch has stored no measure for shows storage used null and no date, not over (never a guessed 0)", sStore.used === null && sStore.asOf === null && sStore.over === false, sStore);
  const aInList = (await call(base, "/api/system/firms", tokens.support)).body.firms.find((f: any) => f.id === firmA);
  ok("PF-17 DW2 pass: the list's row for A carries the same figures as the one-firm answer", JSON.stringify(aInList?.usage) === JSON.stringify(aUnder.body.usage), { aInList: aInList?.usage });
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmA}', 'extra.pf17@sample-firm.example', 'Sample extra', 'ACTIVE', now())`);
  const aAfter = await call(base, `/api/system/firms/${firmA}`, tokens.support), aWant2 = await pf15(firmA, "sample-firm");
  const seatsBefore = aUnder.body.usage.find((u: any) => u.metric === "seats").used, seatsAfter = aAfter.body.usage.find((u: any) => u.metric === "seats").used;
  ok("PF-17 DW2 fail: one more staff member in A moves A's seats by one, as PF-15's read does; firm B's figures do not move",
    seatsAfter === seatsBefore + 1 && same(aAfter.body, aWant2) && same((await call(base, `/api/system/firms/${firmS}`, tokens.support)).body, await pf15(firmS, "sample-solo")), { seatsBefore, seatsAfter });

  // ------------------------------------------------------------------------------------ DW3: the health rules
  const okA = await call(base, `/api/system/firms/${firmA}`, tokens.auditor);
  ok("PF-17 DW3 pass: a firm with nothing wrong (Team plan, 4 of 5 seats, active, paid) is OK with no reasons", okA.body.health === "OK" && okA.body.reasons.length === 0 && okA.body.status === "ACTIVE" && okA.body.plan.code === "team", okA.body);
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmS}', 'second.pf17@sample-solo.example', 'Sample second', 'ACTIVE', now())`);
  const over = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 pass: a firm one seat over its limit (Solo: 2 of 1) is ATTENTION with the reason \"seats over the limit\"",
    over.body.health === "ATTENTION" && over.body.reasons.includes("seats over the limit") && over.body.usage.find((u: any) => u.metric === "seats").over === true, over.body);
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firmS}'`);
  const held = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 pass: a held firm is HELD, its hold first among its reasons (the seat reason kept after it)", held.body.health === "HELD" && held.body.reasons[0] === "on payment hold" && held.body.reasons.includes("seats over the limit"), held.body);
  sql(`update platform_firm set status = 'ACTIVE' where id = '${firmS}'; update platform_staff set status = 'DEACTIVATED' where email = 'second.pf17@sample-solo.example'`);
  const back = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 fail: back under its limit and off hold, the same firm is OK again", back.body.health === "OK" && back.body.reasons.length === 0, back.body);
  const now = clock.now(), u = [{ metric: "seats" as const, used: 1, limit: 1, over: false }];
  const soon = healthOf({ status: "TRIAL", subStatus: "TRIAL", trialEndsAt: new Date(now + 2 * 86_400_000), usage: u }, now), later = healthOf({ status: "TRIAL", subStatus: "TRIAL", trialEndsAt: new Date(now + 5 * 86_400_000), usage: u }, now);
  const overdue = healthOf({ status: "ACTIVE", subStatus: "OVERDUE", trialEndsAt: null, usage: u }, now), atLimit = healthOf({ status: "ACTIVE", subStatus: "ACTIVE", trialEndsAt: null, usage: [{ metric: "seats", used: 5, limit: 5, over: false }] }, now);
  ok("PF-17 DW3 pass/fail: a trial ending in 2 days or an overdue payment is ATTENTION; a trial ending in 5 days and a firm exactly at its limit are OK",
    soon.health === "ATTENTION" && soon.reasons.includes("trial ends within 3 days") && overdue.health === "ATTENTION" && overdue.reasons.includes("payment overdue") && later.health === "OK" && atLimit.health === "OK", { soon, later, overdue, atLimit });

  const lock = healthOf({ status: "SECURITY_LOCK", subStatus: "ACTIVE", trialEndsAt: null, usage: u }, now), ended = healthOf({ status: "TRIAL", subStatus: "TRIAL", trialEndsAt: new Date(now - 86_400_000), usage: u }, now);
  ok("PF-17 DW3 pass/fail (review m4): a security lock is HELD \"under a security lock\"; a trial whose end has passed is ATTENTION \"trial ended\" (not \"ends within\")",
    lock.health === "HELD" && lock.reasons[0] === "under a security lock" && ended.health === "ATTENTION" && ended.reasons.includes("trial ended") && !ended.reasons.some((r) => r.startsWith("trial ends")), { lock, ended });
  const gone = ["DELETED", "ABANDONED", "PROVISIONING"].map((status) => healthOf({ status, subStatus: null, trialEndsAt: null, usage: u, livePlan: false }, now));
  ok("PF-17 DW3 fail (review m2, break m1): a deleted, abandoned or still-provisioning firm is NOT_LIVE with its plain reason, never OK",
    gone.every((g) => g.health === "NOT_LIVE") && JSON.stringify(gone.map((g) => g.reasons[0])) === JSON.stringify(["firm deleted", "sign-up abandoned", "still being set up"]), gone);
  sql(`update platform_subscription set status = 'ENDED' where firm_id = '${firmS}'`);
  const noPlan = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 fail (break m2): a firm whose only subscription ended shows no plan (not the ended one's) and the reason \"no live plan\" first",
    noPlan.body.plan === null && noPlan.body.subscription?.status === "ENDED" && noPlan.body.health === "ATTENTION" && noPlan.body.reasons[0] === "no live plan", noPlan.body);
  sql(`update platform_subscription set status = 'ACTIVE' where firm_id = '${firmS}'`);

  // -------------------------------------------------------------------------------- DW4: last staff sign-in
  sql(`update platform_staff set last_sign_in_at = null where firm_id in ('${firmA}', '${firmS}')`);
  const never = await call(base, `/api/system/firms/${firmS}`, tokens.support);
  sql(`update platform_staff set last_sign_in_at = '2026-11-20T10:00:00Z' where firm_id = '${firmA}' and email <> 'extra.pf17@sample-firm.example'; update platform_staff set last_sign_in_at = '2026-11-22T08:30:00Z' where email = 'extra.pf17@sample-firm.example'`);
  const newest = await call(base, `/api/system/firms/${firmA}`, tokens.support);
  ok("PF-17 DW4 pass/fail: last staff sign-in is the newest of the firm's staff (22 Nov 08:30Z over 20 Nov), and null when nobody has signed in",
    newest.body.lastStaffSignInAt === "2026-11-22T08:30:00.000Z" && never.body.lastStaffSignInAt === null, { newest: newest.body.lastStaffSignInAt, never: never.body.lastStaffSignInAt });

  // ---------------------------------------------------------------------------- DW5: one PF-4s line per call
  const trailA = () => Number(sql(`select count(*) from audit_event where firm_id = '${firmA}'`)), bypassA = () => Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and action = 'platform.bypass'`));
  const listLines = () => Number(sql(`select count(*) from audit_event where firm_id is null and action = 'platform.bypass' and detail->>'use' = '${FIRMS_LIST.name}'`));
  const s0 = sysLines(), t0 = trailA(), l0 = listLines();
  await call(base, "/api/system/firms", tokens.billing);
  const s1 = sysLines(), t1 = trailA(), l1 = listLines(), last = JSON.parse(sql(`select row_to_json(a) from (select staff_id, method, route, outcome from plat_system_audit order by at desc, id desc limit 1) a`));
  await call(base, "/api/system/firms", tokens.publisher);
  const s2 = sysLines(), refusedLine = JSON.parse(sql(`select row_to_json(a) from (select route, outcome, code from plat_system_audit order by at desc, id desc limit 1) a`));
  ok("PF-17 DW5 pass: a list call writes exactly one PF-4s audit line naming the staff member and the route; a refused call writes exactly one too (REFUSED)",
    s1 === s0 + 1 && last.method === "GET" && last.route === "/api/system/firms" && last.outcome === "ALLOWED" && s2 === s1 + 1 && refusedLine.outcome === "REFUSED", { s0, s1, s2, last, refusedLine });
  ok("PF-17 DW5 fail (review m4): the list call writes exactly one firm-less bypass line (its figures' own transactions write none) and nothing on a firm's own trail",
    t1 === t0 && l1 === l0 + 1, { t0, t1, l0, l1 });
  const b0 = bypassA();
  await call(base, `/api/system/firms/${firmA}`, tokens.billing);
  ok("PF-17 DW5 pass: opening one firm writes one PF-4s line and that firm's own platform.bypass line (its use named), nothing for another firm",
    bypassA() === b0 + 1 && JSON.parse(sql(`select detail from audit_event where firm_id = '${firmA}' and action = 'platform.bypass' order by at desc, id desc limit 1`)).use === FIRM_READ.name, { b0, b1: bypassA() });

  // ----------------------------------------------------------------------------------- DW6: the bypass uses
  const listUse = bypassUses()[FIRMS_LIST.name], oneUse = bypassUses()[FIRM_READ.name];
  ok("PF-17 DW6 pass: the two uses are declared in firms.bypass.ts (not on the frozen BYPASS_USES) for these two routes only (list: platform audit; one firm: per-firm)",
    listUse === FIRMS_LIST.entry && oneUse === FIRM_READ.entry && !(FIRMS_LIST.name in BYPASS_USES) && !(FIRM_READ.name in BYPASS_USES)
    && listUse.routes.length === 1 && listUse.routes[0].test("GET /api/system/firms") && !listUse.routes[0].test("GET /api/system/firms/x") && !listUse.routes[0].test("POST /api/system/firms") && listUse.audit === "platform"
    && oneUse.routes.length === 1 && oneUse.routes[0].test(`GET /api/system/firms/${firmA}`) && !oneUse.routes[0].test("GET /api/system/firms") && !oneUse.routes[0].test(`DELETE /api/system/firms/${firmA}`) && !oneUse.routes[0].test(`GET /api/system/firms/${firmA}/staff`) && oneUse.audit === "per-firm");
  const byUseName = await throwsLike(() => inRequest({ method: "GET", path: "/api/system/firms" }, () => asBypass(FIRMS_LIST.name, async () => 1)), (e) => e instanceof BypassRefused);
  const lookAlike = await throwsLike(() => inRequest({ method: "GET", path: "/api/system/firms" }, () => asBypass({ name: FIRMS_LIST.name, entry: FIRMS_LIST.entry }, async () => 1)), (e) => e instanceof BypassRefused);
  ok("PF-17 DW6 fail: on its own route, either use run by its name alone or by a look-alike object is refused (BypassRefused): only the declared value crosses", byUseName && lookAlike, { byUseName, lookAlike });
  const svc = new SystemFirms({ db: owner, cases: (k, tx) => new PgCaseCount(tx, k), now: () => clock.now(), deadLetters });
  const caller = { staffId: "pf17", keys: ["system/firm:read"] };
  const elsewhere = await throwsLike(() => inRequest({ method: "GET", path: "/api/platform/me" }, () => svc.list(caller, {})), (e) => e instanceof BypassRefused);
  const elsewhereOne = await throwsLike(() => inRequest({ method: "POST", path: "/api/system/signup-links" }, () => svc.one(caller, firmA)), (e) => e instanceof BypassRefused);
  wallUnscopedQueries();
  const unscoped = await throwsLike(() => svc.list(caller, {}), (e) => e instanceof BypassRefused);
  ok("PF-17 DW6 fail: the service called on any other route, or with no request at all in the API server, is refused (BypassRefused) before any read", elsewhere && elsewhereOne && unscoped, { elsewhere, elsewhereOne, unscoped });

  // -------------------------------------------------------------------------------------------- DW7: 404s
  const unknown = await call(base, "/api/system/firms/00000000-0000-4000-8000-00000000abcd", tokens.support), bad = await call(base, "/api/system/firms/not-a-firm", tokens.support), sqlish = await call(base, `/api/system/firms/${encodeURIComponent("1' or '1'='1")}`, tokens.support);
  ok("PF-17 DW7 pass/fail: an unknown firm id and a malformed one (a SQL-looking one too) → 404 \"No such firm.\", never 500",
    [unknown, bad, sqlish].every((r) => r.status === 404 && r.body.detail === "No such firm."), [unknown, bad, sqlish].map((r) => [r.status, r.body.detail]));

  // ------------------------------------------------------------------------------ DW8: paging and filters
  const firmsOf = (prefix: string, name: string, n: number, status = "ACTIVE", sub: string | null = "ACTIVE") => {
    sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at)
         select gen_random_uuid(), '${prefix}-' || i, '${name}' || lpad(i::text, 3, '0'), 'CA', '${prefix}' || i || '@pf17.example', '${status}', now() from generate_series(1, ${n}) i`);
    if (sub) sql(`insert into platform_subscription (id, firm_id, plan_id, status, updated_at) select gen_random_uuid(), f.id, (select id from platform_plan where code = 'team'), '${sub}', now() from platform_firm f where f.key like '${prefix}-%'`);
  };
  firmsOf("pf17-page", "Paging firm ", PAGE_SIZE + 3);
  firmsOf("pf17-held", "Zeta held ", 1, "PAYMENT_HOLD");
  firmsOf("pf17-due", "Yankee overdue ", 1, "ACTIVE", "OVERDUE");
  firmsOf("pf17-gone", "Alpha deleted ", 1, "DELETED", null);
  const held1 = sql(`select id from platform_firm where key = 'pf17-held-1'`), due1 = sql(`select id from platform_firm where key = 'pf17-due-1'`), gone1 = sql(`select id from platform_firm where key = 'pf17-gone-1'`);
  sql(`insert into platform_firm_web_address (firm_id, address, set_by, updated_at) select id, 'pf17-seven', 'seed:pf17', now() from platform_firm where key = 'pf17-page-7'`);
  sql(`update platform_firm set operating_name = 'École paging' where key = 'pf17-page-9'`);
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmS}', 'third.pf17@sample-solo.example', 'Sample third', 'ACTIVE', now())`);
  const p1 = await call(base, "/api/system/firms", tokens.admin), p2 = await call(base, "/api/system/firms?page=2", tokens.admin);
  const total = PAGE_SIZE + 3 + 3 + 2, both = [...(p1.body.firms ?? []), ...(p2.body.firms ?? [])];
  ok(`PF-17 DW8 pass: ${total} firms in pages of ${PAGE_SIZE}: page 1 has ${PAGE_SIZE}, page 2 the other ${total - PAGE_SIZE}; no firm on both`,
    p1.body.total === total && p1.body.firms.length === PAGE_SIZE && p2.body.firms.length === total - PAGE_SIZE && new Set(both.map((f: any) => f.id)).size === total && p1.body.complete === true, { total: p1.body.total, p2: p2.body.firms?.length });
  ok("PF-17 DW8 pass/fail (review m4): the held firm comes first, then the overdue one (ATTENTION from its row), then the rest by name, the deleted firm last (NOT_LIVE)",
    both[0]?.id === held1 && both[0]?.health === "HELD" && both[1]?.id === due1 && both[1]?.health === "ATTENTION" && both.at(-1)?.id === gone1 && both.at(-1)?.health === "NOT_LIVE"
    && both.slice(2, -1).every((f: any, i: number, xs: any[]) => i === 0 || xs[i - 1].name.localeCompare(f.name) <= 0), both.slice(0, 3).map((f: any) => [f.name, f.health]));
  ok("PF-17 DW8 pass: the seat-over firm, found from its figures, shows ATTENTION \"seats over the limit\" where its name puts it", both.find((f: any) => f.id === firmS)?.health === "ATTENTION" && both.find((f: any) => f.id === firmS)?.reasons.includes("seats over the limit"));
  const [att, hld, nl] = await Promise.all(["ATTENTION", "HELD", "NOT_LIVE"].map((h) => call(base, `/api/system/firms?health=${h}`, tokens.admin)));
  ok("PF-17 DW8 pass/fail: ?health=ATTENTION returns the overdue firm and the seat-over firm (all checked: complete); ?health=HELD the held one; ?health=NOT_LIVE the deleted one",
    att.body.total === 2 && JSON.stringify(att.body.firms.map((f: any) => f.id)) === JSON.stringify([due1, firmS]) && att.body.complete === true && hld.body.total === 1 && hld.body.firms[0].id === held1 && nl.body.total === 1 && nl.body.firms[0].id === gone1,
    { att: att.body.firms?.map((f: any) => f.name), hld: hld.body.total, nl: nl.body.total });
  const byName = await call(base, "/api/system/firms?q=paging%20firm%20007", tokens.admin), byAddr = await call(base, "/api/system/firms?q=PF17-SEVEN", tokens.admin), sqlQ = await call(base, `/api/system/firms?q=${encodeURIComponent("' or 1=1 --")}`, tokens.admin);
  const nfd = await call(base, `/api/system/firms?q=${encodeURIComponent("e\u0301cole")}`, tokens.admin), nfc = await call(base, `/api/system/firms?q=${encodeURIComponent("\u00e9cole")}`, tokens.admin);
  ok("PF-17 DW8 pass/fail: ?q= matches a name (one firm) and a web address (review m4), any case; a SQL-looking ?q= matches nothing",
    byName.body.total === 1 && byName.body.firms[0].name === "Paging firm 007" && byAddr.body.total === 1 && byAddr.body.firms[0].webAddress === "pf17-seven" && sqlQ.status === 200 && sqlQ.body.total === 0, { byName: byName.body.total, byAddr: byAddr.body.total, sqlQ: sqlQ.body.total });
  ok("PF-17 DW8 pass (break m3): ?q= finds \"École\" typed composed or decomposed (NFC on both sides)", nfd.body.total === 1 && nfc.body.total === 1 && nfd.body.firms[0].name === "École paging", { nfd: nfd.body.total, nfc: nfc.body.total });
  const badQ = await Promise.all(["/api/system/firms?health=SICK", "/api/system/firms?page=0", "/api/system/firms?sort=name"].map((p) => call(base, p, tokens.admin)));
  ok("PF-17 DW8 fail: an unknown health, page 0 and an unknown query key → 422 with the field named", badQ.every((r) => r.status === 422 && r.body.code === "FIRMS_QUERY"), badQ.map((r) => [r.status, r.body.fields]));

  // ------------------------------------------------------- DW9: 400 more firms (break M1, Lead 10 on #3155)
  firmsOf("pf17-load", "Load firm ", 400);
  const timed = async (path: string) => { const t = performance.now(); const r = await call(base, path, tokens.support); return { r, ms: Math.round(performance.now() - t) }; };
  await timed("/api/system/firms");   // warm
  const all = await timed("/api/system/firms"), lastPage = await timed(`/api/system/firms?page=${Math.ceil((total + 400) / PAGE_SIZE)}`), q = await timed("/api/system/firms?q=load%20firm%2039"), okH = await timed("/api/system/firms?health=OK"), attH = await timed("/api/system/firms?health=ATTENTION");
  const times = { all: all.ms, last: lastPage.ms, q: q.ms, ok: okH.ms, att: attH.ms };
  ok(`PF-17 DW9 pass: with ${total + 400} firms the list, its last page, a search and both bounded ?health= filters each answer 200 in under 2 s on the local store`,
    [all, lastPage, q, okH, attH].every((x) => x.r.status === 200 && x.ms < 2000) && all.r.body.total === total + 400 && all.r.body.firms.length === PAGE_SIZE && q.r.body.total === 10, { ...times, q: q.r.body.total });
  ok(`PF-17 DW9 pass/fail: ?health=OK checks at most ${FIGURES_PER_CALL} firms' figures a call and says so (complete false, a note naming the bound); a narrower ?q= checks them all`,
    okH.r.body.complete === false && /at most 200 a call/.test(okH.r.body.note ?? "") && okH.r.body.firms.length === PAGE_SIZE && okH.r.body.firms.every((f: any) => f.health === "OK")
    && (await call(base, "/api/system/firms?health=OK&q=paging", tokens.support)).body.complete === true, { complete: okH.r.body.complete, note: okH.r.body.note });
  // Review M1-r2: 60 more overdue firms (ATTENTION from their rows) and 20 seat-over firms whose names sort after the
  // 150th firm the row calls OK: the pages of ?health=ATTENTION agree on `total`, hold it between them with no firm twice,
  // and say complete only when they do.
  firmsOf("pf17-due-load", "Due load ", 60, "ACTIVE", "OVERDUE");
  sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at)
       select gen_random_uuid(), 'pf17-over-' || i, 'Load firm 160 over ' || lpad(i::text, 2, '0'), 'CA', 'over' || i || '@pf17.example', 'ACTIVE', now() from generate_series(1, 20) i`);
  sql(`insert into platform_subscription (id, firm_id, plan_id, status, updated_at) select gen_random_uuid(), f.id, (select id from platform_plan where code = 'solo'), 'ACTIVE', now() from platform_firm f where f.key like 'pf17-over-%'`);
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) select gen_random_uuid(), f.id, 'staff' || n || '.' || f.key || '@pf17.example', 'Sample staff', 'ACTIVE', now() from platform_firm f, generate_series(1, 2) n where f.key like 'pf17-over-%'`);
  const f0 = listLines();
  const pages = [];
  for (let n = 1; n <= 4; n++) pages.push((await call(base, `/api/system/firms?health=ATTENTION&page=${n}`, tokens.support)).body);
  const shown = pages.flatMap((b: any) => b.firms ?? []), totals = pages.map((b: any) => b.total);
  const overFound = shown.filter((f: any) => /^Load firm 160 over/.test(f.name)).length;
  ok("PF-17 DW9 pass/fail (review M1-r2): ?health=ATTENTION gives the same total on every page, the pages hold exactly that many firms with none twice, all ATTENTION, and the seat-over firms past the 150th row-OK firm on none",
    totals.every((t: number) => t === totals[0]) && shown.length === totals[0] && new Set(shown.map((f: any) => f.id)).size === shown.length && shown.every((f: any) => f.health === "ATTENTION") && overFound === 0 && pages.every((b: any) => b.complete === false),
    { totals, shown: shown.length, overFound, complete: pages.map((b: any) => b.complete) });
  ok("PF-17 DW9 pass (review m1-r2): each filtered list call writes exactly one firm-less bypass line, however many firms' figures it works out", listLines() === f0 + 4, { f0, f1: listLines() });
  const narrow = (await call(base, "/api/system/firms?health=ATTENTION&q=160%20over", tokens.support)).body;
  ok("PF-17 DW9 pass: narrowed with ?q=, all 20 seat-over firms are found (complete)", narrow.total === 20 && narrow.complete === true && narrow.firms.every((f: any) => f.reasons.includes("seats over the limit")), { total: narrow.total, complete: narrow.complete });

  // ------------------------------------------------- DW10: failed jobs per firm (PF-14's dead-letter list; j_93 W2)
  ok("PF-17 DW10 pass: the feature binds the failed-jobs read to PF-14's PlatformJobs (its dead-letter list), injected beside Db and the clock",
    (feature.providers as { provide?: unknown; inject?: unknown[] }[]).some((p) => p.provide === SystemFirms && p.inject?.includes(PlatformJobs)));
  const letter = (firmId: string | null, n: number) => ({ name: "platform.some_queue", key: `pf17-dead-${firmId ?? "platform"}-${n}`, firmId, error: "Sample: failed after its last retry", failedAt: new Date(clock.now() - n * 1000) });
  dead.length = 0;
  dead.push(letter(firmA, 1), letter(firmA, 2), letter(firmS, 3), letter(null, 4));
  const r0 = deadReads, fq = (await call(base, "/api/system/firms?q=sample", tokens.support)).body, rd = deadReads - r0;
  const byIdA = fq.firms.find((f: any) => f.id === firmA), byIdS = fq.firms.find((f: any) => f.id === firmS);
  ok("PF-17 DW10 pass (j_93 W2): each firm's failedJobs is its own dead letters: firm A 2, firm S 1; the platform's own dead letter (no firm) counts for neither; one read of the list per call",
    byIdA?.failedJobs === 2 && byIdS?.failedJobs === 1 && rd === 1, { a: byIdA?.failedJobs, s: byIdS?.failedJobs, reads: rd });
  dead.push(letter(firmS, 5));
  const oneA = (await call(base, `/api/system/firms/${firmA}`, tokens.support)).body, oneS = (await call(base, `/api/system/firms/${firmS}`, tokens.support)).body;
  ok("PF-17 DW10 fail: a new dead letter for firm S moves firm S's figure only (2), never firm A's (still 2), on one firm's answer too",
    oneS.failedJobs === 2 && oneA.failedJobs === 2, { a: oneA.failedJobs, s: oneS.failedJobs });
  const other = (await call(base, "/api/system/firms?page=1", tokens.support)).body.firms.filter((f: any) => f.id !== firmA && f.id !== firmS);
  ok("PF-17 DW10 pass: a firm with no dead letter shows 0, never null", other.length > 0 && other.every((f: any) => f.failedJobs === 0), other.slice(0, 3).map((f: any) => f.failedJobs));
  deadFails = true;
  const down = await call(base, "/api/system/firms?q=sample", tokens.support), downOne = await call(base, `/api/system/firms/${firmA}`, tokens.support);
  deadFails = false;
  ok("PF-17 DW10 fail: when the dead-letter list cannot be read the list and one firm still answer 200, each failedJobs null (not known), never 0 and never a 500",
    down.status === 200 && down.body.firms.every((f: any) => f.failedJobs === null) && downOne.status === 200 && downOne.body.failedJobs === null, { status: [down.status, downOne.status], one: downOne.body?.failedJobs });
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
