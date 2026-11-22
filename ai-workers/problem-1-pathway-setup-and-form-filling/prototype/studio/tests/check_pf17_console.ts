// PF-17 part 1 (BACKLOG row PF-17, brief product/design/briefs/track-b/PF-17-1.md; R1.93; SA-2-14): our team's firms list
// with health and usage per firm, on PF-4s's /api/system guard. The brief's Done when DW1-DW8, each with a passing and a
// failing case, plus the leak check (nothing from a firm's private data in the answer).
// One process: a scratch database (every migration, PF-3's Sample firms and a few firms of this check's own), a small Nest
// app built from the features' own classes (core.ts's ConfigReadGuard, PF-4's guard, PF-4s's guard and wall, PF-12's
// walls interceptor, the console) through the walled pool (xr_app), a fake clock, a fake failed-job list and fake stored
// bytes. No server of the studio, no browser, no model call (US$0). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_console.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf17_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
type Res = { status: number; body: any; text: string };
const call = async (base: string, path: string, o: { token?: string; method?: string } = {}): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { method: o.method ?? "GET", headers: { "content-type": "application/json", "user-agent": "pf17-check/1", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) } });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, text };
};

// ------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { BYPASS_USES, BypassRefused, inRequest } = await import("../api/src/platform/firm-scope.ts");
const { mbOf, PgEntitlements, seatsUsed } = await import("../api/src/platform/entitlements/limits.ts");
const { PgCaseCount } = await import("../api/src/case-count.ts");
const { FAILED_JOBS, FIRM_FILES, FIRM_READ_USE, PAGE_SIZE, SystemConsoleFirms } = await import("../api/src/platform/system-console/firms.ts");
const { SystemConsoleController } = await import("../api/src/platform/system-console/routes.ts");
const feature = (await import("../api/src/features/platform-system-console.ts")).default;
type DeadLetter = import("../api/src/platform/jobs/pgboss-jobs.ts").DeadLetter;

/** The owner's client (xr_studio): sets up the check's data and reads PF-15's own figures, outside the walls. */
const own = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

const clock = new (class extends PlatformClock { t = Date.parse("2026-11-22T09:00:00Z"); override now() { return this.t; } })();
const firmLocal = new LocalIdentity("pf17-firm-standin-key-0123456789abcdef", () => clock.now());
const systemLocal = new SystemLocalIdentity("pf17-system-standin-key-0123456789abcd", () => clock.now());
/** A session of the system stand-in, signed in now with the second step. */
const sessionOf = (staffId: string) => systemLocal.issue(staffId, { authTimeMs: clock.now(), secondStep: true });

/** Failed jobs, as PF-14's dead-letter list gives them; `broken` makes the list unreadable. */
const letters: DeadLetter[] = [];
let lettersBroken = false;
const failedJobs = { async deadLetters() { if (lettersBroken) throw new Error("job queue down"); return letters; } };
/** Stored bytes per firm (FilesPort.usedBytes). */
const bytes = new Map<string, number>();
const files = { async usedBytes(firmId: string) { return bytes.get(firmId) ?? 0; } };

