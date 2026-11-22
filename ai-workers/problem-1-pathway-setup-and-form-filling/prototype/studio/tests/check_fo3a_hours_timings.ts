// FO-3a part 1b-i (brief lead-b-briefs/FO-3a.md "Part 1b", split by its P-610 line; AG-4-62 rules 1-8, §7, §8): hour
// sets, a type's set per host and time off, over HTTP behind PF-4's guard on PF-3's six roles: DW12..DW18, the hours half
// of DW20, the audit and migration half of DW21, a pass and a fail each. FO-3a1e (part 1b-ii, "Firm timings"; AG-4-4,
// AG-4-5, AG-4-66): DW19 and the timings halves of DW20 and DW21 (the firm's six values, a type's own, resolveTimings,
// the NULL-as-firm migration on a copy of main's schema, its rollback). A scratch database (and copies of main's schema
// migrated up), one small Nest app, the real audit adapter, PF-0p's fakes. US$0. Dropped.
//   tsx studio/tests/check_fo3a_hours_timings.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3a1b_${process.pid}`, OLD = `xr_studio_fo3a1b_old_${process.pid}`, OLD2 = `xr_studio_fo3a1e_old_${process.pid}`;
const urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`, URL = urlOf(DB);
const TZ = "America/Toronto", THIS = "20261119031000_fo3a_hour_sets", TIMINGS_MIG = "20261121110000_fo3a1e_firm_timings";

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
const migrations = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
const migrate = (d: string, list: string[]) => { for (const m of list) execFileSync(bin("psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, m, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] }); };
const psql = (d: string, q: string) => execFileSync(bin("psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (d: string, q: string, re: RegExp) => { try { psql(d, q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

for (const d of [DB, OLD, OLD2]) { execFileSync(bin("dropdb"), [...PG, "--if-exists", d]); execFileSync(bin("createdb"), [...PG, d]); }
migrate(DB, migrations);
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS, BookingPublicController } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { BookingTypes, BookingTypesController } = await import("../api/src/front-office/booking/settings/types.controller.ts");
const { Availability, AvailabilityController } = await import("../api/src/front-office/booking/settings/availability.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
const { FirmTimings, TimingsController } = await import("../api/src/front-office/booking/settings/timings.controller.ts");
const { DEFAULT_TIMINGS, resolveTimings, timingKey } = await import("../api/src/front-office/booking/settings/timings.ts");
const feature = (await import("../api/src/features/front-office-booking-settings.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const at = (s: string, zone = TZ) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, zone)!; };
const iso = (s: string, zone = TZ) => at(s, zone).toISOString();

const clock = new FakeClock(at("2026-10-19 08:00"));   // Monday 19 Oct 2026, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock);
const ports = { audit: auditEvent as never, clock, jobs, mail: fakeMail({ clock }), arrival, publicBaseUrl: "http://localhost:4432", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3a1b-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }, BookingTypes, Availability, FirmTimings];
@Module({ controllers: [BookingTypesController, AvailabilityController, TimingsController, BookingStaffController, BookingPublicController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3a1b-a"), await firm("fo3a1b-b")];
  const ws = await db.workspace.create({ data: { key: "fo3a1b-check", label: "FO-3a 1b check" } });
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3a1b" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  const NEW1 = await person(A.id, "new-one", "CASE_OFFICER"), NEW2 = await person(A.id, "new-two", "CASE_OFFICER");
  const BO = await person(B.id, "b-owner", "OWNER");
  await copyFirmHoursTo(db, A.id, [P.OWNER.id, P.ADMIN.id]);
  const pid = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const F = (method: string, path: string, who: { token: string } = P.OWNER, b?: unknown) => call(base, method, `/api/front-office/${path}`, who.token, b);
  const pub = (method: string, path: string) => call(base, method, `/api/public${path}`);
  const makeType = async (name: string, hosts: string[]) => { const r = await F("POST", "booking-types", P.OWNER, { name, minutes: 30, modes: ["VIDEO"], hostStaffIds: hosts }); if (r.status !== 201) throw new Error(`type: ${JSON.stringify(r)}`); return r.body as { id: string; slug: string }; };
  /** The public page's start times for a type between two Toronto wall times. */
  const slots = async (slug: string, from: string, to: string): Promise<string[]> => {
    const r = await pub("GET", `/firms/fo3a1b-a/book/${slug}/slots?from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`);
    if (r.status !== 200) throw new Error(`slots: ${JSON.stringify(r)}`);
    return (r.body.slots as { startsAt: string }[]).map((s) => s.startsAt);
  };
  const has = (list: string[], when: string, zone = TZ) => list.includes(iso(when, zone));
  const mySets = async (who = P.OWNER) => (await F("GET", "me/availability-sets", who)).body.sets as { id: string; name: string; isDefault: boolean; timeZone: string; version: number; windows: { weekday: number; start: string; end: string }[] }[];
  const patchSet = async (id: string, who: { id: string; token: string }, b: Record<string, unknown>) => F("PATCH", `me/availability-sets/${id}`, who, { version: (await mySets(who)).find((x) => x.id === id)?.version ?? 1, ...b });
  const MON_FRI = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "17:00" }));
  const bookingRows = () => psql(DB, "select string_agg(id || '|' || starts_at || '|' || ends_at || '|' || status || '|' || staff_id || '|' || sequence, ',' order by id) from fo_booking");
  ok("FO-3a 1b routes: the feature file lists the hours controller and its service beside the booking types'",
    (feature.controllers as unknown[]).includes(AvailabilityController) && (feature.providers as unknown[]).includes(Availability) && (feature.controllers as unknown[]).includes(BookingTypesController));

  const T1 = await makeType("Free consultation", [P.OWNER.id]);

  // -------------------------------------------------------------------------- DW12: hours and their words (tests 1, 4)
  const own = (await mySets())[0];
  const monThu = await patchSet(own.id, P.OWNER, { windows: [1, 2, 3, 4].map((weekday) => ({ weekday, start: "09:00", end: "16:00" })) });
  const week = await slots(T1.slug, "2026-10-19 00:00", "2026-10-24 00:00");
  ok("FO-3a DW12 pass: hours Mon-Thu 09:00-16:00 save and give no Friday slot (Thu 15:30 offered, Thu 16:00 not)",
    monThu.status === 200 && has(week, "2026-10-22 15:30") && !has(week, "2026-10-22 16:00") && !week.some((s) => s >= iso("2026-10-23 00:00")), [monThu.status, week.slice(-3)]);
  const before12 = JSON.stringify(await mySets());
  const backwards = await patchSet(own.id, P.OWNER, { windows: [{ weekday: 1, start: "14:00", end: "13:00" }] });
  const overlap = await patchSet(own.id, P.OWNER, { windows: [{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "11:00", end: "13:00" }] });
  ok("FO-3a DW12 fail: a window 14:00-13:00 → 422 \"End must be after start.\" on its field; two overlapping windows on one day → 422 \"These hours overlap.\"; nothing saved",
    backwards.status === 422 && backwards.body.fields?.["windows.0.end"] === "End must be after start." && overlap.status === 422 && overlap.body.fields?.["windows.1"] === "These hours overlap."
    && JSON.stringify(await mySets()) === before12, [backwards.body, overlap.body]);
  await patchSet(own.id, P.OWNER, { windows: MON_FRI });
  const stale = await F("PATCH", `me/availability-sets/${own.id}`, P.OWNER, { version: 1, windows: [] });
  ok("FO-3a 1b-i (review M2) fail: a save with an old version → 409 \"Someone else changed these hours. Reload to see their changes.\", nothing changed",
    stale.status === 409 && stale.body.detail === "Someone else changed these hours. Reload to see their changes." && (await mySets()).find((x) => x.id === own.id)?.windows.length === 5, stale.body);

  // ------------------------------------------------------------------------------ DW13: the first set (rule 1, test 3)
  const first = await mySets(NEW1);
  ok("FO-3a DW13 pass: a new staff member's first read gives one set \"Normal hours\", Mon-Fri 09:00-17:00, default, in the firm's zone",
    first.length === 1 && first[0].name === "Normal hours" && first[0].isDefault && first[0].timeZone === TZ && JSON.stringify(first[0].windows) === JSON.stringify(MON_FRI), first);
  const race = await Promise.all([1, 2, 3].map(() => F("GET", "me/availability-sets", NEW2)));
  const del = await F("DELETE", `me/availability-sets/${first[0].id}`, NEW1);
  ok("FO-3a DW13 fail: three first reads at once make one set; the only (default) set cannot be deleted (409 \"You cannot delete your default set.\")",
    race.every((r) => r.status === 200) && psql(DB, `select count(*) from fo_availability_set where staff_id = '${NEW2.id}'`) === "1" && del.status === 409 && del.body.detail === "You cannot delete your default set."
    && (await mySets(NEW1)).length === 1, [del.status, del.body]);

  // ------------------------------------------------------------------- DW14: a type's set per host (rule 1b, the test)
  const evening = await F("POST", "me/availability-sets", P.OWNER, { name: "Evening calls", windows: [{ weekday: 2, start: "18:00", end: "20:00" }] });
  const T2 = await makeType("Overseas client call", [P.OWNER.id]);
  const chose = await F("PUT", `booking-types/${T2.id}/hosts/${P.OWNER.id}/set`, P.OWNER, { setId: evening.body.id });
  const s2 = await slots(T2.slug, "2026-10-19 00:00", "2026-10-24 00:00"), s1 = await slots(T1.slug, "2026-10-19 00:00", "2026-10-24 00:00");
  ok("FO-3a DW14 pass: the type naming \"Evening calls\" offers only Tue 18:00-20:00; a type naming none offers the default set's times",
    evening.status === 201 && chose.status === 200 && JSON.stringify(s2) === JSON.stringify(["18:00", "18:30", "19:00", "19:30"].map((t) => iso(`2026-10-20 ${t}`)))
    && has(s1, "2026-10-20 09:00") && !has(s1, "2026-10-20 18:00"), [chose.body, s2]);
  const copy = await F("POST", `booking-types/${T2.id}/duplicate`, P.OWNER);
  const sCopy = await slots(copy.body.slug, "2026-10-19 00:00", "2026-10-24 00:00");
  const pv = await F("GET", `booking-types/${T2.id}/preview?from=${encodeURIComponent(iso("2026-10-19 00:00"))}&to=${encodeURIComponent(iso("2026-10-24 00:00"))}`, P.OWNER);
  const warn = await F("POST", "bookings", P.OWNER, { typeId: T2.id, personId: pid, mode: "VIDEO", startsAt: iso("2026-10-20 09:00"), timeZone: TZ });
  ok("FO-3a DW14 pass (review M1, m4): a duplicate keeps the host's set (same 4 times); the preview and staff warnings read the type's set (only Tuesday has times; Tue 09:00 → OUTSIDE_HOURS)",
    copy.status === 201 && JSON.stringify(sCopy) === JSON.stringify(s2) && pv.status === 200 && pv.body.days.filter((d: { slots: unknown[] }) => d.slots.length).map((d: { date: string }) => d.date).join() === "2026-10-20"
    && warn.status === 409 && JSON.stringify(warn.body).includes("OUTSIDE_HOURS"), [copy.status, sCopy.length, warn.status]);
  const readBack = async () => (await F("GET", `booking-types/${T2.id}`, P.CASE_MANAGER)).body.hostSets;
  const [chosenRead, cleared, clearedRead] = [await readBack(), await F("PUT", `booking-types/${T2.id}/hosts/${P.OWNER.id}/set`, P.OWNER, { setId: null }), await readBack()];
  await F("PUT", `booking-types/${T2.id}/hosts/${P.OWNER.id}/set`, P.OWNER, { setId: evening.body.id });
  ok("FO-3a DW14 pass (Devin, #2103): the type's read names each host's chosen set; cleared, it reads null (the default)", JSON.stringify(chosenRead) === JSON.stringify([{ staffId: P.OWNER.id, setId: evening.body.id }]) && cleared.body.usesDefault === true && JSON.stringify(clearedRead) === JSON.stringify([{ staffId: P.OWNER.id, setId: null }]), [chosenRead, clearedRead]);
  const notTheirs = await F("PUT", `booking-types/${T2.id}/hosts/${P.OWNER.id}/set`, P.OWNER, { setId: first[0].id });
  const notHost = await F("PUT", `booking-types/${T2.id}/hosts/${NEW1.id}/set`, P.OWNER, { setId: first[0].id });
  const gone = await F("DELETE", `me/availability-sets/${evening.body.id}`, P.OWNER);
  const s2b = await slots(T2.slug, "2026-10-19 00:00", "2026-10-24 00:00");
  ok("FO-3a DW14 fail: another person's set → 422, a person who is not a host → 422; deleting the named set falls back to the default (Tue 09:00 again, no 18:00)",
    notTheirs.status === 422 && notTheirs.body.fields?.setId && notHost.status === 422 && notHost.body.fields?.staffId && gone.status === 200 && gone.body.typesBackOnDefault === 2
    && has(s2b, "2026-10-20 09:00") && !has(s2b, "2026-10-20 18:00") && psql(DB, `select count(*) from fo_type_host_set where type_id = '${T2.id}'`) === "0", [notTheirs.status, notHost.status, gone.body]);

  // ---------------------------------------------------------------------------------- DW15: a set's zone (rule 4, Delhi)
  const delhi = await F("POST", "me/availability-sets", P.ADMIN, { name: "Delhi hours", timeZone: "Asia/Kolkata", windows: MON_FRI });
  const T3 = await makeType("India clients", [P.ADMIN.id]);
  await F("PUT", `booking-types/${T3.id}/hosts/${P.ADMIN.id}/set`, P.OWNER, { setId: delhi.body.id });
  const s3 = await slots(T3.slug, "2026-10-19 00:00", "2026-10-24 00:00");
  const plain = await F("POST", "me/availability-sets", P.ADMIN, { name: "Spare" });
  ok("FO-3a DW15 pass: \"Delhi hours\" Mon-Fri 09:00-17:00 in Asia/Kolkata gives a first slot at 03:30Z on Tue 20 Oct; a set made without a zone takes the firm's",
    delhi.status === 201 && s3[0] === "2026-10-20T03:30:00.000Z" && plain.status === 201 && plain.body.timeZone === TZ, [s3[0], plain.body]);
  const mars = await F("POST", "me/availability-sets", P.ADMIN, { name: "Mars", timeZone: "Mars/Base" });
  const lower = await F("POST", "me/availability-sets", P.ADMIN, { name: "Lower", timeZone: "asia/kolkata" });
  ok("FO-3a DW15 fail: an unknown zone or one in the wrong capitals → 422 on timeZone, no set made",
    mars.status === 422 && mars.body.fields?.timeZone && lower.status === 422 && psql(DB, `select count(*) from fo_availability_set where staff_id = '${P.ADMIN.id}'`) === "3", [mars.body, lower.status]);

  // --------------------------------------------------------------------- DW16: a Saturday outside business hours (rule 1c)
  const cm = (await mySets(P.CASE_MANAGER))[0];
  await patchSet(cm.id, P.CASE_MANAGER, { windows: [...MON_FRI, { weekday: 6, start: "10:00", end: "12:00" }] });
  const T4 = await makeType("Weekend call", [P.CASE_MANAGER.id]);
  const s4 = await slots(T4.slug, "2026-10-24 00:00", "2026-10-25 00:00");
  ok("FO-3a DW16 pass: Saturday 10:00-12:00 in a set is offered although business hours are Mon-Fri", JSON.stringify(s4) === JSON.stringify(["10:00", "10:30", "11:00", "11:30"].map((t) => iso(`2026-10-24 ${t}`))), s4);
  await writeSetting(db, { firmId: A.id, key: CLOSED_DAYS.key, value: ["2026-10-24"], by: "seed:fo3a1b", workspaceId: ws.id });
  const s4b = await slots(T4.slug, "2026-10-24 00:00", "2026-10-25 00:00");
  ok("FO-3a DW16 fail: a closed day still blocks the Saturday", s4b.length === 0, s4b);
  await writeSetting(db, { firmId: A.id, key: CLOSED_DAYS.key, value: [], by: "seed:fo3a1b", workspaceId: ws.id });

  // ------------------------------------------------------------------------- DW17, DW18: time off (rules 5, 7, 8; tests 5, 10)
  const booked = await F("POST", "bookings", P.OWNER, { typeId: T4.id, personId: pid, mode: "VIDEO", startsAt: iso("2026-10-22 10:00"), timeZone: TZ });
  const rows0 = bookingRows();
  const off = await F("POST", "me/time-off", P.OWNER, { startsAt: iso("2026-10-23 12:00"), endsAt: iso("2026-10-23 17:00") });
  const fri = (await slots(T1.slug, "2026-10-23 00:00", "2026-10-24 00:00"));
  const theirs = await F("POST", `staff/${P.CASE_MANAGER.id}/time-off`, P.ADMIN, { startsAt: iso("2026-10-22 09:00"), endsAt: iso("2026-10-22 12:00") });
  ok("FO-3a DW17 pass: time off Fri 12:00-17:00 keeps the morning and drops the afternoon; an Admin enters a colleague's time off over a booked morning (201) and the booking stays",
    booked.status === 201 && off.status === 201 && has(fri, "2026-10-23 11:30") && !fri.some((s) => s >= iso("2026-10-23 12:00")) && theirs.status === 201
    && (await F("GET", `staff/${P.CASE_MANAGER.id}/time-off`, P.ADMIN)).body.timeOff.length === 1 && bookingRows() === rows0
    && ((t) => !t.some((x) => x < iso("2026-10-22 12:00")) && has(t, "2026-10-22 12:00"))(await slots(T4.slug, "2026-10-22 00:00", "2026-10-23 00:00")), [booked.status, off.status, theirs.status, fri.slice(-2)]);
  const officer = await F("POST", `staff/${P.CASE_MANAGER.id}/time-off`, P.CASE_OFFICER, { startsAt: iso("2026-10-21 09:00"), endsAt: iso("2026-10-21 12:00") });
  const backOff = await F("POST", "me/time-off", P.OWNER, { startsAt: iso("2026-10-23 12:00"), endsAt: iso("2026-10-23 11:00") });
  const otherFirm = await F("POST", `staff/${P.CASE_MANAGER.id}/time-off`, BO, { startsAt: iso("2026-10-21 09:00"), endsAt: iso("2026-10-21 12:00") });
  ok("FO-3a DW17 fail: a Case Officer entering a colleague's time off → 403; an end before the start → 422 \"End must be after start.\"; another firm's owner → 404; nothing saved",
    officer.status === 403 && backOff.status === 422 && backOff.body.fields?.endsAt === "End must be after start." && otherFirm.status === 404
    && psql(DB, `select count(*) from fo_time_off where firm_id = '${A.id}'`) === "2", [officer.status, backOff.body, otherFirm.status]);
  // DW18: hours, a type's set and time off changed above and here; every booking row is as it was.
  await patchSet(cm.id, P.CASE_MANAGER, { windows: [{ weekday: 1, start: "13:00", end: "14:00" }] });
  const cmEve = await F("POST", "me/availability-sets", P.CASE_MANAGER, { name: "Late", windows: [{ weekday: 3, start: "19:00", end: "20:00" }] });
  await F("PUT", `booking-types/${T4.id}/hosts/${P.CASE_MANAGER.id}/set`, P.OWNER, { setId: cmEve.body.id });
  await F("DELETE", `staff/${P.CASE_MANAGER.id}/time-off/${theirs.body.id}`, P.ADMIN);
  ok("FO-3a DW18 pass: changing hours, a type's set and adding or removing time off never changes a booking's time or status (every booking row compared)", bookingRows() === rows0 && rows0.length > 0, [rows0, bookingRows()]);
  const s4c = await slots(T4.slug, "2026-10-22 00:00", "2026-10-23 00:00");
  ok("FO-3a DW18 fail: the booked Thursday 10:00 is now outside the host's hours, so the page offers nothing that day, yet the booking is kept SCHEDULED",
    s4c.length === 0 && psql(DB, `select status from fo_booking where id = '${booked.body.id ?? booked.body.booking?.id}'`) === "SCHEDULED", [s4c, booked.body]);

  // ------------------------------------------------------------------------------- DW20 (hours half): who may change what
  const offSelf = await patchSet((await mySets(P.CASE_OFFICER))[0].id, P.CASE_OFFICER, { windows: MON_FRI.slice(0, 3) });
  const roRead = await F("GET", "me/time-off", P.READ_ONLY), coSet = (await mySets(P.CASE_OFFICER))[0];
  const adminEdit = await F("PATCH", `staff/${P.CASE_OFFICER.id}/availability-sets/${coSet.id}`, P.ADMIN, { version: coSet.version, windows: MON_FRI });
  ok("FO-3a DW20 pass: a Case Officer edits their own hours and an Admin a colleague's (200); a Read-only person reads their own time off (200); an Owner reads a colleague's sets (200)",
    offSelf.status === 200 && roRead.status === 200 && adminEdit.status === 200 && (await F("GET", `staff/${P.CASE_OFFICER.id}/availability-sets`, P.OWNER)).status === 200, [offSelf.status, roRead.status]);
  const coOther = await F("PATCH", `staff/${P.OWNER.id}/availability-sets/${own.id}`, P.CASE_OFFICER, { windows: [] });
  const cmType = await F("PUT", `booking-types/${T1.id}/hosts/${P.OWNER.id}/set`, P.CASE_MANAGER, { setId: null });
  const bOther = await F("GET", `staff/${P.OWNER.id}/availability-sets`, BO);
  const crossSet = await patchSet(own.id, P.CASE_OFFICER, { name: "Mine now" });
  const noSign = await call(base, "GET", "/api/front-office/me/availability-sets");
  ok("FO-3a DW20 fail: a Case Officer editing a colleague's hours → 403, a Case Manager choosing a type's set → 403, firm B's owner on firm A's staff → 404, another person's set id by me → 404, no sign-in → 401",
    coOther.status === 403 && cmType.status === 403 && bOther.status === 404 && crossSet.status === 404 && noSign.status === 401 && (await mySets()).find((s) => s.id === own.id)?.windows.length === 5,
    [coOther.status, cmType.status, bOther.status, crossSet.status, noSign.status]);

  // ------------------------------------------------------------------------------------- DW21 (hours half): the audit
  const lines = psql(DB, `select string_agg(action, ',' order by at, id) from audit_event where action like 'availability.%' or action like 'time_off.%'`);
  const changed = psql(DB, `select detail->>'targetStaffId' || '|' || (detail->'windows_before')::text || '|' || (detail->'windows_after')::text from audit_event where action = 'availability.changed' and detail->>'targetStaffId' = '${P.OWNER.id}' order by at limit 1`);
  ok("FO-3a DW21 pass: every change wrote one audit line (\"availability changed\" with the person and the windows before and after; time off added and removed)",
    /availability\.changed/.test(lines) && /availability\.set_created/.test(lines) && /availability\.set_deleted/.test(lines) && /availability\.type_set_changed/.test(lines) && /time_off\.added/.test(lines) && /time_off\.removed/.test(lines)
    && changed.startsWith(`${P.OWNER.id}|["1 09:00-17:00"`) && changed.includes(`["1 09:00-16:00"`), [lines, changed]);
  const auditRefused = (lines.match(/,/g) ?? []).length + 1;
  ok("FO-3a DW21 fail: a refused change (the 422s, 403s, 404s and 409 above) wrote no line: exactly the successful changes are there (19)", auditRefused === 19, [auditRefused, lines]);

  // ==================================================================== FO-3a1e (part 1b-ii): the firm's booking timings
  const CONF = "agent/booking-event-type:configure-availability", EDITK = "agent/booking-event-type:edit";
  ok("FO-3a1e routes: the feature file lists the timings controller and its service",
    (feature.controllers as unknown[]).includes(TimingsController) && (feature.providers as unknown[]).includes(FirmTimings));
  ok("FO-3a1e resolveTimings (AG-4-66 rule 2): the type's value, else the firm's, else the default; §8's key per field",
    JSON.stringify(resolveTimings({ minNoticeMinutes: 1440, windowDays: null }, { minNoticeMinutes: 120, windowDays: 30 })) === JSON.stringify({ gapBeforeMinutes: 0, gapAfterMinutes: 10, minNoticeMinutes: 1440, windowDays: 30, selfServiceLimitMinutes: 240 })
    && resolveTimings({ gapAfterMinutes: 0 }).gapAfterMinutes === 0 && resolveTimings({}, {}).minNoticeMinutes === 240
    && ["gapBeforeMinutes", "gapAfterMinutes", "minNoticeMinutes", "windowDays"].every((f) => timingKey(f as never) === CONF) && timingKey("selfServiceLimitMinutes") === EDITK && timingKey("reminderOffsetsMinutes") === EDITK);

  // --------------------------------------------------------------------------------- DW19 (AG-4-4/-5/-66 tests 1-3, §10)
  const SIX = { reminderOffsetsMinutes: [1440, 60], minNoticeMinutes: 240, windowDays: 60, gapBeforeMinutes: 0, gapAfterMinutes: 10, selfServiceLimitMinutes: 240 };
  const fresh = await F("GET", "booking-timings", BO), cmRead = await F("GET", "booking-timings", P.CASE_MANAGER);
  ok("FO-3a DW19 pass: a new firm's timings answer shows reminders 24 h and 1 h, notice 4 h, window 60 days, gaps 0/10, self-service 4 h (and the same defaults); a Case Manager reads them",
    fresh.status === 200 && JSON.stringify(fresh.body.timings) === JSON.stringify(SIX) && JSON.stringify(fresh.body.defaults) === JSON.stringify(SIX) && JSON.stringify(DEFAULT_TIMINGS) === JSON.stringify(SIX)
    && cmRead.status === 200 && JSON.stringify(cmRead.body.timings) === JSON.stringify(SIX), [fresh.body, cmRead.status]);
  const T5 = await makeType("Strategy session", [P.OWNER.id]);
  const v5 = async () => (await F("GET", `booking-types/${T5.id}`, P.OWNER)).body as { version: number; timings: Record<string, number | null>; effectiveTimings: Record<string, number> };
  const firstOf = async (slug: string) => (await slots(slug, "2026-10-19 00:00", "2026-10-21 00:00"))[0];
  const nullType = await v5();
  const notice24 = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: nullType.version, minNoticeMinutes: 1440 });
  const [first5, first1] = [await firstOf(T5.slug), await firstOf(T1.slug)];
  ok("FO-3a DW19 pass: a new type uses the firm's values (all five empty); with notice 24 h its first slot is Tue 09:00 (24 h after Mon 08:00 lands Tue 08:00) while another type keeps 4 h (Mon 12:00)",
    Object.values(nullType.timings).every((v) => v === null) && nullType.effectiveTimings.minNoticeMinutes === 240 && notice24.status === 200 && notice24.body.timings.minNoticeMinutes === 1440
    && notice24.body.effectiveTimings.minNoticeMinutes === 1440 && first5 === iso("2026-10-20 09:00") && first1 === iso("2026-10-19 12:00"), [nullType, notice24.body, first5, first1]);
  const firmNotice = await F("PUT", "booking-timings", P.ADMIN, { minNoticeMinutes: 120 });
  const [first5b, first1b] = [await firstOf(T5.slug), await firstOf(T1.slug)];
  const reset = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: null });
  const first5c = await firstOf(T5.slug);
  ok("FO-3a DW19 pass: the firm's notice 2 h moves the type that uses it (Mon 10:00) and not the one with its own (still Tue 09:00); \"Reset to firm default\" (null) uses the firm value again (Mon 10:00)",
    firmNotice.status === 200 && firmNotice.body.timings.minNoticeMinutes === 120 && first1b === iso("2026-10-19 10:00") && first5b === iso("2026-10-20 09:00")
    && reset.status === 200 && reset.body.timings.minNoticeMinutes === null && reset.body.effectiveTimings.minNoticeMinutes === 120 && first5c === iso("2026-10-19 10:00"), [firmNotice.body, first1b, first5b, reset.body, first5c]);
  await F("PUT", "booking-timings", P.ADMIN, { minNoticeMinutes: 240 });
  const auditBefore19 = psql(DB, "select count(*) from audit_event");
  const firmBefore19 = JSON.stringify((await F("GET", "booking-timings", P.OWNER)).body.timings), typeBefore19 = JSON.stringify((await v5()).timings);
  const neg = await F("PUT", "booking-timings", P.ADMIN, { gapAfterMinutes: -1, minNoticeMinutes: 60 });
  const frac = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: 1.5 });
  const big = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, windowDays: 0 });
  const rem = await F("PUT", "booking-timings", P.ADMIN, { reminderOffsetsMinutes: [60, 60] });
  const third = await F("PUT", "booking-timings", P.ADMIN, { reminderOffsetsMinutes: [1440, 60, 10] });
  const unknown = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, holdMinutes: 30 });
  const staleT = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: 1, gapAfterMinutes: 5 });
  ok("FO-3a DW19 fail: a negative or non-whole value → 422 with the allowed range on its field; window 0, a repeated or third reminder, a field not a timing → 422; an old version → 409; nothing saved, no audit line",
    neg.status === 422 && neg.body.fields?.gapAfterMinutes === "Gap after must be a whole number of minutes from 0 to 1,440." && frac.status === 422 && frac.body.fields?.minNoticeMinutes === "Shortest notice must be a whole number of minutes from 0 to 525,600."
    && big.status === 422 && big.body.fields?.windowDays === "Booking window must be a whole number of days from 1 to 730." && rem.status === 422 && third.status === 422 && /one or two different times/.test(third.body.fields?.reminderOffsetsMinutes ?? "")
    && unknown.status === 422 && staleT.status === 409 && staleT.body.code === "STALE_VERSION"
    && JSON.stringify((await F("GET", "booking-timings", P.OWNER)).body.timings) === firmBefore19 && JSON.stringify((await v5()).timings) === typeBefore19 && psql(DB, "select count(*) from audit_event") === auditBefore19,
    [neg.body, frac.body, big.body, rem.status, third.body, unknown.status, staleT.status]);
  const warnT = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: 525600, windowDays: 30 });
  ok("FO-3a DW19 (§12): a notice longer than the window saves with a warning and offers no times", warnT.status === 200 && warnT.body.warnings?.length === 1 && (await slots(T5.slug, "2026-10-19 00:00", "2026-11-15 00:00")).length === 0, warnT.body);
  await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: null, windowDays: null });

  // Gaps: the slots and the database pad by the same resolved value (AG-4-4 rules 2, 4).
  await F("PUT", "booking-timings", P.ADMIN, { gapAfterMinutes: 30 });
  const g1 = await F("POST", "bookings", P.OWNER, { typeId: T5.id, personId: pid, mode: "VIDEO", startsAt: iso("2026-10-21 09:00"), timeZone: TZ });
  const g1id = g1.body.id ?? g1.body.booking?.id;
  const wed = await slots(T5.slug, "2026-10-21 00:00", "2026-10-22 00:00");
  const pad = psql(DB, `select (extract(epoch from upper(block_range) - ends_at) / 60)::int from fo_booking where id = '${g1id}'`);
  ok("FO-3a DW19 pass (gaps): with the firm's gap after 30, a 09:00-09:30 booking blocks to 10:00 in the database and on the page (09:30 not offered, 10:00 offered)",
    g1.status === 201 && pad === "30" && !has(wed, "2026-10-21 09:30") && has(wed, "2026-10-21 10:00"), [g1.status, pad, wed.slice(0, 3)]);
  await F("PUT", "booking-timings", P.ADMIN, { gapAfterMinutes: 10 });
  ok("FO-3a DW19 (rule 8): a later change of the firm's gap leaves the booking's padding as written (still 30)", psql(DB, `select (extract(epoch from upper(block_range) - ends_at) / 60)::int from fo_booking where id = '${g1id}'`) === "30");

  // ---------------------------------------------------------------------------------------- DW20 (timings half, §8)
  const cmGap = await F("PATCH", `booking-types/${T5.id}/timings`, P.CASE_MANAGER, { version: (await v5()).version, gapAfterMinutes: 0 });
  const cmFirm = await F("PUT", "booking-timings", P.CASE_MANAGER, { gapBeforeMinutes: 5 });
  const coSelf = await F("PATCH", `booking-types/${T5.id}/timings`, P.CASE_OFFICER, { version: (await v5()).version, selfServiceLimitMinutes: 60 });
  const cmResolved = await F("PATCH", `booking-types/${T5.id}/timings`, P.CASE_MANAGER, { version: (await v5()).version, gapAfterMinutes: 10, minNoticeMinutes: null });   // Lead B (P-423 read, point 4)
  const billing = await F("GET", "booking-timings", P.BILLING_FINANCE), otherT = await F("PATCH", `booking-types/${T5.id}/timings`, BO, { version: 1, gapAfterMinutes: 0 });
  ok("FO-3a DW20 fail: a Case Manager changing a type's gaps or the firm's → 403 MISSING_PERMISSION; sending the resolved value (10) for an empty gap is a change (an override) → 403, while an empty field sent empty is none; a Case Officer changing the self-service limit → 403; Billing/Finance reading → 403; another firm's owner → 404",
    cmGap.status === 403 && cmGap.body.code === "MISSING_PERMISSION" && cmResolved.status === 403 && /configure-availability/.test(cmResolved.body.detail ?? "") && cmFirm.status === 403 && cmFirm.body.code === "MISSING_PERMISSION" && coSelf.status === 403 && billing.status === 403 && otherT.status === 404
    && (await v5()).timings.gapAfterMinutes === null, [cmGap.status, cmFirm.status, coSelf.status, billing.status, otherT.status]);
  const adGap = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, gapAfterMinutes: 0, selfServiceLimitMinutes: 60 });
  const ownFirm = await F("PUT", "booking-timings", P.OWNER, { reminderOffsetsMinutes: [2880, 120], selfServiceLimitMinutes: 480 });
  const cmSame = await F("PUT", "booking-timings", P.CASE_MANAGER, { gapAfterMinutes: 10 });
  ok("FO-3a DW20 pass: an Admin changes a type's gap and self-service limit (200); the Owner changes the firm's reminders and self-service limit (200); a Case Manager sending a value unchanged is no change (200)",
    adGap.status === 200 && adGap.body.timings.gapAfterMinutes === 0 && adGap.body.effectiveTimings.selfServiceLimitMinutes === 60 && ownFirm.status === 200
    && JSON.stringify(ownFirm.body.timings.reminderOffsetsMinutes) === "[2880,120]" && ownFirm.body.timings.selfServiceLimitMinutes === 480 && cmSame.status === 200, [adGap.body, ownFirm.body, cmSame.status]);

  // ----------------------------------------------------------------------------- DW21 (timings half): the audit lines
  const typeLine = psql(DB, `select actor || '|' || (detail->'fields')::text || '|' || concat_ws(',', detail->>'gapAfterMinutes_before', detail->>'selfServiceLimitMinutes_before') || '|' || concat_ws(',', detail->>'gapAfterMinutes_after', detail->>'selfServiceLimitMinutes_after') from audit_event where action = 'booking_type.timings_changed' and entity_key = '${T5.id}' order by at desc, id desc limit 1`);
  const firmLine = psql(DB, `select actor || '|' || summary || '|' || (detail->>'from') || '|' || (detail->>'to') from audit_event where action = 'platform.setting.change' and detail->>'key' = 'front_office.booking_self_service_minutes' and firm_id = '${A.id}' order by at desc, id desc limit 1`);
  ok("FO-3a DW21 pass: a type's timings change writes \"timings changed\" with the actor and the fields before and after; a firm timing change writes the settings line (actor, \"booking timings changed\", from and to)",
    typeLine === `staff:${P.ADMIN.id}|["gapAfterMinutes", "selfServiceLimitMinutes"]||0,60`
    && /setting front_office\.booking_self_service_minutes changed \(booking timings changed\)/.test(firmLine) && firmLine.startsWith(`staff:${P.OWNER.id}|`) && firmLine.endsWith("|240|480"), [typeLine, firmLine]);
  ok("FO-3a DW21 fail: the refused timing changes above (403s, 404) wrote no line: two type timings lines for the Admin's last change and none for the Case Manager or Officer",
    psql(DB, `select count(*) from audit_event where action in ('booking_type.timings_changed', 'platform.setting.change') and actor in ('staff:${P.CASE_MANAGER.id}', 'staff:${P.CASE_OFFICER.id}', 'staff:${BO.id}')`) === "0");

  // Review and break minors: a key named like an Object member is a 422, never a 500; the §12 warning on the firm's
  // answer names a type its values leave with no times, and the type's own read carries its warning.
  const proto = await F("PUT", "booking-timings", P.ADMIN, { constructor: 1 }), protoT = await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, toString: 1 });
  const protoC = await F("POST", "booking-types", P.OWNER, { name: "Proto", minutes: 30, modes: ["VIDEO"], valueOf: 1 });
  ok("FO-3a1e fail (break m1): a body key such as constructor, toString or valueOf → 422 on that field, nothing saved",
    proto.status === 422 && proto.body.fields?.constructor === "Not a booking timing." && protoT.status === 422 && protoC.status === 422, [proto.status, protoT.status, protoC.status]);
  await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: 2880 });
  const narrow = await F("PUT", "booking-timings", P.ADMIN, { windowDays: 1 }), t5w = await v5() as unknown as { warnings: string[] };
  await F("PUT", "booking-timings", P.ADMIN, { windowDays: 60 });
  await F("PATCH", `booking-types/${T5.id}/timings`, P.ADMIN, { version: (await v5()).version, minNoticeMinutes: null });
  ok("FO-3a1e (review m2, §12): the firm's window of 1 day with a type's own notice of 2 days saves with a warning naming the type; the type's read warns too",
    narrow.status === 200 && narrow.body.warnings.length === 1 && narrow.body.warnings[0].includes("Strategy session") && t5w.warnings?.length === 1
    && (await F("GET", "booking-timings", P.OWNER)).body.warnings.length === 0, [narrow.body.warnings, t5w.warnings]);

  // -------------------------------------------------------------------- DW21 (migration half): a copy of main's schema
  migrate(OLD, migrations.filter((m) => m < THIS));
  const of = psql(OLD, "insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), 'old-firm', 'Sample Old', 'CA', 'ACTIVE', 'old@firm.example', now()) returning id").split("\n")[0];
  const os = (n: string) => psql(OLD, `insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${of}', '${n}@old.example', 'Old ${n}', now()) returning id`).split("\n")[0];
  const [o1, o2] = [os("one"), os("two")];
  psql(OLD, `insert into fo_availability (id, firm_id, staff_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', 1, 540, 1020, 'America/Toronto'), (gen_random_uuid(), '${of}', '${o1}', 2, 540, 1020, 'America/Toronto'), (gen_random_uuid(), '${of}', '${o2}', 3, 600, 660, 'Asia/Kolkata')`);
  let up = ""; try { migrate(OLD, [THIS]); up = "ok"; } catch (e) { up = String((e as { stderr?: Buffer }).stderr ?? e); }
  const sets = psql(OLD, `select string_agg(s.staff_id || ':' || s.name || ':' || s.is_default || ':' || s.time_zone || ':' || (select count(*) from fo_availability a where a.set_id = s.id), ',' order by s.staff_id = '${o1}' desc) from fo_availability_set s`);
  ok("FO-3a DW21 pass: the migration runs on a copy of main's schema with hours in it; each person gets one default \"Normal hours\" set in their own zone holding all their windows",
    up === "ok" && sets === `${o1}:Normal hours:true:America/Toronto:2,${o2}:Normal hours:true:Asia/Kolkata:1` && psql(OLD, "select count(*) from fo_availability where set_id is null") === "0", [up, sets]);
  psql(OLD, `insert into fo_availability (id, firm_id, staff_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', 4, 540, 600, 'America/Toronto')`);
  const o1Default = psql(OLD, `select id from fo_availability_set where staff_id = '${o1}'`);
  const other = psql(OLD, `insert into fo_availability_set (firm_id, staff_id, name, time_zone) values ('${of}', '${o1}', 'Evening', 'America/Toronto') returning id`).split("\n")[0];
  ok("FO-3a DW21 pass: a window written without a set lands in the default set; another set may cover the same hours",
    psql(OLD, `select count(*) from fo_availability where set_id = '${o1Default}'`) === "3"
    && psql(OLD, `insert into fo_availability (id, firm_id, staff_id, set_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', '${other}', 1, 600, 700, 'America/Toronto') returning 1`).startsWith("1"));
  ok("FO-3a DW21 fail: the database refuses a second default, two overlapping windows in one set, a window in another person's set, a second zone in one set and a zone not in IANA's capitals",
    refused(OLD, `insert into fo_availability_set (firm_id, staff_id, name, is_default, time_zone) values ('${of}', '${o1}', 'Two', true, 'UTC')`, /fo_availability_set_one_default/)
    && refused(OLD, `insert into fo_availability (id, firm_id, staff_id, set_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', '${o1Default}', 1, 600, 700, 'America/Toronto')`, /fo_availability_no_overlap/)
    && refused(OLD, `insert into fo_availability (id, firm_id, staff_id, set_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o2}', '${o1Default}', 5, 600, 700, 'America/Toronto')`, /fo_availability_firm_id_staff_id_set_id_fkey/)
    && refused(OLD, `insert into fo_availability (id, firm_id, staff_id, set_id, weekday, start_minute, end_minute, time_zone) values (gen_random_uuid(), '${of}', '${o1}', '${o1Default}', 6, 600, 700, 'Asia/Kolkata')`, /fo_availability_one_zone/)
    && refused(OLD, `insert into fo_availability_set (firm_id, staff_id, name, time_zone) values ('${of}', '${o2}', 'Bad', 'asia/kolkata')`, /not an IANA time zone/));
  ok("FO-3a DW21: both new tables are walled (forced row-level security with the firm policy) and their trigger functions run as the wall reader",
    psql(DB, "select string_agg(relname || ':' || relforcerowsecurity, ',' order by relname) from pg_class where relname in ('fo_availability_set', 'fo_type_host_set')") === "fo_availability_set:true,fo_type_host_set:true"
    && psql(DB, "select count(*) from pg_policy where polname = 'pf12_firm' and polrelid in ('fo_availability_set'::regclass, 'fo_type_host_set'::regclass)") === "2"
    && psql(DB, "select string_agg(pg_get_userbyid(proowner) || ':' || prosecdef, ',') from pg_proc where proname like 'fo\\_booking\\_set\\_%'") === "xr_wall_reader:true,xr_wall_reader:true,xr_wall_reader:true");

  // ------------------------------------------------------------- DW21 (timings migration): a copy of main's schema
  migrate(OLD2, migrations.filter((m) => m < TIMINGS_MIG));
  const f2 = psql(OLD2, "insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), 'old2-firm', 'Sample Old', 'CA', 'ACTIVE', 'old2@firm.example', now()) returning id").split("\n")[0];
  const h2 = psql(OLD2, `insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${f2}', 'h@old2.example', 'Old host', now()) returning id`).split("\n")[0];
  const typ = (slug: string, extra = "", vals = "") => psql(OLD2, `insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at${extra}) values (gen_random_uuid(), '${f2}', '${slug}', 'Sample ${slug}', '{VIDEO}', '{${h2}}', 30, now()${vals}) returning id`).split("\n")[0];
  const [dflt, ownT] = [typ("plain"), typ("own", ", min_notice_minutes, gap_after_minutes", ", 1440, 5")];
  const book = (t: string, day: number) => psql(OLD2, `insert into fo_booking (id, firm_id, type_id, staff_id, mode, starts_at, ends_at, visitor_time_zone, updated_at) values (gen_random_uuid(), '${f2}', '${t}', '${h2}', 'VIDEO', now() + interval '${day} days', now() + interval '${day} days 30 minutes', 'America/Toronto', now()) returning id`).split("\n")[0];
  const old1 = book(dflt, 2), range = (id: string) => psql(OLD2, `select block_range::text from fo_booking where id = '${id}'`), range0 = range(old1);
  const timingsOf = (id: string) => psql(OLD2, `select concat_ws(',', coalesce(gap_before_minutes::text, '-'), coalesce(gap_after_minutes::text, '-'), coalesce(min_notice_minutes::text, '-'), coalesce(window_days::text, '-'), coalesce(self_service_limit_minutes::text, '-')) from fo_consultation_type where id = '${id}'`);
  let up2 = ""; try { migrate(OLD2, [TIMINGS_MIG]); up2 = "ok"; } catch (e) { up2 = String((e as { stderr?: Buffer }).stderr ?? e); }
  const padOf = (id: string) => psql(OLD2, `select (extract(epoch from lower(block_range) - starts_at) / 60)::int || '/' || (extract(epoch from upper(block_range) - ends_at) / 60)::int from fo_booking where id = '${id}'`);
  const new1 = book(dflt, 3), new2 = book(ownT, 4);
  ok("FO-3a DW21 pass (migration): on a copy of main's schema, a type at today's defaults becomes all-empty, a type's own values stay (notice 1440, gap after 5), a booking's padding is unchanged, and new bookings pad 0/10 (firm default) and 0/5 (own)",
    up2 === "ok" && timingsOf(dflt) === "-,-,-,-,-" && timingsOf(ownT) === "-,5,1440,-,-" && range(old1) === range0 && padOf(new1) === "0/10" && padOf(new2) === "0/5", [up2, timingsOf(dflt), timingsOf(ownT), padOf(new1), padOf(new2)]);
  psql(OLD2, `insert into platform_setting_definition (key, owner_module, description, value_schema, default_value, change_permission, updated_at) values ('front_office.booking_gap_after_minutes', 'front-office', 'check', '{}', '10', '${CONF}', now()) on conflict do nothing`);
  psql(OLD2, `insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${f2}', 'front_office.booking_gap_after_minutes', '25', 'seed:fo3a1e')`);
  const new3 = book(dflt, 5);
  ok("FO-3a DW21 pass (migration): the database pads by the firm's value when the type's is empty (25), and the columns are nullable with no default; fo_booking_write runs as the wall reader",
    padOf(new3) === "0/25" && padOf(new2) === "0/5"
    && psql(OLD2, "select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, '-'), ',' order by column_name) from information_schema.columns where table_name = 'fo_consultation_type' and column_name in ('gap_before_minutes', 'gap_after_minutes', 'min_notice_minutes', 'window_days', 'self_service_limit_minutes')")
      === "gap_after_minutes:YES:-,gap_before_minutes:YES:-,min_notice_minutes:YES:-,self_service_limit_minutes:YES:-,window_days:YES:-"
    && psql(OLD2, "select pg_get_userbyid(proowner) || ':' || prosecdef || ':' || coalesce(proconfig::text, '') from pg_proc where proname = 'fo_booking_write'") === "xr_wall_reader:true:{\"search_path=pg_catalog, public, pg_temp\"}", [padOf(new3)]);
  psql(OLD2, `update platform_firm_setting set value = '"abc"' where firm_id = '${f2}' and key = 'front_office.booking_gap_after_minutes'`);
  const new5 = book(dflt, 7);
  const odd = ["10.5", "-600", "1e10"].map((v, i) => { psql(OLD2, `update platform_firm_setting set value = '${v}' where firm_id = '${f2}' and key = 'front_office.booking_gap_after_minutes'`); return padOf(book(dflt, 8 + i)); });
  ok("FO-3a1e (break m5): a stored firm value that is not a whole number in range (\"abc\", 10.5, -600, 1e10) never breaks a booking write; the database reads it as unset (default 10)",
    padOf(new5) === "0/10" && odd.every((x) => x === "0/10"), [padOf(new5), odd]);
  psql(OLD2, `update platform_firm_setting set value = '25' where firm_id = '${f2}' and key = 'front_office.booking_gap_after_minutes'`);
  ok("FO-3a DW21 fail (migration): a negative type timing is still refused by FO-1b's checks", refused(OLD2, `update fo_consultation_type set gap_after_minutes = -1 where id = '${dflt}'`, /fo_consultation_type_gaps_check/));
  psql(OLD2, `create table if not exists "_prisma_migrations" (migration_name text)`);
  let down = ""; try { execFileSync(bin("psql"), [urlOf(OLD2), "-v", "ON_ERROR_STOP=1", "-1", "-q", "-f", join(MIG, TIMINGS_MIG, "rollback.sql")], { stdio: ["ignore", "ignore", "pipe"] }); down = "ok"; } catch (e) { down = String((e as { stderr?: Buffer }).stderr ?? e); }
  const new4 = book(dflt, 6);
  ok("FO-3a1e rollback.sql: every empty timing is filled with what the type used (the firm's gap after 25, else the defaults), the columns are NOT NULL with their defaults again, and the trigger pads by the type (25)",
    down === "ok" && timingsOf(dflt) === "0,25,240,60,240" && timingsOf(ownT) === "0,5,1440,60,240" && padOf(new4) === "0/25"
    && psql(OLD2, "select count(*) from information_schema.columns where table_name = 'fo_consultation_type' and column_name like any (array['gap_%', 'min_notice%', 'window_days', 'self_service%']) and is_nullable = 'NO'") === "5", [down, timingsOf(dflt), timingsOf(ownT), padOf(new4)]);
} finally {
  await app?.close();
  await db.$disconnect();
  for (const d of [DB, OLD, OLD2]) { try { execFileSync(bin("dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
