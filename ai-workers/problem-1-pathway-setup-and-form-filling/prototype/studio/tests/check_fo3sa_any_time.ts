// FO-3sa (rows rev 16.23; AG-4-63, AG-4-53, AG-4-26 O4; concept FO-3 r2 BR-13): staff book and move at any time, with
// warnings. Cases DW1..DW8 of the brief, each with a passing and a failing case, over HTTP on the six roles PF-3 seeds: a
// scratch database (every migration), one small Nest app built from the feature's staff and public controllers and the
// Booking provider beside PF-4's guard with the local sign-in stand-in, PF-0p's fake clock, jobs, mail, audit and the
// ArrivalPort fake. No model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo3sa_any_time.ts
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
const DB = `xr_studio_fo3sa_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
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
const { Booking, BOOKING_PORTS, BookingPublicController } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const { CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
/** A Toronto wall time as an ISO moment ("2026-10-26 09:00"). */
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock), audit = fakeAudit();
const ports = { audit: audit as never, clock, jobs, mail: fakeMail({ clock }), arrival, publicBaseUrl: "http://localhost:4431", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3sa-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }];
@Module({ controllers: [BookingStaffController, BookingPublicController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3sa-a"), await firm("fo3sa-b")];
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3sa" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  const B1 = await person(B.id, "b-owner", "OWNER");
  await copyFirmHoursTo(db, A.id, [P.OWNER.id, P.ADMIN.id]);
  await copyFirmHoursTo(db, B.id, [B1.id]);
  const ws = await db.workspace.create({ data: { key: "fo3sa-check", label: "FO-3sa check" } });
  await writeSetting(db, { firmId: A.id, key: CLOSED_DAYS.key, value: ["2026-10-28"], by: "seed:fo3sa", workspaceId: ws.id });   // Wednesday
  const T = await db.foConsultationType.create({ data: { firmId: A.id, slug: "any", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [P.OWNER.id], minutes: 30 } });
  const T2 = await db.foConsultationType.create({ data: { firmId: A.id, slug: "two", name: "Free consultation two hosts", modes: ["VIDEO"], hostStaffIds: [P.ADMIN.id, P.OWNER.id], minutes: 30 } });
  const TB = await db.foConsultationType.create({ data: { firmId: B.id, slug: "b", name: "Firm B consultation", modes: ["VIDEO"], hostStaffIds: [B1.id], minutes: 30 } });
  const lee = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });
  const body = (when: string, extra: Record<string, unknown> = {}, typeId = T.id) => ({ typeId, personId: lee, mode: "VIDEO", startsAt: iso(when), timeZone: TZ, ...extra });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const go = (method: string, path: string, who?: { token: string }, b?: unknown) => call(base, method, `/api/front-office/bookings${path}`, who?.token, b);
  const countAt = (when: string) => db.foBooking.count({ where: { firmId: A.id, startsAt: at(when), status: { in: ["SCHEDULED", "RESCHEDULED"] } } });
  const codes = (r: Res) => (Array.isArray(r.body?.warnings) ? r.body.warnings.map((w: { code: string }) => w.code) : []);
  const labels = (r: Res) => (Array.isArray(r.body?.warnings) ? r.body.warnings.map((w: { label: string }) => w.label) : []);
  const auditOf = (id: string, action: string) => audit.entries.filter((e) => e.entityKey === id && e.action === action);

  // ------------------------------------------------------------------------------------------------- DW1: closed day
  const closed = await go("POST", "", P.CASE_OFFICER, body("2026-10-28 10:00"));
  ok("FO-3sa DW1 fail: a closed-day time → 409 \"Book anyway?\" listing \"Closed day\", nothing saved",
    closed.status === 409 && closed.body.code === "WARNINGS" && codes(closed).join() === "CLOSED_DAY" && labels(closed).includes("Closed day") && await countAt("2026-10-28 10:00") === 0, closed);
  const closedYes = await go("POST", "", P.CASE_OFFICER, body("2026-10-28 10:00", { bookAnyway: true, acceptedWarnings: ["CLOSED_DAY"] }));
  const a1 = closedYes.body?.id ? auditOf(closedYes.body.id, "booking.scheduled") : [];
  ok("FO-3sa DW1 pass: Book anyway saves it, the audit entry records the reason (field 9), no overlap confirmer",
    closedYes.status === 201 && closedYes.body.status === "SCHEDULED" && a1.length === 1 && /with warnings: closed day/.test(a1[0].summary) && JSON.stringify(a1[0].detail?.warnings) === '["CLOSED_DAY"]'
      && (await db.foBooking.findUniqueOrThrow({ where: { id: closedYes.body.id } })).overlapConfirmedByUserId === null, { closedYes, a1 });

  // ---------------------------------------------------------------------------------------------- DW3: outside hours
  const sunday = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 11:00"));
  ok("FO-3sa DW3 pass: Sunday 11:00 → the warning \"Outside Sample owner's hours\", nothing saved",
    sunday.status === 409 && codes(sunday).join() === "OUTSIDE_HOURS" && labels(sunday).includes("Outside Sample owner's hours") && sunday.body.hostStaffId === P.OWNER.id && await countAt("2026-11-01 11:00") === 0, sunday);
  const inHours = await go("POST", "", P.CASE_OFFICER, body("2026-10-27 10:00"));
  ok("FO-3sa DW3 fail: a free time inside the host's hours → saved at once, no warning, no confirmer",
    inHours.status === 201 && !("warnings" in inHours.body) && !/warnings/.test(auditOf(inHours.body.id, "booking.scheduled")[0]?.summary ?? "x"), inHours);

  // ------------------------------------------------------------------------------------------------------ DW4: Cancel
  const cancelNo = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 11:00", { bookAnyway: false }));
  const before = audit.entries.length;
  ok("FO-3sa DW4 pass: Cancel (bookAnyway false or left out) saves nothing: no booking, no audit line, no event",
    cancelNo.status === 409 && sunday.status === 409 && await countAt("2026-11-01 11:00") === 0 && audit.entries.length === before
      && await db.moduleEvent.count({ where: { firmId: A.id, occurredAt: { gte: at("2026-10-26 08:00") }, payload: { path: ["startsAt"], equals: iso("2026-11-01 11:00") } } }) === 0, cancelNo);
  const sundayYes = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 11:00", { bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS"] }));
  ok("FO-3sa DW4 fail: the same body with bookAnyway true saves it (the 409 was the only thing stopping it)", sundayYes.status === 201 && await countAt("2026-11-01 11:00") === 1, sundayYes);

  // ---------------------------------------------------------------------------------------------------- DW2: overlap
  const first = await go("POST", "", P.OWNER, body("2026-10-27 13:00"));
  const clash = await go("POST", "", P.CASE_OFFICER, body("2026-10-27 13:00"));
  ok("FO-3sa DW2 fail: a time over the host's booking → the warning \"Overlaps Lee Sample 13:00–13:30\", nothing saved",
    first.status === 201 && clash.status === 409 && codes(clash).join() === "OVERLAP" && labels(clash).includes("Overlaps Lee Sample 13:00–13:30") && clash.body.warnings[0].bookingId === first.body.id && await countAt("2026-10-27 13:00") === 1, clash);
  const clashYes = await go("POST", "", P.CASE_OFFICER, body("2026-10-27 13:00", { bookAnyway: true, acceptedWarnings: ["OVERLAP"] }));
  const [r1, r2] = [await db.foBooking.findUniqueOrThrow({ where: { id: first.body.id } }), clashYes.body?.id ? await db.foBooking.findUniqueOrThrow({ where: { id: clashYes.body.id } }) : null];
  const a2 = clashYes.body?.id ? auditOf(clashYes.body.id, "booking.scheduled") : [];
  ok("FO-3sa DW2 pass: Book anyway keeps both bookings; the second's host row has overlapConfirmedByUserId = the Case Officer, and the audit shows it",
    clashYes.status === 201 && await countAt("2026-10-27 13:00") === 2 && r1.status === "SCHEDULED" && r1.overlapConfirmedByUserId === null && r2?.overlapConfirmedByUserId === P.CASE_OFFICER.id
      && a2.length === 1 && a2[0].detail?.overlapConfirmedByUserId === P.CASE_OFFICER.id && /with warnings: overlap/.test(a2[0].summary)
      && JSON.stringify(a2[0].detail?.overlapBookingIds) === JSON.stringify([first.body.id]) && !JSON.stringify(a2[0]).includes("Lee"), { clashYes, r2, a2 });
  let dbRefused = "";
  try { await db.foBooking.create({ data: { firmId: A.id, typeId: T.id, staffId: P.OWNER.id, mode: "VIDEO", startsAt: at("2026-10-27 13:10"), endsAt: at("2026-10-27 13:40"), bookerTimeZone: TZ } }); } catch (e) { dbRefused = String(e); }
  ok("FO-3sa DW2 fail: an unconfirmed overlapping row is still refused by the database (fo_booking_no_overlap)", /no_overlap|23P01|exclusion/.test(dbRefused), dbRefused.slice(0, 300));

  // ------------------------------------------------------------------------------------------------ DW5: public page
  const pub = await call(base, "GET", `/api/public/firms/${A.key}/book/any/slots?from=${encodeURIComponent(iso("2026-10-26 00:00"))}&to=${encodeURIComponent(iso("2026-11-03 00:00"))}&tz=${TZ}`);
  const offered = new Set<string>(Array.isArray(pub.body?.slots) ? pub.body.slots.map((s: { startsAt: string }) => s.startsAt) : []);
  ok("FO-3sa DW5 pass: the public slots answer still offers free times (Tue 27 Oct 09:00, Thu 29 Oct 13:00)", pub.status === 200 && offered.has(iso("2026-10-27 09:00")) && offered.has(iso("2026-10-29 13:00")), pub.body);
  ok("FO-3sa DW5 fail: it never offers the times staff booked anyway (closed Wed 10:00, Sun 11:00, the overlapped Tue 13:00), nor any Sunday or closed-day time",
    pub.status === 200 && ![iso("2026-10-28 10:00"), iso("2026-11-01 11:00"), iso("2026-10-27 13:00"), iso("2026-10-27 13:30")].some((t) => offered.has(t))
      && ![...offered].some((t) => t >= iso("2026-10-28 00:00") && t < iso("2026-10-29 00:00")) && ![...offered].some((t) => t >= iso("2026-11-01 00:00") && t < iso("2026-11-02 00:00")), [...offered].slice(0, 40));

  // ------------------------------------------------------------------------------------------------ DW6: host choice
  const chosen = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 09:00", { hostStaffId: P.OWNER.id }, T2.id));
  ok("FO-3sa DW6 pass: an active host of the type may be chosen (the pick rule would take the Admin first)", chosen.status === 201 && chosen.body.staffId === P.OWNER.id, chosen);
  await db.platformStaff.update({ where: { id: P.ADMIN.id }, data: { status: "DEACTIVATED" } });
  const gone = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 10:00", { hostStaffId: P.ADMIN.id }, T2.id));
  const goneAnyway = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 12:00", { hostStaffId: P.ADMIN.id, bookAnyway: true }, T2.id));
  ok("FO-3sa DW6 fail: a deactivated host → 422 with the field error \"hostStaffId: choose an active host\" (with Book anyway too), nothing saved",
    [gone, goneAnyway].every((r) => r.status === 422 && (r.body.issues ?? []).includes("hostStaffId: choose an active host")) && await countAt("2026-10-29 10:00") === 0 && await countAt("2026-11-01 12:00") === 0, [gone, goneAnyway]);
  const picked = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 12:00", { bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS"] }, T2.id));
  ok("FO-3sa DW6 pass: with no host chosen, Book anyway never takes the deactivated host (the pick rule skips it, AG-4-53)", picked.status === 201 && picked.body.staffId === P.OWNER.id, picked);
  const notHost = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 11:00", { hostStaffId: P.CASE_MANAGER.id }));
  ok("FO-3sa DW6 fail: an active staff member who is not a host of the type → 422 field error, nothing saved", notHost.status === 422 && (notHost.body.issues ?? []).includes("hostStaffId: not a host of this consultation") && await countAt("2026-10-29 11:00") === 0, notHost);

  // ------------------------------------------------------------------------------------------------- DW7: reschedule
  const mv = inHours.body.id as string;
  const mvNo = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-11-01 15:00") });
  ok("FO-3sa DW7 fail: a reschedule to Sunday 15:00 → the same warning, the booking unchanged",
    mvNo.status === 409 && codes(mvNo).join() === "OUTSIDE_HOURS" && (await db.foBooking.findUniqueOrThrow({ where: { id: mv } })).startsAt.toISOString() === iso("2026-10-27 10:00"), mvNo);
  const mvYes = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-11-01 15:00"), bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS"] });
  const a7 = auditOf(mv, "booking.rescheduled");
  ok("FO-3sa DW7 pass: with Book anyway it moves (RESCHEDULED, same host), and the audit keeps the reason",
    mvYes.status === 200 && mvYes.body.status === "RESCHEDULED" && mvYes.body.startsAt === iso("2026-11-01 15:00") && mvYes.body.staffId === P.OWNER.id && a7.length === 1 && JSON.stringify(a7[0].detail?.warnings) === '["OUTSIDE_HOURS"]', { mvYes, a7 });
  const ovNo = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-10-27 13:00") });
  const ovYes = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-10-27 13:00"), bookAnyway: true, acceptedWarnings: ["OVERLAP"] });
  ok("FO-3sa DW7 pass: a move over two bookings lists both overlaps; Book anyway moves it with the Case Manager as confirmer",
    ovNo.status === 409 && codes(ovNo).filter((c: string) => c === "OVERLAP").length === 2 && ovYes.status === 200 && (await db.foBooking.findUniqueOrThrow({ where: { id: mv } })).overlapConfirmedByUserId === P.CASE_MANAGER.id, { ovNo, ovYes });
  const back = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-10-30 10:00") });
  ok("FO-3sa DW7 fail: moved back to a free time, it needs no Book anyway and the confirmer is cleared (the no-overlap rule covers it again)",
    back.status === 200 && (await db.foBooking.findUniqueOrThrow({ where: { id: mv } })).overlapConfirmedByUserId === null && !("warnings" in (auditOf(mv, "booking.rescheduled").at(-1)?.detail ?? {})), back);
  const past = await go("POST", `/${mv}/reschedule`, P.CASE_MANAGER, { startsAt: iso("2026-10-26 07:00"), bookAnyway: true });
  ok("FO-3sa DW7 fail: a time that has passed is refused even with Book anyway", past.status === 422 && (past.body.issues ?? []).includes("startsAt: in the past"), past);

  // ----------------------------------------------------------------------------------------------- DW8: permissions
  await db.platformStaff.update({ where: { id: P.ADMIN.id }, data: { status: "ACTIVE" } });
  const deny = [await go("POST", "", P.BILLING_FINANCE, body("2026-11-01 16:00", { bookAnyway: true })), await go("POST", "", P.READ_ONLY, body("2026-11-01 16:00", { bookAnyway: true })),
    await go("POST", `/${mv}/reschedule`, P.BILLING_FINANCE, { startsAt: iso("2026-11-01 16:00"), bookAnyway: true }), await go("POST", `/${mv}/reschedule`, P.READ_ONLY, { startsAt: iso("2026-11-01 16:00"), bookAnyway: true })];
  ok("FO-3sa DW8 fail: BILLING_FINANCE and READ_ONLY with Book anyway still get 403 (create and reschedule), nothing saved or moved",
    deny.every((r) => r.status === 403 && r.body.code === "MISSING_PERMISSION") && await countAt("2026-11-01 16:00") === 0 && (await db.foBooking.findUniqueOrThrow({ where: { id: mv } })).startsAt.toISOString() === iso("2026-10-30 10:00"), deny.map((r) => [r.status, r.body?.code]));
  const bHost = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 16:00", { hostStaffId: B1.id, bookAnyway: true }));
  const bType = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 16:00", { bookAnyway: true }, TB.id));
  ok("FO-3sa DW8 fail: firm B's host id or type id → 404 (never named), nothing saved",
    bHost.status === 404 && bType.status === 404 && !JSON.stringify(bHost.body).includes(B1.id) && await db.foBooking.count({ where: { startsAt: at("2026-11-01 16:00") } }) === 0, [bHost, bType]);
  ok("FO-3sa DW8 pass: the four roles with the keys may book anyway (OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER)",
    (await Promise.all((["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER"] as const).map((r, i) => go("POST", "", P[r], body(`2026-11-01 ${String(16 + i).padStart(2, "0")}:00`, { bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS"] }))))).every((r) => r.status === 201));

  // ------------------------------------------- DW9: a public booking never lands on a confirmed overlap (Lead B, #1828)
  // Tue 27 Oct 13:00 holds the first booking and the confirmed one (DW2); the confirmed row is outside the database rule.
  const slots9 = await call(base, "GET", `/api/public/firms/${A.key}/book/any/slots?from=${encodeURIComponent(iso("2026-10-27 00:00"))}&to=${encodeURIComponent(iso("2026-10-28 00:00"))}&tz=${TZ}`);
  await clock.set(new Date(clock.now().getTime() + 5000));   // past the minimum fill time
  const pubBody = (when: string) => ({ givenNames: "Pat", familyName: "Sample", email: "pat@client.example", mode: "VIDEO", startsAt: iso(when), timeZone: TZ, consent: true, consentWordingId: slots9.body?.consent?.wordingId, formStamp: slots9.body?.formStamp });
  const forced = await call(base, "POST", `/api/public/firms/${A.key}/book/any/bookings`, undefined, pubBody("2026-10-27 13:00"));
  await db.foBooking.update({ where: { id: first.body.id }, data: { status: "CANCELLED" } });   // only the confirmed row is left at 13:00
  const forced2 = await call(base, "POST", `/api/public/firms/${A.key}/book/any/bookings`, undefined, pubBody("2026-10-27 13:00"));
  ok("FO-3sa DW9 fail: with a confirmed overlapping booking in place, a forced public post for that time loses under the host lock (409 SLOT_TAKEN), even once it is the only booking there, and sets no confirmer",
    slots9.status === 200 && !slots9.body.slots.some((x: { startsAt: string }) => x.startsAt === iso("2026-10-27 13:00")) && [forced, forced2].every((r) => r.status === 409 && r.body.code === "SLOT_TAKEN")
      && await countAt("2026-10-27 13:00") === 1 && await db.foBooking.count({ where: { firmId: A.id, overlapConfirmedByUserId: { not: null }, personId: { not: lee } } }) === 0, [slots9.status, forced, forced2]);
  const free9 = await call(base, "POST", `/api/public/firms/${A.key}/book/any/bookings`, undefined, { ...pubBody("2026-10-27 15:00"), formStamp: slots9.body?.formStamp });
  ok("FO-3sa DW9 pass: the same public form books a free time, with no confirmer", free9.status === 201 && (await db.foBooking.findFirstOrThrow({ where: { firmId: A.id, startsAt: at("2026-10-27 15:00") } })).overlapConfirmedByUserId === null, free9);

  // ------------------------------------------------------- DW10: two parallel Book-anyway posts both save (Lead B, #1828)
  const [p1, p2] = await Promise.all([go("POST", "", P.OWNER, body("2026-11-01 11:00", { bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS", "OVERLAP"] })), go("POST", "", P.CASE_OFFICER, body("2026-11-01 11:00", { bookAnyway: true, acceptedWarnings: ["OUTSIDE_HOURS", "OVERLAP"] }))]);
  const rows10 = await db.foBooking.findMany({ where: { id: { in: [p1.body?.id, p2.body?.id].filter(Boolean) } } });
  ok("FO-3sa DW10 pass: two parallel staff Book-anyway posts over the Sunday 11:00 booking both save, each with its own confirmer",
    p1.status === 201 && p2.status === 201 && await countAt("2026-11-01 11:00") === 3 && rows10.find((r) => r.id === p1.body.id)?.overlapConfirmedByUserId === P.OWNER.id && rows10.find((r) => r.id === p2.body.id)?.overlapConfirmedByUserId === P.CASE_OFFICER.id, [p1, p2]);
  const [q1, q2] = await Promise.all([go("POST", "", P.OWNER, body("2026-11-01 13:00")), go("POST", "", P.CASE_OFFICER, body("2026-11-01 13:00"))]);
  ok("FO-3sa DW10 fail: the same two posts without Book anyway both get the warning, and nothing is saved", q1.status === 409 && q2.status === 409 && await countAt("2026-11-01 13:00") === 0, [q1, q2]);

  // ------------------------------------------------ review M1: Book anyway covers only the warnings the person was shown
  const seen = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 14:00"));
  const owner14 = await go("POST", "", P.OWNER, body("2026-11-01 14:00", { bookAnyway: true, acceptedWarnings: codes(seen) }));
  const stale = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 14:00", { bookAnyway: true, acceptedWarnings: codes(seen) }));
  const bare = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 14:00", { bookAnyway: true }));
  ok("FO-3sa M1 fail: a warning that appeared after the person saw the dialog (the Owner booked the time meanwhile) is asked again, and Book anyway with no codes is asked again; nothing saved",
    seen.status === 409 && codes(seen).join() === "OUTSIDE_HOURS" && owner14.status === 201 && stale.status === 409 && codes(stale).includes("OVERLAP") && bare.status === 409 && await countAt("2026-11-01 14:00") === 1, [seen, owner14, stale, bare]);
  const fresh = await go("POST", "", P.CASE_OFFICER, body("2026-11-01 14:00", { bookAnyway: true, acceptedWarnings: codes(stale) }));
  ok("FO-3sa M1 pass: Book anyway on the new dialog's warnings saves, with the Case Officer as confirmer", fresh.status === 201 && (await db.foBooking.findUniqueOrThrow({ where: { id: fresh.body.id } })).overlapConfirmedByUserId === P.CASE_OFFICER.id, fresh);

  // ----------------------------------------------- review M2: a time between the page's starts, inside the hours, is taken
  const offGrid = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 14:15"));
  ok("FO-3sa M2 pass: Thu 14:15 (between the 30-minute starts, inside the host's hours, host free) saves at once, no warning (Rule 7: warn, never block)", offGrid.status === 201 && offGrid.body.startsAt === iso("2026-10-29 14:15"), offGrid);
  const offGrid2 = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 14:35"));
  ok("FO-3sa M2 fail: 14:35, over the 14:15 booking and its 10-minute gap, warns of the overlap and saves nothing", offGrid2.status === 409 && codes(offGrid2).join() === "OVERLAP" && await countAt("2026-10-29 14:35") === 0, offGrid2);

  // ----------------------------------------------- break F3/F4: names never reach the audit, so no limit there is met
  const longName = arrival.addPerson(A.id, { givenNames: "A".repeat(100), familyName: "pat@mail.example", email: "long@client.example" });
  const held = await go("POST", "", P.OWNER, { ...body("2026-10-30 14:00"), personId: longName });
  const over = await go("POST", "", P.CASE_OFFICER, body("2026-10-30 14:00", { bookAnyway: true, acceptedWarnings: ["OVERLAP"] }));
  const a3 = over.body?.id ? auditOf(over.body.id, "booking.scheduled") : [];
  ok("FO-3sa break F3/F4 pass: Book anyway over a booking for a 100-character, email-like name saves (no 500), and the audit line holds codes and ids, no name",
    held.status === 201 && over.status === 201 && a3.length === 1 && !JSON.stringify(a3[0]).includes("AAAA") && !JSON.stringify(a3[0]).includes("@"), { held: held.status, over, a3 });
  ok("FO-3sa break F3/F4 fail: the dialog itself still names the person it overlaps (shown to the staff member, never stored)", labels(await go("POST", "", P.CASE_OFFICER, body("2026-10-30 14:00"))).some((l: string) => l.includes("pat@mail.example")));

  // ------------------------------------------------------------------- Devin review (#1828): seconds, second host, case
  const late = await go("POST", "", P.CASE_OFFICER, { ...body("2026-10-29 16:30"), startsAt: new Date(at("2026-10-29 16:30").getTime() + 30_000).toISOString() });
  const early = await go("POST", "", P.CASE_OFFICER, { ...body("2026-10-29 16:29"), startsAt: new Date(at("2026-10-29 16:29").getTime() + 30_000).toISOString() });
  ok("FO-3sa Devin-1 fail: a 30-minute meeting at 16:30:30 ends 30 s after the 17:00 close → OUTSIDE_HOURS, nothing saved", late.status === 409 && codes(late).join() === "OUTSIDE_HOURS", late);
  ok("FO-3sa Devin-1 pass: 16:29:30 ends 16:59:30, inside the hours → saved as asked", early.status === 201 && early.body.startsAt === new Date(at("2026-10-29 16:29").getTime() + 30_000).toISOString(), early);
  const adminBusy = await go("POST", "", P.CASE_OFFICER, body("2026-10-30 11:00", { hostStaffId: P.ADMIN.id }, T2.id));
  const second = await go("POST", "", P.CASE_OFFICER, body("2026-10-30 11:15", {}, T2.id));
  const forcedAdmin = await go("POST", "", P.CASE_OFFICER, body("2026-10-30 11:15", { hostStaffId: P.ADMIN.id }, T2.id));
  ok("FO-3sa Devin-2 pass: Fri 11:15 (between starts) with no host chosen, the first host (Admin) busy and the second (Owner) free → saved with the Owner, no warning",
    adminBusy.status === 201 && adminBusy.body.staffId === P.ADMIN.id && second.status === 201 && second.body.staffId === P.OWNER.id, [adminBusy, second]);
  ok("FO-3sa Devin-2 fail: the same time with the busy Admin chosen → OVERLAP, nothing more saved", forcedAdmin.status === 409 && codes(forcedAdmin).join() === "OVERLAP" && await countAt("2026-10-30 11:15") === 1, forcedAdmin);
  const upper = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 15:00", { hostStaffId: P.OWNER.id.toUpperCase() }, T2.id));
  const upperNot = await go("POST", "", P.CASE_OFFICER, body("2026-10-29 15:30", { hostStaffId: P.CASE_MANAGER.id.toUpperCase() }, T2.id));
  ok("FO-3sa Devin-3 pass: an upper-case id of an active host is that host (stored in lower case)", upper.status === 201 && upper.body.staffId === P.OWNER.id, upper);
  ok("FO-3sa Devin-3 fail: an upper-case id of a non-host is still refused as not a host", upperNot.status === 422 && (upperNot.body.issues ?? []).includes("hostStaffId: not a host of this consultation"), upperNot);
} catch (e) {
  fail++; console.log(`FAIL  FO-3sa: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
