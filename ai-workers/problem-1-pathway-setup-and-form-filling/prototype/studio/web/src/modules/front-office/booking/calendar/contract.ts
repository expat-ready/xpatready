// FO-3st1 part 1 (concept fo-3-booking r2 §4, §5, §6): the answers the Bookings pages read, as zod shapes. The feed is
// FO-3a part 2b's (`GET /front-office/bookings/feed`, `…/feed/:id`): every item carries what the calendar, list and
// detail show and the server's own answers for this viewer (canAnswerAttendance, canEdit, attendanceDue), so the browser
// works out no permission or rule (STANDARDS §7). Writes are FO-3sr's and FO-3sa's routes.
import { z } from "zod";

export const FeedItem = z.object({
  id: z.string(), status: z.enum(["PENDING_PAYMENT", "SCHEDULED", "RESCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED", "EXPIRED"]), mode: z.string(),
  startsAt: z.string(), endsAt: z.string(), officeTimeZone: z.string(), bookerTimeZone: z.string(),
  type: z.object({ id: z.string(), name: z.string() }), host: z.object({ id: z.string(), name: z.string() }),
  person: z.object({ id: z.string(), name: z.string(), email: z.string().nullable() }).nullable(),
  hangsOn: z.object({ kind: z.enum(["lead", "prospect", "client"]), id: z.string(), name: z.string() }).nullable(),
  cancelledBy: z.string().nullable(), selfServiceLimitHours: z.number(), insideSelfServiceLimit: z.boolean(),
  outsideHours: z.boolean(), attendance: z.enum(["COMPLETED", "NO_SHOW"]).nullable(), hasConsultRecord: z.boolean(),
  canAnswerAttendance: z.boolean(), canEdit: z.boolean(), attendanceDue: z.boolean(),
});
export type FeedItem = z.infer<typeof FeedItem>;
/** QA-743: a time-off period on the calendar. `label` is the server's word: "Time off" (the viewer's own) or "Not
 *  available" (a colleague's, Team only); who and when, never a reason. */
export const TimeOff = z.object({ id: z.string(), staff: z.object({ id: z.string(), name: z.string() }), mine: z.boolean(), label: z.string(), startsAt: z.string(), endsAt: z.string() });
export type TimeOff = z.infer<typeof TimeOff>;
export const Feed = z.object({ view: z.enum(["mine", "team"]), from: z.string(), to: z.string(), officeTimeZone: z.string(), items: z.array(FeedItem), timeOff: z.array(TimeOff).default([]) });
export type Feed = z.infer<typeof Feed>;

export const BookingType = z.object({ id: z.string(), name: z.string(), minutes: z.number(), modes: z.array(z.string()), hostStaffIds: z.array(z.string()), active: z.boolean() });
export const BookingTypes = z.object({ types: z.array(BookingType) });
export type BookingType = z.infer<typeof BookingType>;
export const Preview = z.object({ timeZone: z.string(), days: z.array(z.object({ date: z.string(), slots: z.array(z.object({ startsAt: z.string(), endsAt: z.string() })), reason: z.string().nullable() })) });
export const Assignees = z.object({ assignees: z.array(z.object({ staffId: z.string(), displayName: z.string() })) });
/** FO-3sa's "Book anyway?" answer (409 WARNINGS): every reason the time is not one the booking page offers. */
export const Warnings = z.object({ code: z.literal("WARNINGS"), hostStaffId: z.string(), warnings: z.array(z.object({ code: z.string(), label: z.string() })) });

export const LIST_KEY = "agent/booking:list", CREATE_KEY = "agent/booking:create", TYPES_KEY = "agent/booking-event-type:list";
export const MODE_WORDS: Record<string, string> = { VIDEO: "Video call", PHONE: "Phone call", IN_PERSON: "In person" };
/** Status chips by shape and text, never colour alone (concept §5). */
export const STATUS: Record<string, { label: string; tone: string; tip: (person: string, by?: string | null) => string }> = {
  SCHEDULED: { label: "Scheduled", tone: "info", tip: () => "Booked; not yet held." },
  PENDING_PAYMENT: { label: "Scheduled", tone: "info", tip: () => "Booked; not yet held." },
  RESCHEDULED: { label: "Rescheduled", tone: "info", tip: () => "Moved to a new time." },
  COMPLETED: { label: "Attended", tone: "ok", tip: (p) => `The host said ${p} came.` },
  NO_SHOW: { label: "No-show", tone: "neutral", tip: (p) => `The host said ${p} did not come.` },
  CANCELLED: { label: "Cancelled", tone: "neutral", tip: (_p, by) => (by ? `Cancelled by ${by}.` : "Cancelled.") },
  EXPIRED: { label: "Cancelled", tone: "neutral", tip: () => "Cancelled." },
};
export const personOf = (b: FeedItem) => b.person?.name || "No name";

// ------------------------------------------------------------------ times in the office zone (no calendar library)
// One formatter per zone, kept (break m7: building one per call made a 373-booking week take 3 s).
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (zone: string) => fmts.get(zone) ?? fmts.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })).get(zone)!;
const parts = (iso: string | number, zone: string) => {
  const p = Object.fromEntries(fmt(zone).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday as string };
};
/** "2027-01-11" for the instant in the zone. */
export const dayOf = (iso: string | number, zone: string) => parts(iso, zone).date;
export const hourOf = (iso: string | number, zone: string) => parts(iso, zone).hour;
export const hhmm = (iso: string | number, zone: string) => { const p = parts(iso, zone); return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`; };
/** "Tue 20 October 14:00" (concept §5's "<Weekday d Month hh:mm>"). */
export const longWhen = (iso: string, zone: string) => `${new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "long" }).format(new Date(iso))} ${hhmm(iso, zone)}`;
export const shortDay = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
/** Calendar arithmetic on plain dates ("YYYY-MM-DD"), in UTC so a daylight-saving change never moves a day. */
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const mondayOf = (date: string) => { const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; return addDays(date, -wd); };
/** The instant of a wall time ("2027-01-11", "14:00") in the zone, found from the zone's own offsets (a time a spring
 *  change skips moves forward by the gap, as calendars do). */
export function wallToIso(date: string, time: string, zone: string): string {
  const want = Date.parse(`${date}T${time}:00Z`);
  let t = want;
  for (let i = 0; i < 3; i++) { const p = parts(t, zone); t -= Date.parse(`${p.date}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:00Z`) - want; }
  return new Date(t).toISOString();
}
/** QA-743: the part of a time-off period on one office-zone day, in words ("all day", "from 13:00", "until 12:00",
 *  "13:00–15:00"); null when the period does not touch that day. */
export function offOn(o: { startsAt: string; endsAt: string }, date: string, zone: string): string | null {
  const s = Date.parse(wallToIso(date, "00:00", zone)), e = Date.parse(wallToIso(addDays(date, 1), "00:00", zone));
  const a = Math.max(s, Date.parse(o.startsAt)), b = Math.min(e, Date.parse(o.endsAt));
  if (!(a < b)) return null;
  return a === s && b === e ? "all day" : b === e ? `from ${hhmm(a, zone)}` : a === s ? `until ${hhmm(b, zone)}` : `${hhmm(a, zone)}–${hhmm(b, zone)}`;
}
/** Whether the period overlaps the office-zone hour that starts at `hour` on `date`. */
export const offInHour = (o: { startsAt: string; endsAt: string }, date: string, hour: number, zone: string) => {
  const s = Date.parse(wallToIso(date, `${String(hour).padStart(2, "0")}:00`, zone));
  return Date.parse(o.startsAt) < s + 3_600_000 && Date.parse(o.endsAt) > s;
};
