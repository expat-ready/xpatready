// FO-2 part 2 (BR-4, AG-2-13c rule 6; Lead B on #1813): how long a lead has waited, counted only in the firm's open
// hours (platform.business_hours, platform.closed_days, the firm's time zone), worked out on the server. Pure, no date
// library: PF-21's business-days.ts gives the zone's wall clock through Intl. Counted in real minutes, so a day whose
// clocks change counts the minutes that passed, not the minutes on the clock face.
import { localDate, zonedInstant, type FirmCalendar } from "../../platform/complaints/business-days.ts";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Whole minutes of open hours between two instants (0 when `to` is not after `from`). At most 400 days are walked. */
export function openMinutes(from: Date, to: Date, cal: FirmCalendar): number {
  if (!(to.getTime() > from.getTime())) return 0;
  const closed = new Set(cal.closedDays), hours = new Map(cal.hours.map((h) => [h.day, h]));
  const last = localDate(cal.zone, to);
  let ms = 0;
  for (let date = localDate(cal.zone, from), i = 0; date <= last && i < 400; date = nextDate(date), i++) {
    const h = hours.get(WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]);
    if (!h || closed.has(date)) continue;
    const opens = zonedInstant(date, h.opens, cal.zone).getTime(), closes = zonedInstant(date, h.closes, cal.zone).getTime();
    ms += Math.max(0, Math.min(closes, to.getTime()) - Math.max(opens, from.getTime()));
  }
  return Math.floor(ms / 60_000);
}
