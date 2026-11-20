// CS-DL1 (map row 74; QA-471; briefs design/briefs/CS-DL1.md and build-lead-c-briefs/CS-DL1a.md): deadlines and the
// firm's open days. Part 1: the one open-day function (api/src/platform/calendar/working-days.ts, moved from PF-21's
// complaints/business-days.ts) and the deadline view (api/src/case-stages.ts showDeadline). AG-7-94@2b63ee12: a
// government or legal date is a calendar date that business hours and closed days never move (r1, r2), shown with its
// weekday and marked "(weekend)" or "(closed day)" (r3); a reminder "N working days before" is counted back over open days,
// never later than the computed day nor after the date (r5, r6); an open day is a weekday in business hours not on the
// closed-days list (r4). AG-7-96@894c1c8b r2: a deadline is the anchor plus N calendar days. Each named case has a pass and
// a fail. Part 1: pure functions and the fake clock (P-607). Part 2 (CS-DL1b; DW7-DW11 and W1 here, the browser suite's
// DW7-DW9 are part 1's): reminders as JobPort jobs on a scratch database it drops at the end (see its section). No server,
// no model call (US$0). Every stage deadline is Sample (P-412 F13 (b)); the dates are AG-7-94's own test dates or test
// data, no immigration value.
//   tsx studio/tests/check_csdl1_deadlines.ts
import { businessClose, businessDaysBetween, BusinessDayTally, calendarDate, countBack, dayMark, isOpenDay, localDate, NO_SUCH_DATE, zonedInstant, type FirmCalendar } from "../api/src/platform/calendar/working-days.ts";
import * as complaintDays from "../api/src/platform/complaints/business-days.ts";
import * as calendarModule from "../api/src/platform/calendar/working-days.ts";
import { withFirm } from "../api/src/platform/firm-scope.ts";
import { deadlineDay, showDeadline } from "../api/src/case-stages.ts";
import { deadlineOf, type KeyDetailDef } from "../engine/runtime/stages.ts";
import { FakeClock } from "../ports/clock.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const WEEK: FirmCalendar["hours"] = ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, opens: "09:00", closes: "17:00" }));
const cal = (closedDays: string[] = [], hours = WEEK, zone = "America/Toronto"): FirmCalendar => ({ zone, hours, closedDays });
const refused = (fn: () => unknown, words = NO_SUCH_DATE) => { try { fn(); return false; } catch (e) { return e instanceof RangeError && e.message === words; } };

// ---------------------------------------------------------------- DW1 count back over a weekend (AG-7-94 test 1)
ok("CS-DL1 DW1 pass: expiry Sun 7 Mar 2027, \"2 working days before\" → Thu 4 Mar 2027 (Fri 5 is day 1, Thu 4 is day 2)", countBack("2027-03-07", 2, cal()) === "2027-03-04", countBack("2027-03-07", 2, cal()));
const sun = showDeadline({ label: "Permit expires", due: "2027-03-07", why: "Sample", sample: true }, cal(), "2027-03-01");
ok("CS-DL1 DW1 pass: the date still shows \"Sun 7 Mar 2027 (weekend)\": the date itself is not moved", sun?.due === "2027-03-07" && sun.shown === "Sun 7 Mar 2027 (weekend)" && sun.weekday === "Sun" && sun.mark === "weekend", sun);
ok("CS-DL1 DW1 fail: the weekend is never counted (2 working days before is not Fri 5 Mar, nor Sat 6 Mar)", !["2027-03-05", "2027-03-06"].includes(countBack("2027-03-07", 2, cal())));
ok("CS-DL1 DW1 fail (AG-7-94 r4): a Saturday with business hours is still not an open day for a reminder (earlier, never later)",
  countBack("2027-03-08", 1, cal([], [...WEEK, { day: "SAT", opens: "10:00", closes: "12:00" }])) === "2027-03-05" && !isOpenDay("2027-03-06", cal([], [...WEEK, { day: "SAT", opens: "10:00", closes: "12:00" }])));
ok("CS-DL1 DW1 fail (AG-7-94 r6): a count back never lands on or after the date (n ≥ 1), and \"on the day\" never after it",
  ["2027-03-01", "2027-03-05", "2027-03-07", "2027-03-08"].every((d) => countBack(d, 1, cal()) < d && countBack(d, 0, cal()) <= d) && countBack("2027-03-07", 0, cal()) === "2027-03-05" && countBack("2027-03-05", 0, cal()) === "2027-03-05");

