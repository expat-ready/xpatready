// FO-3sr (FO-3's part 2; BACKLOG row FO-3; contracts §2.2, §7 §1.2; AG-4-67, AG-4-39, AG-4-63): the staff booking routes
// behind PF-4's guard. Cases DW1..DW10 and the journey W1 of the brief, each with a passing and a failing case, over HTTP
// on the six roles PF-3 seeds (their keys are the migration's platform_role_permission rows): a scratch database (every
// migration), one small Nest app built from the feature's own controller and Booking provider beside PF-4's guard with
// the local sign-in stand-in, PF-0p's fake clock, jobs and mail and the ArrivalPort fake. No model call (US$0). Dropped
// at the end.
//   tsx studio/tests/check_fo3sr_routes.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3sr_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
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
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, assertEveryRouteDeclared, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const feature = (await import("../api/src/features/front-office-booking.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
/** A Toronto wall time as an ISO moment ("2026-10-26 09:00"). */
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock);
const ports = { audit: fakeAudit() as never, clock, jobs, mail: fakeMail({ clock }), arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3sr-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }];
@Module({ controllers: [BookingStaffController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3sr-a"), await firm("fo3sr-b")];
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3sr" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  const B1 = await person(B.id, "b-owner", "OWNER");
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

  // ---------------------------------------------------------------------- DW9: PF-4's start-up check (default deny)
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => r.name.startsWith("BookingStaffController."));
  ok("FO-3sr DW9 pass: the app starts with PF-4's guard, and the feature lists the controller", !!base && (feature.controllers as unknown[]).includes(BookingStaffController));
  ok("FO-3sr DW9 pass: all seven new routes are found under /api/front-office/bookings and each declares its access",
    routes.length === 7 && routes.every((r) => r.access && r.path.startsWith("/api/front-office/bookings")), routes);
  const stripped = routes.map((r, i) => (i === 3 ? { ...r, access: undefined } : r));
  let refusedRoute = "";
  try { assertEveryRouteDeclared(stripped); } catch (e) { refusedRoute = String(e); }
  ok(`FO-3sr DW9 fail: the route list with ${routes[3]?.name} stripped of its declaration is refused, naming it`, refusedRoute.includes(`${routes[3]?.name} (`), refusedRoute);
  const order = routes.map((r) => `${r.method} ${r.path}`);
  ok("FO-3sr: GET /attendance-due is registered before GET /:id", order.indexOf("GET /api/front-office/bookings/attendance-due") >= 0 && order.indexOf("GET /api/front-office/bookings/attendance-due") < order.indexOf("GET /api/front-office/bookings/:id"), order);

  // ----------------------------------------------------------------------------------------------- DW1, DW10: create
  const c = { OWNER: "", ADMIN: "", CASE_MANAGER: "", CASE_OFFICER: "" };
  const times = ["2026-10-27 09:00", "2026-10-27 10:00", "2026-10-27 11:00", "2026-10-27 12:00"];
  const created: Res[] = [];
  for (const [i, r] of (Object.keys(c) as (keyof typeof c)[]).entries()) { const x = await go("POST", "", P[r], body(TO.id, times[i])); created.push(x); c[r] = x.body?.id; }
  ok("FO-3sr DW1 pass: OWNER, ADMIN, CASE_MANAGER and CASE_OFFICER create a booking → 201", created.every((x) => x.status === 201 && x.body.status === "SCHEDULED"), created.map((x) => [x.status, x.body?.code]));
  const noCreate = [await go("POST", "", P.BILLING_FINANCE, body(TO.id, "2026-10-27 14:00")), await go("POST", "", P.READ_ONLY, body(TO.id, "2026-10-27 15:00"))];
  ok("FO-3sr DW1 fail: BILLING_FINANCE and READ_ONLY → 403 Not allowed (the guard's MISSING_PERMISSION), nothing saved",
    noCreate.every((x) => x.status === 403 && x.body.title === "Not allowed" && x.body.code === "MISSING_PERMISSION") && await db.foBooking.count({ where: { firmId: A.id, startsAt: { in: [at("2026-10-27 14:00"), at("2026-10-27 15:00")] } } }) === 0, noCreate);
  ok("FO-3sr DW10 pass: the create answer carries the booking (id, host, times)", created[0].body.id && created[0].body.staffId === P.OWNER.id && created[0].body.startsAt === iso(times[0]));
  ok("FO-3sr DW10 fail: the create answer carries no booking-link token (FO-3f item 3, review m7)",
    created.every((x) => !("manageToken" in x.body) && !/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(JSON.stringify(x.body))) && await db.foBookingToken.count() === 0, created[0].body);

  // ------------------------------------------------------------------------------------- DW2: reschedule and cancel
  const moved: Res[] = [], cancelled: Res[] = [];
  for (const [i, r] of (Object.keys(c) as (keyof typeof c)[]).entries()) moved.push(await go("POST", `/${c[r]}/reschedule`, P[r], { startsAt: iso(`2026-10-28 ${String(9 + i).padStart(2, "0")}:00`) }));
  ok("FO-3sr DW2 pass: the four roles with agent/booking:edit reschedule → 200", moved.every((x) => x.status === 200 && x.body.status === "RESCHEDULED"), moved.map((x) => [x.status, x.body?.code]));
  const noEdit = [await go("POST", `/${c.OWNER}/reschedule`, P.BILLING_FINANCE, { startsAt: iso("2026-10-29 09:00") }), await go("POST", `/${c.OWNER}/reschedule`, P.READ_ONLY, { startsAt: iso("2026-10-29 09:00") }),
    await go("POST", `/${c.OWNER}/cancel`, P.BILLING_FINANCE), await go("POST", `/${c.OWNER}/cancel`, P.READ_ONLY)];
  ok("FO-3sr DW2 fail: BILLING_FINANCE and READ_ONLY reschedule or cancel → 403 from the guard (MISSING_PERMISSION: the routes' own declaration, not only the service's check), the booking unchanged",
    noEdit.every((x) => x.status === 403 && x.body.code === "MISSING_PERMISSION") && (await db.foBooking.findUniqueOrThrow({ where: { id: c.OWNER } })).startsAt.toISOString() === iso("2026-10-28 09:00") && await statusOf(c.OWNER) === "RESCHEDULED", noEdit.map((x) => [x.status, x.body?.code]));
  for (const r of Object.keys(c) as (keyof typeof c)[]) cancelled.push(await go("POST", `/${c[r]}/cancel`, P[r]));
  ok("FO-3sr DW2 pass: the four roles with agent/booking:edit cancel → 200", cancelled.every((x) => x.status === 200 && x.body.status === "CANCELLED"), cancelled.map((x) => [x.status, x.body?.code]));

  // ------------------------------------------------------------------------------------------- DW3, DW4: list, get
  const o1 = await make(TO.id, "2026-10-29 10:00"), bf1 = await make(TB.id, "2026-10-27 09:00");
  const range = `?from=${encodeURIComponent(iso("2026-10-26 00:00"))}&to=${encodeURIComponent(iso("2026-11-02 00:00"))}`;
  const ids = (r: Res) => (Array.isArray(r.body) ? r.body.map((b: { id: string }) => b.id) : []);
  const [ownAll, ownBf, roAll, bfAll, bfOther] = [await go("GET", range, P.OWNER), await go("GET", `${range}&staff=${P.BILLING_FINANCE.id}`, P.OWNER), await go("GET", range, P.READ_ONLY), await go("GET", range, P.BILLING_FINANCE), await go("GET", `${range}&staff=${P.BILLING_FINANCE.id}`, P.BILLING_FINANCE)];
  ok("FO-3sr DW3 pass: with agent/booking:list (OWNER; READ_ONLY too) the list is the firm's, and staff= filters it to one host",
    ownAll.status === 200 && ids(ownAll).includes(o1.id) && ids(ownAll).includes(bf1.id) && ownBf.status === 200 && ids(ownBf).includes(bf1.id) && ownBf.body.every((b: { staffId: string }) => b.staffId === P.BILLING_FINANCE.id)
      && roAll.status === 200 && JSON.stringify(ids(roAll)) === JSON.stringify(ids(ownAll)), [ownAll, ownBf, roAll]);
  ok("FO-3sr DW3 fail: BILLING_FINANCE (no list key) → 403 MISSING_PERMISSION on the list, also asking for their own bookings with staff= (AG-4-67 rule 4: the key opens lists at all)",
    [bfAll, bfOther].every((x) => x.status === 403 && x.body.code === "MISSING_PERMISSION"), [bfAll, bfOther]);
  const [g1, g2, g3] = [await go("GET", `/${o1.id}`, P.BILLING_FINANCE), await go("GET", `/${bf1.id}`, P.BILLING_FINANCE), await go("GET", `/${o1.id}`, P.READ_ONLY)];
  ok("FO-3sr DW4 pass: a host without the list key (BILLING_FINANCE) opens their own booking by id (AG-4-67 rule 2); a role with the list key reads another host's", g2.status === 200 && g2.body.id === bf1.id && g3.status === 200 && g3.body.id === o1.id, [g2, g3]);
  const unknown = await go("GET", "/00000000-0000-4000-8000-00000000dead", P.BILLING_FINANCE);
  ok("FO-3sr DW4 fail: another host's booking without the list key → 404 (never 403), the same answer as an unknown id, so the id is not confirmed",
    g1.status === 404 && JSON.stringify(g1.body) === JSON.stringify(unknown.body), [g1, unknown]);

  // ------------------------------------------------------------------------------------------------- DW7: no token
  const seven = [await go("POST", "", undefined, body(TO.id, "2026-10-29 11:00")), await go("POST", `/${o1.id}/reschedule`, undefined, { startsAt: iso("2026-10-29 12:00") }), await go("POST", `/${o1.id}/cancel`),
    await go("GET", range), await go("GET", `/${o1.id}`), await go("GET", "/attendance-due"), await go("POST", `/${o1.id}/attendance`, undefined, { outcome: "COMPLETED" })];
  ok("FO-3sr DW7 fail: no token → 401 NOT_SIGNED_IN on all seven routes", seven.every((x) => x.status === 401 && x.body.code === "NOT_SIGNED_IN"), seven.map((x) => [x.status, x.body?.code]));
  ok("FO-3sr DW7 pass: the same routes answer with a token (o1 still active, nothing created at 11:00)", await statusOf(o1.id) === "SCHEDULED" && await db.foBooking.count({ where: { startsAt: at("2026-10-29 11:00") } }) === 0 && g3.status === 200);

  // ---------------------------------------------------------------------------------------------- DW8: another firm
  const before = JSON.stringify(await db.foBooking.findUniqueOrThrow({ where: { id: o1.id } }));
  const cross = [await go("GET", `/${o1.id}`, B1), await go("POST", `/${o1.id}/reschedule`, B1, { startsAt: iso("2026-10-29 13:00") }), await go("POST", `/${o1.id}/cancel`, B1), await go("POST", `/${o1.id}/attendance`, B1, { outcome: "NO_SHOW" })];
  ok("FO-3sr DW8 fail: firm B's token on firm A's booking → 404 on get, reschedule, cancel and attendance, the same answer as an unknown id",
    cross.every((x) => x.status === 404 && JSON.stringify(x.body) === JSON.stringify(unknown.body)), cross.map((x) => [x.status, x.body]));
  ok("FO-3sr DW8 pass: firm A's booking is unchanged, and firm B's list does not show it", JSON.stringify(await db.foBooking.findUniqueOrThrow({ where: { id: o1.id } })) === before && !ids(await go("GET", range, B1)).includes(o1.id));

  // ---------------------------------------------------------------------------------------- DW6: attendance-due
  const oMon = await make(TO.id, "2026-10-26 14:00"), bfMon = await make(TB.id, "2026-10-26 15:00");
  await clock.set(at("2026-10-26 15:59"));   // bfMon ended 29 minutes ago, oMon 89
  const [bf29, own29] = [await go("GET", "/attendance-due", P.BILLING_FINANCE), await go("GET", "/attendance-due", P.OWNER)];
  ok("FO-3sr DW6 fail: a booking that ended 29 minutes ago is not due (one that ended 89 minutes ago is)", own29.status === 200 && !ids(own29).includes(bfMon.id) && ids(own29).includes(oMon.id), own29);
  ok("FO-3sr DW6 fail: BILLING_FINANCE (no list key) → 403 MISSING_PERMISSION on attendance-due, even as the host of a due booking", bf29.status === 403 && bf29.body.code === "MISSING_PERMISSION", bf29);
  await clock.set(at("2026-10-26 16:01"));   // bfMon ended 31 minutes ago
  const [ro31, own31] = [await go("GET", "/attendance-due", P.READ_ONLY), await go("GET", "/attendance-due", P.OWNER)];
  ok("FO-3sr DW6 pass: 31 minutes after the end it is due; with the list key the due list is the firm's (another host's included)",
    own31.status === 200 && ids(own31).includes(bfMon.id) && ids(own31).includes(oMon.id) && ro31.status === 200 && JSON.stringify(ids(ro31)) === JSON.stringify(ids(own31)), [ro31, own31]);

  // -------------------------------------------------------------------------------------------- DW5: attendance
  const early = await go("POST", `/${bf1.id}/attendance`, P.BILLING_FINANCE, { outcome: "COMPLETED" });
  ok("FO-3sr DW5 fail: before the start → 409 (the service's too-early answer)", early.status === 409 && /too-early/.test(JSON.stringify(early.body)) && await statusOf(bf1.id) === "SCHEDULED", early);
  const roOther = await go("POST", `/${oMon.id}/attendance`, P.READ_ONLY, { outcome: "COMPLETED" });
  ok("FO-3sr DW5 fail: a non-host without agent/booking:edit (READ_ONLY) → 403, nothing recorded", roOther.status === 403 && await statusOf(oMon.id) === "SCHEDULED", roOther);
  const bfOwn = await go("POST", `/${bfMon.id}/attendance`, P.BILLING_FINANCE, { outcome: "COMPLETED" });
  ok("FO-3sr DW5 pass: the host without agent/booking:edit (BILLING_FINANCE) records their own → 200", bfOwn.status === 200 && bfOwn.body.status === "COMPLETED", bfOwn);
  const onCancelled = await go("POST", `/${c.OWNER}/attendance`, P.OWNER, { outcome: "COMPLETED" });
  await clock.set(at("2026-10-28 09:10"));   // past c.OWNER's start (Wed 09:00), still cancelled
  const onCancelledLate = await go("POST", `/${c.OWNER}/attendance`, P.OWNER, { outcome: "COMPLETED" });
  ok("FO-3sr DW5 fail: on a cancelled booking → 409 (its not-active answer once it has started)", onCancelled.status === 409 && onCancelledLate.status === 409 && /not-active/.test(JSON.stringify(onCancelledLate.body)) && await statusOf(c.OWNER) === "CANCELLED", [onCancelled, onCancelledLate]);
  const badOutcome = await go("POST", `/${oMon.id}/attendance`, P.OWNER, { outcome: "MAYBE" });
  ok("FO-3sr DW5 fail: an outcome that is not COMPLETED or NO_SHOW → 422", badOutcome.status === 422 && await statusOf(oMon.id) === "SCHEDULED", badOutcome);

  // ---------------------------------------------------------------------------------------------- W1: the journey
  const w1 = await make(TO.id, "2026-10-28 14:00", P.CASE_OFFICER), w2 = await make(TO.id, "2026-10-29 14:00", P.CASE_OFFICER);
  const listed = await go("GET", `?from=${encodeURIComponent(iso("2026-10-28 00:00"))}&to=${encodeURIComponent(iso("2026-10-30 00:00"))}`, P.CASE_OFFICER);
  const w1m = await go("POST", `/${w1.id}/reschedule`, P.CASE_OFFICER, { startsAt: iso("2026-10-28 15:00") });
  await clock.set(at("2026-10-28 15:05"));
  const w1a = await go("POST", `/${w1.id}/attendance`, P.OWNER, { outcome: "COMPLETED" });
  const w2c = await go("POST", `/${w2.id}/cancel`, P.CASE_OFFICER);
  const events = async (id: string) => (await db.moduleEvent.findMany({ where: { subjectId: id }, orderBy: { occurredAt: "asc" } })).map((e) => e.type);
  const [e1, e2] = [await events(w1.id), await events(w2.id)];
  ok("FO-3sr W1 pass: create → in the list → reschedule → past the start → attendance Attended → booking.completed in the outbox; a second cancelled → booking.cancelled",
    ids(listed).includes(w1.id) && w1m.status === 200 && w1a.status === 200 && w1a.body.status === "COMPLETED" && e1.includes(EVENT.BOOKING_RESCHEDULED) && e1.at(-1) === EVENT.BOOKING_COMPLETED
      && w2c.status === 200 && e2.at(-1) === EVENT.BOOKING_CANCELLED, { listed: ids(listed), w1m: w1m.status, w1a, e1, e2 });
  ok("FO-3sr W1 fail: the cancelled booking has no booking.completed, and the completed one no booking.cancelled", !e2.includes(EVENT.BOOKING_COMPLETED) && !e1.includes(EVENT.BOOKING_CANCELLED), { e1, e2 });
} catch (e) {
  fail++; console.log(`FAIL  FO-3sr: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
