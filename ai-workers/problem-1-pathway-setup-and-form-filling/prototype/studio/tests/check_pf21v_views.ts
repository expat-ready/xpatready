// PF-21v (PF-21's part 3; P-579, P-584 (8), P-606): the complaint view fields the screen (PF-21s) reads instead of working
// them out itself (STANDARDS §7): businessDaysLeft, people, firmTimeZone, and GET /api/platform/complaints/handlers.
// Named cases DW1-DW6 (the brief, Lead B 15 Nov rev 16.28), each with a passing and a failing case, on the six seeded
// roles (one staff member per role in the Sample firm, plus firm B's Owner, a deactivated and a suspended person).
// One scratch database (every migration, PF-3's Sample seed). DW1-DW2 call ComplaintsService directly on a FakeClock;
// DW3-DW6 go through a Nest app built from the feature's own classes behind PF-4's guard (as PF-21w's suite does).
// No server of the app, no browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21v_views.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { JobHandler, JobPort } from "../ports/jobs.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21v_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const throwsLike = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, assertEveryRouteDeclared, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { BUSINESS_HOURS, CLOSED_DAYS, TIME_ZONE, writeSetting } = await import("../api/src/platform/settings.ts");
const { acknowledgeBy, BusinessDayTally, businessDaysBetween } = await import("../api/src/platform/complaints/business-days.ts");
const { ComplaintsService, COMPLAINT_KEYS } = await import("../api/src/platform/complaints/complaints.ts");
const { fakeAudit } = await import("../ports/audit.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { fakeMail } = await import("../ports/mail.ts");
const { fakeStaff } = await import("../ports/staff.ts");
const feature = (await import("../api/src/features/platform-complaints.ts")).default;
const { MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");   // PF-19r: the complaints feature mails through it (in memory here)

/** A job runner that records nothing but its handler (the reminder's runs are PF-21's suite's). */
const recorder = (): JobPort => {
  const handled: string[] = [];
  return {
    async handle(name: string, _h: JobHandler) { if (handled.includes(name)) throw new Error(`jobs: "${name}" already has a handler`); handled.push(name); },
    async schedule() { return { queued: true }; }, async enqueue() { return { queued: true }; }, async cancel() { return true; }, async recurring() {},
  };
};

const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf21v-check-signing-key-0123456789abcdef", () => Date.now());
async function makeApp() {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: MESSAGES_MAIL, useValue: fakeMail() }, { provide: PlatformJobs, useValue: recorder() }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method === "POST" && path === "") headers["idempotency-key"] = randomUUID();   // PF-21i: a fresh key per create
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id;
  const firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  const W = await platformAuditWorkspaceId(db as never);
  const set = (firmId: string, key: string, value: unknown) => writeSetting(db, { firmId, key, value, by: "system:check-pf21v", workspaceId: W });
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  type Role = (typeof ROLES)[number];
  const person = async (firmId: string, name: string, role: Role | null, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" = "ACTIVE") => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@pf21v.example.com`, displayName: `Sample ${name}`, actorId: `pf21v-${name}`, status } });
    if (role) await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf21v" } });
    return { id: s.id, name: s.displayName, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const as = {} as Record<Role, { id: string; name: string; token: string }>;
  for (const r of ROLES) as[r] = await person(firmA, r.toLowerCase().replace(/_/g, "-"), r);
  const ownerB = await person(firmB, "owner-b", "OWNER");
  const suspended = await person(firmA, "suspended", "CASE_MANAGER", "SUSPENDED");   // PF-21j review m3: a role that may record, so only the status leaves them out
  const leaver = await person(firmA, "leaver", "CASE_MANAGER");          // handles one, then is deactivated (DW3)
  const elsewhere = await person(firmA, "elsewhere", "CASE_MANAGER");    // appears only in complaints the handler cannot see
  const handlerP = await person(firmA, "handler", "CASE_MANAGER");     // PF-21j: the handler holds agent/complaint:record (a Case Officer cannot be one)

  // ---------------------------------------------------------------------------------------------------------- DW1
  // Received Friday 13 Nov 2026, 10:00 in Toronto; Monday 16 Nov is a closed day; Mon-Fri 09:00-17:00.
  const HOURS = (["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) => ({ day, opens: "09:00", closes: "17:00" }));
  const cal = { zone: "America/Toronto", hours: HOURS, closedDays: ["2026-11-16"] };
  const at = (s: string) => new Date(s);
  const fri = at("2026-11-13T15:00:00Z"), due = acknowledgeBy(fri, cal);
  ok("PF-21v DW1: the Sample period puts the due date on Wednesday 18 Nov 17:00 Toronto (Saturday, Sunday and the closed Monday skipped)", due.toISOString() === "2026-11-18T22:00:00.000Z", due);
  ok("PF-21v DW1 pass: on Friday, 2 business days left (Tuesday, Wednesday)", businessDaysBetween(cal, fri, due) === 2);
  ok("PF-21v DW1 pass: on Tuesday, 1 left (Wednesday)", businessDaysBetween(cal, at("2026-11-17T15:00:00Z"), due) === 1);
  ok("PF-21v DW1 pass: on Thursday, 1 business day late (Thursday)", businessDaysBetween(cal, due, at("2026-11-19T15:00:00Z")) === 1);
  ok("PF-21v DW1 fail: Friday to Monday counts no business day (Saturday and Sunday are weekend days, Monday is closed)", businessDaysBetween(cal, fri, at("2026-11-16T15:00:00Z")) === 0);
  ok("PF-21v DW1 fail: the closed day is not counted (Friday to Tuesday is 1, not 2)", businessDaysBetween(cal, fri, at("2026-11-17T15:00:00Z")) === 1);
  ok("PF-21v DW1 fail: from on or after to is 0, never negative", businessDaysBetween(cal, due, fri) === 0 && businessDaysBetween(cal, due, due) === 0);
  const open = { ...cal, closedDays: [] };
  ok("PF-21v DW1 (DST, clocks back Sun 1 Nov 2026): Fri 30 Oct 23:30 EDT to Fri 6 Nov 00:30 EST is 5 business days, by local dates", businessDaysBetween(open, at("2026-10-31T03:30:00Z"), at("2026-11-06T05:30:00Z")) === 5);
  ok("PF-21v DW1 (DST, clocks forward Sun 8 Mar 2026): Fri 6 Mar 23:30 EST to Mon 9 Mar 00:30 EDT is 1 (Monday), read in the zone, not in UTC or a fixed offset", businessDaysBetween(open, at("2026-03-07T04:30:00Z"), at("2026-03-09T04:30:00Z")) === 1);
  ok("PF-21v DW1 fail (DST): Mon 9 Mar 00:30 EDT is still Monday, so Friday to Sunday 23:59 EDT counts nothing", businessDaysBetween(open, at("2026-03-07T04:30:00Z"), at("2026-03-09T03:59:00Z")) === 0);

  const shared = new BusinessDayTally(cal), spans: [Date, Date][] = [];
  for (let i = 0; i < 60; i++) { const x = Date.parse("2025-01-01T12:00:00Z") + ((i * 7919) % 700) * 86_400_000, y = x + ((i * 104729) % 400 - 50) * 86_400_000 + (i % 5) * 3_600_000; spans.push([new Date(x), new Date(y)]); }
  const mismatched = spans.filter(([x, y]) => businessDaysBetween(cal, x, y, shared) !== businessDaysBetween(cal, x, y));
  ok("PF-21v DW1 pass: one tally shared by 60 spans in any order (earlier starts, later ends) counts each exactly as a fresh one does", mismatched.length === 0, mismatched.slice(0, 3));
  ok("PF-21v DW1 fail: the shared tally still counts no weekend or closed day (Friday 13 → Monday 16 Nov stays 0 after the walk)", businessDaysBetween(cal, fri, at("2026-11-16T15:00:00Z"), shared) === 0);

  // ---------------------------------------------------------------------------------------------------------- DW2
  await set(firmA, CLOSED_DAYS.key, ["2026-11-16"]);
  const clock = new FakeClock("2026-11-13T20:00:00Z");
  let reads = 0;
  const counted = new Proxy(db, { get(t, k) {
    const v = Reflect.get(t, k);
    if (k === "platformFirmSetting") return new Proxy(v as object, { get(t2, k2) { const f = Reflect.get(t2, k2); return k2 === "findFirst" ? (...a: unknown[]) => { reads++; return (f as (...x: unknown[]) => unknown).apply(t2, a); } : f; } });
    return typeof v === "function" ? v.bind(t) : v;
  } }) as typeof db;
  const svc = new ComplaintsService({ db: counted, audit: fakeAudit(), jobs: fakeJobs(clock), clock, mail: fakeMail() });
  const BOTH = [COMPLAINT_KEYS.record, COMPLAINT_KEYS.read];
  const owner = fakeStaff({ staffId: as.OWNER.id, firmId: firmA, firmKey: "sample-firm", roles: ["OWNER"], keys: BOTH });
  const rec = (receivedAt: string, handler = handlerP.id) => svc.record(owner, { subjectKind: "OTHER_PERSON", complainantName: "Client A", receivedAt, channel: "PHONE", category: "SERVICE", summary: "A delay (Sample)", handlerStaffId: handler });
  const a = await rec("2026-11-13T15:00:00Z"), b = await rec("2026-11-13T15:00:00Z"), c = await rec("2026-11-13T15:00:00Z");
  await svc.acknowledge(owner, b.id, { at: "2026-11-13T16:00:00Z" });
  await svc.close(owner, c.id, { at: "2026-11-13T17:00:00Z", outcome: "RESOLVED", note: "Sorted (Sample)" });
  const left = async (id: string) => (await svc.get(owner, id)).businessDaysLeft;
  ok("PF-21v DW2: the record's own answer carries the field too (2 on Friday)", a.businessDaysLeft === 2, a.businessDaysLeft);
  const expect: [string, number][] = [["2026-11-13T20:00:00Z", 2], ["2026-11-16T15:00:00Z", 2], ["2026-11-17T15:00:00Z", 1], ["2026-11-18T21:59:00Z", 0], ["2026-11-18T22:01:00Z", -1], ["2026-11-19T15:00:00Z", -1], ["2026-11-20T15:00:00Z", -2], ["2026-11-23T15:00:00Z", -3]];
  for (const [now, n] of expect) {
    await clock.set(now);
    const g = await svc.get(owner, a.id);
    ok(`PF-21v DW2 ${n >= 0 ? "pass" : "pass (overdue)"}: open, not acknowledged, at ${now} → ${n}${n < 0 ? ", overdue" : ""}`, g.businessDaysLeft === n && g.overdue === n < 0, [g.businessDaysLeft, g.overdue]);
  }
  let agree = true; const disagree: unknown[] = [];
  for (let h = 0; h < 24 * 14; h++) {
    await clock.set(new Date(Date.parse("2026-11-13T15:30:00Z") + h * 3_600_000));
    const page = await svc.list(owner, "open");
    for (const v of page.items) if (v.id === a.id && (v.businessDaysLeft === null || (v.businessDaysLeft < 0) !== v.overdue)) { agree = false; disagree.push([clock.now(), v.businessDaysLeft, v.overdue]); }
  }
  ok("PF-21v DW2 pass: every hour for two weeks, the sign agrees with the service's own overdue flag (< 0 exactly when overdue)", agree, disagree.slice(0, 3));
  ok("PF-21v DW2 fail: an acknowledged complaint shows null, not a number", (await left(b.id)) === null);
  ok("PF-21v DW2 fail: a closed complaint shows null, not a number", (await left(c.id)) === null);
  await clock.set("2026-11-24T15:00:00Z");
  for (let i = 0; i < 100; i++) await rec(new Date(Date.parse("2026-11-01T15:00:00Z") + i * 3 * 3_600_000).toISOString());
  reads = 0;
  const hundred = await svc.list(owner, "open", { limit: 100 });
  ok("PF-21v DW2 pass: a page of 100 reads the calendar settings once (3 setting reads: zone, hours, closed days)", hundred.items.length === 100 && reads === 3 && hundred.items.every((v) => (v.acknowledgedAt ? v.businessDaysLeft === null : typeof v.businessDaysLeft === "number")), { n: hundred.items.length, reads });
  reads = 0; await svc.get(owner, a.id);
  ok("PF-21v DW2 fail→pass: GET /:id reads them once too (not once per event)", reads === 3, reads);

  for (let i = 0; i < 100; i++) await rec(new Date(Date.parse("2000-01-03T15:00:00Z") + i * 3_600_000).toISOString());
  // Counted, not timed (review m4): each date read is a few Intl formatToParts calls; one walk of ~9,800 dates stays far
  // under 100,000 calls, where a walk per row (100 × ~9,800 dates) is millions.
  const proto = Intl.DateTimeFormat.prototype, real = proto.formatToParts;
  let reads2 = 0;
  proto.formatToParts = function (this: Intl.DateTimeFormat, d?: Date | number) { reads2++; return real.call(this, d); };
  let old: Awaited<ReturnType<typeof svc.list>>;
  try { old = await svc.list(owner, "overdue", { limit: 100 }); } finally { proto.formatToParts = real; }
  const span = Math.round((clock.now().getTime() - Date.parse("2000-01-03T15:00:00Z")) / 86_400_000);
  const oldest = old.items[0], expectOld = oldest ? -businessDaysBetween(cal, oldest.acknowledgeBy, clock.now()) : 0;
  ok("PF-21v DW2 pass (break M1): a page of 100 complaints overdue since 2000 is one walk of the dates, not one per row (date reads under 10 per date of the span), with the right count", old.items.length === 100 && oldest?.businessDaysLeft === expectOld && expectOld < -6000 && reads2 < 10 * span, { reads2, span, got: oldest?.businessDaysLeft, expectOld });

  // -------------------------------------------------------------------------------------------- the app for DW3-DW6
  const { app, base } = await makeApp();
  BASE = base;
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const complaint = (handler: string) => ({ subjectKind: "OTHER_PERSON", complainantName: "Client B", receivedAt: ago(6), channel: "EMAIL", category: "FEES", summary: "A fee question (Sample)", handlerStaffId: handler });

  // ---------------------------------------------------------------------------------------------------------- DW3
  const byLeaver = (await call("POST", "", as.OWNER.token, complaint(leaver.id))).body.id as string;
  const byElsewhere = (await call("POST", "", elsewhere.token, complaint(as.ADMIN.id))).body.id as string;
  const officers = (await call("POST", "", as.OWNER.token, complaint(handlerP.id))).body.id as string;
  const moved = (await call("POST", "", as.CASE_MANAGER.token, complaint(as.ADMIN.id))).body.id as string;
  await call("POST", `/${moved}/handler`, as.OWNER.token, { handlerStaffId: handlerP.id });
  await call("POST", `/${moved}/steps`, handlerP.token, { kind: "NOTE", note: "Called (Sample)" });
  await db.platformStaff.update({ where: { id: leaver.id }, data: { status: "DEACTIVATED" } });
  const all = await call("GET", "?view=all&limit=100", as.OWNER.token);
  const named = new Set<string>();
  for (const v of all.body.items ?? []) { named.add(v.handlerStaffId); const m = /^staff:(.+)$/.exec(v.recordedBy); if (m) named.add(m[1]); }
  ok("PF-21v DW3 pass: an OWNER's list carries the name of every handler and recorder on the page", all.status === 200 && named.size > 0 && [...named].every((id) => typeof all.body.people?.[id] === "string"), { missing: [...named].filter((id) => !all.body.people?.[id]) });
  ok("PF-21v DW3 pass: including a deactivated handler (the name stays on the record)", all.body.people?.[leaver.id] === leaver.name && [byLeaver, byElsewhere].every((id) => all.body.items.some((v: { id: string }) => v.id === id)), all.body.people);
  ok("PF-21v DW3 pass: names only, keyed by the bare staff id (no email, no roles)", Object.entries(all.body.people ?? {}).every(([k, v]) => /^[0-9a-f-]{36}$/.test(k) && typeof v === "string" && !String(v).includes("@")), all.body.people);
  const one = await call("GET", `/${moved}`, as.OWNER.token);
  const actors = (one.body.events ?? []).map((e: { actor: string }) => e.actor.replace(/^staff:/, ""));
  ok("PF-21v DW3 pass: GET /:id names every event actor and the handler change's from and to", one.status === 200 && [...actors, as.CASE_MANAGER.id, as.ADMIN.id, handlerP.id, as.OWNER.id].every((id: string) => one.body.people?.[id]), one.body.people);
  const sys = await db.platComplaintEvent.create({ data: { firmId: firmA, complaintId: moved, kind: "REMINDER_SENT", at: new Date(), actor: "system:complaint-ack-reminder", detail: {} } });
  const oneSys = await call("GET", `/${moved}`, as.OWNER.token);
  ok("PF-21v DW3 fail: a system actor is not staff, so it is not in people", oneSys.body.events?.some((e: { id: string }) => e.id === sys.id) && !Object.keys(oneSys.body.people ?? {}).some((k) => k.startsWith("system")), oneSys.body.people);
  const mine = await call("GET", "?view=all&limit=100", handlerP.token);
  const mineItems: { id: string; handlerStaffId: string }[] = mine.body.items ?? [];
  ok("PF-21v DW3: the handler (a CASE_MANAGER: record key, no read key) lists only their own (the list is not widened)", mineItems.length > 0 && mineItems.every((v) => v.handlerStaffId === handlerP.id) && !mineItems.some((v) => v.id === byElsewhere || v.id === byLeaver), mineItems.length);
  const peopleIds = Object.keys(mine.body.people ?? {});
  ok("PF-21v DW3 fail: the handler's list carries no name of staff who appear only in complaints they cannot see", mine.status === 200 && !peopleIds.includes(elsewhere.id) && !peopleIds.includes(leaver.id) && !JSON.stringify(mine.body).includes(elsewhere.name) && !JSON.stringify(mine.body).includes(leaver.name), mine.body.people);
  const notTheirs = await call("GET", `/${byElsewhere}`, handlerP.token);
  ok("PF-21v DW3 fail: opening one they cannot see → the same 404, with no people", notTheirs.status === 404 && notTheirs.body.people === undefined, notTheirs);

  // ---------------------------------------------------------------------------------------------------------- DW4
  await set(firmA, TIME_ZONE.key, "America/Vancouver");
  await set(firmB, TIME_ZONE.key, "Asia/Kolkata");
  await call("POST", "", ownerB.token, complaint(ownerB.id));
  const listA = await call("GET", "?view=all", as.OWNER.token), getA = await call("GET", `/${officers}`, as.OWNER.token);
  ok("PF-21v DW4 pass: firmTimeZone equals the firm's setting, on the list and on GET /:id", listA.body.firmTimeZone === "America/Vancouver" && getA.body.firmTimeZone === "America/Vancouver", [listA.body.firmTimeZone, getA.body.firmTimeZone]);
  const listB = await call("GET", "?view=all", ownerB.token);
  ok("PF-21v DW4 fail: firm B's zone never appears in firm A's answers (and firm A's never in B's)", listB.body.firmTimeZone === "Asia/Kolkata" && ![listA, getA].some((x) => JSON.stringify(x.body).includes("Asia/Kolkata")) && !JSON.stringify(listB.body).includes("America/Vancouver"), listB.body.firmTimeZone);
  await set(firmA, TIME_ZONE.key, "America/Toronto");
  await set(firmA, BUSINESS_HOURS.key, HOURS);

  // ---------------------------------------------------------------------------------------------------------- DW5
  // PF-21j: the handler list holds only active staff who may record complaints (Owner, Admin, Case Manager).
  const active = (await db.platformStaff.findMany({ where: { firmId: firmA, status: "ACTIVE", grants: { some: { endedAt: null, role: { in: ["OWNER", "ADMIN", "CASE_MANAGER"] } } } }, select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }] }));
  for (const r of ["OWNER", "ADMIN", "CASE_MANAGER"] as const) {
    const h = await call("GET", "/handlers", as[r].token);
    ok(`PF-21v DW5 pass: ${r} → 200, the firm's active staff who may record complaints (PF-21j), by name, each exactly { id, displayName }`, h.status === 200 && JSON.stringify(h.body) === JSON.stringify({ items: active }) && h.body.items.every((i: object) => JSON.stringify(Object.keys(i)) === '["id","displayName"]'), h);
  }
  const h = (await call("GET", "/handlers", as.OWNER.token)).body.items.map((i: { id: string }) => i.id);
  ok("PF-21v DW5 fail: a suspended and a deactivated staff member are absent", !h.includes(suspended.id) && !h.includes(leaver.id) && h.includes(as.CASE_MANAGER.id), h);
  ok("PF-21j fail: a Read-only person, a Case Officer and a Billing / Finance person (no agent/complaint:record) are absent", ![as.READ_ONLY.id, as.CASE_OFFICER.id, as.BILLING_FINANCE.id].some((id) => h.includes(id)), h);
  ok("PF-21v DW5 fail: another firm's staff are absent", !h.includes(ownerB.id));
  for (const r of ["CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const) {
    const x = await call("GET", "/handlers", as[r].token);
    ok(`PF-21v DW5 fail: ${r} → 403 (no agent/complaint:record)`, x.status === 403 && x.body.code === "MISSING_PERMISSION", x);
  }
  const anon = await call("GET", "/handlers");
  ok("PF-21v DW5 fail: no token → 401", anon.status === 401 && anon.body.code === "NOT_SIGNED_IN", anon);
  const susp = await call("GET", "/handlers", suspended.token);
  ok("PF-21v DW5 fail: the suspended person's own token → refused (401/403)", susp.status === 401 || susp.status === 403, susp);
  const hB = await call("GET", "/handlers", ownerB.token);
  ok("PF-21v DW5: firm B's Owner gets firm B's staff only", hB.status === 200 && hB.body.items.every((i: { id: string }) => !active.some((s) => s.id === i.id)) && hB.body.items.some((i: { id: string }) => i.id === ownerB.id), hB);
  const keyless = await svc.handlers(fakeStaff({ staffId: as.READ_ONLY.id, firmId: firmA, firmKey: "sample-firm", roles: ["READ_ONLY"], keys: [] })).then(() => "served", (e: { getStatus?: () => number }) => e.getStatus?.());
  ok("PF-21v DW5 fail: the service itself refuses a caller without the key (403), not only the route", keyless === 403, keyless);

  // ---------------------------------------------------------------------------------------------------------- DW6
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => r.path.startsWith("/api/platform/complaints"));
  const declared = Object.fromEntries(routes.map((r) => [`${r.method} ${r.path}`, r.access]));
  ok("PF-21v DW6 pass: PF-4's start-up check passes with the new route, declared with agent/complaint:record", (() => { try { assertEveryRouteDeclared(routes); return true; } catch { return false; } })() && JSON.stringify(declared["GET /api/platform/complaints/handlers"]) === JSON.stringify({ kind: "keys", keys: ["agent/complaint:record"] }), declared);
  ok("PF-21v DW6 fail: the same check refuses the new route stripped of its declaration, naming it", throwsLike(() => assertEveryRouteDeclared(routes.map((r) => (r.path.endsWith("/handlers") ? { ...r, access: undefined } : r))), /no declared permission keys.*ComplaintsController\.handlers/));
  const order = routes.map((r) => `${r.method} ${r.path}`);
  ok("PF-21v DW6 pass: GET /handlers is declared before GET /:id", order.indexOf("GET /api/platform/complaints/handlers") >= 0 && order.indexOf("GET /api/platform/complaints/handlers") < order.indexOf("GET /api/platform/complaints/:id"), order);
  const viaId = await call("GET", "/handlers", as.CASE_MANAGER.token);
  ok("PF-21v DW6 fail: GET /handlers is not taken by /:id (no 404 \"not found\")", viaId.status === 200 && viaId.body.code !== "NOT_FOUND" && Array.isArray(viaId.body.items), viaId);
  const caseOfficerGet = await call("GET", "/handlers", as.CASE_OFFICER.token);
  ok("PF-21v DW6 fail: a CASE_OFFICER gets the route's 403, never /:id's 404 (the AnyStaff /:id route would answer 404)", caseOfficerGet.status === 403, caseOfficerGet);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