// ---------------------------------------------------------------- DW2 a closed day (AG-7-94 test 2) and the empty list (test 4)
ok("CS-DL1 DW2 pass: Mon 8 Mar 2027, firm closed Fri 5 Mar, \"1 working day before\" → Thu 4 Mar 2027", countBack("2027-03-08", 1, cal(["2027-03-05"])) === "2027-03-04", countBack("2027-03-08", 1, cal(["2027-03-05"])));
ok("CS-DL1 DW2 pass (test 4): with an empty closed-days list every weekday counts: Mon 8 Mar, 1 before → Fri 5 Mar; 5 before → Mon 1 Mar",
  countBack("2027-03-08", 1, cal()) === "2027-03-05" && countBack("2027-03-08", 5, cal()) === "2027-03-01" && ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05"].every((d) => isOpenDay(d, cal())));
ok("CS-DL1 DW2 fail: the closed day is never the reminder day, and is not an open day", countBack("2027-03-08", 1, cal(["2027-03-05"])) !== "2027-03-05" && !isOpenDay("2027-03-05", cal(["2027-03-05"])));
const run = cal(["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-08"]);
ok("CS-DL1 DW2 fail (breaker: a run of closed days): two closed weeks' days and the weekend are all skipped; Mon 8 Mar's reminder 1 before → Fri 26 Feb; 2 before → Thu 25 Feb",
  countBack("2027-03-09", 1, run) === "2027-02-26" && countBack("2027-03-09", 2, run) === "2027-02-25" && countBack("2027-03-08", 0, run) === "2027-02-26");
// AG-7-94's own example (rule 5's lead): 1 Jan 2027 on the closed list, "2 working days before" → Wed 30 Dec 2026.
ok("CS-DL1 DW2 pass (AG-7-94 example): Fri 1 Jan 2027, closed that day, 2 working days before → Wed 30 Dec 2026, across the year", countBack("2027-01-01", 2, cal(["2027-01-01"])) === "2026-12-30");
const shut = cal([], []);
ok("CS-DL1 DW2 fail (\"duplicate beats a miss\", breaker m4): a firm open on no weekday counts Monday-Friday weekdays, never calendar days: 2 before Mon 8 Mar → Thu 4 Mar; 5 → Mon 1 Mar; on the day of Sun 7 Mar → Fri 5 Mar",
  countBack("2027-03-08", 2, shut) === "2027-03-04" && countBack("2027-03-08", 5, shut) === "2027-03-01" && countBack("2027-03-07", 0, shut) === "2027-03-05" && countBack("2027-03-08", 1, cal([], [{ day: "SAT", opens: "10:00", closes: "12:00" }])) === "2027-03-05");
const long = cal(Array.from({ length: 400 }, (_, i) => new Date(Date.parse("2027-03-05T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10)).filter((d) => isOpenDay(d, cal())).slice(0, 262));
const longFirst = [...long.closedDays].sort()[0];
ok("CS-DL1 DW2 fail (breaker M1): 262 closed weekdays in a row before Mon 8 Mar 2027 (a list the settings accept): the count walks past them all to the open day before, never a weekend, never the closed run",
  (() => { const r1 = countBack("2027-03-08", 1, long), r0 = countBack("2027-03-07", 0, long); return long.closedDays.length === 262 && r1 < longFirst && r0 === r1 && isOpenDay(r1, long) && countBack("2027-03-08", 2, long) < r1; })(), { first: longFirst, r1: countBack("2027-03-08", 1, long) });
const fridays = cal([], [{ day: "FRI", opens: "09:00", closes: "17:00" }]), monWed = cal([], WEEK.filter((h) => ["MON", "TUE", "WED"].includes(h.day)));
ok("CS-DL1 DW2 fail (breaker M1): a firm open only on Fridays, 70 working days before Mon 8 Mar 2027 → Fri 7 Nov 2025; open Mon-Wed, 400 before → Wed 14 Aug 2024",
  countBack("2027-03-08", 70, fridays) === "2025-11-07" && countBack("2027-03-08", 400, monWed) === "2024-08-14", [countBack("2027-03-08", 70, fridays), countBack("2027-03-08", 400, monWed)]);
ok("CS-DL1 DW2 fail: a count of working days that is not a whole number from 0 to 2600 is refused", [-1, 1.5, Number.NaN, 2601].every((n) => refused(() => countBack("2027-03-08", n, cal()), "Count back a whole number of working days from 0 to 2600")));

// ---------------------------------------------------------------- DW3 a stage deadline stays the calendar date (AG-7-96 r2)
const defs: KeyDetailDef[] = [{ field: "stage.permit_valid_until", label: "Study permit valid until", type: "DATE" }];
const stages = (v: string) => [{ stage_key: "study", staff_name: "Study permit", key_details: { "stage.permit_valid_until": { value: v, by: "u", at: "2026-11-16T10:00:00.000Z" } }, defs }];
const rule = (add_days: number) => ({ label: "Apply by", from_stage: "study", field: "stage.permit_valid_until", add_days });
const c3 = cal(["2027-03-08"]);
const overWeekend = showDeadline(deadlineOf(rule(2), stages("2027-03-05")), c3, "2027-03-01"), onClosed = showDeadline(deadlineOf(rule(3), stages("2027-03-05")), c3, "2027-03-01");
ok("CS-DL1 DW3 pass: Fri 5 Mar 2027 + 2 calendar days is Sun 7 Mar (weekend); + 3 is Mon 8 Mar (closed day): each the date the rule gives",
  overWeekend?.due === "2027-03-07" && overWeekend.shown === "Sun 7 Mar 2027 (weekend)" && onClosed?.due === "2027-03-08" && onClosed.shown === "Mon 8 Mar 2027 (closed day)", { overWeekend, onClosed });
ok("CS-DL1 DW3 fail: the deadline is never moved to an open day (not Fri 5 Mar, not Tue 9 Mar), and stays Sample",
  overWeekend?.due !== countBack("2027-03-07", 0, c3) && onClosed?.due !== "2027-03-09" && overWeekend?.sample === true && /Sample/.test(overWeekend.why));
const open = showDeadline(deadlineOf(rule(4), stages("2027-03-05")), c3, "2027-03-01");
ok("CS-DL1 DW3 pass: a deadline on an open day carries no mark", open?.shown === "Tue 9 Mar 2027" && open.mark === null);
const unset = showDeadline(deadlineOf(rule(2), stages("")), c3, "2027-03-01");
ok("CS-DL1 DW3 fail: a deadline with no date (the key detail missing) shows no weekday, no mark and is never Missed", unset?.due === null && unset.shown === null && unset.mark === null && unset.missed === false && /^Can't set/.test(unset.why));
ok("CS-DL1 DW3 pass: a weekday with no business hours is a \"(closed day)\"; a weekend day is \"(weekend)\" even when on the closed list",
  dayMark("2027-03-03", cal([], WEEK.filter((h) => h.day !== "WED"))).mark === "closed day" && dayMark("2027-03-06", cal(["2027-03-06"])).mark === "weekend");

// ---------------------------------------------------------------- DW4 Missed, by the fake clock, in the firm's zone
const clock = new FakeClock("2027-03-07T12:00:00.000Z");
const due = (d: string) => ({ label: "Apply by", due: d, why: "Sample", sample: true as const });
const todayIn = (c: FirmCalendar) => localDate(c.zone, clock.now());
ok("CS-DL1 DW4 pass: on Sun 7 Mar 2027 a deadline of Sat 6 Mar shows Missed", showDeadline(due("2027-03-06"), cal(), todayIn(cal()))?.missed === true);
ok("CS-DL1 DW4 fail: a deadline today (Sun 7 Mar) or later (Mon 8 Mar) never shows Missed", showDeadline(due("2027-03-07"), cal(), todayIn(cal()))?.missed === false && showDeadline(due("2027-03-08"), cal(), todayIn(cal()))?.missed === false);
await clock.set("2027-03-08T03:30:00.000Z");   // 22:30 on Sun 7 Mar in Toronto (EST, -5); already Mon 8 Mar in UTC
ok("CS-DL1 DW4 fail: today is the firm's local date, not UTC's: at 03:30 UTC on Mon 8 Mar it is still Sun 7 Mar in Toronto, so a Sun 7 Mar deadline is not yet Missed",
  todayIn(cal()) === "2027-03-07" && showDeadline(due("2027-03-07"), cal(), todayIn(cal()))?.missed === false);
ok("CS-DL1 DW4 pass: in a firm in Tokyo (+9) at the same instant it is Mon 8 Mar, so the same deadline is Missed",
  showDeadline(due("2027-03-07"), cal([], WEEK, "Asia/Tokyo"), todayIn(cal([], WEEK, "Asia/Tokyo")))?.missed === true);

// The view's wiring (review m1): the calendar of the firm in scope, today in its zone from the clock. A stand-in for the
// settings table answers firm A's rows only (as PF-12's wall does); the real reader (readFirmCalendar) runs over it.
const FIRM_A = "0a0a0a0a-0000-4000-8000-00000000000a";
const rows: Record<string, unknown> = { "platform.time_zone": "Asia/Tokyo", "platform.closed_days": ["2027-03-08"] };
const fakeDb = { platformFirmSetting: { findFirst: async (q: { where: { firmId: string; key: string } }) => (q.where.firmId === FIRM_A && q.where.key in rows ? { value: rows[q.where.key] } : null) } } as unknown as Parameters<typeof deadlineDay>[0];
await clock.set("2027-03-07T16:00:00.000Z");   // Sun 7 Mar 11:00 in Toronto; Mon 8 Mar 01:00 in Tokyo
const inA = await withFirm(FIRM_A, () => deadlineDay(fakeDb, clock)), none = await deadlineDay(fakeDb, clock);
ok("CS-DL1 DW4 pass (wiring): in firm A's scope the view reads A's zone and closed days: today is Mon 8 Mar in Tokyo, a Sun 7 Mar deadline is Missed and Mon 8 Mar shows \"(closed day)\"",
  inA.today === "2027-03-08" && inA.cal.zone === "Asia/Tokyo" && showDeadline(due("2027-03-07"), inA.cal, inA.today)?.missed === true && showDeadline(due("2027-03-08"), inA.cal, inA.today)?.shown === "Mon 8 Mar 2027 (closed day)", inA);
ok("CS-DL1 DW4 fail (wiring): with no firm in scope nothing is read across the wall: the defaults (Toronto, no closed days), so today is Sun 7 Mar and Mon 8 Mar carries no mark",
  none.today === "2027-03-07" && none.cal.zone === "America/Toronto" && none.cal.closedDays.length === 0 && showDeadline(due("2027-03-08"), none.cal, none.today)?.mark === null, none);

// DW8 (unit): the case's own firm's calendar through the lookup platform_firm_calendar(firm key), a stand-in for the
// database answering firm A's key only. A key the database does not know gives the defaults, never another firm's
// calendar; a stored value that no longer fits its setting reads that setting's default.
const lookup = (row: Record<string, unknown> | null) => ({ $queryRaw: async (_s: TemplateStringsArray, key: string) => (key === "sample-firm" && row ? [row] : []) }) as unknown as Parameters<typeof deadlineDay>[0];
const known = await deadlineDay(lookup({ time_zone: "Asia/Tokyo", business_hours: null, closed_days: ["2027-03-08"] }), clock, "sample-firm");
ok("CS-DL1 DW8 pass (unit): the case's firm key finds its zone and closed days; an unset hours setting reads the default (Mon-Fri)",
  known.cal.zone === "Asia/Tokyo" && known.cal.closedDays.join() === "2027-03-08" && known.cal.hours.length === 5 && known.today === "2027-03-08", known);
const unknown = await deadlineDay(lookup({ time_zone: "Asia/Tokyo", business_hours: null, closed_days: ["2027-03-08"] }), clock, "no-such-firm");
ok("CS-DL1 DW8 fail (unit): a firm key the database does not know gives the defaults (Toronto, no closed days), never another firm's calendar",
  unknown.cal.zone === "America/Toronto" && unknown.cal.closedDays.length === 0 && unknown.today === "2027-03-07", unknown);
const bad = await deadlineDay(lookup({ time_zone: "Mars/Olympus", business_hours: "x", closed_days: ["2027-02-30"] }), clock, "sample-firm");
ok("CS-DL1 DW8 fail (unit): stored values that no longer fit their settings read the defaults, never a 500", bad.cal.zone === "America/Toronto" && bad.cal.hours.length === 5 && bad.cal.closedDays.length === 0, bad);

// ---------------------------------------------------------------- DW5 PF-21's clock after the move
ok("CS-DL1 DW5 pass: complaints/business-days.ts gives PF-21v's count from calendar/ (one function, not a copy) and nothing else moved",
  complaintDays.businessDaysBetween === businessDaysBetween && complaintDays.BusinessDayTally === BusinessDayTally && !("localDate" in complaintDays) && !("zonedInstant" in complaintDays) && !("businessClose" in complaintDays));
ok("CS-DL1 DW5 pass: the acknowledge-by period stays a complaint rule there (ACK_BUSINESS_DAYS = 2, Sample) and is not in calendar/",
  complaintDays.ACK_BUSINESS_DAYS === 2 && typeof complaintDays.acknowledgeBy === "function" && !("acknowledgeBy" in calendarModule) && !("ACK_BUSINESS_DAYS" in calendarModule));
// Received Fri 13 Nov 2026 15:00 Toronto, Mon 16 closed: Tue 17 is day 1, Wed 18 day 2 → 17:00 Wed 18 Nov (22:00 UTC).
const ack = complaintDays.acknowledgeBy(new Date("2026-11-13T20:00:00.000Z"), cal(["2026-11-16"]));
ok("CS-DL1 DW5 pass: the complaint clock is unchanged: received Fri 13 Nov, Mon 16 closed → acknowledge by Wed 18 Nov 17:00 Toronto", ack.toISOString() === "2026-11-18T22:00:00.000Z", ack.toISOString());
ok("CS-DL1 DW5 fail: the business-day test still skips the weekend and a closed day (no close time on Sat 14 or Mon 16 Nov)", businessClose(cal(["2026-11-16"]), "2026-11-14") === null && businessClose(cal(["2026-11-16"]), "2026-11-16") === null);

// ---------------------------------------------------------------- DW6 a date that does not exist (AG-7-94 failure test)
ok("CS-DL1 DW6 pass: \"2027-02-31\" is refused with \"That date does not exist\" by every calendar function",
  [() => countBack("2027-02-31", 1, cal()), () => isOpenDay("2027-02-31", cal()), () => dayMark("2027-02-31", cal()), () => calendarDate("2027-02-31")].every((f) => refused(f)));
ok("CS-DL1 DW6 fail (breaker m1, m2): a deadline the calendar refuses (31 Feb, year 0000, a year past 9999) shows no weekday and no mark and is never Missed: the case view never answers 500",
  ["2027-02-31", "0000-01-01", "+010000-01-01"].every((v) => { const x = showDeadline(due(v), cal(), "2027-01-01"); return x?.shown === null && x.mark === null && x.missed === false && x.due === v; }));
ok("CS-DL1 DW6 fail (breaker m3): near the first year the walk stops at 0001-01-01 and never refuses a date that exists", countBack("0001-01-03", 5, cal()) === "0001-01-01" && refused(() => calendarDate("0000-12-31")));
ok("CS-DL1 DW6 fail: real dates pass, 29 Feb only in a leap year (2028), not 2027",
  calendarDate("2027-02-28") === "2027-02-28" && calendarDate("2028-02-29") === "2028-02-29" && refused(() => calendarDate("2027-02-29")));
ok("CS-DL1 DW6 fail (breaker: bad dates): 2027-13-01, 2027-04-31, 2027-00-10, 2027-3-7, an empty string, a time stamp, a number and null are all refused",
  ["2027-13-01", "2027-04-31", "2027-00-10", "2027-3-7", "", "2027-03-07T00:00:00Z", 20270307, null, "７０２７-03-07"].every((v) => refused(() => calendarDate(v))));

// ================================================================ Part 2 (CS-DL1b): reminders as jobs
// A scratch database (every migration, PF-3's Sample firms), cases written as SQL fixtures (replica role, as
// check_csc1_close.ts does): a done-before "study" stage holding the date and a CURRENT "work" stage whose deadline is
// that date + 0 days, on a route marked CITED (labelled test data: no immigration value; every real route is Sample).
// fakeJobs on a FakeClock, fakeNotifications wrapped to count calls; close and reopen through CS-C1a's own service.
// Sample offsets 7, 2 and 0 working days, at 09:00 Toronto (14:00 UTC before 14 Mar 2027).
const PGBIN = "/opt/homebrew/opt/postgresql@18/bin", PGA = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"], SDB = `xr_studio_csdl1b_${process.pid}`;
const { execFileSync } = await import("node:child_process"), { readdirSync } = await import("node:fs"), { join } = await import("node:path"), { randomUUID } = await import("node:crypto");
const sql = (q: string) => execFileSync(join(PGBIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${SDB}`, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const MIG = join(import.meta.dirname, "..", "prisma", "migrations");
execFileSync(join(PGBIN, "dropdb"), [...PGA, "--if-exists", SDB]); execFileSync(join(PGBIN, "createdb"), [...PGA, SDB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(PGBIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${SDB}`, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: "ignore" });
const { PrismaPg } = await import("@prisma/adapter-pg"), { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${SDB}`, options: "-c TimeZone=UTC" }) });
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { CaseDeadlines } = await import("../api/src/case-deadlines/reminders.ts");
const { REMINDER_JOB } = await import("../api/src/case-deadlines/plan.ts");
const { CaseClose } = await import("../api/src/case-close.ts");
const { fakeJobs } = await import("../ports/jobs.ts");
const { fakeNotifications, NOTIFICATION_KIND, NOTIFICATION_GROUP } = await import("../ports/notifications.ts");
try {
  await seedSampleFirms(db);
  const firm = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id;
  const FA = await firm("sample-firm"), FB = await firm("sample-solo");
  const staff = async (actorId: string) => (await db.platformStaff.findUniqueOrThrow({ where: { actorId } })).id;
  const [REP, OFF, SOLO] = [await staff("user-R"), await staff("user-O"), await staff("user-S")];
  const W = randomUUID(), CMB = [randomUUID(), randomUUID()];
  sql(`set session_replication_role = replica; insert into workspace (id, key, label) values ('${W}', 'csdl1b-${process.pid}', 'CS-DL1b check');
    insert into route (id, workspace_id, key, label, basis, stages, created_by) values (gen_random_uuid(), '${W}', 'test-cited', 'Test route (labelled test data)', 'CITED', '[{"key":"study"},{"key":"work"}]', 'seed:csdl1b'), (gen_random_uuid(), '${W}', 'test-sample', 'Test route, Sample', 'SAMPLE', '[{"key":"study"},{"key":"work"}]', 'seed:csdl1b')`);
  const clock = new FakeClock("2027-02-20T12:00:00.000Z"), jobs = fakeJobs(clock), inner = fakeNotifications({ now: () => clock.now() });
  const calls: { staffId: string; stageId: string; at: string }[] = [], stageOf = new Map<string, string>();
  const notifications = { ...inner, async notify(tx: unknown, r: { staffId: string }, k: typeof NOTIFICATION_KIND.CASE_STAGE_DEADLINE, i: { kind: "case-stage"; id: string }) { calls.push({ staffId: r.staffId, stageId: i.id, at: clock.now().toISOString() }); return inner.notify(tx, r, k, i); } };
  const dl = new CaseDeadlines({ db, jobs, notifications, clock });
  await dl.register({ sweep: false });
  const closer = new CaseClose(db as never);
  const ctx = (firmId: string, firmKey: string, staffId: string) => ({ staffId, firmId, firmKey, roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" }) as never;
  let n = 0;
  /** A case on `route` whose study date is `date` (null: not recorded); team: user-R and user-O, user-T's officer row ended (firm A), or user-S (firm B). */
  const newCase = (date: string | null, o: { route?: string; firmKey?: string; firmId?: string } = {}) => {
    const id = randomUUID(), work = randomUUID(), fk = o.firmKey ?? "sample-firm", fid = o.firmId ?? FA, route = o.route ?? "test-cited";
    const kd = date ? `{"stage.permit_valid_until": {"value": "${date}", "by": "user-O", "at": "2027-02-01T10:00:00.000Z"}}` : "{}";
    const spec = (dl: boolean) => JSON.stringify({ key_details: dl ? [] : [{ field: "stage.permit_valid_until", label: "Study permit valid until", type: "DATE" }], ...(dl ? { deadline: { label: "Apply by (test)", from_stage: "study", field: "stage.permit_valid_until", add_days: 0 } } : {}) });
    const team = fk === "sample-firm" ? `('user-R', 'LEAD_REPRESENTATIVE', null), ('user-O', 'OFFICER', null), ('user-T', 'OFFICER', now())` : `('user-S', 'LEAD_REPRESENTATIVE', null)`;
    sql(`set session_replication_role = replica;
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id) values ('${id}', '${W}', '${CMB[1]}', 'user-P', 'user-O', 'C-2027-${String(++n).padStart(5, "0")}', '${fk}', '${fid}');
      insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, state, key_details, spec, route_key, application_subject_id, started_from) values
        (gen_random_uuid(), '${W}', '${id}', '${fk}', '${fid}', 1, 'study', 'Study permit', 'Study permit', '${CMB[0]}', 'DONE_BEFORE', '${kd}', '${spec(false)}', '${route}', null, null),
        ('${work}', '${W}', '${id}', '${fk}', '${fid}', 2, 'work', 'Work permit', 'Work permit', '${CMB[1]}', 'CURRENT', '{}', '${spec(true)}', '${route}', gen_random_uuid(), 'BEGIN');
      insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by, ended_at, ended_by, end_reason) select gen_random_uuid(), '${W}', '${id}', u, r, 'seed:csdl1b', e::timestamptz, case when e is null then null else 'seed:csdl1b' end, case when e is null then null else 'Test: reassigned' end from (values ${team}) t(u, r, e)`);
    stageOf.set(id, work);
    return { id, work };
  };
  const setDate = (id: string, v: string) => sql(`update case_stage set key_details = jsonb_build_object('stage.permit_valid_until', jsonb_build_object('value', '${v}', 'by', 'user-O', 'at', '2027-02-01T10:00:00.000Z'))::json where case_id = '${id}' and stage_key = 'study'`);
  /** Moves the clock forward hour by hour (the fake runs a due job at the time it moves to, as a worker would). */
  const walk = async (to: string) => { while (clock.now() < new Date(to)) await clock.set(new Date(Math.min(clock.now().getTime() + 3_600_000, Date.parse(to)))); };
  const mine = (id: string, status?: string) => jobs.jobs.filter((j) => j.name === REMINDER_JOB && j.payload.caseId === id && (!status || j.status === status));
  const told = (id: string) => calls.filter((c) => c.stageId === stageOf.get(id));
  const at = (id: string) => told(id).map((c) => c.at.slice(0, 16)).filter((x, i, a) => a.indexOf(x) === i);
  const withdraw = (id: string) => closer.withdraw(ctx(FA, "sample-firm", REP), id, { reason: "Test: the client withdrew", withdrawnOn: "2027-02-26" });
  const reopen = (id: string) => closer.reopen(ctx(FA, "sample-firm", REP), id, { reason: "Test: the client came back" });

  ok("CS-DL1 part 2 setup: the kind is added, never reordered: case-stage-deadline, in My deadlines", NOTIFICATION_KIND.CASE_STAGE_DEADLINE === "case-stage-deadline" && Object.keys(NOTIFICATION_KIND)[0] === "PORT_SELF_TEST" && NOTIFICATION_GROUP[NOTIFICATION_KIND.CASE_STAGE_DEADLINE] === "MY_DEADLINES");

  // ---------------------------------------------------------------- DW7 three reminders, each once
  const a = newCase("2027-03-08"), sample = newCase("2027-03-08", { route: "test-sample" }), w1 = newCase(null);
  await dl.sweep();
  ok("CS-DL1 DW7 pass: a cited deadline Mon 8 Mar 2027 arms three keyed jobs at 09:00 Toronto: Thu 25 Feb (7 working days), Thu 4 Mar (2), Mon 8 Mar (on the day)",
    mine(a.id).map((j) => `${j.payload.offset}@${j.runAt.toISOString()}|${j.key}|${j.firmId}`).join() === [7, 2, 0].map((o, i) => `${o}@${["2027-02-25", "2027-03-04", "2027-03-08"][i]}T14:00:00.000Z|deadline:${a.id}:${a.work}:${o}:2027-03-08:${["2027-02-25", "2027-03-04", "2027-03-08"][i]}T14:00:r0|${FA}`).join(), mine(a.id).map((j) => [j.key, j.runAt]));
  const forced = { caseId: sample.id, stageId: sample.work, offset: 0, due: "2027-03-08", day: "2027-03-08", round: 0 };
  ok("CS-DL1 DW7 fail (P-412 F13 (b)): the same deadline on a Sample route arms nothing (shown, never reminded), even asked directly, and a forced job for it tells nobody; a case with no date arms nothing",
    mine(sample.id).length === 0 && (await dl.arm(sample.id)).length === 0 && (await dl.runReminder({ payload: forced, key: `deadline:${sample.id}:${sample.work}:0:2027-03-08:2027-03-08T14:00:r0`, firmId: FA })) === 0 && mine(w1.id).length === 0);
  await dl.sweep();
  ok("CS-DL1 DW7 fail: a second run of the scheduler queues nothing new (the keys)", mine(a.id).length === 3 && jobs.jobs.filter((j) => j.name === REMINDER_JOB).length === 3);
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW7 pass: each reminder fires once, to the representative and the current officer (not the officer whose assignment ended): two people at each of the three times",
    told(a.id).length === 6 && at(a.id).join() === "2027-02-25T14:00,2027-03-04T14:00,2027-03-08T14:00" && told(a.id).every((c) => [REP, OFF].includes(c.staffId)) && mine(a.id, "done").length === 3, told(a.id));
  const records = inner.sent().length, redo = await dl.runReminder({ payload: mine(a.id)[2].payload, key: mine(a.id)[2].key, firmId: FA });
  ok("CS-DL1 DW7 fail (breaker: a redelivered job): the on-the-day job delivered again after its day does nothing; the port holds one record per person and stage (item kind case-stage)", redo === 0 && inner.sent().length === records && inner.sent().filter((r) => r.item.kind === "case-stage" && r.item.id === a.work).length === 2);
  ok("CS-DL1 DW7 fail: nothing was told on the Sample route's case", told(sample.id).length === 0);

  // ---------------------------------------------------------------- W1 the journey, scripted
  await clock.set("2027-02-20T12:00:00.000Z");
  await dl.sweep();
  ok("CS-DL1 W1: a case on a cited route with its key detail not yet recorded: the deadline can't be set, nothing armed", mine(w1.id).length === 0);
  setDate(w1.id, "2027-03-08"); await dl.sweep();
  ok("CS-DL1 W1: the key detail recorded (8 Mar 2027): the three reminders are armed", mine(w1.id, "waiting").length === 3);
  await withdraw(w1.id); await dl.sweep(); await walk("2027-02-27T12:00:00.000Z");
  ok("CS-DL1 W1: closed (withdrawn): the waiting reminders are cancelled and none fires (the 25 Feb one included)", mine(w1.id, "cancelled").length === 3 && told(w1.id).length === 0);
  await reopen(w1.id); await dl.sweep(); await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 W1: reopened: the two still to come are armed (round 1) and fire once each; the passed one never fires late", mine(w1.id).filter((j) => j.key.endsWith(":r1")).map((j) => j.payload.offset).join() === "2,0" && at(w1.id).join() === "2027-03-04T14:00,2027-03-08T14:00" && told(w1.id).length === 4, at(w1.id));

  // ---------------------------------------------------------------- DW8 close and reopen
  await clock.set("2027-02-20T12:00:00.000Z");
  const b = newCase("2027-03-08"); await dl.sweep();
  await walk("2027-02-26T12:00:00.000Z");
  ok("CS-DL1 DW8 setup: the 7-day reminder fired on 25 Feb", at(b.id).join() === "2027-02-25T14:00");
  await withdraw(b.id); await reopen(b.id); await dl.sweep();   // breaker: close and reopen in the same minute, one sweep
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW8 pass (breaker: close and reopen in one minute): only those still to come are armed again (2 and 0, round 1) and each fires once; the passed 7-day one does not fire again",
    at(b.id).join() === "2027-02-25T14:00,2027-03-04T14:00,2027-03-08T14:00" && told(b.id).length === 6 && mine(b.id).filter((j) => j.key.endsWith(":r1")).length === 2, at(b.id));
  ok("CS-DL1 DW8 fail: the round-0 jobs left waiting by the same-minute close ran and told nobody (a job of an earlier round does nothing): six notifications in all, never ten", told(b.id).length === 6 && mine(b.id).filter((j) => j.key.endsWith(":r0") && j.payload.offset !== 7).every((j) => j.status === "done"));
  await clock.set("2027-02-20T12:00:00.000Z");
  const c2 = newCase("2027-03-08"); await dl.sweep(); await withdraw(c2.id); await walk("2027-02-20T12:09:00.000Z"); await dl.sweep();
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW8 pass: closing cancels the case's waiting reminders (job key prefix deadline:) and none fires", mine(c2.id, "cancelled").length === 3 && told(c2.id).length === 0 && mine(c2.id).every((j) => j.key.startsWith("deadline:")));
  await reopen(c2.id); await dl.sweep(); await walk("2027-03-10T12:00:00.000Z");
  ok("CS-DL1 DW8 fail: reopened after the deadline day, nothing is armed and nothing fires late", mine(c2.id).length === 3 && told(c2.id).length === 0);

  // ---------------------------------------------------------------- DW9 a changed date re-arms
  await clock.set("2027-02-20T12:00:00.000Z");
  const d = newCase("2027-03-08"); await dl.sweep(); setDate(d.id, "2027-03-15"); await dl.sweep();
  await walk("2027-03-16T12:00:00.000Z");
  ok("CS-DL1 DW9 pass: the date moved to Mon 15 Mar 2027 arms a new set that fires once each: Thu 4 Mar, Thu 11 Mar, Mon 15 Mar (09:00 EDT = 13:00 UTC)",
    at(d.id).join() === "2027-03-04T14:00,2027-03-11T14:00,2027-03-15T13:00" && told(d.id).length === 6 && mine(d.id).length === 6, at(d.id));
  ok("CS-DL1 DW9 fail: the old date's three jobs ran and told nobody (25 Feb and 8 Mar never reminded)", mine(d.id).filter((j) => j.payload.due === "2027-03-08").every((j) => j.status === "done") && !at(d.id).some((x) => x.startsWith("2027-02-25") || x.startsWith("2027-03-08")));

  // ---------------------------------------------------------------- DW10 firm walls, DW11 closed days (firm B)
  const { CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
  const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
  await writeSetting(db as never, { firmId: FB, key: CLOSED_DAYS.key, value: ["2027-03-04", "2027-03-05", "2027-03-08"], by: "seed:csdl1b", workspaceId: await platformAuditWorkspaceId(db as never) });
  await clock.set("2027-02-20T12:00:00.000Z");
  const e = newCase("2027-03-08", { firmKey: "sample-solo", firmId: FB });
  // A stray team row naming firm A's officer by staff id on firm B's case (bad data): firm B's jobs never find firm A's staff.
  sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values (gen_random_uuid(), '${W}', '${e.id}', '${OFF}', 'OFFICER', 'seed:csdl1b')`);
  await dl.sweep();
  ok("CS-DL1 DW11 pass: firm B closed Thu 4, Fri 5 and Mon 8 Mar: the reminders move earlier, never later: Tue 23 Feb (7), Tue 2 Mar (2), Wed 3 Mar (on the day)",
    mine(e.id).map((j) => j.payload.day).join() === "2027-02-23,2027-03-02,2027-03-03", mine(e.id).map((j) => j.payload.day));
  ok("CS-DL1 DW11 fail: no reminder day is a closed day, a weekend, or later than firm A's for the same date", mine(e.id).every((j, i) => !["2027-03-04", "2027-03-05", "2027-03-08"].includes(String(j.payload.day)) && String(j.payload.day) <= ["2027-02-25", "2027-03-04", "2027-03-08"][i]));
  ok("CS-DL1 DW10 pass: firm B's case's jobs carry firm B's id", mine(e.id).every((j) => j.firmId === FB));
  const cross = await dl.runReminder({ payload: mine(e.id)[0].payload, key: mine(e.id)[0].key, firmId: FA }), back = await dl.runReminder({ payload: mine(a.id)[0].payload, key: mine(a.id)[0].key, firmId: FB });
  ok("CS-DL1 DW10 fail: a job carrying firm A's id refuses firm B's case (never reaching the stray firm A officer), and firm B's id refuses firm A's: nobody told", cross === 0 && back === 0 && told(e.id).length === 0);
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW10 pass: firm B's reminders tell firm B's representative only, never firm A's staff", told(e.id).length === 3 && told(e.id).every((c) => c.staffId === SOLO), told(e.id));

  // ---------------------------------------------------------------- DW11 (breaker M1, M2): the calendar changes after the arm
  const { TIME_ZONE } = await import("../api/src/platform/settings.ts");
  const setA = async (key: string, value: unknown) => writeSetting(db as never, { firmId: FA, key, value, by: "seed:csdl1b", workspaceId: await platformAuditWorkspaceId(db as never) });
  await clock.set("2027-02-20T12:00:00.000Z");
  const g = newCase("2027-03-08"); await dl.sweep(); await setA(TIME_ZONE.key, "Australia/Sydney"); await dl.sweep();
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW11 pass (breaker M2): firm A moves to Sydney after the arm: the reminders fire at 09:00 Sydney (22:00 UTC the day before), once each",
    at(g.id).join() === "2027-02-24T22:00,2027-03-03T22:00,2027-03-07T22:00" && told(g.id).length === 6, at(g.id));
  ok("CS-DL1 DW11 fail (breaker M2): the Toronto-time jobs armed before the move ran and told nobody", mine(g.id).filter((j) => j.runAt.toISOString().endsWith("T14:00:00.000Z")).every((j) => j.status === "done") && !at(g.id).some((x) => x.endsWith("T14:00")));
  await setA(TIME_ZONE.key, "America/Toronto");
  await clock.set("2027-02-20T12:00:00.000Z");
  const h = newCase("2027-03-08"); await dl.sweep(); await setA(CLOSED_DAYS.key, ["2027-03-04"]); await dl.sweep();
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL1 DW11 pass (breaker M1): firm A closes Thu 4 Mar after the arm: the 7-day and 2-day reminders move earlier (Wed 24 Feb, Wed 3 Mar), 8 Mar stays",
    at(h.id).join() === "2027-02-24T14:00,2027-03-03T14:00,2027-03-08T14:00" && told(h.id).length === 6, at(h.id));
  ok("CS-DL1 DW11 fail (breaker M1): nothing fires on the earlier plan's days (Thu 25 Feb, Thu 4 Mar, the day the firm closed): those jobs ran and told nobody", !at(h.id).some((x) => x.startsWith("2027-03-04") || x.startsWith("2027-02-25")));
} finally {
  await db.$disconnect();
  execFileSync(join(PGBIN, "dropdb"), [...PGA, "--if-exists", SDB]);
}

process.exit(summary() ? 1 : 0);
