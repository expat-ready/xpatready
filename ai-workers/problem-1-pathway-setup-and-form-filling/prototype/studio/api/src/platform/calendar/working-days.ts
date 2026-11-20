// CS-DL1 part 1 (map row 74; moved from PF-21's complaints/business-days.ts, Lead B's OK on #1867, rev 16.31): the firm's
// calendar, one place for every module that counts in the firm's open days. The zone helpers (localDate, zonedInstant),
// the business-day test PF-21's acknowledge-by clock uses (businessClose), PF-21v's running count (businessDaysBetween),
// the firm calendar reader, and CS-DL1's count back for reminders (countBack, isOpenDay).
// AG-7-94@2b63ee12: a government or legal date is a calendar date that business hours and closed days never move (r1, r2);
// a reminder "N working days before" is counted back over open days and never lands later than the computed day nor after
// the date (r5, r6); an open day is a weekday (Monday to Friday) inside the firm's business hours that is not on the
// closed-days list (r4; an empty list = every weekday with hours is open). "Duplicate beats a miss" (AG16-60): when in
// doubt the count goes earlier. AG-7-99: the case's office decides once a second office exists; one office → the firm's.
// No date library: Intl gives the zone's offset (the same way settings.ts checks zone names). Rules only; no model call.
import type { Prisma, PrismaClient } from "@prisma/client";
import { BUSINESS_HOURS, CLOSED_DAYS, readSetting, TIME_ZONE } from "../settings.ts";

