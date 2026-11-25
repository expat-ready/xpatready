// FO-3m (rev 16.23; FO-3's service answers found on #1811 Questions 4-5 and #1819; AG-4-39 rule 2): cases DW1..DW6 of
// the brief, each with a pass and a fail, over HTTP on the same app as FO-3sr's check (the feature's own staff controller
// and Booking provider beside PF-4's real guard with the local sign-in stand-in, the six roles PF-3 seeds, PF-0p's fake
// clock, jobs and mail and the ArrivalPort fake) on a scratch database (every migration), dropped at the end. US$0.
//   tsx studio/tests/check_fo3m_answers.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3m_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
/** A Toronto wall time as an ISO moment ("2026-10-26 09:00"). */
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock), mail = fakeMail({ clock });
const ports = { audit: fakeAudit() as never, clock, jobs, mail, arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3m-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }];
@Module({ controllers: [BookingStaffController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3m-a"), await firm("fo3m-b")];
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3m" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  await copyFirmHoursTo(db, A.id, [P.OWNER.id, P.BILLING_FINANCE.id]);
  // Types that need no consultation agreement: this check is about attendance, not the agreement (QA-772: gate.ts holds a type that needs one and has none).
  const type = (slug: string, host: string) => db.foConsultationType.create({ data: { requireAgreement: false, firmId: A.id, slug, name: `Free consultation ${slug}`, modes: ["VIDEO", "PHONE"], hostStaffIds: [host], minutes: 30 } });
  const [TO, TB] = [await type("owner", P.OWNER.id), await type("billing", P.BILLING_FINANCE.id)];
  const pid = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });
  const body = (typeId: string, when: string) => ({ typeId, personId: pid, mode: "VIDEO", startsAt: iso(when), timeZone: TZ });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const go = (method: string, path: string, who?: { token: string }, b?: unknown) => call(base, method, `/api/front-office/bookings${path}`, who?.token, b);
  const make = async (typeId: string, when: string, who = P.OWNER) => { const r = await go("POST", "", who, body(typeId, when)); if (r.status !== 201) throw new Error(`create ${when}: ${JSON.stringify(r)}`); return r.body as { id: string; staffId: string; status: string; sequence: number; startsAt: string }; };
  const statusOf = async (id: string) => (await db.foBooking.findUniqueOrThrow({ where: { id } })).status;

  const issues = (r: Res): string[] => (Array.isArray(r.body?.issues) ? r.body.issues : []);
  const range = (from: string, to: string) => `?from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`;
  const b1 = await make(TB.id, "2026-10-27 10:00");   // the BILLING_FINANCE host's (no agent/booking:edit)
  const b2 = await make(TO.id, "2026-10-27 11:00");   // the owner's
  const b3 = await make(TO.id, "2026-10-28 10:00");   // cancelled before its start (DW2)
  const b4 = await make(TO.id, "2026-10-27 14:00");   // the attendance question's (DW6)

  // ------------------------------------------------------------------------------- DW2: cancelled is checked first
  const earlyActive = await go("POST", `/${b3.id}/attendance`, P.OWNER, { outcome: "COMPLETED" });
  ok("FO-3m DW2 pass: an active booking before its start still answers 409 too-early", earlyActive.status === 409 && /too-early/.test(earlyActive.body?.type), earlyActive);
  const cancel = await go("POST", `/${b3.id}/cancel`, P.OWNER);
  const earlyCancelled = await go("POST", `/${b3.id}/attendance`, P.OWNER, { outcome: "COMPLETED" });
  ok("FO-3m DW2 fail: a cancelled booking before its start answers 409 not-active (\"Cancelled\"), not too-early",
    cancel.status === 200 && earlyCancelled.status === 409 && /not-active/.test(earlyCancelled.body?.type) && earlyCancelled.body?.title === "Cancelled" && await statusOf(b3.id) === "CANCELLED", earlyCancelled);

  // ------------------------------------------------------------------------------------- DW4 (list): the 422 title
  const listOk = await go("GET", range("2026-10-26 00:00", "2026-10-30 00:00"), P.OWNER);
  ok("FO-3m DW4 pass: a good list query → 200 with the firm's bookings", listOk.status === 200 && Array.isArray(listOk.body) && listOk.body.length === 4, listOk.status);
  const listBack = await go("GET", range("2026-10-30 00:00", "2026-10-26 00:00"), P.OWNER);
  const listNoFrom = await go("GET", `?to=${encodeURIComponent(iso("2026-10-30 00:00"))}`, P.OWNER);
  ok("FO-3m DW4 fail: a refused list (to before from; from missing) is titled \"Bookings not listed\", never \"Not booked\"",
    [listBack, listNoFrom].every((r) => r.status === 422 && r.body?.title === "Bookings not listed") && issues(listNoFrom).some((i) => i.startsWith("from:")), [listBack, listNoFrom]);

  await clock.set(at("2026-10-27 11:10"));   // b1 and b2 have started

  // --------------------------------------------------------------------------------- DW1: the 422 names `outcome`
  const bfOwn = await go("POST", `/${b1.id}/attendance`, P.BILLING_FINANCE, { outcome: "COMPLETED" });
  ok("FO-3m DW1 pass: { outcome: COMPLETED } on the host's own started booking → 200 COMPLETED", bfOwn.status === 200 && bfOwn.body?.status === "COMPLETED", bfOwn);
  const bad = await go("POST", `/${b2.id}/attendance`, P.OWNER, { outcome: "MAYBE" });
  const none = await go("POST", `/${b2.id}/attendance`, P.OWNER, {});
  ok("FO-3m DW1 fail: an unknown or missing outcome → 422 whose issues name outcome, none body",
    [bad, none].every((r) => r.status === 422 && issues(r).length > 0 && issues(r).every((i) => i.startsWith("outcome:")))
      && await statusOf(b2.id) === "SCHEDULED", [bad, none]);

  // ------------------------------------------------------------------------------- DW4 (attendance): the 422 title
  ok("FO-3m DW4 fail: a refused attendance answer is titled \"Attendance not recorded\", never \"Not booked\"",
    [bad, none].every((r) => r.body?.title === "Attendance not recorded"), [bad.body?.title, none.body?.title]);
  const createBad = await go("POST", "", P.OWNER, { typeId: TO.id });
  ok("FO-3m DW4 pass: a refused booking itself keeps \"Not booked\" (only the list and attendance titles change)", createBad.status === 422 && createBad.body?.title === "Not booked", createBad);

  // -------------------------------------------------------------------------- DW3: the service's 403 is the guard's
  const guard403 = await go("POST", "", P.BILLING_FINANCE, body(TO.id, "2026-10-29 10:00"));
  const svc403 = await go("POST", `/${b2.id}/attendance`, P.READ_ONLY, { outcome: "COMPLETED" });
  ok("FO-3m DW3 pass: a non-host with agent/booking:edit (CASE_OFFICER) answers another host's booking → 200",
    (await go("POST", `/${b2.id}/attendance`, P.CASE_OFFICER, { outcome: "COMPLETED" })).status === 200 && await statusOf(b2.id) === "COMPLETED");
  ok("FO-3m DW3 fail: a non-host without it (READ_ONLY) → the service's 403 \"Not allowed\" with code MISSING_PERMISSION, like the guard's",
    svc403.status === 403 && svc403.body?.title === "Not allowed" && svc403.body?.code === "MISSING_PERMISSION" && /agent\/booking:edit/.test(svc403.body?.detail)
      && guard403.status === 403 && guard403.body?.code === svc403.body?.code && await statusOf(b2.id) === "COMPLETED", [svc403, guard403]);

  // ------------------------------------------------------------------------------------- DW5: only `outcome` taken
  const strictOk = await go("POST", `/${b2.id}/attendance`, P.OWNER, { outcome: "NO_SHOW" });
  ok("FO-3m DW5 pass: { outcome: NO_SHOW } alone → 200 NO_SHOW (the answer may be changed)", strictOk.status === 200 && strictOk.body?.status === "NO_SHOW", strictOk);
  const extra = await go("POST", `/${b2.id}/attendance`, P.OWNER, { outcome: "COMPLETED", note: "came late" });
  ok("FO-3m DW5 fail: an extra key → 422 naming it, nothing recorded (still NO_SHOW)",
    extra.status === 422 && issues(extra).some((i) => /note/.test(i)) && extra.body?.title === "Attendance not recorded" && await statusOf(b2.id) === "NO_SHOW", extra);

  // ------------------------------------------------------------------------- DW6: shown, not pushed (AG-4-39 rule 2)
  const askJob = () => jobs.jobs.find((j) => j.name === "booking.attendance_ask" && j.key === `booking:${b4.id}:0:attendance`);
  const due = async () => (await go("GET", "/attendance-due", P.OWNER)).body as { id: string }[];
  await clock.set(at("2026-10-27 14:59"));   // b4 ended 14:30: 29 minutes
  ok("FO-3m DW6 fail: 29 minutes after the end it is not yet due and its question has not run", !(await due()).some((b) => b.id === b4.id) && askJob()?.status === "waiting", askJob());
  await clock.set(at("2026-10-27 15:01"));
  const dueNow = await due();
  ok("FO-3m DW6 pass: after the attendance job runs no mail with booking.attendance_ask is sent to anyone, and the booking is listed as due, unanswered",
    askJob()?.status === "done" && !mail.sent.some((m) => m.templateKey === "booking.attendance_ask") && dueNow.some((b) => b.id === b4.id) && await statusOf(b4.id) === "SCHEDULED",
    { job: askJob(), mails: mail.sent.map((m) => m.templateKey), due: dueNow.map((b) => b.id) });
} catch (e) {
  fail++; console.log(`FAIL  FO-3m: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
