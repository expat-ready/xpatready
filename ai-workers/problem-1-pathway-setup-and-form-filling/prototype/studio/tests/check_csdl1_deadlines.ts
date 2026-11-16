// CS-DL1 (map row 74; QA-471; briefs design/briefs/CS-DL1.md and build-lead-c-briefs/CS-DL1a.md): deadlines and the
// firm's open days. Part 1: the one open-day function (api/src/platform/calendar/working-days.ts, moved from PF-21's
// complaints/business-days.ts) and the deadline view (api/src/case-stages.ts showDeadline). AG-7-94@2b63ee12: a
// government or legal date is a calendar date that business hours and closed days never move (r1, r2), shown with its
// weekday and marked "(weekend)" or "(closed day)" (r3); a reminder "N working days before" is counted back over open days,
// never later than the computed day nor after the date (r5, r6); an open day is a weekday in business hours not on the
// closed-days list (r4). AG-7-96@894c1c8b r2: a deadline is the anchor plus N calendar days. Each named case has a pass and
// a fail. Pure functions and the fake clock (P-607): no database, no server, no model call (US$0). Every stage deadline is
// Sample (P-412 F13 (b)); the dates here are AG-7-94's own test dates, no immigration value.
//   tsx studio/tests/check_csdl1_deadlines.ts
import { businessClose, businessDaysBetween, BusinessDayTally, calendarDate, countBack, dayMark, isOpenDay, localDate, NO_SUCH_DATE, zonedInstant, type FirmCalendar } from "../api/src/platform/calendar/working-days.ts";
import * as complaintDays from "../api/src/platform/complaints/business-days.ts";
import * as calendarModule from "../api/src/platform/calendar/working-days.ts";
import { asBypass, BypassRefused, enterRequest, withFirm } from "../api/src/platform/firm-scope.ts";
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

// DW8 (Build Lead C's Q1 ruling): the named use "case.stages.calendar" runs only inside a GET stage route's request; any
// other route, a write route included, is refused before its query runs (the query here never runs: it would say "ran").
const onRoute = async (method: string, path: string) => {
  try { return await (async () => { enterRequest({ method, path }); return asBypass("case.stages.calendar", () => "ran"); })(); } catch (e) { return e instanceof BypassRefused ? "refused" : String(e); }
};
const C = "/api/runtime/cases/3b0f0538-05ea-48d2-969e-7108c6615f35";
ok("CS-DL1 DW8 pass: the use runs on the three GET stage routes (the stages, one stage, the next stage's preview)",
  (await Promise.all([onRoute("GET", `${C}/stages`), onRoute("GET", `${C}/stages/abc`), onRoute("GET", `${C}/stages/next`)])).every((r) => r === "ran"));
const refusedOn = await Promise.all([onRoute("POST", `${C}/stages/next`), onRoute("PUT", `${C}/stages/abc/key-details`), onRoute("GET", `${C}/checklist`), onRoute("GET", `${C}/stages/abc/more`), onRoute("GET", "/api/platform/complaints"), onRoute("DELETE", `${C}/stages`)]);
ok("CS-DL1 DW8 fail: it is refused on a write route (start next stage, key details), on any other case route and on a platform route", refusedOn.every((r) => r === "refused"), refusedOn);

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

process.exit(summary() ? 1 : 0);
