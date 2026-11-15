// PF-21: the acknowledgement date of a complaint, in the firm's own calendar. "Promptly respond" (Code SOR/2022-128 s. 29)
// is given a Sample period, ACK_BUSINESS_DAYS business days, until the College's by-laws are read: the deadline is the
// closing time of the Nth business day after the day the complaint was received, in the firm's time zone, where a business
// day is a weekday with opening hours (platform.business_hours) that is not a closed day (platform.closed_days). No date
// library: Intl gives the zone's offset (the same way settings.ts checks zone names).

/** Sample (FO-13k rev 12): 2 business days, to set from the by-laws once read. */
export const ACK_BUSINESS_DAYS = 2;

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

const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** The closing instant of a business day (a weekday with opening hours, not a closed day, a day the zone did not skip,
 *  e.g. Pacific/Apia, 30 Dec 2011), or null for any other day. */
function businessClose(cal: FirmCalendar, date: string): Date | null {
  const h = cal.hours.find((x) => x.day === weekdayOf(date));
  let at: Date | null = null;
  if (h && !cal.closedDays.includes(date)) {
    at = zonedInstant(date, h.closes, cal.zone);
    if (localDate(cal.zone, at) !== date) at = null;
  }
  return at;
}

/** The acknowledge-by instant: the closing time of the Nth business day after the received day. A firm with no opening
 *  day at all within a year falls back to N calendar days at 17:00 (never an endless walk). */
export function acknowledgeBy(receivedAt: Date, cal: FirmCalendar, days = ACK_BUSINESS_DAYS): Date {
  let date = localDate(cal.zone, receivedAt), counted = 0;
  for (let i = 0; i < 366; i++) {
    date = nextDate(date);
    const at = businessClose(cal, date);
    if (at && ++counted === days) return at;
  }
  let fallback = localDate(cal.zone, receivedAt);
  for (let i = 0; i < days; i++) fallback = nextDate(fallback);
  return zonedInstant(fallback, "17:00", cal.zone);
}

const DAY_MS = 86_400_000;
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
