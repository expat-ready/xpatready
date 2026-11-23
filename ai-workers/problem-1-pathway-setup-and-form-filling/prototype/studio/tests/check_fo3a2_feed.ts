// FO-3a part 2b (AG-4-67 rules 1-5, its test 1 and its edge case; concept fo-3-booking §6, Q4, BR-14; brief
// lead-b-briefs/FO-3a2.md "Part 2b"): the staff read feed, over HTTP behind PF-4's guard with the local sign-in stand-in,
// on the roles PF-3 seeds (their keys are the migration's platform_role_permission rows). One named case per Done when
// line, a pass and a fail each: DW8 own only and all · DW9 Billing and finance (no list key) · DW10 60 bookings in one
// week, every field, 62 days, "feed" not taken by /:id · DW11 a host change. Plus the per-viewer answers the screen
// shows (canAnswerAttendance, canEdit, attendanceDue, outsideHours, hasConsultRecord). A scratch database with every
// migration; PF-0p's fake clock and port fakes; Sample rows written straight to the database. US$0. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo3a2_feed.ts
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
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { FIRM_DEFAULTS, fakeOfficeClock } from "../ports/offices.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3a2b_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
type Res = { status: number; body: any };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL_;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { BookingFeed, BookingFeedController } = await import("../api/src/front-office/booking/feed.ts");
const { seedFirmFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const feature = (await import("../api/src/features/front-office-booking.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const HOUR = 3_600_000, T0 = Date.parse("2027-01-11T14:00:00Z");   // Monday 11 Jan 2027, 09:00 Toronto (EST)
const clock = new FakeClock(new Date(T0 - 7 * 24 * HOUR));
const ports = { audit: fakeAudit() as never, clock, jobs: fakeJobs(clock), mail: fakeMail({ clock }), arrival: fakeArrival(), publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3a2b-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, BookingFeed, { provide: BOOKING_PORTS, useValue: ports }];
@Module({ controllers: [BookingFeedController, BookingStaffController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const ws = await platformAuditWorkspaceId(db as never);
  const firm = async (key: string) => {
    const id = sql(`insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), '${key}', 'Sample ${key}', 'CA', 'ACTIVE', '${key}@firm.example', now()) returning id`);
    await db.$transaction((tx) => seedFirmFrontOffice(tx, id));
    await writeSetting(db, { firmId: id, key: TIME_ZONE.key, value: "America/Toronto", by: "system:test", workspaceId: ws });
    return id;
  };
  const [A, B] = [await firm("fo3a2b-a"), await firm("fo3a2b-b")];
  let n = 0;
  const person = async (f: string, role: string) => {
    const id = sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${f}', 'fo3a2b.staff${++n}@example.com', 'Sample ${role.toLowerCase()} ${n}', now()) returning id`);
    await db.platformRoleGrant.create({ data: { firmId: f, staffId: id, role: role as never, grantedBy: "seed:fo3a2b" } });
    return { id, token: identity.issue(id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const [OWNER, CO, CO2, BILL, RO] = [await person(A, "OWNER"), await person(A, "CASE_OFFICER"), await person(A, "CASE_OFFICER"), await person(A, "BILLING_FINANCE"), await person(A, "READ_ONLY")];
  const BOWNER = await person(B, "OWNER");
  const client = (f: string, name: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${f}', '${name}', 'Sample', 'fo3a2b${++n}@example.com', 'test', now()) returning id`);
  const lead = (f: string, p: string, owner: string | null) => sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${f}', '${p}', 'MANUAL', 'WEBSITE', ${owner ? `'${owner}'` : "null"}, 'test', now()) returning id`);
  const types = new Map<string, string>();
  const typeOf = (f: string) => types.get(f) ?? (types.set(f, sql(`insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'free', 'Free consultation', '{VIDEO}', '{}', 30, now()) returning id`)), types.get(f)!);
  let slot = 0;
  const booking = (f: string, host: string, personId: string | null, at?: number) => {
    const s = new Date(at ?? T0 + slot++ * HOUR), e = new Date(s.getTime() + 30 * 60_000);
    sql(`update fo_consultation_type set host_staff_ids = array_append(host_staff_ids, '${host}'::uuid) where id = '${typeOf(f)}' and not ('${host}'::uuid = any(host_staff_ids))`);
    return sql(`insert into fo_booking (id, firm_id, type_id, staff_id, person_id, mode, starts_at, ends_at, visitor_time_zone, updated_at) values (gen_random_uuid(), '${f}', '${typeOf(f)}', '${host}', ${personId ? `'${personId}'` : "null"}, 'VIDEO', '${s.toISOString()}', '${e.toISOString()}', 'Asia/Dubai', now()) returning id`);
  };
  const setAll = (on: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: on, by: "system:test", workspaceId: ws });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const go = async (path: string, who?: { token: string }): Promise<Res> => {
    const r = await fetch(`${base}/api/front-office/bookings${path}`, { headers: who ? { authorization: `Bearer ${who.token}` } : {} });
    const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const week = `from=${encodeURIComponent(new Date(T0 - HOUR).toISOString())}&to=${encodeURIComponent(new Date(T0 + 30 * 24 * HOUR).toISOString())}`;
  const feed = (who: { token: string }, view: "mine" | "team") => go(`/feed?${week}&view=${view}`, who);
  const idsOf = (r: Res) => new Set<string>((r.body?.items ?? []).map((i: { id: string }) => i.id));

  // The colleague's lead (CO2 owns it), a booking on it hosted by the colleague; one hosted by CO on the same lead.
  const pLead = client(A, "Client P"); lead(A, pLead, CO2.id);
  const onColleagues = booking(A, CO2.id, pLead), coHosts = booking(A, CO.id, pLead);

  // ------------------------------------------------------------------------------------------- routes
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => /^Booking(Feed|Staff)Controller\./.test(r.name)).map((r) => `${r.method} ${r.path}`);
  const ctrls = feature.controllers as unknown[];
  ok("FO-3a2 DW10 pass: GET feed and GET feed/:id are declared (each with its access) before GET /:id, and the feature registers the feed's controller before the staff routes",
    routes.indexOf("GET /api/front-office/bookings/feed") >= 0 && routes.indexOf("GET /api/front-office/bookings/feed") < routes.indexOf("GET /api/front-office/bookings/:id")
      && routes.indexOf("GET /api/front-office/bookings/feed/:id") < routes.indexOf("GET /api/front-office/bookings/:id") && ctrls.indexOf(BookingFeedController) >= 0 && ctrls.indexOf(BookingFeedController) < ctrls.indexOf(BookingStaffController) && (feature.providers as unknown[]).includes(BookingFeed), routes);
  const noToken = await go(`/feed?${week}`);
  ok("FO-3a2 DW10 fail: the feed without a sign-in → 401; GET /feed is never read as a booking id (no 404 'booking')", noToken.status === 401 && (await feed(OWNER, "mine")).status === 200, noToken);

  // ------------------------------------------------------------------------------------------- DW8 (AG-4-67 test 1)
  await setAll(false);
  const coTeam = await feed(CO, "team");
  ok("FO-3a2 DW8 fail (AG-4-67 test 1): a Case Officer on own only (everyone sees all off) does not see the booking on a colleague's lead in view=team, nor by feed/:id (404)",
    coTeam.status === 200 && !idsOf(coTeam).has(onColleagues) && (await go(`/feed/${onColleagues}`, CO)).status === 404, { status: coTeam.status, ids: [...idsOf(coTeam)] });
  ok("FO-3a2 DW8 pass: the same Case Officer sees the one they host on that lead (team and by id)", idsOf(coTeam).has(coHosts) && (await go(`/feed/${coHosts}`, CO)).status === 200);
  await setAll(true);
  const coAll = await feed(CO, "team");
  ok("FO-3a2 DW8 pass: with everyone sees all on (the Case Officer holds view.all), every booking of the firm", idsOf(coAll).has(onColleagues) && idsOf(coAll).has(coHosts) && (await go(`/feed/${onColleagues}`, CO)).status === 200, [...idsOf(coAll)]);
  await setAll(false);

  // ------------------------------------------------------------------------------------------- DW9 (Q4)
  const billHosts = booking(A, BILL.id, client(A, "Client B"));
  const [bt, bm, b1, b2] = [await feed(BILL, "team"), await feed(BILL, "mine"), await go(`/feed/${billHosts}`, BILL), await go(`/feed/${onColleagues}`, BILL)];
  ok("FO-3a2 DW9 fail (Q4): Billing and finance (no agent/booking:list) gets 403 on view=team, naming the key, and 404 for another host's booking by id",
    bt.status === 403 && String(bt.body?.detail ?? "").includes("agent/booking:list") && b2.status === 404, { bt: bt.status, b2: b2.status });
  ok("FO-3a2 DW9 pass: their own hosted booking on view=mine (and only that) and by feed/:id", bm.status === 200 && idsOf(bm).size === 1 && idsOf(bm).has(billHosts) && b1.status === 200 && b1.body.id === billHosts, { bm: [...idsOf(bm)], b1: b1.status });

  // ------------------------------------------------------------------------------------------- DW10 (60 a week, fields, 62 days)
  const pMany = client(A, "Client M"); lead(A, pMany, OWNER.id);
  const hosts = [OWNER.id, CO.id, CO2.id, RO.id];
  const monday = T0 + 7 * 24 * HOUR;
  for (let i = 0; i < 60; i++) booking(A, hosts[i % 4], pMany, monday + Math.floor(i / 4) * HOUR);   // 15 hours x 4 hosts, one week
  const weekQ = `from=${encodeURIComponent(new Date(monday).toISOString())}&to=${encodeURIComponent(new Date(monday + 7 * 24 * HOUR).toISOString())}`;
  await setAll(true);
  const big = await go(`/feed?${weekQ}&view=team`, OWNER);
  await setAll(false);
  const it = big.body?.items?.[0] ?? {};
  const FIELDS = ["id", "status", "mode", "startsAt", "endsAt", "officeTimeZone", "bookerTimeZone", "type", "host", "person", "hangsOn", "outsideHours", "attendance", "hasConsultRecord", "cancelledBy", "selfServiceLimitHours", "insideSelfServiceLimit", "canAnswerAttendance", "canEdit", "attendanceDue"];
  ok("FO-3a2 DW10 pass: 60 bookings in one week come back in one answer, each with every field (times in UTC, the office zone named, person name and email, type, host, the lead it hangs on)",
    big.status === 200 && big.body.items.length === 60 && big.body.items.every((x: Record<string, unknown>) => FIELDS.every((k) => k in x)) && it.officeTimeZone === "America/Toronto" && big.body.officeTimeZone === "America/Toronto"
      && /Z$/.test(it.startsAt) && it.person?.name === "Client M Sample" && /@example\.com$/.test(it.person?.email) && it.type?.name === "Free consultation" && it.host?.name?.startsWith("Sample") && it.hangsOn?.kind === "lead" && /^L-/.test(it.hangsOn?.name), { status: big.status, n: big.body?.items?.length, it });
  const far = `from=${encodeURIComponent(new Date(T0).toISOString())}&to=${encodeURIComponent(new Date(T0 + 63 * 24 * HOUR).toISOString())}`;
  const [r63, rBack, rBad] = [await go(`/feed?${far}`, OWNER), await go(`/feed?from=${encodeURIComponent(new Date(T0).toISOString())}&to=${encodeURIComponent(new Date(T0 - HOUR).toISOString())}`, OWNER), await go(`/feed?${week}&view=everyone`, OWNER)];
  ok("FO-3a2 DW10 fail: a range over 62 days → 422 with the limit; to before from → 422; an unknown view → 422", r63.status === 422 && String(r63.body?.detail).includes("62 days") && rBack.status === 422 && rBad.status === 422, [r63.status, rBack.status, rBad.status]);

  // ------------------------------------------------------------------------------------------- DW11 (edge case: host changed)
  const pOther = client(A, "Client O"); lead(A, pOther, CO2.id);
  const moved = booking(A, CO.id, pOther), stays = booking(A, CO2.id, pOther);
  const before = idsOf(await feed(CO, "mine")).has(moved);
  sql(`update fo_booking set staff_id = '${CO2.id}', status = 'RESCHEDULED', sequence = sequence + 1 where id = '${moved}'`);
  const [afterMine, afterTeam, afterId] = [await feed(CO, "mine"), await feed(CO, "team"), await go(`/feed/${moved}`, CO)];
  ok("FO-3a2 DW11 fail (edge case): after the host changes, the old host (no record rule) no longer sees it in mine, team or by id", before && !idsOf(afterMine).has(moved) && !idsOf(afterTeam).has(moved) && afterId.status === 404, { before, id: afterId.status });
  sql(`update fo_booking set staff_id = '${CO.id}', status = 'RESCHEDULED', sequence = sequence + 1 where id = '${stays}'`);
  ok("FO-3a2 DW11 pass: an old host whose record rule allows it (the lead's owner) still sees theirs in view=team and by id, and the new host in mine",
    idsOf(await feed(CO2, "team")).has(stays) && (await go(`/feed/${stays}`, CO2)).status === 200 && idsOf(await feed(CO, "mine")).has(stays));

  // ------------------------------------------------------------------------------------------- the server's per-viewer answers
  const ended = booking(A, CO.id, pLead, T0 - 3 * HOUR);   // ended 2.5 h before T0
  await setAll(true);   // the Owner and Read-only below see the firm's bookings (view.all with everyone sees all)
  clock.set(new Date(T0 - 3 * HOUR + 30 * 60_000 + 29 * 60_000));   // end + 29 min
  const at29 = (await go(`/feed/${ended}`, CO)).body;
  clock.set(new Date(T0 - 3 * HOUR + 30 * 60_000 + 30 * 60_000));   // end + 30 min
  const [at30, ownerView] = [(await go(`/feed/${ended}`, CO)).body, (await go(`/feed/${ended}`, OWNER)).body];
  ok("FO-3a2 BR-14 pass: the host's own booking is due at the end + 30 min (attendanceDue), and the host may answer it", at30.attendanceDue === true && at30.canAnswerAttendance === true, at30);
  ok("FO-3a2 BR-14 fail: at the end + 29 min it is not due yet; for an Owner (not the host) it is never pinned, though the Owner may answer it (edit key)", at29.attendanceDue === false && ownerView.attendanceDue === false && ownerView.canAnswerAttendance === true, { at29: at29.attendanceDue, owner: ownerView });
  const roEnded = (await go(`/feed/${ended}`, RO)).body;
  ok("FO-3a2 BR-14 fail (review M2): Read-only (no edit key, not the host) sees the ended booking but may not answer its attendance", roEnded.id === ended && roEnded.canAnswerAttendance === false, roEnded);
  clock.set(new Date(T0 - 3 * HOUR + 10 * 60_000));   // ten minutes into the meeting
  const during = (await go(`/feed/${ended}`, CO)).body;
  ok("FO-3a2 BR-14 fail (review M1; AG-4-39 rule 7): while the meeting runs, nobody is asked yet, not even the host", during.canAnswerAttendance === false && during.attendanceDue === false, during);
  clock.set(new Date(T0 - 3 * HOUR + 30 * 60_000 + 30 * 60_000));
  sql(`update fo_booking set status = 'CANCELLED' where id = '${ended}'`);
  await db.auditEvent.create({ data: { workspaceId: ws, firmId: A, actor: `staff:${OWNER.id}`, action: "booking.cancelled", entity: "fo_booking", entityKey: ended, summary: "Booking cancelled.", detail: {} } });
  const cancelled = (await go(`/feed/${ended}`, CO)).body;
  const ownerName = sql(`select display_name from platform_staff where id = '${OWNER.id}'`);
  ok("FO-3a2 cancelledBy pass (concept §5 \"Cancelled by <who>.\"): a booking a staff member cancelled names them", cancelled.cancelledBy === ownerName, cancelled.cancelledBy);
  const byBooker = booking(A, CO2.id, pLead);
  sql(`update fo_booking set status = 'CANCELLED' where id = '${byBooker}'`);
  await db.auditEvent.create({ data: { workspaceId: ws, firmId: A, actor: "system:booking-link", action: "booking.cancelled", entity: "fo_booking", entityKey: byBooker, summary: "Booking cancelled.", detail: {} } });
  const [bb, live] = [(await go(`/feed/${byBooker}`, OWNER)).body, (await go(`/feed/${coHosts}`, OWNER)).body];
  ok("FO-3a2 cancelledBy fail: one cancelled by the booker's link says \"the booker\"; a booking not cancelled names nobody", bb.cancelledBy === "the booker" && live.cancelledBy === null, { bb: bb.cancelledBy, live: live.cancelledBy });
  ok("FO-3a2 BR-14 fail: a cancelled booking is never due, never answerable, never editable", cancelled.attendanceDue === false && cancelled.canAnswerAttendance === false && cancelled.canEdit === false, cancelled);
  const future = (await go(`/feed/${coHosts}`, CO)).body, futureRO = (await go(`/feed/${coHosts}`, RO)).body;
  ok("FO-3a2 canEdit pass/fail: a Case Officer (edit key) may move or cancel a booking they see; Read-only (no edit key) may not; nobody answers attendance before the end",
    future.canEdit === true && futureRO.canEdit === false && future.canAnswerAttendance === false, { future, futureRO });
  const anyway = booking(A, OWNER.id, pLead);
  await db.auditEvent.create({ data: { workspaceId: ws, firmId: A, actor: `staff:${OWNER.id}`, action: "booking.scheduled", entity: "fo_booking", entityKey: anyway, summary: "Consultation booked (Free consultation), booked anyway: outside hours.", detail: { bookedAnyway: true, warnings: ["OUTSIDE_HOURS"] } } });
  const [wOut, wIn] = [(await go(`/feed/${anyway}`, OWNER)).body, (await go(`/feed/${coHosts}`, OWNER)).body];
  ok("FO-3a2 outsideHours pass/fail: a booking saved over FO-3sa's OUTSIDE_HOURS warning says so; one saved without it does not", wOut.outsideHours === true && wIn.outsideHours === false, { wOut: wOut.outsideHours, wIn: wIn.outsideHours });
  await db.auditEvent.create({ data: { workspaceId: ws, firmId: A, actor: `staff:${OWNER.id}`, action: "booking.rescheduled", entity: "fo_booking", entityKey: anyway, at: new Date(Date.now() + 60_000), summary: "Moved into hours.", detail: {} } });
  const moved2 = (await go(`/feed/${anyway}`, OWNER)).body;
  ok("FO-3a2 outsideHours fail (review m1): moved later to a time with no warning, the latest line wins: no longer outside hours", moved2.outsideHours === false, moved2.outsideHours);
  // The self-service limit (the type's 240 minutes, 4 hours) for the reschedule dialog's sentence.
  const startsIn = Date.parse(live.startsAt) - (T0 - 3 * HOUR + 60 * 60_000);
  clock.set(new Date(Date.parse(live.startsAt) - 5 * HOUR));
  const early = (await go(`/feed/${coHosts}`, OWNER)).body;
  clock.set(new Date(T0 - 3 * HOUR + 60 * 60_000));
  ok("FO-3a2 limit pass/fail: the item names the 4-hour limit; 3 h before the start it is inside it, 5 h before it is not",
    live.selfServiceLimitHours === 4 && startsIn === 3 * HOUR && live.insideSelfServiceLimit === true && early.insideSelfServiceLimit === false, { hours: live.selfServiceLimitHours, inside: live.insideSelfServiceLimit, early: early.insideSelfServiceLimit, startsIn });

  await setAll(false);
  // Break F3: what a booking hangs on is named only to a viewer who may open it (AG-2-64): the Case Officer hosts a
  // booking on the colleague's lead and sees the booking, but not the lead's number; the lead's owner does.
  const [coView, co2View] = [(await go(`/feed/${coHosts}`, CO)).body, (await go(`/feed/${coHosts}`, CO2)).body];
  ok("FO-3a2 hangsOn fail/pass (break F3): the host who may not open the colleague's lead gets no lead named; the lead's owner gets it", coView.id === coHosts && coView.hangsOn === null && co2View.hangsOn?.kind === "lead", { co: coView.hangsOn, co2: co2View.hangsOn });
  const y0 = await go(`/feed?from=0000-01-01T00:00:00Z&to=0000-01-05T00:00:00Z`, OWNER);
  ok("FO-3a2 DW10 fail (break F1): a year outside 2000-2099 is refused with 422, never a 500", y0.status === 422, y0.status);

  // PF-18a (on main since this row was briefed): a booking's office zone is its host's office's; the firm's for a host
  // with none. The feed reads the booking ports' OfficeClockPort at call time, so the fake is put in here.
  const offices = fakeOfficeClock();
  offices.setFirm(A, { ...FIRM_DEFAULTS, zone: "America/Toronto" });
  offices.assign(A, CO.id, offices.addOffice(A, { ...FIRM_DEFAULTS, zone: "America/Vancouver" }));
  (ports as { offices?: unknown }).offices = offices;
  const [inVan, inFirm, coFeed] = [(await go(`/feed/${coHosts}`, CO)).body, (await go(`/feed/${onColleagues}`, CO2)).body, await feed(CO, "mine")];
  delete (ports as { offices?: unknown }).offices;
  ok("FO-3a2 PF-18a pass/fail: a booking hosted from the Vancouver office says America/Vancouver (and the feed's own zone is the viewer's office); a host with no office keeps the firm's America/Toronto",
    inVan.officeTimeZone === "America/Vancouver" && coFeed.body.officeTimeZone === "America/Vancouver" && inFirm.officeTimeZone === "America/Toronto", { van: inVan.officeTimeZone, feed: coFeed.body?.officeTimeZone, firm: inFirm.officeTimeZone });

  // ------------------------------------------------------------------------------------------- firm walls
  const inB = booking(B, BOWNER.id, client(B, "Client Z"));
  const [bFeed, aReadsB] = [await feed(BOWNER, "team"), await go(`/feed/${inB}`, OWNER)];
  ok("FO-3a2 walls pass/fail: firm B's owner sees only firm B's booking; firm A's owner reading it by id → 404", bFeed.status === 200 && idsOf(bFeed).size === 1 && idsOf(bFeed).has(inB) && aReadsB.status === 404, { b: [...idsOf(bFeed)], a: aReadsB.status });
} catch (e) {
  fail++; console.log(`FAIL  FO-3a2 feed: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\nFO-3a2 feed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
