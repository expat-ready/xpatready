// FO-3st2 (concept screens/fo-3-booking r2 §4 "My account → Availability", §5; AG-4-62): the shapes FO-3a part 1b's
// hours and time off routes answer, parsed at the edge, and the screen's time helpers (Intl only, no time library). The
// server decides every rule (end after start, no overlap, one default, the zone's name); the screen shows its answer.
import { z } from "zod";
import { offsetAt } from "../../booking-public/time";

export const Window = z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() });
export type Window = z.infer<typeof Window>;
export const HourSet = z.object({ id: z.string(), name: z.string(), isDefault: z.boolean(), timeZone: z.string(), windows: z.array(Window), version: z.number() });
export type HourSet = z.infer<typeof HourSet>;
export const HourSets = z.object({ staffId: z.string(), sets: z.array(HourSet) });
export const TimeOff = z.object({ id: z.string(), staffId: z.string(), startsAt: z.string(), endsAt: z.string() });
export type TimeOff = z.infer<typeof TimeOff>;
export const TimeOffList = z.object({ staffId: z.string(), timeOff: z.array(TimeOff) });

/** The routes for one person: "me" (no key) or a colleague's (agent/booking-event-type:configure-availability). */
export const base = (staffId: string | null) => (staffId ? `/front-office/staff/${encodeURIComponent(staffId)}` : "/front-office/me");
export const CONFIGURE = "agent/booking-event-type:configure-availability";

/** AG-4-62 rule 3: stored 0 = Sunday … 6 = Saturday; the screen shows Monday first. */
export const WEEK: { day: number; name: string }[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, name: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] }));

/** The moment a wall time ("2026-10-26", minutes since midnight) is in a zone, as an ISO instant. */
export function wallIso(day: string, minute: number, zone: string): string {
  const [y, m, d] = day.split("-").map(Number), utc = Date.UTC(y, m - 1, d, 0, minute);
  const guess = utc - offsetAt(utc, zone) * 60_000;
  return new Date(utc - offsetAt(guess, zone) * 60_000).toISOString();
}
/** The day after "YYYY-MM-DD". */
export const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const fmt = (at: string, zone: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...o }).format(new Date(at));
const dayOf = (at: string, zone: string) => {   // "Mon 26 Oct 2026" (en-GB's own form has a comma after the weekday)
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
};
const timeOf = (at: string, zone: string) => fmt(at, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "Mon 26 Oct 2026 (whole day)", "Mon 26 Oct 2026 – Wed 28 Oct 2026 (whole days)" or "Fri 23 Oct 2026 12:00 – 17:00". */
export function offWords(o: TimeOff, zone: string): string {
  const s = timeOf(o.startsAt, zone), e = timeOf(o.endsAt, zone);
  if (s === "00:00" && e === "00:00") {
    const last = new Date(Date.parse(o.endsAt) - 60_000).toISOString(), one = dayOf(o.startsAt, zone) === dayOf(last, zone);
    return one ? `${dayOf(o.startsAt, zone)} (whole day)` : `${dayOf(o.startsAt, zone)} – ${dayOf(last, zone)} (whole days)`;
  }
  return dayOf(o.startsAt, zone) === dayOf(o.endsAt, zone) ? `${dayOf(o.startsAt, zone)} ${s} – ${e}` : `${dayOf(o.startsAt, zone)} ${s} – ${dayOf(o.endsAt, zone)} ${e}`;
}
