// FO-3st3b (concept screens/fo-3-booking r2 BR-20, §5 "Timings", §6 J-T5; board design/settings.html §4-5; AG-4-4,
// AG-4-5, AG-4-66 rules 1-3, 8, §8): the shapes FO-3a1e's timing routes answer, parsed at the edge, and the units the
// screens show. Every rule (ranges, who may change which, the resolve order) is the server's; the screens show its answer.
//   GET/PUT api/front-office/booking-timings · PATCH api/front-office/booking-types/:id/timings · a type's GET answers
//   `timings` (its own, null = the firm's) and `effectiveTimings` (resolved).
import { z } from "zod";

export const TIMINGS_HOME = "/front-office/settings/timings";
export const TYPES_LIST = "agent/booking-event-type:list", TYPES_EDIT = "agent/booking-event-type:edit";
export const CONFIGURE = "agent/booking-event-type:configure-availability";

/** The five timings a booking type may set for itself; reminders are the firm's only. */
export const TYPE_FIELDS = ["minNoticeMinutes", "windowDays", "gapBeforeMinutes", "gapAfterMinutes", "selfServiceLimitMinutes"] as const;
export type TypeField = (typeof TYPE_FIELDS)[number];
export type Timings = Record<TypeField, number>;

/** How each timing reads and is typed (board §5): notice and self-service in hours, window in days, gaps in minutes.
 *  `key` is the permission a change needs (AG-4-4 §8): gaps, notice and window …:configure-availability; reminders and
 *  the self-service limit …:edit. */
export const FIELDS: Record<TypeField, { label: string; unit: "hours" | "days" | "minutes"; key: string }> = {
  minNoticeMinutes: { label: "Shortest notice", unit: "hours", key: CONFIGURE },
  windowDays: { label: "Booking window", unit: "days", key: CONFIGURE },
  gapBeforeMinutes: { label: "Gap before", unit: "minutes", key: CONFIGURE },
  gapAfterMinutes: { label: "Gap after", unit: "minutes", key: CONFIGURE },
  selfServiceLimitMinutes: { label: "Self-service limit", unit: "hours", key: TYPES_EDIT },
};

const n = z.number();
const TimingsShape = z.object({ minNoticeMinutes: n, windowDays: n, gapBeforeMinutes: n, gapAfterMinutes: n, selfServiceLimitMinutes: n });
export const FirmTimings = z.object({ timings: TimingsShape.extend({ reminderOffsetsMinutes: z.array(n) }), defaults: TimingsShape.extend({ reminderOffsetsMinutes: z.array(n) }), warnings: z.array(z.string()) });
export type FirmTimings = z.infer<typeof FirmTimings>;
/** A type's own timings (null = the firm's) and the resolved ones, as the one-type read and the timings PATCH answer. */
export const TypeTimings = z.object({
  id: z.string(), name: z.string(), version: z.number(),
  timings: z.object({ minNoticeMinutes: n.nullable(), windowDays: n.nullable(), gapBeforeMinutes: n.nullable(), gapAfterMinutes: n.nullable(), selfServiceLimitMinutes: n.nullable() }),
  effectiveTimings: TimingsShape, warnings: z.array(z.string()).default([]),
});
export type TypeTimings = z.infer<typeof TypeTimings>;
/** The list read, only as far as the Timings page needs it ("Overridden on <n> types: …", board §5). */
export const TypeOverrides = z.object({ types: z.array(z.object({ name: z.string(), active: z.boolean(), timings: TypeTimings.shape.timings.partial().optional() })) });

const plural = (v: number, one: string) => `${v.toLocaleString("en-CA")} ${one}${v === 1 ? "" : "s"}`;
/** A stored value in a person's words: 360 → "6 hours", 90 → "90 minutes", 60 days → "60 days". */
export function words(field: TypeField, v: number): string {
  if (FIELDS[field].unit === "days") return plural(v, "day");
  if (FIELDS[field].unit === "hours" && v % 60 === 0) return plural(v / 60, "hour");
  return plural(v, "minute");
}
/** The reminders, read-only for now (Lead B's ruling, FO-3st3b): [1440, 60] → "24 hours and 1 hour before (fixed for now)". */
export const reminderWords = (offsets: number[]) =>
  `${offsets.map((m) => (m % 60 === 0 ? plural(m / 60, "hour") : plural(m, "minute"))).join(" and ")} before (fixed for now)`;

/** The value a field shows for editing, in its unit (hours may be a fraction: 90 minutes → "1.5"; at most 4 decimals,
 *  so 1 minute shows "0.0167", break m2). An unchanged value is never sent, so the rounding never saves. */
export const toInput = (field: TypeField, v: number) => String(FIELDS[field].unit === "hours" ? Number((v / 60).toFixed(4)) : v);
/** What a person typed, in the unit the server keeps, or null when it is not a number of 0 or more that makes whole
 *  minutes exactly (break m1: 0.000000001 hours is refused, never rounded to 0). Ranges are the server's. */
export function fromInput(field: TypeField, text: string): number | null {
  const t = text.trim();
  const hours = FIELDS[field].unit === "hours";
  if (!(hours ? /^\d{1,9}(\.\d{1,4})?$/ : /^\d{1,9}$/).test(t)) return null;
  const v = hours ? Number(t) * 60 : Number(t);
  return Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : null;
}
export const NOT_A_NUMBER = (field: TypeField) => (FIELDS[field].unit === "hours" ? "Enter a number of hours of 0 or more, in whole minutes (for example 1.5)." : "Enter a whole number of 0 or more.");
/** The server's range words are in minutes; a field typed in hours says them in hours (review m1):
 *  "Shortest notice must be a whole number of minutes from 0 to 525,600." → "Shortest notice must be from 0 to 8,760 hours." */
export function inUnit(field: TypeField, message: string): string {
  if (FIELDS[field].unit !== "hours") return message;
  const m = /^(.*) must be a whole number of minutes from ([\d,]+) to ([\d,]+)\.$/.exec(message);
  if (!m) return message;
  const h = (s: string) => (Number(s.replace(/,/g, "")) / 60).toLocaleString("en-CA", { maximumFractionDigits: 2 });
  return `${m[1]} must be from ${h(m[2])} to ${h(m[3])} hours.`;
}