async function makeApp() {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
    { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor },
    { provide: FAILED_JOBS, useValue: failedJobs }, { provide: FIRM_FILES, useValue: files }, SystemConsoleFirms];
  @Module({ controllers: [PlatformIdentityController, SystemConsoleController] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1");
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

let appRef: { close(): Promise<void> } | null = null;
try {
  await seedSampleFirms(own);
  const firmA = await own.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
  const firmB = await own.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } });
  const team = await own.platformPlan.findUniqueOrThrow({ where: { code: "team" } });
  /** A firm of this check's own (Sample names), with a live subscription on the Team plan. */
  const makeFirm = async (key: string, name: string, sub: { status: "ACTIVE" | "TRIAL"; trialEndsAt?: Date } = { status: "ACTIVE" }) => {
    const f = await own.platformFirm.create({ data: { key, operatingName: name, countryCode: "CA", status: sub.status === "TRIAL" ? "TRIAL" : "ACTIVE", contactEmail: `office@${key}.example`, ownerEmail: `owner@${key}.example`, ownerPhone: "+1 555 0100" } });
    await own.platformSubscription.create({ data: { firmId: f.id, planId: team.id, status: sub.status, trialEndsAt: sub.trialEndsAt ?? null } });
    return f;
  };
  const firmC = await makeFirm("pf17-calm", "Calm Sample Firm");
  const firmD = await makeFirm("pf17-trial", "Trial Sample Firm", { status: "TRIAL", trialEndsAt: new Date(clock.now() + 2 * 86_400_000) });
  sql(`insert into platform_firm_web_address (firm_id, address, set_by, updated_at) values ('${firmC.id}', 'calm-sample', 'seed:PF-17', now()) on conflict (firm_id) do update set address = excluded.address`);
  // B is held (PF-5: the firm and its subscription on payment hold).
  sql(`update platform_subscription set status = 'PAYMENT_HOLD' where firm_id = '${firmB.id}'`); sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firmB.id}'`);
  // Our own staff, one per role (Sample names).
  const person = async (name: string, roles: string[]) => (await own.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const STAFF = { owner: await person("Owner", ["platform-owner"]), admin: await person("Admin", ["platform-admin"]), support: await person("Support", ["platform-support"]),
    billing: await person("Billing", ["platform-billing-ops"]), auditor: await person("Auditor", ["platform-auditor"]), publisher: await person("Publisher", ["platform-content-publisher"]) };
  const owner = sessionOf(STAFF.owner);

  const A = await makeApp(); appRef = A.app;
  const firmSignIn = await fetch(`${A.base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) });
  const firmToken = (await firmSignIn.json()).token as string;
  const list = (q = "", token = owner) => call(A.base, `/api/system/firms${q}`, { token });
  const rowOf = (r: Res, id: string) => (r.body.firms as any[]).find((f) => f.id === id);
  const auditLines = () => Number(sql(`select count(*) from plat_system_audit`));
  const lastLine = () => JSON.parse(sql(`select row_to_json(a) from plat_system_audit a order by at desc, id desc limit 1`)) as Record<string, any>;
  const bypassLines = (firm: string) => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and firm_id = '${firm}' and detail->>'use' = '${FIRM_READ_USE}'`));

  // ------------------------------------------------------------------------------------------- DW1: who may read
  ok("PF-17 pass: the feature registers the console's routes and service", feature.controllers.includes(SystemConsoleController) && (feature.providers as unknown[]).includes(SystemConsoleFirms));
  const byRole: Record<string, number> = {};
  for (const [role, id] of Object.entries(STAFF)) byRole[role] = (await list("", sessionOf(id))).status;
  ok("PF-17 DW1 pass (SA-2-14): Support, Billing, Admin, Auditor and Platform Owner read the firms list (200)", ["owner", "admin", "support", "billing", "auditor"].every((r) => byRole[r] === 200), byRole);
  const pub = await list("", sessionOf(STAFF.publisher));
  const pubOne = await call(A.base, `/api/system/firms/${firmA.id}`, { token: sessionOf(STAFF.publisher) });
  ok("PF-17 DW1 fail (SA-7-11): a Content publisher (no system/firm:read) gets 403 MISSING_PERMISSION on the list and on one firm's figures (review M1), no figures in either answer",
    pub.status === 403 && pub.body.code === "MISSING_PERMISSION" && !pub.text.includes(firmA.id) && pubOne.status === 403 && pubOne.body.code === "MISSING_PERMISSION" && !pubOne.text.includes("usage"), { pub: pub.body, pubOne: pubOne.body });
  const firmOnList = await list("", firmToken), firmOnOne = await call(A.base, `/api/system/firms/${firmA.id}`, { token: firmToken });
  ok("PF-17 DW1 fail (SA-7-1): a firm's staff token on the list and on its own firm's figures gets 403, never the figures",
    firmOnList.status === 403 && firmOnOne.status === 403 && firmOnList.body.code === "FIRM_SESSION_REFUSED" && !firmOnOne.text.includes("usage"), { firmOnList: firmOnList.body, firmOnOne: firmOnOne.body });
  const none = await list("", "");
  ok("PF-17 DW1 fail: no token gets 401", none.status === 401, none.body);

  // ------------------------------------------------------------------------------------------- DW2: PF-15's figures
  bytes.set(firmA.id, 3 * 1024 * 1024 + 1);
  const pf15 = async (firm: { id: string; key: string }) => {
    const cases = await new PgCaseCount(own, firm.key).activeCounts(), lim = new PgEntitlements(own, () => clock.now());
    const used = { seats: await seatsUsed(own, firm.id), active_individual_cases: cases.individual, active_corporate_cases: cases.corporate, storage_mb: mbOf(await files.usedBytes(firm.id)) } as Record<string, number>;
    const out: Record<string, { used: number; limit: number | null }> = {};
    for (const m of Object.keys(used)) out[m] = { used: used[m], limit: (await lim.limitOf(firm.id, m as never)).limit };
    return out;
  };
  const usageOf = (row: any) => Object.fromEntries((row.usage as any[]).map((u) => [u.metric, { used: u.used, limit: u.limit }]));
  const l1 = await list(), mine1 = await pf15(firmA);
  ok("PF-17 DW2 pass (SA-2-14, PF-15): firm A's seats, active cases and storage, with each limit, equal PF-15's own reads", l1.status === 200 && JSON.stringify(usageOf(rowOf(l1, firmA.id))) === JSON.stringify(mine1) && mine1.storage_mb.used === 4, { list: usageOf(rowOf(l1, firmA.id)), pf15: mine1 });
  ok("PF-17 DW2 pass: firm B's figures equal PF-15's own reads too (two firms, no mixing)", JSON.stringify(usageOf(rowOf(l1, firmB.id))) === JSON.stringify(await pf15(firmB)), usageOf(rowOf(l1, firmB.id)));
  // A figure changes: one more invitation in A, and more bytes. The list follows.
  sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, expires_at) select gen_random_uuid(), '${firmA.id}', 'new.person@sample-firm.example', array['CASE_OFFICER']::"PlatformRole"[], md5(random()::text), 'seed:PF-17', now() + interval '48 hours'`);
  bytes.set(firmA.id, 10 * 1024 * 1024);
  const l2 = await list(), mine2 = await pf15(firmA);
  ok("PF-17 DW2 fail: when A's seats and storage change, the list follows (no stale or second count)",
    JSON.stringify(usageOf(rowOf(l2, firmA.id))) === JSON.stringify(mine2) && mine2.seats.used === mine1.seats.used + 1 && rowOf(l2, firmA.id).usage.find((u: any) => u.metric === "storage_mb").used === 10, { list: usageOf(rowOf(l2, firmA.id)), pf15: mine2 });

  // ------------------------------------------------------------------------------------------- DW3: health
  // C goes one seat over the Team plan's 5: six active staff (Sample people of this check).
  for (let i = 0; i < 6; i++) sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${firmC.id}', 'person${i}@pf17-calm.example', 'Sample Person ${i}', now())`);
  const l3 = await list(), c3 = rowOf(l3, firmC.id), b3 = rowOf(l3, firmB.id);
  ok("PF-17 DW3 pass: a firm one seat over its limit shows ATTENTION with the reason \"seats over the limit\"", c3.health === "ATTENTION" && c3.reasons.includes("seats over the limit") && c3.usage.find((u: any) => u.metric === "seats").over === true, c3);
  ok("PF-17 DW3 pass: a held firm shows HELD, with \"on payment hold\"", b3.health === "HELD" && b3.reasons[0] === "on payment hold", b3);
  ok("PF-17 DW3 pass (Sample: 3 days): a trial ending within 3 days shows ATTENTION with its reason", rowOf(l3, firmD.id).health === "ATTENTION" && rowOf(l3, firmD.id).reasons.includes("trial ends within 3 days"), rowOf(l3, firmD.id));
  sql(`delete from platform_staff where firm_id = '${firmC.id}' and email = 'person5@pf17-calm.example'`);
  const c4 = rowOf(await list(), firmC.id);
  ok("PF-17 DW3 fail: back at the limit (5 of 5), C shows OK with no reasons (at the limit is not over it)", c4.health === "OK" && c4.reasons.length === 0 && c4.usage.find((u: any) => u.metric === "seats").used === 5, c4);
  clock.t += 3 * 86_400_000;   // D's trial end is now behind it: no longer "ending soon"
  ok("PF-17 DW3 fail: a trial end already passed is not \"ending within 3 days\"", !rowOf(await list("", sessionOf(STAFF.owner)), firmD.id).reasons.includes("trial ends within 3 days"));
  clock.t -= 3 * 86_400_000;
  sql(`update platform_subscription set status = 'OVERDUE' where firm_id = '${firmC.id}'`);
  const c5 = rowOf(await list(), firmC.id);
  ok("PF-17 DW3 pass (PF-5's indicator): an overdue firm shows ATTENTION, \"payment overdue\", overdue true", c5.health === "ATTENTION" && c5.overdue === true && c5.reasons.includes("payment overdue"), c5);
  sql(`update platform_subscription set status = 'ACTIVE' where firm_id = '${firmC.id}'`);
  // Beyond the brief's list (review m5, break m2): a locked firm, and a firm with no live subscription, are never OK.
  const firmE = await makeFirm("pf17-locked", "Locked Sample Firm"); sql(`update platform_firm set status = 'SECURITY_LOCK' where id = '${firmE.id}'`);
  const firmF = await makeFirm("pf17-nosub", "No Plan Sample Firm"); sql(`update platform_subscription set status = 'ENDED' where firm_id = '${firmF.id}'`);
  const lState = await list(), e = rowOf(lState, firmE.id), f = rowOf(lState, firmF.id);
  ok("PF-17 pass (break m2): a security-locked firm shows ATTENTION \"security lock on\"; a firm with no live subscription shows ATTENTION \"no live subscription\" with plan null",
    e.health === "ATTENTION" && e.reasons.includes("security lock on") && f.health === "ATTENTION" && f.reasons.includes("no live subscription") && f.plan === null, { e, f });
  ok("PF-17 fail (break m2): an active firm on a live plan with nothing wrong carries neither reason", !rowOf(lState, firmC.id).reasons.some((r: string) => /lock|subscription/.test(r)));
  // R1.93's failed jobs: one dead letter for C, with a key and an error that must never reach the answer.
  letters.push({ name: "platform.entitlements.storage_daily", key: "pf17-secret-key-client-jane", firmId: firmC.id, error: "pf17-secret-error-passport-123", failedAt: new Date(clock.now() - 86_400_000) },
    { name: "messages.send", key: "k2", firmId: firmA.id, error: "old", failedAt: new Date(clock.now() - 30 * 86_400_000) });
  const l6 = await list(), c6 = rowOf(l6, firmC.id);
  ok("PF-17 pass (R1.93 failed jobs): C's failed job in the last 7 days counts, with its queue and time, and makes C ATTENTION",
    c6.failedJobs.count === 1 && c6.failedJobs.queues.join() === "platform.entitlements.storage_daily" && c6.health === "ATTENTION" && c6.reasons.includes("1 failed job in the last 7 days"), c6);
  ok("PF-17 fail (R1.93): a failure older than 7 days, or another firm's, does not count", rowOf(l6, firmA.id).failedJobs.count === 0 && rowOf(l6, firmB.id).failedJobs.count === 0, rowOf(l6, firmA.id).failedJobs);
  lettersBroken = true;
  const l7 = await list();
  ok("PF-17 fail (review m1): an unreadable job queue is said once on the page in words (count null), never a 500, a made-up 0 or every firm turned ATTENTION",
    l7.status === 200 && rowOf(l7, firmC.id).failedJobs.count === null && /cannot be read/.test(l7.body.failedJobsNote ?? "") && rowOf(l7, firmC.id).health === "OK" && l1.body.failedJobsNote === null, { c: rowOf(l7, firmC.id), note: l7.body.failedJobsNote });
  lettersBroken = false; letters.length = 0;
  // PF-14's list reads its oldest 10 000: at that cap the newest failures could be missed, so nothing is counted (review m2).
  for (let i = 0; i < 10_000; i++) letters.push({ name: "messages.send", key: `k${i}`, firmId: firmA.id, error: "x", failedAt: new Date(clock.now() - 60 * 86_400_000) });
  const lCap = await list();
  ok("PF-17 fail (review m2): a dead-letter list at its 10 000 read cap is not counted (count null, said on the page), never a made-up 0", rowOf(lCap, firmC.id).failedJobs.count === null && /10000 or more/.test(lCap.body.failedJobsNote ?? ""), lCap.body.failedJobsNote);
  letters.length = 0;

  // ------------------------------------------------------------------------------------------- DW4: last sign-in
  sql(`update platform_staff set last_sign_in_at = timestamptz '2026-11-20 10:00:00+00' where firm_id = '${firmA.id}' and actor_id = 'user-R'`);
  sql(`update platform_staff set last_sign_in_at = timestamptz '2026-11-21 08:30:00+00' where id = (select id from platform_staff where firm_id = '${firmA.id}' and coalesce(actor_id, '') <> 'user-R' order by id limit 1)`);
  const l8 = await list();
  ok("PF-17 DW4 pass (SA-2-14): last staff sign-in is the newest of the firm's staff", rowOf(l8, firmA.id).lastStaffSignInAt === "2026-11-21T08:30:00.000Z", rowOf(l8, firmA.id).lastStaffSignInAt);
  ok("PF-17 DW4 fail: a firm where nobody has signed in shows null, and a firm with no staff at all shows null", rowOf(l8, firmC.id).lastStaffSignInAt === null && rowOf(l8, firmD.id).lastStaffSignInAt === null);

  // ------------------------------------------------------------------------------------------- the leak check
  const privates = [...sql(`select email from platform_staff where firm_id in ('${firmA.id}', '${firmB.id}', '${firmC.id}')`).split("\n"), ...sql(`select coalesce(owner_email, '') || chr(10) || contact_email || chr(10) || coalesce(owner_phone, '') from platform_firm`).split("\n"), ...sql(`select display_name from platform_staff`).split("\n")].filter((s) => s.length > 3);
  letters.push({ name: "messages.send", key: "pf17-secret-key-client-jane", firmId: firmC.id, error: "pf17-secret-error-passport-123", failedAt: new Date(clock.now() - 3600_000) });
  const full = await list(), one = await call(A.base, `/api/system/firms/${firmC.id}`, { token: owner });
  const leaked = privates.filter((p) => full.text.includes(p) || one.text.includes(p)).concat(["pf17-secret", "business_address", "ownerEmail", "contactEmail"].filter((p) => full.text.includes(p) || one.text.includes(p)));
  ok("PF-17 pass (R1.93): nothing from a firm's private data in the list or one firm's answer (no staff name or email, no owner or firm contact, no failed job's key or error text)", privates.length > 5 && leaked.length === 0, leaked);
  letters.length = 0;

  // ------------------------------------------------------------------------------------------- DW5: audit lines
  const n0 = auditLines(), trail0 = Number(sql(`select count(*) from audit_event where actor like '%${STAFF.support}%' or summary like '%Sample Support%'`));
  const sup = await list("", sessionOf(STAFF.support)), afterOk = lastLine(), n1 = auditLines();
  await list("", sessionOf(STAFF.publisher)); const afterRefused = lastLine(), n2 = auditLines();
  await call(A.base, `/api/system/firms/${firmA.id}`, { token: sessionOf(STAFF.auditor) }); const afterOne = lastLine(), n3 = auditLines();
  ok("PF-17 DW5 pass (SA-7-3, SA-7-20): each call writes exactly one PF-4s line naming our staff member and the route, allowed or refused",
    sup.status === 200 && n1 === n0 + 1 && afterOk.staff_id === STAFF.support && afterOk.route === "/api/system/firms" && afterOk.outcome === "ALLOWED"
    && n2 === n1 + 1 && afterRefused.staff_id === STAFF.publisher && afterRefused.outcome === "REFUSED" && afterRefused.code === "MISSING_PERMISSION"
    && n3 === n2 + 1 && afterOne.route === "/api/system/firms/:id" && afterOne.target.id === firmA.id, { afterOk, afterRefused, afterOne });
  ok("PF-17 DW5 fail: our staff member's line never lands on a firm's own trail (audit_event names no staff of ours)",
    Number(sql(`select count(*) from audit_event where actor like '%${STAFF.support}%' or summary like '%Sample Support%'`)) === trail0 && trail0 === 0);
  const before = bypassLines(firmA.id), beforeB = bypassLines(firmB.id);
  await call(A.base, `/api/system/firms/${firmA.id}`, { token: owner });
  ok("PF-17 pass (R1.87, PF-12b per-firm): reading one firm writes one platform.bypass line on that firm's trail, none on another's", bypassLines(firmA.id) === before + 1 && bypassLines(firmB.id) === beforeB, { a: bypassLines(firmA.id) - before, b: bypassLines(firmB.id) - beforeB });
  const allBefore = Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' = '${FIRM_READ_USE}'`)), firms = Number(sql(`select count(*) from platform_firm`));
  await list();
  ok("PF-17 pass (PF-12b per-firm): a list call writes one platform.bypass line per firm it read", Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' = '${FIRM_READ_USE}'`)) === allBefore + firms);
  ok("PF-17 pass: the platform.bypass line names the use, never our staff member or the path", JSON.parse(sql(`select row_to_json(e) from audit_event e where action = 'platform.bypass' and detail->>'use' = '${FIRM_READ_USE}' order by at desc, id desc limit 1`)).actor === `system:${FIRM_READ_USE}`);

  // ------------------------------------------------------------------------------------------- DW6: the bypass use
  const use = BYPASS_USES[FIRM_READ_USE], route = (r: string) => use.routes.some((x) => x.test(r));
  ok("PF-17 DW6 pass: the use is on the named list, per-firm, for the two GET routes only (no direct or outside calls)",
    use.audit === "per-firm" && !use.direct && !use.outside && route("GET /api/system/firms") && route(`GET /api/system/firms/${firmA.id}`), use);
  ok("PF-17 DW6 fail: no other method, deeper path or plane reaches it", !route("POST /api/system/firms") && !route(`GET /api/system/firms/${firmA.id}/staff`) && !route("GET /api/platform/firms") && !route("GET /api/system/firmsx") && !route("GET /api/system/plans/x"));
  const svc = new SystemConsoleFirms(new Db(), clock, failedJobs, files);
  ok("PF-17 DW6 fail: the service called outside a request is refused (BypassRefused), before any read",
    await throwsLike(() => svc.list({ health: null, q: null, page: 1 }), (e) => e instanceof BypassRefused));
  ok("PF-17 DW6 fail: the service called from another route (a firm's) is refused (BypassRefused)",
    await throwsLike(() => inRequest({ method: "GET", path: "/api/platform/me" }, () => svc.one(firmA.id)), (e) => e instanceof BypassRefused));

  // ------------------------------------------------------------------------------------------- DW7: unknown ids
  const unknown = await call(A.base, `/api/system/firms/${randomUUID()}`, { token: owner }), bad = await call(A.base, `/api/system/firms/${encodeURIComponent("x' or '1'='1")}`, { token: owner }), dots = await call(A.base, "/api/system/firms/..%2Fplatform", { token: owner });
  ok("PF-17 DW7 pass: a known firm's id gives its figures", one.status === 200 && one.body.id === firmC.id && one.body.name === "Calm Sample Firm" && one.body.webAddress === "calm-sample", one.body);
  ok("PF-17 DW7 fail: an unknown id, a malformed one and a SQL-looking one each get 404 in plain words, never 500",
    [unknown, bad, dots].every((r) => r.status === 404 && /no firm with that id/i.test(r.body.detail ?? "")), [unknown, bad, dots].map((r) => [r.status, r.body.detail]));

  // ------------------------------------------------------------------------------------------- DW8: order, paging, filters
  for (let i = 0; i < PAGE_SIZE; i++) await makeFirm(`pf17-many-${String(i).padStart(2, "0")}`, `Many Sample Firm ${String(i).padStart(2, "0")}`);
  const total = Number(sql(`select count(*) from platform_firm`));
  const p1 = await list(), p2 = await list("?page=2");
  const healths = (p1.body.firms as any[]).map((f) => f.health), order = ["HELD", "ATTENTION", "OK"];
  ok("PF-17 DW8 pass: sorted HELD, then ATTENTION, then OK, then by name; 50 a page, the rest on page 2",
    p1.body.firms.length === PAGE_SIZE && p1.body.total === total && p2.body.firms.length === total - PAGE_SIZE && p1.body.pages === 2 && healths[0] === "HELD"
    && healths.every((h: string, i: number) => i === 0 || order.indexOf(healths[i - 1]) <= order.indexOf(h))
    && new Set([...p1.body.firms, ...p2.body.firms].map((f: any) => f.id)).size === total, { total, p1: p1.body.firms.length, p2: p2.body.firms?.length, healths: healths.slice(0, 6) });
  const held = await list("?health=held"), okOnly = await list("?health=OK"), byName = await list("?q=calm"), byAddress = await list("?q=CALM-SAMP"), sqlish = await list(`?q=${encodeURIComponent("%' or 1=1 --")}`);
  ok("PF-17 DW8 pass: ?health= keeps only that health (any letter case); ?q= finds a firm by name or web address",
    held.body.firms.length === 1 && held.body.firms[0].id === firmB.id && okOnly.body.firms.every((f: any) => f.health === "OK") && okOnly.body.total === okOnly.body.counts.OK
    && byName.body.firms.map((f: any) => f.id).join() === firmC.id && byAddress.body.firms.map((f: any) => f.id).join() === firmC.id, { held: held.body.total, byName: byName.body.total, byAddress: byAddress.body.total });
  const pct = await list("?q=%25"), und = await list("?q=_"), arr = await list("?health[]=OK"), other = await list("?sort=name");
  ok("PF-17 DW8 fail (break m3): ?q=% and ?q=_ are plain text (no firm matches), and an unknown or bracketed key is refused 400, never ignored",
    pct.status === 200 && pct.body.total === 0 && und.status === 200 && und.body.total === 0 && arr.status === 400 && other.status === 400, { pct: pct.body.total, und: und.body.total, arr: arr.status, other: other.status });
  const badHealth = await list("?health=GREEN"), badPage = await list("?page=0"), pastEnd = await list("?page=9"), twice = await list("?health=OK&health=HELD");
  ok("PF-17 DW8 fail: a SQL-looking ?q= finds nothing (it is text); a wrong health, page 0 or a repeated filter gets 400 in words; a page past the end is empty",
    sqlish.status === 200 && sqlish.body.total === 0 && badHealth.status === 400 && badPage.status === 400 && twice.status === 400 && /HELD, ATTENTION or OK/.test(badHealth.body.detail) && pastEnd.status === 200 && pastEnd.body.firms.length === 0,
    { sqlish: sqlish.body.total, badHealth: badHealth.status, badPage: badPage.status, twice: twice.status, pastEnd: pastEnd.body.firms?.length });
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await appRef?.close().catch(() => undefined);
  await own.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the next run's drop */ }
}
console.log(`\nPF-17 part 1 console: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