export type FirmCalendar = { zone: string; hours: { day: string; opens: string; closes: string }[]; closedDays: string[] };

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** One formatter per zone (IANA zones are a fixed set): building one is the costly part of a date read. */
const FORMATS = new Map<string, Intl.DateTimeFormat>();
function partsIn(zone: string, at: Date): Record<string, string> {
  let f = FORMATS.get(zone);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); FORMATS.set(zone, f); }
  return Object.fromEntries(f.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

/** The zone's offset from UTC at an instant, in milliseconds. */
function offsetAt(zone: string, at: Date): number {
  const p = partsIn(zone, at);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The local date (YYYY-MM-DD) of an instant in a zone. */
export function localDate(zone: string, at: Date): string {
  const p = partsIn(zone, at);
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}`;
}
const localWall = (zone: string, at: Date) => { const p = partsIn(zone, at); return `${p.year.padStart(4, "0")}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

/** The instant of a local wall-clock time (date YYYY-MM-DD, time HH:MM) in a zone. A time the clocks skip (a
 *  daylight-saving gap) is read with the offset before the change, so it lands just after the gap, on the same day; a
 *  time that happens twice (the clocks go back) is the later of the two. */
export function zonedInstant(date: string, hhmm: string, zone: string): Date {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const candidates = [wall - offsetAt(zone, new Date(wall - 14 * 3_600_000)), wall - offsetAt(zone, new Date(wall + 14 * 3_600_000))];
  const want = `${date} ${hhmm}`;
  const exact = candidates.filter((t) => localWall(zone, new Date(t)) === want);
  return new Date(Math.max(...(exact.length ? exact : candidates)));
}

const DAY_MS = 86_400_000;
export const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
const prevDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** The closing instant of a business day (a day with opening hours, not a closed day, a day the zone did not skip,
 *  e.g. Pacific/Apia, 30 Dec 2011), or null for any other day. PF-21's test: a Saturday with hours counts here. */
export function businessClose(cal: FirmCalendar, date: string): Date | null {
  const h = cal.hours.find((x) => x.day === weekdayOf(date));
  let at: Date | null = null;
  if (h && !cal.closedDays.includes(date)) {
    at = zonedInstant(date, h.closes, cal.zone);
    if (localDate(cal.zone, at) !== date) at = null;
  }
  return at;
}

const dayNo = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const dateOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** PF-21v: one request's running count of business days, by acknowledgeBy's own rule: each date is worked out once,
 *  then any span is two lookups, so a page of rows (an old complaint included) costs one walk of the dates it covers,
 *  never a walk per row (break M1). */
export class BusinessDayTally {
  /** cum[k]: the business days d with lo < d ≤ lo + k (day numbers since 1970-01-01). */
  private lo = 0;
  private cum: number[] = [];
  constructor(private readonly cal: FirmCalendar) {}
  private open = (n: number) => (businessClose(this.cal, dateOf(n)) ? 1 : 0);
  /** The business days d with from < d ≤ to (local dates YYYY-MM-DD); 0 when to is on or before from. */
  count(from: string, to: string): number {
    const a = dayNo(from), b = dayNo(to);
    if (!(b > a)) return 0;
    if (!this.cum.length) { this.lo = a; this.cum = [0]; }
    if (a < this.lo) {
      const pre = [0];
      for (let n = a + 1; n <= this.lo; n++) pre.push(pre[pre.length - 1] + this.open(n));
      const shift = pre.pop()!;
      this.cum = pre.concat(this.cum.map((x) => x + shift));
      this.lo = a;
    }
    for (let n = this.lo + this.cum.length; n <= b; n++) this.cum.push(this.cum[this.cum.length - 1] + this.open(n));
    return this.cum[b - this.lo] - this.cum[a - this.lo];
  }
}

/** PF-21v: the number of business days d, by acknowledgeBy's own rule, with from < d ≤ to, where d, from and to are
 *  local dates in the firm's zone (0 when to is on or before from). One request passes one tally for all its rows. */
export function businessDaysBetween(cal: FirmCalendar, from: Date, to: Date, tally: BusinessDayTally = new BusinessDayTally(cal)): number {
  return tally.count(localDate(cal.zone, from), localDate(cal.zone, to));
}

// ---------------------------------------------------------------- CS-DL1: calendar dates and the count back (AG-7-94)
/** AG-7-94's failure test: a date that is not on the calendar (31 Feb) is refused with these words, nothing worked out. */
export const NO_SUCH_DATE = "That date does not exist";
/** The longest count back (ten years of working days); a longer one is refused, never an endless walk. */
export const MAX_COUNT_BACK = 2600;

/** A calendar date YYYY-MM-DD that exists, from 0001-01-01 (2027-02-31 and year 0000 do not), or a RangeError with
 *  NO_SUCH_DATE. */
export function calendarDate(date: unknown): string {
  const ok = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "0001-01-01" && (() => { const t = Date.parse(`${date}T00:00:00Z`); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date; })();
  if (!ok) throw new RangeError(NO_SUCH_DATE);
  return date as string;
}

const isWeekday = (date: string) => { const w = weekdayOf(date); return w !== "SAT" && w !== "SUN"; };
const openDay = (date: string, cal: FirmCalendar) => isWeekday(date) && businessClose(cal, date) !== null;

/** AG-7-94 r4: an open day is a weekday (Monday to Friday) inside the firm's business hours, not on its closed-days list
 *  (and not a day the zone skipped). A Saturday with hours is not an open day for a reminder (earlier, never later). */
export function isOpenDay(date: string, cal: FirmCalendar): boolean {
  return openDay(calendarDate(date), cal);
}

/** The nth day before `date` (n = 0: on or before it) that passes `counts`, walking at most `limit` days back and never
 *  before 0001-01-01; null when the walk ends first. */
function walkBack(date: string, n: number, counts: (d: string) => boolean, limit: number): string | null {
  let at = date, counted = 0;
  if (n === 0 && counts(at)) return at;
  for (let i = 0; i < limit && at > "0001-01-01"; i++) {
    at = prevDate(at);
    if (counts(at) && (n === 0 || ++counted === n)) return at;
  }
  return null;
}

/** AG-7-94 r5, r6: the day a reminder set "n working days before" `date` lands on: the nth open day before the date
 *  (n = 0, "on the day": the last open day on or before it). Never later than that, never after the date. The walk goes
 *  as far back as the count needs: a week holds an open weekday unless the firm opens on no weekday, and the closed-days
 *  list holds at most 366 dates (settings.ts), so 7 × (n + 368) days always reach it. A firm open on no weekday at all
 *  counts Monday-to-Friday weekdays instead (AG-7-94 test 4's "every weekday counts"; earlier, never a miss: AG16-60). */
export function countBack(date: string, n: number, cal: FirmCalendar): string {
  const d = calendarDate(date);
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT_BACK) throw new RangeError(`Count back a whole number of working days from 0 to ${MAX_COUNT_BACK}`);
  const limit = 7 * (n + 368);
  const anyWeekday = cal.hours.some((h) => h.day !== "SAT" && h.day !== "SUN");
  const hit = anyWeekday ? walkBack(d, n, (x) => openDay(x, cal), limit + 7 * cal.closedDays.length) : null;
  return hit ?? walkBack(d, n, isWeekday, limit) ?? "0001-01-01";
}

/** AG-7-94 r3: how a calendar date shows: its weekday, and a mark when it falls on a weekend or a day the firm is closed.
 *  The date itself is never moved (r1, r2). */
export function dayMark(date: string, cal: FirmCalendar): { weekday: string; mark: "weekend" | "closed day" | null } {
  const d = calendarDate(date), w = weekdayOf(d);
  const weekday = w.charAt(0) + w.slice(1).toLowerCase();
  return { weekday, mark: w === "SAT" || w === "SUN" ? "weekend" : openDay(d, cal) ? null : "closed day" };
}

/** The firm's calendar: its time zone, business hours and closed days (PF-1's settings, defaults when unset). AG-7-99:
 *  one office → the firm's; the case's office decides once a second office exists (no office model on main). */
export async function readFirmCalendar(db: PrismaClient | Prisma.TransactionClient, firmId: string): Promise<FirmCalendar> {
  return {
    zone: await readSetting<string>(db, firmId, TIME_ZONE.key),
    hours: await readSetting<FirmCalendar["hours"]>(db, firmId, BUSINESS_HOURS.key),
    closedDays: await readSetting<string[]>(db, firmId, CLOSED_DAYS.key),
  };
}
