// FO-2 part 2 (BR-4, AG-2-13c rule 6; Lead B on #1813): how long a lead has waited, counted only in the firm's open
// hours (platform.business_hours, platform.closed_days, the firm's time zone), worked out on the server. Pure, no date
// library: PF-21's business-days.ts gives the zone's wall clock through Intl. Counted in real minutes, so a day whose
// clocks change counts the minutes that passed. A list builds the firm's open windows once (openWindows) and each row
// sums its overlap by binary search (review M4: never a walk per row); a wait longer than MAX_DAYS counts its last MAX_DAYS days.
import { localDate, zonedInstant, type FirmCalendar } from "../../platform/calendar/working-days.ts";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
export const MAX_DAYS = 400;

/** The firm's open windows from `from`'s day to `to`'s day, in order, with the open time before each (prefix sums). */
export type OpenWindows = { starts: number[]; ends: number[]; before: number[] };
export function openWindows(from: Date, to: Date, cal: FirmCalendar): OpenWindows {
  const w: OpenWindows = { starts: [], ends: [], before: [] };
  const closed = new Set(cal.closedDays), hours = new Map(cal.hours.map((h) => [h.day, h])), last = localDate(cal.zone, to);
  // The last MAX_DAYS days before `to` (break m8: never the first ones after `from`, which would miss today).
  const start = new Date(Math.max(from.getTime(), to.getTime() - MAX_DAYS * 86_400_000));
  for (let date = localDate(cal.zone, start), i = 0, sum = 0; date <= last && i <= MAX_DAYS + 1; date = nextDate(date), i++) {
    const h = hours.get(WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]);
    if (!h || closed.has(date)) continue;
    const s = zonedInstant(date, h.opens, cal.zone).getTime(), e = zonedInstant(date, h.closes, cal.zone).getTime();
    if (e <= s) continue;
    w.starts.push(s); w.ends.push(e); w.before.push(sum); sum += e - s;
  }
  return w;
}

/** Whole minutes of open time between two instants within the windows (0 when `to` is not after `from`). */
export function openMinutesIn(w: OpenWindows, from: Date, to: Date): number {
  const a = from.getTime(), b = to.getTime(), n = w.starts.length;
  if (!(b > a) || n === 0) return 0;
  const first = (x: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (w.ends[m] <= x) lo = m + 1; else hi = m; } return lo; };   // first window ending after x
  const at = (x: number) => { const i = first(x); return i === n ? w.before[n - 1] + (w.ends[n - 1] - w.starts[n - 1]) : w.before[i] + Math.max(0, x - w.starts[i]); };   // open time before x
  return Math.floor((at(b) - at(a)) / 60_000);
}

export const openMinutes = (from: Date, to: Date, cal: FirmCalendar) => openMinutesIn(openWindows(from, to, cal), from, to);
